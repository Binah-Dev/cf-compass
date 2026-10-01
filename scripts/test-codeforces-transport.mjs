import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchCodeforcesDesktopResponse, fetchCodeforcesResponse, codeforcesResult } from "../electron/shared/codeforces-transport.mjs";

// Synthetic responses only; these unit tests do not validate renderer CSP/CORS.
const withUrl = (response, url = "https://codeforces.com/api/user.info") => Object.defineProperty(response, "url", { value: url });
const redirect = (location, status = 302) => new Response(null, { status, headers: location === null ? {} : { Location: location } });

test("desktop preserves signed query bytes, headers and one 20s deadline across redirects", async (t) => {
  const signal = new AbortController().signal;
  let deadlines = 0;
  t.mock.method(AbortSignal, "timeout", (ms) => { deadlines++; assert.equal(ms, 20000); return signal; });
  const headers = { "User-Agent": "CF-Compass/2.0", Accept: "application/json" };
  const calls = [];
  const endpoint = "user.status?apiKey=fixture&apiSig=123%2Babc&x=a+b&x=%2f&time=1";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? redirect("?x=c+d&x=%2f") : new Response("{}");
  });
  await fetchCodeforcesDesktopResponse(endpoint, { headers });
  assert.equal(calls[0].url, `https://codeforces.com/api/${endpoint}`);
  assert.equal(calls[1].url, "https://codeforces.com/api/user.status?x=c+d&x=%2f");
  assert.equal(deadlines, 1);
  for (const call of calls) assert.deepEqual(call.options, { redirect: "manual", signal, headers });
});

for (const endpoint of ["user.info?handles=Fixture", "recentActions?maxCount=1", "contest.list", "user.info?handles=%23%0A%2F%5C"]) {
  test(`both transports accept canonical API method: ${endpoint}`, async (t) => {
    t.mock.method(globalThis, "fetch", async (url) => { assert.equal(url, `https://codeforces.com/api/${endpoint}`); return withUrl(new Response("{}"), url); });
    await fetchCodeforcesDesktopResponse(endpoint); await fetchCodeforcesResponse(endpoint);
  });
}
for (const endpoint of [undefined, null, {}, 4, "", "../user.info", "/user.info", "//evil.example/x", "https://evil.example/x", "user.info/extra", "user%2einfo", "user.info#fragment", "user.info?x=#fragment", "user.info\n", "user.info?x=\u0000", "user.info?x=\u007f", "user.info?x=a b", "user.info?x=a\\b", "user..info", ".user.info"]) {
  test(`both transports reject malformed endpoint before fetch: ${JSON.stringify(endpoint)}`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => { calls++; });
    for (const fetchResponse of [fetchCodeforcesDesktopResponse, fetchCodeforcesResponse]) {
      await assert.rejects(fetchResponse(endpoint), (error) => error.code === "CF_API_ENDPOINT" && error.retryable === false);
    }
    assert.equal(calls, 0);
  });
}

for (const status of [301, 302, 303, 307, 308]) {
  test(`desktop follows same-origin HTTP ${status} after cancelling the body`, async (t) => {
    let calls = 0, cancelled = 0;
    t.mock.method(globalThis, "fetch", async (url) => {
      calls++;
      if (calls === 1) return { status, headers: new Headers({ Location: "/api/user.rating?handle=Fixture" }), body: { cancel: async () => { cancelled++; } } };
      assert.equal(cancelled, 1);
      assert.equal(url, "https://codeforces.com/api/user.rating?handle=Fixture");
      return new Response("{}");
    });
    await fetchCodeforcesDesktopResponse("user.info"); assert.equal(calls, 2);
  });
}
for (const [location, expected] of [
  ["https://CODEFORCES.COM:443/api/user.rating", "https://codeforces.com/api/user.rating"],
  ["//codeforces.com/api/user.rating", "https://codeforces.com/api/user.rating"],
  ["user.rating?x=a+b&x=%2f#ignored", "https://codeforces.com/api/user.rating?x=a+b&x=%2f"],
  ["../login", "https://codeforces.com/login"],
  ["?handles=Other", "https://codeforces.com/api/user.info?handles=Other"],
]) {
  test(`desktop resolves canonical same-origin target: ${location}`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (url) => { calls++; if (calls === 1) return redirect(location); assert.equal(url, expected); return new Response("{}"); });
    await fetchCodeforcesDesktopResponse("user.info?apiSig=FIXTURE_OLD_SIG"); assert.equal(calls, 2);
  });
}
for (const location of ["https://evil.example/sink?apiSig=PRIVATE_TEST_MARKER", "http://codeforces.com/api/user.info", "//evil.example/sink", "https://codeforces.com:444/x", "https://api.codeforces.com/x", "https://codeforces.com./x", "https://user:secret@codeforces.com/x", "https://codeforces.com@evil.example/x", "https://codeforces.com.evil.example/x", "data:text/plain,fixture", "http://[", null]) {
  test(`desktop rejects unsafe/missing Location before a second request: ${location}`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => { calls++; return redirect(location); });
    await assert.rejects(fetchCodeforcesDesktopResponse("user.info"), (error) => {
      assert.equal(error.code, "CF_API_REDIRECT_TARGET"); assert.equal(error.retryable, false);
      assert.doesNotMatch(error.message, /PRIVATE_TEST_MARKER|secret|https?:/); return true;
    });
    assert.equal(calls, 1);
  });
}
for (const location of ["", "#fragment", "/api/user.info", "https://CODEFORCES.COM:443/api/user.info"]) {
  test(`desktop detects equivalent URL loop: ${location}`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => { calls++; return redirect(location); });
    await assert.rejects(fetchCodeforcesDesktopResponse("user.info"), { code: "CF_API_REDIRECT_LOOP" });
    assert.equal(calls, 1);
  });
}

test("desktop allows exactly five hops and rejects a sixth before transmission", async (t) => {
  for (const needed of [5, 6]) {
    let calls = 0;
    const mock = t.mock.method(globalThis, "fetch", async () => { calls++; return calls <= needed ? redirect(`/api/next${calls}`) : new Response("{}"); });
    if (needed === 5) await fetchCodeforcesDesktopResponse("user.info");
    else await assert.rejects(fetchCodeforcesDesktopResponse("user.info"), { code: "CF_API_REDIRECT_LIMIT" });
    assert.equal(calls, 6); mock.mock.restore();
  }
});

test("desktop cancels before rejecting, and cancellation failure preserves policy error", async (t) => {
  let response = { type: "opaqueredirect", status: 0, body: null };
  t.mock.method(globalThis, "fetch", async () => response);
  await assert.rejects(fetchCodeforcesDesktopResponse("user.info"), { code: "CF_API_REDIRECT_TARGET" });
  response = { status: 302, headers: new Headers({ Location: "https://evil.example" }), body: { cancel: async () => { throw new Error("cancel failed"); } } };
  await assert.rejects(fetchCodeforcesDesktopResponse("user.info"), { code: "CF_API_REDIRECT_TARGET" });
});

test("desktop nonredirect HTTP statuses remain caller HTTP failures", async (t) => {
  let response;
  t.mock.method(globalThis, "fetch", async () => response);
  for (const status of [200, 204, 300, 304, 305, 306, 400, 429, 500, 503]) {
    response = new Response(null, { status }); assert.equal(await fetchCodeforcesDesktopResponse("user.info"), response);
  }
});

test("browser follows redirects with CORS, omitted credentials and a 20s body deadline", async (t) => {
  const signal = new AbortController().signal;
  t.mock.method(AbortSignal, "timeout", (ms) => { assert.equal(ms, 20000); return signal; });
  const response = withUrl(new Response("{}"), "https://codeforces.com/api/user.rating");
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.deepEqual(options, { redirect: "follow", mode: "cors", credentials: "omit", signal }); return response;
  });
  assert.equal(await fetchCodeforcesResponse("user.info"), response);
});
for (const url of ["https://evil.example/sink?apiSig=PRIVATE_TEST_MARKER", "http://codeforces.com/api/user.info", "https://codeforces.com:444/x", "https://user:secret@codeforces.com/x", "http://localhost:5173/sink", "", "not a URL"]) {
  test(`browser rejects unexpected FINAL URL after fetch: ${url}`, async (t) => {
    let calls = 0, cancelled = 0;
    t.mock.method(globalThis, "fetch", async () => { calls++; return { url, body: { cancel: async () => { cancelled++; } } }; });
    await assert.rejects(fetchCodeforcesResponse("user.info"), error => error.code === "CF_API_RESPONSE_ORIGIN" && error.retryable === false && !error.message.includes("PRIVATE_TEST_MARKER"));
    assert.equal(calls, 1); assert.equal(cancelled, 1); // This is NOT proof of zero redirected network requests.
  });
}

test("network and timeout errors retain identity for caller retries", async (t) => {
  let failure;
  t.mock.method(globalThis, "fetch", async () => { throw failure; });
  for (failure of [new TypeError("fetch failed"), new DOMException("timed out", "TimeoutError"), new DOMException("aborted", "AbortError")]) {
    for (const fetchResponse of [fetchCodeforcesDesktopResponse, fetchCodeforcesResponse]) await assert.rejects(fetchResponse("user.info"), error => error === failure && error.retryable !== false);
  }
});
for (const body of [null, [], "OK", 42, {}, { status: "OK" }, { status: "FAILED" }, { status: "FAILED", comment: { unexpected: true } }]) {
  test(`rejects malformed/failure API envelope: ${JSON.stringify(body)}`, () => { assert.throws(() => codeforcesResult(body), /Codeforces API 返回异常/); });
}
test("API comments and result types remain compatible; no endpoint schema claim", () => {
  assert.throws(() => codeforcesResult({ status: "FAILED", comment: "rating changes unavailable" }), /rating changes unavailable/);
  assert.throws(() => codeforcesResult(null, "English fallback"), /English fallback/);
  for (const result of [null, [], {}, "arbitrary", false, 0]) assert.equal(codeforcesResult({ status: "OK", result }), result);
});
