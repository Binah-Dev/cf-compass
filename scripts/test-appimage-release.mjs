import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { inspectAppImage, resolveAppImageUpdateChannel, stableUpdateInformation, verifyAppImageRelease, verifyZsync } from "./verify-appimage.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewEnvironment = {
  GITHUB_REPOSITORY: "Binah-Dev/cf-compass",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/codex/appimage-acceptance",
  CF_COMPASS_APPIMAGE_STABLE_UPDATE_PREVIEW: "1",
};

test("non-release builds default to no update channel; stable tags require the official repository and matching version", () => {
  assert.equal(resolveAppImageUpdateChannel("4.2.2", {}), "none");
  assert.equal(resolveAppImageUpdateChannel("4.2.2", { ...previewEnvironment, CF_COMPASS_APPIMAGE_STABLE_UPDATE_PREVIEW: "0" }), "none");
  const stable = { GITHUB_REF: "refs/tags/v4.2.2", GITHUB_REPOSITORY: "Binah-Dev/cf-compass" };
  assert.equal(resolveAppImageUpdateChannel("4.2.2", stable), "stable");
  assert.equal(resolveAppImageUpdateChannel("4.2.2-rc.1", { ...stable, GITHUB_REF: "refs/tags/v4.2.2-rc.1" }), "none");
  assert.throws(() => resolveAppImageUpdateChannel("4.2.1", stable), /tag does not match/);
  assert.throws(() => resolveAppImageUpdateChannel("4.2.2", { ...stable, GITHUB_REPOSITORY: "someone/fork" }), /only valid for/);
});

test("stable update preview requires an explicit manual branch build in the official repository", () => {
  assert.equal(resolveAppImageUpdateChannel("4.2.2", previewEnvironment), "stable");
  assert.throws(() => resolveAppImageUpdateChannel("4.2.2", { ...previewEnvironment, GITHUB_REPOSITORY: "someone/fork" }), /only valid for/);
  assert.throws(() => resolveAppImageUpdateChannel("4.2.2", { ...previewEnvironment, GITHUB_EVENT_NAME: "push" }), /requires workflow_dispatch/);
  assert.throws(() => resolveAppImageUpdateChannel("4.2.2", { ...previewEnvironment, GITHUB_REF: "refs/tags/v4.2.2" }), /must run on a branch/);
  assert.throws(() => resolveAppImageUpdateChannel("4.2.2-rc.1", previewEnvironment), /requires a stable version/);
  assert.throws(() => resolveAppImageUpdateChannel("4.2.2", { ...previewEnvironment, CF_COMPASS_APPIMAGE_STABLE_UPDATE_PREVIEW: "true" }), /must be 0 or 1/);
});

// This synthetic container checks the verifier, not Linux execution. Real
// runtime startup remains a separate final-artifact gate on the Ubuntu runners.
function sampleImage(updateInformation = stableUpdateInformation) {
  const sectionOffset = 1536;
  const payloadOffset = sectionOffset + 3 * 64;
  const image = Buffer.alloc(payloadOffset + 96);
  image.write("\x7fELF", 0, "ascii");
  image[4] = 2;
  image[5] = 1;
  image.write("AI\x02", 8, "ascii");
  image.writeUInt16LE(62, 18);
  image.writeBigUInt64LE(64n, 32);
  image.writeBigUInt64LE(BigInt(sectionOffset), 40);
  image.writeUInt16LE(56, 54);
  image.writeUInt16LE(1, 56);
  image.writeUInt16LE(64, 58);
  image.writeUInt16LE(3, 60);
  image.writeUInt16LE(1, 62);
  image.writeUInt32LE(1, 64); // PT_LOAD
  const names = "\0.shstrtab\0.upd_info\0";
  image.write(names, 256, "ascii");
  image.writeUInt32LE(1, sectionOffset + 64);
  image.writeBigUInt64LE(256n, sectionOffset + 64 + 24);
  image.writeBigUInt64LE(BigInt(names.length), sectionOffset + 64 + 32);
  image.writeUInt32LE(11, sectionOffset + 128);
  image.writeBigUInt64LE(512n, sectionOffset + 128 + 24);
  image.writeBigUInt64LE(1024n, sectionOffset + 128 + 32);
  image.write(updateInformation, 512, "ascii");
  image.write("hsqs", payloadOffset, "ascii");
  image.writeUInt16LE(6, payloadOffset + 20); // Zstandard
  image.writeUInt16LE(4, payloadOffset + 28);
  return image;
}

function sampleZsync(image, filename, overrides = {}) {
  const headers = {
    zsync: "0.6.2",
    Filename: filename,
    Blocksize: "2048",
    Length: String(image.length),
    "Hash-Lengths": "1,2,4",
    URL: filename,
    "SHA-1": createHash("sha1").update(image).digest("hex"),
    ...overrides,
  };
  return Buffer.concat([
    Buffer.from(Object.entries(headers).map(([key, value]) => `${key}: ${value}\n`).join("") + "\n"),
    Buffer.alloc(Math.ceil(image.length / 2048) * 6),
  ]);
}

test("reads static type-2 SquashFS and the embedded update channel", () => {
  assert.deepEqual(inspectAppImage(sampleImage()), { payloadOffset: 1728, updateInformation: stableUpdateInformation, compression: "zstd" });
  assert.equal(inspectAppImage(sampleImage("")).updateInformation, "");
});

test("rejects dynamic runtimes and non-SquashFS payloads", () => {
  for (const type of [2, 3]) {
    const image = sampleImage();
    image.writeUInt32LE(type, 64);
    image.writeBigUInt64LE(128n, 64 + 8);
    image.writeBigUInt64LE(32n, 64 + 32);
    image.writeBigUInt64LE(1n, 128); // DT_NEEDED
    assert.throws(() => inspectAppImage(image), /Runtime must be static/);
  }
  const image = sampleImage();
  image.write("DWAR", 1728);
  assert.throws(() => inspectAppImage(image), /SquashFS payload/);
  assert.throws(() => inspectAppImage(image.subarray(0, 100)), /program table/);
  const gzipImage = sampleImage();
  gzipImage.writeUInt16LE(1, 1728 + 20);
  assert.throws(() => inspectAppImage(gzipImage), /Expected zstd compression/);
});

test("accepts static PIE relocation metadata without host library dependencies", () => {
  const image = sampleImage();
  image.writeUInt32LE(2, 64); // PT_DYNAMIC
  image.writeBigUInt64LE(128n, 64 + 8);
  image.writeBigUInt64LE(32n, 64 + 32);
  image.writeBigUInt64LE(30n, 128); // DT_FLAGS, followed by DT_NULL
  assert.equal(inspectAppImage(image).updateInformation, stableUpdateInformation);
});

test("zsync must describe the exact final AppImage and contain the complete block table", () => {
  const image = sampleImage();
  const filename = "CF-Compass-4.2.2-x86_64.AppImage";
  assert.doesNotThrow(() => verifyZsync(image, sampleZsync(image, filename), filename));
  for (const [overrides, message] of [
    [{ Filename: "wrong.AppImage" }, /filename/],
    [{ URL: "/tmp/build/image.AppImage" }, /URL/],
    [{ Length: "100" }, /length/],
    [{ "SHA-1": "0".repeat(40) }, /SHA-1/],
  ]) assert.throws(() => verifyZsync(image, sampleZsync(image, filename, overrides), filename), message);
  assert.throws(() => verifyZsync(image, sampleZsync(image, filename).subarray(0, -1), filename), /block checksums/);
});

test("release verification rejects a missing sidecar or metadata on a non-release build", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cf-compass-appimage-verifier-"));
  const filename = "CF-Compass-4.2.2-x86_64.AppImage";
  const imagePath = path.join(directory, filename);
  const sidecarPath = `${imagePath}.zsync`;
  const image = sampleImage();
  try {
    await writeFile(imagePath, image);
    await assert.rejects(verifyAppImageRelease(directory, "stable"), /Missing or stale update sidecar/);
    await writeFile(sidecarPath, sampleZsync(image, filename));
    assert.equal((await verifyAppImageRelease(directory, "stable")).sidecarVerified, true);
    assert.equal((await verifyAppImageRelease(directory, "auto", previewEnvironment)).sidecarVerified, true);
    await assert.rejects(verifyAppImageRelease(directory, "auto", { ...previewEnvironment, GITHUB_REPOSITORY: "someone/fork" }), /only valid for/);
    await assert.rejects(verifyAppImageRelease(directory, "none"), /Unexpected AppImage update channel/);
    await writeFile(imagePath, sampleImage(""));
    await assert.rejects(verifyAppImageRelease(directory, "none"), /Missing or stale update sidecar/);
    await unlink(sidecarPath);
    assert.equal((await verifyAppImageRelease(directory, "none")).sidecarVerified, false);
  } finally {
    await unlink(imagePath).catch(() => {});
    await unlink(sidecarPath).catch(() => {});
    await rmdir(directory);
  }
});

test("AppImage uses the catalog-compatible name without changing Debian names", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.build.appImage.artifactName, "CF-Compass-${version}-${arch}.${ext}");
  assert.equal(pkg.build.linux.artifactName, "CF-Compass-${version}-Linux-${arch}.${ext}");
});

test("AppStream screenshot matches the immutable demo asset and packaged desktop entry", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const metadata = await readFile(path.join(root, "build/com.cfcompass.desktop.appdata.xml"), "utf8");
  assert.ok(metadata.includes(`<id>${pkg.build.appId}</id>`));
  assert.ok(metadata.includes(`<launchable type="desktop-id">${pkg.desktopName}</launchable>`));
  assert.equal(pkg.build.linux.syncDesktopName, true);
  assert.match(metadata, /<screenshot type="default">\s*<image type="source" width="1500" height="940">https:\/\/raw\.githubusercontent\.com\/Binah-Dev\/cf-compass\/[a-f0-9]{40}\/docs\/screenshots\/appimage-workbench\.png<\/image>/);
  const screenshot = await readFile(path.join(root, "docs/screenshots/appimage-workbench.png"));
  assert.equal(screenshot.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.deepEqual([screenshot.readUInt32BE(16), screenshot.readUInt32BE(20)], [1500, 940]);
});

test("the private checksum manifest covers the update sidecar without publishing checksum files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cf-compass-appimage-release-"));
  const assetsDirectory = path.join(directory, "assets");
  const verificationDirectory = path.join(directory, "verification");
  const manifestPath = path.join(verificationDirectory, "SHA256SUMS.txt");
  const asset = "CF-Compass-4.2.2-x86_64.AppImage";
  const sidecar = `${asset}.zsync`;
  const contents = new Map([[asset, "test-appimage"], [sidecar, "test-zsync"]]);
  try {
    await mkdir(assetsDirectory);
    for (const [name, content] of contents) {
      await writeFile(path.join(assetsDirectory, name), content);
    }
    execFileSync(process.execPath, [path.join(root, "scripts/generate-checksums.mjs"), assetsDirectory, `--manifest=${manifestPath}`]);
    const manifest = await readFile(manifestPath, "ascii");
    for (const [name, content] of contents) {
      const hash = createHash("sha256").update(content).digest("hex");
      assert.ok(manifest.includes(`${hash}  ${name}\n`));
    }
    assert.deepEqual((await readdir(assetsDirectory)).sort(), [...contents.keys()].sort());
  } finally {
    for (const name of await readdir(assetsDirectory)) {
      await unlink(path.join(assetsDirectory, name));
    }
    await unlink(manifestPath);
    await rmdir(verificationDirectory);
    await rmdir(assetsDirectory);
    await rmdir(directory);
  }
});
