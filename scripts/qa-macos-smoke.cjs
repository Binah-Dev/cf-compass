const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { _electron: electron } = require("playwright-core");

if (process.platform !== "darwin" && !process.argv.includes("--allow-other-platform")) {
  throw Error("macOS smoke requires macOS; --allow-other-platform validates only normal quit on another platform.");
}
const root = path.resolve(__dirname, "..");
const expectedVersion = require("../package.json").version;
const executable = process.env.CF_COMPASS_QA_EXECUTABLE;
const sourceMode = process.argv.includes("--source");
const output = path.resolve(process.env.CF_COMPASS_QA_OUTPUT || path.join(root, ".qa-output", "macos-smoke"));
const report = { platform: process.platform, passed: false, checks: [], errors: [],
  runtime: sourceMode ? "source" : "packaged", macSignalSkipped: process.platform !== "darwin", forcedCleanup: false };
let application;
let child;
fs.mkdirSync(output, { recursive: true });
const persist = () => fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function bounded(operation, milliseconds, label) {
  let timeout;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(Error(`${label} exceeded ${milliseconds} ms.`)), milliseconds);
    })]);
  } finally { clearTimeout(timeout); }
}

function forceCleanup() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  report.forcedCleanup = true;
  try {
    if (process.platform === "win32") {
      // Playwright's Windows launcher owns this shell PID and its descendants.
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 5000 });
    } else {
      // Installed Playwright launches POSIX Electron in a fresh process group.
      // Only that owned group is killed, and only after a failed check.
      process.kill(-child.pid, "SIGKILL");
    }
  } catch (error) { if (error.code !== "ESRCH") report.cleanupError = error.message; }
}

const watchdog = setTimeout(() => {
  report.passed = false;
  report.errors.push("Overall smoke exceeded 115 seconds.");
  forceCleanup();
  persist();
  // Playwright also cleans any launch-in-progress child on process exit.
  process.exit(1);
}, 115000);
process.on("unhandledRejection", (error) => {
  report.errors.push(error?.stack || String(error));
  report.passed = false;
  process.exitCode = 1;
  persist();
});

function profile() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "cf-compass-macos-smoke-"));
  // Stage preferences only; verify the actual first-run workbench below.
  fs.writeFileSync(path.join(userData, "study.json"), JSON.stringify({ version: 1,
    settings: { language: "en-US", autoSync: false, autoBackup: false } }));
  const env = { ...process.env, CF_COMPASS_USER_DATA: userData, ELECTRON_ENABLE_LOGGING: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  delete env.NODE_OPTIONS;
  return { userData, env };
}

async function checkAppQuit() {
  const mode = "app-quit";
  const { userData, env } = profile();
  let exited;
  let page;
  const result = { mode, passed: false };
  report.checks.push(result);
  report.phase = `${mode}:launching`;
  persist();
  const started = Date.now();
  await bounded((async () => {
    application = await electron.launch({ executablePath: executable,
      args: ["--disable-gpu", "--lang=en-US", ...(sourceMode ? [root] : [])],
      cwd: root, env, timeout: 25000, chromiumSandbox: true });
    child = application.process();
    result.startupStage = "first-window";
    persist();
    exited = new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve({ code: child.exitCode, signal: child.signalCode });
      else child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    for (const [name, stream] of [["stdout", child.stdout], ["stderr", child.stderr]]) {
      stream?.on("data", (chunk) => fs.appendFileSync(path.join(output, `${mode}-${name}.log`), chunk));
    }
    page = await application.firstWindow();
    page.on("pageerror", (error) => report.errors.push(error.message));
    result.startupStage = "workbench-visible";
    persist();
    await page.locator(".workbench-move").first().waitFor({ state: "visible", timeout: 25000 });
    result.startupStage = "problems-visible";
    persist();
    await page.locator(".problem-row").first().waitFor({ state: "visible", timeout: 25000 });
    result.native = await application.evaluate(({ app, BrowserWindow }) => ({
      version: app.getVersion(), userData: app.getPath("userData"),
      visible: BrowserWindow.getAllWindows().some((window) => !window.isDestroyed() && window.isVisible()),
    }));
    assert.equal(result.native.visible, true);
    assert.equal(result.native.version, expectedVersion, "Smoke must verify this checkout's packaged version.");
    assert.equal(path.resolve(result.native.userData), path.resolve(userData));
    // Ensure the timer's durable quit path is initialized, without starting it.
    await page.evaluate(async () => { if (window.cfBridge.getStudyTimer) await window.cfBridge.getStudyTimer(); });
  })(), 25000, `${mode} real UI startup`);
  result.readyMs = Date.now() - started;
  report.phase = `${mode}:liveness`;
  persist();
  await Promise.race([delay(10000), exited.then((exit) => { throw Error(`Application exited during liveness: ${JSON.stringify(exit)}`); })]);
  assert.equal(child.exitCode, null);
  assert.equal(child.signalCode, null);
  result.livenessMs = 10000;
  report.phase = `${mode}:normal-exit`;
  persist();
  const quitStarted = Date.now();
  // Playwright's installed close implementation calls app.quit, disconnects
  // the Node inspector, then waits for the real child-process exit.
  await bounded(Promise.all([application.close(), exited]), 20000, "Normal app.quit and process exit");
  result.exit = await exited;
  assert.equal(result.exit.code, 0, `${mode} must exit successfully`);
  assert.equal(result.exit.signal, null, `${mode} must reach normal application exit`);
  result.quitMs = Date.now() - quitStarted;
  await bounded(application.close(), 3000, "Playwright protocol cleanup after exit");
  application = null;
  child = null;
  assert.deepEqual(report.errors, []);
  result.passed = true;
  persist();
}

async function checkSignal() {
  assert.equal(process.platform, "darwin");
  const mode = "sigterm";
  const { userData, env } = profile();
  const result = { mode, passed: false, inspectorAttached: false };
  report.checks.push(result);
  report.phase = "sigterm:launching";
  persist();
  const started = Date.now();
  // Match the original native launch, without Playwright's Node inspector.
  // The separate app-quit case already verifies the actual visible workbench.
  child = spawn(executable, ["--disable-gpu", "--lang=en-US", ...(sourceMode ? [root] : [])], {
    cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = new Promise((resolve, reject) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
    child.once("error", reject);
  });
  for (const [name, stream] of [["stdout", child.stdout], ["stderr", child.stderr]]) {
    stream?.on("data", (chunk) => fs.appendFileSync(path.join(output, `${mode}-${name}.log`), chunk));
  }
  await bounded(Promise.race([(async () => {
    const statePath = path.join(userData, "study-timer.json");
    for (;;) {
      try {
        const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
        if (state.version === 1 && typeof state.mode === "string") break;
      } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
      await delay(100);
    }
  })(), exited.then((exit) => { throw Error(`Native launch exited before durable timer readiness: ${JSON.stringify(exit)}`); })]),
  25000, "Native macOS startup and durable timer readiness");
  result.readyMs = Date.now() - started;
  report.phase = "sigterm:liveness";
  persist();
  await Promise.race([delay(10000), exited.then((exit) => { throw Error(`Native app exited during liveness: ${JSON.stringify(exit)}`); })]);
  result.livenessMs = 10000;
  report.phase = "sigterm:normal-exit";
  persist();
  const quitStarted = Date.now();
  assert.equal(child.kill("SIGTERM"), true);
  result.exit = await bounded(exited, 20000, "Native macOS SIGTERM process exit");
  assert.equal(result.exit.code, 0, "Native SIGTERM must reach successful application exit");
  assert.equal(result.exit.signal, null, "Forced signal termination cannot replace normal exit");
  result.quitMs = Date.now() - quitStarted;
  child = null;
  assert.deepEqual(report.errors, []);
  result.passed = true;
  persist();
}

(async () => {
  assert.ok(executable && fs.statSync(executable).isFile(), "Set CF_COMPASS_QA_EXECUTABLE to the packaged executable.");
  await checkAppQuit();
  if (process.platform === "darwin") await checkSignal();
  assert.deepEqual(report.errors, []);
  report.passed = true;
  report.phase = "complete";
})().catch(async (error) => {
  report.passed = false;
  report.errors.push(error?.stack || String(error));
  process.exitCode = 1;
  forceCleanup();
  if (application) await bounded(application.close().catch(() => {}), 3000, "Failure protocol cleanup").catch(() => {});
}).finally(() => {
  clearTimeout(watchdog);
  persist();
  console.log(JSON.stringify(report, null, 2));
  // Bound lingering protocol handles too; forced cleanup never changes failure
  // to success. No profiles or screenshots are uploaded with this report.
  process.exit(report.passed && !report.errors.length ? 0 : 1);
});
