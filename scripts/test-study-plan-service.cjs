const assert = require("node:assert/strict");
const path = require("node:path");
const { createStudyPlanService, sanitizeStudyPlan } = require("../electron/services/study-plan-service.cjs");

async function main() {
  assert.deepEqual(sanitizeStudyPlan(undefined), { version: 1, orderVersion: 1, items: [], templateCompletions: {} });
  const oldOrder = [{ problemKey: "1-A", addedAt: "2026-11-09T02:00:00Z" }, { problemKey: "2-A", addedAt: "2026-11-09T01:00:00Z" }];
  assert.deepEqual(sanitizeStudyPlan({ items: oldOrder }).items.map((item) => item.problemKey), ["2-A", "1-A"]);
  assert.deepEqual(sanitizeStudyPlan({ orderVersion: 1, items: oldOrder }).items.map((item) => item.problemKey), ["1-A", "2-A"]);
  const store = new Map([["cache.json", { problems: [
    { contestId: 1234, index: "A", name: "Alpha", rating: 1500, tags: ["graphs"] },
    { contestId: 1234, index: "B", name: "Beta", rating: 1600, tags: ["dp"] },
  ] }]]);
  let changes = 0;
  const templates = ["graph # 模板.cpp", "tree.py"].map((filename) => ({
    filePath: path.resolve(__dirname, "fixtures", filename),
    relativePath: filename, title: path.parse(filename).name,
    language: filename.endsWith(".cpp") ? "C++" : "Python",
  }));
  const service = createStudyPlanService({
    readJson: async (name, fallback) => store.has(name) ? structuredClone(store.get(name)) : fallback,
    writeJson: async (name, value) => store.set(name, structuredClone(value)),
    getTemplate: async (filePath) => templates.find((item) => path.relative(item.filePath, filePath) === ""),
    onChanged: () => { changes += 1; },
  });

  const alpha = await service.addProblem("1234 A");
  const beta = await service.addProblem("1234-B");
  assert.deepEqual(beta.items.map((item) => item.problemKey), ["1234-A", "1234-B"]);
  const reordered = await service.reorder([beta.item.id, alpha.item.id]);
  assert.deepEqual(reordered.items.map((item) => item.problemKey), ["1234-B", "1234-A"]);
  assert.deepEqual((await service.getQueue()).items.map((item) => item.problemKey), ["1234-B", "1234-A"]);
  const done = await service.setStatus(alpha.item.id, "done");
  assert.equal(done.item.status, "done");
  assert.ok(done.item.completedAt);
  await service.remove(beta.item.id);
  assert.equal((await service.getQueue()).items.length, 1);
  assert.equal(changes, 5);

  // Templates use their own identity and work without a synced Codeforces cache.
  store.delete("cache.json");
  const [graph, tree] = await Promise.all(templates.map((item) => service.addTemplate(item.filePath)));
  assert.equal(graph.item.type, "template");
  assert.equal(graph.item.filePath, templates[0].filePath);
  assert.equal(graph.item.name, templates[0].title);
  assert.equal(graph.item.language, "C++");
  assert.notEqual(graph.item.problemKey, tree.item.problemKey);
  assert.equal((await service.getQueue()).items.length, 3, "Concurrent additions must both survive");
  assert.deepEqual((await service.getQueue()).items.map((item) => item.id), [alpha.item.id, graph.item.id, tree.item.id]);
  const duplicate = await service.addTemplate(templates[0].filePath);
  assert.equal(duplicate.added, false);
  assert.equal(duplicate.item.id, graph.item.id);
  assert.equal((await service.getQueue()).items.length, 3);

  const completed = await service.setStatus(graph.item.id, "done");
  assert.equal(completed.item.type, "template");
  assert.ok(completed.item.completedAt);
  assert.equal(completed.templateCompletions[graph.item.problemKey], 1);
  assert.equal((await service.setStatus(graph.item.id, "done")).templateCompletions[graph.item.problemKey], 1);
  const restored = createStudyPlanService({
    readJson: async (name, fallback) => structuredClone(store.get(name) || fallback),
    writeJson: async () => { throw new Error("Read-only fixture"); },
  });
  assert.deepEqual(await restored.getQueue(), await service.getQueue(), "File paths and review progress must survive restart");
  const revived = await service.addTemplate(templates[0].filePath);
  assert.equal(revived.revived, true);
  assert.equal(revived.item.id, graph.item.id);
  assert.equal(revived.item.status, "pending");
  assert.equal(revived.item.completedAt, null);
  assert.equal(revived.items.length, 3, "Reviewing again must reuse the original queue entry");
  assert.equal(revived.items.at(-1).id, graph.item.id, "A new review round belongs at the end");
  assert.equal(revived.templateCompletions[graph.item.problemKey], 1);
  assert.equal((await service.setStatus(graph.item.id, "done")).templateCompletions[graph.item.problemKey], 2);
  assert.equal((await service.setStatus(graph.item.id, "pending")).templateCompletions[graph.item.problemKey], 1);
  assert.equal((await service.setStatus(graph.item.id, "pending")).templateCompletions[graph.item.problemKey], 1);
  assert.equal((await service.setStatus(graph.item.id, "done")).templateCompletions[graph.item.problemKey], 2);

  const ordered = await service.reorder([alpha.item.id, tree.item.id, graph.item.id]);
  assert.deepEqual(ordered.items.map((item) => item.id), [alpha.item.id, tree.item.id, graph.item.id]);
  assert.equal(ordered.items[0].problemKey, "1234-A", "Existing Codeforces entries must retain their identity");
  await service.remove(tree.item.id);
  assert.equal((await service.getQueue()).items.length, 2);
  await service.remove(graph.item.id);
  assert.equal((await service.getQueue()).templateCompletions[graph.item.problemKey], 2, "Deleting the queue row retains the total");
  const addedAgain = await service.addTemplate(templates[0].filePath);
  assert.equal(addedAgain.templateCompletions[graph.item.problemKey], 2);
  assert.equal((await service.setStatus(addedAgain.item.id, "done")).templateCompletions[graph.item.problemKey], 3);
  const migrated = sanitizeStudyPlan({ items: [{ ...graph.item, status: "done" }] });
  assert.equal(migrated.templateCompletions[graph.item.problemKey], 1, "Old completed templates start at one recorded completion");
  await assert.rejects(service.addTemplate("../outside.cpp"), /模板路径无效/);
  await assert.rejects(service.addTemplate(path.resolve(__dirname, "unknown.cpp")), /模板库中找不到/);
  assert.equal((await service.addTemplate(templates[0].filePath)).added, false, "A rejected action must not block later actions");
  const malformed = sanitizeStudyPlan({ items: [
    { type: "template", filePath: "../relative.cpp", problemKey: "1234-A" },
    null, { problemKey: "1234 A" },
  ] });
  assert.deepEqual(malformed.items.map((item) => item.problemKey), ["1234-A"]);

  const fullQueue = { version: 1, items: Array.from({ length: 500 }, (_, index) => ({
    id: String(index), problemKey: `${index + 1}-A`, name: "Keep this entry",
  })) };
  store.set("study-plan.json", fullQueue);
  await assert.rejects(service.addTemplate(templates[0].filePath), /计划题单已满/);
  assert.deepEqual(store.get("study-plan.json"), fullQueue, "Adding to a full queue must not discard older entries");

  store.delete("study-plan.json");
  store.set("agent-todo.json", { items: [{ id: "legacy", problemKey: "1234 A", status: "done" }] });
  assert.equal((await service.getQueue()).items[0].problemKey, "1234-A");
  assert.equal((await service.getQueue()).items[0].status, "done");
  console.log("Study plan checks passed: legacy data, mixed queues, concurrent additions, deduplication, review progress, restart, reorder, delete, invalid paths, and capacity.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
