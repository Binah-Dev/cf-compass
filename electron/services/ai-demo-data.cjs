const DEMO_CONTESTS = [
  {
    contestId: 2250,
    contestName: "Codeforces Round 1050 (Div. 2)",
    daysAgo: 12,
    oldRating: 1368,
    newRating: 1385,
    performance: 1468,
    officialRank: 2140,
    participants: 18426,
    category: { primary: "div2", divisions: [2], special: null, label: "Div.2" },
    problems: [
      ["A", "Threshold Movement", 800, ["implementation", "math"], "accepted", 1, "contest-ac", 18 * 60],
      ["B", "String Construction", 1000, ["strings", "greedy"], "accepted", 2, "contest-ac", 44 * 60],
      ["C", "Rank Subsequence", 1200, ["dp", "sortings"], "attempted", 4, "upsolved", null],
      ["D", "Permutation Transformation", 1500, ["combinatorics"], "not-attempted", 0, "unsolved", null],
      ["E", "Skyline Queries", 1800, ["data structures", "trees"], "not-attempted", 0, "unsolved", null],
    ],
  },
  {
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
      ["A", "Familiar?", 800, ["implementation"], "accepted", 1, "contest-ac", 25 * 60],
      ["B", "Anya Loves Trees!", 1100, ["trees", "dfs and similar"], "attempted", 3, "upsolved", null],
      ["C", "Yura and Deadlines", 1400, ["greedy", "sortings"], "not-attempted", 0, "unsolved", null],
      ["D", "Masha and the Garland", 1800, ["dp"], "not-attempted", 0, "unsolved", null],
    ],
  },
  {
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
      ["A", "Array Coloring", 800, ["implementation"], "accepted", 1, "contest-ac", 9 * 60],
      ["B", "Prefix Balance", 1000, ["prefix sums"], "accepted", 2, "contest-ac", 31 * 60],
      ["C", "Tree Distance", 1300, ["trees", "dfs and similar"], "accepted", 3, "contest-ac", 74 * 60],
      ["D", "Bitwise Journey", 1600, ["bitmasks", "graphs"], "attempted", 5, "unsolved", null],
      ["E", "Graph Restoration", 1900, ["graphs"], "not-attempted", 0, "unsolved", null],
    ],
  },
  {
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
      ["A", "Binary Parade", 900, ["implementation", "bitmasks"], "accepted", 1, "contest-ac", 14 * 60],
      ["B", "Minimum Path", 1200, ["graphs", "greedy"], "accepted", 2, "contest-ac", 48 * 60],
      ["C", "Colorful Segments", 1500, ["data structures"], "attempted", 3, "upsolved", null],
      ["D", "Dynamic Network", 1900, ["graphs", "data structures"], "not-attempted", 0, "unsolved", null],
    ],
  },
  {
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
      ["A", "Easy Start", 800, ["implementation"], "accepted", 1, "contest-ac", 7 * 60],
      ["B", "Equal Sums", 900, ["math"], "accepted", 1, "contest-ac", 19 * 60],
      ["C", "Clock Conversion", 1000, ["implementation"], "accepted", 2, "contest-ac", 36 * 60],
      ["D", "Range Update", 1200, ["data structures"], "attempted", 4, "upsolved", null],
      ["E", "Xor Grid", 1400, ["bitmasks", "dp"], "not-attempted", 0, "unsolved", null],
    ],
  },
];

function makeProblem(contestId, definition) {
  const [index, name, rating, tags, contestResult, contestAttempts, currentStatus, firstAcTimeSeconds] = definition;
  return {
    contestId,
    index,
    name,
    rating,
    tags,
    contestResult,
    contestAttempts,
    rejectedAttempts: Math.max(0, contestAttempts - (contestResult === "accepted" ? 1 : 0)),
    firstAcTimeSeconds,
    currentStatus,
    currentAcCount: currentStatus === "unsolved" ? 0 : 1,
  };
}

function makeContest(definition, now) {
  const startTimeSeconds = now - definition.daysAgo * 86400;
  const problems = definition.problems.map((problem) => makeProblem(definition.contestId, problem));
  const solved = problems.filter((problem) => problem.contestResult === "accepted").length;
  return {
    contestId: definition.contestId,
    contestName: definition.contestName,
    dateSeconds: startTimeSeconds,
    startTimeSeconds,
    durationSeconds: 2 * 60 * 60,
    oldRating: definition.oldRating,
    newRating: definition.newRating,
    ratingDelta: definition.newRating - definition.oldRating,
    performance: definition.performance,
    officialRank: definition.officialRank,
    calculatedRank: definition.officialRank,
    participants: definition.participants,
    category: definition.category,
    status: "ready",
    error: null,
    points: solved,
    penalty: 438,
    solved,
    totalProblems: problems.length,
    problems,
    calculatedAt: new Date(now * 1000).toISOString(),
    calculationSource: "Carrot Plus",
  };
}

function makeSubmissions(contests) {
  let id = 9000000;
  const submissions = [];
  for (const contest of contests) {
    for (const problem of contest.problems) {
      for (let attempt = 0; attempt < problem.contestAttempts; attempt += 1) {
        const accepted = problem.contestResult === "accepted" && attempt === problem.contestAttempts - 1;
        const relativeTimeSeconds = accepted
          ? problem.firstAcTimeSeconds
          : Math.max(60, (problem.firstAcTimeSeconds || 3600) - (problem.contestAttempts - attempt) * 240);
        submissions.push({
          id: id++,
          contestId: contest.contestId,
          creationTimeSeconds: contest.startTimeSeconds + relativeTimeSeconds,
          relativeTimeSeconds,
          verdict: accepted ? "OK" : "WRONG_ANSWER",
          problem: { contestId: contest.contestId, index: problem.index },
          author: { participantType: "CONTESTANT" },
        });
      }
      if (problem.currentStatus === "upsolved") {
        submissions.push({
          id: id++,
          contestId: contest.contestId,
          creationTimeSeconds: contest.startTimeSeconds + contest.durationSeconds + 7200,
          verdict: "OK",
          problem: { contestId: contest.contestId, index: problem.index },
          author: { participantType: "PRACTICE" },
        });
      }
    }
  }
  return submissions.sort((first, second) => second.id - first.id);
}

function buildDemoAiData() {
  const now = Math.floor(Date.now() / 1000);
  const contests = DEMO_CONTESTS.map((definition) => makeContest(definition, now));
  return {
    cache: {
      version: 2,
      handle: "compass_demo",
      problems: [],
      submissions: makeSubmissions(contests),
      syncMeta: { incremental: false, latestSubmissionId: 9000000 },
      syncedAt: new Date(now * 1000).toISOString(),
    },
    study: {
      settings: { language: "zh-CN" },
      notes: {
        "2250-A": {
          difficulty: 2,
          mistakeReason: "第一次读题时忽略了边界条件",
          mistakeTags: ["边界", "审题"],
          keyIdea: "先固定不变量，再按移动方向分类讨论。",
          content: "这是一道适合复盘审题和边界检查的演示题。",
        },
        "2250-C": {
          difficulty: 4,
          mistakeReason: "状态设计过早，缺少整体排序视角",
          mistakeTags: ["建模", "状态设计"],
          keyIdea: "先找可排序的结构，再决定是否需要 DP。",
          content: "演示笔记：记录卡住原因，避免把复杂度问题误判成实现问题。",
        },
        "2236-D": {
          difficulty: 4,
          mistakeReason: "位运算状态没有及时压缩",
          mistakeTags: ["位运算", "复杂度"],
          keyIdea: "先估算状态空间，再选择逐位转移。",
          content: "演示笔记：把超时风险写成下一次比赛的检查清单。",
        },
      },
    },
    replay: {
      version: 1,
      handle: "compass_demo",
      syncedAt: new Date(now * 1000).toISOString(),
      contests,
      progress: { total: contests.length, completed: contests.length, failed: 0, pending: 0, percent: 100 },
      isDemo: true,
    },
  };
}

module.exports = { buildDemoAiData };
