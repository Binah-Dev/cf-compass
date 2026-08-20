import { problemKey } from "./codeforces";

export const CONTEST_FILTERS = [
  { id: "all", label: "全部" },
  { id: "div1", label: "Div.1" },
  { id: "div2", label: "Div.2" },
  { id: "div3", label: "Div.3" },
  { id: "div4", label: "Div.4" },
  { id: "special", label: "特殊类型" },
];

export const SPECIAL_CONTEST_FILTERS = [
  { id: "all", label: "全部特殊类型" },
  { id: "educational", label: "Educational" },
  { id: "global", label: "Global Round" },
  { id: "kotlin", label: "Kotlin Heroes" },
  { id: "icpc", label: "ICPC / 区域赛" },
  { id: "other", label: "其他 Rated" },
];

export function performanceTone(value) {
  if (value === "Infinity") return "tourist";
  const rating = Number(value);
  if (!Number.isFinite(rating)) return "muted";
  if (rating < 1200) return "gray";
  if (rating < 1400) return "green";
  if (rating < 1600) return "cyan";
  if (rating < 1900) return "blue";
  if (rating < 2100) return "violet";
  if (rating < 2400) return "amber";
  if (rating < 3000) return "red";
  if (rating < 4000) return "legendary";
  return "tourist";
}

export function formatPerformance(value) {
  return value === "Infinity" ? "∞" : Number.isFinite(Number(value)) ? Number(value) : "—";
}

export function formatContestDate(timestamp) {
  if (!timestamp) return "日期未知";
  return new Date(timestamp * 1000).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatContestDuration(seconds) {
  const totalMinutes = Math.max(0, Math.round((Number(seconds) || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatSolveTime(seconds) {
  if (!Number.isFinite(Number(seconds))) return "";
  const totalMinutes = Math.max(0, Math.floor(Number(seconds) / 60));
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(
    totalMinutes % 60,
  ).padStart(2, "0")}`;
}

export function matchesContestFilter(contest, filter, specialFilter = "all") {
  if (filter === "all") return true;
  if (filter === "special") {
    if (contest.category?.primary !== "special") return false;
    return specialFilter === "all" || contest.category?.special === specialFilter;
  }
  const division = Number(filter.replace("div", ""));
  return contest.category?.divisions?.includes(division);
}

function makeDemoProblem(
  contestId,
  index,
  name,
  rating,
  contestResult,
  contestAttempts,
  currentStatus,
  firstAcTimeSeconds = null,
) {
  return {
    contestId,
    index,
    name,
    rating,
    tags: [],
    contestResult,
    contestAttempts,
    rejectedAttempts: Math.max(0, contestAttempts - (contestResult === "accepted" ? 1 : 0)),
    firstAcTimeSeconds,
    currentStatus,
    currentAcCount: currentStatus === "unsolved" ? 0 : 1,
  };
}

function demoContest({
  contestId,
  contestName,
  daysAgo,
  oldRating,
  newRating,
  performance,
  officialRank,
  participants,
  category,
  problems,
}) {
  return {
    contestId,
    contestName,
    dateSeconds: Math.floor(Date.now() / 1000) - daysAgo * 86400,
    startTimeSeconds: Math.floor(Date.now() / 1000) - daysAgo * 86400,
    durationSeconds: 2 * 60 * 60,
    oldRating,
    newRating,
    ratingDelta: newRating - oldRating,
    performance,
    officialRank,
    calculatedRank: officialRank,
    participants,
    category,
    status: "ready",
    error: null,
    points: problems.filter((problem) => problem.contestResult === "accepted").length,
    penalty: 438,
    solved: problems.filter((problem) => problem.contestResult === "accepted").length,
    totalProblems: problems.length,
    problems,
    calculatedAt: new Date().toISOString(),
    calculationSource: "Carrot Plus",
  };
}

export function buildDemoContestReplay() {
  const latestProblems = [
    makeDemoProblem(2250, "A", "Threshold Movement", 800, "accepted", 1, "contest-ac", 18 * 60),
    makeDemoProblem(2250, "B", "String Construction", 1000, "accepted", 2, "contest-ac", 44 * 60),
    makeDemoProblem(2250, "C", "Rank Subsequence", 1200, "attempted", 4, "upsolved"),
    makeDemoProblem(2250, "D", "Permutation Transformation", 1500, "not-attempted", 0, "unsolved"),
    makeDemoProblem(2250, "E", "Skyline Queries", 1800, "not-attempted", 0, "unsolved"),
  ];
  const contests = [
    demoContest({
      contestId: 2250,
      contestName: "Codeforces Round 1050 (Div. 2)",
      daysAgo: 12,
      oldRating: 1368,
      newRating: 1385,
      performance: 1468,
      officialRank: 2140,
      participants: 18426,
      category: { primary: "div2", divisions: [2], special: null, label: "Div.2" },
      problems: latestProblems,
    }),
    demoContest({
      contestId: 2245,
      contestName: "Educational Codeforces Round 181 (Rated for Div. 2)",
      daysAgo: 34,
      oldRating: 1410,
      newRating: 1368,
      performance: 1247,
      officialRank: 5630,
      participants: 15240,
      category: { primary: "special", divisions: [], special: "educational", label: "Educational" },
      problems: [
        makeDemoProblem(2245, "A", "Familiar?", 800, "accepted", 1, "contest-ac", 25 * 60),
        makeDemoProblem(2245, "B", "Anya Loves Trees!", 1100, "attempted", 3, "upsolved"),
        makeDemoProblem(2245, "C", "Yura and Deadlines", 1400, "not-attempted", 0, "unsolved"),
        makeDemoProblem(2245, "D", "Masha and the Garland", 1800, "not-attempted", 0, "unsolved"),
      ],
    }),
    demoContest({
      contestId: 2236,
      contestName: "Codeforces Round 1038 (Div. 3)",
      daysAgo: 66,
      oldRating: 1356,
      newRating: 1410,
      performance: 1586,
      officialRank: 1184,
      participants: 21604,
      category: { primary: "div3", divisions: [3], special: null, label: "Div.3" },
      problems: [
        makeDemoProblem(2236, "A", "Array Coloring", 800, "accepted", 1, "contest-ac", 9 * 60),
        makeDemoProblem(2236, "B", "Prefix Balance", 1000, "accepted", 2, "contest-ac", 31 * 60),
        makeDemoProblem(2236, "C", "Tree Distance", 1300, "accepted", 3, "contest-ac", 74 * 60),
        makeDemoProblem(2236, "D", "Bitwise Journey", 1600, "attempted", 5, "unsolved"),
        makeDemoProblem(2236, "E", "Graph Restoration", 1900, "not-attempted", 0, "unsolved"),
      ],
    }),
    demoContest({
      contestId: 2218,
      contestName: "Codeforces Global Round 29",
      daysAgo: 103,
      oldRating: 1275,
      newRating: 1356,
      performance: 1694,
      officialRank: 642,
      participants: 9820,
      category: { primary: "special", divisions: [], special: "global", label: "Global" },
      problems: [
        makeDemoProblem(2218, "A", "Binary Parade", 900, "accepted", 1, "contest-ac", 14 * 60),
        makeDemoProblem(2218, "B", "Minimum Path", 1200, "accepted", 2, "contest-ac", 48 * 60),
        makeDemoProblem(2218, "C", "Colorful Segments", 1500, "attempted", 3, "upsolved"),
        makeDemoProblem(2218, "D", "Dynamic Network", 1900, "not-attempted", 0, "unsolved"),
      ],
    }),
    demoContest({
      contestId: 2205,
      contestName: "Codeforces Round 1016 (Div. 4)",
      daysAgo: 138,
      oldRating: 1198,
      newRating: 1275,
      performance: 1452,
      officialRank: 3210,
      participants: 28860,
      category: { primary: "div4", divisions: [4], special: null, label: "Div.4" },
      problems: [
        makeDemoProblem(2205, "A", "Easy Start", 800, "accepted", 1, "contest-ac", 7 * 60),
        makeDemoProblem(2205, "B", "Equal Sums", 900, "accepted", 1, "contest-ac", 19 * 60),
        makeDemoProblem(2205, "C", "Clock Conversion", 1000, "accepted", 2, "contest-ac", 36 * 60),
        makeDemoProblem(2205, "D", "Range Update", 1200, "attempted", 4, "upsolved"),
        makeDemoProblem(2205, "E", "Xor Grid", 1400, "not-attempted", 0, "unsolved"),
      ],
    }),
  ];
  return {
    version: 1,
    handle: "compass_demo",
    syncedAt: new Date().toISOString(),
    contests,
    progress: { total: contests.length, completed: contests.length, failed: 0, pending: 0, percent: 100 },
    isDemo: true,
  };
}

export async function loadContestReplay(data) {
  if (data?.isDemo) return buildDemoContestReplay();
  if (window.cfBridge?.getContestReplay) return window.cfBridge.getContestReplay();
  return {
    version: 1,
    handle: data?.handle || "",
    syncedAt: null,
    contests: [],
    progress: { total: 0, completed: 0, failed: 0, pending: 0, percent: 100 },
  };
}

export async function calculateContest(contestId, force = false) {
  if (!window.cfBridge?.calculateContestReplay) return null;
  return window.cfBridge.calculateContestReplay(contestId, force);
}

export async function calculateNextContest() {
  if (!window.cfBridge?.calculateNextContestReplay) return null;
  return window.cfBridge.calculateNextContestReplay();
}

export function contestProblemKey(problem) {
  return problemKey(problem);
}
