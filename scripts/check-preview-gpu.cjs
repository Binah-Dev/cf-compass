const fs = require("node:fs"), path = require("node:path");
const { _electron: electron } = require("playwright-core");
const { makeFixture } = require("./fixtures/contest-sessions.cjs");
const root = path.resolve(__dirname, ".."), output = path.join(root, "output/playwright", `gpu-preview-${Date.now()}`);
(async () => {
  const results = [];
  for (const disabled of [true, false]) {
    const userData = path.join(output, disabled ? "software" : "normal"); fs.mkdirSync(userData, { recursive: true });
    const f = makeFixture();
    for (const [name, data] of [["cache", f.cache], ["study", f.study]]) fs.writeFileSync(path.join(userData, `${name}.json`), JSON.stringify(data));
    const app = await electron.launch({ executablePath: path.join(root, "node_modules/electron/dist/electron.exe"),
      args: disabled ? ["--disable-gpu", root] : [root], cwd: root, env: { ...process.env, CF_COMPASS_USER_DATA: userData } });
    try {
      const page = await app.firstWindow(); await page.waitForSelector(".workbench-move");
      const gpu = await app.evaluate(async ({ app }) => { await app.getGPUInfo("basic"); return app.getGPUFeatureStatus(); });
      results.push({ launchMode: disabled ? "disable-gpu" : "normal", gpu });
    } finally { await app.close(); }
  }
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ output, results }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
