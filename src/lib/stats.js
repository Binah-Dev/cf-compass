import { problemKey } from "./codeforces";

export const tagNames = {
  "2-sat": "2-SAT",
  binary_search: "二分查找",
  bitmasks: "位运算",
  brute_force: "暴力枚举",
  chinese_remainder_theorem: "中国剩余定理",
  combinatorics: "组合数学",
  constructive_algorithms: "构造算法",
  data_structures: "数据结构",
  dfs_and_similar: "DFS 与搜索",
  divide_and_conquer: "分治算法",
  dp: "动态规划",
  dsu: "并查集",
  expression_parsing: "表达式解析",
  fft: "快速傅里叶变换",
  flows: "网络流",
  games: "博弈论",
  geometry: "计算几何",
  graph_matchings: "图匹配",
  graphs: "图论",
  greedy: "贪心",
  hashing: "哈希",
  implementation: "模拟与实现",
  interactive: "交互题",
  math: "数学",
  matrices: "矩阵",
  meet_in_the_middle: "折半搜索",
  number_theory: "数论",
  probabilities: "概率",
  schedules: "调度",
  shortest_paths: "最短路",
  sortings: "排序",
  string_suffix_structures: "后缀结构",
  strings: "字符串",
  ternary_search: "三分搜索",
  trees: "树",
  two_pointers: "双指针",
};

export function normalizeTag(tag) {
  return String(tag || "").replaceAll(" ", "_");
}

export function displayTag(tag) {
  const normalized = normalizeTag(tag);
  return tagNames[normalized] || tag;
}

export function ratingTone(rating) {
  const value = Number(rating);
  if (!Number.isFinite(value) || value <= 0) return "muted";
  if (value < 1200) return "gray";
  if (value < 1400) return "green";
  if (value < 1600) return "cyan";
  if (value < 1900) return "blue";
  if (value < 2100) return "violet";
  if (value < 2400) return "amber";
  if (value < 3000) return "red";
  if (value < 4000) return "legendary";
  return "tourist";
}

export function acCountTone(count) {
  const accepted = Number(count) || 0;
  if (accepted <= 0) return "muted";
  if (accepted === 1) return "white";
  if (accepted === 2) return "green";
  if (accepted === 3) return "cyan";
  if (accepted === 4) return "blue";
  if (accepted === 5) return "violet";
  if (accepted === 6) return "amber";
  return "red";
}

export function buildSubmissionMap(submissions) {
  const map = new Map();
  for (const submission of submissions || []) {
    const problem = submission.problem || {};
    const key = `${problem.contestId || submission.contestId}-${problem.index}`;
    const current = map.get(key) || {
      attempts: 0,
      accepted: 0,
      firstAc: null,
      lastAc: null,
      lastAttempt: null,
    };
    current.attempts += 1;
    current.lastAttempt = Math.max(current.lastAttempt || 0, submission.creationTimeSeconds || 0);
    if (submission.verdict === "OK") {
      current.accepted += 1;
      current.firstAc =
        current.firstAc === null
          ? submission.creationTimeSeconds
          : Math.min(current.firstAc, submission.creationTimeSeconds);
      current.lastAc = Math.max(current.lastAc || 0, submission.creationTimeSeconds || 0);
    }
    map.set(key, current);
  }
  return map;
}

export function buildTagCounts(problems) {
  const counts = new Map();
  for (const problem of problems || []) {
    for (const rawTag of problem.tags || []) {
      const tag = normalizeTag(rawTag);
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export function getOverview(problems, submissions, submissionMap) {
  let solved = 0;
  let repeatAc = 0;
  let monthNew = 0;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000;

  for (const problem of problems || []) {
    const item = submissionMap.get(problemKey(problem));
    if (!item?.accepted) continue;
    solved += 1;
    repeatAc += Math.max(0, item.accepted - 1);
    if ((item.firstAc || 0) >= monthStart) monthNew += 1;
  }

  let monthAc = 0;
  for (const submission of submissions || []) {
    if (submission.verdict === "OK" && submission.creationTimeSeconds >= monthStart) {
      monthAc += 1;
    }
  }

  const progress = problems?.length ? (solved / problems.length) * 100 : 0;

  return {
    total: problems?.length || 0,
    submissions: submissions?.length || 0,
    solved,
    unsolved: Math.max(0, (problems?.length || 0) - solved),
    repeatAc,
    monthNew,
    monthAc,
    progress: Number(progress.toFixed(2)),
  };
}

export function formatPercent(value) {
  const number = Number(value);
  return `${Number.isFinite(number) ? number.toFixed(2) : "0.00"}%`;
}

function localDayKey(timestamp) {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildHeatmap(submissions, weeks = 16) {
  const counts = new Map();
  for (const submission of submissions || []) {
    if (submission.verdict !== "OK") continue;
    const key = localDayKey(submission.creationTimeSeconds);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - mondayOffset - (weeks - 1) * 7);

  const cells = [];
  for (let index = 0; index < weeks * 7; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const timestamp = Math.floor(date.getTime() / 1000);
    const key = localDayKey(timestamp);
    const count = counts.get(key) || 0;
    cells.push({
      key,
      count,
      level: count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4,
      future: date > today,
    });
  }
  return cells;
}

export function getRecentActivity(problems, submissions, limit = 5) {
  const lookup = new Map((problems || []).map((problem) => [problemKey(problem), problem]));
  const seen = new Set();
  const result = [];
  const sorted = [...(submissions || [])].sort(
    (a, b) => (b.creationTimeSeconds || 0) - (a.creationTimeSeconds || 0),
  );
  for (const submission of sorted) {
    if (submission.verdict !== "OK") continue;
    const key = `${submission.problem?.contestId || submission.contestId}-${submission.problem?.index}`;
    if (seen.has(key)) continue;
    const problem = lookup.get(key) || submission.problem;
    if (!problem) continue;
    seen.add(key);
    result.push({ problem, timestamp: submission.creationTimeSeconds });
    if (result.length >= limit) break;
  }
  return result;
}

export function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

export function relativeTime(timestamp) {
  if (!timestamp) return "暂无记录";
  const delta = Math.max(0, Date.now() - timestamp * 1000);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(timestamp * 1000).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}
