const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require("playwright-core");

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, "output", "playwright", "template-summary-persistence");
const userDataRoot = path.join(outputRoot, `user-data-${Date.now()}`);
const rootA = path.join(outputRoot, "library-a");
const rootB = path.join(outputRoot, "library-b");
const summary = "题意：验证保存后的题目大意不会在刷新、重启或切换目录后消失。";
fs.mkdirSync(userDataRoot, { recursive: true });
fs.mkdirSync(rootA, { recursive: true });
fs.mkdirSync(rootB, { recursive: true });
fs.writeFileSync(path.join(rootA, "persistent.cpp"), "int main() { return 0; }\n");
fs.writeFileSync(path.join(rootB, "other.cpp"), "int main() { return 0; }\n");
fs.writeFileSync(path.join(userDataRoot, "template-library.json"), JSON.stringify({ root: rootA, overrides: {}, summaries: {} }, null, 2));

let app;
async function openLibrary() {
  app = await electron.launch({
    executablePath: path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe"),
    args: ["--disable-gpu", projectRoot],
    cwd: projectRoot,
    env: { ...process.env, CF_COMPASS_USER_DATA: userDataRoot },
  });
  const page = await app.firstWindow();
  await page.getByRole("button", { name: "模板库", exact: true }).click();
  await page.waitForSelector(".template-library-page");
  const summaryButtons = page.locator("[data-template-summary-open]");
  if (!await summaryButtons.count()) {
    await page.locator("[data-template-category]").filter({ hasText: /persistent|other/ }).click();
  }
  try {
    await summaryButtons.first().waitFor({ timeout: 8000 });
  } catch (error) {
    console.error("Template page text:", (await page.locator(".template-library-page").innerText()).slice(0, 2000));
    throw error;
  }
  return page;
}

async function closeApp() {
  if (app) await app.close();
  app = null;
}

async function expectSummary(page) {
  await page.locator("[data-template-summary-open]").first().click();
  await page.waitForSelector(".template-summary-dialog__reader");
  const text = await page.locator(".template-summary-dialog__reader").innerText();
  assert.match(text, /验证保存后的题目大意不会在刷新、重启或切换目录后消失/);
}

(async () => {
  let page = await openLibrary();
  await page.locator("[data-template-summary-open]").first().click();
  await page.locator("[data-template-summary-input]").fill(summary);
  await page.locator("[data-template-summary-save]").click();
  await page.waitForSelector(".template-summary-dialog__reader");
  await page.getByRole("button", { name: "关闭题目大意" }).click();
  await page.getByRole("button", { name: "刷新模板", exact: true }).click();
  await page.waitForSelector("[data-template-summary-open]");
  await expectSummary(page);
  await closeApp();

  let config = JSON.parse(fs.readFileSync(path.join(userDataRoot, "template-library.json"), "utf8"));
  const rootAKey = Object.keys(config.profiles).find((key) => key.endsWith("/library-a"));
  assert.ok(rootAKey && config.profiles[rootAKey].summaries["persistent.cpp"], "Saved summary must be retained in the root profile");
  const rootBKey = rootB.replace(/\\/g, "/").toLowerCase();
  config = {
    ...config,
    root: rootB,
    overrides: {},
    summaries: {},
    profiles: { ...config.profiles, [rootBKey]: { root: rootB, overrides: {}, summaries: {} } },
  };
  fs.writeFileSync(path.join(userDataRoot, "template-library.json"), JSON.stringify(config, null, 2));
  page = await openLibrary();
  assert.equal(await page.getByText("添加题目大意", { exact: true }).count(), 1);
  await closeApp();

  config.root = rootA;
  config.overrides = {};
  config.summaries = {};
  fs.writeFileSync(path.join(userDataRoot, "template-library.json"), JSON.stringify(config, null, 2));
  page = await openLibrary();
  await expectSummary(page);
  await closeApp();

  const target = path.join(userDataRoot, "template-library.json");
  const backup = path.join(userDataRoot, "template-library.json.bak");
  fs.copyFileSync(target, backup);
  fs.writeFileSync(target, "{broken-json");
  page = await openLibrary();
  await expectSummary(page);
  await page.screenshot({ path: path.join(outputRoot, "summary-recovered.png") });
  await closeApp();

  console.log(JSON.stringify({ status: "ok", refreshPersistence: true, restartPersistence: true, folderProfileRestored: true, backupRecovery: true }, null, 2));
})().catch(async (error) => {
  console.error(error);
  await closeApp().catch(() => undefined);
  process.exitCode = 1;
});
