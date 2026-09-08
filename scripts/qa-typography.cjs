const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { _electron: electron } = require("playwright-core");
const { makeReferenceFixture } = require("./fixtures/virtual-reference.cjs");
const root = path.resolve(__dirname, "..");
const baseline = process.argv.includes("--baseline");
const output = path.join(root, "output/playwright", `typography-${baseline ? "before" : "after"}-${Date.now()}`);
const pages = [
  ["problems", "题库", "Problemset", ".problem-workspace"],
  ["today", "今日训练", "Today's Training", ".today-page"],
  ["plan", "计划题单", "Study Plan", ".study-plan-page"],
  ["review", "复习库", "Review Library", ".review-library"],
  ["analytics", "训练分析", "Training Analytics", ".training-analytics"],
  ["replay", "赛事复盘", "Contest Replay", ".contest-replay-page"],
  ["center", "赛事中心", "Contest Center", ".contest-center-page"],
  ["templates", "模板库", "Template Library", ".template-library-page"],
  ["data", "数据中心", "Data Center", ".data-center"],
];
let app, page;
const results = [], errors = [];
async function measure(id, selector) {
  const result = await page.locator(selector).evaluate((root) => {
    const tiny = [], clippedControls = [], samples = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim(), element = node.parentElement;
      if (!text || !element || element.closest("svg, .sr-only, script, style")) continue;
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const rect = element.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
      const style = getComputedStyle(element), size = parseFloat(style.fontSize);
      const sample = { text: text.slice(0, 75), class: element.className, size, color: style.color, lineHeight: style.lineHeight };
      samples.push(sample);
      if (size < 12) tiny.push(sample);
      if (element.matches("button") && !element.children.length && text.length > 1) {
        const range = document.createRange(); range.selectNodeContents(element);
        const bounds = range.getBoundingClientRect();
        if (bounds.height > rect.height + 2) clippedControls.push(sample);
      }
    }
    return { tiny, clippedControls, samples, rootOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  await page.screenshot({ path: path.join(output, `${id}.png`) });
  results.push({ id, ...result });
  assert.equal(result.rootOverflow, false, `${id}: root overflow`);
  if (!baseline && selector === ".contest-replay-page") {
    const clippedCaptions = await page.locator(".contest-summary-metric small").evaluateAll((items) => items.filter((item) => {
      const box = item.getBoundingClientRect(), container = item.closest(".contest-summary-metric").getBoundingClientRect();
      return box.bottom > container.bottom - 3 || box.top < container.top;
    }).map((item) => item.textContent));
    assert.deepEqual(clippedCaptions, [], `${id}: summary captions need breathing room`);
  }
  if (!baseline) {
    assert.deepEqual(result.tiny, [], `${id}: ordinary text below 12px`);
    assert.deepEqual(result.clippedControls, [], `${id}: vertically clipped button text`);
  }
}
(async () => {
  for (const language of ["zh-CN", "en-US"]) {
    const fixture = makeReferenceFixture();
    const userData = path.join(output, language);
    fs.mkdirSync(userData, { recursive: true });
    if (!baseline) {
      const templateRoot = path.join(userData, "fixture-templates");
      fs.mkdirSync(templateRoot, { recursive: true });
      fs.writeFileSync(path.join(templateRoot, "readability.cpp"), "// Readability fixture only\nint main() { return 0; }\n");
      fs.writeFileSync(path.join(userData, "template-library.json"), JSON.stringify({ root: templateRoot, overrides: {}, summaries: {} }));
    }
    fixture.study.settings.language = language;
    for (const [name, value] of [["cache", fixture.cache], ["study", fixture.study], ["contest-center", fixture.center]]) {
      fs.writeFileSync(path.join(userData, `${name}.json`), JSON.stringify(value));
    }
    app = await electron.launch({ executablePath: path.join(root, "node_modules/electron/dist/electron.exe"),
      args: ["--disable-gpu", root], cwd: root, env: { ...process.env, CF_COMPASS_USER_DATA: userData } });
    page = await app.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await app.evaluate((_electron, fixture) => {
      globalThis.fetch = async (url) => ({ ok: true, json: async () => ({ status: "OK",
        result: String(url).includes("contest.ratingChanges") ? fixture.ratingChanges : fixture.standings }) });
    }, { standings: fixture.standings, ratingChanges: fixture.ratingChanges });
    await page.waitForSelector(".app-shell");
    for (const [width, height] of [[1600, 1000], [1040, 700]]) {
      await page.setViewportSize({ width, height });
      for (const [id, zh, en, selector] of pages) {
        await page.getByRole("button", { name: language === "zh-CN" ? zh : en, exact: true }).click();
        await page.waitForSelector(selector);
        await measure(`${language}-${width}-${id}`, selector);
        if (!baseline && id === "templates") {
          if (!await page.locator("[data-template-summary-open]").count()) await page.locator("[data-template-category]").filter({ hasText: "readability" }).click();
          await page.locator("[data-template-summary-open]").first().waitFor();
          await measure(`${language}-${width}-template-card`, selector);
          await page.locator("[data-template-summary-open]").first().click();
          await page.waitForSelector(".template-summary-dialog");
          await measure(`${language}-${width}-template-dialog`, ".template-summary-dialog");
          await page.locator(".template-summary-dialog__header button").last().click();
        }
        if (id === "problems") {
          await page.getByRole("tab", { name: language === "zh-CN" ? "已收藏" : "Favorites", exact: true }).click();
          await measure(`${language}-${width}-favorites`, selector);
        }
      }
      await page.getByRole("button", { name: language === "zh-CN" ? "外观设置" : "Appearance", exact: true }).click();
      await page.waitForSelector(".appearance-drawer");
      await measure(`${language}-${width}-appearance`, ".appearance-drawer");
      await page.getByRole("button", { name: language === "zh-CN" ? "关闭外观设置" : "Close appearance settings", exact: true }).click();
    }
    if (!baseline) {
      for (const [density, index] of [["compact", 0], ["large", 2]]) {
        await page.getByRole("button", { name: language === "zh-CN" ? "外观设置" : "Appearance", exact: true }).click();
        await page.locator(".density-picker button").nth(index).click();
        await page.locator(".appearance-drawer__footer .primary-button").click();
        await page.waitForSelector(`.density-${density}`);
        for (const [id, zh, en, selector] of pages.filter(([id]) => ["problems", "replay", "data"].includes(id))) {
          await page.getByRole("button", { name: language === "zh-CN" ? zh : en, exact: true }).click();
          await page.waitForSelector(selector);
          await measure(`${language}-1040-${density}-${id}`, selector);
        }
      }
    }
    await app.close(); app = null;
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ passed: true, baseline, results, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, output, scenarios: results.length, tinyTextNodes: results.reduce((n, r) => n + r.tiny.length, 0), errors }));
})().catch(async (error) => {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "failure.json"), JSON.stringify({ error: error.stack, results, errors }, null, 2));
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
    fs.writeFileSync(path.join(output, "failure.yml"), await page.locator("body").ariaSnapshot());
  }
  console.error(error); console.error(output); process.exitCode = 1;
}).finally(async () => { if (app) await app.close(); });
