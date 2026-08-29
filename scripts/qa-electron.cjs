const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require(
  process.env.CF_COMPASS_PLAYWRIGHT || "playwright-core",
);

const projectRoot = path.resolve(__dirname, "..");
const evidenceRoot = process.env.CF_COMPASS_QA_OUTPUT || path.join(projectRoot, ".qa-output");
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
    args: packagedExecutable ? ["--disable-gpu"] : ["--disable-gpu", projectRoot],
    cwd: projectRoot,
    env: {
      ...process.env,
      CF_COMPASS_USER_DATA: userDataRoot,
    },
  });
  const page = await app.firstWindow();
  // Hosted Windows runners expose a narrow virtual desktop, where the responsive
  // layout intentionally hides the progress card. Pin this desktop QA to the
  // full three-column viewport it is designed to exercise.
  await page.setViewportSize({ width: 1920, height: 1080 });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.waitForSelector(".progress-panel");
  await page.waitForTimeout(1600);
  await page.screenshot({
    path: path.join(evidenceRoot, "cf-compass-dashboard.png"),
  });

  await page.getByRole("button", { name: "赛事复盘" }).click();
  await page.waitForSelector(".contest-replay-page");
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: path.join(evidenceRoot, "cf-compass-contests.png"),
    fullPage: true,
  });

  await page.getByRole("tab", { name: "Div.3", exact: true }).click();
  await page.getByText("Codeforces Round 1038").waitFor();
  await page.screenshot({
    path: path.join(evidenceRoot, "cf-compass-contests-div3.png"),
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
    path: path.join(evidenceRoot, "cf-compass-immersive.png"),
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
