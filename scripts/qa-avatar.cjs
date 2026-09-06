const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { _electron: electron } = require(
  process.env.CF_COMPASS_PLAYWRIGHT || "playwright-core",
);

const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, ".qa-output", "avatar");
const userDataRoot = path.join(outputRoot, `user-data-${Date.now()}`);
const proxyPattern = "https://codeforces.com/userphoto/avatar/**";
const apiPattern = "https://userpic.codeforces.org/**";
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

fs.mkdirSync(userDataRoot, { recursive: true });

async function writeFixture() {
  const { demoData } = await import(
    pathToFileURL(path.join(projectRoot, "src", "data", "demo.js")).href
  );
  const now = new Date().toISOString();
  fs.writeFileSync(
    path.join(userDataRoot, "cache.json"),
    JSON.stringify({
      ...demoData,
      handle: "sikai",
      user: {
        ...demoData.user,
        handle: "sikai",
        avatar: "https://userpic.codeforces.org/1505917/avatar/e782f612b7e640e1.jpg",
      },
      syncedAt: now,
      problemsetSyncedAt: now,
      isDemo: false,
    }),
  );
}

let app;
(async () => {
  await writeFixture();
  app = await electron.launch({
    executablePath: path.join(projectRoot, "node_modules/electron/dist/electron.exe"),
    args: ["--disable-gpu", projectRoot],
    cwd: projectRoot,
    env: { ...process.env, CF_COMPASS_USER_DATA: userDataRoot },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.route(proxyPattern, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: pixel }),
  );
  await page.route(apiPattern, (route) => route.abort());
  await page.reload();
  await page.waitForSelector(".progress-panel");
  await page.waitForFunction(() => {
    const image = document.querySelector(".avatar-wrap img");
    return image?.complete && image.naturalWidth > 0;
  });
  const proxySource = await page.locator(".avatar-wrap img").getAttribute("src");
  await page.screenshot({ path: path.join(outputRoot, "avatar-proxy.png") });

  await page.unroute(proxyPattern);
  await page.route(proxyPattern, (route) => route.abort());
  await page.reload();
  await page.waitForSelector(".avatar-wrap > span");
  const fallbackText = await page.locator(".avatar-wrap > span").innerText();

  const report = {
    proxySource,
    proxyLoaded: proxySource === "https://codeforces.com/userphoto/avatar/sikai/photo.jpg",
    fallbackText,
    fallbackVisible: fallbackText === "S",
  };
  fs.writeFileSync(path.join(outputRoot, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.proxyLoaded || !report.fallbackVisible) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (app) await app.close();
});
