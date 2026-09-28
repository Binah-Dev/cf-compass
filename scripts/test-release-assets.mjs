import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expectedReleaseAssets, verifyReleaseAssets } from './verify-release-assets.mjs';

async function fixture(t, version = '4.2.2') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cf-release-inventory-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of expectedReleaseAssets(version)) await writeFile(path.join(directory, name), 'fixture');
  return directory;
}

test('stable release requires six packages plus exactly one update control file', async t => {
  assert.equal((await verifyReleaseAssets(await fixture(t), '4.2.2')).length, 7);
});
test('prerelease does not advertise stable-channel updates', async t => {
  assert.equal((await verifyReleaseAssets(await fixture(t, '4.2.2-rc.1'), '4.2.2-rc.1')).length, 6);
});
for (const extra of ['SHA256SUMS.txt', 'CF-Compass-4.2.2-x86_64.AppImage.sha256', 'CF-Compass-4.2.1-x86_64.AppImage.zsync']) {
  test(`reject unwanted public attachment ${extra}`, async t => {
    const directory = await fixture(t);
    await writeFile(path.join(directory, extra), 'fixture');
    await assert.rejects(verifyReleaseAssets(directory, '4.2.2'), /exactly/);
  });
}
test('missing platform cannot be hidden by an extra sidecar', async t => {
  const directory = await fixture(t);
  await rm(path.join(directory, 'CF-Compass-4.2.2-macOS-arm64.dmg'));
  await writeFile(path.join(directory, 'other.AppImage.zsync'), 'fixture');
  await assert.rejects(verifyReleaseAssets(directory, '4.2.2'), /exactly/);
});
test('empty package is not publishable', async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'CF-Compass-4.2.2-x86_64.AppImage'), '');
  await assert.rejects(verifyReleaseAssets(directory, '4.2.2'), /non-empty/);
});
