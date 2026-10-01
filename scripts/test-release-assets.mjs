import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expectedReleaseAssets, verifyReleaseAssets } from './verify-release-assets.mjs';
const packageVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;

async function fixture(t, version = '4.2.2') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cf-release-inventory-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of expectedReleaseAssets(version)) await writeFile(path.join(directory, name), 'fixture');
  if (!version.includes('-')) {
    const installer = `CF-Compass-${version}-Windows-x64-Setup.exe`;
    const sha512 = createHash('sha512').update('fixture').digest('base64');
    await writeFile(path.join(directory, 'latest.yml'), `version: ${version}\nfiles:\n  - url: ${installer}\n    sha512: ${sha512}\n    size: 7\npath: ${installer}\nsha512: ${sha512}\n`);
  }
  return directory;
}

test('stable release requires six packages plus AppImage and NSIS update assets', async t => {
  assert.equal((await verifyReleaseAssets(await fixture(t), '4.2.2')).length, 9);
});
test('prerelease does not advertise stable-channel updates', async t => {
  assert.equal((await verifyReleaseAssets(await fixture(t, '4.2.2-rc.1'), '4.2.2-rc.1')).length, 7);
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

test('changed installer is rejected even when the asset inventory is correct', async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'CF-Compass-4.2.2-Windows-x64-Setup.exe'), 'tampered');
  await assert.rejects(verifyReleaseAssets(directory, '4.2.2'), /SHA512/);
});

for (const [label, transform] of [
  ['remote URL', text => text.replaceAll('CF-Compass-4.2.2-Windows-x64-Setup.exe', 'https://example.com/update.exe')],
  ['wrong version', text => text.replace('version: 4.2.2', 'version: 4.2.3')],
  ['wrong size', text => text.replace('size: 7', 'size: 8')],
  ['duplicate YAML key', text => `${text}version: 4.2.2\n`],
]) {
  test(`reject update metadata with ${label}`, async t => {
    const directory = await fixture(t);
    const { readFile } = await import('node:fs/promises');
    const file = path.join(directory, 'latest.yml');
    await writeFile(file, transform(await readFile(file, 'utf8')));
    await assert.rejects(verifyReleaseAssets(directory, '4.2.2'));
  });
}

test('release CLI rejects a mismatched Git tag before accepting correct assets', async t => {
  const directory = await fixture(t, packageVersion);
  const script = new URL('./verify-release-assets.mjs', import.meta.url);
  const { fileURLToPath } = await import('node:url');
  const result = spawnSync(process.execPath, [fileURLToPath(script), directory, '--require-tag-match'], {
    env: { ...process.env, GITHUB_REF_NAME: `v${packageVersion}-mismatch` }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Release tag must exactly match/);
});

test('Windows-only CLI validates its real sidecar without requiring other platforms', async t => {
  const directory = await fixture(t, packageVersion);
  for (const name of expectedReleaseAssets(packageVersion).filter(name => !name.includes('Windows') && name !== 'latest.yml')) {
    await rm(path.join(directory, name));
  }
  const { fileURLToPath } = await import('node:url');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./verify-release-assets.mjs', import.meta.url)), directory, '--windows-only'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
