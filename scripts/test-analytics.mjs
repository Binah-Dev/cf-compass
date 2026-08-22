import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
const { buildTrainingAnalytics, resolveAnalyticsRange, zoomRatingWindow } = await vite.ssrLoadModule("/src/lib/analytics.js");
const { buildHeatmap, getHeatmapYears } = await vite.ssrLoadModule("/src/lib/stats.js");

const timestamp = (value) => Math.floor(new Date(`${value}T12:00:00`).getTime() / 1000);
const submissions = [
  { verdict: "OK", creationTimeSeconds: timestamp("2025-12-31"), problem: { contestId: 1, index: "A", tags: ["math"] } },
  { verdict: "OK", creationTimeSeconds: timestamp("2026-01-02"), problem: { contestId: 2, index: "A", tags: ["dp"] } },
  { verdict: "OK", creationTimeSeconds: timestamp("2026-01-02"), problem: { contestId: 2, index: "A", tags: ["dp"] } },
  { verdict: "WRONG_ANSWER", creationTimeSeconds: timestamp("2026-01-02"), problem: { contestId: 3, index: "A", tags: ["dp"] } },
  { verdict: "OK", creationTimeSeconds: timestamp("2026-01-03"), problem: { contestId: 3, index: "A", tags: ["dp"] } },
  { verdict: "OK", creationTimeSeconds: timestamp("2026-01-03"), problem: { contestId: 4, index: "A", tags: ["greedy"] } },
  { verdict: "OK", creationTimeSeconds: timestamp("2026-01-04"), problem: { contestId: 5, index: "A", tags: ["graphs"] } },
  { verdict: "OK", creationTimeSeconds: timestamp("2026-01-04"), problem: { contestId: 6, index: "A", tags: ["graphs"] } },
  { verdict: "OK", creationTimeSeconds: timestamp("2026-01-04"), problem: { contestId: 7, index: "A", tags: ["graphs"] } },
];

assert.deepEqual(getHeatmapYears(submissions), [2025, 2026]);
const heatmap = buildHeatmap(submissions, 2026);
const day = (key) => heatmap.find((cell) => cell.key === key);
assert.equal(day("2026-01-02").count, 1, "repeat AC must not deepen the heatmap");
assert.equal(day("2026-01-02").level, 1);
assert.equal(day("2026-01-03").level, 2);
assert.equal(day("2026-01-04").level, 3);

const range = resolveAnalyticsRange("custom", "2026-01-02", "2026-01-04", new Date("2026-08-22").getTime());
const analytics = buildTrainingAnalytics({
  problems: submissions.map((submission) => submission.problem),
  submissions,
  ratingHistory: [
    { contestId: 10, ratingUpdateTimeSeconds: timestamp("2026-01-03"), oldRating: 1400, newRating: 1450 },
  ],
}, range);
assert.equal(analytics.firstSolved, 6);
assert.equal(analytics.submissions, 8);
assert.equal(analytics.accepted, 7);
assert.equal(Number(analytics.acceptanceRate.toFixed(1)), 87.5);
assert.equal(analytics.activeDays, 3);
assert.equal(analytics.ratingHistory.length, 1);
assert.equal(analytics.tagPerformance.find((item) => item.tag === "dp")?.submissions, 4);
assert.ok(
  analytics.tagPerformance.every((item) => item.solved > 0),
  "algorithm ranking must only include tags with solved problems",
);
assert.ok(
  analytics.tagPerformance.every(
    (item, index, list) => index === 0 || list[index - 1].rate >= item.rate,
  ),
  "algorithm ranking must be ordered by acceptance rate",
);

const centeredZoom = zoomRatingWindow([0, 14], 15, "in", 0.5);
assert.deepEqual(centeredZoom, [2, 12], "wheel zoom should contract around the cursor anchor");
const rightAnchoredZoom = zoomRatingWindow([0, 14], 15, "in", 1);
assert.deepEqual(rightAnchoredZoom, [4, 14], "right-side wheel zoom should keep the latest contest visible");
assert.deepEqual(
  zoomRatingWindow(rightAnchoredZoom, 15, "out", 1),
  [0, 14],
  "wheel zoom-out should expand around the same anchor",
);

console.log("analytics and yearly heatmap checks passed");
await vite.close();
