const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { createRequire } = require("node:module");
const {
  APP_ID, INSTALL_MARKER, RELEASE_URL, UPDATE_PROVIDER,
  detectUpdateEligibility, validateStableUpdateInfo, createAppUpdateService,
} = require("../electron/services/app-update-service.cjs");
const updaterRequire = createRequire(require.resolve("electron-updater"));
const { CancellationError } = updaterRequire("builder-util-runtime");
const checksum = Buffer.alloc(64, 7).toString("base64");
const clone = (value) => structuredClone(value);
function info(version = "4.2.3", changes = {}) {
  const name = `CF-Compass-${version}-Windows-x64-Setup.exe`;
  return { version, tag: `v${version}`, files: [{ url: name, sha512: checksum, size: 1234 }],
    path: name, sha512: checksum, releaseDate: "2026-10-01T00:00:00.000Z", releaseNotes: "Release notes", ...changes };
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.checkCalls = 0;
    this.downloadCalls = 0;
    this.installCalls = [];
    this.tokens = [];
    this.verifyUpdateCodeSignature = () => "original verifier";
    this.checkImpl = async () => ({ isUpdateAvailable: true, updateInfo: info() });
    this.downloadImpl = async () => [path.join(os.tmpdir(), "CF-Compass-4.2.3-Windows-x64-Setup.exe")];
  }
  setFeedURL(provider) { this.provider = clone(provider); }
  async checkForUpdates() {
    this.checkCalls += 1;
    const result = await this.checkImpl();
    if (result?.isUpdateAvailable) this.updateInfoAndProvider = { info: clone(result.updateInfo) };
    return result;
  }
  downloadUpdate(token) {
    this.downloadCalls += 1;
    this.tokens.push(token);
    return this.downloadImpl(token);
  }
  quitAndInstall(...args) {
    this.installCalls.push(args);
    if (this.installImpl) this.installImpl();
  }
}
function fixture(overrides = {}) {
  const updater = new FakeUpdater();
  let config = { autoCheck: false, retained: "value" };
  let training = false;
  let trainingReads = 0;
  const opened = [];
  const changes = [];
  const io = {
    updater, currentVersion: "4.2.2", supported: true,
    readConfig: async () => clone(config), writeConfig: async (value) => { config = clone(value); },
    hasActiveTraining: async () => { trainingReads += 1; return training; },
    onChanged: (value) => changes.push(value), openExternal: async (url) => { opened.push(url); },
    now: () => Date.UTC(2026, 9, 1, 12), ...overrides,
  };
  const service = createAppUpdateService(io);
  return { updater, service, io, changes, opened, config: () => clone(config),
    training: (value) => { training = value; }, trainingReads: () => trainingReads };
}
async function downloaded(f) {
  assert.equal((await f.service.check()).status, "available");
  assert.equal((await f.service.download()).status, "downloaded");
}
function installedFixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cf-update-eligibility-"));
  const resourcesPath = path.join(root, "resources");
  fs.mkdirSync(resourcesPath);
  const options = { platform: "win32", arch: "x64", isPackaged: true,
    execPath: path.join(root, "CF Compass.exe"), resourcesPath, env: {} };
  fs.writeFileSync(options.execPath, "fixture");
  fs.writeFileSync(path.join(root, "Uninstall CF Compass.exe"), "fixture");
  fs.writeFileSync(path.join(root, INSTALL_MARKER), APP_ID);
  fs.writeFileSync(path.join(resourcesPath, "app-update.yml"), JSON.stringify({ ...UPDATE_PROVIDER, publisherName: "Original Publisher" }));
  try { run(options, root); }
  finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("eligibility requires installed Windows x64 NSIS marker, uninstaller and exact public provider", () => {
  installedFixture((options, root) => {
    assert.deepEqual(detectUpdateEligibility(options), { supported: true, reason: null });
    assert.equal(detectUpdateEligibility({ ...options, platform: "linux" }).reason, "platform");
    assert.equal(detectUpdateEligibility({ ...options, arch: "arm64" }).reason, "platform");
    assert.equal(detectUpdateEligibility({ ...options, isPackaged: false }).reason, "development");
    for (const name of ["PORTABLE_EXECUTABLE_DIR", "PORTABLE_EXECUTABLE_FILE", "portable_executable_unknown"]) {
      assert.equal(detectUpdateEligibility({ ...options, env: { [name]: "" } }).reason, "portable");
    }
    fs.writeFileSync(path.join(root, INSTALL_MARKER), "com.some.other.app");
    assert.equal(detectUpdateEligibility(options).reason, "not-installed");
    fs.writeFileSync(path.join(root, INSTALL_MARKER), `${APP_ID}\n`);
    assert.equal(detectUpdateEligibility(options).supported, true);
    fs.unlinkSync(path.join(root, "Uninstall CF Compass.exe"));
    assert.equal(detectUpdateEligibility(options).reason, "not-installed");
  });
});

test("eligibility rejects malformed, missing or redirected update config and supports isolated fixture identity", () => {
  installedFixture((options, root) => {
    const configPath = path.join(options.resourcesPath, "app-update.yml");
    for (const changes of [{ provider: "generic", url: "https://evil.example" }, { owner: "Other" },
      { repo: "other-repo" }, { private: true }, { token: "secret" }, { host: "api.github.com" },
      { channel: "beta" }, { protocol: "http" }]) {
      fs.writeFileSync(configPath, JSON.stringify({ ...UPDATE_PROVIDER, ...changes }));
      assert.equal(detectUpdateEligibility(options).reason, "not-installed");
    }
    fs.writeFileSync(configPath, "provider: [unterminated");
    assert.equal(detectUpdateEligibility(options).reason, "not-installed");
    fs.unlinkSync(configPath);
    assert.equal(detectUpdateEligibility(options).reason, "not-installed");
    fs.writeFileSync(configPath, JSON.stringify(UPDATE_PROVIDER));
    fs.writeFileSync(path.join(root, INSTALL_MARKER), "com.cfcompass.updater.qa");
    fs.renameSync(path.join(root, "Uninstall CF Compass.exe"), path.join(root, "Uninstall CF Compass QA.exe"));
    assert.equal(detectUpdateEligibility(options).supported, false);
    assert.equal(detectUpdateEligibility({ ...options, expectedAppId: "com.cfcompass.updater.qa", productName: "CF Compass QA" }).supported, true);
  });
});

test("metadata accepts only exact newer stable semver and matching GitHub release tag", () => {
  assert.equal(validateStableUpdateInfo(info(), "4.2.2").version, "4.2.3");
  assert.equal(validateStableUpdateInfo(info("4.2.10"), "4.2.9").version, "4.2.10");
  assert.equal(validateStableUpdateInfo(info("4.3.0", { tag: "4.3.0" }), "4.2.2").version, "4.3.0");
  for (const version of ["4.2.2", "4.2.1", "v4.2.3", "4.2.3-beta.1", "4.2.3+build", "04.2.3", "4.2", "4.2.9007199254740992"]) {
    assert.throws(() => validateStableUpdateInfo(info(version), "4.2.2"), (error) => error.code === "UPDATER_INVALID_METADATA");
  }
  for (const tag of ["v4.2.4", "v4.2.3/../../other", "beta", 423]) assert.throws(() => validateStableUpdateInfo(info("4.2.3", { tag }), "4.2.2"));
});

test("metadata blocks every alternate asset URL, malformed checksum, conflicting descriptor and web installer", () => {
  const valid = info();
  const name = valid.files[0].url;
  for (const url of [`https://github.com/Binah-Dev/cf-compass/releases/download/v4.2.3/${name}`,
    `https://github.com/Other/repo/${name}`, `../${name}`, `subdir/${name}`, `..\\${name}`, `/${name}`,
    `${name}?token=x`, `${name}#fragment`, name.replace("Setup", "portable"), name.replace("x64", "arm64"),
    name.replace("4.2.3", "4.2.4"), `%2e%2e%2f${name}`]) {
    assert.throws(() => validateStableUpdateInfo({ ...valid, files: [{ url, sha512: checksum }] }, "4.2.2"));
  }
  for (const sha512 of [null, "", "00".repeat(64), checksum.slice(0, -1), `${checksum}\n`, Buffer.alloc(63).toString("base64"), "_".repeat(86) + "=="]) {
    assert.throws(() => validateStableUpdateInfo({ ...valid, files: [{ url: name, sha512 }] }, "4.2.2"));
  }
  for (const changed of [
    { files: [] }, { files: [{ url: name, sha512: checksum }, { url: "evil.exe", sha512: checksum }] },
    { files: [{ url: name, sha512: checksum }, { url: name, sha512: Buffer.alloc(64, 8).toString("base64") }] },
    { path: "evil.exe" }, { sha512: Buffer.alloc(64, 8).toString("base64") }, { packages: {} },
    { packageInfo: { path: "evil.7z" } }, { files: [{ url: name, sha512: checksum, packageInfo: {} }] },
  ]) assert.throws(() => validateStableUpdateInfo({ ...valid, ...changed }, "4.2.2"));
});

test("init pins public stable NSIS settings without replacing native signature verification", async () => {
  const f = fixture();
  const verifier = f.updater.verifyUpdateCodeSignature;
  const [first, second] = await Promise.all([f.service.init(), f.service.init()]);
  assert.deepEqual(first, second);
  assert.deepEqual(f.updater.provider, UPDATE_PROVIDER);
  for (const key of ["autoDownload", "autoInstallOnAppQuit", "allowPrerelease", "allowDowngrade", "forceDevUpdateConfig"]) assert.equal(f.updater[key], false);
  assert.equal(f.updater.disableWebInstaller, true);
  assert.equal(f.updater.disableDifferentialDownload, true);
  assert.equal(f.updater.verifyUpdateCodeSignature, verifier);
  assert.equal(f.updater.checkCalls, 0);
});

test("real electron-updater 6.8.9 keeps native verification and resets the channel setter's downgrade side effect", async () => {
  const { NsisUpdater } = require("electron-updater");
  const updater = new NsisUpdater({ ...UPDATE_PROVIDER }, { version: "4.2.2", isPackaged: true });
  const nativeVerifier = updater.verifyUpdateCodeSignature;
  const service = createAppUpdateService({ updater, currentVersion: "4.2.2", supported: true,
    readConfig: async () => ({ autoCheck: false }) });
  await service.init();
  assert.equal(updater.channel, "latest");
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.disableWebInstaller, true);
  assert.equal(updater.disableDifferentialDownload, true);
  assert.equal(updater.verifyUpdateCodeSignature, nativeVerifier);
  const provider = await updater.clientPromise;
  assert.equal(provider.constructor.name, "GitHubProvider");
  assert.deepEqual(provider.options, UPDATE_PROVIDER);
});

test("unsupported contexts perform no updater operation and open only the fixed release page", async () => {
  const f = fixture({ supported: false, reason: "portable" });
  assert.equal((await f.service.startup()).reason, "portable");
  assert.equal((await f.service.check()).errorCode, "UPDATER_UNSUPPORTED");
  assert.equal((await f.service.download()).errorCode, "UPDATER_UNSUPPORTED");
  assert.equal((await f.service.install()).errorCode, "UPDATER_UNSUPPORTED");
  await f.service.openRelease("https://evil.example");
  assert.deepEqual(f.opened, [RELEASE_URL]);
  assert.equal(f.updater.provider, undefined);
  assert.equal(f.updater.checkCalls, 0);
  assert.equal(f.updater.downloadCalls, 0);
  assert.equal(f.updater.installCalls.length, 0);
});

test("auto checking persists strict booleans, serializes writes, and runs once on the next startup", async () => {
  const f = fixture();
  assert.equal((await f.service.startup()).status, "idle");
  assert.equal(f.updater.checkCalls, 0);
  await Promise.all([f.service.setAutoCheck(true), f.service.setAutoCheck(false)]);
  assert.deepEqual(f.config(), { autoCheck: false, retained: "value" });
  assert.equal((await f.service.setAutoCheck("true")).errorCode, "UPDATER_CONFIG");
  assert.equal(f.config().autoCheck, false);
  await f.service.setAutoCheck(true);
  const restarted = createAppUpdateService({ ...f.io, updater: new FakeUpdater() });
  const [first, second] = await Promise.all([restarted.startup(), restarted.startup()]);
  assert.equal(first.status, "available");
  assert.deepEqual(first, second);
});

test("config I/O errors fail closed for startup and preserve the saved toggle on write failure", async () => {
  const first = fixture({ readConfig: async () => { throw new Error("config unreadable"); } });
  const startup = await first.service.startup();
  assert.equal(startup.autoCheck, false);
  assert.equal(startup.errorCode, "UPDATER_CONFIG");
  assert.equal(first.updater.checkCalls, 0);
  const second = fixture({ writeConfig: async () => { throw new Error("disk full"); } });
  assert.equal((await second.service.setAutoCheck(true)).errorCode, "UPDATER_CONFIG");
  assert.equal((await second.service.get()).autoCheck, false);
});

test("duplicate check requests share one request and never download automatically", async () => {
  const f = fixture();
  const started = deferred();
  const result = deferred();
  f.updater.checkImpl = async () => { started.resolve(); return result.promise; };
  const first = f.service.check();
  const second = f.service.check();
  await started.promise;
  assert.equal((await f.service.get()).status, "checking");
  result.resolve({ isUpdateAvailable: true, updateInfo: info() });
  assert.deepEqual(await first, await second);
  assert.equal(f.updater.checkCalls, 1);
  assert.equal(f.updater.downloadCalls, 0);
  const ready = await f.service.get();
  assert.equal(ready.status, "available");
  assert.equal(ready.lastCheckedAt, "2026-10-01T12:00:00.000Z");
  ready.update.version = "99.0.0";
  assert.equal((await f.service.get()).update.version, "4.2.3");
});

test("current and older stable releases are not offered, and prereleases never become actionable", async () => {
  const f = fixture();
  for (const version of ["4.2.2", "4.2.1"]) {
    f.updater.checkImpl = async () => ({ isUpdateAvailable: false, updateInfo: info(version) });
    const state = await f.service.check();
    assert.equal(state.status, "not-available");
    assert.equal(state.update, null);
  }
  f.updater.checkImpl = async () => ({ isUpdateAvailable: true, updateInfo: info("4.3.0-beta.1") });
  assert.equal((await f.service.check()).errorCode, "UPDATER_INVALID_METADATA");
  assert.equal(f.updater.downloadCalls, 0);
});

test("logical check cancellation ignores late events/results and waits for the old request before retry", async () => {
  const f = fixture();
  const started = deferred();
  const result = deferred();
  f.updater.checkImpl = async () => { started.resolve(); return result.promise; };
  const check = f.service.check();
  await started.promise;
  assert.equal((await f.service.cancel()).status, "cancelled");
  f.updater.emit("update-available", info());
  f.updater.emit("update-downloaded", info());
  f.updater.emit("error", new Error("late old check error"));
  assert.equal((await f.service.check()).status, "cancelled");
  assert.equal(f.updater.checkCalls, 1);
  result.resolve({ isUpdateAvailable: true, updateInfo: info() });
  assert.equal((await check).status, "cancelled");
  assert.equal((await f.service.get()).update, null);
  f.updater.checkImpl = async () => ({ isUpdateAvailable: true, updateInfo: info() });
  assert.equal((await f.service.check()).status, "available");
  assert.equal(f.updater.checkCalls, 2);
});

test("network check failure retains a previously verified candidate for retry", async () => {
  const f = fixture();
  await f.service.check();
  f.updater.checkImpl = async () => { throw Object.assign(new Error("offline"), { code: "ECONNRESET" }); };
  const failed = await f.service.check();
  assert.equal(failed.status, "error");
  assert.equal(failed.errorCode, "UPDATER_NETWORK");
  assert.equal(failed.update.version, "4.2.3");
  assert.equal((await f.service.download()).status, "downloaded");
});

test("download revalidates the actual updater metadata before starting any network transfer", async () => {
  const f = fixture();
  await f.service.check();
  f.updater.updateInfoAndProvider.info.files[0].url = "https://evil.example/installer.exe";
  assert.equal((await f.service.download()).errorCode, "UPDATER_INVALID_METADATA");
  assert.equal(f.updater.downloadCalls, 0);
  await f.service.check();
  assert.equal((await f.service.download()).status, "downloaded");
});

test("download reports bounded progress and waits for verified Promise completion instead of downloaded events", async () => {
  const f = fixture();
  await f.service.check();
  const started = deferred();
  const result = deferred();
  f.updater.downloadImpl = async () => { started.resolve(); return result.promise; };
  const first = f.service.download();
  const second = f.service.download();
  await started.promise;
  f.updater.emit("download-progress", { percent: 125, transferred: 250, total: 200, bytesPerSecond: -10 });
  assert.deepEqual((await f.service.get()).progress, { percent: 100, transferred: 200, total: 200, bytesPerSecond: 0 });
  f.updater.emit("update-downloaded", info());
  assert.equal((await f.service.get()).status, "downloading");
  assert.equal((await f.service.install()).errorCode, "UPDATER_NOT_READY");
  assert.equal((await f.service.get()).status, "downloading");
  result.resolve(["downloaded-installer.exe"]);
  assert.equal((await first).status, "downloaded");
  assert.equal((await second).status, "downloaded");
  assert.equal(f.updater.downloadCalls, 1);
  assert.equal(f.updater.installCalls.length, 0);
});

test("download cancellation cancels the native token, ignores late progress, retains update, and uses fresh token on retry", async () => {
  const f = fixture();
  await f.service.check();
  const started = deferred();
  f.updater.downloadImpl = (token) => new Promise((_resolve, reject) => {
    token.onCancel(() => reject(new CancellationError()));
    started.resolve();
  });
  const download = f.service.download();
  await started.promise;
  assert.equal((await f.service.cancel()).status, "cancelled");
  assert.equal(f.updater.tokens[0].cancelled, true);
  f.updater.emit("download-progress", { percent: 80, total: 100, transferred: 80 });
  f.updater.emit("update-downloaded", info());
  assert.equal((await download).status, "cancelled");
  const cancelled = await f.service.get();
  assert.equal(cancelled.progress, null);
  assert.equal(cancelled.update.version, "4.2.3");
  assert.equal((await f.service.cancel()).status, "cancelled");
  f.updater.downloadImpl = async () => ["retry-installer.exe"];
  assert.equal((await f.service.download()).status, "downloaded");
  assert.notEqual(f.updater.tokens[0], f.updater.tokens[1]);
  assert.equal(f.updater.tokens[1].cancelled, false);
});

test("failed download keeps the verified candidate and maps signature/checksum errors without bypassing them", async () => {
  const f = fixture();
  await f.service.check();
  for (const [code, expected] of [["ECONNRESET", "UPDATER_NETWORK"], ["ERR_UPDATER_INVALID_SIGNATURE", "UPDATER_SIGNATURE"], ["ERR_UPDATER_CHECKSUM_MISMATCH", "UPDATER_CHECKSUM"]]) {
    f.updater.downloadImpl = async () => { throw Object.assign(new Error("download failed"), { code }); };
    const failed = await f.service.download();
    assert.equal(failed.errorCode, expected);
    assert.equal(failed.update.version, "4.2.3");
    assert.equal(f.updater.installCalls.length, 0);
  }
  f.updater.downloadImpl = async () => ["retry-installer.exe"];
  assert.equal((await f.service.download()).status, "downloaded");
});

test("metadata mutation during download and an empty download result never enable installation", async () => {
  const f = fixture();
  await f.service.check();
  const started = deferred();
  const result = deferred();
  f.updater.downloadImpl = async () => { started.resolve(); return result.promise; };
  const download = f.service.download();
  await started.promise;
  f.updater.updateInfoAndProvider.info.files[0].sha512 = Buffer.alloc(64, 8).toString("base64");
  result.resolve(["untrusted-installer.exe"]);
  assert.equal((await download).errorCode, "UPDATER_INVALID_METADATA");
  assert.equal((await f.service.install()).errorCode, "UPDATER_NOT_READY");
  await f.service.check();
  f.updater.downloadImpl = async () => [];
  assert.equal((await f.service.download()).errorCode, "UPDATER_NOT_READY");
  assert.equal(f.updater.installCalls.length, 0);
});

test("installation rereads active training, retains downloaded state when blocked, and launches only on explicit retry", async () => {
  const f = fixture();
  await downloaded(f);
  f.training(true);
  const blocked = await f.service.install();
  assert.equal(blocked.status, "downloaded");
  assert.equal(blocked.errorCode, "UPDATER_TRAINING_ACTIVE");
  assert.equal(blocked.update.version, "4.2.3");
  assert.equal(f.updater.installCalls.length, 0);
  f.training(false);
  const first = f.service.install();
  const second = f.service.install();
  assert.equal((await first).status, "installing");
  assert.deepEqual(await first, await second);
  assert.deepEqual(f.updater.installCalls, [[false, true]]);
  assert.equal(f.trainingReads(), 2);
  await f.service.install();
  await f.service.check();
  await f.service.download();
  assert.equal(f.updater.installCalls.length, 1);
});

test("install sets its barrier before the asynchronous persisted-training check", async () => {
  const started = deferred();
  const training = deferred();
  const f = fixture({ hasActiveTraining: async () => { started.resolve(); return training.promise; } });
  await downloaded(f);
  const install = f.service.install();
  await started.promise;
  assert.equal((await f.service.get()).status, "installing");
  assert.equal(f.updater.installCalls.length, 0);
  training.resolve(true);
  assert.equal((await install).status, "downloaded");
  assert.equal(f.updater.installCalls.length, 0);
});

test("training read failure or native install failure keeps installer and permits an explicit retry", async () => {
  let unreadable = true;
  const f = fixture({ hasActiveTraining: async () => {
    if (unreadable) throw new Error("training unreadable");
    return false;
  } });
  await downloaded(f);
  assert.equal((await f.service.install()).status, "downloaded");
  assert.equal(f.updater.installCalls.length, 0);
  unreadable = false;
  let installFail = true;
  f.updater.installImpl = () => {
    if (installFail) { installFail = false; throw new Error("installer could not launch"); }
  };
  const failed = await f.service.install();
  assert.equal(failed.status, "downloaded");
  assert.equal(failed.errorCode, "UPDATER_INSTALL");
  assert.equal((await f.service.install()).status, "installing");
  assert.equal(f.updater.installCalls.length, 2);
});

test("a synchronous install metadata rejection does not poison the install retry latch", async () => {
  const f = fixture();
  await downloaded(f);
  const original = clone(f.updater.updateInfoAndProvider.info);
  f.updater.updateInfoAndProvider.info.tag = "v9.9.9";
  assert.equal((await f.service.install()).errorCode, "UPDATER_INVALID_METADATA");
  assert.equal(f.updater.installCalls.length, 0);
  f.updater.updateInfoAndProvider.info = original;
  assert.equal((await f.service.install()).status, "installing");
  assert.equal(f.updater.installCalls.length, 1);
});

test("late idle events cannot make an update actionable and release notes are plain bounded text", async () => {
  const f = fixture({ onChanged: () => { throw new Error("observer failure"); } });
  await f.service.init();
  f.updater.emit("update-available", info());
  f.updater.emit("update-downloaded", info());
  f.updater.emit("error", new Error("stale"));
  assert.equal((await f.service.get()).status, "idle");
  assert.equal((await f.service.download()).errorCode, "UPDATER_NOT_READY");
  f.updater.checkImpl = async () => ({ isUpdateAvailable: true, updateInfo: info("4.2.3", { releaseNotes: "<script>do not execute</script>" + "x".repeat(25000) }) });
  const result = await f.service.check();
  assert.equal(result.update.releaseNotes.length, 20000);
  assert.match(result.update.releaseNotes, /^<script>/);
  assert.equal(f.updater.downloadCalls, 0);
});
