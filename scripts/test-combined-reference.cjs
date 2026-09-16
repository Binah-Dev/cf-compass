const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeReferenceFixture } = require('./fixtures/virtual-reference.cjs');
const { buildSessionReference } = require('../electron/services/combined-reference.cjs');
function fixture() {
  const f = makeReferenceFixture(), now = Date.now() / 1000;
  f.standings.contest.name = 'Codeforces Round 999 (Div. 2)';
  f.standings.contest.startTimeSeconds = now - 30000;
  f.entry.sessionStartTimeSeconds = now - 10000;
  f.entry.replayId = `1900:virtual:${Math.floor(f.entry.sessionStartTimeSeconds)}`;
  f.standings.rows.find(r => r.party.participantType === 'VIRTUAL').party.startTimeSeconds = f.entry.sessionStartTimeSeconds;
  f.ratingChanges = [];
  f.users = [{ handle: 'top', rating: 2200 }, { handle: 'middle', rating: 1600 }, { handle: 'lower', rating: 1000 }];
  f.snapshotAt = new Date().toISOString();
  for (const p of f.standings.problems) delete p.rating;
  return f;
}
test('new contest without rating changes or problem ratings produces explicitly provisional virtual reference', async () => {
  const f = fixture(), original = JSON.stringify(f);
  const result = await buildSessionReference(f);
  assert.equal(result.status, 'ready'); assert.equal(result.provisional, true);
  assert.equal(result.ratedEvidence, undefined); assert.equal(result.snapshotEvidence.source, 'current-user-profiles');
  assert.equal(result.ratingField.length, 3); assert.ok(Number.isFinite(result.performance));
  assert.equal(JSON.stringify(f), original);
});
test('formal unsettled participation is inserted once and missing user is not assigned zero', async () => {
  const f = fixture();
  f.entry.participationType = 'CONTESTANT'; f.entry.replayId = '1900';
  const row = f.standings.rows.find(r => r.party.participantType === 'VIRTUAL'); row.party.participantType = 'CONTESTANT';
  f.users.push({ handle: f.cache.handle, rating: 1200 });
  const result = await buildSessionReference(f);
  assert.equal(result.provisional, true); assert.equal(result.ratingField.length, 3);
  f.users.pop(); await assert.rejects(buildSessionReference(f), /Missing opponent/);
});
test('snapshot is never used for old/frozen/unfinished/unsupported contests or invalid profile data', async () => {
  let f = fixture(); f.snapshotAt = '2000-01-01'; await assert.rejects(buildSessionReference(f), /stale/);
  f = fixture(); f.standings.contest.startTimeSeconds -= 10 * 86400; await assert.rejects(buildSessionReference(f), /old contest/);
  f = fixture(); f.standings.contest.frozen = true; await assert.rejects(buildSessionReference(f), /unfrozen/);
  f = fixture(); f.entry.sessionStartTimeSeconds = Date.now() / 1000; await assert.rejects(buildSessionReference(f), /ended session/);
  f = fixture(); f.users[0].rating = null; await assert.rejects(buildSessionReference(f), /Invalid opponent/);
  f = fixture(); f.standings.contest.name = 'Unrated mashup'; await assert.rejects(buildSessionReference(f), /Waiting for official Rated evidence/);
});
test('official settlement replaces snapshot evidence without adding historical official delta', async () => {
  const f = fixture(); f.entry.participationType = 'CONTESTANT';
  f.ratingChanges = [{ contestId: 1900, handle: 'top', oldRating: 2200, rank: 1 }, { contestId: 1900, handle: f.cache.handle, oldRating: 1200, newRating: 9999, rank: 2 }, { contestId: 1900, handle: 'lower', oldRating: 1000, rank: 3 }];
  const result = await buildSessionReference(f);
  assert.equal(result.provisional, false); assert.equal(result.snapshotEvidence, undefined);
  assert.deepEqual(result.ratingField.map(p => p[0]).sort(), [1000, 2200]);
});

test('public-only new contest reconstructs virtual submissions without problem Rating or settlement', async () => {
  const {makeScoreFixture}=require('./fixtures/virtual-score.cjs');
  const {reconstructVirtualScore}=require('../electron/services/virtual-score.cjs');
  for(const type of ['CF','ICPC']) {
    const f=makeScoreFixture(type);
    f.standings.contest.name='Codeforces Round 999 (Div. 2)';
    const nowSeconds=f.entry.sessionStartTimeSeconds+f.standings.contest.durationSeconds+1;
    f.users=f.ratingChanges.map(c=>({handle:c.handle,rating:c.oldRating}));
    f.ratingChanges=[];f.nowSeconds=nowSeconds;f.snapshotAt=new Date(nowSeconds*1000).toISOString();
    f.standings.problems.forEach(p=>delete p.rating);
    const reconstructed=await buildSessionReference(f);
    const direct=structuredClone(f), score=reconstructVirtualScore(f);
    direct.standings.rows.push({...score,party:{participantType:'VIRTUAL',startTimeSeconds:f.entry.sessionStartTimeSeconds,members:[{handle:f.cache.handle}]}});
    const reference=await buildSessionReference(direct);
    assert.equal(reconstructed.performance,reference.performance);assert.equal(reconstructed.referenceRank,reference.referenceRank);
    assert.equal(reconstructed.provisional,true);
  }
});
