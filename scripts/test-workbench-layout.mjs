import test from "node:test";
import assert from "node:assert/strict";
import { PANEL_IDS, defaultFrames, clampFrame, normalizeFrames, resolveFrames, validLayout, changeFrame } from "../src/lib/workbench-layout.js";
const size = { width: 1500, height: 700 };
function bounded(f, s) {
  assert.ok(f.x >= 0 && f.y >= 0 && f.width > 0 && f.height > 0);
  assert.ok(f.x + f.width <= s.width + .001 && f.y + f.height <= s.height + .001);
}
test("presets keep all three panels visible without overlap at desktop and minimum window", () => {
  for (const s of [size, { width: 944, height: 435 }]) {
    const frames = defaultFrames(s);
    for (const id of PANEL_IDS) bounded(frames[id], s);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const a = frames[PANEL_IDS[i]], b = frames[PANEL_IDS[j]];
      assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
    }
  }
});
test("old panel order seeds the desktop preset without changing identities", () => {
  const frames = defaultFrames(size, ["progress", "problems", "taxonomy"]);
  assert.equal(frames.progress.x, 0);
  assert.ok(frames.taxonomy.x > frames.problems.x);
});
test("saved normalized frames roundtrip and remain reachable after viewport shrink", () => {
  const frames = defaultFrames(size);
  frames.taxonomy = { x: 190, y: 140, width: 310, height: 330 };
  const saved = validLayout(normalizeFrames(frames, size));
  assert.ok(saved);
  const restored = resolveFrames(saved, size);
  for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(restored.taxonomy[key] - frames.taxonomy[key]) < .001);
  for (const f of Object.values(resolveFrames(saved, { width: 800, height: 380 }))) bounded(f, { width: 800, height: 380 });
});
test("malformed, nonfinite, partial and unknown-version storage falls back to preset", () => {
  for (const value of [null, {}, [], { version: 9 }, { version: 2, frames: {} }]) assert.equal(validLayout(value), null);
  for (const bad of [NaN, Infinity, -1, "0.5", 1.5]) {
    const value = normalizeFrames(defaultFrames(size), size); value.frames.taxonomy.x = bad;
    assert.equal(validLayout(value), null);
  }
});
test("move and every resize edge obey boundaries and minimum dimensions", () => {
  const start = { x: 200, y: 150, width: 600, height: 400 };
  for (const id of PANEL_IDS) for (const mode of ["move", "n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
    for (const delta of [-10000, -150, 0, 150, 10000]) {
      const f = changeFrame(start, size, id, mode, delta, delta);
      bounded(f, size);
      assert.ok(f.width >= (id === "problems" ? 520 : 190));
      assert.ok(f.height >= (id === "problems" ? 280 : 180));
    }
  }
  assert.deepEqual(clampFrame({ x: -9, y: -9, width: 9, height: 9 }, { width: 100, height: 100 }, "problems"), { x: 0, y: 0, width: 100, height: 100 });
});
