import assert from "node:assert/strict";
import { test, after } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => server.close());
const entries = new Map();
globalThis.window = {};
globalThis.localStorage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
const api = await server.ssrLoadModule("/src/lib/custom-training.js");
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; delete globalThis.window; delete globalThis.localStorage; });

test("browser adapter persists independent store, locks draft after start, resolves submissions and imports", async () => {
  entries.set("cf-compass-cache-v1", JSON.stringify({ handle: "Fixture", problems: [{ contestId: 100, index: "A", name: "Alpha", tags: ["dp"] }], submissions: [] }));
  const saved = await api.saveTrainingDraft({ title: "Browser", problemKeys: ["100-A"], durationSeconds: 60, hideTags: true, hideRating: true });
  const id = saved.sessions[0].id;
  assert.equal(entries.has(api.CUSTOM_TRAINING_STORAGE_KEY), true);
  const started = (await api.startTrainingSession(id)).sessions[0];
  let requested;
  globalThis.fetch = async (url) => {
    requested = url;
    return { url, ok: true, json: async () => ({ status: "OK", result: [{ id: 1, creationTimeSeconds: started.startTimeSeconds,
      problem: { contestId: 100, index: "A" }, author: { participantType: "PRACTICE", members: [{ handle: "Fixture" }] }, verdict: "OK" }] }) };
  };
  const synced = (await api.syncTrainingSession(id)).sessions[0];
  assert.match(requested, /^https:\/\/codeforces.com\/api\/user.status\?handle=Fixture/);
  assert.equal(api.summarizeTrainingSession(synced).firstAcSeconds, 0);
  assert.equal((await api.finishTrainingSession(id)).sessions[0].status, "finished");
  assert.equal((await api.getTrainingSessions()).sessions[0].submissions.length, 1);
  const empty = await api.replaceTrainingSessions({ version: 1, sessions: [] });
  assert.equal(empty.version, 1);
  assert.equal(empty.sessions.length, 0);
  assert.match(empty.importEpoch, /^[0-9a-f-]{36}$/);
});

test("desktop adapter routes each method through the bridge without browser persistence fallback", async () => {
  const calls = [];
  const result = { version: 1, sessions: [] };
  window.cfBridge = Object.fromEntries(["getTrainingSessions", "saveTrainingDraft", "startTrainingSession", "finishTrainingSession", "cancelTrainingSession", "syncTrainingSession"].map((name) =>
    [name, async (...args) => { calls.push([name, args]); return result; }]));
  const before = entries.get(api.CUSTOM_TRAINING_STORAGE_KEY);
  assert.deepEqual(await api.getTrainingSessions(), result);
  await api.saveTrainingDraft({ title: "Desktop" });
  await api.startTrainingSession("id");
  await api.finishTrainingSession("id");
  await api.cancelTrainingSession("id");
  await api.syncTrainingSession("id");
  assert.equal(calls.length, 6);
  assert.deepEqual(calls[1], ["saveTrainingDraft", [{ title: "Desktop" }]]);
  assert.equal(entries.get(api.CUSTOM_TRAINING_STORAGE_KEY), before);
  await assert.rejects(api.replaceTrainingSessions(result), (error) => error.code === "TRAINING_BRIDGE_UNAVAILABLE");
  window.cfBridge = undefined;
});
