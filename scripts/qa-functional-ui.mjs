import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, ".qa-output");
const profileDir = path.join(outputDir, `chrome-profile-${Date.now()}`);
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9237;
await mkdir(profileDir, { recursive: true });

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  "--window-size=1600,1000",
  "http://127.0.0.1:4173/",
], { stdio: "ignore" });

async function waitForTarget() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Chrome DevTools target did not become ready");
}

const ws = new WebSocket(await waitForTarget());
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") {
    consoleErrors.push(message.params?.exceptionDetails?.text || "Runtime exception");
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
    consoleErrors.push(message.params.args?.map((item) => item.value || item.description).join(" "));
  }
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Evaluation failed");
  return result.result.value;
}

async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path.join(outputDir, name), Buffer.from(result.data, "base64"));
}

async function wait(ms = 450) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

try {
  await send("Runtime.enable");
  await send("Page.enable");
  await wait(1100);

  const initial = await evaluate(`(() => ({
    rows: document.querySelectorAll('.problem-row').length,
    tags: document.querySelectorAll('.problem-row .table-tag').length,
    ratings: document.querySelectorAll('.problem-row .rating').length,
    heatCells: document.querySelectorAll('.heatmap .heat-cell:not(.is-blank)').length,
    heatCellSize: (() => {
      const cell = document.querySelector('.heatmap .heat-cell:not(.is-blank)');
      const rect = cell?.getBoundingClientRect();
      return rect ? [rect.width, rect.height] : [];
    })(),
    heatmapScrollable: (() => {
      const frame = document.querySelector('.heatmap-scroll');
      return frame ? frame.scrollWidth > frame.clientWidth : false;
    })(),
    heatmapTitleRemoved: ![...document.querySelectorAll('.heatmap-block strong')].some((node) => node.textContent.includes('刷题热力图')),
    monthAcVisible: document.querySelector('.heatmap-summary')?.textContent.includes('AC / 本月'),
    legend: [...document.querySelectorAll('.heatmap-legend__item')].map((node) => node.textContent.trim()),
    year: document.querySelector('.heatmap-year-strip button.is-active')?.textContent.trim() || new Date().getFullYear().toString()
  }))()`);
  await screenshot("feature-library-before.png");

  const tagToggle = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((node) => node.textContent.includes('隐藏标签'));
    button?.click();
    return Boolean(button);
  })()`);
  await wait();
  const hidden = await evaluate(`(() => ({
    tags: document.querySelectorAll('.problem-row .table-tag').length,
    ratings: document.querySelectorAll('.problem-row .rating').length,
    hiddenLayout: document.querySelector('.problem-table')?.classList.contains('problem-table--tags-hidden'),
    action: document.querySelector('.tag-visibility-toggle')?.textContent.trim()
  }))()`);
  await screenshot("feature-library-tags-hidden.png");

  const analyticsNav = await evaluate(`(() => {
    const button = document.querySelector('button[aria-label="训练分析"]');
    button?.click();
    return Boolean(button);
  })()`);
  await wait(900);
  const analytics = await evaluate(`(() => ({
    page: Boolean(document.querySelector('.training-analytics')),
    metrics: document.querySelectorAll('.analytics-metric').length,
    panels: document.querySelectorAll('.analytics-panel').length,
    points: document.querySelectorAll('.rating-chart-point').length,
    tagRows: document.querySelectorAll('.analytics-tag-list article').length,
    tagRates: [...document.querySelectorAll('.analytics-tag-list article > div > b')].map((node) => Number.parseFloat(node.textContent)),
    tagListScrollable: (() => {
      const list = document.querySelector('.analytics-tag-list');
      return list ? getComputedStyle(list).overflowY === 'auto' : false;
    })(),
    ratingBandOpacity: getComputedStyle(document.querySelector('.rating-band rect')).opacity,
    ratingZoomControls: document.querySelectorAll('.rating-zoom-toolbar button').length,
    ratingZoomHandles: document.querySelectorAll('.rating-navigator__handle').length,
    ratingVisiblePoints: Number(document.querySelector('.rating-navigator')?.dataset.visiblePoints || 0),
    ranges: [...document.querySelectorAll('.analytics-range-tabs button')].map((node) => node.textContent.trim())
  }))()`);
  await screenshot("feature-training-analytics.png");

  const appearanceOpened = await evaluate(`(() => {
    const button = document.querySelector('button[aria-label="外观设置"]');
    button?.click();
    return Boolean(button);
  })()`);
  await wait(600);
  const densityChanged = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.density-picker button')].find((node) => node.textContent.includes('大字'));
    button?.click();
    return Boolean(button);
  })()`);
  await wait();
  const density = await evaluate(`(() => ({
    drawer: Boolean(document.querySelector('.appearance-drawer')),
    active: document.querySelector('.density-picker button.is-active strong')?.textContent.trim(),
    shellClass: document.querySelector('.app-shell')?.className
  }))()`);
  await screenshot("feature-density-large.png");

  const checks = {
    tagToggle,
    analyticsNav,
    appearanceOpened,
    densityChanged,
    initial,
    hidden,
    analytics,
    density,
    consoleErrors,
  };
  await writeFile(path.join(outputDir, "feature-functional-report.json"), JSON.stringify(checks, null, 2));
  console.log(JSON.stringify(checks, null, 2));

  const failed =
    !tagToggle ||
    initial.heatCellSize.some((size) => size < 9) ||
    !initial.heatmapScrollable ||
    !initial.heatmapTitleRemoved ||
    !initial.monthAcVisible ||
    hidden.tags !== 0 ||
    hidden.ratings !== initial.ratings ||
    !hidden.hiddenLayout ||
    !analyticsNav ||
    !analytics.page ||
    analytics.metrics !== 4 ||
    analytics.panels < 4 ||
    !analytics.tagListScrollable ||
    analytics.tagRates.some((rate, index, list) => index > 0 && list[index - 1] < rate) ||
    Number(analytics.ratingBandOpacity) < 0.7 ||
    analytics.ratingZoomControls !== 3 ||
    analytics.ratingZoomHandles !== 2 ||
    analytics.ratingVisiblePoints !== analytics.points ||
    !appearanceOpened ||
    !densityChanged ||
    density.active !== "大字" ||
    !String(density.shellClass).includes("density-large") ||
    consoleErrors.length > 0;
  if (failed) process.exitCode = 1;
} finally {
  await send("Browser.close").catch(() => undefined);
  ws.close();
  chrome.kill();
}
