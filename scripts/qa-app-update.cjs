const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { _electron: electron } = require("playwright-core");
const { makeFixture } = require("./fixtures/contest-sessions.cjs");

// Real Electron UI, fictional local data, fake downloads, and no installer execution.
// The production service has no environment variable that changes its update feed.
const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, "output", "playwright", `app-update-${Date.now()}`);
const userData = path.join(outputRoot, "user-data");
fs.mkdirSync(userData, { recursive: true });
const fixture = makeFixture();
fixture.cache.handle = "app_update_qa_fixture";
fixture.cache.user = { handle: fixture.cache.handle, rating: 1500, maxRating: 1500, rank: "specialist" };
fixture.cache.ratingHistory = [];
fixture.study.settings = { ...fixture.study.settings, language: "zh-CN", autoSync: false, autoBackup: false };
for (const [name, value] of Object.entries({ "cache.json": fixture.cache, "study.json": fixture.study,
  "contest-center.json": fixture.center, "update-settings.json": { autoCheck: false }, "favorites.json": [] })) {
  fs.writeFileSync(path.join(userData, name), JSON.stringify(value, null, 2), "utf8");
}
const steps = [];
const errors = [];
let app;
let page;
const test = (name) => page.getByTestId(name);

async function eventually(predicate, message, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await page.waitForTimeout(100);
  }
  throw Error(message);
}
async function state() { return page.evaluate(() => window.cfBridge.getAppUpdateState()); }
async function status(expected) {
  await eventually(async () => (await state()).status === expected, `Updater never reached ${expected}`);
  const messages = {
    checking: /正在检查更新|Checking for updates/, available: /发现新版本|New version available/,
    "not-available": /当前已是最新版本|You're up to date/, downloading: /正在下载更新|Downloading update/,
    downloaded: /更新已下载|Update downloaded/, cancelled: /已取消|Cancelled/,
    error: /更新操作未完成|Update action did not complete/, installing: /正在退出|Quitting and installing/,
  };
  await eventually(async () => messages[expected].test(await test("app-update-status").innerText()), `No UI status for ${expected}`);
}
async function visibleInCard(name) {
  await test(name).scrollIntoViewIfNeeded();
  const geometry = await test(name).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const panel = node.closest('[data-testid="app-update-panel"]');
    const card = panel.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
      cardTop: card.top, cardBottom: card.bottom, width: innerWidth, height: innerHeight,
      scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight, overflowY: getComputedStyle(panel).overflowY };
  });
  assert.ok(geometry.top >= -1 && geometry.bottom <= geometry.height + 1 &&
    geometry.left >= -1 && geometry.right <= geometry.width + 1, `${name} is outside the visible viewport`);
  assert.ok(geometry.top >= geometry.cardTop - 1 && geometry.bottom <= geometry.cardBottom + 1,
    `${name} is clipped by the update card`);
  assert.ok(geometry.overflowY !== "hidden" || geometry.scrollHeight <= geometry.clientHeight + 2,
    "Update card clips content; a programmatic hidden scroll is not a user-visible layout");
}
async function screenshot(name, focus) {
  if (focus) await visibleInCard(focus);
  else await test("app-update-panel").scrollIntoViewIfNeeded();
  fs.writeFileSync(path.join(outputRoot, `${name}.yml`), await test("app-update-panel").ariaSnapshot(), "utf8");
  await page.screenshot({ path: path.join(outputRoot, `${name}.png`) });
}
async function calls() {
  return app.evaluate(() => ({ ...globalThis.__appUpdateQA.calls, feed: globalThis.__appUpdateQA.updater.feed }));
}
async function control(action, value) {
  await app.evaluate((_electron, data) => {
    const qa = globalThis.__appUpdateQA;
    if (data.action === "check") qa.checkResolve(data.value === "none"
      ? { isUpdateAvailable: false, updateInfo: { version: qa.currentVersion } }
      : { isUpdateAvailable: true, updateInfo: data.value || qa.info });
    else if (data.action === "check-error") qa.checkReject(Object.assign(Error(data.value), { code: "ENOTFOUND" }));
    else if (data.action === "progress") qa.updater.emit("download-progress", data.value);
    else if (data.action === "downloaded") {
      qa.updater.emit("update-downloaded", qa.info);
      qa.downloadResolve([qa.downloadPath]);
    } else if (data.action === "download-error") qa.downloadReject(Object.assign(Error(data.value), { code: "ERR_UPDATER_CHECKSUM_MISMATCH" }));
    else if (data.action === "active-training") qa.activeTraining = data.value;
  }, { action, value });
}

async function installMock({ supported = true, reason = null, autoCheck = false } = {}) {
  await app.evaluate(async ({ ipcMain, BrowserWindow }, config) => {
    const { createRequire } = process.getBuiltinModule("module");
    const req = createRequire(config.packagePath);
    const { EventEmitter } = req("node:events");
    const fs = req("node:fs");
    const { createAppUpdateService } = req(config.servicePath);
    const info = { version: "4.2.3", tag: "v4.2.3", releaseDate: "2026-10-01T00:00:00Z",
      releaseNotes: '<img src="https://example.invalid/qa" onerror="window.__updaterXss=true">\nQA plain-text release notes',
      files: [{ url: "CF-Compass-4.2.3-Windows-x64-Setup.exe", sha512: Buffer.alloc(64, 7).toString("base64"), size: 4096 }],
    };
    const qa = { currentVersion: "4.2.2", info, activeTraining: false,
      downloadPath: config.downloadPath, calls: { check: 0, download: 0, cancel: 0, install: 0, urls: [], installArgs: [] } };
    class MockUpdater extends EventEmitter {
      setFeedURL(feed) { this.feed = feed; }
      checkForUpdates() {
        qa.calls.check++;
        this.emit("checking-for-update");
        return new Promise((resolve, reject) => { qa.checkResolve = resolve; qa.checkReject = reject; });
      }
      downloadUpdate(token) {
        qa.calls.download++;
        qa.token = token;
        return new Promise((resolve, reject) => {
          qa.downloadResolve = resolve;
          qa.downloadReject = reject;
          token?.onCancel?.(() => {
            qa.calls.cancel++;
            this.emit("update-cancelled", info);
            reject(Object.assign(Error("QA cancelled"), { code: "ERR_CANCELLED" }));
          });
        });
      }
      quitAndInstall(...args) { qa.calls.install++; qa.calls.installArgs.push(args); }
    }
    qa.updater = new MockUpdater();
    fs.writeFileSync(config.configPath, JSON.stringify({ autoCheck: config.autoCheck }), "utf8");
    qa.service = createAppUpdateService({ updater: qa.updater, currentVersion: qa.currentVersion,
      supported: config.supported, reason: config.reason,
      readConfig: () => JSON.parse(fs.readFileSync(config.configPath, "utf8")),
      writeConfig: (value) => fs.writeFileSync(config.configPath, JSON.stringify(value), "utf8"),
      hasActiveTraining: () => qa.activeTraining,
      openExternal: (url) => { qa.calls.urls.push(url); },
      onChanged: (value) => { for (const window of BrowserWindow.getAllWindows())
        if (!window.isDestroyed()) window.webContents.send("app-update:changed", value); },
    });
    await qa.service.init();
    globalThis.__appUpdateQA = qa;
    const bindings = { get: () => qa.service.get(), check: () => qa.service.check(),
      "set-auto-check": (_event, enabled) => qa.service.setAutoCheck(enabled), download: () => qa.service.download(),
      cancel: () => qa.service.cancel(), install: () => qa.service.install(), "open-release": () => qa.service.openRelease() };
    for (const [suffix, handler] of Object.entries(bindings)) {
      ipcMain.removeHandler(`app-update:${suffix}`);
      ipcMain.handle(`app-update:${suffix}`, handler);
    }
  }, { packagePath: path.join(projectRoot, "package.json"), servicePath: path.join(projectRoot, "electron", "services", "app-update-service.cjs"),
    configPath: path.join(userData, "qa-update-settings.json"), downloadPath: path.join(userData, "fake-installer.exe"), supported, reason, autoCheck });
  await page.reload();
  await page.getByRole("button", { name: /数据中心|Data Center/, exact: true }).click();
  await test("app-update-panel").waitFor();
}
async function available() {
  await test("app-update-check").click();
  await status("checking");
  await control("check");
  await status("available");
  await test("app-update-download").waitFor();
}
async function download() {
  await test("app-update-download").click();
  await status("downloading");
  await control("downloaded");
  await status("downloaded");
  await test("app-update-install").waitFor();
}

(async () => {
  app = await electron.launch({
    executablePath: process.env.CF_COMPASS_QA_EXECUTABLE || path.join(projectRoot, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron"),
    args: process.env.CF_COMPASS_QA_EXECUTABLE ? ["--disable-gpu"] : ["--disable-gpu", projectRoot],
    cwd: projectRoot, env: { ...process.env, CF_COMPASS_USER_DATA: userData },
  });
  for (const [name, stream] of [["stdout", app.process().stdout], ["stderr", app.process().stderr]])
    stream?.on("data", (chunk) => fs.appendFileSync(path.join(outputRoot, `main-${name}.log`), chunk));
  await app.evaluate(({ shell }, data) => {
    shell.openExternal = async () => { throw Error("Unexpected external open outside updater mock"); };
    globalThis.fetch = async (input) => {
      const endpoint = new URL(String(input)).pathname;
      const result = endpoint.endsWith("contest.list") ? data.center.contests : endpoint.endsWith("user.info") ? [data.cache.user] :
        endpoint.endsWith("problemset.problems") ? { problems: data.cache.problems } : [];
      return { ok: true, json: async () => ({ status: "OK", result }) };
    };
  }, fixture);
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.stack || String(error)));
  await page.waitForLoadState("domcontentloaded");
  const nativeState = await state();
  assert.equal(nativeState.supported, false, "QA must start from development/unpacked app, never a real installed updater");
  steps.push({ name: "native development/unpacked eligibility", nativeState });

  await installMock();
  assert.match(await test("app-update-panel").innerText(), /应用更新|更新/);
  assert.match(await test("app-update-current-version").innerText(), /4\.2\.2/);
  assert.equal((await state()).autoCheck, false);
  await test("app-update-auto-check").click();
  await eventually(async () => (await state()).autoCheck === true, "Automatic check preference was not saved");
  assert.equal(JSON.parse(fs.readFileSync(path.join(userData, "qa-update-settings.json"), "utf8")).autoCheck, true);
  assert.equal((await calls()).download, 0);
  assert.equal((await calls()).install, 0);
  steps.push({ name: "Chinese card and persisted check-only preference" });

  await test("app-update-check").click();
  await status("checking");
  await page.evaluate(() => { window.__appUpdateQaDuplicateChecks = Promise.all([
    window.cfBridge.checkAppUpdate(), window.cfBridge.checkAppUpdate(),
  ]); });
  await page.waitForTimeout(150);
  assert.equal((await calls()).check, 1, "Duplicate check started another network operation");
  await control("check");
  await page.evaluate(() => window.__appUpdateQaDuplicateChecks);
  await status("available");
  assert.equal((await calls()).download, 0, "Checking must never auto-download");
  assert.match(await test("app-update-notes").innerText(), /<img.*onerror/);
  assert.equal(await test("app-update-notes").locator("img").count(), 0);
  assert.equal(await page.evaluate(() => window.__updaterXss), undefined);
  const feed = (await calls()).feed;
  assert.equal(feed.owner, "Binah-Dev");
  assert.equal(feed.repo, "cf-compass");
  await screenshot("01-chinese-available");
  steps.push({ name: "Single in-flight check, fixed feed, inert release notes" });

  await test("app-update-download").click();
  await status("downloading");
  await page.evaluate(() => { window.__appUpdateQaDuplicateDownload = window.cfBridge.downloadAppUpdate(); });
  await page.waitForTimeout(150);
  assert.equal((await calls()).download, 1);
  await control("progress", { percent: 42, transferred: 1720, total: 4096, bytesPerSecond: 2048 });
  await eventually(async () => (await state()).progress?.percent === 42, "Download progress not retained");
  await test("app-update-progress").waitFor();
  await screenshot("02-chinese-progress");
  await test("app-update-cancel").click();
  await status("cancelled");
  await page.evaluate(() => window.__appUpdateQaDuplicateDownload);
  assert.ok((await calls()).cancel >= 1);
  assert.equal((await calls()).install, 0);
  steps.push({ name: "Download progress, duplicate download, real token cancellation" });

  await installMock();
  await test("app-update-check").click();
  await status("checking");
  await test("app-update-cancel").click();
  await status("cancelled");
  await control("check");
  await page.waitForTimeout(150);
  assert.equal((await state()).status, "cancelled", "A cancelled check revived a stale update");
  assert.equal(await test("app-update-download").count(), 0);
  await test("app-update-check").click();
  await status("checking");
  await control("check", "none");
  await status("not-available");
  assert.equal(await test("app-update-download").count(), 0);
  steps.push({ name: "Cancelled check ignores its late result; current version is up to date" });

  await test("app-update-check").click();
  await status("checking");
  await control("check", { version: "4.2.3", files: [{
    url: "CF-Compass-4.2.3-Windows-x64-portable.exe", sha512: Buffer.alloc(64, 7).toString("base64"),
  }] });
  await status("error");
  assert.equal(await test("app-update-download").count(), 0);
  assert.equal(await test("app-update-install").count(), 0);
  steps.push({ name: "Invalid portable metadata exposes no download or install action" });

  await installMock();
  await test("app-update-check").click();
  await status("checking");
  await control("check-error", "Offline QA fixture");
  await status("error");
  await test("app-update-error").waitFor();
  assert.equal((await calls()).install, 0);
  await available();
  await test("app-update-download").click();
  await status("downloading");
  await control("download-error", "SHA-512 QA mismatch");
  await status("error");
  assert.equal(await test("app-update-install").count(), 0);
  steps.push({ name: "Offline retry and failed integrity check never enable installation" });

  await installMock();
  await available();
  await download();
  assert.equal((await calls()).install, 0, "Download completion installed without confirmation");
  await test("app-update-install").click();
  await test("app-update-install-confirm").waitFor();
  assert.equal((await calls()).install, 0);
  await test("app-update-install-dismiss").click();
  assert.equal((await calls()).install, 0);
  await control("active-training", true);
  await test("app-update-install").click();
  await test("app-update-install-confirm").click();
  await eventually(async () => (await state()).errorCode === "UPDATER_TRAINING_ACTIVE", "Active training did not block installation");
  assert.equal((await state()).status, "downloaded");
  assert.equal((await calls()).install, 0);
  await screenshot("03-chinese-training-blocked");
  await control("active-training", false);
  await test("app-update-install").click();
  await test("app-update-install-confirm").click();
  await status("installing");
  await page.evaluate(() => Promise.all([window.cfBridge.installAppUpdate(), window.cfBridge.installAppUpdate()]));
  assert.equal((await calls()).install, 1);
  assert.deepEqual((await calls()).installArgs, [[false, true]]);
  steps.push({ name: "Explicit confirmation, active training guard, idempotent install stub" });

  for (const reason of ["portable", "not-installed", "development", "platform"]) {
    await installMock({ supported: false, reason });
    for (const id of ["app-update-check", "app-update-auto-check", "app-update-download", "app-update-install"])
      assert.equal(await test(id).count(), 0, `${reason} exposed ${id}`);
    await test("app-update-release").click();
    assert.deepEqual((await calls()).urls, ["https://github.com/Binah-Dev/cf-compass/releases"]);
    const disabledActions = await page.evaluate(() => Promise.all([
      window.cfBridge.checkAppUpdate(), window.cfBridge.downloadAppUpdate(), window.cfBridge.installAppUpdate(),
    ]));
    assert.ok(disabledActions.every((result) => result.supported === false));
    assert.equal((await calls()).check + (await calls()).download + (await calls()).install, 0);
  }
  steps.push({ name: "Portable/unpacked/development/platform manual-only protection" });

  await page.evaluate(async () => {
    const study = await window.cfBridge.getStudyData();
    await window.cfBridge.setStudyData({ ...study, settings: { ...study.settings, language: "en-US", autoSync: false, autoBackup: false } });
  });
  await installMock();
  await available();
  assert.match(await test("app-update-panel").innerText(), /App Updates|Application Update|App Update/i);
  const chinese = await test("app-update-panel").evaluate((panel) => [panel.textContent,
    ...Array.from(panel.querySelectorAll("[title],[aria-label],[placeholder]"), (node) =>
      [node.title, node.getAttribute("aria-label"), node.getAttribute("placeholder")].join(" "))]
    .join("\n").match(/[\u3400-\u9fff]+/g) || []);
  assert.deepEqual(chinese, [], "English update card has untranslated text or accessible labels");
  await download();
  await test("app-update-install").click();
  await test("app-update-install-confirm").waitFor();
  await screenshot("04-english-install-confirmation", "app-update-install-confirm");
  await test("app-update-install-dismiss").click();
  assert.equal((await calls()).install, 0);
  steps.push({ name: "English card, inert notes and explicit confirmation" });

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 700));
  await screenshot("05-english-minimum-window", "app-update-install");
  const layout = await test("app-update-panel").evaluate((panel) => ({ width: innerWidth,
    documentWidth: document.documentElement.scrollWidth, panelWidth: panel.scrollWidth, panelClientWidth: panel.clientWidth }));
  assert.ok(layout.documentWidth <= layout.width + 1, "Minimum window has horizontal overflow");
  assert.ok(layout.panelWidth <= layout.panelClientWidth + 1, "Update card has horizontal overflow");
  steps.push({ name: "1040x700 layout", layout });
  assert.deepEqual(errors, [], "Renderer errors were captured");
  console.log(JSON.stringify({ outputRoot, steps: steps.length, errors, mode: "mock-ui-only", nativeState }, null, 2));
})().catch((error) => {
  errors.push(error.stack || String(error));
  console.error(error.stack || String(error));
  process.exitCode = 1;
}).finally(async () => {
  if (page && errors.length) await page.screenshot({ path: path.join(outputRoot, "failure.png") }).catch(() => {});
  fs.writeFileSync(path.join(outputRoot, "report.json"), JSON.stringify({
    mode: "mock-ui-only", runtime: process.env.CF_COMPASS_QA_EXECUTABLE ? "packaged-unpacked" : "source", userData, steps, errors,
    limitation: "Mocked installer records calls only; this does not validate a real NSIS version-to-version installation.",
  }, null, 2), "utf8");
  await app?.close().catch(() => {});
});
