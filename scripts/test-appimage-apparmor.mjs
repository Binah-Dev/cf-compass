import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { makeAppImageProfile } from "./appimage-apparmor.mjs";

const installedPath = "/opt/cf-compass/CF-Compass.AppImage";
const cli = fileURLToPath(new URL("./appimage-apparmor.mjs", import.meta.url));

test("profile attaches only to the specified outer AppImage path", () => {
  const profile = makeAppImageProfile(installedPath);
  assert.match(profile, /^abi <abi\/4\.0>,$/m);
  assert.match(profile, /^profile cf-compass-appimage "\/opt\/cf-compass\/CF-Compass\.AppImage" flags=\(unconfined\) \{$/m);
  assert.match(profile, /^  userns,$/m);
  assert.equal((profile.match(/^profile /gm) || []).length, 1);
  assert.doesNotMatch(profile, /\/tmp\/|\*|no-sandbox|sysctl|sudo/);
});

test("literal spaces and Unicode names are quoted without expanding the attachment", () => {
  const profile = makeAppImageProfile("/opt/指南针/CF Compass.AppImage");
  assert.ok(profile.includes('profile cf-compass-appimage "/opt/指南针/CF Compass.AppImage" flags=(unconfined) {'));
});

test("rejects relative, Windows, root, traversal, and noncanonical paths", () => {
  for (const value of [undefined, null, 7, "", "CF-Compass.AppImage", "./CF-Compass.AppImage", "C:\\Apps\\CF-Compass.AppImage", "/", "//opt/cf-compass/CF-Compass.AppImage", "/opt//CF-Compass.AppImage", "/opt/./CF-Compass.AppImage", "/opt/../CF-Compass.AppImage", "/opt/CF-Compass.AppImage/"]) {
    assert.throws(() => makeAppImageProfile(value), /AppImage path/, `Accepted ${String(value)}`);
  }
});

test("rejects profile-injection and wildcard attachment characters", () => {
  for (const forbidden of ["*", "?", "[", "]", "{", "}", "\"", "'", "\\", "\n", "\r", "\t", "\0", "\u007f", "\u0085", "\u2028", "\u2029", "\u202e"]) {
    assert.throws(() => makeAppImageProfile(`/opt/CF${forbidden}Compass.AppImage`), /glob characters, quotes, backslashes, or control characters/);
  }
  assert.throws(() => makeAppImageProfile('/opt/CF.AppImage" flags=(unconfined) { userns, }\nprofile injected "/**.AppImage'), /glob characters/);
});

test("requires an AppImage filename, not a directory or another executable", () => {
  for (const value of ["/opt/cf-compass", "/opt/cf-compass/cf-compass", "/opt/cf-compass/.AppImage", "/opt/CF-Compass.appimage", "/opt/CF-Compass.AppImage.bak"]) {
    assert.throws(() => makeAppImageProfile(value), /ending in \.AppImage/);
  }
});

async function withOutput(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cf-compass-apparmor-"));
  const output = path.join(directory, "cf-compass-appimage");
  t.after(async () => {
    await unlink(output).catch(error => { if (error.code !== "ENOENT") throw error; });
    await rmdir(directory);
  });
  return output;
}

test("CLI writes a profile file without needing the Linux application to exist", async t => {
  const output = await withOutput(t);
  const result = spawnSync(process.execPath, [cli, installedPath, output], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(output, "utf8"), makeAppImageProfile(installedPath));
  assert.match(result.stdout, /Generated AppArmor profile:/);
});

test("CLI preserves an existing output file", async t => {
  const output = await withOutput(t);
  await writeFile(output, "administrator policy\n");
  const result = spawnSync(process.execPath, [cli, installedPath, output], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /EEXIST/);
  assert.equal(await readFile(output, "utf8"), "administrator policy\n");
});

test("invalid path or argument count fails before producing a profile", async t => {
  const output = await withOutput(t);
  for (const args of [["/tmp/*.AppImage", output], [installedPath], [installedPath, output, "extra"]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    assert.equal(result.status, 1, result.stderr);
    await assert.rejects(readFile(output), { code: "ENOENT" });
  }
});
