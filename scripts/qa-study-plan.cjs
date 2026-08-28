const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require("playwright-core");

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, "output", "playwright", "study-plan");
const userDataRoot = path.join(outputRoot, `user-data-${Date.now()}`);
fs.mkdirSync(userDataRoot, { recursive: true });
fs.writeFileSync(path.join(userDataRoot, "study.json"), JSON.stringify({
  version: 1,
  notes: {},
  reviews: {},
  contestQueue: [],
  plan: null,
  settings: {
    language: "zh-CN",
    themeVersion: 7,
    wallpaperEnabled: false,
    wallpaperId: "",
    panelOpacity: 86,
    interfaceDensity: "comfortable",
    reduceMotion: true,
  },
}, null, 2));
fs.writeFileSync(path.join(userDataRoot, "cache.json"), JSON.stringify({
  version: 2,
  handle: "plan_fixture",
  user: { handle: "plan_fixture", rating: 1680 },
  problems: [
    { contestId: 1234, index: "A", name: "Plan Fixture One", rating: 1700, tags: ["graphs", "greedy"] },
    { contestId: 1234, index: "B", name: "Plan Fixture Two", rating: 1800, tags: ["dp"] },
  ],
  submissions: [{
    id: 1,
    contestId: 1234,
    problem: { contestId: 1234, index: "A", name: "Plan Fixture One", rating: 1700, tags: ["graphs", "greedy"] },
    verdict: "OK",
    creationTimeSeconds: 1787839200,
  }],
  ratingHistory: [],
  problemsetSyncedAt: "2026-08-28T00:00:00.000Z",
  syncedAt: "2026-08-28T00:00:00.000Z",
  isDemo: false,
}));
fs.writeFileSync(path.join(userDataRoot, "favorites.json"), "[]");

let app;

(async () => {
  const errors = [];
  app = await electron.launch({
    executablePath: path.join(projectRoot, "node_modules/electron/dist/electron.exe"),
    args: [projectRoot],
    cwd: projectRoot,
    env: { ...process.env, CF_COMPASS_USER_DATA: userDataRoot },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 940 });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.waitForSelector(".problem-row");
  assert.equal(await page.getByRole("button", { name: "收藏", exact: true }).count(), 0, "Standalone Favorites nav must be removed");
  assert.equal(await page.getByRole("button", { name: "计划题单", exact: true }).count(), 1, "Study Plan nav must exist");

  const addButton = page.getByRole("button", { name: "加入计划题单", exact: true }).first();
  await addButton.click();
  await page.getByRole("button", { name: "已在计划题单", exact: true }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "已在计划题单", exact: true }).first().isDisabled(), true);
  await page.getByRole("button", { name: "加入计划题单", exact: true }).first().click();
  await page.getByRole("button", { name: "已在计划题单", exact: true }).nth(1).waitFor();
  await page.screenshot({ path: path.join(outputRoot, "problemset-plan-button.png") });

  await page.getByRole("button", { name: "今日训练", exact: true }).click();
  await page.waitForSelector(".today-page");
  assert.ok(await page.locator(".plan-queue-action").count() > 0, "Today Training problem cards must expose plan actions");
  await page.getByRole("button", { name: "复习库", exact: true }).click();
  await page.waitForSelector(".review-library");
  await page.getByRole("tab", { name: "全部已刷", exact: true }).click();
  assert.ok(await page.locator(".plan-queue-action").count() > 0, "Review problem rows must expose plan actions");

  await page.getByRole("button", { name: "计划题单", exact: true }).click();
  await page.waitForSelector(".study-plan-page");
  assert.equal(await page.locator(".study-plan-item").count(), 2);
  assert.deepEqual(await page.locator(".study-plan-item__order b").allTextContents(), ["1", "2"]);
  await page.getByRole("complementary", { name: "待刷题悬浮题单" }).waitFor();
  const floatingGeometry = await page.locator(".study-plan-float").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { top: rect.top, right: innerWidth - rect.right, width: rect.width, height: rect.height, resize: style.resize };
  });
  assert.ok(floatingGeometry.top < 180 && floatingGeometry.right < 50, "Floating plan must open near the upper-right corner");
  assert.ok(floatingGeometry.width >= 400 && floatingGeometry.height >= 400, "Floating plan must be a practical working size");
  assert.equal(floatingGeometry.resize, "both", "Floating plan must be user-resizable");
  const floatingItems = page.locator(".study-plan-float__list article");
  assert.equal(await floatingItems.count(), 2);
  await floatingItems.nth(1).dragTo(floatingItems.nth(0));
  await page.waitForFunction(() => document.querySelector(".study-plan-item__id")?.textContent === "1234-A");
  assert.deepEqual(await page.locator(".study-plan-item__order b").allTextContents(), ["1", "2"]);
  await page.screenshot({ path: path.join(outputRoot, "study-plan-floating.png") });
  await page.screenshot({ path: path.join(outputRoot, "study-plan-pending.png") });

  await page.locator(".study-plan-board").getByRole("button", { name: "完成 1234-A", exact: true }).click();
  await page.locator(".study-plan-item.is-done").waitFor();
  const decoration = await page.locator(".study-plan-item.is-done .study-plan-item__title").evaluate((element) => getComputedStyle(element).textDecorationLine);
  assert.match(decoration, /line-through/, "Completed problem title must be crossed out");
  await page.screenshot({ path: path.join(outputRoot, "study-plan-completed.png") });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "计划题单", exact: true }).click();
  assert.equal(await page.locator(".study-plan-item__id").first().textContent(), "1234-A", "Dragged order must survive reload");
  await page.locator(".study-plan-item.is-done").waitFor();
  assert.equal(await page.getByRole("button", { name: "将 1234-A 恢复为待完成", exact: true }).count(), 1, "Done state must survive reload");
  await page.locator(".study-plan-board").getByRole("button", { name: "将 1234-A 恢复为待完成", exact: true }).click();
  await page.locator(".study-plan-board").getByRole("button", { name: "完成 1234-A", exact: true }).waitFor();

  await page.getByRole("button", { name: "从悬浮题单删除 1234-A", exact: true }).click();
  await page.getByRole("button", { name: "从悬浮题单删除 1234-B", exact: true }).click();
  await page.getByText("计划题单还是空的", { exact: true }).waitFor();
  assert.equal(await page.locator(".study-plan-item").count(), 0);

  await page.setViewportSize({ width: 1040, height: 700 });
  const fit = await page.evaluate(() => {
    const shell = document.querySelector(".app-shell")?.getBoundingClientRect();
    const hero = document.querySelector(".study-plan-hero")?.getBoundingClientRect();
    const board = document.querySelector(".study-plan-board")?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      shell: shell ? { left: shell.left, top: shell.top, right: shell.right, bottom: shell.bottom } : null,
      hero: hero ? { left: hero.left, top: hero.top, right: hero.right, bottom: hero.bottom } : null,
      board: board ? { left: board.left, top: board.top, right: board.right, bottom: board.bottom } : null,
      canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  assert.equal(fit.canScrollX, false, "Plan page must not overflow horizontally at the minimum viewport");
  assert.ok(fit.hero && fit.hero.right <= fit.viewport.width && fit.hero.bottom <= fit.viewport.height, "Plan hero must fit the minimum viewport");
  assert.ok(fit.board && fit.board.right <= fit.viewport.width && fit.board.top < fit.viewport.height, "Plan board must remain visible at the minimum viewport");
  await page.screenshot({ path: path.join(outputRoot, "study-plan-minimum-viewport.png") });

  const queue = JSON.parse(fs.readFileSync(path.join(userDataRoot, "study-plan.json"), "utf8"));
  assert.deepEqual(queue.items, [], "Manual delete must persist an empty queue");
  assert.deepEqual(errors, [], "Renderer must not emit errors");

  console.log(JSON.stringify({
    status: "ok",
    standaloneFavoritesNav: 0,
    planNav: 1,
    completionPersistedAcrossReload: true,
    reorderPersistedAcrossReload: true,
    floatingGeometry,
    deletionPersisted: true,
    minimumViewport: fit,
    screenshots: [
      path.join(outputRoot, "problemset-plan-button.png"),
      path.join(outputRoot, "study-plan-pending.png"),
      path.join(outputRoot, "study-plan-floating.png"),
      path.join(outputRoot, "study-plan-completed.png"),
      path.join(outputRoot, "study-plan-minimum-viewport.png"),
    ],
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (app) await app.close();
});
