const assert = require("node:assert/strict");
const { createStudyPlanService, sanitizeStudyPlan } = require("../electron/services/study-plan-service.cjs");

async function main() {
  assert.deepEqual(sanitizeStudyPlan(undefined), { version: 1, items: [] });
  const store = new Map([["cache.json", { problems: [
    { contestId: 1234, index: "A", name: "Alpha", rating: 1500, tags: ["graphs"] },
    { contestId: 1234, index: "B", name: "Beta", rating: 1600, tags: ["dp"] },
  ] }]]);
  let changes = 0;
  const service = createStudyPlanService({
    readJson: async (name, fallback) => store.has(name) ? structuredClone(store.get(name)) : fallback,
    writeJson: async (name, value) => store.set(name, structuredClone(value)),
    onChanged: () => { changes += 1; },
  });

  const alpha = await service.addProblem("1234 A");
  const beta = await service.addProblem("1234-B");
  assert.deepEqual(beta.items.map((item) => item.problemKey), ["1234-B", "1234-A"]);
  const reordered = await service.reorder([alpha.item.id, beta.item.id]);
  assert.deepEqual(reordered.items.map((item) => item.problemKey), ["1234-A", "1234-B"]);
  const done = await service.setStatus(alpha.item.id, "done");
  assert.equal(done.item.status, "done");
  assert.ok(done.item.completedAt);
  await service.remove(beta.item.id);
  assert.equal((await service.getQueue()).items.length, 1);
  assert.equal(changes, 5);
  console.log("Study plan service checks passed: add, reorder, complete, persist, and remove.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
