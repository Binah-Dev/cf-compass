// A counterfactual career: every delta uses the previous simulated rating.
// Neither the official cache nor the legacy virtual-only trajectory is modified.
const VERSION = 'combined-rating-v1';
const normalize = value => String(value || '').trim().toLowerCase();
const validRating = value => Number.isInteger(value) && value >= -500 && value < 6000;
const startOf = entry => Number(entry?.participationType === 'VIRTUAL' ? entry.sessionStartTimeSeconds : entry?.startTimeSeconds);

async function buildCombinedRating(cache, replay, nowSeconds = Date.now() / 1000) {
  const handle = normalize(cache?.handle);
  if (!handle || normalize(replay?.handle) !== handle) return { version: VERSION, handle, rating: null, counted: 0, total: 0, entries: [], status: 'empty' };
  const seen = new Set();
  const sessions = (replay.contests || []).filter(entry => {
    const virtual = entry.participationType === 'VIRTUAL';
    const id = String(entry.replayId || entry.contestId || '');
    if ((!virtual && entry.participationType !== 'CONTESTANT') ||
        !(virtual ? /^\d+:virtual:\d+$/.test(id) : /^\d+$/.test(id)) || seen.has(id)) return false;
    seen.add(id); return true;
  }).sort((a, b) => (startOf(a) || Infinity) - (startOf(b) || Infinity) || String(a.replayId).localeCompare(String(b.replayId)));
  // Start before the earliest discovered participation, not the first successful
  // calculation. Otherwise missing evidence would move the starting line.
  const firstStart = startOf(sessions[0]);
  const prior = (cache.ratingHistory || []).filter(change => validRating(change.newRating) &&
    Number(change.ratingUpdateTimeSeconds) < firstStart &&
    !sessions.some(entry => entry.participationType === 'CONTESTANT' && Number(entry.contestId) === Number(change.contestId)))
    .sort((a, b) => b.ratingUpdateTimeSeconds - a.ratingUpdateTimeSeconds)[0];
  const baseline = prior?.newRating ?? 1400;
  let rating = baseline, counted = 0, excluded = 0, provisional = false;
  const entries = [];
  const { Contestant, RatingCalculator } = await import('../carrot/predict.mjs');
  for (const session of sessions) {
    await new Promise(resolve => setImmediate(resolve));
    const start = startOf(session), duration = Number(session.durationSeconds);
    const ref = session.combinedReference || (session.participationType === 'VIRTUAL' ? session.virtualReference : null);
    const entry = { id: String(session.replayId || session.contestId), contestId: session.contestId,
      contestName: session.contestName, participationType: session.participationType,
      startTimeSeconds: start || null, ratingUpdateTimeSeconds: start > 0 && duration > 0 ? start + duration : null,
      oldRating: rating, newRating: rating, status: 'pending', error: null, provisional: Boolean(ref?.provisional || ref?.missingRatedCount),
      matchedRatedCount: ref?.matchedRatedCount ?? null, missingRatedCount: ref?.missingRatedCount || 0,
      performance: Number.isFinite(ref?.performance) ? ref.performance : null,
      practicedBefore: Boolean(ref?.practicedBefore), calculatedAt: ref?.calculatedAt || null, refreshError: ref?.refreshError || null };
    if (ref?.status === 'excluded') { entry.status = 'excluded'; entry.error = ref.error; excluded++; }
    else if (!(start > 0) || !(duration > 0)) entry.error = 'Missing participation start or duration';
    else if (start + duration > nowSeconds) entry.error = 'Session has not ended';
    else if (ref?.status !== 'ready') entry.error = ref?.error || 'Waiting for standings and opponent ratings';
    else if (!session.submissionFingerprint || ref.submissionFingerprint !== session.submissionFingerprint) entry.error = 'Submission evidence changed; recalculation required';
    else if (ref.ratedEvidence?.contestId !== session.contestId && ref.snapshotEvidence?.contestId !== session.contestId) entry.error = 'Missing contest-specific comparison evidence';
    else {
      const field = ref.ratingField;
      if (!Array.isArray(field) || field.length < 2 || field.length > 100000 ||
          !field.every(pair => Array.isArray(pair) && validRating(pair[0]) && Number.isInteger(pair[1]) && pair[1] > 0 && pair[1] <= field.length + 1) ||
          !Number.isInteger(ref.referenceRank) || ref.referenceRank < 1 || ref.referenceRank > field.length + 1) {
        entry.error = 'Invalid comparison field';
      } else {
        const opponents = field.map(([r, rank], i) => Object.assign(new Contestant(String(i), 0, 0, r), { rank }));
        const target = Object.assign(new Contestant('self', 0, 0, rating), { rank: ref.referenceRank });
        const calculator = new RatingCalculator([...opponents, target]);
        calculator.calculateSeed(); calculator.calculateDeltas(); calculator.adjustDeltas();
        const raw = rating + target.delta;
        rating = Math.max(-500, Math.min(5999, raw));
        Object.assign(entry, { status: 'counted', newRating: rating, delta: rating - entry.oldRating, bounded: raw !== rating });
        counted++;
        provisional ||= entry.provisional || Boolean(ref.missingRatedCount) || raw !== rating;
      }
    }
    if (entry.status === 'pending') provisional = true;
    entries.push(entry);
  }
  return { version: VERSION, handle, baseline, baselineSource: prior ? 'official-before-first-session' : 'default-1400',
    rating: counted ? rating : null, counted, excluded, pending: entries.filter(e => e.status === 'pending').length,
    provisionalCount: entries.filter(e => e.status === 'counted' && e.provisional).length, total: entries.length, entries,
    status: !entries.length ? 'empty' : !counted ? 'pending' : provisional ? 'partial' : 'ready' };
}
let cachedKey, cachedResult, expiresAt = 0, inFlight;
async function cachedCombinedRating(cache, replay, nowSeconds = Date.now() / 1000) {
  const key = JSON.stringify([cache?.handle, cache?.ratingHistory, replay?.handle,
    (replay?.contests || []).map(e => [e.replayId, e.contestId, e.contestName, e.participationType, e.startTimeSeconds,
      e.sessionStartTimeSeconds, e.durationSeconds, e.submissionFingerprint, e.combinedReference || e.virtualReference])]);
  if (key === cachedKey && nowSeconds < expiresAt) return cachedResult;
  if (inFlight?.key === key) return inFlight.promise;
  const task = { key };
  task.promise = buildCombinedRating(cache, replay, nowSeconds).then(result => {
    cachedKey = key; cachedResult = result;
    expiresAt = Math.min(Infinity, ...(replay?.contests || []).map(e => startOf(e) + Number(e.durationSeconds)).filter(end => end > nowSeconds));
    return result;
  }).finally(() => { if (inFlight === task) inFlight = null; });
  inFlight = task;
  return task.promise;
}
module.exports = { buildCombinedRating, cachedCombinedRating, VERSION };
