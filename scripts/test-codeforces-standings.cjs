const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publicStandingsEndpoint, recoverStandingsFailure, PUBLIC_STANDINGS_ONLY } = require('../electron/services/codeforces-standings.cjs');
const { estimateVirtualReference } = require('../electron/services/virtual-reference.cjs');
const { makeReferenceFixture } = require('./fixtures/virtual-reference.cjs');
test('regular standings use exactly contestId, never auth, pagination or unofficial filters', () => {
  assert.equal(publicStandingsEndpoint(2258), 'contest.standings?contestId=2258');
  for (const id of [0, -1, 1.5, '2258&showUnofficial=true', Infinity]) assert.throws(() => publicStandingsEndpoint(id));
});
test('upgrade retries obsolete API failures once, preserving unrelated errors and data', () => {
  const entry = { status: 'error', error: 'Codeforces: Non-gym contest standings restricted', retryCount: 3, solved: 2 };
  recoverStandingsFailure(entry); assert.equal(entry.status, 'pending'); assert.equal(entry.retryCount, 0); assert.equal(entry.solved, 2);
  entry.status = 'error'; entry.error = 'Non-gym contest standings'; entry.retryCount = 3;
  recoverStandingsFailure(entry); assert.equal(entry.status, 'error'); assert.equal(entry.retryCount, 3);
  const unrelated = { status: 'error', error: 'network unavailable', retryCount: 3 };
  recoverStandingsFailure(unrelated); assert.equal(unrelated.retryCount, 3);
});
test('official-only response cannot produce a fabricated virtual score', async () => {
  const f = makeReferenceFixture(); f.standings.rows = f.standings.rows.filter(row => row.party.participantType === 'CONTESTANT');
  await assert.rejects(estimateVirtualReference(f), error => error.code === PUBLIC_STANDINGS_ONLY);
  assert.equal(f.entry.performance, undefined);
});
