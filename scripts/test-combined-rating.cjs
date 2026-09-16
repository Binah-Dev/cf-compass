const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildCombinedRating } = require('../electron/services/combined-rating.cjs');
const session = (id, type, start, provisional = false) => ({ contestId: id, replayId: type === 'VIRTUAL' ? `${id}:virtual:${start}` : String(id),
  participationType: type, startTimeSeconds: start, sessionStartTimeSeconds: start, durationSeconds: 100,
  submissionFingerprint: 'same', combinedReference: { status: 'ready', provisional, submissionFingerprint: 'same',
    ...(provisional ? { snapshotEvidence: { contestId: id } } : { ratedEvidence: { contestId: id } }),
    performance: 1900, referenceRank: 2, ratingField: [[2200, 1], [1600, 3], [1000, 4]] } });
const cache = { handle: 'fixture', user: { handle: 'fixture', rating: 1200 }, ratingHistory: [] };
test('official and virtual sessions use one chronological Carrot chain without official delta addition', async () => {
  const contests = [session(3, 'CONTESTANT', 500), session(2, 'VIRTUAL', 300, true), session(1, 'CONTESTANT', 100)];
  contests[0].ratingDelta = 9999;
  const original = JSON.stringify({ cache, contests });
  const result = await buildCombinedRating(cache, { handle: 'fixture', contests }, 1000);
  assert.equal(result.counted, 3); assert.equal(result.status, 'partial');
  assert.deepEqual(result.entries.map(e => e.contestId), [1, 2, 3]);
  const { Contestant, RatingCalculator } = await import('../electron/carrot/predict.mjs');
  let rating = 1400;
  for (const entry of result.entries) {
    const target = Object.assign(new Contestant('self', 0, 0, rating), { rank: 2 });
    const calculator = new RatingCalculator([...[[2200, 1], [1600, 3], [1000, 4]].map(([r, rank], i) => Object.assign(new Contestant(String(i), 0, 0, r), { rank })), target]);
    calculator.calculateSeed(); calculator.calculateDeltas(); calculator.adjustDeltas();
    assert.equal(entry.oldRating, rating); rating += target.delta; assert.equal(entry.newRating, rating);
  }
  assert.equal(JSON.stringify({ cache, contests }), original);
});
test('missing then corrected evidence rebuilds downstream, duplicates never count twice', async () => {
  const first = session(1, 'VIRTUAL', 100, true), next = session(2, 'CONTESTANT', 300);
  const replay = { handle: 'fixture', contests: [first, next, next] };
  const before = await buildCombinedRating(cache, replay, 1000);
  first.combinedReference.ratingField[0][0] = 3000;
  first.combinedReference.provisional = false;
  first.combinedReference.ratedEvidence = { contestId: 1 };
  const after = await buildCombinedRating(cache, replay, 1000);
  assert.equal(after.counted, 2); assert.equal(after.status, 'ready');
  assert.notEqual(after.entries[1].oldRating, before.entries[1].oldRating);
  first.submissionFingerprint = 'new';
  assert.equal((await buildCombinedRating(cache, replay, 1000)).counted, 1);
  assert.equal((await buildCombinedRating(cache, { ...replay, handle: 'other' })).counted, 0);
});
test('unfinished, missing time, invalid fields, excluded events and zero-score loss remain explicit', async () => {
  const entries = [session(1, 'VIRTUAL', 950), session(2, 'CONTESTANT', 0), session(3, 'CONTESTANT', 100), session(4, 'VIRTUAL', 300), session(5, 'VIRTUAL', 500)];
  entries[2].combinedReference.ratingField = [[null, 1]];
  entries[3].combinedReference = { status: 'excluded', error: 'Unrated' };
  entries[4].combinedReference.referenceRank = 4;
  entries[4].combinedReference.ratingField = [[800, 1], [900, 2], [1000, 3]];
  const result = await buildCombinedRating(cache, { handle: 'fixture', contests: entries }, 1000);
  assert.equal(result.counted, 1); assert.equal(result.excluded, 1); assert.equal(result.status, 'partial');
  assert.ok(result.entries.find(e => e.status === 'counted').delta < 0);
});

test('warm cache expires exactly when an already known session ends', async () => {
  const { cachedCombinedRating } = require('../electron/services/combined-rating.cjs');
  const replay = {handle:'fixture',contests:[session(9,'VIRTUAL',200)]};
  assert.equal((await cachedCombinedRating(cache,replay,299)).counted,0);
  assert.equal((await cachedCombinedRating(cache,replay,300)).counted,1);
  assert.deepEqual(await cachedCombinedRating(cache,replay,301),await buildCombinedRating(cache,replay,301));
});

test('empty history is safe and missing rated opponents remain visible as provisional', async () => {
  assert.equal((await buildCombinedRating(cache,{handle:'fixture',contests:[]})).status,'empty');
  const entry=session(1,'VIRTUAL',100);
  Object.assign(entry.combinedReference,{matchedRatedCount:3,missingRatedCount:2});
  const result=await buildCombinedRating(cache,{handle:'fixture',contests:[entry]},1000);
  assert.equal(result.status,'partial');assert.equal(result.provisionalCount,1);
  assert.equal(result.entries[0].missingRatedCount,2);assert.equal(result.pending,0);
});
