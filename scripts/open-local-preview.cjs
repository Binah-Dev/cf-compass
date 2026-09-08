const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { makeFixture } = require("./fixtures/contest-sessions.cjs");
const root = path.resolve(__dirname, "..");
const requested = process.argv[2];
if (requested && !/^local-preview-\d+$/.test(requested)) throw Error("Only an existing isolated preview folder may be resumed");
const userData = path.join(root, "output", requested || `local-preview-${Date.now()}`);
if (requested && !fs.existsSync(path.join(userData, "study.json"))) throw Error("Preview data not found");
fs.mkdirSync(userData, { recursive: true });
const fixture = makeFixture();
fixture.study.settings = { ...fixture.study.settings, language: "zh-CN", interfaceDensity: "comfortable", reduceMotion: false, autoSync: false };
fixture.study.contestQueue = ["1901-A", "1901-B"];
fixture.study.contestQueueProblems = Object.fromEntries(fixture.center.details[1901].problems.map((p) => [`${p.contestId}-${p.index}`, p]));
for (const [name, value] of requested ? [] : [["cache", fixture.cache], ["study", fixture.study], ["contest-center", fixture.center]]) {
  fs.writeFileSync(path.join(userData, `${name}.json`), JSON.stringify(value, null, 2));
}
// This is a clearly identified, isolated preview, never the user's installed profile.
const env = { ...process.env, CF_COMPASS_USER_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const child = spawn(path.join(root, "node_modules", "electron", "dist", "electron.exe"), [root], {
  cwd: root, env, detached: true, stdio: "ignore", windowsHide: false,
});
child.on("error", (error) => { console.error(error); process.exitCode = 1; });
child.on("spawn", () => { console.log(JSON.stringify({ pid: child.pid, userData, fixtureHandle: fixture.cache.handle })); child.unref(); });
