const { estimateVirtualReference } = require('./virtual-reference.cjs');
const { reconstructVirtualScore } = require('./virtual-score.cjs');
const normalize = value => String(value || '').toLowerCase();
const singleHandle = row => row?.party?.members?.length === 1 && !row.party.ghost && !row.party.teamId ? normalize(row.party.members[0].handle) : '';
const validRating = value => Number.isInteger(value) && value >= -500 && value < 6000;

function supportsProvisional(contest) {
  // A name-based opt-in is a scope heuristic, never evidence of official eligibility.
  return Number(contest?.id) > 0 && Number(contest.id) < 100000 &&
    /(?:Codeforces|Educational|Global)\s+Round/i.test(contest.name || '') &&
    !/unrated|unofficial|mashup|team|marathon|april fools/i.test(contest.name || '') &&
    ['CF', 'ICPC'].includes(contest.type);
}

async function buildSessionReference({ entry, cache, standings, ratingChanges, users, snapshotAt, nowSeconds = Date.now() / 1000 }) {
  const virtual = entry.participationType === 'VIRTUAL';
  if (!virtual && entry.participationType !== 'CONTESTANT') throw Error('Unsupported participation type');
  const contest = standings?.contest;
  const start = virtual ? Number(entry.sessionStartTimeSeconds) : Number(contest?.startTimeSeconds);
  const duration = Number(contest?.durationSeconds);
  if (Number(contest?.id) !== Number(entry.contestId) || !(start > 0) || !(duration > 0) || start + duration > nowSeconds || contest.frozen || contest.phase !== 'FINISHED') throw Error('Waiting for an ended session and an unfrozen final scoreboard');
  const settled = Array.isArray(ratingChanges) && ratingChanges.length >= 2;
  if (settled && virtual) return estimateVirtualReference({ entry, cache, standings, ratingChanges, nowSeconds });
  const handle = normalize(cache.handle);
  const { Contestant, RatingCalculator } = await import('../carrot/predict.mjs');
  const opponents = [];
  let target, targetRow, newAccounts = 0;
  if (settled) {
    const seen = new Set();
    for (const change of ratingChanges) {
      const name = normalize(change.handle);
      const rating = entry.contestId >= 1360 && change.oldRating === 0 ? 1400 : change.oldRating;
      if (!name || seen.has(name) || change.contestId !== entry.contestId || !validRating(rating) || !Number.isInteger(change.rank) || change.rank < 1 || change.rank > ratingChanges.length) throw Error('Invalid historical rated field');
      seen.add(name);
      const contestant = Object.assign(new Contestant(name, 0, 0, rating), { rank: change.rank });
      if (name === handle) target = contestant; else opponents.push(contestant);
    }
    if (!target) return { status: 'excluded', exclusionReason: 'official-unrated', error: 'This official participation was not rated', submissionFingerprint: entry.submissionFingerprint };
  } else {
    if (!supportsProvisional(contest)) throw Error('Waiting for official Rated evidence: provisional contest scope is not verified');
    // Current profiles are only a timestamped proxy for pre-contest ratings.
    // Do not apply that proxy to arbitrary old contests.
    if (nowSeconds - Number(contest.startTimeSeconds) > 7 * 86400) throw Error('Historical ratings unavailable; current profiles cannot reconstruct an old contest');
    if (!Number.isFinite(Date.parse(snapshotAt)) || Math.abs(Date.parse(snapshotAt) / 1000 - nowSeconds) > 900) throw Error('Opponent rating snapshot is missing or stale');
    const profiles = new Map();
    for (const user of users || []) {
      const name = normalize(user.handle);
      if (!name || profiles.has(name)) throw Error('Duplicate or missing profile identity');
      profiles.set(name, user);
    }
    const rows = (standings.rows || []).filter(row => row.party?.participantType === 'CONTESTANT' && singleHandle(row));
    if (rows.length < 3 || rows.length > 100000) throw Error('Comparison field outside supported size');
    const seen = new Set();
    const make = row => {
      const name = singleHandle(row), user = profiles.get(name);
      if (!name || seen.has(name) || !Number.isFinite(row.points) || !Number.isFinite(row.penalty) ||
          !Array.isArray(row.problemResults) || row.problemResults.length !== standings.problems?.length || row.problemResults.some(p => p.type !== 'FINAL')) throw Error('Incomplete or duplicate final scoreboard');
      seen.add(name);
      if (!user) throw Error('Missing opponent profile; refusing to invent a rating');
      const rating = user.rating === undefined ? 1400 : user.rating;
      if (!validRating(rating)) throw Error('Invalid opponent rating');
      if (user.rating === undefined) newAccounts++;
      return new Contestant(name, row.points, row.penalty, rating);
    };
    for (const row of rows) {
      const contestant = make(row);
      if (contestant.handle === handle) { if (!virtual) { target = contestant; targetRow = row; } }
      else opponents.push(contestant);
    }
    if (virtual) {
      const virtualRows = (standings.rows || []).filter(row => singleHandle(row) === handle && row.party.participantType === 'VIRTUAL' && Number(row.party.startTimeSeconds) === start);
      if (virtualRows.length > 1) throw Error('Ambiguous virtual result');
      targetRow = virtualRows[0] || reconstructVirtualScore({ entry, cache, standings });
      if (!Number.isFinite(targetRow.points) || !Number.isFinite(targetRow.penalty) || targetRow.problemResults?.length !== standings.problems?.length || targetRow.problemResults.some(p => p.type !== 'FINAL')) throw Error('Incomplete virtual result');
      target = new Contestant('self', targetRow.points, targetRow.penalty, 1400);
    }
    if (!target) throw Error('Participant missing from standings');
  }
  if (opponents.length < 2) throw Error('Not enough comparison opponents');
  const calculator = new RatingCalculator([...opponents, target]);
  if (settled) { calculator.calculateSeed(); calculator.calculateDeltas(); calculator.adjustDeltas(); }
  else calculator.calculate(false);
  const binarySearch = (await import('../carrot/binsearch.mjs')).default;
  const performance = target.rank === 1 ? 6000 : binarySearch(-500, 6000, rating => calculator.calculateDelta(target, rating) + calculator.adjustment <= 0);
  return { status: 'ready', method: settled ? 'carrot-official-history-v1' : 'carrot-provisional-snapshot-v1',
    provisional: !settled, ...(settled ? { ratedEvidence: { contestId: entry.contestId, participants: ratingChanges.length } } :
      { snapshotEvidence: { contestId: entry.contestId, participants: opponents.length + 1, snapshotAt, source: 'current-user-profiles', newAccounts,
        warning: 'Provisional roster and current ratings; official eligibility and pre-contest ratings are not yet verified' } }),
    ratingField: opponents.map(c => [c.effectiveRating, c.rank]), referenceRank: target.rank, performance,
    boundary: performance === 6000 ? 'upper' : performance === -500 ? 'lower' : null,
    practicedBefore: virtual && ((entry.problems || []).some(p => p.previouslySolved) || (cache.submissions || []).some(s => Number(s.contestId) === entry.contestId && s.verdict === 'OK' && Number(s.creationTimeSeconds) < start)),
    submissionFingerprint: entry.submissionFingerprint, calculatedAt: new Date(nowSeconds * 1000).toISOString() };
}
module.exports = { buildSessionReference, supportsProvisional, singleHandle };
