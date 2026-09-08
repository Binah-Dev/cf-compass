const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reconstructVirtualScore, loadVirtualSubmissions } = require('../electron/services/virtual-score.cjs');
const { estimateVirtualReference } = require('../electron/services/virtual-reference.cjs');
const { makeScoreFixture } = require('./fixtures/virtual-score.cjs');
test('ICPC reconstructs 2 solves / 40 minutes; CE and practice do not count', async () => {
  const f = makeScoreFixture(), r = reconstructVirtualScore(f);
  assert.equal(r.points, 2); assert.equal(r.penalty, 40);
  const estimate = await estimateVirtualReference(f);
  const direct = structuredClone(f);
  direct.standings.rows.push({ ...r, party: { participantType: 'VIRTUAL', startTimeSeconds: f.entry.sessionStartTimeSeconds, members: [{ handle: f.cache.handle }] } });
  const baseline = await estimateVirtualReference(direct);
  assert.equal(estimate.performance, baseline.performance);
  assert.equal(estimate.referenceRank, baseline.referenceRank);
  assert.equal(estimate.scoreSource, 'reconstructed-submissions');
});
test('CF uses original values, minute decay, wrong penalties and no practice', () => {
  const r = reconstructVirtualScore(makeScoreFixture('CF'));
  assert.equal(r.points, 430 + 920); assert.equal(r.penalty, 0);
});
test('invalid, missing, pending, duplicate and ambiguous inputs refuse a score', () => {
  for (const mutate of [
    f => { f.cache.virtualSubmissionsComplete = false; },
    f => { f.cache.submissions[1].verdict = 'TESTING'; },
    f => { f.cache.submissions[1].author.members[0].handle = 'someone_else'; },
    f => { f.cache.submissions.push(f.cache.submissions[0]); },
    f => { f.standings.rows[0].penalty = 999; },
    f => { f.standings.rows[0].problemResults[0].type = 'PRELIMINARY'; },
    f => { f.standings.rows[2].penalty -= 10; f.standings.rows[2].problemResults[0].rejectedAttemptCount = 0; },
    f => { f.cache.submissions[1].creationTimeSeconds++; },
  ]) { const f = makeScoreFixture(); mutate(f); assert.throws(() => reconstructVirtualScore(f)); }
  const repeat = makeScoreFixture('CF');
  repeat.cache.submissions[3].problem.index = 'A';
  assert.throws(() => reconstructVirtualScore(repeat), /重复提交/);
});
test('other virtual sessions and post-contest submissions are excluded', () => {
  const f = makeScoreFixture();
  const extra = structuredClone(f.cache.submissions[2]); extra.id = 999;
  extra.author.startTimeSeconds -= 10000; extra.creationTimeSeconds -= 10000;
  f.cache.submissions.push(extra);
  const outside = structuredClone(f.cache.submissions[2]); outside.id = 1000;
  outside.relativeTimeSeconds = 8000; outside.creationTimeSeconds = f.entry.sessionStartTimeSeconds + 8000;
  f.cache.submissions.push(outside);
  assert.equal(reconstructVirtualScore(f).penalty, 40);
});
test('20-minute ICPC rules are validated from the scoreboard', () => {
  const f = makeScoreFixture(); f.standings.rows[2].penalty += 10;
  assert.equal(reconstructVirtualScore(f).penalty, 50);
});
test('duration-normalized CF scores are validated', () => {
  const f = makeScoreFixture('CF');
  f.standings.contest.durationSeconds = 9000;
  for (const row of f.standings.rows) row.problemResults.forEach((r, i) => { r.points = f.standings.problems[i].points - Math.floor(f.standings.problems[i].points * Math.floor(r.bestSubmissionTimeSeconds / 60) / 250 * .8); });
  assert.equal(reconstructVirtualScore(f).points, 434 + 936);
});
test('missing historical Rated rows are disclosed, not given fabricated scores', async () => {
  const f = makeScoreFixture();
  f.ratingChanges.push({ contestId: 1900, handle: 'missing_historical_participant', oldRating: 2000 });
  const ref = await estimateVirtualReference(f);
  assert.equal(ref.missingRatedCount, 1);
  assert.equal(ref.matchedRatedCount, 3); assert.equal(ref.historicalRatedCount, 4);
  assert.equal(ref.participants, 4);
});
test('CF floor prevents negative solved-problem scores', () => {
  const { cfPoints } = require('../electron/services/virtual-score.cjs');
  assert.equal(cfPoints(500, 6000, 50, 7200, false), 150);
});
test('submission loader rejects overlapping pages and network errors; handles encoded', async () => {
  let query;
  const data = await loadVirtualSubmissions(async q => { query = q; return [{ id: 1 }]; }, 1900, 'a_b');
  assert.equal(data.length, 1); assert.match(query, /contestId=1900&handle=a_b&from=1&count=1000/);
  await assert.rejects(loadVirtualSubmissions(async () => { throw Error('offline'); }, 1900, 'a_b'), /offline/);
  await assert.rejects(loadVirtualSubmissions(async () => Array.from({ length: 1000 }, (_, i) => ({ id: i })), 1900, 'a_b'), /分页/);
});
