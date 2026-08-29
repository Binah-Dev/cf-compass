import {
  Archive,
  Check,
  Clock3,
  Code2,
  Database,
  Download,
  FileJson,
  FolderOpen,
  History,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentLocale } from "../i18n";
import { DEFAULT_AI_CONFIG, loadAiConfig, saveAiConfig } from "../lib/ai";
import {
  DEFAULT_CODEFORCES_SOURCE_CONFIG,
  loadCodeforcesSourceConfig,
  saveCodeforcesSourceConfig,
} from "../lib/codeforces-source";

function formatDate(value) {
  if (!value) return "尚无记录";
  return new Date(value).toLocaleString(getCurrentLocale(), {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(value) {
  if (!value) return "0 KB";
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export default function DataCenter({
  status,
  studyData,
  syncing,
  onSync,
  onExport,
  onImport,
  onOpenBackups,
  onSettingsChange,
  onToast,
}) {
  const settings = studyData.settings;
  const activity = status?.activity || [];
  const [aiConfig, setAiConfig] = useState(DEFAULT_AI_CONFIG);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [sourceConfig, setSourceConfig] = useState(DEFAULT_CODEFORCES_SOURCE_CONFIG);
  const [sourceApiKey, setSourceApiKey] = useState("");
  const [sourceApiSecret, setSourceApiSecret] = useState("");
  const [showSourceApiKey, setShowSourceApiKey] = useState(false);
  const [showSourceApiSecret, setShowSourceApiSecret] = useState(false);
  const [sourceSaving, setSourceSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    loadAiConfig()
      .then((config) => {
        if (alive && config) setAiConfig({ ...DEFAULT_AI_CONFIG, ...config });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    loadCodeforcesSourceConfig()
      .then((config) => {
        if (alive && config) {
          setSourceConfig({ ...DEFAULT_CODEFORCES_SOURCE_CONFIG, ...config });
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function handleSaveAiConfig() {
    setAiSaving(true);
    try {
      const next = await saveAiConfig({
        ...aiConfig,
        apiKey: apiKey.trim() || undefined,
      });
      setAiConfig({ ...DEFAULT_AI_CONFIG, ...next });
      setApiKey("");
      setShowApiKey(false);
      onToast?.("success", "AI 设置已保存");
    } catch (error) {
      onToast?.("error", error.message || "AI 设置保存失败");
    } finally {
      setAiSaving(false);
    }
  }

  async function handleClearApiKey() {
    setAiSaving(true);
    try {
      const next = await saveAiConfig({ ...aiConfig, clearApiKey: true });
      setAiConfig({ ...DEFAULT_AI_CONFIG, ...next });
      setApiKey("");
      onToast?.("success", "AI Key 已清除");
    } catch (error) {
      onToast?.("error", error.message || "AI Key 清除失败");
    } finally {
      setAiSaving(false);
    }
  }

  async function handleSaveSourceConfig() {
    setSourceSaving(true);
    try {
      const next = await saveCodeforcesSourceConfig({
        ...sourceConfig,
        apiKey: sourceApiKey.trim() || undefined,
        apiSecret: sourceApiSecret.trim() || undefined,
      });
      setSourceConfig({ ...DEFAULT_CODEFORCES_SOURCE_CONFIG, ...next });
      setSourceApiKey("");
      setSourceApiSecret("");
      setShowSourceApiKey(false);
      setShowSourceApiSecret(false);
      onToast?.("success", "Codeforces 源码增强设置已保存");
    } catch (error) {
      onToast?.("error", error.message || "Codeforces 源码增强设置保存失败");
    } finally {
      setSourceSaving(false);
    }
  }

  async function handleClearSourceCredentials() {
    setSourceSaving(true);
    try {
      const next = await saveCodeforcesSourceConfig({
        ...sourceConfig,
        clearCredentials: true,
      });
      setSourceConfig({ ...DEFAULT_CODEFORCES_SOURCE_CONFIG, ...next });
      setSourceApiKey("");
      setSourceApiSecret("");
      onToast?.("success", "Codeforces API 凭证已清除");
    } catch (error) {
      onToast?.("error", error.message || "Codeforces API 凭证清除失败");
    } finally {
      setSourceSaving(false);
    }
  }

  return (
    <section className="feature-page data-center">
      <div className="data-summary">
        <div><Database size={17} /><span>本地提交</span><strong>{status?.submissionCount || 0}</strong><small>最新 ID {status?.latestSubmissionId || "—"}</small></div>
        <div><RefreshCw size={17} /><span>上次新增</span><strong>{status?.lastNewSubmissions || 0}</strong><small>{status?.incremental ? "增量同步" : "完整同步"}</small></div>
        <div><ShieldCheck size={17} /><span>自动备份</span><strong>{settings.autoBackup ? "已开启" : "已关闭"}</strong><small>保留 {settings.backupRetention} 份</small></div>
        <div><Archive size={17} /><span>备份文件</span><strong>{status?.backups?.length || 0}</strong><small>{status?.backups?.[0] ? formatDate(status.backups[0].createdAt) : "尚未创建"}</small></div>
      </div>

      <div className="data-grid">
        <section className="feature-card sync-card">
          <header className="feature-card__header">
            <div><span className="workspace-kicker">Codeforces 数据</span><h2>增量同步</h2></div>
            <span className="status-pill">
              <i />
              {settings.autoSync ? `自动 · ${settings.autoSyncMinutes} 分钟` : "API 在线"}
            </span>
          </header>
          <div className="sync-illustration">
            <span><Database size={24} /></span>
            <i />
            <span><RefreshCw size={24} /></span>
            <i />
            <span><Check size={24} /></span>
          </div>
          <p>仅拉取最新提交；题库在缓存有效期内直接复用，同时同步 Rating 历史。</p>
          <dl className="data-details">
            <div><dt>提交记录</dt><dd>{status?.submissionCount || 0} 条</dd></div>
            <div><dt>上次同步</dt><dd>{formatDate(status?.lastSyncAt)}</dd></div>
            <div><dt>题库缓存</dt><dd>{formatDate(status?.problemsetSyncedAt)}</dd></div>
            <div><dt>Rating 记录</dt><dd>{status?.ratingHistoryCount || 0} 场</dd></div>
            <div><dt>自动同步</dt><dd>{settings.autoSync ? `每 ${settings.autoSyncMinutes} 分钟` : "已关闭"}</dd></div>
          </dl>
          <button type="button" className="primary-button data-wide-button" onClick={onSync} disabled={syncing}>
            <RefreshCw size={15} className={syncing ? "is-spinning" : ""} />
            {syncing ? "正在增量同步…" : "立即增量同步"}
          </button>
        </section>

        <section className="feature-card transfer-card">
          <header className="feature-card__header">
            <div><span className="workspace-kicker">迁移与恢复</span><h2>JSON 数据保险箱</h2></div>
            <FileJson size={19} />
          </header>
          <div className="transfer-actions">
            <button type="button" onClick={onExport}>
              <span className="transfer-icon"><Download size={19} /></span>
              <span><strong>导出全部数据</strong><small>题库、收藏、笔记、复习进度</small></span>
            </button>
            <button type="button" onClick={onImport}>
              <span className="transfer-icon"><Upload size={19} /></span>
              <span><strong>导入备份</strong><small>导入前自动保留当前快照</small></span>
            </button>
            <button type="button" onClick={onOpenBackups}>
              <span className="transfer-icon"><FolderOpen size={19} /></span>
              <span><strong>打开备份文件夹</strong><small>{status?.backupDirectory || "本地数据目录"}</small></span>
            </button>
          </div>
          <div className="settings-box">
            <div>
              <span><strong>自动同步</strong><small>启动超时检查，运行期间定时同步</small></span>
              <button
                type="button"
                role="switch"
                aria-label="自动同步"
                aria-checked={settings.autoSync}
                className={`toggle ${settings.autoSync ? "is-on" : ""}`}
                onClick={() => onSettingsChange({ autoSync: !settings.autoSync })}
              ><i /></button>
            </div>
            <label>
              <span><strong>同步间隔</strong><small>失败后也会等待完整间隔再重试</small></span>
              <select
                aria-label="自动同步间隔"
                value={settings.autoSyncMinutes}
                disabled={!settings.autoSync}
                onChange={(event) => onSettingsChange({ autoSyncMinutes: Number(event.target.value) })}
              >
                {[15, 30, 60, 180].map((value) => <option key={value} value={value}>{value < 60 ? `${value} 分钟` : `${value / 60} 小时`}</option>)}
              </select>
            </label>
            <label>
              <span><strong>每日复习</strong><small>今日训练的到期题上限</small></span>
              <select value={settings.reviewLimit} onChange={(event) => onSettingsChange({ reviewLimit: Number(event.target.value) })}>
                {[5, 8, 12, 16, 20].map((value) => <option key={value} value={value}>{value} 题</option>)}
              </select>
            </label>
            <label>
              <span><strong>复习难度范围</strong><small>自动跳过明显低于当前水平的题</small></span>
              <select
                aria-label="复习 Rating 范围"
                value={settings.reviewRatingGap || 0}
                onChange={(event) => onSettingsChange({ reviewRatingGap: Number(event.target.value) })}
              >
                <option value="0">智能调整（推荐）</option>
                <option value="300">当前 Rating - 300</option>
                <option value="400">当前 Rating - 400</option>
                <option value="500">当前 Rating - 500</option>
                <option value="600">当前 Rating - 600</option>
              </select>
            </label>
            <label>
              <span><strong>三档推荐</strong><small>巩固 / 同段 / 挑战；也可在今日训练单独调整</small></span>
              <select
                aria-label="三档推荐数量"
                value={[
                  settings.recommendationTierCounts?.consolidate || 2,
                  settings.recommendationTierCounts?.steady || 3,
                  settings.recommendationTierCounts?.challenge || 2,
                ].join("-")}
                onChange={(event) => {
                  const [consolidate, steady, challenge] = event.target.value
                    .split("-")
                    .map(Number);
                  onSettingsChange({
                    recommendationTierCounts: { consolidate, steady, challenge },
                  });
                }}
              >
                <option value="1-2-1">轻量 · 1 / 2 / 1</option>
                <option value="2-3-2">标准 · 2 / 3 / 2</option>
                <option value="3-4-3">强化 · 3 / 4 / 3</option>
              </select>
            </label>
            <div>
              <span><strong>自动备份</strong><small>每天首次数据变更时创建</small></span>
              <button
                type="button"
                role="switch"
                aria-checked={settings.autoBackup}
                className={`toggle ${settings.autoBackup ? "is-on" : ""}`}
                onClick={() => onSettingsChange({ autoBackup: !settings.autoBackup })}
              ><i /></button>
            </div>
            <label>
              <span><strong>保留备份</strong><small>自动清理更早文件</small></span>
              <select value={settings.backupRetention} onChange={(event) => onSettingsChange({ backupRetention: Number(event.target.value) })}>
                {[7, 14, 30, 60].map((value) => <option key={value} value={value}>{value} 份</option>)}
              </select>
            </label>
            <label>
              <span><strong>题库缓存</strong><small>到期后同步完整题库</small></span>
              <select value={settings.problemCacheHours} onChange={(event) => onSettingsChange({ problemCacheHours: Number(event.target.value) })}>
                {[3, 6, 12, 24].map((value) => <option key={value} value={value}>{value} 小时</option>)}
              </select>
            </label>
          </div>
          <div className="ai-settings">
            <header className="ai-settings__header">
              <div>
                <span className="workspace-kicker">可选 AI 助手</span>
                <strong><Sparkles size={15} />比赛 AI 复盘</strong>
              </div>
              <span className={`ai-settings__status ${aiConfig.hasApiKey ? "is-ready" : ""}`}>
                {aiConfig.hasApiKey ? "已配置 Key" : "未配置 Key"}
              </span>
            </header>
            <p className="ai-settings__intro">只在点击赛事复盘时发送当前比赛摘要和本地笔记，不会参与自动同步。</p>
            <label className="ai-settings__toggle">
              <span><strong>启用 AI 复盘</strong><small>默认关闭，未配置 Key 时不会发起请求</small></span>
              <button
                type="button"
                role="switch"
                aria-label="启用 AI 复盘"
                aria-checked={aiConfig.enabled}
                className={`toggle ${aiConfig.enabled ? "is-on" : ""}`}
                onClick={() => setAiConfig((current) => ({ ...current, enabled: !current.enabled }))}
              ><i /></button>
            </label>
            <label className="ai-settings__field">
              <span><strong>API 地址</strong><small>默认使用 DeepSeek OpenAI-compatible API</small></span>
              <input
                value={aiConfig.baseUrl}
                onChange={(event) => setAiConfig((current) => ({ ...current, baseUrl: event.target.value }))}
                placeholder="https://api.deepseek.com"
                spellCheck="false"
              />
            </label>
            <label className="ai-settings__field">
              <span><strong>模型</strong><small>首版推荐 deepseek-v4-flash</small></span>
              <input
                value={aiConfig.model}
                onChange={(event) => setAiConfig((current) => ({ ...current, model: event.target.value }))}
                placeholder="deepseek-v4-flash"
                spellCheck="false"
              />
            </label>
            <label className="ai-settings__field">
              <span><strong>API Key</strong><small>{aiConfig.keySource === "environment" ? "由环境变量提供" : "留空则保持当前 Key"}</small></span>
              <span className="ai-settings__key-input">
                <KeyRound size={14} />
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={aiConfig.hasApiKey ? "已配置，留空保持不变" : "输入 DeepSeek API Key"}
                  autoComplete="new-password"
                  spellCheck="false"
                />
                <button
                  type="button"
                  className="ai-settings__key-toggle"
                  aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                  onClick={() => setShowApiKey((current) => !current)}
                >{showApiKey ? "隐藏" : "显示"}</button>
              </span>
            </label>
            <div className="ai-settings__actions">
              <button type="button" className="primary-button" onClick={handleSaveAiConfig} disabled={aiSaving}>
                <Sparkles size={14} />{aiSaving ? "保存中…" : "保存 AI 设置"}
              </button>
              {aiConfig.hasApiKey && aiConfig.keySource !== "environment" ? (
                <button type="button" className="ghost-button" onClick={handleClearApiKey} disabled={aiSaving}>
                  清除 Key
                </button>
              ) : null}
            </div>
          </div>
          <div className="ai-settings source-settings">
            <header className="ai-settings__header">
              <div>
                <span className="workspace-kicker">可选增强能力</span>
                <strong><Code2 size={15} />Codeforces 源码增强复盘</strong>
              </div>
              <span className={`ai-settings__status ${sourceConfig.hasCredentials ? "is-ready" : ""}`}>
                {sourceConfig.hasCredentials ? "已配置凭证" : "未配置凭证"}
              </span>
            </header>
            <p className="ai-settings__intro">
              按需读取你自己的完整提交时间线，不参与自动同步；对已获取源码的相邻版本生成 Diff，确认后发送给已配置的 AI。
            </p>
            <label className="ai-settings__toggle">
              <span><strong>启用源码增强复盘</strong><small>默认关闭；需要 Codeforces API Key 和 Secret</small></span>
              <button
                type="button"
                role="switch"
                aria-label="启用源码增强复盘"
                aria-checked={sourceConfig.enabled}
                className={`toggle ${sourceConfig.enabled ? "is-on" : ""}`}
                onClick={() => setSourceConfig((current) => ({ ...current, enabled: !current.enabled }))}
              ><i /></button>
            </label>
            <label className="ai-settings__field">
              <span><strong>Codeforces API Key</strong><small>在 codeforces.com/settings/api 创建</small></span>
              <span className="ai-settings__key-input">
                <KeyRound size={14} />
                <input
                  type={showSourceApiKey ? "text" : "password"}
                  value={sourceApiKey}
                  onChange={(event) => setSourceApiKey(event.target.value)}
                  placeholder={sourceConfig.hasCredentials ? "已配置，留空保持不变" : "输入 Codeforces API Key"}
                  autoComplete="new-password"
                  spellCheck="false"
                />
                <button
                  type="button"
                  className="ai-settings__key-toggle"
                  aria-label={showSourceApiKey ? "隐藏 Codeforces API Key" : "显示 Codeforces API Key"}
                  onClick={() => setShowSourceApiKey((current) => !current)}
                >{showSourceApiKey ? "隐藏" : "显示"}</button>
              </span>
            </label>
            <label className="ai-settings__field">
              <span><strong>Codeforces API Secret</strong><small>{sourceConfig.credentialSource === "environment" ? "由环境变量提供" : "留空则保持当前 Secret"}</small></span>
              <span className="ai-settings__key-input">
                <KeyRound size={14} />
                <input
                  type={showSourceApiSecret ? "text" : "password"}
                  value={sourceApiSecret}
                  onChange={(event) => setSourceApiSecret(event.target.value)}
                  placeholder={sourceConfig.hasCredentials ? "已配置，留空保持不变" : "输入 Codeforces API Secret"}
                  autoComplete="new-password"
                  spellCheck="false"
                />
                <button
                  type="button"
                  className="ai-settings__key-toggle"
                  aria-label={showSourceApiSecret ? "隐藏 Codeforces API Secret" : "显示 Codeforces API Secret"}
                  onClick={() => setShowSourceApiSecret((current) => !current)}
                >{showSourceApiSecret ? "隐藏" : "显示"}</button>
              </span>
            </label>
            <div className="ai-settings__actions">
              <button type="button" className="primary-button" onClick={handleSaveSourceConfig} disabled={sourceSaving}>
                <Code2 size={14} />{sourceSaving ? "保存中…" : "保存源码增强设置"}
              </button>
              {sourceConfig.hasCredentials && sourceConfig.credentialSource !== "environment" ? (
                <button type="button" className="ghost-button" onClick={handleClearSourceCredentials} disabled={sourceSaving}>
                  清除凭证
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="feature-card activity-card">
          <header className="feature-card__header">
            <div><span className="workspace-kicker">可追溯记录</span><h2>最近数据活动</h2></div>
            <History size={19} />
          </header>
          <div className="activity-list">
            {activity.length ? activity.map((item) => (
              <article key={item.id}>
                <span className={`activity-state is-${item.status || "success"}`}><Check size={13} /></span>
                <div><strong>{item.type}</strong><p>{item.detail}</p></div>
                <time><Clock3 size={12} />{formatDate(item.timestamp)}</time>
              </article>
            )) : (
              <div className="feature-empty"><History size={28} /><strong>暂无数据活动</strong><span>完成一次同步或导出后会记录在这里。</span></div>
            )}
          </div>
          {status?.backups?.length ? (
            <div className="backup-list">
              <strong>最近备份</strong>
              {status.backups.slice(0, 3).map((backup) => (
                <span key={backup.path}><FileJson size={13} />{backup.name}<em>{formatSize(backup.size)}</em></span>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}
