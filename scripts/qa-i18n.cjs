const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require(
  process.env.CF_COMPASS_PLAYWRIGHT || "playwright-core",
);

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, ".qa-output", "i18n");
const userDataRoot = path.join(outputRoot, `user-data-${Date.now()}`);

fs.mkdirSync(userDataRoot, { recursive: true });
fs.writeFileSync(
  path.join(userDataRoot, "study.json"),
  JSON.stringify({
    version: 1,
    notes: {},
    reviews: {},
    contestQueue: [],
    plan: null,
    settings: {
      language: "en-US",
      themeVersion: 6,
      wallpaperEnabled: false,
      accentTheme: "sky",
      reduceMotion: true,
    },
  }),
);

const pages = [
  ["problemset", "Problemset", ".problem-workspace"],
  ["today", "Today's Training", ".today-page"],
  ["review", "Review Library", ".review-library"],
  ["analytics", "Training Analytics", ".training-analytics"],
  ["replay", "Contest Replay", ".contest-replay-page"],
  ["center", "Contest Center", ".contest-center-page"],
  ["templates", "Template Library", ".template-library-page"],
  ["favorites", "Favorites", ".problem-workspace"],
  ["data", "Data Center", ".data-center"],
];

let app;
(async () => {
  const errors = [];
  const residuals = {};
  app = await electron.launch({
    executablePath: path.join(projectRoot, "node_modules/electron/dist/electron.exe"),
    args: [projectRoot],
    cwd: projectRoot,
    env: { ...process.env, CF_COMPASS_USER_DATA: userDataRoot },
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.waitForSelector(".app-shell");

  for (const [id, label, selector] of pages) {
    if (id === "favorites") {
      await page.getByRole("button", { name: "Problemset", exact: true }).click();
      await page.getByRole("tab", { name: label, exact: true }).click();
    } else await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForSelector(selector, { timeout: 15000 });
    await page.waitForTimeout(500);
    residuals[id] = await page.evaluate(() => {
      const chinese = /[\u3400-\u9fff]/;
      const values = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const value = (node.nodeValue || "").trim();
        const parent = node.parentElement;
        if (
          value &&
          chinese.test(value) &&
          parent &&
          !parent.closest("textarea, .template-summary-content, .summary-content") &&
          !parent.matches(".template-category-card__body > span") &&
          !/^[A-Z]:\\/.test(value)
        ) {
          values.push(`${parent.tagName.toLowerCase()}.${parent.className || ""}: ${value}`);
        }
        node = walker.nextNode();
      }
      for (const element of document.querySelectorAll("[aria-label], [placeholder], [title], [data-tooltip]")) {
        for (const name of ["aria-label", "placeholder", "title", "data-tooltip"]) {
          const value = element.getAttribute(name) || "";
          if (chinese.test(value)) values.push(`${element.tagName.toLowerCase()}[${name}]: ${value}`);
        }
      }
      return [...new Set(values)].slice(0, 300);
    });
    if (process.env.CF_I18N_SCREENSHOTS) {
      await page.screenshot({ path: path.join(outputRoot, `${id}.png`), timeout: 30000 })
        .catch((error) => errors.push(`screenshot ${id}: ${error.message}`));
    }
  }

  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.waitForSelector(".appearance-drawer");
  await page.waitForTimeout(300);
  residuals.appearance = await page.evaluate(() =>
    [...document.querySelectorAll(".appearance-drawer *")]
      .filter((element) => !element.closest("[data-i18n-preserve]"))
      .map((element) => element.childNodes.length === 1 ? element.textContent.trim() : "")
      .filter((value) => /[\u3400-\u9fff]/.test(value)),
  );
  if (process.env.CF_I18N_SCREENSHOTS) {
    await page.screenshot({ path: path.join(outputRoot, "appearance.png"), timeout: 30000 })
      .catch((error) => errors.push(`screenshot appearance: ${error.message}`));
  }

  await page.locator(".language-picker button").nth(0).click();
  await page.waitForTimeout(250);
  const chineseSwitchWorks = await page.getByText("外观设置", { exact: true }).count();
  await page.locator(".language-picker button").nth(1).click();
  await page.waitForTimeout(250);
  const englishSwitchWorks = await page.getByText("Appearance", { exact: true }).count();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.waitForTimeout(700);
  const persistedLanguage = JSON.parse(
    fs.readFileSync(path.join(userDataRoot, "study.json"), "utf8"),
  ).settings.language;

  const report = {
    errors,
    residuals,
    switchChecks: {
      chineseSwitchWorks: chineseSwitchWorks > 0,
      englishSwitchWorks: englishSwitchWorks > 0,
      persistedLanguage,
    },
  };
  fs.writeFileSync(
    path.join(outputRoot, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (
    errors.length > 0 ||
    Object.values(residuals).some((items) => items.length > 0) ||
    !report.switchChecks.chineseSwitchWorks ||
    !report.switchChecks.englishSwitchWorks ||
    persistedLanguage !== "en-US"
  ) {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (app) await app.close();
});
