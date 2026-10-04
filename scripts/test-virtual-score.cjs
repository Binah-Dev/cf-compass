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
    f => { f.cache.submissions[1].creationTimeSeconds += 2; },
  ]) { const f = makeScoreFixture(); mutate(f); assert.throws(() => reconstructVirtualScore(f)); }
  const repeat = makeScoreFixture('CF');
  repeat.cache.submissions[3].problem.index = 'A';
  assert.throws(() => reconstructVirtualScore(repeat), /重复提交/);
});
test('CF and ICPC tolerate one-second timestamp rounding on every submission', async () => {
  for (const type of ['CF', 'ICPC']) for (const skew of [-1, 1]) {
    const f = makeScoreFixture(type);
    // Ten extra rejected attempts make this a many-submission session (#45).
    for (let i = 0; i < 10; i++) {
      const extra = structuredClone(f.cache.submissions[1]);
      extra.id = 100 + i; extra.relativeTimeSeconds = 200 + i;
      extra.creationTimeSeconds = f.entry.sessionStartTimeSeconds + extra.relativeTimeSeconds;
      f.cache.submissions.push(extra);
    }
    const expected = reconstructVirtualScore(f);
    for (const s of f.cache.submissions) if (s.author.participantType === 'VIRTUAL') s.creationTimeSeconds += skew;
    const actual = reconstructVirtualScore(f);
    assert.equal(actual.submissionCount, 14);
    // ACs start on minute boundaries: -1 crosses into the preceding minute.
    assert.equal(actual.problemResults[0].bestSubmissionTimeSeconds, 600 + skew);
    assert.equal(actual.problemResults[1].bestSubmissionTimeSeconds, 1200 + skew);
    assert.equal(actual.penalty, type === 'ICPC' ? expected.penalty + (skew < 0 ? -2 : 0) : 0);
    assert.equal(actual.points, expected.points + (type === 'CF' && skew < 0 ? 4 : 0));
    const estimate = await estimateVirtualReference(f);
    assert.equal(estimate.status, 'ready');
    assert.ok(Number.isFinite(estimate.performance));
  }
});
test('reported CF submission timestamp pair no longer prevents an estimate', async () => {
  const f = makeScoreFixture('CF');
  const s = f.cache.submissions[1];
  s.id = 237345931; s.relativeTimeSeconds = 982;
  s.creationTimeSeconds = f.entry.sessionStartTimeSeconds + 983;
  // Keep this wrong answer before the first AC.
  f.cache.submissions[2].relativeTimeSeconds = 1200;
  f.cache.submissions[2].creationTimeSeconds = f.entry.sessionStartTimeSeconds + 1200;
  assert.equal((await estimateVirtualReference(f)).status, 'ready');
});
test('rounding away from a minute boundary leaves score and estimate unchanged', async () => {
  for (const type of ['CF', 'ICPC']) {
    const f = makeScoreFixture(type);
    for (const s of f.cache.submissions) { s.relativeTimeSeconds += 30; s.creationTimeSeconds += 30; }
    const expected = await estimateVirtualReference(f);
    for (const skew of [-1, 1]) {
      const rounded = structuredClone(f);
      for (const s of rounded.cache.submissions) s.creationTimeSeconds += skew;
      const actual = await estimateVirtualReference(rounded);
      for (const key of ['points', 'penalty', 'performance', 'referenceRank']) assert.equal(actual[key], expected[key]);
    }
  }
});
test('timestamp tolerance never admits negative, boundary, fractional or corrupt times', () => {
  for (const mutate of [
    s => { s.creationTimeSeconds += 5; },
    s => { s.creationTimeSeconds -= 2; },
    s => { s.creationTimeSeconds = NaN; },
    s => { s.creationTimeSeconds += .5; },
    s => { s.relativeTimeSeconds += .5; },
    s => { s.relativeTimeSeconds = '120'; },
    (s, start) => { s.relativeTimeSeconds = 0; s.creationTimeSeconds = start - 1; },
    (s, start) => { s.relativeTimeSeconds = 7200; s.creationTimeSeconds = start + 7199; },
    (s, start) => { s.relativeTimeSeconds = 7199; s.creationTimeSeconds = start + 7200; },
  ]) {
    const f = makeScoreFixture(); mutate(f.cache.submissions[1], f.entry.sessionStartTimeSeconds);
    assert.throws(() => reconstructVirtualScore(f), { code: 'VIRTUAL_SCORE_UNAVAILABLE' });
  }
});
test('missing relative time uses the validated absolute time', () => {
  const f = makeScoreFixture();
  for (const s of f.cache.submissions) delete s.relativeTimeSeconds;
  assert.equal(reconstructVirtualScore(f).penalty, 40);
});
test('one-second skew does not change exact virtual-session identity', () => {
  const f = makeScoreFixture();
  const extra = structuredClone(f.cache.submissions[2]);
  extra.id = 999; extra.author.startTimeSeconds++;
  extra.creationTimeSeconds++;
  f.cache.submissions.push(extra);
  assert.equal(reconstructVirtualScore(f).submissionCount, 4);
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
