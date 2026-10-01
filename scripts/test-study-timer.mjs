import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { sanitizeTimerState, getTimerSnapshot, transitionTimer, formatTimerDuration } from "../src/lib/study-timer-model.mjs";

const require = createRequire(import.meta.url);
const { createStudyTimerService } = require("../electron/services/study-timer-service.cjs");
const DAY = 86400000;
const change = (state, type, now, extra = {}) => transitionTimer(state, { type, ...extra }, now);
const configured = (mode, now = 1000, extra = {}) => change(null, "configure", now, { mode, ...extra });
const code = (expected) => (error) => error.code === expected;

function fixture(initial = null) {
  let time = 1000;
  let stored = structuredClone(initial);
  let writes = 0;
  let failing = false;
  const changed = [];
  const elapsed = [];
  const create = () => createStudyTimerService({
    now: () => time,
    readStore: async () => structuredClone(stored),
    writeStore: async (value) => {
      if (failing) throw new Error("Fixture write failed");
      writes++;
      stored = structuredClone(value);
    },
    onChanged: (value) => changed.push(structuredClone(value)),
    onElapsed: (value) => {
      assert.equal(stored.notifiedAt, value.notifiedAt, "the notification marker must already be committed");
      elapsed.push(structuredClone(value));
    },
  });
  return { create, time: (value) => { time = value; }, failing: (value) => { failing = value; },
    read: () => structuredClone(stored), writes: () => writes, changed, elapsed };
}

test("malformed persisted states are bounded and restored without unsafe running anchors", () => {
  const state = sanitizeTimerState({ mode: "countdown", status: "running", durationMs: -1, elapsedMs: Infinity,
    startedAt: "yesterday", targetAt: {}, notifiedAt: 1, extra: "discard" }, 1000);
  assert.equal(state.mode, "countdown");
  assert.equal(state.status, "idle");
  assert.equal(state.durationMs, 25 * 60000);
  assert.equal(state.elapsedMs, 0);
  assert.equal(state.notifiedAt, null);
  assert.equal("extra" in state, false);
  assert.equal(sanitizeTimerState({ version: 999, status: "running", startedAt: 1 }, 1000).status, "idle");
  assert.equal(sanitizeTimerState({ mode: "target", status: "paused", targetAt: 2000, elapsedMs: 1 }, 1000).status, "idle");
});

test("stopwatch pause and resume exclude paused time and repeated controls preserve anchors", () => {
  let state = change(configured("stopwatch"), "start", 1000);
  assert.deepEqual(change(state, "start", 2000), state);
  assert.equal(getTimerSnapshot(state, 3500).displayMs, 2500);
  state = change(state, "pause", 4000);
  assert.equal(state.elapsedMs, 3000);
  assert.deepEqual(change(state, "pause", 5000), state);
  assert.equal(getTimerSnapshot(state, 50000).elapsedMs, 3000);
  state = change(state, "resume", 60000);
  assert.deepEqual(change(state, "resume", 61000), state);
  assert.equal(getTimerSnapshot(state, 62000).elapsedMs, 5000);
  assert.equal(change(state, "reset", 63000).elapsedMs, 0);
});

test("countdown uses accumulated time, completes at the exact deadline, and does not restart on repeated start", () => {
  let state = change(configured("countdown", 1000, { durationMs: 10000 }), "start", 1000);
  state = change(state, "pause", 4000);
  assert.equal(getTimerSnapshot(state, 90000).remainingMs, 7000);
  state = change(state, "resume", 100000);
  assert.equal(getTimerSnapshot(state, 106999).remainingMs, 1);
  const finished = getTimerSnapshot(state, 150000);
  assert.equal(finished.status, "completed");
  assert.equal(finished.completedAt, 107000);
  assert.equal(finished.elapsedMs, 10000);
  assert.equal(finished.remainingMs, 0);
  assert.equal(finished.isOverdue, true);
  assert.equal(change(state, "pause", 107000).status, "completed");
  assert.equal(change(finished, "start", 151000).completedAt, 107000);
});

test("target mode spans dates and rejects pause/resume rather than changing the specified deadline", () => {
  const start = Date.parse("2026-10-01T23:59:59.000Z");
  const targetAt = Date.parse("2026-10-02T00:00:01.000Z");
  const state = change(configured("target", start, { targetAt }), "start", start);
  assert.equal(getTimerSnapshot(state, start).remainingMs, 2000);
  for (const type of ["pause", "resume"]) assert.throws(() => change(state, type, start + 1), code("STUDY_TIMER_FIXED_TARGET"));
  const finished = getTimerSnapshot(state, start + DAY);
  assert.equal(finished.completedAt, targetAt);
  assert.equal(finished.elapsedMs, 2000);
  assert.equal(getTimerSnapshot(state, targetAt).isOverdue, false);
  assert.equal(getTimerSnapshot(finished, start).remainingMs, 0, "a later clock rollback must not revive a completed target");
  assert.equal(change(state, "cancel", start + 500).status, "idle");
});

test("duration and target configuration boundaries reject invalid and past values", () => {
  for (const durationMs of [999, 7 * DAY + 1, NaN, Infinity, "1000", 1000.5]) {
    assert.throws(() => configured("countdown", 1000, { durationMs }), code("STUDY_TIMER_INVALID_DURATION"));
  }
  assert.equal(configured("countdown", 1000, { durationMs: 1000 }).durationMs, 1000);
  assert.equal(configured("countdown", 1000, { durationMs: 7 * DAY }).durationMs, 7 * DAY);
  for (const targetAt of [null, 999, 1000, 1000 + 366 * DAY + 1, NaN, Infinity, "2000"]) {
    assert.throws(() => configured("target", 1000, { targetAt }), code("STUDY_TIMER_INVALID_TARGET"));
  }
  assert.equal(configured("target", 1000, { targetAt: 1000 + 366 * DAY }).targetAt, 1000 + 366 * DAY);
  const expired = configured("target", 1000, { targetAt: 2000 });
  assert.throws(() => change(expired, "start", 2000), code("STUDY_TIMER_INVALID_TARGET"));
});

test("active configuration is locked, reset/cancel permit edits, and unknown actions are rejected", () => {
  let state = change(configured("countdown"), "start", 1000);
  for (const active of [state, change(state, "pause", 2000)]) {
    assert.throws(() => change(active, "configure", 2000, { mode: "stopwatch" }), code("STUDY_TIMER_BUSY"));
  }
  state = change(state, "cancel", 2000);
  assert.equal(change(state, "configure", 2000, { mode: "stopwatch" }).mode, "stopwatch");
  for (const action of [null, [], {}, { type: "delete" }, { type: "configure", mode: "future" }]) {
    assert.throws(() => transitionTimer(state, action, 2000), code("STUDY_TIMER_INVALID_ACTION"));
  }
});

test("clock rollback cannot produce negative elapsed time, sleep catches up, and formatting retains multi-day hours", () => {
  const state = change(configured("stopwatch"), "start", 1000);
  assert.equal(getTimerSnapshot(state, 0).elapsedMs, 0);
  assert.equal(getTimerSnapshot(state, 1000 + 100 * DAY).elapsedMs, 100 * DAY);
  assert.equal(getTimerSnapshot(state, 1000 + 1200 * DAY).displayMs, 999 * DAY);
  assert.equal(formatTimerDuration(25 * 3600000 + 61 * 1000), "25:01:01");
  assert.equal(formatTimerDuration(-1), "00:00:00");
  assert.equal(formatTimerDuration(Infinity), "00:00:00");
});

test("service ticks project elapsed time without a write or broadcast every second", async () => {
  const f = fixture();
  const service = f.create();
  await service.dispatch({ type: "start" });
  const writes = f.writes();
  const changes = f.changed.length;
  for (let time = 2000; time <= 10000; time += 1000) {
    f.time(time);
    assert.equal((await service.tick()).elapsedMs, time - 1000);
  }
  assert.equal(f.writes(), writes);
  assert.equal(f.changed.length, changes);
  assert.equal(f.read().elapsedMs, 0);
  assert.equal(f.read().startedAt, 1000);
});

test("renderer snapshots can be projected again without double-counting their elapsed time", () => {
  const state = change(configured("stopwatch"), "start", 1000);
  const snapshot = getTimerSnapshot(state, 4000);
  assert.equal(snapshot.elapsedMs, 3000);
  assert.equal(snapshot.accumulatedMs, 0);
  assert.equal(getTimerSnapshot(snapshot, 5000).elapsedMs, 4000);
  assert.equal(sanitizeTimerState(snapshot, 5000).elapsedMs, 0);
  assert.equal("accumulatedMs" in sanitizeTimerState(snapshot, 5000), false);
});

test("close/reopen and application restart preserve running anchors and catch up once", async () => {
  const f = fixture();
  let service = f.create();
  await service.dispatch({ type: "configure", mode: "countdown", durationMs: 10000 });
  await service.dispatch({ type: "start" });
  f.time(3000);
  assert.equal((await service.getState()).remainingMs, 8000);
  await service.dispose();
  f.time(20000);
  service = f.create();
  const snapshot = await service.getState();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.completedAt, 11000);
  assert.equal(snapshot.notifiedAt, 20000);
  assert.equal(f.elapsed.length, 1);
  await service.tick();
  await service.dispose();
  service = f.create();
  await service.getState();
  assert.equal(f.elapsed.length, 1);
});

test("target time completes while app is closed and persists before notifying", async () => {
  const f = fixture();
  let service = f.create();
  await service.dispatch({ type: "configure", mode: "target", targetAt: 2000 });
  await service.dispatch({ type: "start" });
  await service.dispose();
  f.time(100000);
  service = f.create();
  const state = await service.tick();
  assert.equal(state.completedAt, 2000);
  assert.equal(state.elapsedMs, 1000);
  assert.equal(f.elapsed.length, 1);
  assert.equal(f.read().notifiedAt, 100000);
});

test("a paused countdown stays paused after restart and excludes the closed application time", async () => {
  const f = fixture();
  let service = f.create();
  await service.dispatch({ type: "configure", mode: "countdown", durationMs: 10000 });
  await service.dispatch({ type: "start" });
  f.time(4000);
  await service.dispatch({ type: "pause" });
  await service.dispose();
  f.time(100000);
  service = f.create();
  assert.equal((await service.getState()).status, "paused");
  assert.equal((await service.getState()).remainingMs, 7000);
  await service.dispatch({ type: "resume" });
  f.time(107000);
  assert.equal((await service.tick()).completedAt, 107000);
  assert.equal(f.elapsed.length, 1);
});

test("simultaneous repeated commands serialize to a single start and accumulated pause", async () => {
  const f = fixture();
  const service = f.create();
  await Promise.all(Array.from({ length: 8 }, () => service.dispatch({ type: "start" })));
  assert.equal(f.read().startedAt, 1000);
  const startWrites = f.writes();
  f.time(4000);
  await Promise.all(Array.from({ length: 8 }, () => service.dispatch({ type: "pause" })));
  assert.equal(f.read().elapsedMs, 3000);
  assert.equal(f.writes(), startWrites + 1);
  f.time(10000);
  await Promise.all(Array.from({ length: 8 }, () => service.dispatch({ type: "resume" })));
  assert.equal(f.read().elapsedMs, 3000);
  assert.equal(f.read().startedAt, 10000);
});

test("failed control write does not mutate memory and later operations recover", async () => {
  const f = fixture();
  const service = f.create();
  await service.getState();
  f.failing(true);
  await assert.rejects(service.dispatch({ type: "start" }), /Fixture write failed/);
  f.failing(false);
  assert.equal((await service.getState()).status, "idle");
  f.time(5000);
  await service.dispatch({ type: "start" });
  f.time(6000);
  f.failing(true);
  await assert.rejects(service.dispatch({ type: "pause" }), /Fixture write failed/);
  f.failing(false);
  assert.equal((await service.getState()).status, "running");
  assert.equal(f.read().startedAt, 5000);
});

test("failed completion write emits no alarm and retries without losing the deadline", async () => {
  const f = fixture();
  const service = f.create();
  await service.dispatch({ type: "configure", mode: "countdown", durationMs: 1000 });
  await service.dispatch({ type: "start" });
  f.time(10000);
  f.failing(true);
  await assert.rejects(service.tick(), /Fixture write failed/);
  assert.equal(f.elapsed.length, 0);
  assert.equal(f.read().status, "running");
  f.failing(false);
  await Promise.all([service.tick(), service.tick(), service.getState()]);
  assert.equal(f.elapsed.length, 1);
  assert.equal(f.read().completedAt, 2000);
});

test("a rejected action does not poison the queue and disposal rejects future calls", async () => {
  const f = fixture();
  const service = f.create();
  await assert.rejects(service.dispatch({ type: "unknown" }), code("STUDY_TIMER_INVALID_ACTION"));
  assert.equal((await service.dispatch({ type: "start" })).status, "running");
  await service.dispose();
  await assert.rejects(service.getState(), code("STUDY_TIMER_DISPOSED"));
});

test("notification callback errors cannot roll back the persisted completion", async () => {
  let stored = change(configured("countdown", 1000, { durationMs: 1000 }), "start", 1000);
  const service = createStudyTimerService({ readStore: async () => stored, writeStore: async (value) => { stored = value; },
    now: () => 5000, onChanged: () => { throw new Error("Window closed"); }, onElapsed: () => { throw new Error("Notifications unavailable"); } });
  assert.equal((await service.tick()).status, "completed");
  assert.equal(stored.notifiedAt, 5000);
});

test("quitting flush preserves an unnotified completion and the next launch delivers it once", async () => {
  let stored = change(configured("countdown", 1000, { durationMs: 1000 }), "start", 1000);
  let notifications = 0;
  const storage = { readStore: async () => structuredClone(stored), writeStore: async (value) => { stored = structuredClone(value); },
    now: () => 5000, onElapsed: () => { notifications++; } };
  const quitting = createStudyTimerService({ ...storage, shouldNotify: () => false });
  assert.equal((await quitting.getState()).status, "completed");
  assert.equal(stored.completedAt, 2000);
  assert.equal(stored.notifiedAt, null);
  assert.equal(notifications, 0);
  await quitting.dispose();
  const restarted = createStudyTimerService(storage);
  await restarted.getState();
  await restarted.tick();
  assert.equal(stored.notifiedAt, 5000);
  assert.equal(notifications, 1);
});

test("quitting during the notification marker write defers the alarm until restart", async () => {
  let stored = change(configured("target", 1000, { targetAt: 2000 }), "start", 1000);
  let quitting = false;
  let notifications = 0;
  const storage = { readStore: async () => structuredClone(stored), writeStore: async (value) => {
    stored = structuredClone(value);
    if (value.notifiedAt != null) quitting = true;
  }, now: () => 5000, onElapsed: () => { notifications++; } };
  const service = createStudyTimerService({ ...storage, shouldNotify: () => !quitting });
  await service.tick();
  assert.equal(stored.status, "completed");
  assert.equal(stored.completedAt, 2000);
  assert.equal(stored.notifiedAt, null);
  assert.equal(notifications, 0);
  await service.dispose();
  const restarted = createStudyTimerService(storage);
  await restarted.getState();
  assert.equal(notifications, 1);
});
