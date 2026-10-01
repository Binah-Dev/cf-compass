const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const APP_ID = "com.cfcompass.desktop";
const PRODUCT_NAME = "CF Compass";
const INSTALL_MARKER = "cf-compass-nsis-install";
const RELEASE_URL = "https://github.com/Binah-Dev/cf-compass/releases";
const UPDATE_PROVIDER = Object.freeze({ provider: "github", owner: "Binah-Dev", repo: "cf-compass", private: false, channel: "latest" });
let updaterRequire;
function dependency(name) {
  if (!updaterRequire) updaterRequire = createRequire(require.resolve("electron-updater"));
  return updaterRequire(name);
}
function updateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function fixedProvider(config) {
  return config && config.provider === UPDATE_PROVIDER.provider && config.owner === UPDATE_PROVIDER.owner &&
    config.repo === UPDATE_PROVIDER.repo && (config.private == null || config.private === false) &&
    (config.channel == null || config.channel === "latest") && (config.host == null || config.host === "github.com") &&
    (config.protocol == null || config.protocol === "https") && config.token == null && config.url == null;
}

function detectUpdateEligibility({ platform = process.platform, arch = process.arch, isPackaged = false,
  execPath = process.execPath, resourcesPath = process.resourcesPath, env = process.env,
  expectedAppId = APP_ID, productName = PRODUCT_NAME,
  existsSync = fs.existsSync, readFileSync = fs.readFileSync, statSync = fs.statSync } = {}) {
  if (platform !== "win32" || arch !== "x64") return { supported: false, reason: "platform" };
  if (!isPackaged) return { supported: false, reason: "development" };
  if (Object.keys(env || {}).some((key) => /^PORTABLE_EXECUTABLE_/i.test(key))) return { supported: false, reason: "portable" };
  try {
    const installRoot = path.dirname(execPath);
    if (!resourcesPath || path.resolve(resourcesPath) !== path.resolve(installRoot, "resources")) throw new Error("Unexpected resource location");
    const uninstaller = path.join(installRoot, `Uninstall ${productName}.exe`);
    const marker = path.join(installRoot, INSTALL_MARKER);
    const configPath = path.join(resourcesPath, "app-update.yml");
    for (const file of [uninstaller, marker, configPath]) if (!existsSync(file) || !statSync(file).isFile()) throw new Error("Missing installed NSIS file");
    if (String(readFileSync(marker, "utf8")).trim() !== expectedAppId) throw new Error("Incorrect installation identity");
    const config = dependency("js-yaml").load(String(readFileSync(configPath, "utf8")));
    if (!fixedProvider(config)) throw new Error("Incorrect update provider");
    return { supported: true, reason: null };
  } catch {
    return { supported: false, reason: "not-installed" };
  }
}

function stableVersion(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    throw updateError("UPDATER_INVALID_METADATA", "The release does not contain an exact stable version.");
  }
  const parts = value.split(".").map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) throw updateError("UPDATER_INVALID_METADATA", "The release version is invalid.");
  return parts;
}
function compareVersions(left, right) {
  const leftParts = stableVersion(left);
  const rightParts = stableVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] > rightParts[index] ? 1 : -1;
  }
  return 0;
}
function validSha512(value) {
  return typeof value === "string" && /^[A-Za-z0-9+/]{86}==$/.test(value) &&
    Buffer.from(value, "base64").length === 64 && Buffer.from(value, "base64").toString("base64") === value;
}
function validateStableUpdateInfo(info, currentVersion) {
  if (!info || typeof info !== "object" || compareVersions(info.version, currentVersion) <= 0) {
    throw updateError("UPDATER_INVALID_METADATA", "The release must be newer than the installed stable version.");
  }
  const expectedFile = `CF-Compass-${info.version}-Windows-x64-Setup.exe`;
  if (info.tag != null && info.tag !== info.version && info.tag !== `v${info.version}`) {
    throw updateError("UPDATER_INVALID_METADATA", "The release tag and update version do not match.");
  }
  if (info.packages != null || info.packageInfo != null || !Array.isArray(info.files) || !info.files.length || info.files.length > 10) {
    throw updateError("UPDATER_INVALID_METADATA", "The release must contain a full Windows NSIS installer.");
  }
  for (const file of info.files) {
    if (!file || file.url !== expectedFile || file.packageInfo != null || !validSha512(file.sha512)) {
      throw updateError("UPDATER_INVALID_METADATA", "The update installer name or SHA-512 checksum is invalid.");
    }
    if (file.sha512 !== info.files[0].sha512) throw updateError("UPDATER_INVALID_METADATA", "The update contains conflicting installer checksums.");
  }
  if ((info.path != null && info.path !== expectedFile) ||
      (info.sha512 != null && (!validSha512(info.sha512) || info.sha512 !== info.files[0].sha512))) {
    throw updateError("UPDATER_INVALID_METADATA", "The legacy update descriptor conflicts with the installer.");
  }
  return structuredClone(info);
}
function fingerprint(info) {
  return JSON.stringify({ version: info.version, tag: info.tag || null,
    files: info.files.map((file) => ({ url: file.url, sha512: file.sha512 })), path: info.path || null, sha512: info.sha512 || null });
}
function publicUpdate(info) {
  const notes = Array.isArray(info.releaseNotes)
    ? info.releaseNotes.map((entry) => `${String(entry?.version || "")}\n${String(entry?.note || "")}`).join("\n\n")
    : String(info.releaseNotes || "");
  const releaseDate = info.releaseDate == null ? null : new Date(info.releaseDate);
  return { version: info.version, releaseNotes: notes.slice(0, 20000),
    releaseDate: releaseDate && Number.isFinite(releaseDate.getTime()) ? releaseDate.toISOString() : null };
}
function errorCode(error, fallback = "UPDATER_NETWORK") {
  if (/^UPDATER_/.test(String(error?.code || ""))) return error.code;
  if (/SIGNATURE/i.test(String(error?.code || ""))) return "UPDATER_SIGNATURE";
  if (/CHECKSUM|DIGEST/i.test(String(error?.code || "")) || /checksum|sha512|sha256|digest mismatch/i.test(String(error?.message || ""))) return "UPDATER_CHECKSUM";
  if (/ERR_UPDATER_(INVALID_VERSION|INVALID_RELEASE_FEED|NO_FILES_PROVIDED|NO_CHECKSUM|CHANNEL_FILE_NOT_FOUND|WEB_INSTALLER_DISABLED)/.test(String(error?.code || ""))) return "UPDATER_INVALID_METADATA";
  return fallback;
}

function createAppUpdateService({ updater: suppliedUpdater = null, currentVersion, supported = false, reason = null,
  readConfig = async () => ({}), writeConfig = async () => {}, hasActiveTraining = async () => false,
  onChanged = null, openExternal = async () => {}, now = Date.now, defaultAutoCheck = true } = {}) {
  let updater = suppliedUpdater;
  let state = { supported: supported === true, reason: supported === true ? null : reason || "not-installed",
    currentVersion: String(currentVersion || ""), autoCheck: defaultAutoCheck === true, status: "idle", update: null,
    progress: null, lastCheckedAt: null, error: null, errorCode: null };
  let initPromise = null;
  let startupPromise = null;
  let configQueue = Promise.resolve();
  let savedConfig = {};
  let active = null;
  let nextOperation = 0;
  let candidate = null;
  let downloaded = false;
  let installPromise = null;
  const snapshot = () => structuredClone(state);
  function change(patch) {
    state = { ...state, ...patch };
    if (typeof onChanged === "function") {
      try { onChanged(snapshot()); } catch { /* UI observation must not alter updater control flow. */ }
    }
    return snapshot();
  }
  function failure(error, fallback, status = "error") {
    return change({ status, error: String(error?.message || error || "The update operation failed.").slice(0, 500), errorCode: errorCode(error, fallback) });
  }
  function configure() {
    if (!updater) {
      const { NsisUpdater } = require("electron-updater");
      updater = new NsisUpdater({ ...UPDATE_PROVIDER });
    }
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.disableWebInstaller = true;
    updater.disableDifferentialDownload = true;
    updater.forceDevUpdateConfig = false;
    updater.channel = "latest";
    // The channel setter in 6.8.9 enables downgrade; reset it after setting.
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.requestHeaders = null;
    updater.setFeedURL({ ...UPDATE_PROVIDER });
    // Check/download Promise outcomes are authoritative. Global events from a
    // cancelled operation never make an installer actionable in a later one.
    updater.on("error", (error) => {
      if (state.status === "installing") {
        failure(error, "UPDATER_INSTALL", "downloaded");
        installPromise = null;
      }
    });
  }
  function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        const config = await readConfig();
        savedConfig = config && typeof config === "object" && !Array.isArray(config) ? { ...config } : {};
        if (typeof savedConfig.autoCheck === "boolean") state.autoCheck = savedConfig.autoCheck;
      } catch (error) {
        state.autoCheck = false;
        failure(error, "UPDATER_CONFIG");
      }
      if (state.supported) {
        try { stableVersion(state.currentVersion); configure(); }
        catch (error) {
          state.supported = false;
          state.reason = "not-installed";
          failure(error, "UPDATER_CONFIG");
        }
      }
      return snapshot();
    })();
    return initPromise;
  }
  async function get() { await init(); return snapshot(); }
  async function check() {
    await init();
    if (!state.supported) return failure(updateError("UPDATER_UNSUPPORTED", "Automatic updates require an installed Windows x64 NSIS build."));
    if (active) return active.kind === "check" && !active.cancelled ? active.promise : snapshot();
    if (state.status === "downloaded" || state.status === "installing") return snapshot();
    const operation = { id: ++nextOperation, kind: "check", cancelled: false, promise: null };
    active = operation;
    change({ status: "checking", progress: null, error: null, errorCode: null });
    operation.promise = (async () => {
      try {
        const result = await updater.checkForUpdates();
        if (active !== operation || operation.cancelled) return snapshot();
        const info = result?.updateInfo || result?.versionInfo;
        const lastCheckedAt = new Date(now()).toISOString();
        if (!info) throw updateError("UPDATER_INVALID_METADATA", "The release metadata is unavailable.");
        const newer = compareVersions(info.version, state.currentVersion) > 0;
        if (!newer || result.isUpdateAvailable === false) {
          candidate = null;
          downloaded = false;
          return change({ status: "not-available", update: null, progress: null, lastCheckedAt, error: null, errorCode: null });
        }
        const verified = validateStableUpdateInfo(info, state.currentVersion);
        candidate = verified;
        downloaded = false;
        return change({ status: "available", update: publicUpdate(verified), progress: null, lastCheckedAt, error: null, errorCode: null });
      } catch (error) {
        if (active !== operation || operation.cancelled) return snapshot();
        return failure(error, "UPDATER_NETWORK");
      } finally {
        if (active === operation) active = null;
      }
    })();
    return operation.promise;
  }
  function startup() {
    if (!startupPromise) startupPromise = (async () => {
      await init();
      return state.supported && state.autoCheck ? check() : snapshot();
    })();
    return startupPromise;
  }
  function setAutoCheck(value) {
    const task = configQueue.then(async () => {
      await init();
      if (typeof value !== "boolean") return failure(updateError("UPDATER_CONFIG", "Automatic checking must be a boolean."), "UPDATER_CONFIG", state.status);
      try {
        const config = { ...savedConfig, autoCheck: value };
        await writeConfig(config);
        savedConfig = config;
        return change({ autoCheck: value, error: null, errorCode: null });
      } catch (error) { return failure(error, "UPDATER_CONFIG", state.status); }
    });
    configQueue = task.catch(() => undefined);
    return task;
  }
  function validateCandidate() {
    if (!candidate) throw updateError("UPDATER_NOT_READY", "Check for an available update before downloading it.");
    const verified = validateStableUpdateInfo(candidate, state.currentVersion);
    const liveInfo = updater.updateInfoAndProvider?.info;
    if (liveInfo && fingerprint(validateStableUpdateInfo(liveInfo, state.currentVersion)) !== fingerprint(verified)) {
      throw updateError("UPDATER_INVALID_METADATA", "The update metadata changed. Check for updates again.");
    }
    return verified;
  }
  async function download() {
    await init();
    if (!state.supported) return failure(updateError("UPDATER_UNSUPPORTED", "Automatic updates require an installed Windows x64 NSIS build."));
    if (active) return active.kind === "download" && !active.cancelled ? active.promise : snapshot();
    if (state.status === "downloaded" || state.status === "installing") return snapshot();
    let verified;
    try { verified = validateCandidate(); }
    catch (error) { return failure(error, "UPDATER_INVALID_METADATA"); }
    const { CancellationToken, CancellationError } = dependency("builder-util-runtime");
    const operation = { id: ++nextOperation, kind: "download", cancelled: false, promise: null, token: new CancellationToken() };
    active = operation;
    downloaded = false;
    change({ status: "downloading", error: null, errorCode: null,
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 } });
    const onProgress = (progress) => {
      if (active !== operation || operation.cancelled) return;
      const safe = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
      const total = safe(progress?.total);
      change({ progress: { percent: Math.min(100, safe(progress?.percent)), total,
        transferred: total ? Math.min(total, safe(progress?.transferred)) : safe(progress?.transferred), bytesPerSecond: safe(progress?.bytesPerSecond) } });
    };
    updater.on("download-progress", onProgress);
    operation.promise = (async () => {
      try {
        const files = await updater.downloadUpdate(operation.token);
        if (active !== operation || operation.cancelled) return snapshot();
        if (!Array.isArray(files) || !files.length || files.some((file) => typeof file !== "string" || !file)) {
          throw updateError("UPDATER_NOT_READY", "The update installer was not downloaded.");
        }
        if (fingerprint(validateCandidate()) !== fingerprint(verified)) throw updateError("UPDATER_INVALID_METADATA", "The update metadata changed during download.");
        downloaded = true;
        return change({ status: "downloaded", error: null, errorCode: null,
          progress: { ...(state.progress || { transferred: 0, total: 0, bytesPerSecond: 0 }), percent: 100 } });
      } catch (error) {
        if (active !== operation || operation.cancelled) return snapshot();
        if (error instanceof CancellationError || operation.token.cancelled) {
          return change({ status: "cancelled", progress: null, error: null, errorCode: "UPDATER_CANCELLED" });
        }
        return failure(error, "UPDATER_NETWORK");
      } finally {
        updater.removeListener("download-progress", onProgress);
        operation.token.dispose();
        if (active === operation) active = null;
      }
    })();
    return operation.promise;
  }
  async function cancel() {
    await init();
    if (!active || active.cancelled) return snapshot();
    active.cancelled = true;
    const result = change({ status: "cancelled", progress: null, error: null, errorCode: "UPDATER_CANCELLED" });
    if (active.kind === "download") active.token.cancel();
    return result;
  }
  async function install() {
    await init();
    if (installPromise) return installPromise;
    if (!state.supported) return failure(updateError("UPDATER_UNSUPPORTED", "Automatic updates require an installed Windows x64 NSIS build."));
    if (!downloaded || state.status !== "downloaded") return failure(updateError("UPDATER_NOT_READY", "Download the update before installing it."), "UPDATER_NOT_READY", state.status);
    installPromise = Promise.resolve().then(async () => {
      try {
        validateCandidate();
        // Block newly starting sessions before waiting on the persisted read.
        // The main process checks this status in its training-start handler.
        change({ status: "installing", error: null, errorCode: null });
        // This callback must read persisted training data each time, including
        // sessions for accounts other than the one currently shown in the UI.
        if (await hasActiveTraining()) {
          return failure(updateError("UPDATER_TRAINING_ACTIVE", "Finish or cancel the active training before installing the update."), "UPDATER_TRAINING_ACTIVE", "downloaded");
        }
        updater.quitAndInstall(false, true);
        return snapshot();
      } catch (error) { return failure(error, "UPDATER_INSTALL", "downloaded"); }
      finally { if (state.status !== "installing") installPromise = null; }
    });
    return installPromise;
  }
  async function openRelease() {
    await init();
    try { await openExternal(RELEASE_URL); return snapshot(); }
    catch (error) { return failure(error, "UPDATER_NETWORK", state.status); }
  }
  return { init, startup, get, check, setAutoCheck, download, cancel, install, openRelease };
}

module.exports = {
  APP_ID, PRODUCT_NAME, INSTALL_MARKER, RELEASE_URL, UPDATE_PROVIDER,
  detectUpdateEligibility, validateStableUpdateInfo, createAppUpdateService,
};
