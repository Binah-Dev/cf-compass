const API_BASE = "https://codeforces.com/api/";
const API_ORIGIN = "https://codeforces.com";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

function policyError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.retryable = false;
  return error;
}

function requestUrl(endpoint) {
  if (
    typeof endpoint !== "string" ||
    /[\s\u0000-\u001f\u007f#\\]/.test(endpoint) ||
    !/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*(?:\?.*)?$/.test(endpoint)
  ) {
    throw policyError("CF_API_ENDPOINT", "Codeforces API 请求地址无效");
  }
  // Keep the original query bytes/order, including apiSig; do not reserialize.
  return `${API_BASE}${endpoint}`;
}

// Main-process Node fetch exposes Location for each manual response. Validate
// before connecting to the next URL, with one deadline for the entire chain.
export async function fetchCodeforcesDesktopResponse(endpoint, { headers } = {}) {
  let url = requestUrl(endpoint);
  const signal = AbortSignal.timeout(20000);
  const visited = new Set([new URL(url).href]);
  for (let hops = 0; ; hops += 1) {
    const response = await fetch(url, { redirect: "manual", signal, headers });
    if (response.type === "opaqueredirect") {
      throw policyError("CF_API_REDIRECT_TARGET", "无法检查 Codeforces API 跳转地址");
    }
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => {});
    if (location === null) {
      throw policyError("CF_API_REDIRECT_TARGET", "Codeforces API 未提供跳转地址");
    }
    let target;
    try { target = new URL(location, url); } catch {
      throw policyError("CF_API_REDIRECT_TARGET", "Codeforces API 跳转地址无效");
    }
    if (target.protocol !== "https:" || target.origin !== API_ORIGIN || target.username || target.password) {
      throw policyError("CF_API_REDIRECT_TARGET", "Codeforces API 跳转超出受信来源，已停止请求");
    }
    target.hash = "";
    if (visited.has(target.href)) {
      throw policyError("CF_API_REDIRECT_LOOP", "Codeforces API 跳转循环，已停止请求");
    }
    if (hops >= MAX_REDIRECTS) {
      throw policyError("CF_API_REDIRECT_LIMIT", "Codeforces API 跳转次数过多，已停止请求");
    }
    visited.add(target.href);
    // Resolve Location normally; never append, copy or re-sign the old query.
    url = target.href;
  }
}

// Browser manual responses hide Location, so allow normal same-origin redirects
// with follow. The document's existing CSP limits destinations; this final check
// rejects an unexpected result but CANNOT undo an already-sent redirect request.
export async function fetchCodeforcesResponse(endpoint) {
  const url = requestUrl(endpoint);
  const response = await fetch(url, {
    redirect: "follow",
    mode: "cors",
    credentials: "omit",
    signal: AbortSignal.timeout(20000),
  });
  let finalUrl;
  try { finalUrl = new URL(response.url); } catch { /* Reject unverifiable URLs. */ }
  if (!finalUrl || finalUrl.origin !== API_ORIGIN || finalUrl.username || finalUrl.password) {
    await response.body?.cancel().catch(() => {});
    throw policyError("CF_API_RESPONSE_ORIGIN", "Codeforces API 响应来源异常");
  }
  return response;
}

// Validate only the API envelope, not endpoint-specific result schemas.
export function codeforcesResult(body, fallbackMessage = "Codeforces API 返回异常") {
  if (!body || typeof body !== "object" || Array.isArray(body) || body.status !== "OK") {
    throw new Error(typeof body?.comment === "string" && body.comment || fallbackMessage);
  }
  if (!Object.prototype.hasOwnProperty.call(body, "result")) throw new Error(fallbackMessage);
  return body.result;
}
