const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const MAXIMUM_AUDIO_BYTES = 20 * 1024 * 1024;
const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];
const MANAGED_AUDIO_NAME = /^custom-[ab]\.(mp3|wav|ogg|m4a|aac|flac)$/;
const DEFAULT_AUDIO_NAME = "default-bell.wav";

// A gentle pair of decaying tones. Generated locally, with no network asset or
// browser synthesis permission required. The whole sound lasts 2.4 seconds.
function createDefaultBell() {
  const sampleRate = 22050;
  const samples = Math.round(sampleRate * 2.4);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    const seconds = index / sampleRate;
    let value = 0;
    for (const onset of [0.08, 1.16]) {
      const elapsed = seconds - onset;
      if (elapsed < 0 || elapsed > 1.12) continue;
      const envelope = Math.min(1, elapsed / 0.012) * Math.exp(-5 * elapsed);
      const tone = Math.sin(2 * Math.PI * 784 * elapsed)
        + 0.28 * Math.sin(2 * Math.PI * 1176 * elapsed);
      value += envelope * tone * 0.2;
    }
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + index * 2);
  }
  return buffer;
}

function samePath(first, second) {
  const normalize = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  return normalize(path.resolve(first)) === normalize(path.resolve(second));
}

function createStudyTimerAudioService({ directory, readStore, writeStore, chooseFile, onChanged = () => {} }) {
  if (!directory || typeof readStore !== "function" || typeof writeStore !== "function") {
    throw new TypeError("Timer audio requires a managed directory and config storage.");
  }
  const managedDirectory = path.resolve(directory);
  let pending = Promise.resolve();
  const serial = (operation) => {
    const task = pending.catch(() => {}).then(operation);
    pending = task;
    return task;
  };

  async function ensureDirectory() {
    // Check the canonical parent before creating anything. Reject junctions or
    // symlinks that could redirect this narrow resource store outside userData.
    const parent = path.dirname(managedDirectory);
    if (!samePath(await fs.realpath(parent), parent)) throw new Error("audio-storage-unsafe");
    await fs.mkdir(managedDirectory).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    const stats = await fs.lstat(managedDirectory);
    if (stats.isSymbolicLink() || !stats.isDirectory()
      || !samePath(await fs.realpath(managedDirectory), managedDirectory)) {
      throw new Error("audio-storage-unsafe");
    }
  }

  async function managedFile(filename) {
    await ensureDirectory();
    const target = path.join(managedDirectory, filename);
    try {
      const stats = await fs.lstat(target);
      if (stats.isSymbolicLink() || !stats.isFile() || stats.size === 0
        || stats.size > MAXIMUM_AUDIO_BYTES || !samePath(await fs.realpath(target), target)) return null;
      return target;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async function defaultPath() {
    let target = await managedFile(DEFAULT_AUDIO_NAME);
    if (target) return target;
    target = path.join(managedDirectory, DEFAULT_AUDIO_NAME);
    const existing = await fs.lstat(target).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing) {
      // Never follow or overwrite a resource symlink planted inside the store.
      if (existing.isSymbolicLink() || !existing.isFile()) throw new Error("audio-storage-unsafe");
      await fs.unlink(target);
    }
    const handle = await fs.open(target, "wx", 0o600);
    try {
      await handle.writeFile(createDefaultBell());
      await handle.sync();
    } finally {
      await handle.close();
    }
    return target;
  }

  async function readMetadata() {
    const stored = await readStore({ version: 1, source: "default" });
    return stored && typeof stored === "object" ? stored : {};
  }

  async function publicConfig() {
    const stored = await readMetadata();
    if (stored.source !== "custom") return { source: "default", name: "" };
    const safeName = typeof stored.filename === "string" && MANAGED_AUDIO_NAME.test(stored.filename)
      ? stored.filename : null;
    if (!safeName || !await managedFile(safeName)) {
      return { source: "default", name: "", error: "audio-missing" };
    }
    return { source: "custom", name: path.basename(String(stored.name || "")).slice(0, 160) };
  }

  function notify(config) {
    // Notification failure must not invalidate a successfully stored choice.
    try { Promise.resolve(onChanged(config)).catch(() => {}); } catch { /* next get resynchronizes */ }
    return config;
  }

  async function cleanInactiveResources(activeName) {
    await ensureDirectory();
    for (const entry of await fs.readdir(managedDirectory, { withFileTypes: true })) {
      if (entry.name === activeName || !MANAGED_AUDIO_NAME.test(entry.name)) continue;
      // unlink removes only this directory entry, including an injected symlink;
      // it never traverses a target and never recursively removes a directory.
      if (entry.isFile() || entry.isSymbolicLink()) {
        await fs.unlink(path.join(managedDirectory, entry.name)).catch(() => {});
      }
    }
  }

  return {
    getConfig: () => serial(publicConfig),
    choose: () => serial(async () => {
      if (typeof chooseFile !== "function") throw new Error("audio-selection-unavailable");
      const choice = await chooseFile();
      const selected = typeof choice === "string" ? choice : choice?.filePaths?.[0];
      if (!selected || choice?.canceled) return publicConfig();
      const extension = path.extname(selected).slice(1).toLowerCase();
      if (!AUDIO_EXTENSIONS.includes(extension)) throw new Error("audio-format");
      const source = await fs.realpath(selected);
      const stats = await fs.stat(source);
      if (!stats.isFile()) throw new Error("audio-format");
      if (!stats.size || stats.size > MAXIMUM_AUDIO_BYTES) throw new Error("audio-too-large");
      await ensureDirectory();
      const current = await readMetadata();
      const slot = typeof current.filename === "string" && current.filename.startsWith("custom-a.") ? "b" : "a";
      const filename = `custom-${slot}.${extension}`;
      const temporary = path.join(managedDirectory, `audio-import-${randomUUID()}.tmp`);
      const target = path.join(managedDirectory, filename);
      try {
        // Open/read once, bound the actual bytes, and exclusively create the
        // temporary managed file. An original audio file can later move or vanish.
        const input = await fs.open(source, "r");
        let bytes;
        try {
          const opened = await input.stat();
          if (!opened.isFile()) throw new Error("audio-format");
          if (!opened.size || opened.size > MAXIMUM_AUDIO_BYTES) throw new Error("audio-too-large");
          bytes = Buffer.alloc(opened.size);
          let offset = 0;
          while (offset < bytes.length) {
            const { bytesRead } = await input.read(bytes, offset, bytes.length - offset, offset);
            if (!bytesRead) throw new Error("audio-copy-incomplete");
            offset += bytesRead;
          }
          if ((await input.stat()).size !== bytes.length) throw new Error("audio-copy-incomplete");
        } finally { await input.close(); }
        const output = await fs.open(temporary, "wx", 0o600);
        try { await output.writeFile(bytes); await output.sync(); } finally { await output.close(); }
        await ensureDirectory();
        const oldTarget = await fs.lstat(target).catch((error) => {
          if (error.code === "ENOENT") return null;
          throw error;
        });
        if (oldTarget?.isDirectory()) throw new Error("audio-storage-unsafe");
        if (oldTarget) await fs.unlink(target);
        await fs.rename(temporary, target);
        // The previous active slot survives until the atomic config write has
        // committed. A failed write therefore leaves the prior choice usable.
        await writeStore({ version: 1, source: "custom", filename, name: path.basename(selected).slice(0, 160) });
      } finally {
        await fs.unlink(temporary).catch(() => {});
      }
      await cleanInactiveResources(filename);
      return notify(await publicConfig());
    }),
    reset: () => serial(async () => {
      await writeStore({ version: 1, source: "default" });
      await cleanInactiveResources(null);
      return notify({ source: "default", name: "" });
    }),
    getAudioPath: (kind) => serial(async () => {
      if (kind !== "default" && kind !== "custom") throw new Error("audio-source");
      if (kind === "custom") {
        const stored = await readMetadata();
        if (stored.source === "custom" && typeof stored.filename === "string" && MANAGED_AUDIO_NAME.test(stored.filename)) {
          const target = await managedFile(stored.filename);
          if (target) return target;
        }
      }
      return defaultPath();
    }),
  };
}

module.exports = { AUDIO_EXTENSIONS, MAXIMUM_AUDIO_BYTES, createDefaultBell, createStudyTimerAudioService };
