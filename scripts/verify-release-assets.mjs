import assert from 'node:assert/strict';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function expectedReleaseAssets(version) {
  assert.match(version, /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/, 'Unsupported release version');
  const base = `CF-Compass-${version}`;
  const names = [
    `${base}-Windows-x64-Setup.exe`, `${base}-Windows-x64-portable.exe`,
    `${base}-x86_64.AppImage`, `${base}-Linux-amd64.deb`,
    `${base}-macOS-x64.dmg`, `${base}-macOS-arm64.dmg`,
  ];
  if (!version.includes('-')) names.push(`${base}-x86_64.AppImage.zsync`);
  return names.sort();
}

export async function verifyReleaseAssets(directory, version) {
  const names = (await readdir(directory)).sort();
  assert.deepEqual(names, expectedReleaseAssets(version), 'Release must contain exactly the expected platform packages and stable update sidecar; no checksum attachments or stale assets');
  for (const name of names) {
    const stat = await lstat(path.join(directory, name));
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0, `Release asset must be a non-empty regular file: ${name}`);
  }
  return names;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  verifyReleaseAssets(path.resolve(process.argv[2] || 'release'), pkg.version)
    .then(names => console.log(JSON.stringify({ version: pkg.version, assets: names, checksumsPublished: false }, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
