import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test, after } from "node:test";
import { createServer } from "vite";
import { fetchCodeforcesResponse, codeforcesResult } from "../electron/shared/codeforces-transport.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const mainPath = path.join(root, "electron/main.cjs");
const mainSource = fs.readFileSync(mainPath, "utf8");
function section(source, start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert(first >= 0 && last > first);
  return source.slice(first, last);
}
// Execute exact final adapter bodies, without Electron startup, replacing only
// retry/queue waits. The desktop dynamic import uses the real packaged path.
const mainFunctions = section(mainSource, "async function fetchCodeforcesNow(", "\nfunction buildRatingStanding(");
function desktop() {
  const delays = [];
  const factory = new vm.Script(`(function(wait, API_MIN_INTERVAL_MS) {
    let apiQueue = Promise.resolve(), lastApiCallAt = 0;
    ${mainFunctions}; return { now: fetchCodeforcesNow, queued: fetchCodeforces };
  })`, { filename: mainPath, importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER }).runInThisContext();
  return { ...factory(async (ms) => delays.push(ms), 2100), delays };
}
function training() {
  const source = fs.readFileSync(path.join(root, "src/lib/custom-training.js"), "utf8");
  const code = section(source, "function fetchTrainingApi(", "\nfunction browserService(");
  const delays = [];
  const call = new Function("fetchCodeforcesResponse", "codeforcesResult", "wait", `
    const API_MIN_INTERVAL_MS = 2100;
    let apiQueue = Promise.resolve(), lastApiCallAt = 0;
    ${code}; return fetchTrainingApi;
  `)(fetchCodeforcesResponse, codeforcesResult, async (ms) => delays.push(ms));
  return { call, delays };
}
const withUrl = (response, url = "https://codeforces.com/api/user.info") => Object.defineProperty(response, "url", { value: url });
const success = (result = []) => withUrl(new Response(JSON.stringify({ status: "OK", result })));

// Vite SSR loads whole browser modules and their real imports. This checks
// adapter wiring/persistence, not real renderer networking, CSP or CORS.
const server = await createServer({ configFile: false, root, server: { middlewareMode: true, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => server.close());
const browser = await server.ssrLoadModule("/src/lib/codeforces.js");
const center = await server.ssrLoadModule("/src/lib/contest-center.js");
const custom = await server.ssrLoadModule("/src/lib/custom-training.js");

for (const kind of ["desktop", "training"]) {
  for (const [label, makeResponse, expected] of [
    ["unsafe redirect", () => kind === "desktop" ? new Response(null, { status: 302, headers: { Location: "https://evil.example" } }) : withUrl(new Response("{}"), "https://evil.example/sink"), 1],
    ["uninspectable response", () => ({ type: "opaqueredirect", status: 0, url: "", body: null }), 1],
    ["400", () => new Response('{"status":"FAILED","comment":"bad handle"}', { status: 400 }), 1],
    ["429", () => new Response('{}', { status: 429 }), 3],
    ["503", () => new Response('{}', { status: 503 }), 3],
    ["invalid JSON", () => new Response('<html>challenge</html>'), 3],
    ["missing result", () => new Response('{"status":"OK"}'), 3],
    ["API failure", () => new Response('{"status":"FAILED","comment":"fixture error"}'), 3],
    ["network failure", () => { throw new TypeError("fetch failed"); }, 3],
  ]) {
    test(`${kind} ${label}: ${expected} attempt(s), queue can recover`, async (t) => {
      let calls = 0, failing = true;
      t.mock.method(globalThis, "fetch", async (_url, options) => {
        calls += 1;
        assert.equal(options.redirect, kind === "desktop" ? "manual" : "follow");
        assert(options.signal instanceof AbortSignal);
        if (kind === "desktop") assert.equal(options.headers["User-Agent"], "CF-Compass/2.0");
        const response = failing ? makeResponse() : success(["recovered"]);
        if (kind === "training" && response instanceof Response && !response.url) withUrl(response);
        return response;
      });
      const adapter = kind === "desktop" ? desktop() : training();
      const call = kind === "desktop" ? adapter.queued : adapter.call;
      await assert.rejects(call("user.info?handles=Fixture"));
      assert.equal(calls, expected);
      if (kind === "desktop") assert.deepEqual(adapter.delays, expected === 3 ? [2100, 2100] : []);
      else assert.equal(adapter.delays.length, expected - 1);
      failing = false;
      assert.deepEqual(await call("user.info?handles=Fixture"), ["recovered"]);
      assert.equal(calls, expected + 1);
      assert(adapter.delays.at(-1) > 0 && adapter.delays.at(-1) <= 2100);
    });
  }
}

test("invalid endpoint never reaches fetch or retries in either queued adapter", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { assert.fail("must not fetch"); });
  for (const call of [desktop().queued, training().call]) await assert.rejects(call("../outside"), { code: "CF_API_ENDPOINT" });
});

test("desktop expected unpublished ratings are not retried and HTTP comment is retained", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return new Response('{"status":"FAILED","comment":"rating changes are unavailable"}', { status: 503 }); });
  await assert.rejects(desktop().now("contest.ratingChanges?contestId=1"), /Codeforces：rating changes are unavailable/);
  assert.equal(calls, 1);
});

test("desktop queue serializes callers even across a failure", async (t) => {
  let active = 0, peak = 0, calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1; active += 1; peak = Math.max(peak, active);
    await new Promise((resolve) => setImmediate(resolve)); active -= 1;
    return calls === 1 ? new Response(null, { status: 302 }) : success();
  });
  const { queued } = desktop();
  const [first, second] = await Promise.allSettled([queued("user.info"), queued("contest.list")]);
  assert.equal(first.status, "rejected"); assert.equal(second.status, "fulfilled"); assert.equal(peak, 1);
});

function browserState(t) {
  const entries = new Map();
  for (const [key, value] of Object.entries({ window: {}, localStorage: { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) } })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  return entries;
}

test("whole browser sync module preserves successful payload and uses hardened transport", async (t) => {
  const entries = browserState(t);
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, "follow"); assert.equal(options.credentials, "omit"); assert(options.signal instanceof AbortSignal);
    const result = url.includes("user.info?") ? [{ handle: "Fixture", rating: 1500 }] : url.endsWith("problemset.problems") ? { problems: [] } : [];
    return success(result);
  });
  const result = await browser.syncCodeforces("Fixture");
  assert.equal(result.handle, "Fixture"); assert.equal(calls.length, 5);
  assert.equal(JSON.parse(entries.get("cf-compass-cache-v1")).handle, "Fixture");
});

test("whole browser modules reject unexpected final origins without overwriting cached data", async (t) => {
  const entries = browserState(t);
  entries.set("cf-compass-cache-v1", "original"); entries.set("cf-compass-contest-center-v1", "original");
  t.mock.method(globalThis, "fetch", async () => ({ url: "https://evil.example/sink", body: null }));
  await assert.rejects(browser.syncCodeforces("Fixture"), { code: "CF_API_RESPONSE_ORIGIN" });
  await assert.rejects(center.loadContestCenter({ isDemo: false }, true), { code: "CF_API_RESPONSE_ORIGIN" });
  await assert.rejects(center.loadContestCenterDetail(1, { isDemo: false }, true), { code: "CF_API_RESPONSE_ORIGIN" });
  assert.equal(entries.get("cf-compass-cache-v1"), "original"); assert.equal(entries.get("cf-compass-contest-center-v1"), "original");
});

test("browser sync, center and training retain bridge-first behavior", async (t) => {
  browserState(t);
  t.mock.method(globalThis, "fetch", async () => { assert.fail("bridge must bypass renderer fetch"); });
  window.cfBridge = { sync: async () => "sync", getContestCenter: async () => "center", getContestCenterDetail: async () => "detail", getTrainingSessions: async () => "training" };
  assert.equal(await browser.syncCodeforces("Fixture"), "sync");
  assert.equal(await center.loadContestCenter({}, true), "center");
  assert.equal(await center.loadContestCenterDetail(1, {}, true), "detail");
  assert.equal(await custom.getTrainingSessions(), "training");
});
