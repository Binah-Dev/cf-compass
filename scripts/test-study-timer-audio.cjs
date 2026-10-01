const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { createDefaultBell, createStudyTimerAudioService, MAXIMUM_AUDIO_BYTES } = require("../electron/services/study-timer-audio-service.cjs");
const { writeAtomicJson } = require("../electron/services/atomic-json.cjs");

async function fixture(t) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "cf-study-timer-audio-"));
  const directory = path.join(parent, "study-timer-audio");
  const storePath = path.join(parent, "study-timer-audio.json");
  let selected = null;
  let failWrite = false;
  const changes = [];
  const dependencies = {
    directory,
    readStore: async (fallback) => fs.readFile(storePath, "utf8").then(JSON.parse).catch((error) => {
      if (error.code === "ENOENT") return fallback;
      throw error;
    }),
    writeStore: async (value) => {
      if (failWrite) throw new Error("fixture-write-failed");
      await writeAtomicJson(storePath, value);
    },
    chooseFile: async () => selected,
    onChanged: (config) => changes.push(config),
  };
  t.after(async () => {
    const resolved = path.resolve(parent);
    assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(resolved).startsWith("cf-study-timer-audio-"));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return {
    parent, directory, storePath, changes, dependencies,
    service: createStudyTimerAudioService(dependencies),
    select: (value) => { selected = value; },
    failWrite: (value) => { failWrite = value; },
    async source(name, bytes = createDefaultBell()) {
      const target = path.join(parent, name);
      await fs.writeFile(target, bytes);
      return target;
    },
  };
}

test("default bell is a bounded, gentle 2.4 second PCM WAV", () => {
  const bytes = createDefaultBell();
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WAVE");
  assert.equal(bytes.readUInt16LE(20), 1);
  assert.equal(bytes.readUInt16LE(22), 1);
  assert.equal(bytes.readUInt32LE(24), 22050);
  assert.equal(bytes.readUInt32LE(40) / (22050 * 2), 2.4);
  let maximum = 0;
  for (let offset = 44; offset < bytes.length; offset += 2) maximum = Math.max(maximum, Math.abs(bytes.readInt16LE(offset)));
  assert.ok(maximum > 1000 && maximum < 10000);
});

test("public config contains no paths and only two audio sources resolve", async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.service.getConfig(), { source: "default", name: "" });
  const audioPath = await f.service.getAudioPath("default");
  assert.equal(path.dirname(audioPath), f.directory);
  assert.equal(path.basename(audioPath), "default-bell.wav");
  assert.deepEqual(await fs.readFile(audioPath), createDefaultBell());
  assert.equal(await f.service.getAudioPath("custom"), audioPath);
  await assert.rejects(f.service.getAudioPath("../../outside.wav"), /audio-source/);
  await assert.rejects(f.service.getAudioPath({ source: "default" }), /audio-source/);
});

test("selected audio is copied, survives original removal and service restart", async (t) => {
  const f = await fixture(t);
  const source = await f.source("gentle.wav");
  f.select({ canceled: false, filePaths: [source] });
  const config = await f.service.choose();
  assert.deepEqual(config, { source: "custom", name: "gentle.wav" });
  const audioPath = await f.service.getAudioPath("custom");
  assert.equal(path.basename(audioPath), "custom-a.wav");
  await fs.unlink(source);
  const restarted = createStudyTimerAudioService(f.dependencies);
  assert.deepEqual(await restarted.getConfig(), config);
  assert.deepEqual(await fs.readFile(await restarted.getAudioPath("custom")), createDefaultBell());
  assert.equal(f.changes.length, 1);
});

test("canceling selection retains the prior sound without notifying a change", async (t) => {
  const f = await fixture(t);
  f.select(await f.source("first.wav"));
  await f.service.choose();
  f.select({ canceled: true, filePaths: [] });
  assert.deepEqual(await f.service.choose(), { source: "custom", name: "first.wav" });
  assert.equal(f.changes.length, 1);
});

test("unsupported, empty and oversized files fail without changing config", async (t) => {
  const f = await fixture(t);
  f.select(await f.source("invalid.exe"));
  await assert.rejects(f.service.choose(), /audio-format/);
  f.select(await f.source("empty.mp3", Buffer.alloc(0)));
  await assert.rejects(f.service.choose(), /audio-too-large/);
  const oversized = await f.source("large.ogg", Buffer.alloc(1));
  await fs.truncate(oversized, MAXIMUM_AUDIO_BYTES + 1);
  f.select(oversized);
  await assert.rejects(f.service.choose(), /audio-too-large/);
  assert.deepEqual(await f.service.getConfig(), { source: "default", name: "" });
  assert.equal(f.changes.length, 0);
});

test("failed persistence keeps the previous copied resource and config usable", async (t) => {
  const f = await fixture(t);
  f.select(await f.source("old.wav"));
  await f.service.choose();
  const priorPath = await f.service.getAudioPath("custom");
  const replacement = Buffer.from(createDefaultBell());
  replacement[100] ^= 1;
  f.select(await f.source("new.wav", replacement));
  f.failWrite(true);
  await assert.rejects(f.service.choose(), /fixture-write-failed/);
  assert.deepEqual(await f.service.getConfig(), { source: "custom", name: "old.wav" });
  assert.equal(await f.service.getAudioPath("custom"), priorPath);
  assert.deepEqual(await fs.readFile(priorPath), createDefaultBell());
  f.failWrite(false);
  await f.service.choose();
  assert.deepEqual(await fs.readFile(await f.service.getAudioPath("custom")), replacement);
  await assert.rejects(fs.access(priorPath), { code: "ENOENT" });
});

test("missing or malformed custom metadata falls back without path traversal", async (t) => {
  const f = await fixture(t);
  const outside = await f.source("outside.wav");
  await writeAtomicJson(f.storePath, { source: "custom", filename: "../outside.wav", name: outside });
  assert.deepEqual(await f.service.getConfig(), { source: "default", name: "", error: "audio-missing" });
  assert.equal(path.basename(await f.service.getAudioPath("custom")), "default-bell.wav");
  await writeAtomicJson(f.storePath, { source: "custom", filename: "custom-a.wav", name: "missing.wav" });
  assert.deepEqual(await f.service.getConfig(), { source: "default", name: "", error: "audio-missing" });
  assert.deepEqual(await fs.readFile(outside), createDefaultBell());
});

test("reset removes managed custom copies and retains unrelated local files", async (t) => {
  const f = await fixture(t);
  f.select(await f.source("chosen.wav"));
  await f.service.choose();
  const unrelated = path.join(f.directory, "keep.txt");
  await fs.writeFile(unrelated, "keep");
  await f.service.getAudioPath("default");
  assert.deepEqual(await f.service.reset(), { source: "default", name: "" });
  assert.equal(await fs.readFile(unrelated, "utf8"), "keep");
  assert.equal((await fs.readdir(f.directory)).filter((name) => name.startsWith("custom-")).length, 0);
  assert.equal(path.basename(await f.service.getAudioPath("default")), "default-bell.wav");
});

test("managed directory junction or symlink cannot redirect resource writes", async (t) => {
  const f = await fixture(t);
  const outside = path.join(f.parent, "outside");
  await fs.mkdir(outside);
  try { await fs.symlink(outside, f.directory, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) return t.skip("Fixture symlink creation unavailable"); throw error; }
  await assert.rejects(f.service.getAudioPath("default"), /audio-storage-unsafe/);
  f.select(await f.source("valid.wav"));
  await assert.rejects(f.service.choose(), /audio-storage-unsafe/);
  assert.deepEqual(await fs.readdir(outside), []);
  await fs.unlink(f.directory);
});

async function audioHost(pendingCommand = null) {
  const source = (await fs.readFile(path.join(__dirname, "../src/components/StudyTimerAudioHost.jsx"), "utf8"))
    .replace('import { useEffect } from "react";', "")
    .replace("export default function StudyTimerAudioHost", "function StudyTimerAudioHost");
  const elements = [];
  const reports = [];
  const timers = new Map();
  let listener;
  let cleanup;
  let unsubscribed = false;
  let nextTimer = 0;
  class FakeAudio {
    constructor() {
      this.paused = false;
      this.promise = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
      elements.push(this);
    }
    play() { return this.promise; }
    pause() { this.paused = true; }
    load() {}
    removeAttribute(name) { if (name === "src") this.src = ""; }
  }
  vm.runInNewContext(`${source}\nStudyTimerAudioHost();`, {
    useEffect: (effect) => { cleanup = effect(); },
    window: { cfBridge: {
      onStudyTimerAudioCommand: (callback) => { listener = callback; return () => { unsubscribed = true; }; },
      studyTimerAudioHostReady: async () => pendingCommand,
      studyTimerAudioPlayback: async (value) => { reports.push(JSON.parse(JSON.stringify(value))); },
    } },
    Audio: FakeAudio,
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    encodeURIComponent,
  });
  await Promise.resolve();
  return { elements, reports, timers, command: (value) => listener(value), cleanup: () => cleanup(), isUnsubscribed: () => unsubscribed };
}

const playCommand = (id, source = "default") => ({ type: "play", id, source, reason: "alarm" });

test("audio host deduplicates occurrences, validates sources and stops after 15 seconds", async () => {
  const h = await audioHost();
  h.command(playCommand("first"));
  h.command(playCommand("first"));
  h.command(playCommand("unsafe", "../../private"));
  assert.equal(h.elements.length, 1);
  assert.ok(h.elements[0].src.startsWith("cf-timer-audio://local/default?"));
  assert.equal(h.elements[0].loop, false);
  h.elements[0].resolve();
  await Promise.resolve();
  assert.deepEqual(h.reports.at(-1), { id: "first", playing: true });
  const timer = [...h.timers.values()][0];
  assert.equal(timer.delay, 15000);
  timer.callback();
  assert.equal(h.elements[0].paused, true);
  assert.deepEqual(h.reports.at(-1), { id: "first", playing: false });
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("custom decode failure falls back once and ignores the failed play's late rejection", async () => {
  const h = await audioHost();
  h.command(playCommand("custom", "custom"));
  const custom = h.elements[0];
  custom.onerror();
  assert.equal(h.elements.length, 2);
  const fallback = h.elements[1];
  assert.ok(fallback.src.startsWith("cf-timer-audio://local/default?"));
  assert.deepEqual(h.reports.at(-1), { id: "custom", playing: true, error: "audio-unavailable" });
  custom.reject(new Error("late decode error"));
  fallback.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fallback.paused, false);
  assert.deepEqual(h.reports.at(-1), { id: "custom", playing: true });
  fallback.onended();
  assert.deepEqual(h.reports.at(-1), { id: "custom", playing: false });
  assert.equal(h.elements.length, 2);
  h.cleanup();
});

test("failed default playback reports an error and cannot replay infinitely", async () => {
  const h = await audioHost();
  h.command(playCommand("broken"));
  h.elements[0].onerror();
  h.elements[0].reject(new Error("decode unavailable"));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.elements.length, 1);
  assert.deepEqual(h.reports, [{ id: "broken", playing: false, error: "audio-playback" }]);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("host-ready handoff and repeated event delivery play once; cleanup stops audio", async () => {
  const pending = playCommand("handoff");
  const h = await audioHost(pending);
  h.command(pending);
  assert.equal(h.elements.length, 1);
  h.cleanup();
  assert.equal(h.isUnsubscribed(), true);
  assert.equal(h.elements[0].paused, true);
  h.elements[0].resolve();
  await Promise.resolve();
  assert.ok(h.reports.every((value) => value.playing === false));
});

test("new playback and explicit stop ignore late resolution of an old audio element", async () => {
  const h = await audioHost();
  h.command(playCommand("old"));
  h.command(playCommand("new"));
  const old = h.elements[0];
  const next = h.elements[1];
  old.resolve();
  next.resolve();
  await Promise.resolve();
  assert.equal(old.paused, true);
  assert.equal(next.paused, false);
  assert.deepEqual(h.reports.at(-1), { id: "new", playing: true });
  h.command({ type: "stop", id: "cancel" });
  assert.equal(next.paused, true);
  assert.deepEqual(h.reports.at(-1), { id: "new", playing: false });
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("late host-ready replies cannot resurrect a sound after a newer stop or play event", async () => {
  for (const newer of [{ type: "stop", id: "cancel-ready" }, playCommand("newer")]) {
    let resolveReady;
    const waiting = new Promise((resolve) => { resolveReady = resolve; });
    const h = await audioHost(waiting);
    h.command(newer);
    resolveReady(playCommand("stale-ready"));
    // Drain the complete async ready/adoption chain before asserting silence.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.elements.length, newer.type === "stop" ? 0 : 1);
    assert.ok(h.elements.every((element) => !element.src.includes("stale-ready")));
    h.cleanup();
  }
});
