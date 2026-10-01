import { Download, ExternalLink, LoaderCircle, Power, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { appUpdateMessages } from "../i18n/en-US";
import { cancelAppUpdate, checkAppUpdate, downloadAppUpdate, getAppUpdateState, installAppUpdate, onAppUpdateChanged, openAppRelease, setAutoUpdateCheck } from "../lib/app-update";
import "../app-update.css";

const CHINESE = {
  title: "应用更新", intro: "检查新版本后由你决定下载与安装。应用不会自动退出安装。", currentVersion: "当前版本", availableVersion: "可用版本", lastChecked: "上次检查", neverChecked: "尚未检查", loading: "正在读取更新设置…",
  idle: "等待检查", checking: "正在检查更新…", available: "发现新版本", notAvailable: "当前已是最新版本", downloading: "正在下载更新…", downloaded: "更新已下载，等待确认安装", cancelled: "已取消，可重新检查或下载", installing: "正在退出并安装…", error: "更新操作未完成",
  autoCheck: "启动时自动检查更新", autoCheckHint: "仅检查新版本，不会自动下载或安装。", check: "检查更新", checkAgain: "重新检查", release: "打开发布页", download: "下载 v{version}", retryDownload: "重新下载", cancel: "取消", install: "退出并安装", installPrompt: "确认退出 CF Compass 并安装已下载的更新？请先保存正在编辑的内容。", installConfirm: "确认退出并安装", installDismiss: "暂不安装", confirmation: "确认安装更新", releaseNotes: "更新说明", noNotes: "此版本未提供更新说明。", releaseDate: "发布时间：{date}", progress: "下载进度", progressDetail: "{transferred} / {total}", speed: "{speed}/秒", totalUnknown: "总大小未知",
  unsupported: "此环境不支持应用内自动更新，请从发布页手动下载适用版本。", unsupportedBrowser: "浏览器预览不支持应用内更新，请从发布页下载桌面版本。", unsupportedDevelopment: "开发环境不执行应用内更新，请从发布页获取正式版本。", unsupportedPortable: "便携版使用手动更新，请从发布页下载新版本。", unsupportedPlatform: "应用内更新仅适用于 Windows 安装版，请从发布页下载当前平台版本。", unsupportedNotInstalled: "此副本不是 Windows 安装版，请从发布页手动下载。", unsupportedBridge: "请重启应用以加载更新服务，或从发布页手动下载。",
  errorNetwork: "无法连接更新服务器，请检查网络后重试。", errorMetadata: "更新信息无效或尚未发布，请稍后重新检查，或查看发布页。", errorConfig: "更新配置不可用，请重试或从发布页手动下载。", errorTraining: "训练正在进行中。请先结束或取消训练，再退出并安装。", errorNotReady: "更新尚未下载完成，请先下载更新。", errorInstall: "无法启动安装程序，请重试或从发布页手动下载。", errorSignature: "更新包签名校验失败，请从官方发布页重新下载。", errorChecksum: "更新包完整性校验失败，请重新下载。", errorGeneric: "更新操作失败，请重试或从发布页手动下载。", errorCurrent: "当前版本信息无效，请从发布页手动下载正式版本。", errorBusy: "已有更新操作正在进行，请稍后重试。", errorCancelled: "操作已取消，可重新检查或下载。",
};
const ERROR_KEYS = {
  UPDATER_UNSUPPORTED: "unsupported", UPDATER_INVALID_METADATA: "errorMetadata", UPDATER_NETWORK: "errorNetwork",
  UPDATER_CANCELLED: "errorCancelled", UPDATER_TRAINING_ACTIVE: "errorTraining", UPDATER_NOT_READY: "errorNotReady",
  UPDATER_CONFIG: "errorConfig", UPDATER_INSTALL: "errorInstall", UPDATER_SIGNATURE: "errorSignature", UPDATER_CHECKSUM: "errorChecksum",
  UPDATER_CURRENT: "errorCurrent", UPDATER_BUSY: "errorBusy",
};
function errorCode(value) {
  const code = String(value?.code || value?.errorCode || value || "").trim().toUpperCase().replaceAll("-", "_");
  if (ERROR_KEYS[code]) return code;
  if (ERROR_KEYS[`UPDATER_${code}`]) return `UPDATER_${code}`;
  return Object.keys(ERROR_KEYS).find((known) => String(value?.message || value || "").toUpperCase().replaceAll("-", "_").includes(known)) || "";
}
function releaseNotes(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : String(item?.note || "")).filter(Boolean).join("\n\n");
  return "";
}

export default function AppUpdatePanel({ onToast }) {
  const { locale } = useI18n();
  const text = (key, values = {}) => Object.entries(values).reduce((message, [name, value]) => message.replaceAll(`{${name}}`, String(value)), (locale === "en-US" ? appUpdateMessages[key] : CHINESE[key]) || CHINESE[key] || key);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const cancelRef = useRef(false);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const releaseRef = useRef(false);
  const [confirmInstall, setConfirmInstall] = useState(false);
  const confirmRef = useRef(null);
  const [actionError, setActionError] = useState(null);
  const aliveRef = useRef(true);
  const eventEpochRef = useRef(0);

  useEffect(() => {
    aliveRef.current = true;
    const initialEpoch = eventEpochRef.current;
    const cleanup = onAppUpdateChanged((next) => {
      eventEpochRef.current += 1;
      if (aliveRef.current) { setState(next); setLoading(false); setActionError(null); }
    });
    getAppUpdateState().then((next) => {
      if (aliveRef.current && initialEpoch === eventEpochRef.current) setState(next);
    }).catch((cause) => aliveRef.current && setActionError(cause))
      .finally(() => aliveRef.current && setLoading(false));
    return () => { aliveRef.current = false; cleanup?.(); };
  }, []);

  useEffect(() => {
    if (state?.status !== "downloaded") setConfirmInstall(false);
  }, [state?.status]);

  useEffect(() => {
    if (!confirmInstall || !confirmRef.current) return;
    // The confirmation can extend below a small window. Bring it into view
    // using the page scroll, then focus its container without activating it.
    confirmRef.current.scrollIntoView({ block: "nearest" });
    confirmRef.current.focus({ preventScroll: true });
  }, [confirmInstall]);

  async function run(action, task) {
    const cancelling = action === "cancel";
    const openingRelease = action === "release";
    if (openingRelease ? releaseRef.current : cancelling ? cancelRef.current : busyRef.current) return;
    if (openingRelease) { releaseRef.current = true; setReleaseBusy(true); }
    else if (cancelling) { cancelRef.current = true; setCancelBusy(true); }
    else { busyRef.current = true; setBusy(action); }
    setActionError(null);
    const epoch = eventEpochRef.current;
    try {
      const next = await task();
      if (aliveRef.current && next && typeof next.supported === "boolean" && eventEpochRef.current === epoch) setState(next);
    } catch (cause) {
      if (errorCode(cause) !== "UPDATER_CANCELLED") {
        if (aliveRef.current) setActionError(cause);
        onToast?.("error", text(ERROR_KEYS[errorCode(cause)] || "errorGeneric"));
      }
    } finally {
      if (openingRelease) { releaseRef.current = false; if (aliveRef.current) setReleaseBusy(false); }
      else if (cancelling) { cancelRef.current = false; if (aliveRef.current) setCancelBusy(false); }
      else { busyRef.current = false; if (aliveRef.current) setBusy(""); }
    }
  }

  const supported = state?.supported === true;
  const status = state?.status || "idle";
  const active = ["checking", "downloading", "installing"].includes(status);
  const cancellingAllowed = ["checking", "downloading"].includes(status) || ["check", "download"].includes(busy);
  const canDownload = Boolean(state?.update?.version) && ["available", "cancelled", "error"].includes(status);
  const code = errorCode(actionError || state?.errorCode || state?.error);
  const hasError = Boolean(actionError || state?.error || state?.errorCode) && code !== "UPDATER_CANCELLED";
  const statusKey = status === "not-available" ? "notAvailable" : Object.prototype.hasOwnProperty.call(CHINESE, status) ? status : "idle";
  const reasonKey = {
    browser: "unsupportedBrowser", development: "unsupportedDevelopment", dev: "unsupportedDevelopment",
    portable: "unsupportedPortable", platform: "unsupportedPlatform", "not-installed": "unsupportedNotInstalled",
    "bridge-unavailable": "unsupportedBridge",
  }[state?.reason] || "unsupported";
  const number = (value) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const bytes = (value) => {
    const amount = Math.max(0, Number(value) || 0);
    if (amount >= 1024 ** 3) return `${number(amount / 1024 ** 3)} GB`;
    if (amount >= 1024 ** 2) return `${number(amount / 1024 ** 2)} MB`;
    if (amount >= 1024) return `${number(amount / 1024)} KB`;
    return `${number(amount)} B`;
  };
  const date = (value) => {
    const parsed = new Date(typeof value === "number" && value < 1e11 ? value * 1000 : value);
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString(locale);
  };
  const progress = state?.progress;
  const percent = Math.min(100, Math.max(0, Number(progress?.percent) || 0));
  const notes = releaseNotes(state?.update?.releaseNotes);

  return <section className="feature-card app-update-panel" data-testid="app-update-panel">
    <header className="feature-card__header"><div><span className="workspace-kicker">CF COMPASS</span><h2>{text("title")}</h2></div><ShieldCheck size={20} /></header>
    <div className="app-update-body">
      <p className="app-update-intro">{text("intro")}</p>
      <dl className="app-update-versions"><div><dt>{text("currentVersion")}</dt><dd data-testid="app-update-current-version">{state?.currentVersion ? `v${state.currentVersion}` : "—"}</dd></div><div><dt>{text("lastChecked")}</dt><dd>{state?.lastCheckedAt ? date(state.lastCheckedAt) : text("neverChecked")}</dd></div></dl>
      {loading ? <p className="app-update-status" role="status"><LoaderCircle className="app-update-spin" size={16} />{text("loading")}</p> : null}
      {!loading && !supported ? <p className="app-update-unsupported" role="status">{text(reasonKey)}</p> : null}
      {!loading && supported ? <>
        <div className="app-update-setting"><span><strong>{text("autoCheck")}</strong><small>{text("autoCheckHint")}</small></span><button type="button" role="switch" className={`toggle ${state.autoCheck ? "is-on" : ""}`} data-testid="app-update-auto-check" aria-label={text("autoCheck")} aria-checked={Boolean(state.autoCheck)} disabled={Boolean(busy) || active || cancelBusy} onClick={() => run("setting", () => setAutoUpdateCheck(!state.autoCheck))}><i /></button></div>
        <p className={`app-update-status is-${status}`} data-testid="app-update-status" role="status">{active ? <LoaderCircle className="app-update-spin" size={16} /> : null}{text(statusKey)}</p>
        {state.update?.version ? <section className="app-update-release-info"><h3>{text("availableVersion")} <span>v{state.update.version}</span></h3>{state.update.releaseDate ? <small>{text("releaseDate", { date: date(state.update.releaseDate) })}</small> : null}<div className="app-update-notes-heading">{text("releaseNotes")}</div><pre data-testid="app-update-notes">{notes || text("noNotes")}</pre></section> : null}
        {status === "downloading" || status === "downloaded" ? <div className="app-update-download-progress"><div><span>{text("progress")}</span><strong>{number(status === "downloaded" ? 100 : percent)}%</strong></div><progress data-testid="app-update-progress" aria-label={text("progress")} max="100" value={status === "downloaded" ? 100 : percent} /><small>{text("progressDetail", { transferred: bytes(progress?.transferred), total: progress?.total ? bytes(progress.total) : text("totalUnknown") })}{progress?.bytesPerSecond ? ` · ${text("speed", { speed: bytes(progress.bytesPerSecond) })}` : ""}</small></div> : null}
      </> : null}
      {hasError ? <p className="app-update-error" data-testid="app-update-error" role="alert">{text(ERROR_KEYS[code] || "errorGeneric")}</p> : null}
      <div className="app-update-actions">
        {!loading && supported ? <>
          <button type="button" className="ghost-button" data-testid="app-update-check" disabled={Boolean(busy) || active || cancelBusy} onClick={() => run("check", checkAppUpdate)}><RefreshCw className={status === "checking" ? "app-update-spin" : ""} size={15} />{text(status === "not-available" || status === "error" || status === "cancelled" ? "checkAgain" : "check")}</button>
          {canDownload ? <button type="button" className="primary-button" data-testid="app-update-download" disabled={Boolean(busy) || active || cancelBusy} onClick={() => run("download", downloadAppUpdate)}><Download size={15} />{text(status === "cancelled" || status === "error" ? "retryDownload" : "download", { version: state.update.version })}</button> : null}
          {cancellingAllowed ? <button type="button" className="ghost-button" data-testid="app-update-cancel" disabled={cancelBusy} onClick={() => run("cancel", cancelAppUpdate)}><X size={15} />{text("cancel")}</button> : null}
          {status === "downloaded" ? <button type="button" className="primary-button" data-testid="app-update-install" disabled={Boolean(busy) || cancelBusy} onClick={() => setConfirmInstall(true)}><Power size={15} />{text("install")}</button> : null}
        </> : null}
        <button type="button" className="ghost-button" data-testid="app-update-release" onClick={() => run("release", openAppRelease)} disabled={releaseBusy}><ExternalLink size={15} />{text("release")}</button>
      </div>
      {confirmInstall && supported && status === "downloaded" ? <div className="app-update-confirm" ref={confirmRef} tabIndex={-1} role="alertdialog" aria-labelledby="app-update-confirm-title" aria-describedby="app-update-confirm-description"><strong id="app-update-confirm-title">{text("confirmation")}</strong><p id="app-update-confirm-description">{text("installPrompt")}</p><div><button type="button" className="primary-button" data-testid="app-update-install-confirm" disabled={Boolean(busy) || cancelBusy} onClick={() => { setConfirmInstall(false); run("install", installAppUpdate); }}><Power size={15} />{text("installConfirm")}</button><button type="button" className="ghost-button" data-testid="app-update-install-dismiss" disabled={Boolean(busy)} onClick={() => setConfirmInstall(false)}>{text("installDismiss")}</button></div></div> : null}
    </div>
  </section>;
}
