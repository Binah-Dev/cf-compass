const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { _electron: electron } = require("playwright-core");
const { makeFixture } = require("./fixtures/contest-sessions.cjs");

// Keep the real main IPC handlers, persisted training service and shared lock.
// Only the updater transport/installer is mocked in this QA-only bootstrap.
const root = path.resolve(__dirname, "..");
const output = path.join(root, "output", "playwright", `app-update-main-${Date.now()}`);
const userData = path.join(output, "user-data");
fs.mkdirSync(userData, { recursive: true });
const fixture = makeFixture();
fixture.cache.handle = "update_lock_qa";
fixture.cache.user = { handle: fixture.cache.handle, rating: 1500 };
fixture.cache.ratingHistory = [];
fixture.study.settings = { ...fixture.study.settings, autoSync: false, autoBackup: false };
for (const [name, value] of Object.entries({ "cache.json": fixture.cache, "study.json": fixture.study,
  "contest-center.json": fixture.center, "update-settings.json": { autoCheck: false } })) {
  fs.writeFileSync(path.join(userData, name), JSON.stringify(value));
}
const servicePath = path.join(root, "electron", "services", "app-update-service.cjs");
const currentVersion = require("../package.json").version;
const versionParts = currentVersion.split(".").map(Number);
const nextVersion = `${versionParts[0]}.${versionParts[1]}.${versionParts[2] + 1}`;
const entry = path.join(output, "bootstrap.cjs");
const importPath = path.join(output, "qa-import.json");
fs.writeFileSync(entry, `
const { EventEmitter } = require('node:events');
const electron = require('electron');
electron.app.getVersion = () => ${JSON.stringify(currentVersion)};
electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [${JSON.stringify(importPath)}] });
electron.dialog.showMessageBox = async () => ({ response: 1 });
const service = require(${JSON.stringify(servicePath)});
const create = service.createAppUpdateService;
globalThis.__updateLockQA = { installCalls: 0 };
class MockUpdater extends EventEmitter {
  setFeedURL(value) { this.feed = value; }
  async checkForUpdates() {
    const info = { version: ${JSON.stringify(nextVersion)}, tag: ${JSON.stringify(`v${nextVersion}`)}, files: [{
      url: ${JSON.stringify(`CF-Compass-${nextVersion}-Windows-x64-Setup.exe`)}, sha512: Buffer.alloc(64, 9).toString('base64')
    }] };
    this.updateInfoAndProvider = { info };
    return { isUpdateAvailable: true, updateInfo: info };
  }
  async downloadUpdate() { return ['QA-only-never-executed.exe']; }
  quitAndInstall() { globalThis.__updateLockQA.installCalls++; }
}
service.createAppUpdateService = options => {
  const instance = create({ ...options, supported: true, reason: null, updater: new MockUpdater() });
  globalThis.__updateLockQA.service = instance;
  return instance;
};
require(${JSON.stringify(path.join(root, "electron", "main.cjs"))});
`, "utf8");

const steps = [];
let app;
(async () => {
  app = await electron.launch({ args: [entry], cwd: root,
    env: { ...process.env, CF_COMPASS_USER_DATA: userData, VITE_DEV_SERVER_URL: "" } });
  const page = await app.firstWindow();
  await page.waitForFunction(() => typeof window.cfBridge?.getTrainingSessions === "function");
  let value = await page.evaluate(async () => {
    await window.cfBridge.checkAppUpdate();
    return window.cfBridge.downloadAppUpdate();
  });
  assert.equal(value.status, "downloaded");
  assert.equal(value.autoCheck, false);
  steps.push("real main IPC uses explicit download with persisted automatic checks disabled");

  const problemKey = `${fixture.cache.problems[0].contestId}-${fixture.cache.problems[0].index}`;
  const createDraft = async title => {
    const store = await page.evaluate(input => window.cfBridge.saveTrainingDraft(input), {
      title, problemKeys: [problemKey], durationSeconds: 3600, hideRating: true, hideTags: true,
    });
    return store.sessions.find(item => item.title === title).id;
  };
  const firstId = await createDraft("Lock start first");
  const startFirst = await page.evaluate(async id => Promise.allSettled([
    window.cfBridge.startTrainingSession(id), window.cfBridge.installAppUpdate(),
  ]), firstId);
  assert.equal(startFirst[0].status, "fulfilled");
  assert.equal(startFirst[1].status, "fulfilled");
  assert.equal(startFirst[1].value.errorCode, "UPDATER_TRAINING_ACTIVE");
  assert.equal(startFirst[1].value.status, "downloaded");
  assert.equal(await app.evaluate(() => globalThis.__updateLockQA.installCalls), 0);
  steps.push("start-before-install persists its running session and blocks installation");
  const activeStore = await page.evaluate(() => window.cfBridge.getTrainingSessions());

  const cache = JSON.parse(fs.readFileSync(path.join(userData, "cache.json"), "utf8"));
  fs.writeFileSync(path.join(userData, "cache.json"), JSON.stringify({ ...cache, handle: "update_other_qa", user: { handle: "update_other_qa" } }));
  value = await page.evaluate(() => window.cfBridge.installAppUpdate());
  assert.equal(value.errorCode, "UPDATER_TRAINING_ACTIVE");
  assert.equal(await app.evaluate(() => globalThis.__updateLockQA.installCalls), 0);
  steps.push("another account's persisted active training also blocks installation");
  fs.writeFileSync(path.join(userData, "cache.json"), JSON.stringify(cache));
  await page.evaluate(id => window.cfBridge.finishTrainingSession(id), firstId);
  fs.writeFileSync(importPath, JSON.stringify({ format: "cf-compass-backup", version: 1,
    data: { cache: fixture.cache, study: fixture.study, customTraining: activeStore } }));
  await page.evaluate(() => window.cfBridge.importData());
  value = await page.evaluate(() => window.cfBridge.installAppUpdate());
  assert.equal(value.errorCode, "UPDATER_TRAINING_ACTIVE");
  assert.equal(await app.evaluate(() => globalThis.__updateLockQA.installCalls), 0);
  steps.push("imported running training is committed before installation can check its persisted window");
  await page.evaluate(id => window.cfBridge.finishTrainingSession(id), firstId);
  const secondId = await createDraft("Lock install first");
  const installFirst = await page.evaluate(async id => {
    const installation = window.cfBridge.installAppUpdate();
    const starting = window.cfBridge.startTrainingSession(id).then(() => ({ started: true }), error => ({ started: false, message: error.message }));
    return { installation: await installation, starting: await starting };
  }, secondId);
  assert.equal(installFirst.installation.status, "installing");
  assert.equal(installFirst.starting.started, false);
  assert.match(installFirst.starting.message, /更新安装正在启动/);
  assert.equal(await app.evaluate(() => globalThis.__updateLockQA.installCalls), 1);
  steps.push("install-before-start blocks new training after the queued installation action");

  const repeated = await page.evaluate(() => Promise.all([
    window.cfBridge.installAppUpdate(), window.cfBridge.installAppUpdate(),
  ]));
  assert.ok(repeated.every(item => item.status === "installing"));
  assert.equal(await app.evaluate(() => globalThis.__updateLockQA.installCalls), 1);
  const store = await page.evaluate(() => window.cfBridge.getTrainingSessions());
  assert.equal(store.sessions.find(item => item.id === secondId).status, "draft");
  assert.equal(store.sessions.filter(item => item.status === "running").length, 0);
  steps.push("repeated installation executes once; rejected training remains a draft");
  const trainingBeforeImport = fs.readFileSync(path.join(userData, "custom-training.json"), "utf8");
  const importing = await page.evaluate(() => window.cfBridge.importData().then(() => ({ imported: true }), error => ({ imported: false, message: error.message })));
  assert.equal(importing.imported, false);
  assert.match(importing.message, /更新安装正在启动/);
  assert.equal(fs.readFileSync(path.join(userData, "custom-training.json"), "utf8"), trainingBeforeImport);
  steps.push("installation blocks confirmed backup imports before any persistent replacement");
  await page.evaluate(async () => {
    const study = await window.cfBridge.getStudyData();
    await window.cfBridge.setStudyData({ ...study, settings: { ...study.settings, language: "en-US" } });
  });
  const english = await page.evaluate(id => Promise.all([
    window.cfBridge.startTrainingSession(id).then(() => "unexpected", error => error.message),
    window.cfBridge.importData().then(() => "unexpected", error => error.message),
  ]), secondId);
  assert.ok(english.every(message => message.includes("Update installation is starting") && !/[\u3400-\u9fff]/.test(message)));
  steps.push("both installation gates return English errors when the persisted locale is English");
  await app.close(); app = null;
  const report = { passed: true, type: "real-main-ipc-with-mocked-updater", output, steps,
    realInstallerExecuted: false, preservedRealUserData: true };
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
})().catch(async error => {
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ passed: false, steps, error: error.stack }, null, 2));
  console.error(error);
  if (app) await app.close().catch(() => undefined);
  process.exitCode = 1;
});
