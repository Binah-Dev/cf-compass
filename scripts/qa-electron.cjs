const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require(
  "C:/Users/16080/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const projectRoot = path.resolve(__dirname, "..");
const evidenceRoot =
  "C:/Users/16080/.codex/visualizations/2026/07/28/019fa67b-5654-7110-afe6-f2e10cdb3e47";
const packagedExecutable = process.env.CF_COMPASS_QA_EXECUTABLE;
const userDataRoot = path.join(
  evidenceRoot,
  `qa-contest-user-data-${Date.now()}`,
);

fs.mkdirSync(userDataRoot, { recursive: true });
fs.writeFileSync(
  path.join(userDataRoot, "study.json"),
  JSON.stringify(
    {
      version: 1,
      notes: {},
      reviews: {},
      contestQueue: [],
      plan: null,
      settings: {
        themeVersion: 4,
        wallpaperEnabled: true,
        wallpaperId: "material-lobby-miyako_01",
        wallpaperClarity: 100,
        wallpaperOpacity: 92,
        wallpaperBrightness: 100,
        wallpaperScale: 100,
        wallpaperPosition: "center center",
        panelOpacity: 72,
        reduceMotion: true,
      },
    },
    null,
    2,
  ),
);

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
  await page.waitForTimeout(1600);
  await page.screenshot({
      path: path.join(evidenceRoot, "cf-compass-3.4.1-dashboard.png"),
  });

  await page.getByRole("button", { name: "赛事复盘" }).click();
  await page.waitForSelector(".contest-replay-page");
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: path.join(evidenceRoot, "cf-compass-3.4.1-contests.png"),
    fullPage: true,
  });

  await page.getByRole("tab", { name: "Div.3", exact: true }).click();
  await page.getByText("Codeforces Round 1038").waitFor();
  await page.screenshot({
    path: path.join(evidenceRoot, "cf-compass-3.4.1-contests-div3.png"),
    fullPage: true,
  });

  await page.getByRole("tab", { name: "全部" }).click();
  const addReview = page.getByRole("button", { name: "加入复习" }).first();
  await addReview.click();
  await page.getByRole("button", { name: "已加入" }).first().waitFor();

  await page.getByRole("button", { name: "沉浸大厅" }).click();
  await page.waitForSelector(".is-immersive");
  await page.waitForTimeout(800);
  await page.screenshot({
      path: path.join(evidenceRoot, "cf-compass-3.4.1-immersive.png"),
  });

  console.log(
    JSON.stringify(
      {
        errors,
        contestRows: await page.locator(".contest-record").count(),
        studyQueued: await page.getByRole("button", { name: "已加入" }).count(),
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (app) await app.close();
});
