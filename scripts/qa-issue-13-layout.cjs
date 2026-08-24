const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require(
  process.env.CF_COMPASS_PLAYWRIGHT || "playwright-core",
);

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, ".qa-output", "issue-13");
const userDataRoot = path.join(outputRoot, `user-data-${Date.now()}`);
const packagedExecutable = process.env.CF_COMPASS_QA_EXECUTABLE;
const years = Array.from({ length: 11 }, (_, index) => 2016 + index);

fs.mkdirSync(userDataRoot, { recursive: true });
fs.mkdirSync(outputRoot, { recursive: true });

const problems = years.map((year, index) => ({
  contestId: 1000 + index,
  index: "A",
  name: `Layout regression ${year}`,
  rating: 800 + index * 100,
  tags: [index % 2 ? "implementation" : "math"],
}));
const submissions = years.map((year, index) => ({
  id: 100000 + index,
  contestId: problems[index].contestId,
  creationTimeSeconds: Math.floor(Date.UTC(year, 5, 15) / 1000),
  verdict: "OK",
  problem: problems[index],
})).reverse();

fs.writeFileSync(path.join(userDataRoot, "cache.json"), JSON.stringify({
  version: 2,
  handle: "issue_13_layout",
  user: {
    handle: "issue_13_layout",
    rating: 1530,
    maxRating: 1600,
    rank: "expert",
    maxRank: "expert",
  },
  problems,
  submissions,
  ratingHistory: [],
  ratingStanding: { position: 7434, total: 48413, topPercent: 15.36 },
  problemsetSyncedAt: new Date().toISOString(),
  syncedAt: new Date().toISOString(),
  isDemo: false,
}));
fs.writeFileSync(path.join(userDataRoot, "study.json"), JSON.stringify({
  version: 1,
  notes: {},
  reviews: {},
  contestQueue: [],
  plan: null,
  settings: {
    language: "zh-CN",
    themeVersion: 7,
    wallpaperEnabled: false,
    reduceMotion: true,
  },
}));

let app;

function readLayout(page) {
  return page.evaluate(() => {
    const shell = document.querySelector(".app-shell")?.getBoundingClientRect();
    const rail = document.querySelector(".app-rail")?.getBoundingClientRect();
    const yearStrip = document.querySelector(".heatmap-year-strip");
    return {
      viewportWidth: window.innerWidth,
      windowScrollX: window.scrollX,
      documentScrollLeft: document.documentElement.scrollLeft,
      bodyScrollLeft: document.body.scrollLeft,
      shell: shell ? { left: shell.left, right: shell.right, width: shell.width } : null,
      rail: rail ? { left: rail.left, right: rail.right, width: rail.width } : null,
      yearStrip: yearStrip
        ? { scrollLeft: yearStrip.scrollLeft, scrollWidth: yearStrip.scrollWidth, width: yearStrip.clientWidth }
        : null,
    };
  });
}

function assertAnchored(layout, phase) {
  if (
    layout.windowScrollX !== 0 ||
    layout.documentScrollLeft !== 0 ||
    layout.bodyScrollLeft !== 0 ||
    layout.shell?.left !== 0 ||
    layout.rail?.left !== 0 ||
    Math.abs(layout.shell?.right - layout.viewportWidth) > 1
  ) {
    throw new Error(`${phase} 后应用根布局发生横向偏移：${JSON.stringify(layout)}`);
  }
}

(async () => {
  const errors = [];
  app = await electron.launch({
    executablePath: packagedExecutable
      ? path.resolve(packagedExecutable)
      : path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe"),
    args: packagedExecutable ? [] : [projectRoot],
    cwd: projectRoot,
    env: { ...process.env, CF_COMPASS_USER_DATA: userDataRoot },
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.setViewportSize({ width: 2560, height: 1600 });
  await page.waitForSelector(".heatmap-year-strip");
  await page.waitForFunction(() =>
    document.querySelectorAll(".heatmap-year-strip button").length === 11,
  );
  await page.waitForTimeout(250);

  const initial = await readLayout(page);
  assertAnchored(initial, "多年份数据载入");
  await page.getByRole("button", { name: "2016", exact: true }).click();
  await page.waitForTimeout(80);
  const earliest = await readLayout(page);
  assertAnchored(earliest, "切换到最早年份");
  await page.getByRole("button", { name: "2026", exact: true }).click();
  await page.waitForTimeout(80);
  const latest = await readLayout(page);
  assertAnchored(latest, "切换到最新年份");

  await page.screenshot({ path: path.join(outputRoot, "fixed-layout.png") });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(JSON.stringify({ years, initial, earliest, latest, errors }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (app) await app.close();
});
