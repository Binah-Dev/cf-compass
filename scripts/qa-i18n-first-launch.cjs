const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require(
  process.env.CF_COMPASS_PLAYWRIGHT || "playwright-core",
);

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, ".qa-output", "i18n-first-launch");

async function runScenario({ name, systemLanguage, savedLanguage, expectedLanguage }) {
  const userDataRoot = path.join(outputRoot, `${name}-${Date.now()}`);
  fs.mkdirSync(userDataRoot, { recursive: true });

  if (savedLanguage) {
    fs.writeFileSync(
      path.join(userDataRoot, "study.json"),
      JSON.stringify({
        version: 1,
        notes: {},
        reviews: {},
        contestQueue: [],
        plan: null,
        settings: { language: savedLanguage },
      }),
    );
  }

  const app = await electron.launch({
    executablePath: path.join(projectRoot, "node_modules/electron/dist/electron.exe"),
    args: [`--lang=${systemLanguage}`, projectRoot],
    cwd: projectRoot,
    env: { ...process.env, CF_COMPASS_USER_DATA: userDataRoot },
  });

  try {
    const page = await app.firstWindow();
    await page.waitForSelector(".app-shell");
    await page.waitForFunction(
      (expected) => document.documentElement.lang === expected,
      expectedLanguage,
    );
    const expectedAppearanceLabel = expectedLanguage === "en-US" ? "Appearance" : "外观设置";
    const appearanceButtonCount = await page
      .getByRole("button", { name: expectedAppearanceLabel, exact: true })
      .count();
    const result = await page.evaluate(() => ({
      documentLanguage: document.documentElement.lang,
      savedLanguage: localStorage.getItem("cf-compass-language"),
    }));
    if (expectedLanguage === "en-US") {
      await page.getByRole("button", { name: "Today's Training", exact: true }).click();
      await page.waitForSelector(".review-queue-item");
      result.trainingLayout = await page.evaluate(() => {
        const tags = [...document.querySelectorAll(".review-queue-item .training-meta .table-tag")];
        const grade = document.querySelector(".review-queue-item .review-grade button");
        return {
          collapsedTagCount: tags.filter((tag) => tag.getBoundingClientRect().width < 30).length,
          firstGradeText: grade?.innerText.replace(/\s+/g, " ").trim() || "",
        };
      });
    }
    return { name, systemLanguage, expectedLanguage, appearanceButtonCount, ...result };
  } finally {
    await app.close();
  }
}

(async () => {
  const scenarios = [
    {
      name: "fresh-english-system",
      systemLanguage: "en-US",
      expectedLanguage: "en-US",
    },
    {
      name: "fresh-chinese-system",
      systemLanguage: "zh-CN",
      expectedLanguage: "zh-CN",
    },
    {
      name: "existing-chinese-user-on-english-system",
      systemLanguage: "en-US",
      savedLanguage: "zh-CN",
      expectedLanguage: "zh-CN",
    },
  ];
  const results = [];
  for (const scenario of scenarios) results.push(await runScenario(scenario));

  const failures = results.filter(
    (result) =>
      result.documentLanguage !== result.expectedLanguage ||
      result.savedLanguage !== result.expectedLanguage ||
      result.appearanceButtonCount < 1 ||
      (result.expectedLanguage === "en-US" &&
        (result.trainingLayout?.collapsedTagCount > 0 ||
          result.trainingLayout?.firstGradeText !== "Again 1 day")),
  );
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(
    path.join(outputRoot, "report.json"),
    JSON.stringify({ results, failures }, null, 2),
  );
  console.log(JSON.stringify({ results, failures }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
