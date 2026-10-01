import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Use the pinned updater's parser, so release validation and the installed
// updater interpret YAML identically. This script is run after frozen install.
const require = createRequire(import.meta.url);
const updaterRequire = createRequire(require.resolve('electron-updater/package.json'));
const { load: loadYaml } = updaterRequire('js-yaml');

export function expectedReleaseAssets(version) {
  assert.match(version, /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/, 'Unsupported release version');
  const base = `CF-Compass-${version}`;
  const names = [
    `${base}-Windows-x64-Setup.exe`, `${base}-Windows-x64-portable.exe`,
    `${base}-Windows-x64-Setup.exe.blockmap`,
    `${base}-x86_64.AppImage`, `${base}-Linux-amd64.deb`,
    `${base}-macOS-x64.dmg`, `${base}-macOS-arm64.dmg`,
  ];
  if (!version.includes('-')) names.push(`${base}-x86_64.AppImage.zsync`, 'latest.yml');
  return names.sort();
}

export async function verifyReleaseAssets(directory, version) {
  const names = (await readdir(directory)).sort();
  assert.deepEqual(names, expectedReleaseAssets(version), 'Release must contain exactly the expected platform packages and stable update sidecar; no checksum attachments or stale assets');
  for (const name of names) {
    const stat = await lstat(path.join(directory, name));
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0, `Release asset must be a non-empty regular file: ${name}`);
  }
  if (!version.includes('-')) await verifyWindowsUpdateMetadata(directory, version);
  return names;
}

export async function verifyWindowsUpdateMetadata(directory, version) {
  const raw = await readFile(path.join(directory, 'latest.yml'), 'utf8');
  const metadata = loadYaml(raw);
  const installer = `CF-Compass-${version}-Windows-x64-Setup.exe`;
  assert.equal(metadata?.version, version, 'Windows update metadata must match the release version');
  assert.ok(Array.isArray(metadata.files) && metadata.files.length === 1, 'Windows metadata must contain exactly one full installer');
  const file = metadata.files[0];
  assert.equal(file.url, installer, 'Windows update asset must be the exact local NSIS filename');
  assert.equal(metadata.path, installer, 'Legacy Windows update path must match the same installer');
  assert.ok(!metadata.packages && !file.packageInfo, 'Web installers are not supported');
  const bytes = await readFile(path.join(directory, installer));
  const hash = createHash('sha512').update(bytes).digest('base64');
  assert.equal(file.sha512, hash, 'Windows updater SHA512 must match the actual installer');
  assert.equal(metadata.sha512, hash, 'Legacy Windows updater SHA512 must match the actual installer');
  assert.equal(file.size, bytes.length, 'Windows updater size must match the actual installer');
  return metadata;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  if (process.argv.includes('--require-tag-match')) {
    assert.equal(process.env.GITHUB_REF_NAME, `v${pkg.version}`, 'Release tag must exactly match package.json version');
  }
  const directory = path.resolve(process.argv[2] || 'release');
  const task = process.argv.includes('--windows-only')
    ? (!pkg.version.includes('-') ? verifyWindowsUpdateMetadata(directory, pkg.version) : Promise.resolve('prerelease: no stable update metadata'))
    : verifyReleaseAssets(directory, pkg.version);
  task
    .then(names => console.log(JSON.stringify({ version: pkg.version, assets: names, checksumsPublished: false }, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
