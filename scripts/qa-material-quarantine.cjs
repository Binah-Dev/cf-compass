const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require("playwright-core");

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, ".qa-output", "material-quarantine");
const userDataRoot = path.join(outputRoot, `user-data-${Date.now()}`);
const materialRoot = path.join(userDataRoot, "material-library");
const executablePath = process.env.CF_COMPASS_QA_EXECUTABLE
  ? path.resolve(process.env.CF_COMPASS_QA_EXECUTABLE)
  : path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe");

fs.mkdirSync(path.join(materialRoot, "safe"), { recursive: true });
fs.copyFileSync(path.join(projectRoot, "build", "icon.png"), path.join(materialRoot, "safe", "lobby.png"));
fs.writeFileSync(path.join(materialRoot, "index.json"), JSON.stringify({
  defaultWallpaperId: "safe-lobby",
  wallpapers: [
    {
      id: "safe-lobby",
      name: "Safe lobby",
      url: "safe/lobby.png",
      previewUrl: "safe/lobby.png",
      category: "curated",
    },
    {
      id: "broken-lobby",
      name: "Known extracted composition",
      url: "lobbies-hq/ch0058_01.webp",
      previewUrl: "lobbies/ch0058_01.webp",
      category: "student",
    },
  ],
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
    wallpaperEnabled: true,
    wallpaperId: "broken-lobby",
    wallpaperFit: "smart",
    wallpaperOpacity: 100,
    wallpaperClarity: 100,
    wallpaperBrightness: 100,
    wallpaperScale: 100,
    wallpaperPosition: "center center",
    reduceMotion: true,
  },
}));

let app;
(async () => {
  app = await electron.launch({
    executablePath,
    args: process.env.CF_COMPASS_QA_EXECUTABLE ? [] : [projectRoot],
    cwd: projectRoot,
    env: { ...process.env, CF_COMPASS_USER_DATA: userDataRoot },
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() =>
    document.querySelector(".app-wallpaper--image")?.currentSrc.includes("safe/lobby.png"),
  );
  await page.getByRole("button", { name: "外观设置", exact: true }).click();
  const hint = page.locator(".wallpaper-library__hint");
  await hint.waitFor();
  const categories = page.locator('.wallpaper-category-tabs [role="tab"]');
  if (await categories.count() !== 1 || !(await categories.first().textContent()).startsWith('全部')) {
    throw new Error('Imported materials must expose only the All category');
  }
  const hintText = await hint.textContent();
  if (!hintText.includes("已隔离 1 张不完整素材")) {
    throw new Error(`隔离数量未展示：${hintText}`);
  }
  const savedStudy = JSON.parse(fs.readFileSync(path.join(userDataRoot, "study.json"), "utf8"));
  if (savedStudy.settings.wallpaperId !== "safe-lobby") {
    throw new Error(`坏素材未自动回退：${savedStudy.settings.wallpaperId}`);
  }
  await page.screenshot({
    path: path.join(outputRoot, "fallback-and-count.png"),
    fullPage: true,
  });
  console.log(JSON.stringify({
    wallpaperId: savedStudy.settings.wallpaperId,
    hint: hintText.replace(/\s+/g, " ").trim(),
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (app) await app.close();
});
