const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require("playwright-core");
const { makeFixture } = require("./fixtures/contest-sessions.cjs");

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, ".qa-output", `problem-lists-${Date.now()}`);
const userData = path.join(outputRoot, "profile");
const firstRoot = path.join(outputRoot, "templates-a");
const secondRoot = path.join(outputRoot, "templates-b");
const templateName = "graph # review";
const templatePath = path.join(firstRoot, templateName + ".cpp");
for (const directory of [userData, firstRoot, secondRoot]) fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(templatePath, "// dijkstra\nint main() { return 0; }");
fs.writeFileSync(path.join(secondRoot, "other.cpp"), "int main() { return 0; }");
const outside = path.join(outputRoot, "outside.cpp");
fs.writeFileSync(outside, "int main() { return 0; }");
const fixture = makeFixture();
Object.assign(fixture.study.settings, { language: "zh-CN", autoSync: false, autoBackup: false, wallpaperEnabled: false, reduceMotion: true });
for (const [name, value] of [
  ["cache.json", fixture.cache], ["study.json", fixture.study], ["favorites.json", []],
  ["study-plan.json", { version: 1, items: [] }],
  ["template-library.json", { root: firstRoot, overrides: { [templateName + ".cpp"]: "graph" } }],
]) fs.writeFileSync(path.join(userData, name), JSON.stringify(value));

let app, page, plan;
const checks = [];
const errors = [];
const record = (name) => { checks.push(name); console.log(JSON.stringify({ check: name, status: "passed" })); };
const getStudy = () => page.evaluate(() => window.cfBridge.getStudyData());
const getQueue = () => page.evaluate(() => window.cfBridge.getStudyPlan());
async function launch() {
  app = await electron.launch({
    executablePath: process.env.CF_COMPASS_QA_EXECUTABLE || path.join(projectRoot, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron"),
    args: process.env.CF_COMPASS_QA_EXECUTABLE ? ["--disable-gpu"] : ["--disable-gpu", projectRoot],
    cwd: projectRoot,
    env: { ...process.env, CF_COMPASS_USER_DATA: userData, VITE_DEV_SERVER_URL: "" },
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.locator(".problem-row").first().waitFor();
}
async function chooseList(name) {
  await page.getByRole("combobox", { name: "查看题单", exact: true }).selectOption(name ? { label: name } : "");
}

(async () => {
  await launch();
  await page.evaluate(() => window.cfBridge.setProblemNote("1900-A", { content: "Saved from another window" }));
  await page.getByRole("button", { name: "新建题单", exact: true }).click();
  await page.getByPlaceholder("例如：图论专项、周末训练").fill("Graph review");
  await page.getByRole("button", { name: "创建题单", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal((await getStudy()).notes["1900-A"].content, "Saved from another window");
  record("creating a list preserves notes saved outside the main window");

  await chooseList("");
  await page.getByRole("button", { name: "收录 1900-A 到自建题单", exact: true }).click();
  await page.getByRole("dialog").locator(".problem-list-picker > button").filter({ hasText: "Graph review" }).click();
  await page.getByRole("dialog").getByRole("button", { pressed: true }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "完成", exact: true }).click();
  await chooseList("Graph review");
  await page.locator(".problem-row").first().waitFor();
  assert.equal(await page.locator(".problem-row").count(), 1);
  await page.getByRole("button", { name: "重命名题单", exact: true }).click();
  await page.getByPlaceholder("例如：图论专项、周末训练").fill("Week 1");
  await page.getByRole("button", { name: "保存名称", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.deepEqual((await getStudy()).problemLists[0].problemKeys, ["1900-A"]);
  record("named lists can collect, filter and rename without changing membership");

  await page.evaluate(async () => {
    const current = await window.cfBridge.getStudyData();
    await Promise.all([
      window.cfBridge.setProblemLists(current.problemLists),
      window.cfBridge.setProblemNote("1900-A", { content: "Concurrent note survives list save" }),
    ]);
  });
  assert.equal((await getStudy()).notes["1900-A"].content, "Concurrent note survives list save");
  assert.equal((await getStudy()).problemLists[0].name, "Week 1");
  record("concurrent list and note mutations retain both records");

  await chooseList("");
  for (let index = 0; index < 2; index++) {
    await page.getByRole("button", { name: "加入计划题单", exact: true }).first().click();
    await page.getByRole("button", { name: "已在计划题单", exact: true }).nth(index).waitFor();
  }
  assert.deepEqual((await getQueue()).items.map((item) => item.problemKey), ["1900-A", "1900-B"]);
  record("new study-plan problems append in first-in-first-out order");

  await page.getByRole("button", { name: "模板库", exact: true }).click();
  await page.locator("[data-template-search]").fill(templateName);
  await page.getByRole("button", { name: `加入待做 ${templateName}`, exact: true }).click();
  await page.getByRole("button", { name: `已加入待做 ${templateName}`, exact: true }).waitFor();
  assert.equal((await getQueue()).items.at(-1).filePath, templatePath);
  await page.getByRole("button", { name: "计划题单", exact: true }).click();
  [plan] = await Promise.all([
    app.waitForEvent("window"),
    page.getByRole("button", { name: "打开独立题单", exact: true }).click(),
  ]);
  plan.setDefaultTimeout(12000);
  await plan.getByRole("button", { name: `完成 ${templateName}`, exact: true }).waitFor();
  await page.getByRole("button", { name: "模板库", exact: true }).click();
  await page.locator("[data-template-search]").fill(templateName);
  await plan.getByRole("button", { name: `完成 ${templateName}`, exact: true }).click();
  await page.locator('[data-template-completions="1"]').waitFor();
  await page.getByRole("button", { name: `再次复习 ${templateName}`, exact: true }).click();
  await plan.getByRole("button", { name: `完成 ${templateName}`, exact: true }).click();
  await page.locator('[data-template-completions="2"]').waitFor();
  await plan.getByRole("button", { name: `将 ${templateName} 恢复为待完成`, exact: true }).click();
  await page.locator('[data-template-completions="1"]').waitFor();
  await plan.getByRole("button", { name: `完成 ${templateName}`, exact: true }).click();
  await page.locator('[data-template-completions="2"]').waitFor();
  await plan.getByRole("button", { name: `从独立题单删除 ${templateName}`, exact: true }).click();
  await plan.getByRole("button", { name: `从独立题单删除 ${templateName}`, exact: true }).waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-template-card]").getAttribute("data-template-completions"), "2");
  await page.getByRole("button", { name: `再次复习 ${templateName}`, exact: true }).click();
  await page.locator('[data-template-review="pending"][data-template-completions="2"]').waitFor();
  record("template completion counts accumulate, undo one round, and survive queue removal");

  await app.evaluate(({ dialog, shell }, root) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] });
    globalThis.__qaOpenedTemplateUrls = [];
    shell.openExternal = async (url) => { globalThis.__qaOpenedTemplateUrls.push(url); };
  }, secondRoot);
  await page.getByRole("button", { name: "更换目录", exact: true }).click();
  await page.waitForFunction((root) => document.querySelector(".template-root")?.title === root, secondRoot);
  await plan.locator(".study-plan-window-problem").filter({ hasText: templateName }).click();
  const urls = await app.evaluate(() => globalThis.__qaOpenedTemplateUrls);
  assert.match(urls.at(-1), /^vscode:\/\/file\//);
  assert.ok(urls.at(-1).includes("%23"), "The filename hash must remain encoded in the VS Code URL");
  const rejected = await page.evaluate(async (filePath) => {
    try { await window.cfBridge.openTemplateFile(filePath); return ""; } catch (error) { return error.message; }
  }, outside);
  assert.match(rejected, /模板路径不安全/);
  record("queued templates open from a previously selected folder; unrelated paths stay blocked");

  const savedQueue = await getQueue();
  const savedStudy = await getStudy();
  await app.close();
  app = null;
  await launch();
  assert.deepEqual(await getQueue(), savedQueue);
  assert.deepEqual((await getStudy()).problemLists, savedStudy.problemLists);
  assert.equal((await getStudy()).notes["1900-A"].content, "Concurrent note survives list save");
  record("restart retains list membership, queue order, completion totals and external notes");
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(outputRoot, "report.json"), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ status: "ok", checks: checks.length, report: path.join(outputRoot, "report.json") }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => { if (app) await app.close().catch(() => undefined); });
