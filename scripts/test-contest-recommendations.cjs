const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { buildTargets, buildCandidatePool, normalizeRecommendations } = require("../electron/services/contest-recommendation-service.cjs");

function p(contestId, index, rating, tags, extra = {}) {
  return { contestId, index, name: `${contestId}${index}`, rating, tags, ...extra };
}

const contest = {
  contestId: 100,
  durationSeconds: 7200,
  problems: [
    p(100, "A", 900, ["implementation"], { contestResult: "accepted", contestAttempts: 1, firstAcTimeSeconds: 300 }),
    p(100, "B", 1200, ["greedy", "sortings"], { contestResult: "accepted", contestAttempts: 3, firstAcTimeSeconds: 3000 }),
    p(100, "C", 1500, ["dp", "math"], { contestResult: "accepted", contestAttempts: 1, firstAcTimeSeconds: 5000 }),
    p(100, "D", 1800, ["graphs", "dfs and similar"], { contestResult: "attempted", contestAttempts: 2 }),
    p(100, "E", 2100, ["graphs", "shortest paths"], { contestResult: "idle", contestAttempts: 0 }),
  ],
};
const library = [
  p(201, "A", 1200, ["greedy", "sortings"]),
  p(202, "B", 1500, ["dp", "math"]),
  p(203, "C", 1750, ["graphs", "dfs and similar"]),
  p(204, "D", 1900, ["graphs", "shortest paths"]),
  p(205, "E", 1800, ["strings"]),
  p(100, "F", 1800, ["graphs"]),
  p(206, "A", 1800, []),
];

const targets = buildTargets(contest);
assert(targets.some((item) => item.type === "corrected" && item.key === "100-B"), "WA→AC/多次提交应形成纠错目标");
assert(targets.some((item) => item.type === "slow" && item.key === "100-C"), "慢 AC 应形成耗时目标");
assert(targets.some((item) => item.type === "unsolved" && item.key === "100-D"), "未通过题应形成补强目标");
assert(targets.some((item) => item.type === "frontier" && item.key === "100-E"), "未尝试前沿题应形成衔接目标");

const result = buildCandidatePool({ contest, problems: library, solvedKeys: ["202-B"], plannedKeys: ["201-A"] });
assert(!result.candidates.some((item) => item.problemKey === "201-A"), "计划题必须排除");
assert(!result.candidates.some((item) => item.problemKey === "202-B"), "已 AC 题必须排除");
assert(!result.candidates.some((item) => item.contestId === 100), "当前比赛题必须排除");
assert(!result.candidates.some((item) => item.problemKey === "205-E"), "无标签交集题必须排除");
assert(result.candidates.some((item) => item.problemKey === "203-C"), "应保留同知识点同难度题");

const normalized = normalizeRecommendations({ recommendations: [
  { id: "203-C", reason: "图论补强", focus: "DFS 建模" },
  { id: "999-Z", reason: "伪造题" },
  { id: "203-C", reason: "重复" },
] }, result.candidates);
assert.equal(normalized.length, 1, "越界候选与重复项必须被拒绝");
assert.equal(normalized[0].name, "203C", "题目事实必须从本地候选回填");

const timings = [];
const largeLibrary = Array.from({ length: 12000 }, (_, index) => p(300 + Math.floor(index / 20), String.fromCharCode(65 + index % 5), 1500 + index % 5 * 100, index % 2 ? ["graphs", "dfs and similar"] : ["dp", "math"]));
for (let run = 0; run < 20; run += 1) {
  const start = performance.now();
  buildCandidatePool({ contest, problems: largeLibrary });
  timings.push(performance.now() - start);
}
timings.sort((a, b) => a - b);
const p50 = timings[Math.floor(timings.length * 0.5)];
const p95 = timings[Math.floor(timings.length * 0.95)];
assert(p95 < 500, `候选生成 P95 过慢: ${p95.toFixed(1)}ms`);
console.log(JSON.stringify({ representativeCases: 4, adversarialCases: 6, candidateCount: result.candidates.length, latencyMs: { p50: Number(p50.toFixed(2)), p95: Number(p95.toFixed(2)) } }, null, 2));
