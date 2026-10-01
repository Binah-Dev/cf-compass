const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Official application identity is allowed only on a disposable hosted runner.
// Do not run this helper or its installer driver on a developer machine.
if (process.platform !== "win32" || process.env.GITHUB_ACTIONS !== "true"
  || process.env.RUNNER_OS !== "Windows" || process.env.RUNNER_ENVIRONMENT !== "github-hosted"
  || !process.env.RUNNER_TEMP) throw Error("Official upgrade QA requires a GitHub-hosted Windows runner.");

const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
assert.ok(args.includes("--context") && args.includes("--phase"), "--context and --phase are required.");
const contextPath = path.resolve(value("--context"));
const phase = value("--phase");
assert.ok(["initial", "upgraded"].includes(phase), "Invalid upgrade phase.");
const context = JSON.parse(fs.readFileSync(contextPath, "utf8"));
const inside = (candidate, parent) => {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
};
assert.match(context.runId, /^[a-f0-9]{32}$/);
assert.equal(path.basename(context.root), `cf-compass-upgrade-${context.runId}`);
assert.ok(inside(context.root, process.env.RUNNER_TEMP));
assert.equal(path.dirname(contextPath).toLowerCase(), path.resolve(context.root).toLowerCase());
assert.equal(path.resolve(context.installRoot).toLowerCase(), path.join(context.root, "install").toLowerCase());
assert.equal(path.resolve(context.userData).toLowerCase(), path.join(context.root, "user-data").toLowerCase());
const executable = path.join(context.installRoot, "CF Compass.exe");
const expectedVersion = phase === "initial" ? context.previousVersion : context.version;
assert.match(expectedVersion, /^\d+\.\d+\.\d+$/);
const markerPath = path.join(context.userData, "upgrade-sentinel.json");
const marker = { runId: context.runId, synthetic: true, purpose: "official installer overwrite upgrade QA" };
const handle = "CF_COMPASS_UPGRADE_SYNTHETIC";
const problemKey = "1900-A";
const note = `Synthetic upgrade note ${context.runId}`;

if (phase === "initial") {
  const { makeFixture } = require("./fixtures/contest-sessions.cjs");
  const fixture = makeFixture();
  fixture.cache.handle = handle;
  fixture.cache.user.handle = handle;
  fixture.cache.submissions = [];
  fixture.study.settings.autoSync = false;
  fixture.study.settings.autoBackup = false;
  fs.mkdirSync(context.userData, { recursive: true });
  for (const [filename, data] of Object.entries({
    "cache.json": fixture.cache, "study.json": fixture.study,
    "contest-center.json": fixture.center, "favorites.json": [],
    "study-plan.json": { version: 1, items: [] },
    "custom-training.json": { version: 1, sessions: [] },
    "update-settings.json": { autoCheck: false },
    "upgrade-sentinel.json": marker,
  })) fs.writeFileSync(path.join(context.userData, filename), JSON.stringify(data), "utf8");
} else {
  assert.deepEqual(JSON.parse(fs.readFileSync(markerPath, "utf8")), marker);
}

const { _electron: electron } = require("playwright-core");
let app;
const errors = [];
(async () => {
  app = await electron.launch({ executablePath: executable, args: ["--disable-gpu"], timeout: 60000,
    env: { ...process.env, CF_COMPASS_USER_DATA: context.userData } });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForSelector(".workbench-move", { timeout: 60000 });
  const identity = await app.evaluate(({ app }) => ({ version: app.getVersion(), userData: app.getPath("userData"), execPath: app.getPath("exe") }));
  assert.equal(identity.version, expectedVersion);
  assert.equal(path.resolve(identity.userData).toLowerCase(), path.resolve(context.userData).toLowerCase());
  assert.equal(path.resolve(identity.execPath).toLowerCase(), path.resolve(executable).toLowerCase());
  const updaterState = await page.evaluate(() => window.cfBridge.getAppUpdateState());
  assert.equal(updaterState.currentVersion, expectedVersion);
  assert.equal(updaterState.supported, true, "The installed NSIS identity must remain eligible for updates.");
  if (phase === "initial") {
    await page.evaluate(async ({ key, content }) => {
      await window.cfBridge.setProblemNote(key, { content, keyIdea: "Keep this local note across the upgrade" });
      await window.cfBridge.setFavorites([key]);
      await window.cfBridge.addStudyPlanProblem(key);
    }, { key: problemKey, content: note });
  }
  const saved = await page.evaluate(async () => ({
    cache: await window.cfBridge.getCache(), study: await window.cfBridge.getStudyData(),
    favorites: await window.cfBridge.getFavorites(), plan: await window.cfBridge.getStudyPlan(),
  }));
  assert.equal(saved.cache.handle, handle);
  assert.equal(saved.study.notes[problemKey]?.content, note);
  assert.ok(saved.favorites.includes(problemKey));
  assert.ok(saved.plan.items.some((item) => item.problemKey === problemKey && item.status === "pending"));
  assert.deepEqual(JSON.parse(fs.readFileSync(markerPath, "utf8")), marker);
  assert.deepEqual(errors, []);
  const report = { phase, version: identity.version, mainWindow: true, installedUpdaterEligible: true,
    sentinelPreserved: true, cachePreserved: true, notePreserved: true, favoritesPreserved: true, planPreserved: true,
    pageErrors: errors, verification: "official installer overwrite; not an in-app public-channel update" };
  fs.writeFileSync(path.join(context.root, `${phase}-report.json`), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report));
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { if (app) await app.close(); });
