const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { _electron: electron } = require("playwright-core");
const { makeFixture } = require("./fixtures/contest-sessions.cjs");
const root = path.resolve(__dirname, ".."), output = path.join(root, "output/playwright", `workbench-${Date.now()}`);
const userData = path.join(output, "user-data"), key = "cf-compass-workbench-layout-v2";
fs.mkdirSync(userData, { recursive: true });
const fixture = makeFixture();
fixture.study.settings.reduceMotion = false;
for (const [name, value] of [["cache", fixture.cache], ["study", fixture.study]]) fs.writeFileSync(path.join(userData, `${name}.json`), JSON.stringify(value));
let app, page; const errors = [], checks = [];
const panel = (id) => page.locator(`[data-panel-id='${id}']`);
const rect = (id) => panel(id).boundingBox();
const near = (a, b) => assert.ok(Math.abs(a - b) < 2, `${a} vs ${b}`);
async function launch() {
  app = await electron.launch({ executablePath: process.env.CF_COMPASS_QA_EXECUTABLE || path.join(root, "node_modules/electron/dist/electron.exe"), args: process.env.CF_COMPASS_QA_EXECUTABLE ? [] : [root], cwd: root,
    env: { ...process.env, CF_COMPASS_USER_DATA: userData } });
  page = await app.firstWindow(); page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForSelector(".workbench-move");
}
async function drag(locator, dx, dy, cancel = false) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
}
async function inside() {
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".workbench-canvas").getBoundingClientRect();
    return [...document.querySelectorAll("[data-panel-id]")].every((panel) => {
      const r = panel.getBoundingClientRect();
      return r.x >= canvas.x - 1 && r.y >= canvas.y - 1 && r.right <= canvas.right + 1 && r.bottom <= canvas.bottom + 1;
    });
  });
  const canvas = await page.locator(".workbench-canvas").boundingBox();
  for (const id of ["taxonomy", "problems", "progress"]) {
    assert.equal(await panel(id).isVisible(), true);
    const r = await rect(id);
    assert.ok(r.x >= canvas.x - 1 && r.y >= canvas.y - 1 && r.x + r.width <= canvas.x + canvas.width + 1 && r.y + r.height <= canvas.y + canvas.height + 1);
  }
}
(async () => {
  await launch(); await inside();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const search = page.locator("#problem-search");
  await search.fill("1901"); assert.equal(await search.inputValue(), "1901");
  await search.fill("");
  const motion = () => page.locator(".workbench-panel-content").first().evaluate((el) => getComputedStyle(el).scrollBehavior);
  assert.equal(await motion(), "smooth");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await motion(), "auto");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator(".app-shell").evaluate((el) => el.classList.add("reduce-motion"));
  assert.equal(await motion(), "auto");
  await page.locator(".app-shell").evaluate((el) => el.classList.remove("reduce-motion"));
  checks.push("search input and native scroll motion respect system and app reduced motion");
  const initial = await rect("taxonomy");
  await page.screenshot({ path: path.join(output, "01-preset.png") });
  await drag(panel("taxonomy").locator("[data-resize='se']"), 70, -160);
  const resized = await rect("taxonomy"); near(resized.width, initial.width + 70); near(resized.height, initial.height - 160);
  await drag(panel("taxonomy").locator(".workbench-move"), 80, 55);
  const moved = await rect("taxonomy"); near(moved.x, initial.x + 80); near(moved.y, initial.y + 55);
  const saved = await page.evaluate((key) => localStorage.getItem(key), key); assert.ok(saved);
  await drag(panel("taxonomy").locator(".workbench-move"), 60, 50, true);
  near((await rect("taxonomy")).x, moved.x); near((await rect("taxonomy")).y, moved.y);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), saved);
  await panel("taxonomy").locator(".workbench-move").focus(); await page.keyboard.press("ArrowRight");
  near((await rect("taxonomy")).x, moved.x + 10);
  await panel("taxonomy").locator("[data-resize='se']").focus(); await page.keyboard.press("ArrowDown");
  near((await rect("taxonomy")).height, moved.height + 10);
  const final = await rect("taxonomy");
  await page.screenshot({ path: path.join(output, "02-free-layout.png") });
  await page.locator(".workbench-layer-picker button").nth(2).click();
  assert.equal(await panel("progress").evaluate((el) => getComputedStyle(el).zIndex), "3");
  await page.locator(".workbench-layer-picker button").first().click();
  await panel("taxonomy").locator(".workbench-expand").click();
  near((await rect("taxonomy")).width, (await page.locator(".workbench-canvas").boundingBox()).width);
  await page.screenshot({ path: path.join(output, "03-expanded.png") });
  await panel("taxonomy").locator(".workbench-expand").click(); near((await rect("taxonomy")).width, final.width);
  await app.close(); app = null; await launch();
  const restored = await rect("taxonomy"); for (const prop of ["x", "y", "width", "height"]) near(restored[prop], final[prop]);
  checks.push("pointer drag/resize, Esc rollback, keyboard, expand/restore, cold-start persistence");
  await page.setViewportSize({ width: 1040, height: 700 }); await inside();
  await page.getByRole("button", { name: "智能复位", exact: true }).click();
  await page.waitForFunction((key) => !localStorage.getItem(key), key);
  await inside();
  const small = await rect("progress"); assert.ok(small.height > 100);
  const problemBox = await rect("problems"), rangeBox = await panel("problems").locator(".rating-range-control").boundingBox();
  assert.ok(rangeBox.x + rangeBox.width <= problemBox.x + problemBox.width + 1, "small panel must adapt its filter controls instead of clipping them");
  await page.screenshot({ path: path.join(output, "04-small-reset-three-panels.png") });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("button", { name: "智能复位", exact: true }).click();
  await page.waitForFunction((expected) => {
    const actual = document.querySelector('[data-panel-id="taxonomy"]').getBoundingClientRect();
    return ["x", "y", "width", "height"].every((prop) => Math.abs(actual[prop] - expected[prop]) < 2);
  }, initial, { timeout: 10000 });
  const reset = await rect("taxonomy"); for (const prop of ["x", "y", "width", "height"]) near(reset[prop], initial[prop]);
  assert.deepEqual(await page.locator(".app-shell").evaluate((el) => [el.scrollLeft, el.scrollTop]), [0, 0]);
  await page.screenshot({ path: path.join(output, "05-reset.png") });
  checks.push("viewport clamp, all panels visible at minimum size, reset restores both position and size");
  await page.evaluate((key) => localStorage.setItem(key, '{"version":2,"frames":{}}'), key); await page.reload();
  await page.waitForSelector(".workbench-move"); await inside();
  checks.push("corrupt persisted layout falls back safely");
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ passed: true, checks, errors, initial, final, reset }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, output, errors }));
})().catch(async (error) => {
  fs.writeFileSync(path.join(output, "failure.txt"), error.stack);
  if (page && !page.isClosed()) {
    fs.writeFileSync(path.join(output, "failure-geometry.json"), JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('html,body,#root,.app-shell,.app-content,.workbench,.workbench-canvas,[data-panel-id]')].map((el) => ({ class: el.className, rect: el.getBoundingClientRect().toJSON(), scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }))), null, 2));
    await page.screenshot({ path: path.join(output, "failure.png"), timeout: 5000 }).catch(() => {});
    fs.writeFileSync(path.join(output, "failure.yml"), await page.locator("body").ariaSnapshot());
  }
  console.error(error); console.error(output); process.exitCode = 1;
}).finally(async () => { if (app) await app.close(); });
