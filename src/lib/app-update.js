import packageInfo from "../../package.json";

const RELEASE_PAGE = "https://github.com/Binah-Dev/cf-compass/releases";
const unsupportedState = () => ({
  supported: false,
  reason: window.cfBridge ? "bridge-unavailable" : "browser",
  currentVersion: packageInfo.version,
  autoCheck: false,
  status: "idle",
  update: null,
  progress: null,
  lastCheckedAt: null,
  error: null,
  errorCode: null,
});

function call(method, ...args) {
  if (typeof window.cfBridge?.[method] === "function") return window.cfBridge[method](...args);
  const error = new Error("UPDATER_UNSUPPORTED");
  error.code = "UPDATER_UNSUPPORTED";
  return Promise.reject(error);
}

export function getAppUpdateState() {
  return typeof window.cfBridge?.getAppUpdateState === "function"
    ? window.cfBridge.getAppUpdateState() : Promise.resolve(unsupportedState());
}
export const checkAppUpdate = () => call("checkAppUpdate");
export const downloadAppUpdate = () => call("downloadAppUpdate");
export const cancelAppUpdate = () => call("cancelAppUpdate");
export const installAppUpdate = () => call("installAppUpdate");
export function setAutoUpdateCheck(enabled) {
  if (typeof enabled !== "boolean") return Promise.reject(Object.assign(new Error("UPDATER_CONFIG"), { code: "UPDATER_CONFIG" }));
  return call("setAutoUpdateCheck", enabled);
}
export function openAppRelease() {
  if (typeof window.cfBridge?.openAppRelease === "function") return window.cfBridge.openAppRelease();
  // The browser fallback is a fixed project page. No renderer URL is sent to
  // the desktop updater, downloader or installer.
  window.open(RELEASE_PAGE, "_blank", "noopener,noreferrer");
  return Promise.resolve();
}
export function onAppUpdateChanged(callback) {
  if (typeof callback !== "function" || typeof window.cfBridge?.onAppUpdateChanged !== "function") return () => {};
  return window.cfBridge.onAppUpdateChanged(callback);
}
