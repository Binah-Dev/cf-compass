import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  createTrainingDraft, createTrainingSessionController, sanitizeTrainingStore,
  isTrainingSubmission, mergeTrainingSubmissions, normalizeTrainingProblemKey, summarizeTrainingSession,
} from "../src/lib/training-session-model.mjs";

const require = createRequire(import.meta.url);
const { createCustomTrainingService } = require("../electron/services/custom-training-service.cjs");
const clone = (value) => structuredClone(value);
const problems = [
  { contestId: 100, index: "A", name: "Alpha", rating: 1200, tags: ["dp"] },
  { contestId: 200, index: "A", name: "Other Alpha", rating: 1400, tags: ["graphs"] },
  { contestId: 100, index: "B", name: "Beta", tags: ["math"] },
];
const draftInput = (changes = {}) => ({ title: "Training", problemKeys: ["100-A", "200-A", "100-B"], durationSeconds: 120, hideTags: true, hideRating: true, ...changes });
const submission = (id, creationTimeSeconds, verdict = "OK", changes = {}) => ({
  id, creationTimeSeconds, relativeTimeSeconds: 999999,
  problem: { contestId: 100, index: "A" },
  author: { participantType: "PRACTICE", members: [{ handle: "Fixture" }] },
  verdict, ...changes,
});
function fixture(options = {}) {
  let store = { version: 1, sessions: [] };
  let context = { handle: "Fixture", problems: clone(problems), submissions: [] };
  let time = 1000;
  let sequence = 0;
  let fetcher = async () => [];
  const io = {
    readStore: async () => clone(store), writeStore: async (value) => { store = clone(value); },
    loadContext: async () => clone(context), fetchJson: (endpoint) => fetcher(endpoint),
    now: () => time, createId: () => `session-${++sequence}`, ...options,
  };
  const service = createTrainingSessionController(io);
  return {
    service, io, read: () => clone(store), time: (value) => { time = value; },
    context: (value) => { context = clone(value); }, getContext: () => clone(context),
    fetcher: (value) => { fetcher = value; },
  };
}
async function running(f) {
  const store = await f.service.saveDraft(draftInput());
  const id = store.sessions[0].id;
  await f.service.start(id);
  return id;
}
const rejectsCode = (promise, code) => assert.rejects(promise, (error) => error.code === code);
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("draft snapshots use canonical complete IDs, order and deduplicated prior account history", () => {
  const old = submission(1, 900);
  const context = { handle: "Fixture", problems: clone(problems), submissions: [old, old,
    submission(2, 950, "WRONG_ANSWER"), submission(3, 1001),
    submission(4, 950, "OK", { author: { participantType: "PRACTICE", members: [{ handle: "Other" }] } }),
    submission(5, 950, "OK", { author: { participantType: "PRACTICE", members: [{ handle: "Fixture" }, { handle: "Other" }] } }),
  ] };
  const draft = createTrainingDraft(draftInput({ problemKeys: ["200-a", "100-A"] }), context, 1000, "id");
  assert.deepEqual(draft.problems.map((problem) => problem.key), ["200-A", "100-A"]);
  assert.equal(draft.problems[1].priorAttempts, 2);
  assert.equal(draft.problems[1].priorAccepted, true);
  assert.equal(draft.problems[0].priorAccepted, false);
  assert.equal(draft.startTimeSeconds, null);
  assert.equal(normalizeTrainingProblemKey("000100-a"), "100-A");
  assert.equal(normalizeTrainingProblemKey("100-A/../../"), "");
  context.problems[0].name = "Changed";
  assert.equal(draft.problems[1].name, "Alpha");
});

test("validation rejects invalid selections, durations, account, future store versions", async () => {
  const f = fixture();
  await rejectsCode(f.service.saveDraft(draftInput({ problemKeys: ["100-A", "100-a"] })), "TRAINING_INVALID_PROBLEMS");
  await rejectsCode(f.service.saveDraft(draftInput({ problemKeys: [] })), "TRAINING_INVALID_PROBLEMS");
  await rejectsCode(f.service.saveDraft(draftInput({ problemKeys: ["900-A"] })), "TRAINING_PROBLEM_UNAVAILABLE");
  for (const durationSeconds of [59, 86401, NaN, 60.5]) await rejectsCode(f.service.saveDraft(draftInput({ durationSeconds })), "TRAINING_INVALID_DURATION");
  f.context({ problems });
  await rejectsCode(f.service.saveDraft(draftInput()), "TRAINING_NO_ACCOUNT");
  assert.throws(() => sanitizeTrainingStore({ version: 2, sessions: [] }), (error) => error.code === "TRAINING_STORE_VERSION");
  assert.deepEqual(sanitizeTrainingStore(null), { version: 1, importEpoch: "", sessions: [] });
});

test("submission matching uses single PRACTICE account, complete problem ID and inclusive absolute time window", async () => {
  const f = fixture();
  const id = await running(f);
  const session = f.read().sessions[0];
  assert.equal(isTrainingSubmission(submission(1, 1000), session), true);
  assert.equal(isTrainingSubmission(submission(2, 1120), session), true);
  for (const candidate of [submission(3, 999), submission(4, 1121),
    submission(5, 1001, "OK", { problem: { contestId: 300, index: "A" } }),
    submission(6, 1001, "OK", { author: { participantType: "PRACTICE", members: [{ handle: "Other" }] } }),
    submission(7, 1001, "OK", { author: { participantType: "PRACTICE", members: [{ handle: "Fixture" }, { handle: "Other" }] } }),
    submission(8, 1001, "OK", { author: { participantType: "PRACTICE", teamId: 42, members: [{ handle: "Fixture" }] } }),
    submission(9, 1001, "OK", { author: { participantType: "PRACTICE", ghost: true, members: [{ handle: "Fixture" }] } }),
    submission(20, 1001, "OK", { author: { participantType: "PRACTICE", teamName: "Team", members: [{ handle: "Fixture" }] } }),
    ...["VIRTUAL", "CONTESTANT", "OUT_OF_COMPETITION", "MANAGER"].map((participantType, index) => submission(10 + index, 1001, "OK", { author: { participantType, members: [{ handle: "Fixture" }] } })),
  ]) assert.equal(isTrainingSubmission(candidate, session), false, JSON.stringify(candidate));
  assert.equal(isTrainingSubmission(submission(20, 1001, "OK", { author: { participantType: "PRACTICE", members: [{ handle: "fixture" }] } }), session), true);
  f.fetcher(async () => [submission(1, 1000), submission(2, 1120)]);
  assert.equal(summarizeTrainingSession((await f.service.sync(id)).sessions[0]).firstAcSeconds, 0);
});

test("summary separates pending/error/AC, earliest elapsed AC, and repeated verdict updates", async () => {
  const f = fixture();
  await running(f);
  const session = f.read().sessions[0];
  const initial = [submission(1, 1010, "WRONG_ANSWER"), submission(2, 1020, "TESTING"),
    submission(3, 1030, "COMPILATION_ERROR", { problem: { contestId: 200, index: "A" } }),
    submission(4, 1040, undefined, { problem: { contestId: 100, index: "B" }, verdict: undefined }),
  ];
  session.submissions = mergeTrainingSubmissions(session, [...initial, initial[0]]);
  assert.equal(session.submissions.length, 4);
  let summary = summarizeTrainingSession(session);
  assert.deepEqual(summary.problems.map((problem) => problem.status), ["pending", "wrong", "pending"]);
  assert.equal(summary.pending, 2);
  assert.equal(summary.firstAcSeconds, null);
  session.submissions = mergeTrainingSubmissions(session, [submission(2, 1020, "OK"), submission(5, 1050, "WRONG_ANSWER")]);
  summary = summarizeTrainingSession(session);
  assert.equal(summary.solved, 1);
  assert.equal(summary.firstAcSeconds, 20);
  assert.equal(summary.problems[0].firstAcSeconds, 20);
  assert.equal(summary.problems[0].attempts, 3);
  assert.equal(summary.wrongAttempts, 3);
  assert.equal(summary.pending, 1);
});

test("start and double Save are idempotent, only one session runs, started settings lock", async () => {
  const f = fixture();
  await Promise.all([f.service.saveDraft(draftInput()), f.service.saveDraft(draftInput())]);
  assert.equal(f.read().sessions.length, 1);
  const id = f.read().sessions[0].id;
  await Promise.all([f.service.start(id), f.service.start(id)]);
  assert.equal(f.read().sessions[0].startTimeSeconds, 1000);
  await rejectsCode(f.service.saveDraft(draftInput({ id, title: "Mutated" })), "TRAINING_SESSION_LOCKED");
  const second = await f.service.saveDraft(draftInput({ title: "Another" }));
  await rejectsCode(f.service.start(second.sessions[0].id), "TRAINING_ALREADY_RUNNING");
});

test("start refreshes prior records from current cache without changing problem snapshots", async () => {
  const f = fixture();
  const saved = await f.service.saveDraft(draftInput());
  const id = saved.sessions[0].id;
  f.time(1010);
  const context = f.getContext();
  context.problems[0].name = "Changed catalog";
  context.submissions = [submission(1, 1005), submission(2, 1010)];
  f.context(context);
  const session = (await f.service.start(id)).sessions[0];
  assert.equal(session.problems[0].name, "Alpha");
  assert.equal(session.problems[0].priorAccepted, true);
  assert.equal(session.problems[0].priorAttempts, 1);
});

test("independent tag/rating visibility persists for all four combinations across save, restart, start and finish", async () => {
  for (const hideTags of [false, true]) {
    for (const hideRating of [false, true]) {
      const f = fixture();
      const expected = { hideTags, hideRating };
      const verify = (store, status, phase) => {
        const session = store.sessions[0];
        assert.deepEqual({ hideTags: session.hideTags, hideRating: session.hideRating }, expected,
          `${phase}: tags=${hideTags}, rating=${hideRating}`);
        assert.equal(session.status, status);
      };
      const saved = await f.service.saveDraft(draftInput(expected));
      const id = saved.sessions[0].id;
      verify(saved, "draft", "save response");
      verify(f.read(), "draft", "persistent draft");
      const afterDraftRestart = createTrainingSessionController(f.io);
      verify(await afterDraftRestart.get(), "draft", "restart draft");
      verify(await afterDraftRestart.start(id), "running", "start response");
      verify(f.read(), "running", "persistent running session");
      const afterStartRestart = createTrainingSessionController(f.io);
      verify(await afterStartRestart.get(), "running", "restart running session");
      f.time(1040);
      verify(await afterStartRestart.finish(id), "finished", "finish response");
      verify(f.read(), "finished", "persistent finished session");
      const afterFinishRestart = createTrainingSessionController(f.io);
      verify(await afterFinishRestart.get(), "finished", "restart finished session");
    }
  }
});

test("nullable timestamps survive cancel draft, restart and refuse sync", async () => {
  const f = fixture();
  const saved = await f.service.saveDraft(draftInput());
  const cancelled = await f.service.cancel(saved.sessions[0].id);
  const reloaded = sanitizeTrainingStore(clone(cancelled)).sessions[0];
  assert.equal(reloaded.startTimeSeconds, null);
  assert.equal(reloaded.endTimeSeconds, null);
  assert.equal(reloaded.lastSyncAtSeconds, null);
  await rejectsCode(f.service.sync(reloaded.id), "TRAINING_NOT_STARTED");
  assert.equal(summarizeTrainingSession(reloaded).firstAcSeconds, null);
});

test("finish/cancel clip the time window, and repeated actions retain original cutoffs", async () => {
  const f = fixture();
  const id = await running(f);
  f.time(1040);
  assert.equal((await f.service.finish(id)).sessions[0].endTimeSeconds, 1040);
  f.time(1070);
  assert.equal((await f.service.finish(id)).sessions[0].endTimeSeconds, 1040);
  assert.equal((await f.service.cancel(id)).sessions[0].status, "finished");
  const second = (await f.service.saveDraft(draftInput({ title: "Cancel" }))).sessions[0].id;
  await f.service.start(second);
  f.time(1080);
  await f.service.cancel(second);
  f.time(1090);
  assert.equal((await f.service.cancel(second)).sessions[0].endTimeSeconds, 1080);
  assert.equal((await f.service.finish(second)).sessions[0].status, "cancelled");
});

test("running sessions restore across controller restart and expire at their original deadline", async () => {
  const f = fixture();
  const id = await running(f);
  const restarted = createTrainingSessionController(f.io);
  f.time(1119);
  assert.equal((await restarted.get()).sessions[0].status, "running");
  f.time(5000);
  const ended = (await restarted.get()).sessions[0];
  assert.equal(ended.status, "finished");
  assert.equal(ended.endTimeSeconds, 1120);
  assert.equal((await restarted.finish(id)).sessions[0].endTimeSeconds, 1120);
});

test("account switch permits historical get but refuses start/edit/sync, including during HTTP", async () => {
  const f = fixture();
  const saved = await f.service.saveDraft(draftInput());
  const id = saved.sessions[0].id;
  f.context({ ...f.getContext(), handle: "Other" });
  assert.equal((await f.service.get()).sessions[0].handle, "Fixture");
  await rejectsCode(f.service.start(id), "TRAINING_ACCOUNT_MISMATCH");
  await rejectsCode(f.service.saveDraft(draftInput({ id })), "TRAINING_ACCOUNT_MISMATCH");
  f.context({ ...f.getContext(), handle: "Fixture" });
  await f.service.start(id);
  const started = deferred();
  const response = deferred();
  f.fetcher(async () => { started.resolve(); return response.promise; });
  const sync = f.service.sync(id);
  await started.promise;
  f.context({ ...f.getContext(), handle: "Other" });
  response.resolve([submission(1, 1010)]);
  await rejectsCode(sync, "TRAINING_ACCOUNT_MISMATCH");
  assert.equal(f.read().sessions[0].submissions.length, 0);
  await rejectsCode(f.service.sync(id), "TRAINING_ACCOUNT_MISMATCH");
});

test("existing draft account verification and rebuild share exactly one cache read", async () => {
  const f = fixture();
  const saved = await f.service.saveDraft(draftInput());
  let reads = 0;
  const context = f.getContext();
  const service = createTrainingSessionController({ ...f.io, loadContext: async () => {
    reads += 1;
    return { ...context, handle: reads === 1 ? "Fixture" : "Other" };
  } });
  const updated = await service.saveDraft(draftInput({ id: saved.sessions[0].id, title: "Edited" }));
  assert.equal(reads, 1);
  assert.equal(updated.sessions[0].handle, "Fixture");
});

test("sync pagination reads back to session start, refreshes known IDs, deduplicates page overlap", async () => {
  const f = fixture({ pageSize: 2 });
  const id = await running(f);
  const calls = [];
  f.fetcher(async (endpoint) => {
    calls.push(endpoint);
    const from = Number(new URLSearchParams(endpoint.split("?")[1]).get("from"));
    return from === 1 ? [submission(3, 1110), submission(2, 1050, "TESTING")]
      : from === 3 ? [submission(2, 1050, "OK"), submission(1, 1020, "WRONG_ANSWER")]
        : [submission(10, 999), submission(11, 998)];
  });
  const result = await f.service.sync(id);
  assert.equal(calls.length, 3);
  assert.deepEqual(result.sessions[0].submissions.map((entry) => entry.id), [1, 2, 3]);
  assert.equal(result.sessions[0].submissions[1].verdict, "OK");
  assert.equal(result.sessions[0].lastSyncAtSeconds, 1000);
});

test("failed sync persists error without dropping submissions, and retry updates late verdict after deadline", async () => {
  const f = fixture();
  const id = await running(f);
  f.fetcher(async () => [submission(1, 1119, "TESTING")]);
  await f.service.sync(id);
  f.time(1125);
  f.fetcher(async () => { throw new Error("offline"); });
  const failed = (await f.service.sync(id)).sessions[0];
  assert.equal(failed.status, "finished");
  assert.equal(failed.syncError, "offline");
  assert.equal(failed.submissions.length, 1);
  assert.equal(failed.lastSyncAtSeconds, 1000);
  f.fetcher(async () => [submission(1, 1119, "OK"), submission(2, 1121, "OK", { problem: { contestId: 200, index: "A" } })]);
  const recovered = (await f.service.sync(id)).sessions[0];
  assert.equal(recovered.syncError, null);
  assert.equal(recovered.lastSyncAtSeconds, 1125);
  assert.equal(summarizeTrainingSession(recovered).firstAcSeconds, 119);
  assert.equal(summarizeTrainingSession(recovered).solved, 1);
});

test("HTTP does not hold mutation lock; a racing finish filters fetched results using latest cutoff", async () => {
  const f = fixture();
  const id = await running(f);
  const started = deferred();
  const response = deferred();
  f.fetcher(async () => { started.resolve(); return response.promise; });
  const sync = f.service.sync(id);
  await started.promise;
  f.time(1020);
  const finished = await f.service.finish(id);
  assert.equal(finished.sessions[0].endTimeSeconds, 1020);
  response.resolve([submission(1, 1019), submission(2, 1021, "OK", { problem: { contestId: 200, index: "A" } })]);
  const result = await sync;
  assert.equal(result.sessions[0].status, "finished");
  assert.deepEqual(result.sessions[0].submissions.map((entry) => entry.id), [1]);
});

test("racing cancellation clips fetched results and cancelled sessions can resolve pending verdicts", async () => {
  const f = fixture();
  const id = await running(f);
  const started = deferred();
  const response = deferred();
  f.fetcher(async () => { started.resolve(); return response.promise; });
  const sync = f.service.sync(id);
  await started.promise;
  f.time(1020);
  await f.service.cancel(id);
  response.resolve([submission(1, 1020, "TESTING"), submission(2, 1021)]);
  assert.equal((await sync).sessions[0].submissions.length, 1);
  f.fetcher(async () => [submission(1, 1020, "OK")]);
  const updated = (await f.service.sync(id)).sessions[0];
  assert.equal(updated.status, "cancelled");
  assert.equal(summarizeTrainingSession(updated).solved, 1);
});

test("concurrent duplicate syncs coalesce into a single fetch", async () => {
  const f = fixture();
  const id = await running(f);
  let requests = 0;
  const started = deferred();
  const response = deferred();
  f.fetcher(async () => { requests += 1; started.resolve(); return response.promise; });
  const first = f.service.sync(id);
  const second = f.service.sync(id);
  await started.promise;
  response.resolve([submission(1, 1010)]);
  assert.deepEqual(await first, await second);
  assert.equal(requests, 1);
});

test("atomic imported store replacement invalidates old in-flight HTTP even for same session ID", async () => {
  const f = fixture();
  const id = await running(f);
  const started = deferred();
  const response = deferred();
  f.fetcher(async () => { started.resolve(); return response.promise; });
  const sync = f.service.sync(id);
  await started.promise;
  const replacement = f.read();
  replacement.sessions[0].title = "Imported";
  await f.service.replaceStore(replacement);
  response.resolve([submission(1, 1010)]);
  const final = (await sync).sessions[0];
  assert.equal(final.title, "Imported");
  assert.equal(final.submissions.length, 0);
  assert.equal(final.lastSyncAtSeconds, null);
});

test("persistent import epoch invalidates sync across independent browser controllers/tabs", async () => {
  const f = fixture();
  const id = await running(f);
  const anotherTab = createTrainingSessionController(f.io);
  const started = deferred();
  const response = deferred();
  f.fetcher(async () => { started.resolve(); return response.promise; });
  const sync = f.service.sync(id);
  await started.promise;
  const replacement = f.read();
  replacement.sessions[0].title = "Imported in another tab";
  const replaced = await anotherTab.replaceStore(replacement);
  assert.notEqual(replaced.importEpoch, replacement.importEpoch);
  response.resolve([submission(1, 1010)]);
  const final = await sync;
  assert.equal(final.importEpoch, replaced.importEpoch);
  assert.equal(final.sessions[0].title, "Imported in another tab");
  assert.equal(final.sessions[0].submissions.length, 0);
  assert.equal(final.sessions[0].lastSyncAtSeconds, null);
  // Clearing the store from a separate tab similarly cannot recreate old IDs.
  const nextStarted = deferred();
  const nextResponse = deferred();
  f.fetcher(async () => { nextStarted.resolve(); return nextResponse.promise; });
  const nextSync = f.service.sync(id);
  await nextStarted.promise;
  await anotherTab.replaceStore({ version: 1, sessions: [] });
  nextResponse.resolve([submission(2, 1011)]);
  assert.equal((await nextSync).sessions.length, 0);
});

test("oversized/unusable API histories surface sync errors and never persist partial results", async () => {
  const f = fixture({ pageSize: 1, maxPages: 2 });
  const id = await running(f);
  f.fetcher(async () => [submission(1, 1010)]);
  const limited = (await f.service.sync(id)).sessions[0];
  assert.match(limited.syncError, /too large/);
  assert.equal(limited.submissions.length, 0);
  f.fetcher(async () => ({ status: "OK" }));
  assert.match((await f.service.sync(id)).sessions[0].syncError, /invalid submission list/);
});

test("persistence failures propagate without poisoning the mutation queue", async () => {
  let fail = true;
  const f = fixture();
  const service = createTrainingSessionController({ ...f.io, writeStore: async (store) => {
    if (fail) { fail = false; throw new Error("disk full"); }
    return f.io.writeStore(store);
  } });
  await assert.rejects(service.saveDraft(draftInput()), /disk full/);
  assert.equal(f.read().sessions.length, 0);
  assert.equal((await service.saveDraft(draftInput())).sessions.length, 1);
});

test("Electron service delegates the full contract to the same core with persistent UUID IDs", async () => {
  const f = fixture();
  const service = createCustomTrainingService(f.io);
  const saved = await service.saveDraft(draftInput());
  const id = saved.sessions[0].id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  await service.start(id);
  await service.sync(id);
  await service.finish(id);
  assert.equal((await service.get()).sessions[0].status, "finished");
  const empty = await service.replaceStore({ version: 1, sessions: [] });
  assert.equal(empty.version, 1);
  assert.equal(empty.sessions.length, 0);
  assert.match(empty.importEpoch, /^[0-9a-f-]{36}$/);
});
