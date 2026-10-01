const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { _electron: electron } = require("playwright-core");
const { makeFixture, makeProblem } = require("./fixtures/contest-sessions.cjs");

// All persistence, dialogs, accounts, and network responses belong to this QA run.
const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, "output", "playwright", `custom-training-${Date.now()}`);
const userData = path.join(outputRoot, "user-data");
fs.mkdirSync(userData, { recursive: true });
const handle = "training_qa_fixture";
const otherHandle = "training_qa_other";
const fixture = makeFixture();
const keys = ["1900-A", "1900-B", "1901-A"];
fixture.cache.handle = handle;
fixture.cache.user = { handle, rating: 1500, maxRating: 1500, rank: "specialist" };
fixture.cache.problems = [makeProblem(1900, "A"), makeProblem(1900, "B"), makeProblem(1901, "A"), makeProblem(1901, "B")];
fixture.cache.ratingHistory = [];
fixture.study.settings = { ...fixture.study.settings, language: "zh-CN", autoSync: false, autoBackup: false };

function submission(id, key, created, verdict, account = handle, participantType = "PRACTICE") {
  const [contestId, index] = key.split("-");
  return {
    id, contestId: Number(contestId), creationTimeSeconds: created,
    // Deliberately unrelated to this custom session. Never use it for its clock.
    relativeTimeSeconds: 987654,
    author: { participantType, members: [{ handle: account }] },
    verdict, problem: makeProblem(Number(contestId), index), programmingLanguage: "GNU C++20",
  };
}
const historical = submission(1, keys[0], Math.floor(Date.now() / 1000) - 86400, "OK");
fixture.cache.submissions = [historical];
const write = (filename, value) => fs.writeFileSync(path.join(userData, filename), JSON.stringify(value, null, 2), "utf8");
const read = (filename) => JSON.parse(fs.readFileSync(path.join(userData, filename), "utf8"));
write("cache.json", fixture.cache);
write("contest-center.json", fixture.center);
write("study.json", fixture.study);
write("favorites.json", [keys[1]]);
write("study-plan.json", { version: 1, items: [{
  id: "qa-planned-problem", problemKey: keys[2], ...fixture.cache.problems[2],
  status: "pending", reason: "QA fixture", addedAt: new Date().toISOString(), completedAt: null,
}] });

let app;
let page;
let clockOffsetMs = 0;
let fakeSubmissions = [historical];
let fakeOffline = false;
const errors = [];
const steps = [];
const requests = [];
const openedUrls = [];
const test = (id) => page.getByTestId(id);
const row = (key) => test(`training-problem-${key}`);

async function configureNetwork() {
  await app.evaluate(({ shell }, config) => {
    globalThis.__trainingQa = { ...config, requests: [], urls: [] };
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const state = globalThis.__trainingQa;
      state.requests.push(url.pathname + url.search);
      if (state.offline) throw Error("Offline QA fixture");
      let result;
      if (url.pathname.endsWith("/user.status")) {
        const account = url.searchParams.get("handle");
        if (![config.handle, config.otherHandle].includes(account)) throw Error("QA attempted an unexpected account");
        const from = Number(url.searchParams.get("from") || 1);
        const count = Number(url.searchParams.get("count") || 1000);
        result = state.submissions.slice().sort((a, b) => b.id - a.id).slice(from - 1, from - 1 + count);
      } else if (url.pathname.endsWith("/contest.list")) result = config.center.contests;
      else if (url.pathname.endsWith("/user.info")) result = [config.user];
      else if (url.pathname.endsWith("/problemset.problems")) result = { problems: config.problems };
      else if (url.pathname.endsWith("/user.rating") || url.pathname.endsWith("/user.ratedList") || url.pathname.endsWith("/contest.ratingChanges")) result = [];
      else throw Error(`Unexpected QA API: ${url.pathname}`);
      return { ok: true, json: async () => ({ status: "OK", result }) };
    };
    shell.openExternal = async (url) => { globalThis.__trainingQa.urls.push(String(url)); };
    if (!globalThis.__trainingQaRealNow) globalThis.__trainingQaRealNow = Date.now.bind(Date);
    globalThis.__trainingQaClockOffset = config.offset;
    Date.now = () => globalThis.__trainingQaRealNow() + globalThis.__trainingQaClockOffset;
  }, { handle, otherHandle, submissions: fakeSubmissions, offline: fakeOffline, center: fixture.center,
    user: fixture.cache.user, problems: fixture.cache.problems, offset: clockOffsetMs });
}

async function launch(english = false) {
  app = await electron.launch({
    executablePath: process.env.CF_COMPASS_QA_EXECUTABLE || path.join(projectRoot, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron"),
    args: process.env.CF_COMPASS_QA_EXECUTABLE ? ["--disable-gpu"] : ["--disable-gpu", projectRoot],
    cwd: projectRoot, env: { ...process.env, CF_COMPASS_USER_DATA: userData },
  });
  for (const [name, stream] of [["stdout", app.process().stdout], ["stderr", app.process().stderr]]) {
    stream?.on("data", (chunk) => fs.appendFileSync(path.join(outputRoot, `main-${name}.log`), chunk));
  }
  await app.evaluate(() => {
    globalThis.__trainingQaStartupErrors = [];
    process.on("unhandledRejection", (error) => globalThis.__trainingQaStartupErrors.push(error?.stack || String(error)));
  });
  await configureNetwork();
  try { page = await app.firstWindow(); } catch (error) {
    const state = await app.evaluate(({ app, BrowserWindow }) => ({
      ready: app.isReady(), errors: globalThis.__trainingQaStartupErrors,
      windows: BrowserWindow.getAllWindows().map((window) => ({ destroyed: window.isDestroyed(), url: window.webContents.getURL() })),
    })).catch((failure) => ({ inspectionError: failure.message }));
    fs.writeFileSync(path.join(outputRoot, "startup-failure.json"), JSON.stringify(state, null, 2), "utf8");
    throw error;
  }
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForSelector(".app-shell");
  await page.evaluate((offset) => {
    globalThis.__trainingQaRealNow = Date.now.bind(Date);
    globalThis.__trainingQaClockOffset = offset;
    Date.now = () => globalThis.__trainingQaRealNow() + globalThis.__trainingQaClockOffset;
  }, clockOffsetMs);
  await page.getByRole("button", { name: english ? "Custom Training" : "自定义训练赛", exact: true }).click();
  await test("custom-training").waitFor();
}

async function harvest() {
  if (!app) return;
  const evidence = await app.evaluate(() => ({ requests: globalThis.__trainingQa.requests, urls: globalThis.__trainingQa.urls }));
  requests.push(...evidence.requests);
  openedUrls.push(...evidence.urls);
}
async function close() { if (app) { await harvest(); await app.close(); app = null; page = null; } }
async function network(submissions, offline = false) {
  fakeSubmissions = submissions;
  fakeOffline = offline;
  await app.evaluate((_electron, value) => {
    globalThis.__trainingQa.submissions = value.submissions;
    globalThis.__trainingQa.offline = value.offline;
  }, { submissions, offline });
}
async function clockTo(seconds) {
  clockOffsetMs = seconds * 1000 - Date.now();
  await app.evaluate((_electron, offset) => { globalThis.__trainingQaClockOffset = offset; }, clockOffsetMs);
  await page.evaluate((offset) => { globalThis.__trainingQaClockOffset = offset; }, clockOffsetMs);
}
async function store() { return page.evaluate(() => window.cfBridge.getTrainingSessions()); }
async function current(id) { return (await store()).sessions.find((session) => session.id === id); }
async function eventually(predicate, message, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await page.waitForTimeout(100);
  }
  throw Error(message);
}
async function snapshot(name) {
  fs.writeFileSync(path.join(outputRoot, name + ".yml"), await page.locator("body").ariaSnapshot(), "utf8");
  await page.screenshot({ path: path.join(outputRoot, name + ".png") });
}
async function layout(name) {
  const result = await test("custom-training").evaluate((root) => ({
    viewport: { width: innerWidth, height: innerHeight }, rootWidth: document.documentElement.scrollWidth,
    panelWidth: root.scrollWidth, clientWidth: root.clientWidth,
  }));
  assert.ok(result.rootWidth <= result.viewport.width + 1, `${name}: horizontal document overflow`);
  assert.ok(result.panelWidth <= result.clientWidth + 1, `${name}: horizontal training panel overflow`);
  steps.push({ name, layout: result });
}
async function status(key, value) {
  await eventually(async () => await row(key).getAttribute("data-status") === value, `${key} did not reach ${value}`);
}
async function metrics(expected) {
  const displayed = await test("training-summary").locator("strong").allInnerTexts();
  assert.deepEqual(displayed, expected, "Session summary metrics do not match valid submissions");
}
async function sync() {
  await test("training-sync").click();
  await eventually(async () => !(await test("training-sync").isDisabled()), "Sync did not finish", 30000);
}
async function assertLocked() {
  for (const name of ["training-title", "training-duration", "training-source"]) {
    const control = test(name);
    assert.ok(await control.count() === 0 || await control.isDisabled(), `${name} is editable during a locked session`);
  }
  assert.equal(await page.locator('[data-testid^="training-up-"], [data-testid^="training-down-"], [data-testid^="training-remove-"]').count(), 0);
  for (const key of keys) {
    const text = await row(key).innerText();
    assert.doesNotMatch(text, /implementation|\b1000\b|\b1400\b/, `${key}: hidden metadata leaked`);
  }
}
async function assertEnglish() {
  const residuals = await test("custom-training").evaluate((root) => {
    const found = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) if (/[\u3400-\u9fff]/.test(node.textContent)) found.push(node.textContent);
    for (const element of root.querySelectorAll("[aria-label],[placeholder],[title]")) {
      for (const name of ["aria-label", "placeholder", "title"]) if (/[\u3400-\u9fff]/.test(element.getAttribute(name) || "")) found.push(element.getAttribute(name));
    }
    return found;
  });
  assert.deepEqual(residuals, [], "Custom Training has untranslated English UI");
  assert.doesNotMatch(await page.locator(".page-heading").innerText(), /[\u3400-\u9fff]/, "Custom Training has an untranslated page heading");
}

async function assertPrivacy(scope, hideTags, hideRating, context) {
  const evidence = await scope.evaluate((root) => ({
    visible: root.innerText,
    attributes: [root, ...root.querySelectorAll("*")].flatMap((element) =>
      ["title", "aria-label", "data-tooltip"].map((name) => element.getAttribute(name) || "")).join("\n"),
  }));
  const all = `${evidence.visible}\n${evidence.attributes}`;
  if (hideTags) assert.doesNotMatch(all, /privacy_tag_marker/, `${context}: hidden tag leaked into text or accessibility attributes`);
  else assert.match(evidence.visible, /privacy_tag_marker/, `${context}: visible tags missing`);
  if (hideRating) assert.doesNotMatch(all, /1777/, `${context}: hidden rating leaked into text or accessibility attributes`);
  else assert.match(evidence.visible, /1777/, `${context}: visible rating missing`);
}

async function privacyMatrix() {
  const privacyKey = "1999-Z";
  const privacyProblem = { ...makeProblem(1999, "Z", "Privacy fixture"), rating: 1777, tags: ["privacy_tag_marker"] };
  await close();
  const cached = read("cache.json");
  write("cache.json", { ...cached, problems: [...cached.problems, privacyProblem] });
  fixture.cache.problems.push(privacyProblem);
  const choices = [
    { name: "none", tags: false, rating: false }, { name: "tags-only", tags: true, rating: false },
    { name: "rating-only", tags: false, rating: true }, { name: "both", tags: true, rating: true },
  ];
  for (const english of [false, true]) {
    const language = english ? "en" : "zh";
    const saved = read("study.json");
    write("study.json", { ...saved, settings: { ...saved.settings, language: english ? "en-US" : "zh-CN" } });
    await launch(english);
    for (const choice of choices) {
      const context = `${language}-${choice.name}`;
      const title = `Privacy ${context}`;
      await test("training-new").click();
      await test("training-title").fill(title);
      await test("training-duration").fill("1");
      await test("training-hide-tags").setChecked(choice.tags);
      await test("training-hide-rating").setChecked(choice.rating);
      await test("training-source").selectOption("all");
      await test(`training-pick-${privacyKey}`).click();
      const candidate = page.locator(".custom-training-candidate").filter({ has: test(`training-pick-${privacyKey}`) });
      await assertPrivacy(candidate, choice.tags, choice.rating, `${context} composer candidate`);
      await assertPrivacy(row(privacyKey), choice.tags, choice.rating, `${context} composer selection`);
      assert.match(await test("training-privacy-hint").innerText(), english ? /Codeforces.*(?:unchanged|original|still|unaffected)/i : /Codeforces.*(?:原站|原始|仍)/, "External Codeforces metadata boundary is not explained");
      if (english) await assertEnglish();
      await test("training-start").click();
      await eventually(async () => (await store()).sessions.some((item) => item.title === title && item.status === "running"), `${context} did not start`);
      const session = (await store()).sessions.find((item) => item.title === title);
      assert.equal(session.hideTags, choice.tags);
      assert.equal(session.hideRating, choice.rating);
      await assertPrivacy(row(privacyKey), choice.tags, choice.rating, `${context} running`);
      let restarted = false;
      if (!english && choice.name === "tags-only") {
        await close();
        await launch();
        await test("training-history").selectOption(session.id);
        assert.equal((await current(session.id)).status, "running");
        await assertPrivacy(row(privacyKey), choice.tags, choice.rating, `${context} running after restart`);
        await snapshot(`14-privacy-${context}-restarted`);
        restarted = true;
      }
      await test("training-finish").click();
      await eventually(async () => (await current(session.id))?.status === "finished", `${context} did not finish`);
      await assertPrivacy(row(privacyKey), choice.tags, choice.rating, `${context} finished defaults`);
      if (choice.name === "both") {
        await row(privacyKey).getByRole("button", { name: /笔记|Note/i }).click();
        await page.locator(".note-drawer").waitFor();
        await assertPrivacy(page.locator(".note-drawer"), true, true, `${context} shared note preserves hidden metadata`);
        await page.keyboard.press("Escape");
        const snapshot = (await current(session.id)).problems.find((problem) => problem.key === privacyKey);
        assert.equal(snapshot.rating, 1777);
        assert.deepEqual(snapshot.tags, ["privacy_tag_marker"], "Hiding note metadata mutated the session snapshot");
      }
      for (const [field, enabled] of [["tags", choice.tags], ["rating", choice.rating]]) {
        const reveal = test(`training-reveal-${field}`);
        assert.equal(await reveal.getAttribute("aria-pressed"), String(!enabled), `${context}: ${field} control disagrees with saved visibility`);
        await reveal.click();
        await assertPrivacy(row(privacyKey), field === "tags" ? !choice.tags : choice.tags, field === "rating" ? !choice.rating : choice.rating, `${context} toggle ${field} independently`);
        assert.equal(await reveal.getAttribute("aria-pressed"), String(enabled), `${context}: ${field} control did not toggle`);
        if (choice.name === "both") await snapshot(`14-privacy-${context}-${field}-revealed`);
        await reveal.click();
        await assertPrivacy(row(privacyKey), choice.tags, choice.rating, `${context} collapsed ${field}`);
      }
      if (choice.name === "both") {
        await test("training-reveal-tags").click();
        await test("training-reveal-rating").click();
        await assertPrivacy(row(privacyKey), false, false, `${context} both explicitly revealed`);
        await test("training-history").selectOption(previousFinishedId);
        await test("training-history").selectOption(session.id);
        await assertPrivacy(row(privacyKey), true, true, `${context} session change resets reveal`);
      }
      if (english) await assertEnglish();
      await snapshot(`14-privacy-${context}-finished`);
      steps.push({ name: "independent-visibility-matrix", language, hideTags: choice.tags, hideRating: choice.rating,
        verified: ["composer", "running", "finished", "explicit-independent-reveal", "attributes"], restarted });
    }
    await close();
  }
  await launch(true);
  const both = (await store()).sessions.find((item) => item.title === "Privacy en-both");
  await test("training-history").selectOption(both.id);
  await assertPrivacy(row(privacyKey), true, true, "finished after cold restart restores saved hidden flags");
  await assertEnglish();
  await page.setViewportSize({ width: 1040, height: 700 });
  await layout("english-hidden-review-minimum-window");
  await snapshot("15-final-hidden-review-english");
}

let previousFinishedId;

(async () => {
  await launch();
  await test("training-source").selectOption("favorites");
  await test(`training-pick-${keys[1]}`).waitFor();
  assert.equal(await page.locator('[data-testid^="training-pick-"]').count(), 1);
  await test(`training-pick-${keys[1]}`).click();
  await test("training-source").selectOption("plan");
  await test(`training-pick-${keys[2]}`).waitFor();
  assert.equal(await page.locator('[data-testid^="training-pick-"]').count(), 1);
  await test(`training-pick-${keys[2]}`).click();
  await test("training-source").selectOption("all");
  await test(`training-pick-${keys[0]}`).click();
  await test(`training-up-${keys[0]}`).click();
  await test("training-title").fill("Timed QA practice");
  await test("training-duration").fill("1");
  for (const [name, label] of [["training-hide-tags", "隐藏算法标签"], ["training-hide-rating", "隐藏难度 Rating"]]) {
    const control = await test(name).count() ? test(name) : page.getByLabel(label, { exact: true });
    await control.check();
  }
  assert.match(await row(keys[0]).innerText(), /AC|已通过|通过|accepted|solved/i, "Previous solving history is not shown");
  await test("training-save").click();
  await eventually(async () => (await store()).sessions.some((session) => session.title === "Timed QA practice"), "Draft was not persisted");
  const draft = (await store()).sessions.find((session) => session.title === "Timed QA practice");
  const id = draft.id;
  previousFinishedId = id;
  assert.equal(draft.status, "draft");
  assert.deepEqual(draft.problems.map((problem) => problem.key), [keys[1], keys[0], keys[2]]);
  assert.equal(draft.durationSeconds, 60);
  assert.equal(read("custom-training.json").sessions.find((session) => session.id === id).status, "draft");
  await layout("draft-desktop");
  await snapshot("01-sources-order-history");
  steps.push({ name: "library-favorites-plan-and-saved-order", selectedKeys: draft.problems.map((problem) => problem.key) });

  // Two real click events exercise the UI's duplicate action guard.
  await test("training-start").evaluate((button) => { button.click(); button.click(); });
  await eventually(async () => (await current(id))?.status === "running", "Session did not start");
  let session = await current(id);
  const start = session.startTimeSeconds;
  const end = session.endTimeSeconds;
  assert.equal(end - start, 60);
  assert.equal((await store()).sessions.filter((item) => item.status === "running").length, 1);
  await test("training-countdown").waitFor();
  assert.match(await test("training-countdown").innerText(), /\d+:\d\d/);
  await assertLocked();
  await snapshot("02-running-locked-hidden");
  steps.push({ name: "duplicate-start-lock-and-countdown", durationSeconds: end - start });

  await clockTo(start + 4);
  const valid = [submission(100, keys[1], start + 1, "WRONG_ANSWER"), submission(101, keys[2], start + 2, "TESTING"), submission(102, keys[0], start, "OK")];
  const excluded = [submission(200, keys[2], start - 1, "OK"), submission(201, keys[1], end + 1, "OK"),
    submission(202, "1901-B", start + 1, "OK"), submission(203, keys[2], start + 1, "OK", otherHandle),
    submission(204, keys[1], start + 1, "OK", handle, "VIRTUAL")];
  const pageFiller = Array.from({ length: 1001 }, (_, index) => submission(3000 + index, "1901-B", start + 3, "WRONG_ANSWER"));
  await network([historical, ...valid, ...excluded, ...pageFiller]);
  await sync();
  await status(keys[0], "accepted");
  await status(keys[1], "wrong");
  await status(keys[2], "pending");
  await metrics(["1 / 3", "00:00:00", "1", "1"]);
  session = await current(id);
  assert.deepEqual(session.submissions.map((item) => item.id).sort((a, b) => a - b), [100, 101, 102]);
  await snapshot("03-submission-identity-window-pending");
  assert.ok((await app.evaluate(() => globalThis.__trainingQa.requests)).some((url) => url.includes("from=1001")), "Submission pagination was not exercised");
  steps.push({ name: "full-problem-key-handle-practice-and-creation-window", acceptedIds: [100, 101, 102], excludedIds: excluded.map((item) => item.id), paginationFillerCount: pageFiller.length });

  const previous = session.submissions;
  await network(fakeSubmissions, true);
  await sync();
  session = await current(id);
  assert.deepEqual(session.submissions, previous, "Offline synchronization erased evidence");
  assert.match(session.syncError || "", /Offline QA fixture/);
  await snapshot("04-offline-preserves-evidence");
  await network([historical, ...valid.map((item) => item.id === 101 ? { ...item, verdict: "OK" } : item), valid[0], ...excluded]);
  await sync();
  await status(keys[2], "accepted");
  assert.match(await row(keys[2]).innerText(), /00:00:02/, "First AC used the original contest relative time");
  session = await current(id);
  assert.equal(session.syncError, null);
  assert.equal(session.submissions.filter((item) => item.id === 100).length, 1, "Repeated API submission was counted twice");
  steps.push({ name: "offline-reconnect-pending-verdict-refresh-and-deduplication" });

  await close();
  await launch();
  await test("training-history").selectOption(id);
  assert.equal((await current(id)).status, "running");
  assert.equal((await current(id)).startTimeSeconds, start);
  assert.equal((await current(id)).endTimeSeconds, end);
  await assertLocked();
  await status(keys[2], "accepted");
  await snapshot("05-cold-start-running-restored");
  await page.setViewportSize({ width: 1040, height: 700 });
  await layout("running-minimum-window");
  await snapshot("06-minimum-window-running");
  await page.setViewportSize({ width: 1600, height: 1000 });
  steps.push({ name: "cold-restart-preserves-account-order-deadline-and-results" });

  // Exact-cutoff submission is pending when the countdown reaches zero.
  const atCutoff = submission(130, keys[1], end, "TESTING");
  await network([...fakeSubmissions, atCutoff]);
  await clockTo(end + 1);
  await eventually(async () => (await current(id))?.status === "finished", "Expired session was not finished automatically");
  assert.equal((await current(id)).endTimeSeconds, end);
  await sync();
  await status(keys[1], "pending");
  await snapshot("07-deadline-pending");
  await network([...fakeSubmissions.map((item) => item.id === 130 ? { ...item, verdict: "OK" } : item), submission(131, keys[1], end + 1, "OK")]);
  await clockTo(end + 5);
  await sync();
  await status(keys[1], "accepted");
  await metrics(["3 / 3", "00:00:00", "1", "0"]);
  assert.match(await row(keys[1]).innerText(), /00:01:00/, "Exact-cutoff first AC time was not preserved");
  session = await current(id);
  assert.ok(session.submissions.some((item) => item.id === 130 && item.verdict === "OK"));
  assert.equal(session.submissions.some((item) => item.id === 131), false);
  assert.equal(session.endTimeSeconds, end);
  await test("training-summary").waitFor();
  await snapshot("08-late-verdict-finished-summary");
  steps.push({ name: "automatic-deadline-exact-cutoff-and-late-judging", endTimeSeconds: end, lateAcceptedId: 130, excludedPostDeadlineId: 131 });

  await row(keys[0]).getByRole("button", { name: /笔记|Note/ }).click();
  await page.locator(".note-drawer").waitFor();
  await snapshot("09-shared-note-entry");
  await page.keyboard.press("Escape");
  await row(keys[1]).getByRole("button", { name: /加入待补题|加入题单|Add to.*plan/i }).click();
  await eventually(async () => read("study-plan.json").items.some((item) => item.problemKey === keys[1]), "Upsolving plan entry was not persisted");
  await row(keys[0]).getByRole("button", { name: /Codeforces|Fixture 1900A|打开题目|Open problem/i }).first().click();
  assert.ok((await app.evaluate(() => globalThis.__trainingQa.urls)).some((url) => url === "https://codeforces.com/contest/1900/problem/A"));
  steps.push({ name: "shared-notes-study-plan-and-codeforces-original-link" });

  await close();
  const savedStudy = read("study.json");
  write("study.json", { ...savedStudy, settings: { ...savedStudy.settings, language: "en-US" } });
  await launch(true);
  await test("training-history").selectOption(id);
  await status(keys[1], "accepted");
  await assertEnglish();
  await page.setViewportSize({ width: 1040, height: 700 });
  await layout("english-finished-minimum-window");
  await snapshot("10-english-minimum-window");
  await page.setViewportSize({ width: 1600, height: 1000 });
  steps.push({ name: "english-finished-review-and-small-window" });

  const exportPath = path.join(userData, "qa-export.json");
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exportPath);
  assert.equal((await page.evaluate(() => window.cfBridge.exportData())).canceled, false);
  const exported = read("qa-export.json");
  assert.ok(exported.data.customTraining.sessions.some((item) => item.id === id));
  const importPath = path.join(userData, "qa-import.json");
  const replacement = JSON.parse(JSON.stringify(exported));
  replacement.data.customTraining.sessions = replacement.data.customTraining.sessions.filter((item) => item.id === id);
  replacement.data.customTraining.sessions[0].title = "Restored QA practice";
  write("qa-import.json", replacement);
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    dialog.showMessageBox = async () => ({ response: 1 });
  }, importPath);
  assert.equal((await page.evaluate(() => window.cfBridge.importData())).canceled, false);
  assert.equal((await current(id)).title, "Restored QA practice");
  const legacy = JSON.parse(JSON.stringify(exported));
  delete legacy.data.customTraining;
  write("qa-import.json", legacy);
  assert.equal((await page.evaluate(() => window.cfBridge.importData())).canceled, false);
  assert.equal((await current(id)).title, "Restored QA practice", "Legacy backup erased existing custom training history");
  steps.push({ name: "bridge-export-import-and-legacy-backup-compatibility" });

  await close();
  const switched = { ...read("cache.json"), handle: otherHandle, user: { ...fixture.cache.user, handle: otherHandle }, submissions: [] };
  write("cache.json", switched);
  await launch(true);
  const accountError = await page.evaluate(async (sessionId) => {
    try { await window.cfBridge.syncTrainingSession(sessionId); return null; } catch (error) { return error.message; }
  }, id);
  assert.match(accountError || "", /account|账号|TRAINING_ACCOUNT_MISMATCH/i);
  assert.equal(read("custom-training.json").sessions.find((item) => item.id === id).handle.toLowerCase(), handle);
  assert.equal(read("custom-training.json").sessions.find((item) => item.id === id).title, "Restored QA practice");
  await assertEnglish();
  await snapshot("11-account-switch-isolation");
  steps.push({ name: "account-switch-rejects-old-session-sync-and-preserves-history" });

  await test("training-new").click();
  await test("training-title").fill("Cancelled QA practice");
  await test("training-source").selectOption("all");
  await test(`training-pick-${keys[0]}`).click();
  await test("training-start").click();
  await eventually(async () => (await store()).sessions.some((item) => item.title === "Cancelled QA practice" && item.status === "running"), "New account session did not start");
  const cancelledId = (await store()).sessions.find((item) => item.title === "Cancelled QA practice").id;
  await network(fakeSubmissions, true);
  await test("training-sync").click();
  await eventually(async () => await test("training-sync").isDisabled(), "In-flight sync was not visible");
  assert.equal(await test("training-finish").isDisabled(), false, "In-flight sync blocks finish");
  assert.equal(await test("training-cancel").isDisabled(), false, "In-flight sync blocks cancel");
  await test("training-cancel").click();
  await test("training-cancel-confirm").click();
  await eventually(async () => (await current(cancelledId))?.status === "cancelled", "Cancellation was not persisted");
  await network(fakeSubmissions, false);
  await eventually(async () => !(await test("training-sync").isDisabled()), "In-flight sync did not settle after cancellation", 30000);
  await page.evaluate(async (sessionId) => { await window.cfBridge.cancelTrainingSession(sessionId); await window.cfBridge.cancelTrainingSession(sessionId); }, cancelledId);
  assert.equal((await current(cancelledId)).status, "cancelled");
  assert.equal((await store()).sessions.filter((item) => item.id === cancelledId).length, 1);
  await snapshot("12-cancel-confirmation-and-idempotence");
  steps.push({ name: "cancel-during-sync-confirmation-and-idempotence" });

  await test("training-new").click();
  await test("training-title").fill("Early finish QA practice");
  await test("training-duration").fill("1");
  await test(`training-pick-${keys[0]}`).click();
  await test("training-start").click();
  await eventually(async () => (await store()).sessions.some((item) => item.title === "Early finish QA practice" && item.status === "running"), "Manual-finish session did not start");
  const early = (await store()).sessions.find((item) => item.title === "Early finish QA practice");
  await clockTo(early.startTimeSeconds + 5);
  await network(fakeSubmissions, true);
  await test("training-sync").click();
  await eventually(async () => await test("training-sync").isDisabled(), "Manual finish did not exercise in-flight sync");
  assert.equal(await test("training-finish").isDisabled(), false, "In-flight sync blocks finish");
  assert.equal(await test("training-cancel").isDisabled(), false, "In-flight sync blocks cancel");
  await test("training-finish").evaluate((button) => { button.click(); button.click(); });
  await eventually(async () => (await current(early.id))?.status === "finished", "Manual finish was not persisted");
  await network(fakeSubmissions, false);
  await eventually(async () => !(await test("training-sync").isDisabled()), "In-flight sync did not settle after finish", 30000);
  const finished = await current(early.id);
  assert.ok(finished.endTimeSeconds >= early.startTimeSeconds + 5 && finished.endTimeSeconds < early.endTimeSeconds);
  await page.evaluate(async (sessionId) => { await window.cfBridge.finishTrainingSession(sessionId); }, early.id);
  assert.equal((await current(early.id)).endTimeSeconds, finished.endTimeSeconds);
  steps.push({ name: "manual-finish-during-sync-duplicate-click-and-idempotent-cutoff" });

  await test("training-new").click();
  await test("training-title").fill("Restart past deadline QA practice");
  await test("training-duration").fill("1");
  await test(`training-pick-${keys[1]}`).click();
  await test("training-start").click();
  await eventually(async () => (await store()).sessions.some((item) => item.title === "Restart past deadline QA practice" && item.status === "running"), "Restart-expiry session did not start");
  const restartExpiry = (await store()).sessions.find((item) => item.title === "Restart past deadline QA practice");
  await close();
  clockOffsetMs = (restartExpiry.endTimeSeconds + 2) * 1000 - Date.now();
  await launch(true);
  await test("training-history").selectOption(restartExpiry.id);
  await eventually(async () => (await current(restartExpiry.id))?.status === "finished", "Cold restart past deadline did not finish the session");
  assert.equal((await current(restartExpiry.id)).endTimeSeconds, restartExpiry.endTimeSeconds);
  await assertEnglish();
  await snapshot("13-restart-past-deadline-preserves-cutoff");
  steps.push({ name: "cold-restart-past-deadline-preserves-original-cutoff", durationSeconds: restartExpiry.endTimeSeconds - restartExpiry.startTimeSeconds });
  await privacyMatrix();
  await harvest();
  assert.deepEqual(errors, [], "Renderer errors");
  assert.ok(requests.some((url) => url.includes("user.status?") && url.includes(`handle=${handle}`)));
  const report = { passed: true, runtime: process.env.CF_COMPASS_QA_EXECUTABLE ? "packaged" : "source",
    fixtureAccount: handle, simulatedApi: true, simulatedClock: true,
    steps, errors, userStatusRequests: requests.filter((url) => url.includes("/user.status?")), openedUrls, outputRoot };
  fs.writeFileSync(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
})().catch(async (error) => {
  fs.writeFileSync(path.join(outputRoot, "failure.txt"), error.stack || String(error), "utf8");
  if (page && !page.isClosed()) await snapshot("failure").catch(() => {});
  console.error(error);
  console.error("Evidence: " + outputRoot);
  process.exitCode = 1;
}).finally(close);
