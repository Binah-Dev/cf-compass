const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { _electron: electron } = require("playwright-core");
const { makeFixture, virtualOne, virtualTwo, submission } = require("./fixtures/contest-sessions.cjs");
const { makeReferenceFixture } = require("./fixtures/virtual-reference.cjs");
const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, "output", "playwright", `issue-25-${Date.now()}`);
const userData = path.join(outputRoot, "user-data");
fs.mkdirSync(userData, { recursive: true });
const fixture = makeFixture();
const write = (name, data) => fs.writeFileSync(path.join(userData, name), JSON.stringify(data, null, 2));
write("cache.json", fixture.cache);
write("contest-center.json", fixture.center);
write("study.json", fixture.study);
let app;
let page;
const errors = [];
const steps = [];
async function launch() {
  app = await electron.launch({
    executablePath: process.env.CF_COMPASS_QA_EXECUTABLE || path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe"),
    args: process.env.CF_COMPASS_QA_EXECUTABLE ? ["--disable-gpu"] : ["--disable-gpu", projectRoot], cwd: projectRoot,
    env: { ...process.env, CF_COMPASS_USER_DATA: userData },
  });
  page = await app.firstWindow();
  const referenceFixture = makeReferenceFixture();
  await app.evaluate((_electron, fixture) => {
    globalThis.fetch = async (url) => ({ ok: true, json: async () => ({ status: "OK",
      result: String(url).includes("contest.ratingChanges") ? fixture.ratingChanges : fixture.standings }) });
  }, { standings: referenceFixture.standings, ratingChanges: referenceFixture.ratingChanges });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForSelector(".app-shell");
}
async function snapshot(name) {
  fs.writeFileSync(path.join(outputRoot, name + ".yml"), await page.locator("body").ariaSnapshot());
  await page.screenshot({ path: path.join(outputRoot, name + ".png") });
}
async function center(english = false) {
  await page.getByRole("button", { name: english ? "Contest Center" : "赛事中心", exact: true }).click();
  await page.waitForSelector(".contest-center-page");
}
async function queue(english = false) {
  await center(english);
  await page.locator(".contest-center-shell > .contest-center-quick").getByRole("button", { name: english ? "Needs Upsolving" : "待补题", exact: true }).click();
  await page.waitForSelector(".contest-upsolve-queue");
}
async function rows(count) {
  await page.waitForFunction((expected) => document.querySelectorAll(".contest-upsolve-item").length === expected, count);
}
async function persistedStudy(predicate) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const study = JSON.parse(fs.readFileSync(path.join(userData, "study.json"), "utf8"));
    if (predicate(study)) return study;
    await page.waitForTimeout(50);
  }
  throw Error("Timed out waiting for the expected study data to reach disk");
}
async function layout(name) {
  const result = await page.evaluate(() => {
    const queue = document.querySelector(".contest-upsolve-list")?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      rootWidth: document.documentElement.scrollWidth,
      queue: queue ? { top: queue.top, bottom: queue.bottom, height: queue.height } : null,
    };
  });
  assert.ok(result.rootWidth <= result.viewport.width + 1, `${name}: horizontal root overflow`);
  if (result.queue) {
    assert.ok(result.queue.height > 50, `${name}: queue collapsed`);
    assert.ok(result.queue.bottom <= result.viewport.height + 1, `${name}: queue offscreen`);
  }
  steps.push({ name, layout: result });
}
(async () => {
  await launch();
  await center();
  await page.waitForSelector(".contest-center-row");
  await snapshot("01-center-before");
  const never = page.locator(".contest-center-row").filter({ hasText: "Never participated" });
  await never.locator(".contest-center-row__summary").click();
  await never.getByRole("button", { name: "加入补题", exact: true }).click();
  await rows(2);
  await persistedStudy((study) => study.contestQueue.length === 2);
  let saved = JSON.parse(fs.readFileSync(path.join(userData, "study.json"), "utf8"));
  assert.equal(saved.contestQueueProblems["1901-A"].name, fixture.center.details[1901].problems[0].name);
  assert.deepEqual(saved.contestQueue, ["1901-A", "1901-B"]);
  await layout("queue-desktop");
  await snapshot("02-queue-persistent");
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("study:set");
    ipcMain.handle("study:set", () => { throw Error("Simulated queue save failure"); });
  });
  await page.getByRole("button", { name: "移出补题 1901-B", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent.includes("Simulated queue save failure"));
  await rows(2);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(userData, "study.json"), "utf8")).contestQueue, ["1901-A", "1901-B"]);
  steps.push({ name: "failed-save-restores-persisted-queue", preserved: ["1901-A", "1901-B"] });
  await app.close(); app = null;
  await launch();
  await queue();
  await rows(2);
  await page.setViewportSize({ width: 1040, height: 700 });
  await layout("queue-minimum-window");
  await snapshot("03-queue-minimum-window");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("button", { name: "赛事复盘", exact: true }).click();
  await page.waitForSelector(".contest-record");
  await page.locator(".contest-participation-tabs").getByRole("button", { name: "虚拟参赛", exact: true }).click();
  assert.equal(await page.locator(".contest-record").count(), 2);
  await page.waitForFunction(() => /\d/.test(document.querySelector(".contest-record .contest-performance strong")?.textContent || ""));
  const secondSession = page.locator(".contest-record").first();
  assert.equal(await secondSession.locator(".contest-performance strong").innerText(), "1868");
  assert.match(await secondSession.getAttribute("class"), /performance-tone-blue/);
  if (await secondSession.locator(".contest-detail").count()) await secondSession.locator(".contest-record__row").click();
  await snapshot("04a-automatic-reference-collapsed-list");
  if (await secondSession.locator(".contest-detail").count() === 0) await secondSession.locator(".contest-record__row").click();
  assert.match(await secondSession.locator(".contest-session-note").innerText(), /虚拟参赛/);
  assert.equal(await secondSession.locator(".contest-problem-row").filter({ hasText: "Fixture 1900A" }).locator(".contest-attempt-count strong").innerText(), "0");
  await secondSession.locator(".contest-session-timeline summary").click();
  assert.equal(await secondSession.locator(".contest-session-timeline li").count(), 2);
  await snapshot("04-virtual-second-session");
  const overallBeforeReference = await page.locator(".contest-summary-strip").innerText();
  await page.waitForFunction(() => /\d/.test(document.querySelector(".contest-virtual-reference strong")?.textContent || ""));
  assert.equal(await page.locator(".contest-summary-strip").innerText(), overallBeforeReference);
  const withReference = await page.evaluate(() => window.cfBridge.getContestReplay());
  const referenceEntry = withReference.contests.find((entry) => entry.replayId.endsWith(":1700200000"));
  assert.equal(referenceEntry.virtualReference.status, "ready");
  assert.equal(referenceEntry.performance, null);
  assert.equal(referenceEntry.ratingDelta, null);
  assert.equal(referenceEntry.officialRank, null);
  await snapshot("04b-virtual-reference-isolated");
  steps.push({ name: "automatic-single-session-reference-in-list-excluded-from-overall", reference: referenceEntry.virtualReference });
  const firstSession = page.locator(".contest-record").nth(1);
  await firstSession.locator(".contest-record__row").click();
  assert.equal(await firstSession.locator(".contest-problem-row").filter({ hasText: "Fixture 1900A" }).locator(".contest-attempt-count strong").innerText(), "3");
  assert.equal(await firstSession.locator(".contest-problem-row").filter({ hasText: "Fixture 1900B" }).locator(".contest-attempt-count strong").innerText(), "1");
  await firstSession.locator(".contest-session-timeline summary").click();
  assert.equal(await firstSession.locator(".contest-session-timeline li").count(), 4);
  const c = firstSession.locator(".contest-problem-row").filter({ hasText: "Fixture 1900C" });
  await c.getByRole("button", { name: "加入补题", exact: true }).click();
  await persistedStudy((study) => study.contestQueue.includes("1900-C"));
  await snapshot("05-virtual-first-session");
  const replay = await page.evaluate(() => window.cfBridge.getContestReplay());
  assert.equal(replay.contests.filter((entry) => entry.participationType === "VIRTUAL").length, 2);
  assert.equal(replay.contests.find((entry) => entry.replayId === `1900:virtual:${virtualOne}`).solved, 1);
  assert.equal(replay.contests.find((entry) => entry.replayId === `1900:virtual:${virtualTwo}`).solved, 0);
  steps.push({ name: "virtual-session-isolation", replayIds: replay.contests.map((entry) => entry.replayId) });
  await app.close(); app = null;
  // Simulate a real cold start with contest metadata gone, not merely a component rerender.
  write("contest-center.json", { ...fixture.center, details: {} });
  fixture.cache.submissions.unshift(submission(99, "PRACTICE", virtualTwo, 800, "OK", "A", 1901));
  write("cache.json", fixture.cache);
  await launch();
  await queue();
  await rows(2);
  await page.getByRole("button", { name: "全部已加入", exact: true }).click();
  await rows(3);
  assert.match(await page.locator(".contest-upsolve-list").innerText(), /Persistent local snapshot/);
  await page.getByRole("button", { name: "已完成", exact: true }).click();
  await rows(1);
  await page.getByRole("button", { name: "移出补题 1901-A", exact: true }).click();
  await rows(0);
  await persistedStudy((study) =>
    !study.contestQueue.includes("1901-A") && study.contestQueue.includes("1901-B") && !study.contestQueueProblems?.["1901-A"]);
  saved = JSON.parse(fs.readFileSync(path.join(userData, "study.json"), "utf8"));
  assert.equal(saved.contestQueueProblems["1901-A"], undefined);
  assert.equal(saved.contestQueueProblems["1901-B"].name, "Persistent local snapshot");
  steps.push({ name: "cold-start-completion-removal", remainingQueue: saved.contestQueue });
  await page.getByRole("button", { name: "全部已加入", exact: true }).click();
  await rows(2);
  await snapshot("06-cold-start-restored");
  await app.close(); app = null;
  // Offline and English fixtures use the same persistent queue, with no center cache.
  write("contest-center.json", {});
  write("study.json", { ...saved, settings: { ...saved.settings, language: "en-US" } });
  await launch();
  await app.evaluate(() => { globalThis.fetch = async () => { throw Error("Offline fixture"); }; });
  await queue(true);
  await rows(2);
  await page.waitForFunction(() => document.querySelector(".contest-queue-notice")?.textContent.includes("failed"), { timeout: 15000 });
  await layout("offline-english-queue");
  await snapshot("07-offline-english");
  const residuals = await page.locator(".contest-center-page").evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const values = [];
    let node;
    while ((node = walker.nextNode())) if (/[\u3400-\u9fff]/.test(node.textContent)) values.push(node.textContent);
    for (const element of root.querySelectorAll("[aria-label],[placeholder],[title]")) {
      for (const attr of ["aria-label", "placeholder", "title"]) if (/[\u3400-\u9fff]/.test(element.getAttribute(attr) || "")) values.push(element.getAttribute(attr));
    }
    return values;
  });
  assert.deepEqual(residuals, [], "English queue contains untranslated UI");
  await page.getByRole("button", { name: "Contest Replay", exact: true }).click();
  await page.waitForSelector(".contest-record");
  await page.locator(".contest-participation-tabs").getByRole("button", { name: "Virtual Participation", exact: true }).click();
  assert.equal(await page.locator(".contest-record").count(), 2);
  if (await page.locator(".contest-detail").count() === 0) await page.locator(".contest-record__row").first().click();
  assert.match(await page.locator(".contest-detail-metrics").innerText(), /In-Session Submissions/);
  assert.match(await page.locator(".contest-virtual-reference strong").innerText(), /\d/);
  const cachedReference = await page.locator(".contest-virtual-reference strong").innerText();
  const offlineSummary = await page.locator(".contest-summary-strip").innerText();
  await page.getByRole("button", { name: "Recalculate Reference", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".contest-virtual-reference [role='status']")?.textContent.includes("previous reference is retained"));
  assert.equal(await page.locator(".contest-virtual-reference strong").innerText(), cachedReference);
  assert.equal(await page.locator(".contest-summary-strip").innerText(), offlineSummary);
  steps.push({ name: "offline-reference-refresh-retains-last-result", cachedReference });
  await snapshot("08-english-virtual-replay");
  const replayResiduals = await page.locator(".contest-replay-page").evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const values = [];
    let node;
    while ((node = walker.nextNode())) if (/[\u3400-\u9fff]/.test(node.textContent)) values.push(node.textContent);
    for (const element of root.querySelectorAll("[aria-label],[placeholder],[title]")) {
      for (const attr of ["aria-label", "placeholder", "title"]) if (/[\u3400-\u9fff]/.test(element.getAttribute(attr) || "")) values.push(element.getAttribute(attr));
    }
    return values;
  });
  assert.deepEqual(replayResiduals, [], "English replay contains untranslated UI");
  await page.setViewportSize({ width: 1040, height: 700 });
  await layout("english-replay-minimum-window");
  await snapshot("09-english-virtual-minimum-window");
  assert.deepEqual(errors, [], "Renderer errors");
  fs.writeFileSync(path.join(outputRoot, "report.json"), JSON.stringify({ passed: true, steps, errors, outputRoot }, null, 2));
  console.log(JSON.stringify({ passed: true, steps, errors, outputRoot }, null, 2));
})().catch(async (error) => {
  fs.writeFileSync(path.join(outputRoot, "failure.txt"), error.stack);
  if (page && !page.isClosed()) await snapshot("failure").catch(() => {});
  console.error(error);
  console.error("Evidence: " + outputRoot);
  process.exitCode = 1;
}).finally(async () => { if (app) await app.close(); });
