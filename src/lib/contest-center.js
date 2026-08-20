const CENTER_CACHE_KEY = "cf-compass-contest-center-v1";
const CENTER_CACHE_MS = 30 * 60 * 1000;

function classifyContestName(name) {
  const value = String(name || "");
  const normalized = value.toLowerCase();
  if (normalized.includes("educational")) {
    return { primary: "special", divisions: [2], special: "educational", label: "Educational" };
  }
  if (normalized.includes("global round")) {
    return { primary: "special", divisions: [], special: "global", label: "Global" };
  }
  if (
    normalized.includes("icpc") ||
    normalized.includes("regional") ||
    normalized.includes("neerc") ||
    normalized.includes("nwerc") ||
    normalized.includes("swerc") ||
    normalized.includes("championship")
  ) {
    return { primary: "special", divisions: [], special: "icpc", label: "ICPC / 区域赛" };
  }
  const divisions = [];
  for (let division = 1; division <= 4; division += 1) {
    const pattern = new RegExp(`div(?:ision)?\\.?\\s*${division}(?:\\D|$)`, "i");
    if (pattern.test(value)) divisions.push(division);
  }
  if (divisions.length) {
    return {
      primary: `div${divisions[0]}`,
      divisions,
      special: null,
      label: divisions.map((division) => `Div.${division}`).join(" + "),
    };
  }
  return { primary: "special", divisions: [], special: "other", label: "特殊类型" };
}

function phaseGroup(phase) {
  if (phase === "BEFORE") return "upcoming";
  if (phase === "CODING") return "running";
  return "finished";
}

function normalizeContest(contest) {
  const name = String(contest?.name || `Contest ${contest?.id || ""}`);
  const type = String(contest?.type || "CF");
  return {
    id: Number(contest?.id) || 0,
    name,
    type,
    phase: String(contest?.phase || "FINISHED"),
    phaseGroup: phaseGroup(contest?.phase),
    durationSeconds: Number(contest?.durationSeconds) || 0,
    startTimeSeconds: Number(contest?.startTimeSeconds) || 0,
    category: classifyContestName(name),
    isRated: type === "CF" && !/(unrated|unofficial|mirror|practice)/i.test(name),
  };
}

async function fetchApi(endpoint) {
  const response = await fetch(`https://codeforces.com/api/${endpoint}`);
  if (!response.ok) throw new Error(`Codeforces 请求失败（HTTP ${response.status}）`);
  const body = await response.json();
  if (body.status !== "OK") throw new Error(body.comment || "Codeforces API 返回异常");
  return body.result;
}

function makeProblem(contestId, index, name, rating, tags = []) {
  return { contestId, index, name, rating, tags, type: "PROGRAMMING" };
}

function buildDemoContestCenter() {
  const now = Math.floor(Date.now() / 1000);
  const raw = [
    { id: 2312, name: "Codeforces Round 1126 (Div. 2)", offset: 3, phase: "BEFORE", duration: 7200, recommended: true },
    { id: 2311, name: "Educational Codeforces Round 198 (Rated for Div. 2)", offset: 8, phase: "BEFORE", duration: 7200, recommended: true },
    { id: 2310, name: "Codeforces Round 1125 (Div. 3)", offset: -0.04, phase: "CODING", duration: 8100 },
    { id: 2309, name: "Codeforces Round 1124 (Div. 2)", offset: -4, phase: "FINISHED", duration: 7200, participated: true, solved: ["A", "B"] },
    { id: 2308, name: "Codeforces Round 1123 (Div. 4)", offset: -9, phase: "FINISHED", duration: 8100 },
    { id: 2307, name: "Codeforces Global Round 34", offset: -14, phase: "FINISHED", duration: 9000, participated: true, solved: ["A"] },
    { id: 2306, name: "Codeforces Round 1122 (Div. 1 + Div. 2)", offset: -21, phase: "FINISHED", duration: 7200, recommended: true },
    { id: 2305, name: "ICPC Asia Pacific Championship 2026", offset: -34, phase: "FINISHED", duration: 18000, type: "ICPC" },
    { id: 2304, name: "Codeforces Round 1121 (Div. 3)", offset: -42, phase: "FINISHED", duration: 8100, participated: true, solved: ["A", "B", "C"] },
    { id: 2303, name: "Codeforces Round 1120 (Div. 2)", offset: -57, phase: "FINISHED", duration: 7200, recommended: true },
    { id: 2302, name: "Kotlin Heroes: Episode 13", offset: -71, phase: "FINISHED", duration: 9000, type: "CF" },
    { id: 2301, name: "Codeforces Round 1119 (Div. 1)", offset: -83, phase: "FINISHED", duration: 7200 },
  ];
  const contests = raw.map((item) => ({
    ...normalizeContest({
      id: item.id,
      name: item.name,
      type: item.type || "CF",
      phase: item.phase,
      durationSeconds: item.duration,
      startTimeSeconds: now + item.offset * 86400,
    }),
    demoParticipation: Boolean(item.participated),
    demoSolved: item.solved || [],
    demoRecommended: Boolean(item.recommended),
  }));
  const details = Object.fromEntries(contests.map((contest, index) => [
    contest.id,
    {
      contestId: contest.id,
      syncedAt: new Date().toISOString(),
      participantCount: 6400 + index * 1370,
      problems: [
        makeProblem(contest.id, "A", "Threshold Movement", 800, ["implementation"]),
        makeProblem(contest.id, "B", "String Construction", 1000, ["strings"]),
        makeProblem(contest.id, "C", "Rank Subsequence", 1200, ["greedy"]),
        makeProblem(contest.id, "D", "Permutation Transformation", 1500, ["data structures"]),
        makeProblem(contest.id, "E", "Skyline Queries", 1800, ["graphs"]),
        makeProblem(contest.id, "F", "Maximum Even Set", 2000, ["dp"]),
      ],
    },
  ]));
  return {
    version: 1,
    syncedAt: new Date().toISOString(),
    contests,
    details,
    summary: {
      total: contests.length,
      upcoming: contests.filter((contest) => contest.phaseGroup === "upcoming").length,
      running: contests.filter((contest) => contest.phaseGroup === "running").length,
      finished: contests.filter((contest) => contest.phaseGroup === "finished").length,
    },
    isDemo: true,
  };
}

const demoContestCenter = buildDemoContestCenter();

export async function loadContestCenter(data, force = false) {
  if (data?.isDemo) return demoContestCenter;
  if (window.cfBridge?.getContestCenter) return window.cfBridge.getContestCenter(force);
  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(CENTER_CACHE_KEY));
      if (
        cached?.contests?.length &&
        Date.now() - new Date(cached.syncedAt).getTime() < CENTER_CACHE_MS
      ) return cached;
    } catch {
      // Ignore malformed browser cache and refresh from Codeforces.
    }
  }
  const contests = (await fetchApi("contest.list?gym=false"))
    .map(normalizeContest)
    .filter((contest) => contest.id > 0)
    .sort((first, second) => second.startTimeSeconds - first.startTimeSeconds);
  const center = {
    version: 1,
    syncedAt: new Date().toISOString(),
    contests,
    details: {},
    summary: {
      total: contests.length,
      upcoming: contests.filter((contest) => contest.phaseGroup === "upcoming").length,
      running: contests.filter((contest) => contest.phaseGroup === "running").length,
      finished: contests.filter((contest) => contest.phaseGroup === "finished").length,
    },
  };
  localStorage.setItem(CENTER_CACHE_KEY, JSON.stringify(center));
  return center;
}

export async function loadContestCenterDetail(contestId, data, force = false) {
  if (data?.isDemo) return demoContestCenter.details[contestId] || null;
  if (window.cfBridge?.getContestCenterDetail) {
    return window.cfBridge.getContestCenterDetail(contestId, force);
  }
  const standings = await fetchApi(
    `contest.standings?contestId=${Number(contestId)}&from=1&count=1&showUnofficial=true`,
  );
  return {
    contestId: Number(contestId),
    syncedAt: new Date().toISOString(),
    participantCount: null,
    problems: standings?.problems || [],
  };
}

export function openContestPage(contestId) {
  const url = `https://codeforces.com/contest/${Number(contestId)}`;
  if (window.cfBridge?.openProblem) return window.cfBridge.openProblem(url);
  window.open(url, "_blank", "noopener,noreferrer");
  return Promise.resolve({ opened: true });
}

export function formatContestCenterDate(timestamp) {
  if (!timestamp) return "时间待定";
  const date = new Date(timestamp * 1000);
  const part = (value) => String(value).padStart(2, "0");
  return `${part(date.getMonth() + 1)}/${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}`;
}

export function formatContestCenterDuration(seconds) {
  const minutes = Math.round((Number(seconds) || 0) / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
