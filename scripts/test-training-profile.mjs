import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test, after } from "node:test";
import { createServer } from "vite";
import { normalizeTrainingProfile, normalizeTrainingProfiles, getTrainingProfile, getVirtualTrainingSessions, resolveTrainingRating, trainingContextKey } from "../electron/shared/training-profile.mjs";

const server = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true } });
after(() => server.close());
const p = await server.ssrLoadModule("/src/lib/planning.js");
const { normalizeStudyData } = await server.ssrLoadModule("/src/lib/study.js");
const user = { handle: "Fixture", rating: 1200 };
const study = { notes: {}, reviews: {}, settings: {} };
const withProfile = (profile) => ({ ...study, trainingProfiles: { fixture: normalizeTrainingProfile(profile) } });
const entry = (id, value, overrides = {}) => ({ replayId: `1900:virtual:${id}`, contestId: 1900, contestName: "Fixture", participationType: "VIRTUAL", sessionStartTimeSeconds: id, submissionFingerprint: "same", virtualReference: { status: "ready", performance: value, submissionFingerprint: "same", ...overrides } });
const replay = { handle: "fixture", contests: [entry(1, 1800), entry(2, 2400)] };
const virtualUser = { ...user, trainingVirtualSessions: getVirtualTrainingSessions(replay, user.handle) };
const problems = Array.from({ length: 12000 }, (_, index) => ({ contestId: 1000 + Math.floor(index / 10), index: String.fromCharCode(65 + index % 10), name: `Synthetic ${index}`, rating: 800 + index % 28 * 100, tags: [["dp"], ["math"], ["graphs"], ["greedy"], ["implementation"], ["data structures"]][Math.floor(index / 28) % 6] }));
const key = (problem) => `${problem.contestId}-${problem.index}`;

test("normalization bounds and deduplicates untrusted input in both persistence paths", () => {
  for (const value of [null, [], 42, { ratingMode: "bad", manualRating: Infinity, weakTags: [null, {}, " DP ", "dp", "<script>"], virtualSessionIds: ["1900:virtual:1", "1900:virtual:1", "123"] }]) {
    const normalized = normalizeTrainingProfile(value);
    assert.equal(normalized.ratingMode, "auto");
    assert.equal(normalized.manualRating, 1200);
    assert.deepEqual(normalizeTrainingProfile(normalized), normalized);
  }
  const profiles = JSON.parse('{"Fixture":{"manualRating":1900,"ratingMode":"manual"},"__proto__":{"x":1}}');
  const main = normalizeTrainingProfiles(profiles);
  assert.deepEqual(normalizeStudyData({ trainingProfiles: profiles }).trainingProfiles, main);
  assert.equal(Object.hasOwn(main, "__proto__"), false);
  assert.equal(main.fixture.manualRating, 1900);
});

test("official and unrated defaults match old behavior; manual reference never mutates the user", () => {
  const before = JSON.stringify(user);
  assert.equal(resolveTrainingRating(user, study).rating, 1200);
  assert.equal(resolveTrainingRating({ handle: "fixture" }, study).source, "fallback");
  for (const rating of [800, 1555, 3500]) assert.equal(resolveTrainingRating(user, withProfile({ ratingMode: "manual", manualRating: rating })).rating, rating);
  assert.equal(JSON.stringify(user), before);
  assert.equal(resolveTrainingRating({ ...user, handle: "Other" }, withProfile({ ratingMode: "manual", manualRating: 2500 })).rating, 1200);
});

test("legacy selected averages are retired; estimated mode wins over manual training override", () => {
  const profile = {useVirtual:true,virtualSessionIds:["1900:virtual:1"]};
  assert.equal(resolveTrainingRating(virtualUser,withProfile(profile)).rating,1200);
  assert.equal(resolveTrainingRating({...virtualUser,rating:1800,ratingMode:"estimated"},withProfile({...profile,ratingMode:"manual",manualRating:900})).rating,1800);
});

test("foreign, stale, partial, duplicate, practiced and boundary estimates cannot enter training", () => {
  const entries = [entry(1, 1800), entry(1, 1800), entry(2, 2400, { status: "unavailable" }), entry(3, NaN), entry(4, 2000, { submissionFingerprint: "old" }), entry(5, 2500, { boundary: "upper" }), entry(6, 2000, { practicedBefore: true }), entry(7, null), { ...entry(8, 1600), participationType: "CONTESTANT" }];
  assert.deepEqual(getVirtualTrainingSessions({ handle: "other", contests: entries }, "fixture"), []);
  assert.deepEqual(getVirtualTrainingSessions({ handle: "fixture", contests: entries }, "fixture").map((item) => item.id), ["1900:virtual:1"]);
  const configured = withProfile({ useVirtual: true, virtualSessionIds: ["1900:virtual:99"] });
  assert.equal(resolveTrainingRating(virtualUser, configured).source, "official");
});

test("manual tags support cold start and empty selection without fabricating mastery", () => {
  const manual = withProfile({ weakTagsMode: "manual", weakTags: ["graphs"] });
  const stats = p.buildTrainingMasteryStats(problems, new Map(), user, manual);
  assert.equal(stats[0].mastery, null);
  const items = p.generateWeaknessRecommendations(problems, new Map(), user, manual, 5, "fixed");
  assert.equal(items.length, 5);
  for (const item of items) {
    assert.ok(item.problem.tags.includes("graphs"));
    assert.match(item.reason, /^手动专项/);
    assert.equal(item.weakTag, "graphs");
  }
  assert.deepEqual(p.generateWeaknessRecommendations(problems, new Map(), user, withProfile({ weakTagsMode: "manual", weakTags: [] })), []);
  assert.deepEqual(p.buildMasteryStats(problems, new Map()), []);
});

test("manual tag bonus also changes mixed ranking in a controlled equal-difficulty pool", () => {
  const pool = [{ contestId: 2000, index: "A", rating: 1200, tags: ["dp"] }, { contestId: 2000, index: "B", rating: 1200, tags: ["graphs"] }];
  for (const tag of ["dp", "graphs"]) {
    const [item] = p.generateTierRecommendations(pool, new Map(), user, withProfile({ weakTagsMode: "manual", weakTags: [tag] }), p.RECOMMENDATION_TIERS[1], 1, "fixed");
    assert.deepEqual(item.problem.tags, [tag]);
  }
});

test("all bands, reviews and refreshes use the training reference and respect exclusions", () => {
  const submissions = new Map(problems.filter((_, i) => i % 5 === 0).map((problem) => [key(problem), { accepted: 1, attempts: 2, lastAc: 1700000000 }]));
  for (const rating of [800, 1200, 1900, 3500]) {
    const configured = withProfile({ ratingMode: "manual", manualRating: rating, weakTagsMode: "manual", weakTags: ["graphs", "dp"] });
    let plan = p.createDailyPlan(problems, submissions, user, configured);
    const lookup = new Map(problems.map((problem) => [key(problem), problem]));
    for (const tier of p.RECOMMENDATION_TIERS) {
      const band = p.getRecommendationBand(user, tier, configured);
      assert.equal(band.rating, rating);
      for (const problemId of plan.tierProblemKeys[tier.id]) {
        assert.ok(lookup.get(problemId).rating >= band.minimum && lookup.get(problemId).rating <= band.maximum);
        assert.ok(!submissions.get(problemId)?.accepted);
      }
      plan = p.refreshRecommendationTier(problems, submissions, user, configured, plan, tier.id);
    }
    plan = p.refreshWeaknessRecommendations(problems, submissions, user, configured, plan);
    assert.equal(new Set(plan.newProblemKeys).size, plan.newProblemKeys.length);
    for (const id of plan.newProblemKeys) assert.ok(!submissions.get(id)?.accepted);
    assert.equal(p.getReviewRatingFloor(user, configured), p.getReviewRatingFloor({ rating }, study));
  }
});

test("settings, account and changed virtual scores invalidate today's cached plan; reset restores defaults", () => {
  const plan = p.createDailyPlan(problems, new Map(), user, study);
  assert.strictEqual(p.createDailyPlan(problems, new Map(), user, { ...study, plan }), plan);
  const next = withProfile({ ratingMode: "manual", manualRating: 2100 });
  const completed = plan.newProblemKeys.slice(0, 1);
  const changed = p.createDailyPlan(problems, new Map(), user, { ...next, plan: { ...plan, completedNewKeys: completed } });
  assert.notEqual(changed.trainingContext, plan.trainingContext);
  assert.deepEqual(changed.completedNewKeys, completed);
  assert.deepEqual(p.createDailyPlan(problems, new Map(), user, { ...study, plan: changed }).tierProblemKeys, plan.tierProblemKeys);
  assert.notEqual(trainingContextKey(user, study), trainingContextKey({ ...user, handle: "other" }, study));
  const v = withProfile({ useVirtual: true, virtualSessionIds: ["1900:virtual:1"] });
  assert.notEqual(trainingContextKey(virtualUser, v), trainingContextKey({ ...virtualUser, rating:1800, ratingMode:"estimated" }, v));
});

test("empty/exhausted pools remain empty and selection is deterministic", () => {
  assert.deepEqual(p.createDailyPlan([], new Map(), user, study).newProblemKeys, []);
  const allSolved = new Map(problems.map((problem) => [key(problem), { accepted: 1 }]));
  assert.deepEqual(p.createDailyPlan(problems, allSolved, user, study).newProblemKeys, []);
  assert.deepEqual(p.createDailyPlan(problems, new Map(), user, study).newProblemKeys, p.createDailyPlan(problems, new Map(), user, study).newProblemKeys);
});

test("12,000-problem latency and optional v4.1.2 default-behavior comparison", async () => {
  const samples = [];
  const configured = withProfile({ ratingMode: "manual", manualRating: 1800, weakTagsMode: "manual", weakTags: ["graphs", "dp"] });
  for (let i = 0; i < 15; i++) {
    const start = performance.now();
    p.createDailyPlan(problems, new Map(), user, configured);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({ dataset: "12000 synthetic problems", p50Ms: samples[7], p95Ms: samples[14] }));
  assert.ok(samples[14] < 1000, "generation must remain interactive");
  if (process.env.CF_COMPASS_BASELINE_ROOT) {
    const baseline = await createServer({ configFile: false, root: process.env.CF_COMPASS_BASELINE_ROOT, server: { middlewareMode: true, watch: null, hmr: false }, appType: "custom", optimizeDeps: { noDiscovery: true } });
    try {
      const old = await baseline.ssrLoadModule("/src/lib/planning.js");
      const times = [];
      for (const rating of [undefined, 800, 1200, 1800, 3500]) {
        const persona = { handle: "fixture", rating };
        const start = performance.now();
        const before = old.createDailyPlan(problems, new Map(), persona, study);
        times.push(performance.now() - start);
        const after = p.createDailyPlan(problems, new Map(), persona, study);
        assert.deepEqual(after.newProblemKeys, before.newProblemKeys);
        assert.deepEqual(after.reviewKeys, before.reviewKeys);
      }
      console.log(JSON.stringify({ baseline: "v4.1.2", unchangedDefaultPersonas: 5, generationMs: times }));
    } finally { await baseline.close(); }
  }
});
