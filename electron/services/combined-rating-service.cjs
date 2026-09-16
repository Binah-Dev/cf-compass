const { cachedCombinedRating: buildCombinedRating } = require('./combined-rating.cjs');
const { buildSessionReference, supportsProvisional, singleHandle } = require('./combined-reference.cjs');
const { publicStandingsEndpoint } = require('./codeforces-standings.cjs');
const { loadVirtualSubmissions } = require('./virtual-score.cjs');
const normalize = value => String(value || '').toLowerCase();
const stamp = () => Date.now() / 1000;
const isAwaitingSettlement = error => /rating changes (?:are )?(?:unavailable|not available)|has not been rated|not rated yet/i.test(error?.message || '');

function createCombinedRatingService({ fetchJson, loadContext, mergeReplay, readStore, writeStore, onChanged = () => {} }) {
  let task = null, extra = null, lastDiscovery = 0, profiles = null, profileTime = 0, lastError = null, requestedForce = false;
  let timer, leaseUntil = 0, turns = 0;
  const evidenceCache = new Map();
  async function evidence(endpoint, force) {
    const cached = evidenceCache.get(endpoint);
    if (!force && cached && Date.now() - cached.time < 60000) return cached.value;
    let value;
    try { value = await fetchJson(endpoint); }
    catch (error) {
      if (!endpoint.startsWith('contest.ratingChanges?') || !isAwaitingSettlement(error)) throw error;
      value = [];
    }
    // Bounded, public per-contest cache shared by repeat sessions, never user submissions.
    if (evidenceCache.size >= 16) evidenceCache.delete(evidenceCache.keys().next().value);
    evidenceCache.set(endpoint, { value, time: Date.now() });
    return value;
  }
  const keyOf = entry => String(entry.replayId || entry.contestId);
  function overlay(replay, store) {
    const same = normalize(replay.handle) === normalize(store?.handle);
    return { ...replay, contests: (replay.contests || []).map(entry => {
      const record = same ? store.records?.[keyOf(entry)] : null;
      return record?.fingerprint === entry.submissionFingerprint ? { ...entry,
        startTimeSeconds: record.startTimeSeconds || entry.startTimeSeconds,
        durationSeconds: record.durationSeconds || entry.durationSeconds,
        combinedReference: record.reference } : entry;
    }) };
  }
  async function context() {
    const value = await loadContext();
    if (extra && normalize(extra.handle) === normalize(value.cache.handle) && extra.syncedAt === value.cache.syncedAt) {
      const seen = new Map((value.cache.submissions || []).map(s => [s.id, s]));
      for (const submission of extra.submissions) seen.set(submission.id, submission);
      value.cache = { ...value.cache, submissions: [...seen.values()] };
    }
    value.replay = mergeReplay(value.cache, value.replay, value.center);
    return value;
  }
  async function run(force) {
    let ctx = await context();
    const handle = normalize(ctx.cache.handle);
    if (!handle || ctx.cache.isDemo) return;
    let store = await readStore();
    if (normalize(store?.handle) !== handle) store = { handle, records: {} };
    const previousDiscoveryError = store.discoveryError;
    if (force) for (const record of Object.values(store.records || {})) record.forceRecheck = true;
    if (force || !extra || normalize(extra.handle) !== handle || Date.now() - lastDiscovery > 30000) {
      // Discover recently started/finished sessions without changing the official cache.
      // Complete virtual submissions are fetched separately before score reconstruction.
      try {
        const submissions = await fetchJson(`user.status?handle=${encodeURIComponent(ctx.cache.handle)}&from=1&count=1000`);
        if (!Array.isArray(submissions)) throw Error('Invalid recent submissions');
        extra = { handle, syncedAt: ctx.cache.syncedAt, submissions };
        lastDiscovery = Date.now(); store.discoveryError = null;
        ctx = await context();
        if (normalize(ctx.cache.handle) !== handle) return;
      } catch (error) { store.discoveryError = String(error.message).slice(0, 240); }
    }
    const entries = overlay(ctx.replay, store).contests || [];
    const now = stamp();
    const next = entries.filter(entry => {
      if (!['VIRTUAL', 'CONTESTANT'].includes(entry.participationType)) return false;
      const start = Number(entry.participationType === 'VIRTUAL' ? entry.sessionStartTimeSeconds : entry.startTimeSeconds);
      if (start > 0 && Number(entry.durationSeconds) > 0 && start + Number(entry.durationSeconds) > now) return false;
      const record = store.records?.[keyOf(entry)];
      if (record?.waitingUntil > now) return false;
      if (record?.waitingUntil && record.waitingUntil <= now) return true;
      if (!record || record.fingerprint !== entry.submissionFingerprint || record.forceRecheck) return true;
      const age = now - record.checkedAt;
      return record.reference?.exclusionReason !== 'official-unrated' && (record.reference?.provisional || record.reference?.missingRatedCount > 0 || record.reference?.status !== 'ready') &&
        age >= Math.min(900, 60 * 2 ** Math.min(4, record.failures || 0));
    }).sort((a, b) => {
      // Three foreground turns, then one oldest-evidence turn: prompt completion
      // without starving historical correction. Computation order stays chronological.
      const recent = e => Number(e.sessionStartTimeSeconds || e.startTimeSeconds || e.dateSeconds) || 0;
      const unchecked = e => store.records?.[keyOf(e)]?.checkedAt || 0;
      return turns % 4 === 3 ? unchecked(a) - unchecked(b) || recent(b) - recent(a)
        : recent(b) - recent(a) || unchecked(a) - unchecked(b);
    })[0];
    const nextEnd = Math.min(Infinity, ...entries.map(e =>
      Number(e.sessionStartTimeSeconds || e.startTimeSeconds) + Number(e.durationSeconds)).filter(end => end > now));
    if (next) {
      turns++;
      const record = { startTimeSeconds: store.records?.[keyOf(next)]?.startTimeSeconds,
        durationSeconds: store.records?.[keyOf(next)]?.durationSeconds, fingerprint: next.submissionFingerprint, checkedAt: now };
      try {
        const recheck = force || store.records?.[keyOf(next)]?.forceRecheck;
        const standings = await evidence(publicStandingsEndpoint(next.contestId), recheck);
        record.startTimeSeconds = standings?.contest?.startTimeSeconds;
        record.durationSeconds = standings?.contest?.durationSeconds;
        const sessionEnd = Number(next.sessionStartTimeSeconds || record.startTimeSeconds) + Number(record.durationSeconds);
        if (sessionEnd > stamp()) {
          record.waitingUntil = sessionEnd;
          throw Error('Session has not ended; scheduled for its end time');
        }
        const ratingChanges = await evidence(`contest.ratingChanges?contestId=${next.contestId}`, recheck);
        if (!Array.isArray(ratingChanges)) throw Error('Invalid rating changes response');
        let users;
        if (ratingChanges.length < 2 && supportsProvisional(standings.contest) &&
            stamp() - Number(standings.contest.startTimeSeconds) <= 7 * 86400 && standings.contest.phase === 'FINISHED' && !standings.contest.frozen) {
          if (!profiles || Date.now() - profileTime > 600000) {
            const rated = await fetchJson('user.ratedList?activeOnly=false&includeRetired=true');
            if (!Array.isArray(rated)) throw Error('Invalid opponent profiles');
            profiles = new Map(rated.map(user => [normalize(user.handle), { handle: user.handle, rating: user.rating }]));
            profileTime = Date.now();
          }
          const handles = [...new Set((standings.rows || []).filter(row => row.party?.participantType === 'CONTESTANT').map(singleHandle).filter(Boolean))];
          const missing = handles.filter(name => !profiles.has(name));
          for (let i = 0; i < missing.length; i += 100) {
            const batch = await fetchJson(`user.info?handles=${encodeURIComponent(missing.slice(i, i + 100).join(';'))}&checkHistoricHandles=false`);
            if (!Array.isArray(batch)) throw Error('Invalid opponent profiles');
            for (const user of batch) profiles.set(normalize(user.handle), { handle: user.handle, ...(user.rating === undefined ? {} : { rating: user.rating }) });
          }
          users = handles.map(name => profiles.get(name)).filter(Boolean);
        }
        const submissions = next.participationType === 'VIRTUAL' ? await loadVirtualSubmissions(fetchJson, next.contestId, ctx.cache.handle) : ctx.cache.submissions;
        record.reference = await buildSessionReference({ entry: next, cache: { ...ctx.cache, submissions, virtualSubmissionsComplete: true }, standings, ratingChanges, users, snapshotAt: new Date(profileTime).toISOString() });
      } catch (error) {
        const previous = store.records?.[keyOf(next)];
        record.failures = (previous?.failures || 0) + 1;
        record.reference = previous?.fingerprint === next.submissionFingerprint && previous.reference?.status === 'ready'
          ? { ...previous.reference, refreshError: String(error.message).slice(0, 240), provisional: true }
          : { status: 'unavailable', error: String(error.message).slice(0, 240), submissionFingerprint: next.submissionFingerprint };
      }
      store.records = { ...store.records, [keyOf(next)]: record };
    }
    const latest = await loadContext();
    if (normalize(latest.cache.handle) !== handle || latest.cache.syncedAt !== ctx.cache.syncedAt) return;
    if (!next && store.discoveryError === previousDiscoveryError && !force) return { nextEnd };
    store.updatedAt = new Date().toISOString();
    await writeStore(store);
    return { processed: Boolean(next), nextEnd: Math.min(nextEnd, ...Object.values(store.records || {}).map(r => r.waitingUntil).filter(end => end > stamp())) };
  }
  function refresh() {
    if (task || Date.now() >= leaseUntil) return;
    clearTimeout(timer);
    const force = requestedForce; requestedForce = false;
    let outcome;
    task = run(force).then(async value => {
      outcome = value; lastError = null;
      const ctx = await context(), store = await readStore();
      const result = await buildCombinedRating(ctx.cache, overlay(ctx.replay, store));
      await onChanged({ ...result, updating: false, discoveryError: store?.discoveryError || null });
    }).catch(error => { lastError = String(error.message).slice(0, 240); }).finally(() => {
      task = null;
      if (Date.now() < leaseUntil) {
        const untilEnd = (outcome?.nextEnd || Infinity) * 1000 - Date.now();
        timer = setTimeout(refresh, Math.max(250, Math.min(outcome?.processed ? 2100 : 15000, untilEnd)));
        timer.unref?.();
      }
    });
  }
  async function get(force = false) {
    leaseUntil = Date.now() + 45000;
    requestedForce ||= force === true;
    const ctx = await context(), store = await readStore();
    const result = await buildCombinedRating(ctx.cache, overlay(ctx.replay, store));
    refresh();
    return { ...result, updating: Boolean(task), discoveryError: lastError || (normalize(store?.handle) === normalize(ctx.cache.handle) ? store.discoveryError : null) };
  }
  return { get, run, overlay, dispose: () => { leaseUntil = 0; clearTimeout(timer); } };
}
module.exports = { createCombinedRatingService, isAwaitingSettlement };
