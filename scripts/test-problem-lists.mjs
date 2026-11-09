import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeProblemLists, saveProblemList, setProblemListMembership } from "../electron/shared/problem-lists.mjs";

test("named lists create, rename and retain independent memberships without mutating their source", () => {
  const first = saveProblemList([], { name: " 图论专项 ", problemKey: "1900A" });
  assert.equal(first.item.name, "图论专项");
  assert.deepEqual(first.item.problemKeys, ["1900-A"]);
  const second = saveProblemList(first.lists, { name: "周末训练" });
  const both = setProblemListMembership(second.lists, second.item.id, "1900-A", true);
  assert.deepEqual(both.map((item) => item.problemKeys), [["1900-A"], ["1900-A"]]);
  assert.deepEqual(second.item.problemKeys, []);
  const duplicated = setProblemListMembership(both, first.item.id, "1900-A", true);
  assert.equal(duplicated[0].problemKeys.length, 1);
  const removed = setProblemListMembership(duplicated, first.item.id, "1900-A", false);
  assert.deepEqual(removed.map((item) => item.problemKeys), [[], ["1900-A"]]);
  const renamed = saveProblemList(removed, { id: second.item.id, name: "第 1 周" });
  assert.deepEqual(renamed.item.problemKeys, ["1900-A"]);
  assert.equal(renamed.item.id, second.item.id);
  assert.deepEqual(normalizeProblemLists(JSON.parse(JSON.stringify(renamed.lists))), renamed.lists);
});

test("invalid names, duplicate names and unknown lists fail without losing saved lists", () => {
  const { lists, item } = saveProblemList([], { name: "Graphs" });
  for (const name of ["", "   ", "x".repeat(61)]) assert.throws(() => saveProblemList(lists, { name }), /1–60/);
  assert.throws(() => saveProblemList(lists, { name: " graphs " }), /同名/);
  assert.throws(() => saveProblemList(lists, { id: "missing", name: "Renamed" }), /不存在/);
  assert.throws(() => setProblemListMembership(lists, item.id, "template:abc", true), /无效/);
  assert.throws(() => setProblemListMembership(lists, "missing", "1900-A", true), /不存在/);
  assert.deepEqual(lists[0].problemKeys, []);
});

test("old and malformed persisted data is normalized with deduplication and bounded capacity", () => {
  assert.deepEqual(normalizeProblemLists(undefined), []);
  const restored = normalizeProblemLists([
    null, { id: "one", name: "Saved", problemKeys: ["1900A", "1900-A", "bad", "1901B"] },
    { id: "one", name: "Duplicate ID" }, { name: "Missing ID" },
  ]);
  assert.deepEqual(restored, [{ id: "one", name: "Saved", problemKeys: ["1900-A", "1901-B"] }]);
  const full = Array.from({ length: 100 }, (_, index) => ({ id: String(index), name: String(index), problemKeys: [] }));
  assert.throws(() => saveProblemList(full, { name: "Extra" }), /100/);
  const big = [{ id: "full", name: "Full", problemKeys: Array.from({ length: 5000 }, (_, index) => `${index + 1}-A`) }];
  assert.throws(() => setProblemListMembership(big, "full", "9999-A", true), /5000/);
  assert.equal(big[0].problemKeys.length, 5000);
});
