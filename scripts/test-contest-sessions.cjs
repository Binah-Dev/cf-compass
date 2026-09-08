const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sessions = require("../electron/services/contest-session.cjs");
const { buildContestContext, selectSourceCandidates } = require("../electron/services/ai-service.cjs");
const { start, virtualOne, virtualTwo, makeFixture, submission, makeProblem } = require("./fixtures/contest-sessions.cjs");
const classify = () => ({ label: "Div.2" });
const merged = (fixture, previous = {}) => sessions.mergeSessions(fixture.cache, previous, fixture.center, classify, 4);
const firstVirtual = (replay) => sessions.findReplayEntry(replay.contests, `1900:virtual:${virtualOne}`);

test("empty rating history still discovers formal and two separate virtual sessions", () => {
  const replay = merged(makeFixture());
  assert.equal(replay.contests.length, 3);
  assert.equal(replay.contests.filter((entry) => entry.participationType === "VIRTUAL").length, 2);
  assert.equal(firstVirtual(replay).dateSeconds, virtualOne);
  assert.equal(firstVirtual(replay).performance, null);
  assert.equal(firstVirtual(replay).oldRating, null);
  assert.equal(firstVirtual(replay).officialRank, null);
  assert.equal(replay.contests.every((entry) => entry.status === "ready"), true);
});
test("first AC is earliest, practice and out-of-window submissions excluded", () => {
  const entry = firstVirtual(merged(makeFixture()));
  assert.equal(entry.problems[0].firstAcTimeSeconds, 120);
  assert.equal(entry.problems[0].contestAttempts, 3);
  assert.equal(entry.problems[1].contestResult, "attempted");
  assert.equal(entry.problems[1].currentStatus, "outside-session-ac");
  assert.equal(entry.problems[3].contestAttempts, 0);
  assert.deepEqual(entry.timeline.map((event) => event.id), [2, 3, 4, 5]);
});
test("repeated virtual session does not inherit earlier session AC", () => {
  const entry = sessions.findReplayEntry(merged(makeFixture()).contests, `1900:virtual:${virtualTwo}`);
  assert.equal(entry.solved, 0);
  assert.equal(entry.problems[0].currentStatus, "pre-solved");
  assert.equal(entry.problems[2].contestAttempts, 2);
  assert.equal(entry.problems[2].rejectedAttempts, 1);
});
test("zero-second AC and exact contest boundary are preserved", () => {
  const problem = makeProblem(1900, "A");
  const contest = { contestId: 1900, participationType: "VIRTUAL", sessionStartTimeSeconds: virtualOne, durationSeconds: 7200 };
  const atZero = submission(20, "VIRTUAL", virtualOne, 0, "OK");
  assert.equal(sessions.summarizeProblem(problem, contest, [atZero]).firstAcTimeSeconds, 0);
  assert.equal(sessions.isSessionSubmission(submission(21, "VIRTUAL", virtualOne, 7200, "OK"), contest), true);
  assert.equal(sessions.isSessionSubmission(submission(22, "VIRTUAL", virtualOne, 7201, "OK"), contest), false);
  assert.equal(sessions.isSessionSubmission(submission(23, "VIRTUAL", virtualOne, -1, "OK"), contest), false);
});
test("virtual start fallback is validated and unknown timestamps are not guessed", () => {
  const event = submission(50, "VIRTUAL", virtualOne, 500, "OK");
  delete event.author.startTimeSeconds;
  assert.equal(sessions.virtualStart(event), virtualOne);
  delete event.relativeTimeSeconds;
  assert.equal(sessions.virtualStart(event), null);
  const fixture = makeFixture();
  fixture.cache.submissions = [event];
  assert.equal(merged(fixture).contests.length, 0);
});
test("submission changes refresh local results and an account switch does not reuse replay", () => {
  const fixture = makeFixture();
  const previous = merged(fixture);
  fixture.cache.submissions.unshift(submission(40, "VIRTUAL", virtualTwo, 500, "OK", "C"));
  const changed = merged(fixture, previous);
  assert.equal(sessions.findReplayEntry(changed.contests, `1900:virtual:${virtualTwo}`).solved, 1);
  fixture.cache.handle = "another_handle";
  fixture.cache.submissions = [];
  assert.equal(merged(fixture, changed).contests.length, 0);
});
test("legacy rated replay identity and actual rating metrics survive migration", () => {
  const fixture = makeFixture();
  fixture.cache.ratingHistory = [{ contestId: 1900, contestName: "Rated", oldRating: 1400, newRating: 1500, rank: 100, ratingUpdateTimeSeconds: start + 7500 }];
  const previous = { version: 3, handle: fixture.cache.handle, contests: [{ contestId: 1900, status: "ready", performance: 1600, participants: 1000, problems: fixture.cache.problems, startTimeSeconds: start, durationSeconds: 7200 }] };
  const replay = merged(fixture, previous);
  const rated = sessions.findReplayEntry(replay.contests, 1900);
  assert.equal(rated.replayId, "1900");
  assert.equal(rated.rated, true);
  assert.equal(rated.ratingDelta, 100);
  assert.equal(rated.performance, 1600);
  assert.equal(rated.solved, 1);
  assert.equal(replay.contests.length, 3);
});
test("AI context and source candidates use the same exact session boundary", () => {
  const fixture = makeFixture();
  const contest = firstVirtual(merged(fixture));
  const context = buildContestContext({ contest, cache: fixture.cache, study: fixture.study });
  assert.deepEqual(context.timeline.map((event) => event.submissionId), [2, 3, 4, 5]);
  assert.deepEqual(selectSourceCandidates(fixture.cache, contest).map((event) => event.id), [2, 3, 4, 5]);
  assert.equal(context.contest.replayId, contest.replayId);
  assert.equal(context.contest.ratingDelta, null);
  assert.equal(context.contest.performance, null);
});
test("non-virtual submission identities remain separate", () => {
  const fixture = makeFixture();
  fixture.cache.submissions.push(submission(30, "OUT_OF_COMPETITION", start, 100, "OK", "C"));
  fixture.cache.submissions.push(submission(31, "MANAGER", start, 100, "OK", "D"));
  const replay = merged(fixture);
  assert.equal(replay.contests.length, 4);
  const unofficial = sessions.findReplayEntry(replay.contests, "1900:unofficial");
  assert.equal(unofficial.solved, 1);
  assert.equal(unofficial.problems[0].contestAttempts, 0);
});
test("queue stores detail-only problems, deduplicates, and survives empty metadata", async () => {
  const { updateContestQueue, buildContestQueue } = await import("../src/lib/contest-queue.js");
  const fixture = makeFixture();
  const problems = fixture.center.details[1901].problems;
  const study = updateContestQueue(fixture.study, problems);
  assert.equal(study.contestQueue.length, 2);
  assert.equal(updateContestQueue(study, problems).contestQueue.length, 2);
  const entries = buildContestQueue(JSON.parse(JSON.stringify(study)), {}, {});
  assert.equal(entries[0].problem.name, problems[0].name);
  assert.equal(entries[0].metadataMissing, false);
  assert.equal(entries[0].solved, false);
});
test("legacy queue keys are visible even without any problem cache", async () => {
  const { buildContestQueue } = await import("../src/lib/contest-queue.js");
  const entries = buildContestQueue({ contestQueue: ["1901-A", "1901-A", "corrupted-key"] }, {}, {});
  assert.equal(entries.length, 2);
  assert.equal(entries[0].canOpen, true);
  assert.equal(entries[0].metadataMissing, true);
  assert.equal(entries[1].canOpen, false);
});
test("completion is derived without deleting keys; removal prunes snapshot only", async () => {
  const { updateContestQueue, buildContestQueue } = await import("../src/lib/contest-queue.js");
  const fixture = makeFixture();
  const study = updateContestQueue({ ...fixture.study, notes: { keep: { content: "preserve" } } }, fixture.cache.problems);
  const entries = buildContestQueue(study, fixture.cache, fixture.center);
  assert.equal(entries.filter((entry) => entry.solved).length, 3);
  assert.equal(study.contestQueue.length, 4);
  const removed = updateContestQueue(study, [], ["1900-A"]);
  assert.equal(removed.contestQueueProblems["1900-A"], undefined);
  assert.equal(removed.notes.keep.content, "preserve");
});
test("queue limit preserves existing entries and rejects malformed additions", async () => {
  const { updateContestQueue } = await import("../src/lib/contest-queue.js");
  const original = Array.from({ length: 1000 }, (_, i) => `${i + 1}-A`);
  const study = updateContestQueue({ contestQueue: original }, [makeProblem(5000, "A"), makeProblem(1, "../")]);
  assert.deepEqual(study.contestQueue, original);
});
function mainHarness(fixture, options = {}) {
  const main = fs.readFileSync(path.join(__dirname, "../electron/main.cjs"), "utf8");
  const source = main.slice(main.indexOf("function contestReplayResponse("), main.indexOf("\nfunction startContestReplayAutoCalculation("));
  const files = { "cache.json": structuredClone(fixture.cache), "contest-center.json": structuredClone(fixture.center), "contest-replay.json": options.previous || { handle: fixture.cache.handle, version: 4, contests: [] } };
  const requests = [];
  const context = {
    ...require('../electron/services/codeforces-standings.cjs'),
    ...sessions, console, CONTEST_REPLAY_VERSION: 4, CONTEST_AUTO_RETRY_LIMIT: 2, contestCalculationTasks: new Map(),
    classifyContestName: classify, emptyContestReplay: (handle) => ({ handle, version: 4, contests: [] }),
    contestReplayResponse: (value) => value,
    estimateVirtualReference: require("../electron/services/virtual-reference.cjs").estimateVirtualReference,
    readJson: async (file, fallback) => structuredClone(files[file] || fallback),
    writeJson: async (file, value) => { await new Promise((resolve) => setTimeout(resolve, 2)); files[file] = structuredClone(value); },
    fetchCodeforces: async (endpoint) => {
      requests.push(endpoint);
      if (options.onFetch) {
        const response = await options.onFetch(files, endpoint);
        if (response !== undefined) return response;
      }
      return { contest: fixture.center.contests[0], problems: fixture.center.details[1900].problems, rows: [] };
    },
  };
  vm.createContext(context);
  vm.runInContext(source + "\nthis.api = { refreshContestReplayIndex, calculateContestReplay, calculateNextContestReplay, needsAutomaticVirtualReference };", context);
  return { ...context.api, files, requests };
}
test("virtual session metadata requests exactly the public standings contract", async () => {
  const fixture = makeFixture();
  fixture.cache.submissions = fixture.cache.submissions.filter((s) => s.author.participantType !== "CONTESTANT");
  const h = mainHarness(fixture);
  h.files["contest-center.json"] = {};
  await h.calculateContestReplay(`1900:virtual:${virtualOne}`);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0], 'contest.standings?contestId=1900');
  const entry = firstVirtual(h.files["contest-replay.json"]);
  assert.equal(entry.status, "ready");
  assert.equal(entry.solved, 1);
});

test("automatic replay prepares problems without requesting estimated performance", async () => {
  const fixture = require("./fixtures/virtual-reference.cjs").makeReferenceFixture();
  const h = mainHarness(fixture, { onFetch: async (_files, endpoint) =>
    endpoint.startsWith("contest.ratingChanges") ? fixture.ratingChanges : fixture.standings });
  let replay = await h.refreshContestReplayIndex();
  assert.equal(replay.progress.referencePending, 0);
  for (let step = 0; step < 3 && replay.progress.autoRemaining; step++) replay = await h.calculateNextContestReplay();
  const virtual = sessions.findReplayEntry(replay.contests, `1900:virtual:${virtualTwo}`);
  assert.equal(virtual.virtualReference == null, true);
  assert.equal(virtual.performance, null);
  assert.equal(virtual.ratingDelta, null);
  assert.equal(replay.progress.autoRemaining, 0);
  const count = h.requests.length;
  await h.calculateNextContestReplay();
  assert.equal(h.requests.length, count, "cached success or unavailable must not create a polling request loop");
});

test("cached virtual problems remain usable offline without any estimate requests", async () => {
  const fixture = makeFixture();
  const h = mainHarness(fixture, { onFetch: async () => { throw Error("fixture offline"); } });
  const replay = await h.refreshContestReplayIndex();
  const virtual = firstVirtual(replay);
  assert.equal(h.needsAutomaticVirtualReference({ ...virtual, sessionStartTimeSeconds: Date.now() / 1000 }), false);
  assert.equal(h.needsAutomaticVirtualReference({ ...virtual, durationSeconds: null }), false);
  await h.calculateNextContestReplay();
  const final = await h.calculateNextContestReplay();
  assert.equal(final.progress.referencePending, 0);
  assert.equal(final.contests.filter((entry) => entry.virtualReference).length, 0);
  assert.equal(final.contests.every((entry) => entry.status === 'ready'), true);
  assert.equal(h.requests.length, 0);
  const count = h.requests.length;
  await h.calculateNextContestReplay();
  assert.equal(h.requests.length, count);
});
test("concurrent calculation and refresh never overwrite the other session", async () => {
  const fixture = makeFixture();
  fixture.cache.submissions = fixture.cache.submissions.filter((s) => s.author.participantType !== "CONTESTANT");
  const h = mainHarness(fixture);
  h.files["contest-center.json"] = {};
  await Promise.all([
    h.calculateContestReplay(`1900:virtual:${virtualOne}`),
    h.calculateContestReplay(`1900:virtual:${virtualTwo}`),
    h.refreshContestReplayIndex(),
  ]);
  assert.equal(h.files["contest-replay.json"].contests.length, 2);
  assert.equal(h.files["contest-replay.json"].contests.every((entry) => entry.status === "ready"), true);
});
test("network failure remains retryable and explicit retry recovers", async () => {
  const fixture = makeFixture();
  let failing = true;
  const h = mainHarness(fixture, { onFetch: async () => { if (failing) throw Error("fixture offline"); } });
  h.files["contest-center.json"] = {};
  const failed = await h.calculateContestReplay(`1900:virtual:${virtualOne}`);
  assert.equal(firstVirtual(failed).status, "error");
  assert.equal(firstVirtual(failed).retryCount, 1);
  failing = false;
  const recovered = await h.calculateContestReplay(`1900:virtual:${virtualOne}`, true);
  assert.equal(firstVirtual(recovered).status, "ready");
  assert.equal(firstVirtual(recovered).retryCount, 0);
});
test("in-flight old account result cannot overwrite new account", async () => {
  const fixture = makeFixture();
  const h = mainHarness(fixture, { onFetch: async (files) => {
    files["cache.json"] = { ...fixture.cache, handle: "different", ratingHistory: [], submissions: [] };
    await h.refreshContestReplayIndex();
  } });
  h.files["contest-center.json"] = {};
  await h.calculateContestReplay(`1900:virtual:${virtualOne}`);
  assert.equal(h.files["contest-replay.json"].handle, "different");
  assert.equal(h.files["contest-replay.json"].contests.length, 0);
});
test("interrupted calculating entries become pending after restart", async () => {
  const fixture = makeFixture();
  const replay = merged(fixture);
  for (const entry of replay.contests) { entry.status = "calculating"; delete entry.problems; delete entry.durationSeconds; }
  const h = mainHarness(fixture, { previous: replay });
  h.files["contest-center.json"] = {};
  const index = await h.refreshContestReplayIndex();
  assert.equal(index.contests.every((entry) => entry.status === "pending"), true);
});

test("unrated to rated promotion schedules official calculation instead of preserving a null score", () => {
  const fixture = makeFixture();
  const previous = merged(fixture);
  fixture.cache.ratingHistory = [{ contestId: 1900, contestName: "Newly rated", oldRating: 1400, newRating: 1500, rank: 100, ratingUpdateTimeSeconds: start + 8000 }];
  const replay = merged(fixture, previous);
  const official = sessions.findReplayEntry(replay.contests, 1900);
  assert.equal(official.rated, true);
  assert.equal(official.status, "pending");
});
test("rating identity is never inferred from another user's equal rating and rank", async () => {
  const fixture = makeFixture();
  fixture.cache.ratingHistory = [{ contestId: 1900, contestName: "Rated", oldRating: 1400, newRating: 1500, rank: 100, ratingUpdateTimeSeconds: start + 8000 }];
  const h = mainHarness(fixture, { onFetch: async (_files, endpoint) => endpoint.startsWith("contest.ratingChanges")
    ? [{ handle: "not_the_current_user", oldRating: 1400, newRating: 1500, rank: 100 }]
    : { contest: fixture.center.contests[0], rows: [], problems: fixture.cache.problems } });
  const replay = await h.calculateContestReplay(1900);
  const official = sessions.findReplayEntry(replay.contests, 1900);
  assert.equal(official.status, "error");
  assert.match(official.error, /定位当前用户/);
});
test("new submissions during calculation invalidate stale results", async () => {
  const fixture = makeFixture();
  const h = mainHarness(fixture, { onFetch: async (files) => {
    files["cache.json"].submissions.unshift(submission(120, "VIRTUAL", virtualTwo, 900, "OK", "C"));
    await h.refreshContestReplayIndex();
  } });
  h.files["contest-center.json"] = {};
  const replay = await h.calculateContestReplay(`1900:virtual:${virtualTwo}`);
  const entry = sessions.findReplayEntry(replay.contests, `1900:virtual:${virtualTwo}`);
  assert.equal(entry.status, "pending");
  assert.equal(entry.solved, undefined);
});
test("older valid replay backups remain importable", () => {
  const main = fs.readFileSync(path.join(__dirname, "../electron/main.cjs"), "utf8");
  const source = main.slice(main.indexOf("function validContestReplay("), main.indexOf("\nasync function appendActivity("));
  const context = { CONTEST_REPLAY_VERSION: 4 };
  vm.createContext(context);
  vm.runInContext(source, context);
  assert.equal(context.validContestReplay({ version: 3, contests: [] }), true);
  assert.equal(context.validContestReplay({ version: 99, contests: [] }), false);
  assert.equal(context.validContestReplay({ version: 4, contests: null }), false);
});
test("incremental sync refreshes a cached TESTING verdict without duplicating submissions", async () => {
  const main = fs.readFileSync(path.join(__dirname, "../electron/main.cjs"), "utf8");
  const source = main.slice(main.indexOf("async function fetchIncrementalSubmissions("), main.indexOf("\nasync function syncHandle("));
  const old = submission(80, "VIRTUAL", virtualOne, 500, "TESTING");
  const updated = { ...old, verdict: "OK" };
  const next = submission(81, "VIRTUAL", virtualOne, 600, "WRONG_ANSWER", "B");
  const context = {
    MAX_SUBMISSIONS: 10000, SUBMISSION_PAGE_SIZE: 1000, validCache: () => true,
    fetchCodeforces: async () => [next, updated],
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const result = await context.fetchIncrementalSubmissions("issue25_fixture", { handle: "issue25_fixture", submissions: [old] });
  assert.equal(result.newCount, 1);
  assert.equal(result.submissions.length, 2);
  assert.equal(result.submissions.find((entry) => entry.id === 80).verdict, "OK");
});

test("shared contest metadata completes other sessions without sharing their results", async () => {
  const fixture = makeFixture();
  fixture.cache.submissions = fixture.cache.submissions.filter((s) => s.author.participantType !== "CONTESTANT");
  const h = mainHarness(fixture);
  h.files["contest-center.json"] = {};
  await h.calculateContestReplay(`1900:virtual:${virtualOne}`);
  const refreshed = await h.refreshContestReplayIndex();
  const second = sessions.findReplayEntry(refreshed.contests, `1900:virtual:${virtualTwo}`);
  assert.equal(second.status, "ready");
  assert.equal(second.solved, 0);
  assert.equal(h.requests.length, 1);
});
test("atomic persistence keeps every concurrently observed document valid", async () => {
  const fsp = require("node:fs/promises");
  const { writeAtomicJson } = require("../electron/services/atomic-json.cjs");
  const base = path.join(__dirname, "..", "output", "playwright");
  await fsp.mkdir(base, { recursive: true });
  const directory = await fsp.mkdtemp(path.join(base, "atomic-"));
  const target = path.join(directory, "study.json");
  await writeAtomicJson(target, { index: -1, queue: [] });
  let complete = false;
  const writes = Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
    writeAtomicJson(target, { index, text: "x".repeat(10000) }))).finally(() => { complete = true; });
  let reads = 0;
  while (!complete) {
    JSON.parse(await fsp.readFile(target, "utf8"));
    reads += 1;
  }
  const results = await writes;
  assert.equal(results.every((result) => result.status === "fulfilled"), true);
  assert.ok(reads > 0);
  assert.equal(JSON.parse(await fsp.readFile(target, "utf8")).index, 19);
});
test("failed atomic replacement retains the old document and recoverable new file", async (t) => {
  const fsp = require("node:fs/promises");
  const { writeAtomicJson } = require("../electron/services/atomic-json.cjs");
  const base = path.join(__dirname, "..", "output", "playwright");
  await fsp.mkdir(base, { recursive: true });
  const directory = await fsp.mkdtemp(path.join(base, "atomic-failure-"));
  const target = path.join(directory, "study.json");
  await writeAtomicJson(target, { queue: ["1900-A"] });
  t.mock.method(fsp, "rename", async () => { throw new Error("simulated replacement failure"); });
  await assert.rejects(writeAtomicJson(target, { queue: ["1900-B"] }), /simulated replacement failure/);
  assert.deepEqual(JSON.parse(await fsp.readFile(target, "utf8")).queue, ["1900-A"]);
  const temporary = (await fsp.readdir(directory)).filter((name) => name.endsWith(".tmp"));
  assert.equal(temporary.length, 1);
  assert.deepEqual(JSON.parse(await fsp.readFile(path.join(directory, temporary[0]), "utf8")).queue, ["1900-B"]);
});
