import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const stableUpdateInformation = "gh-releases-zsync|Binah-Dev|cf-compass|latest|CF-Compass-*-x86_64.AppImage.zsync";

export function resolveAppImageUpdateChannel(version, environment = process.env) {
  assert.match(version || "", /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, "Expected packaged version");
  const ref = environment.GITHUB_REF || "";
  const preview = environment.CF_COMPASS_APPIMAGE_STABLE_UPDATE_PREVIEW || "0";
  assert.ok(preview === "0" || preview === "1", "Stable update preview must be 0 or 1");
  if (ref.startsWith("refs/tags/")) assert.equal(ref, `refs/tags/v${version}`, "Release tag does not match packaged version");
  if (preview === "1") {
    assert.equal(environment.GITHUB_EVENT_NAME, "workflow_dispatch", "Stable update preview requires workflow_dispatch");
    assert.ok(ref.startsWith("refs/heads/"), "Stable update preview must run on a branch, not a release tag");
  }
  if (preview !== "1" && !/^refs\/tags\/v\d+\.\d+\.\d+$/.test(ref)) return "none";
  assert.equal(environment.GITHUB_REPOSITORY, "Binah-Dev/cf-compass", "The stable update channel is only valid for Binah-Dev/cf-compass");
  assert.match(version, /^\d+\.\d+\.\d+$/, "Stable update channel requires a stable version");
  return "stable";
}

// Inspect the ELF runtime without executing a Linux binary. The payload offset
// follows type2-runtime's read_elf64() (the end of the section table or last section).
export function inspectAppImage(image) {
  assert.ok(image.length >= 64, "Truncated ELF header");
  assert.equal(image.subarray(0, 4).toString("hex"), "7f454c46", "Expected ELF runtime");
  assert.equal(image[4], 2, "Expected ELF64 runtime");
  assert.equal(image[5], 1, "Expected little-endian runtime");
  assert.equal(image.readUInt16LE(18), 62, "Expected x86_64 runtime");
  assert.equal(image.subarray(8, 11).toString("hex"), "414902", "Expected type-2 AppImage");
  const offset64 = (offset) => {
    const value = Number(image.readBigUInt64LE(offset));
    assert.ok(Number.isSafeInteger(value) && value <= image.length, "ELF offset exceeds file bounds");
    return value;
  };
  const programOffset = offset64(32);
  const programSize = image.readUInt16LE(54);
  const programCount = image.readUInt16LE(56);
  assert.ok(programSize >= 56 && programCount > 0 && programOffset + programSize * programCount <= image.length, "Invalid ELF program table");
  for (let index = 0; index < programCount; index++) {
    const header = programOffset + index * programSize;
    const type = image.readUInt32LE(header);
    assert.notEqual(type, 3, "Runtime must be static (no PT_INTERP)");
    // A static PIE legitimately has PT_DYNAMIC for self-relocation. Only
    // DT_NEEDED entries would introduce dependencies on host shared libraries.
    if (type === 2) {
      const offset = offset64(header + 8);
      const size = offset64(header + 32);
      assert.ok(size >= 16 && size % 16 === 0 && offset + size <= image.length, "Invalid ELF dynamic table");
      let terminated = false;
      for (let entry = offset; entry < offset + size; entry += 16) {
        const tag = image.readBigUInt64LE(entry);
        assert.notEqual(tag, 1n, "Runtime must be static (no DT_NEEDED libraries)");
        if (tag === 0n) { terminated = true; break; }
      }
      assert.ok(terminated, "Unterminated ELF dynamic table");
    }
  }
  const sectionOffset = offset64(40);
  const sectionSize = image.readUInt16LE(58);
  const sectionCount = image.readUInt16LE(60);
  const stringIndex = image.readUInt16LE(62);
  const tableEnd = sectionOffset + sectionSize * sectionCount;
  assert.ok(sectionSize >= 64 && sectionCount > 0 && stringIndex < sectionCount && tableEnd <= image.length, "Invalid ELF section table");
  const section = (index) => {
    const header = sectionOffset + sectionSize * index;
    const offset = offset64(header + 24);
    const size = offset64(header + 32);
    assert.ok(offset + size <= image.length, "ELF section exceeds file bounds");
    return { header, offset, size };
  };
  const strings = section(stringIndex);
  const names = image.subarray(strings.offset, strings.offset + strings.size);
  let updateInformation;
  for (let index = 0; index < sectionCount; index++) {
    const header = sectionOffset + sectionSize * index;
    const nameOffset = image.readUInt32LE(header);
    assert.ok(nameOffset < names.length, "Invalid ELF section name");
    const nameEnd = names.indexOf(0, nameOffset);
    assert.ok(nameEnd >= nameOffset, "Unterminated ELF section name");
    if (names.toString("utf8", nameOffset, nameEnd) === ".upd_info") {
      assert.equal(updateInformation, undefined, "Duplicate update information section");
      const entry = section(index);
      updateInformation = image.subarray(entry.offset, entry.offset + entry.size).toString("utf8").replace(/\0+$/, "");
    }
  }
  assert.notEqual(updateInformation, undefined, "Missing update information section");
  const last = section(sectionCount - 1);
  const payloadOffset = Math.max(tableEnd, last.offset + last.size);
  assert.equal(image.toString("ascii", payloadOffset, payloadOffset + 4), "hsqs", "Expected SquashFS payload at runtime offset");
  assert.ok(payloadOffset + 96 <= image.length, "Truncated SquashFS superblock");
  assert.equal(image.readUInt16LE(payloadOffset + 28), 4, "Expected SquashFS version 4");
  return { payloadOffset, updateInformation };
}

export function verifyZsync(image, sidecar, filename) {
  const end = sidecar.indexOf("\n\n");
  assert.ok(end > 0 && end < 65536, "Missing zsync header");
  const fields = new Map();
  for (const line of sidecar.subarray(0, end).toString("ascii").split("\n")) {
    const match = /^([^:]+): (.*)$/.exec(line);
    assert.ok(match, "Malformed zsync header field");
    assert.ok(!fields.has(match[1]), `Duplicate zsync field: ${match[1]}`);
    fields.set(match[1], match[2]);
  }
  assert.ok(fields.get("zsync"), "Missing zsync format version");
  assert.equal(fields.get("Filename"), filename, "zsync filename does not match AppImage");
  assert.equal(fields.get("URL"), filename, "zsync URL must resolve to the adjacent release AppImage");
  assert.equal(fields.get("Length"), String(image.length), "zsync length does not match AppImage");
  assert.equal(fields.get("SHA-1"), createHash("sha1").update(image).digest("hex"), "zsync SHA-1 does not match AppImage");
  const blocksize = Number(fields.get("Blocksize"));
  const lengths = /^(\d+),(\d+),(\d+)$/.exec(fields.get("Hash-Lengths") || "");
  assert.ok(Number.isInteger(blocksize) && blocksize >= 512 && blocksize <= 1048576 && (blocksize & (blocksize - 1)) === 0, "Invalid zsync block size");
  assert.ok(lengths && Number(lengths[1]) > 0 && Number(lengths[2]) >= 1 && Number(lengths[2]) <= 4 && Number(lengths[3]) >= 1 && Number(lengths[3]) <= 16, "Invalid zsync hash lengths");
  const expectedBytes = Math.ceil(image.length / blocksize) * (Number(lengths[2]) + Number(lengths[3]));
  assert.equal(sidecar.length - end - 2, expectedBytes, "Truncated or unexpected zsync block checksums");
}

export async function verifyAppImageRelease(directory, channel, environment = process.env) {
  assert.ok(["stable", "none", "auto"].includes(channel), "Expected --update-channel=stable, none, or auto");
  const files = await readdir(directory);
  const images = files.filter((name) => name.endsWith(".AppImage"));
  assert.equal(images.length, 1, "Expected exactly one AppImage");
  const filename = images[0];
  assert.match(filename, /^CF-Compass-\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?-x86_64\.AppImage$/, "Unexpected AppImage filename");
  if (channel === "auto") channel = resolveAppImageUpdateChannel(filename.slice("CF-Compass-".length, -"-x86_64.AppImage".length), environment);
  if (channel === "stable") assert.match(filename, /^CF-Compass-\d+\.\d+\.\d+-x86_64\.AppImage$/, "Stable update channel requires a stable version");
  const image = await readFile(path.join(directory, filename));
  const runtime = inspectAppImage(image);
  assert.equal(runtime.updateInformation, channel === "stable" ? stableUpdateInformation : "", "Unexpected AppImage update channel");
  const sidecars = files.filter((name) => name.endsWith(".zsync"));
  assert.deepEqual(sidecars, channel === "stable" ? [`${filename}.zsync`] : [], "Missing or stale update sidecar");
  if (channel === "stable") verifyZsync(image, await readFile(path.join(directory, sidecars[0])), filename);
  return { filename, bytes: image.length, runtime: "static", filesystem: "SquashFS", ...runtime, updateChannel: channel, sidecarVerified: channel === "stable" };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === "--resolve-update-channel") {
      console.log(resolveAppImageUpdateChannel(process.argv[3]));
    } else {
      const channel = process.argv.find((arg) => arg.startsWith("--update-channel="))?.split("=")[1];
      console.log(JSON.stringify(await verifyAppImageRelease(path.resolve(process.argv[2] || "release"), channel), null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
