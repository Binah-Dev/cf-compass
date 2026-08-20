const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require(
  "C:/Users/16080/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const projectRoot = path.resolve(__dirname, "..");
const evidenceRoot =
  "C:/Users/16080/.codex/visualizations/2026/07/28/019fa67b-5654-7110-afe6-f2e10cdb3e47";
const userDataRoot = process.env.CF_COMPASS_QA_USER_DATA;
const packagedExecutable = process.env.CF_COMPASS_QA_EXECUTABLE;

if (!userDataRoot || !fs.existsSync(path.join(userDataRoot, "cache.json"))) {
  throw new Error("CF_COMPASS_QA_USER_DATA 必须指向包含 cache.json 的隔离测试目录");
}

let app;

(async () => {
  const errors = [];
  app = await electron.launch({
    executablePath: packagedExecutable
      ? path.resolve(packagedExecutable)
      : path.join(projectRoot, "node_modules/electron/dist/electron.exe"),
    args: packagedExecutable ? [] : [projectRoot],
    cwd: projectRoot,
    env: {
      ...process.env,
      CF_COMPASS_USER_DATA: userDataRoot,
    },
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.waitForSelector(".progress-panel");
  await page.getByRole("button", { name: "赛事复盘" }).click();
  await page.waitForSelector(".contest-replay-page");
  const progressLocator = page.locator(".contest-sync-progress");
  const deadline = Date.now() + 240000;
  let progressText = "";
  while (Date.now() < deadline) {
    progressText = await progressLocator.innerText();
    if (
      progressText.includes("表现分已自动同步") ||
      progressText.includes("场需重试")
    ) {
      break;
    }
    await page.waitForTimeout(1000);
  }
  if (
    !progressText.includes("表现分已自动同步") &&
    !progressText.includes("场需重试")
  ) {
    throw new Error(`自动计算等待超时，最后状态：${progressText}`);
  }
  const failedRows = await page.getByText("计算失败", { exact: true }).count();
  await page.screenshot({
    path: path.join(
      evidenceRoot,
      "cf-compass-3.4.1-auto-complete.png",
    ),
    fullPage: true,
  });

  console.log(
    JSON.stringify(
      {
        errors,
        progressText,
        contestRows: await page.locator(".contest-record").count(),
        failedRows,
      },
      null,
      2,
    ),
  );
  if (errors.length || failedRows) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (app) await app.close();
});
