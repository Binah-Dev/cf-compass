const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require("playwright-core");
const { makeFixture } = require("./fixtures/contest-sessions.cjs");

// This script uses synthetic data in a new directory. It never opens an installed
// profile, exports screenshots, or sends the timer data to a remote service.
const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, "output", "playwright", `study-timer-${Date.now()}`);
const userDataRoot = path.join(outputRoot, "user-data");
fs.mkdirSync(userDataRoot, { recursive: true });
const fixture = makeFixture();
fixture.cache.handle = "LOCAL_TIMER_QA";
fixture.cache.user = { handle: "LOCAL_TIMER_QA", rating: 1500, maxRating: 1500 };
Object.assign(fixture.study.settings, {
  language: "zh-CN", themeVersion: 7, autoSync: false, autoBackup: false,
  wallpaperEnabled: false, reduceMotion: true, panelOpacity: 72, accentTheme: "sky",
});
for (const [filename, value] of [
  ["cache.json", fixture.cache], ["study.json", fixture.study],
  ["contest-center.json", fixture.center], ["favorites.json", []],
  ["study-plan.json", { version: 1, items: [{
    id: "study-timer-qa-plan", problemKey: "1900-A", ...fixture.cache.problems[0],
    status: "pending", reason: "Synthetic timer QA", addedAt: new Date().toISOString(), completedAt: null,
  }] }],
]) fs.writeFileSync(path.join(userDataRoot, filename), JSON.stringify(value, null, 2), "utf8");

let app;
let mainPage;
let timerPage;
const checks = [];
const errors = [];
const test = (name) => timerPage.getByTestId(name);
const record = (name, evidence = {}) => checks.push({ name, ...evidence });
const getTimer = () => mainPage.evaluate(() => window.cfBridge.getStudyTimer());
const getAudio = () => mainPage.evaluate(() => window.cfBridge.getStudyTimerAudio());
const control = (action) => mainPage.evaluate((value) => window.cfBridge.controlStudyTimer(value), action);

async function eventually(predicate, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw Error(message);
}
function watch(page) {
  page.on("pageerror", (error) => errors.push({ url: page.url(), message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push({ url: page.url(), message: message.text() });
  });
}
async function launch() {
  app = await electron.launch({
    executablePath: process.env.CF_COMPASS_QA_EXECUTABLE || path.join(projectRoot, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron"),
    args: process.env.CF_COMPASS_QA_EXECUTABLE ? ["--disable-gpu"] : ["--disable-gpu", projectRoot],
    cwd: projectRoot,
    env: { ...process.env, CF_COMPASS_USER_DATA: userDataRoot, VITE_DEV_SERVER_URL: "" },
  });
  for (const [name, stream] of [["stdout", app.process().stdout], ["stderr", app.process().stderr]]) {
    stream?.on("data", (chunk) => fs.appendFileSync(path.join(outputRoot, `main-${name}.log`), chunk));
  }
  mainPage = await app.firstWindow();
  watch(mainPage);
  await mainPage.setViewportSize({ width: 1500, height: 940 });
  await mainPage.waitForSelector(".app-shell");
}
async function openTimer() {
  await mainPage.evaluate(() => window.cfBridge.openStudyTimerWindow());
  await eventually(() => Promise.resolve(app.windows().some((page) => page.url().includes("studyTimerWindow=1"))), "Auxiliary timer window did not open");
  timerPage = app.windows().find((page) => page.url().includes("studyTimerWindow=1"));
  watch(timerPage);
  await timerPage.getByTestId("study-timer-window").waitFor();
}
async function nativeWindows() {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => ({
    id: window.id, url: window.webContents.getURL(), visible: window.isVisible(),
    resizable: window.isResizable(), bounds: window.getBounds(),
  })));
}
async function resetTo(mode, config = {}) {
  await control({ type: "cancel" });
  await control({ type: "configure", mode, ...config });
  await eventually(async () => (await getTimer()).mode === mode, `${mode} did not configure`);
  await eventually(async () => await test(`study-timer-mode-${mode}`).getAttribute("aria-pressed") === "true", `${mode} did not reach the auxiliary renderer`);
}
async function stateIs(status) {
  await eventually(async () => (await getTimer()).status === status, `Timer did not reach ${status}`);
}
async function noAudio(context) {
  assert.equal((await getAudio()).playing, false, `${context}: non-target modes must remain silent`);
  assert.equal(await test("study-timer-audio-preview").count(), 0, `${context}: sound controls must be target-only`);
}
async function delay(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }

(async () => {
  await launch();
  await mainPage.getByRole("button", { name: "计划题单", exact: true }).click();
  await mainPage.waitForSelector(".study-plan-page");
  const openButton = mainPage.getByTestId("study-timer-open");
  await openButton.waitFor();
  await openButton.click();
  await eventually(() => Promise.resolve(app.windows().some((page) => page.url().includes("studyTimerWindow=1"))), "Plan timer entry did not create a native window");
  timerPage = app.windows().find((page) => page.url().includes("studyTimerWindow=1"));
  watch(timerPage);
  await test("study-timer-window").waitFor();
  const initialWindows = await nativeWindows();
  const initialTimer = initialWindows.find((window) => window.url.includes("studyTimerWindow=1"));
  assert.ok(initialTimer?.visible, "Timer must be a visible native BrowserWindow");
  assert.ok(initialTimer.resizable, "Timer must use the resizable auxiliary-window architecture");
  await mainPage.evaluate(() => Promise.all(Array.from({ length: 5 }, () => window.cfBridge.openStudyTimerWindow())));
  const repeatedWindows = await nativeWindows();
  assert.deepEqual(repeatedWindows.filter((window) => window.url.includes("studyTimerWindow=1")).map((window) => window.id), [initialTimer.id], "Repeated opens must focus the existing timer window");
  record("plan entry and repeated opens reuse one native auxiliary window", { window: initialTimer });

  const unauthorized = await mainPage.evaluate(async () => {
    const messages = [];
    for (const operation of [
      () => window.cfBridge.studyTimerAudioPlayback({ id: "unauthorized-qa", playing: true }),
      () => window.cfBridge.studyTimerAudioHostReady(),
      () => window.cfBridge.previewStudyTimerAudio(),
    ]) {
      try { await operation(); messages.push(null); }
      catch (error) { messages.push(error.message); }
    }
    return messages;
  });
  assert.ok(unauthorized.every(Boolean), "Normal renderer playback reports/host registration and non-target preview must be rejected");
  assert.ok((await nativeWindows()).every((window) => !window.url.includes("studyTimerAudio=1")), "Rejected non-target preview must not create an audio host");
  record("ordinary renderer cannot claim audio-host IPC or preview outside target mode", { rejected: unauthorized });

  await resetTo("stopwatch");
  await test("study-timer-start").click();
  await stateIs("running");
  await delay(1100);
  const stopwatch = await getTimer();
  assert.ok(stopwatch.elapsedMs >= 1000, "Stopwatch must advance in real elapsed time");
  await test("study-timer-pause").click();
  await stateIs("paused");
  const paused = (await getTimer()).elapsedMs;
  await delay(450);
  assert.equal((await getTimer()).elapsedMs, paused, "Paused stopwatch must hold its value");
  await test("study-timer-resume").click();
  await stateIs("running");
  await mainPage.locator(".rail-nav").first().locator("button").first().click();
  await app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((window) => !/[?&]study(?:Timer|Plan)(?:Window|Audio)=1/.test(window.webContents.getURL()));
    main.minimize();
  });
  await delay(750);
  assert.ok((await getTimer()).elapsedMs >= paused + 600, "Main navigation and minimization must not stop auxiliary timing");
  await noAudio("stopwatch");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => !/[?&]study(?:Timer|Plan)(?:Window|Audio)=1/.test(window.webContents.getURL())).restore());
  record("stopwatch start/pause/resume; main navigation and minimization preserve elapsed time");

  const beforeClose = (await getTimer()).elapsedMs;
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("studyTimerWindow=1")).close());
  await eventually(() => Promise.resolve(!app.windows().some((page) => page.url().includes("studyTimerWindow=1"))), "Timer native close did not remove its window");
  await delay(500);
  await openTimer();
  assert.ok((await getTimer()).elapsedMs >= beforeClose + 400, "Closing and reopening the timer must preserve running time");
  await timerPage.reload({ waitUntil: "domcontentloaded" });
  await test("study-timer-window").waitFor();
  assert.equal((await getTimer()).status, "running", "Renderer reload must retain running timer state");
  await test("study-timer-reset").click();
  await stateIs("idle");
  assert.equal((await getTimer()).elapsedMs, 0);
  record("auxiliary close/reopen and renderer reload retain state; reset returns to zero");

  await resetTo("countdown", { durationMs: 2400 });
  const secondsInput = timerPage.locator('.study-timer-duration-fields input').nth(2);
  await secondsInput.fill("3");
  await eventually(async () => (await test("study-timer-display").innerText()) === "00:00:03", "Idle countdown display must preview edited duration");
  await secondsInput.fill("2");
  await test("study-timer-start").click();
  await stateIs("running");
  await delay(250);
  await test("study-timer-pause").click();
  await stateIs("paused");
  const remaining = (await getTimer()).remainingMs;
  await delay(300);
  assert.equal((await getTimer()).remainingMs, remaining, "Paused countdown must hold its remaining time");
  await test("study-timer-resume").click();
  await stateIs("completed");
  assert.equal((await getTimer()).remainingMs, 0);
  await test("study-timer-due-banner").waitFor();
  await noAudio("completed countdown");
  await test("study-timer-reset").click();
  await stateIs("idle");
  record("countdown duration edits preview immediately; pause/resume reaches zero with a visible notice and no sound");

  await resetTo("target", { targetAt: Date.now() + 20000 });
  await test("study-timer-audio-preview").click();
  await eventually(async () => (await getAudio()).playing, "Target sound preview did not start");
  await test("study-timer-audio-stop").click();
  await eventually(async () => !(await getAudio()).playing, "Sound stop did not stop preview");
  const defaultAudio = await getAudio();
  assert.equal(defaultAudio.source, "default", "Synthetic profile must use the default gentle bell");
  await eventually(() => Promise.resolve(app.windows().some((page) => page.url().includes("studyTimerAudio=1"))), "Hidden playback host did not finish its first navigation");
  const audioHost = app.windows().find((page) => page.url().includes("studyTimerAudio=1"));
  assert.ok(audioHost, "Target sound needs its independent hidden playback host");
  watch(audioHost);
  await audioHost.evaluate(() => {
    window.__timerQaPlayback = [];
    const actualPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const entry = { src: this.src, accepted: false };
      window.__timerQaPlayback.push(entry);
      return actualPlay.call(this).then((result) => { entry.accepted = true; return result; });
    };
  });
  await test("study-timer-audio-preview").click();
  await eventually(async () => (await getAudio()).playing, "Second target preview did not start");
  await eventually(() => audioHost.evaluate(() => window.__timerQaPlayback.some((value) => value.accepted && value.src.startsWith("cf-timer-audio://local/default"))), "Default bell did not decode and begin media playback");
  const badAudioFrame = await app.evaluate(async ({ BrowserWindow, ipcMain }) => {
    const host = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("studyTimerAudio=1"));
    const handler = ipcMain._invokeHandlers.get("timer:audio-playback");
    try {
      await handler({ sender: host.webContents, senderFrame: null }, { id: "unauthorized-frame-qa", playing: true });
      return null;
    } catch (error) { return error.message; }
  });
  assert.ok(badAudioFrame, "Playback reports from a frame other than the audio host's main frame must be rejected");
  await test("study-timer-mode-stopwatch").click();
  await eventually(async () => !(await getAudio()).playing, "Changing mode must stop sound preview");
  assert.equal((await getTimer()).mode, "stopwatch");
  await noAudio("mode switched to stopwatch");
  record("target-only default bell decodes/plays; explicit and mode-switch stop; non-main-frame report rejected", { frameRejection: badAudioFrame });

  await resetTo("target", { targetAt: Date.now() + 20000 });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(20, 30, 0, 0);
  const part = (value) => String(value).padStart(2, "0");
  const tomorrowValue = `${tomorrow.getFullYear()}-${part(tomorrow.getMonth() + 1)}-${part(tomorrow.getDate())}T20:30`;
  await timerPage.locator('input[type="datetime-local"]').fill(tomorrowValue);
  await test("study-timer-start").click();
  await stateIs("running");
  assert.equal((await getTimer()).targetAt, tomorrow.getTime(), "The target form must persist the exact chosen local date and time");
  assert.match(await timerPage.locator(".study-timer-target-summary").innerText(), /明日|Tomorrow/, "The target summary must identify a next-day deadline");
  assert.equal(await test("study-timer-pause").count(), 0, "A target deadline must not offer pause");
  await test("study-timer-cancel").click();
  await stateIs("idle");
  record("target form starts a next-day local deadline, labels the cross-day date, and offers cancel without pause");

  // The real chooser service still performs its normal size/path checks and
  // managed copy. Only the native dialog's selection is supplied by this QA.
  const invalidAudioPath = path.join(outputRoot, "undecodable-audio-fixture.wav");
  fs.writeFileSync(invalidAudioPath, Buffer.from("Synthetic undecodable local WAV fixture", "utf8"));
  await app.evaluate(({ dialog }, filename) => {
    globalThis.__timerQaOriginalDialog = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
  }, invalidAudioPath);
  try { await test("study-timer-audio-choose").click(); }
  finally {
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = globalThis.__timerQaOriginalDialog;
      delete globalThis.__timerQaOriginalDialog;
    });
  }
  await eventually(async () => (await getAudio()).source === "custom", "Local audio selection did not persist its managed choice");
  fs.unlinkSync(invalidAudioPath);
  assert.equal((await getAudio()).source, "custom", "Removing the original selection must not remove the app's managed audio copy");
  await audioHost.evaluate(() => { window.__timerQaPlayback = []; });
  await test("study-timer-audio-preview").click();
  await eventually(() => audioHost.evaluate(() => window.__timerQaPlayback.some((value) => value.accepted && value.src.startsWith("cf-timer-audio://local/default"))), "Undecodable custom audio did not fall back to playable default bell");
  assert.equal((await getAudio()).error, "audio-unavailable", "The UI must receive an explicit custom-audio fallback reason");
  await test("study-timer-audio-stop").click();
  await eventually(async () => !(await getAudio()).playing, "Fallback bell did not stop");
  await test("study-timer-audio-default").click();
  await eventually(async () => (await getAudio()).source === "default" && !(await getAudio()).error, "Default reset must clear the invalid custom-audio choice and error");
  record("local audio is copied into managed storage; undecodable custom audio falls back to actual default playback; stop/default reset work");

  // The ordinary target input has minute precision; use the existing narrow
  // configuration bridge to exercise the actual deadline in a short smoke run.
  await resetTo("target", { targetAt: Date.now() + 1700 });
  await control({ type: "start" });
  await stateIs("running");
  assert.equal(await test("study-timer-pause").count(), 0, "Fixed-date target timing must not offer ambiguous pause");
  await stateIs("completed");
  await test("study-timer-due-banner").waitFor();
  await eventually(async () => (await getAudio()).playing, "Target deadline did not trigger the default bell");
  const due = await getTimer();
  assert.ok(due.notifiedAt, "Target completion must persist its notification marker");
  await test("study-timer-audio-stop").click();
  await eventually(async () => !(await getAudio()).playing, "Due bell did not stop");
  await delay(500);
  assert.equal((await getAudio()).playing, false, "Repeated due-state polling must not ring again");
  assert.equal((await getTimer()).notifiedAt, due.notifiedAt, "Repeated completion queries must retain one notification marker");
  record("target deadline rings once, due marker persists, and explicit stop prevents repeated ringing");

  await resetTo("target", { targetAt: Date.now() + 1800 });
  await control({ type: "start" });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes("studyTimerWindow=1")).close());
  await eventually(() => Promise.resolve(!app.windows().some((page) => page.url().includes("studyTimerWindow=1"))), "Timer close before deadline failed");
  await stateIs("completed");
  await eventually(async () => (await getAudio()).playing, "Closing the auxiliary window must not suppress a running target bell");
  await openTimer();
  await test("study-timer-due-banner").waitFor();
  await test("study-timer-reset").click();
  await eventually(async () => !(await getAudio()).playing, "Reset must stop the completed target sound");
  record("target deadline remains active with auxiliary window closed; reopening shows completion; reset stops sound");

  const study = await mainPage.evaluate(() => window.cfBridge.getStudyData());
  await mainPage.evaluate((value) => window.cfBridge.setStudyData(value), {
    ...study, settings: { ...study.settings, panelOpacity: 0, panelBlur: 0, accentTheme: "mint", language: "en-US" },
  });
  await eventually(async () => (await test("study-timer-window").getAttribute("class")).includes("accent-mint"), "Timer appearance did not sync to the saved theme");
  // The native window keeps the same theme backdrop as the main app. The
  // fully-clear appearance setting applies to content panels over that backdrop.
  const opaquePanels = await test("study-timer-window").evaluate((root) => [...root.querySelectorAll("*")].filter((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const color = style.backgroundColor.match(/[\d.]+/g);
    return bounds.width > 150 && bounds.height > 32 && !["INPUT", "BUTTON", "SELECT", "TEXTAREA"].includes(element.tagName)
      && (style.backgroundImage !== "none" || (color && (color.length === 3 || Number(color[3]) > 0)));
  }).map((element) => ({ tag: element.tagName, class: element.className, background: getComputedStyle(element).backgroundColor })));
  assert.deepEqual(opaquePanels, [], "Timer structural panels must be clear at panelOpacity=0");
  const untranslated = await test("study-timer-window").evaluate((root) => {
    const values = [root.innerText, ...[root, ...root.querySelectorAll("*")].flatMap((element) =>
      ["aria-label", "title", "placeholder"].map((attribute) => element.getAttribute(attribute) || ""))];
    return values.filter((text) => /[\u3400-\u9fff]/.test(text));
  });
  assert.deepEqual(untranslated, [], "Timer English labels and accessibility text must be translated");
  record("saved theme/language updates reach auxiliary window; completely transparent panels stay clear; English labels are translated");

  await resetTo("stopwatch");
  await test("study-timer-start").click();
  await stateIs("running");
  const beforeQuit = (await getTimer()).elapsedMs;
  await app.close(); app = null;
  await delay(450);
  await launch();
  await openTimer();
  assert.equal((await getTimer()).status, "running", "Application restart must retain the explicit running clock state");
  assert.ok((await getTimer()).elapsedMs >= beforeQuit + 400, "Restarted clock must derive elapsed time from its persistent real-time anchor");
  await test("study-timer-reset").click();
  record("application restart restores the running clock using its persisted real-time anchor");

  assert.deepEqual(errors, [], "Timer smoke flow must not emit renderer errors");
  const report = { status: "ok", outputRoot, userDataRoot, checks, errors, screenshotUpload: false };
  fs.writeFileSync(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => {
  fs.writeFileSync(path.join(outputRoot, "report.json"), JSON.stringify({ status: "failed", error: error.stack || String(error), checks, errors, outputRoot, userDataRoot }, null, 2), "utf8");
  console.error(error);
  process.exitCode = 1;
}).finally(async () => { if (app) await app.close(); });
