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
    args: ["--disable-gpu", projectRoot],
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
  assert.equal(await page.locator(".plan-queue-action").first().isVisible(), true, "Today Training plan action must be visibly reachable");
  await page.getByRole("button", { name: "复习库", exact: true }).click();
  await page.waitForSelector(".review-library");
  await page.getByRole("tab", { name: "全部已刷", exact: true }).click();
  assert.ok(await page.locator(".plan-queue-action").count() > 0, "Review problem rows must expose plan actions");
  await page.getByRole("tab", { name: "时间轴", exact: true }).click();
  await page.waitForSelector(".timeline-event");
  assert.equal(await page.locator(".timeline-event .plan-queue-action").first().isVisible(), true, "Review timeline plan action must be visibly reachable");

  await page.getByRole("button", { name: "计划题单", exact: true }).click();
  await page.waitForSelector(".study-plan-page");
  assert.equal(await page.locator(".study-plan-item").count(), 2);
  assert.deepEqual(await page.locator(".study-plan-item__order b").allTextContents(), ["1", "2"]);
  const initialIds = await page.locator(".study-plan-item__id").allTextContents();
  const [planWindow] = await Promise.all([
    app.waitForEvent("window"),
    page.getByRole("button", { name: "打开独立题单", exact: true }).click(),
  ]);
  await planWindow.waitForSelector(".study-plan-window-shell");
  assert.equal(await planWindow.locator(".study-plan-window-item").count(), 2, "Independent window must show the complete queue");

  const nativeInitial = await app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    const main = windows.find((window) => !window.webContents.getURL().includes("studyPlanWindow=1"));
    const plan = windows.find((window) => window.webContents.getURL().includes("studyPlanWindow=1"));
    return { count: windows.length, main: main.getBounds(), plan: plan.getBounds(), resizable: plan.isResizable() };
  });
  assert.equal(nativeInitial.count, 2, "Study plan must be a separate native BrowserWindow");
  assert.equal(nativeInitial.resizable, true, "Independent study plan window must be edge-resizable");
  assert.ok(nativeInitial.plan.width >= 440 && nativeInitial.plan.height >= 520, "Independent window must open at a practical size");

  const nativeMoved = await app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    const main = windows.find((window) => !window.webContents.getURL().includes("studyPlanWindow=1"));
    const plan = windows.find((window) => window.webContents.getURL().includes("studyPlanWindow=1"));
    const mainBounds = main.getBounds();
    const before = plan.getBounds();
    plan.setBounds({ x: mainBounds.x + mainBounds.width + 24, y: mainBounds.y + 60, width: before.width + 70, height: before.height + 50 });
    return { main: mainBounds, plan: plan.getBounds() };
  });
  assert.ok(nativeMoved.plan.x > nativeMoved.main.x + nativeMoved.main.width, "Independent window must be movable outside the main window");
  assert.ok(nativeMoved.plan.width > nativeInitial.plan.width && nativeMoved.plan.height > nativeInitial.plan.height, "Native window bounds must be resizable");

  const planItems = planWindow.locator(".study-plan-window-item");
  await planItems.nth(1).dragTo(planItems.nth(0));
  const reorderedIds = [initialIds[1], initialIds[0]];
  await page.waitForFunction((expected) => document.querySelector(".study-plan-item__id")?.textContent === expected, reorderedIds[0]);
  assert.deepEqual(await planWindow.locator(".study-plan-window-order b").allTextContents(), ["1", "2"]);
  assert.deepEqual(await page.locator(".study-plan-item__id").allTextContents(), reorderedIds, "Child-window reorder must sync to the main page");
  await planWindow.screenshot({ path: path.join(outputRoot, "study-plan-independent-window.png") });
  await page.screenshot({ path: path.join(outputRoot, "study-plan-pending.png") });

  const completedKey = reorderedIds[0];
  await planWindow.getByRole("button", { name: `完成 ${completedKey}`, exact: true }).click();
  await planWindow.locator(".study-plan-window-item.is-done").waitFor();
  assert.equal(await planWindow.locator(".study-plan-window-item").count(), 2, "Completing a problem must keep it in the independent queue");
  await page.locator(".study-plan-item.is-done").waitFor();
  const childDecoration = await planWindow.locator(".study-plan-window-item.is-done .study-plan-window-problem strong").evaluate((element) => getComputedStyle(element).textDecorationLine);
  const mainDecoration = await page.locator(".study-plan-item.is-done .study-plan-item__title").evaluate((element) => getComputedStyle(element).textDecorationLine);
  assert.match(childDecoration, /line-through/, "Completed child-window item must be crossed out");
  assert.match(mainDecoration, /line-through/, "Completed state must sync and cross out the main-page item");
  await planWindow.screenshot({ path: path.join(outputRoot, "study-plan-independent-completed.png") });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "计划题单", exact: true }).click();
  assert.equal(await page.locator(".study-plan-item__id").first().textContent(), completedKey, "Child-window order must survive reload");
  await page.locator(".study-plan-item.is-done").waitFor();
  assert.equal(await page.getByRole("button", { name: `将 ${completedKey} 恢复为待完成`, exact: true }).count(), 1, "Done state must survive reload");
  await planWindow.getByRole("button", { name: `将 ${completedKey} 恢复为待完成`, exact: true }).click();
  await page.locator(".study-plan-board").getByRole("button", { name: `完成 ${completedKey}`, exact: true }).waitFor();

  for (const key of reorderedIds) {
    await planWindow.getByRole("button", { name: `从独立题单删除 ${key}`, exact: true }).click();
  }
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
    independentNativeWindow: true,
    nativeInitial,
    nativeMoved,
    deletionPersisted: true,
    minimumViewport: fit,
    screenshots: [
      path.join(outputRoot, "problemset-plan-button.png"),
      path.join(outputRoot, "study-plan-pending.png"),
      path.join(outputRoot, "study-plan-independent-window.png"),
      path.join(outputRoot, "study-plan-independent-completed.png"),
      path.join(outputRoot, "study-plan-minimum-viewport.png"),
    ],
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (app) await app.close();
});
