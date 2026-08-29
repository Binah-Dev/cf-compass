const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  buildContestContext,
  buildLineDiff,
  buildSubmissionTimeline,
  createAiService,
  normalizeAiReview,
  selectSourceCandidates,
} = require("../electron/services/ai-service.cjs");
const { buildDemoAiData } = require("../electron/services/ai-demo-data.cjs");

async function main() {
  const contest = {
    contestId: 1900,
    contestName: "Mock Round",
    category: { label: "Div.2" },
    durationSeconds: 7200,
    solved: 1,
    totalProblems: 2,
    problems: [
      {
        contestId: 1900,
        index: "A",
        name: "Warmup",
        rating: 800,
        tags: ["implementation"],
        contestResult: "solved",
        contestAttempts: 2,
        rejectedAttempts: 1,
        currentStatus: "mastered",
        currentAcCount: 2,
      },
      {
        contestId: 1900,
        index: "B",
        name: "Graph",
        rating: 1200,
        tags: ["graphs"],
        contestResult: "unresolved",
        contestAttempts: 1,
        rejectedAttempts: 1,
        currentStatus: "new",
        currentAcCount: 0,
      },
    ],
  };
  const cache = {
    problems: [
      { contestId: 2001, index: "A", name: "Graph Practice", rating: 1200, tags: ["graphs"] },
      { contestId: 2002, index: "B", name: "Implementation Practice", rating: 900, tags: ["implementation"] },
    ],
    submissions: [
      {
        id: 1,
        verdict: "WRONG_ANSWER",
        relativeTimeSeconds: 120,
        creationTimeSeconds: 100,
        problem: { contestId: 1900, index: "A" },
        author: { participantType: "CONTESTANT" },
      },
      {
        id: 2,
        verdict: "OK",
        relativeTimeSeconds: 600,
        creationTimeSeconds: 200,
        problem: { contestId: 1900, index: "A" },
        author: { participantType: "CONTESTANT" },
      },
      {
        id: 3,
        verdict: "OK",
        relativeTimeSeconds: 8000,
        creationTimeSeconds: 300,
        problem: { contestId: 1900, index: "B" },
        author: { participantType: "CONTESTANT" },
      },
    ],
    syncMeta: { incremental: true },
  };
  const study = {
    settings: { language: "zh-CN" },
    notes: {
      "1900-A": { keyIdea: "Use a direct invariant.", mistakeTags: ["粗心"] },
    },
  };

  const context = buildContestContext({ contest, cache, study });
  assert.equal(buildSubmissionTimeline({ contest, cache }).length, 2);
  const manyAttempts = {
    submissions: Array.from({ length: 12 }, (_, index) => ({
      id: 100 + index,
      verdict: index === 11 ? "OK" : "WRONG_ANSWER",
      relativeTimeSeconds: 120 + index * 120,
      creationTimeSeconds: 100 + index * 120,
      contestId: 1900,
      problem: { contestId: 1900, index: "A" },
      author: { participantType: "CONTESTANT" },
    })),
  };
  assert.equal(selectSourceCandidates(manyAttempts, contest).length, 12);
  const simpleDiff = buildLineDiff("line 1\nold\n", "line 1\nnew\n");
  assert.equal(simpleDiff.addedLines, 1);
  assert.equal(simpleDiff.removedLines, 1);
  assert.match(simpleDiff.patch, /-old/);
  assert.match(simpleDiff.patch, /\+new/);
  assert.equal(buildLineDiff("same\n", "same\n").patch, "");
  assert.deepEqual(context.problems[0].verdictCounts, { WRONG_ANSWER: 1, OK: 1 });
  assert.equal(context.problems[1].verdictCounts.OK, undefined);
  assert.equal(context.problems[0].note.keyIdea, "Use a direct invariant.");
  assert.deepEqual(normalizeAiReview({
    summary: "summary",
    problemInsights: [
      { problemKey: "1900-A", observation: "keep" },
      { problemKey: "9999-Z", observation: "discard" },
    ],
    actions: [{ title: "Action", problemKeys: ["1900-A", "9999-Z"] }],
  }, { allowedProblemKeys: new Set(context.allowedProblemKeys) }).problemInsights, [
    { problemKey: "1900-A", title: "", observation: "keep", recommendation: "" },
  ]);

  const demoData = buildDemoAiData();
  assert.equal(demoData.replay.isDemo, true);
  assert.equal(demoData.replay.contests.length, 5);
  assert.ok(demoData.cache.submissions.length > 10);
  assert.ok(demoData.study.notes["2250-A"]);

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "cf-compass-ai-"));
  const storedJson = new Map();
  let requestCount = 0;
  const previousDeepSeekKey = process.env.DEEPSEEK_API_KEY;
  const previousCompatKey = process.env.CF_COMPASS_DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.CF_COMPASS_DEEPSEEK_API_KEY;
  try {
    const service = createAiService({
      dataPath: (filename) => path.join(temporaryDirectory, filename),
      readJson: async (filename, fallback) => storedJson.has(filename) ? storedJson.get(filename) : fallback,
      writeJson: async (filename, value) => storedJson.set(filename, value),
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
        decryptString: (value) => value.toString("utf8").replace(/^encrypted:/, ""),
      },
      net: {
        fetch: async (_url, options) => {
          requestCount += 1;
          const body = JSON.parse(options.body);
          assert.equal(body.model, "mock-model");
          assert.equal(body.response_format.type, "json_object");
          assert.deepEqual(body.thinking, { type: "disabled" });
          assert.match(body.messages[1].content, /1900-A/);
          if (requestCount === 3) assert.match(body.messages[1].content, /source for 1900-A/);
          if (requestCount === 4) {
            assert.match(body.messages[1].content, /2001-A/);
            return {
              ok: true,
              status: 200,
              text: async () => "",
              json: async () => ({ choices: [{ message: { content: JSON.stringify({ recommendations: [
                { id: "2001-A", reason: "补强图论", focus: "图建模" },
                { id: "9999-Z", reason: "必须过滤" },
              ] }) } }] }),
            };
          }
          if (requestCount === 1) {
            return {
              ok: true,
              status: 200,
              text: async () => "",
              json: async () => ({
                choices: [{ message: { content: '{"summary":"incomplete","actions":[{"title":"missing"}' } }],
              }),
            };
          }
          return {
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => ({
              choices: [{
                message: {
                  content: JSON.stringify({
                    summary: "基于提交证据的摘要",
                    strengths: [{ title: "稳定完成 A", evidence: "A 有一次 WA 后通过" }],
                    weaknesses: [{ title: "B 未在赛时通过", evidence: "仅有赛外提交" }],
                    timeManagement: ["先锁定有把握的题目"],
                    problemInsights: [
                      { problemKey: "1900-A", observation: "证据充分" },
                      { problemKey: "9999-Z", observation: "必须过滤" },
                    ],
                    actions: [{
                      title: "赛后补 B",
                      reason: "保留到复习队列",
                      priority: "high",
                      problemKeys: ["1900-B", "9999-Z"],
                    }],
                  }),
                },
              }],
            }),
          };
        },
      },
      getCache: async () => cache,
      getStudy: async () => study,
      getReplay: async () => ({ contests: [{ ...contest, status: "ready" }] }),
      getSubmissionSources: async ({ candidates }) =>
        candidates.map((candidate) => ({
          submissionId: candidate.id,
          problemKey: candidate.problemKey,
          verdict: candidate.verdict,
          programmingLanguage: "C++17",
          source: `// source for ${candidate.problemKey}\nint main() { return 0; }`,
        })),
    });

    assert.equal((await service.getConfig()).hasApiKey, false);
    await service.setConfig(null);
    await assert.rejects(() => service.analyzeContest(1900), /未启用/);
    await service.setConfig({ enabled: true, model: "mock-model" });
    await assert.rejects(() => service.analyzeContest(1900), /尚未配置/);
    await service.setConfig({ enabled: true, model: "mock-model", apiKey: "sk-test" });
    const config = await service.getConfig();
    assert.equal(config.hasApiKey, true);
    assert.equal(config.keySource, "encrypted");
    const review = await service.analyzeContest(1900);
    assert.equal(review.contestId, 1900);
    assert.equal(review.problemInsights.length, 1);
    assert.deepEqual(review.actions[0].problemKeys, ["1900-B"]);
    assert.equal(requestCount, 2);
    const sourceReview = await service.analyzeContest(1900, { includeSource: true });
    assert.equal(sourceReview.analysisMode, "source");
    assert.equal(sourceReview.sourceIncluded, true);
    assert.equal(sourceReview.sourceSubmissionCount, 2);
    assert.equal(sourceReview.sourceTimelineCount, 2);
    assert.equal(sourceReview.sourceDiffCount, 2);
    assert.equal(sourceReview.sourceDiffs[0].kind, "initial");
    assert.match(sourceReview.sourceDiffs[0].patch, /source for 1900-A/);
    assert.equal(requestCount, 3);
    const recommendation = await service.recommendContestProblems(1900, { review });
    assert.equal(recommendation.recommendations.length, 1);
    assert.equal(recommendation.recommendations[0].problemKey, "2001-A");
    assert.equal(recommendation.recommendations[0].name, "Graph Practice");
    assert.equal(requestCount, 4);

    const demoService = createAiService({
      dataPath: (filename) => path.join(temporaryDirectory, filename),
      readJson: async (filename, fallback) => storedJson.has(filename) ? storedJson.get(filename) : fallback,
      writeJson: async (filename, value) => storedJson.set(filename, value),
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
        decryptString: (value) => value.toString("utf8").replace(/^encrypted:/, ""),
      },
      net: {
        fetch: async (_url, options) => {
          const body = JSON.parse(options.body);
          assert.deepEqual(body.thinking, { type: "disabled" });
          assert.match(body.messages[1].content, /Codeforces Round 1050/);
          assert.match(body.messages[1].content, /2250-A/);
          return {
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: "demo review" }) } }] }),
          };
        },
      },
      getCache: async () => null,
      getStudy: async () => ({ settings: { language: "zh-CN" }, notes: {} }),
      getReplay: async () => null,
      getDemoData: async () => demoData,
    });
    await demoService.setConfig({ enabled: true, model: "mock-model", apiKey: "sk-demo" });
    const demoReview = await demoService.analyzeContest(2250);
    assert.equal(demoReview.contestId, 2250);
    assert.equal(demoReview.summary, "demo review");
  } finally {
    if (previousDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousDeepSeekKey;
    if (previousCompatKey === undefined) delete process.env.CF_COMPASS_DEEPSEEK_API_KEY;
    else process.env.CF_COMPASS_DEEPSEEK_API_KEY = previousCompatKey;
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }

  console.log("ai service tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
