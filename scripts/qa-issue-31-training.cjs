const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { _electron: electron } = require("playwright-core");
const { makeFixture, virtualOne, virtualTwo } = require("./fixtures/contest-sessions.cjs");
const { mergeSessions } = require("../electron/services/contest-session.cjs");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "output", "playwright", `issue-31-${Date.now()}`);
const profile = path.join(output, "user-data");
fs.mkdirSync(profile, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(profile, name), JSON.stringify(value, null, 2));
const read = (name) => JSON.parse(fs.readFileSync(path.join(profile, name), "utf8"));
const fixture = makeFixture();
fixture.study.settings.language = "en-US";
fixture.study.notes = { "1900-A": { content: "Keep this note", difficulty: 3 } };
fixture.cache.user.rating = 1200;
fixture.cache.problems = Array.from({ length: 1600 }, (_, index) => ({ contestId: 3000 + Math.floor(index / 10), index: String.fromCharCode(65 + index % 10), name: `Synthetic ${index}`, rating: 800 + index % 28 * 100, tags: Math.floor(index / 28) % 2 ? ["dp"] : ["graphs"] }));
fixture.cache.submissions = fixture.cache.submissions.filter((s) => s.author.participantType === "VIRTUAL" && s.relativeTimeSeconds <= 7200).map((s) => ({ ...s, verdict: "OK" }));
const replay = mergeSessions(fixture.cache, {}, fixture.center, () => ({ primary: "div2", divisions: [2] }), 4);
for (const entry of replay.contests) entry.virtualReference = { status: "ready", performance: entry.sessionStartTimeSeconds === virtualOne ? 1800 : 2400, submissionFingerprint: entry.submissionFingerprint, boundary: null, practicedBefore: false };
write("cache.json", fixture.cache);
write("study.json", fixture.study);
write("contest-center.json", fixture.center);
write("contest-replay.json", replay);
let app, page;
const errors = [], steps = [];
async function launch(english = true) {
  app = await electron.launch({ executablePath: process.env.CF_COMPASS_QA_EXECUTABLE || path.join(root, "node_modules", "electron", "dist", "electron.exe"), args: process.env.CF_COMPASS_QA_EXECUTABLE ? ["--disable-gpu"] : ["--disable-gpu", root], cwd: root, env: { ...process.env, CF_COMPASS_USER_DATA: profile } });
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await app.evaluate(() => { globalThis.fetch = async () => { throw Error("QA is offline"); }; });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("button", { name: english ? "Today's Training" : "今日训练", exact: true }).click();
  await page.locator(".training-preferences summary").click();
  await page.waitForFunction(() => !document.querySelector(".training-preferences fieldset")?.disabled);
}
async function rating(expected) {
  await page.waitForFunction((value) => document.querySelector('[data-testid="training-rating"]')?.textContent === String(value), expected);
  const tone = expected < 1200 ? "gray" : expected < 1400 ? "green" : expected < 1600 ? "cyan" : expected < 1900 ? "blue" : "violet";
  assert.equal(await page.locator(`[data-testid="training-rating"] .rating-score--${tone}`).count(), 1);
}
async function save() {
  await page.getByRole("button", { name: "Save training preferences", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.training-preferences [role="status"]')?.textContent.includes("Saved."));
}
async function layout(name) {
  const sizes = await page.evaluate(() => ({ viewport: innerWidth, root: document.documentElement.scrollWidth,
    preferenceBottom: document.querySelector('.training-preferences').getBoundingClientRect().bottom,
    statsTop: document.querySelector('.training-stats').getBoundingClientRect().top,
    controls: [...document.querySelectorAll('.training-preferences select, .training-preferences input[type="number"], .training-preferences__actions button')].map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; }) }));
  assert.ok(sizes.root <= sizes.viewport + 1, `${name}: horizontal overflow`);
  assert.ok(sizes.statsTop >= sizes.preferenceBottom, `${name}: preferences overlap training cards`);
  for (const control of sizes.controls) assert.ok(control.left >= 0 && control.right <= sizes.viewport + 1 && control.width > 0, `${name}: clipped control`);
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  steps.push(name);
  console.log(`PASS ${name}`);
}
(async () => {
  await launch();
  await rating(1200);
  await page.getByRole("combobox", { name: "Rating mode", exact: true }).selectOption("manual");
  await page.getByRole("spinbutton", { name: "Manual training Rating", exact: true }).fill("9999");
  assert.equal(await page.getByRole("button", { name: "Save training preferences", exact: true }).isDisabled(), true);
  await page.getByRole("spinbutton", { name: "Manual training Rating", exact: true }).fill("1900");
  assert.equal(await page.getByRole("spinbutton", { name: "Manual training Rating", exact: true }).evaluate((el) => el.style.color), "var(--cf-rating-violet)");
  await page.getByRole("combobox", { name: "Weak-tag mode", exact: true }).selectOption("manual");
  await page.getByRole("checkbox", { name: "tag:dp", exact: true }).check();
  await page.getByRole("combobox", { name: "Daily review limit", exact: true }).selectOption("12");
  await page.getByRole("combobox", { name: "Review Rating range", exact: true }).selectOption("400");
  await page.getByRole("combobox", { name: "Challenge count", exact: true }).selectOption("4");
  await save();
  await rating(1900);
  assert.equal(read("study.json").trainingProfiles.issue25_fixture.manualRating, 1900);
  assert.equal(read("cache.json").user.rating, 1200);
  assert.equal(read("study.json").settings.reviewLimit, 12);
  assert.equal(read("study.json").settings.reviewRatingGap, 400);
  assert.equal(read("study.json").settings.recommendationTierCounts.challenge, 4);
  assert.ok((await page.locator('.weakness-problem[data-weak-tag="dp"]').count()) > 0);
  assert.equal(await page.locator('.weakness-problem:not([data-weak-tag="dp"])').count(), 0);
  await layout("01-manual-desktop-en");
  await page.setViewportSize({ width: 1040, height: 700 });
  await layout("02-manual-minimum-en");
  await app.close(); app = null;
  await launch();
  await rating(1900);
  assert.equal(await page.getByRole("checkbox", { name: "tag:dp", exact: true }).isChecked(), true);
  steps.push("manual-persistence-after-restart");
  assert.equal(await page.getByRole("combobox", { name: "Daily review limit", exact: true }).inputValue(), "12");
  assert.equal(await page.getByRole("combobox", { name: "Review Rating range", exact: true }).inputValue(), "400");
  assert.equal(await page.getByRole("combobox", { name: "Challenge count", exact: true }).inputValue(), "4");
  await app.close(); app = null;
  const otherCache = structuredClone(fixture.cache);
  otherCache.handle = "other_fixture"; otherCache.user.handle = "other_fixture"; otherCache.user.rating = 1400;
  otherCache.submissions = [];
  write("cache.json", otherCache);
  await launch(); await rating(1400);
  assert.equal(await page.getByRole("combobox", { name: "Rating mode", exact: true }).inputValue(), "auto");
  assert.deepEqual(read("study.json").trainingProfiles.issue25_fixture.weakTags, ["dp"]);
  await app.close(); app = null;
  write("cache.json", fixture.cache); write("contest-replay.json", replay);
  await launch(); await rating(1900);
  steps.push("account-switch-isolates-and-restores-preferences");
  await app.evaluate(({ ipcMain }) => {
    globalThis.originalStudyHandler = ipcMain._invokeHandlers.get("study:set");
    ipcMain.removeHandler("study:set");
    ipcMain.handle("study:set", () => { throw Error("Simulated training save failure"); });
  });
  await page.getByRole("combobox", { name: "Rating mode", exact: true }).selectOption("manual");
  await page.getByRole("spinbutton", { name: "Manual training Rating", exact: true }).fill("2500");
  await page.getByRole("button", { name: "Save training preferences", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.training-preferences [role="status"]')?.textContent.includes("Save failed"));
  await rating(1900);
  assert.equal(read("study.json").trainingProfiles.issue25_fixture.ratingMode, "manual");
  await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler("study:set"); ipcMain.handle("study:set", globalThis.originalStudyHandler); });
  steps.push("failed-save-rolls-back-rating-and-disk");
  await page.getByRole("button", { name: "Restore automatic defaults", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.training-preferences [role="status"]')?.textContent.includes("Saved."));
  await rating(1200);
  assert.deepEqual(read("study.json").trainingProfiles, {});
  assert.equal(read("study.json").notes["1900-A"].content, "Keep this note");
  steps.push("restore-defaults-preserves-notes-and-official-data");
  await app.close(); app = null;
  const zh = read("study.json"); zh.settings.language = "zh-CN"; write("study.json", zh);
  await launch(false); await rating(1200);
  await layout("04-defaults-zh");
  assert.ok((await page.getByRole("button", { name: "保存训练偏好", exact: true }).count()) === 1);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ steps, errors }, null, 2));
  console.log(JSON.stringify({ output, steps, errors }, null, 2));
})().catch(async (error) => {
  console.error(error);
  if (page && !page.isClosed()) { await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {}); fs.writeFileSync(path.join(output, "failure.txt"), await page.locator("body").innerText().catch(() => "")); }
  process.exitCode = 1;
}).finally(async () => { if (app) await app.close(); });
