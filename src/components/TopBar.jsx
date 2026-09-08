import {
  Check,
  ChevronDown,
  Cloud,
  LayoutDashboard,
  RefreshCw,
  ScanLine,
  UserRound,
} from "lucide-react";
import { getCurrentLocale } from "../i18n";
import { ratingTone } from "../lib/stats";

export default function TopBar({
  handle,
  rating,
  onHandleChange,
  onSync,
  syncing,
  syncedAt,
  isDemo,
  onOptimizeLayout,
  showLayoutButton = false,
  title = "题库工作台",
  subtitle = "筛选、追踪并完成下一道值得做的题",
  onToggleImmersive,
}) {
  const syncLabel = syncing
    ? "正在同步…"
    : syncedAt
      ? `上次同步 ${new Date(syncedAt).toLocaleString(getCurrentLocale(), {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : "演示模式 · 尚未同步";

  function submit(event) {
    event.preventDefault();
    onSync();
  }

  return (
    <header className="topbar">
      <div className="page-heading">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <form
        className={`handle-form rating-tone-${ratingTone(rating)}`}
        onSubmit={submit}
      >
        <UserRound size={16} />
        <input
          aria-label="Codeforces Handle"
          value={handle}
          onChange={(event) => onHandleChange(event.target.value)}
          placeholder="输入 Codeforces Handle"
          spellCheck={false}
        />
        <ChevronDown size={14} className="handle-form__chevron" />
      </form>
      <div className="assistant-signal" title="双助理终端已连接">
          <i className="assistant-signal__primary" />
          <i className="assistant-signal__secondary" />
          <span>SYNC // READY</span>
      </div>
      <div className={`sync-state ${isDemo ? "is-demo" : ""}`}>
        {isDemo ? <Cloud size={14} /> : <Check size={14} />}
        <span>{syncLabel}</span>
      </div>
      <button
        className="layout-button immersive-button"
        type="button"
        onClick={onToggleImmersive}
        title="暂时隐藏工作面板，只看记忆大厅"
      >
        <ScanLine size={15} />
        <span>沉浸大厅</span>
      </button>
      {showLayoutButton ? (
        <button
          className="layout-button"
          type="button"
          onClick={onOptimizeLayout}
          title="恢复三个面板的预设位置和大小"
        >
          <LayoutDashboard size={15} />
          <span>智能复位</span>
        </button>
      ) : null}
      <button className="primary-button" type="button" onClick={onSync} disabled={syncing}>
        <RefreshCw size={15} className={syncing ? "is-spinning" : ""} />
        <span>{syncing ? "同步中" : "同步数据"}</span>
      </button>
    </header>
  );
}
