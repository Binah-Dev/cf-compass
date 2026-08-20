import { demoData } from "../data/demo";

const CACHE_KEY = "cf-compass-cache-v1";
const FAVORITES_KEY = "cf-compass-favorites-v1";

async function fetchApi(endpoint) {
  const response = await fetch(`https://codeforces.com/api/${endpoint}`);
  if (!response.ok) throw new Error(`Codeforces 请求失败（HTTP ${response.status}）`);
  const body = await response.json();
  if (body.status !== "OK") throw new Error(body.comment || "Codeforces API 返回异常");
  return body.result;
}

function buildRatingStanding(ratedUsers, rating) {
  const currentRating = Number(rating);
  if (!Number.isFinite(currentRating) || !Array.isArray(ratedUsers) || !ratedUsers.length) {
    return null;
  }
  const total = ratedUsers.length;
  const position =
    ratedUsers.reduce(
      (count, user) => count + (Number(user?.rating) > currentRating ? 1 : 0),
      0,
    ) + 1;
  return {
    position,
    total,
    topPercent: Number(((position / total) * 100).toFixed(2)),
    scope: "近 30 天参加过 Rated 比赛的活跃用户",
    source: "Codeforces user.ratedList",
    syncedAt: new Date().toISOString(),
  };
}

function browserCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

export async function loadInitialData() {
  if (window.cfBridge) {
    const cached = await window.cfBridge.getCache();
    return cached || demoData;
  }
  return browserCache() || demoData;
}

export async function syncCodeforces(handle) {
  if (window.cfBridge) return window.cfBridge.sync(handle);

  const safe = String(handle || "").trim();
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(safe)) {
    throw new Error("请输入有效的 Codeforces Handle");
  }
  const encoded = encodeURIComponent(safe);
  const [users, problemset, submissions, ratingHistory, ratedUsers] = await Promise.all([
    fetchApi(`user.info?handles=${encoded}&checkHistoricHandles=false`),
    fetchApi("problemset.problems"),
    fetchApi(`user.status?handle=${encoded}&from=1&count=100000`),
    fetchApi(`user.rating?handle=${encoded}`),
    fetchApi("user.ratedList?activeOnly=true&includeRetired=false").catch(() => null),
  ]);
  const payload = {
    version: 2,
    handle: safe,
    user: users[0],
    problems: problemset.problems,
    submissions,
    ratingHistory,
    ratingStanding: buildRatingStanding(ratedUsers, users[0]?.rating),
    problemsetSyncedAt: new Date().toISOString(),
    syncedAt: new Date().toISOString(),
    isDemo: false,
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  return payload;
}

export async function loadFavorites() {
  if (window.cfBridge) return window.cfBridge.getFavorites();
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
  } catch {
    return [];
  }
}

export async function saveFavorites(favorites) {
  if (window.cfBridge) return window.cfBridge.setFavorites(favorites);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  return favorites;
}

export function problemKey(problem) {
  return `${problem.contestId}-${problem.index}`;
}

export function problemUrl(problem) {
  return `https://codeforces.com/contest/${problem.contestId}/problem/${problem.index}`;
}

export async function openProblem(problem) {
  const url = problemUrl(problem);
  if (window.cfBridge) return window.cfBridge.openProblem(url);
  window.open(url, "_blank", "noopener,noreferrer");
}
