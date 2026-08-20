import {
  Archive,
  Check,
  Clock3,
  Database,
  Download,
  FileJson,
  FolderOpen,
  History,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";

function formatDate(value) {
  if (!value) return "尚无记录";
  return new Date(value).toLocaleString("zh-CN", {
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
}) {
  const settings = studyData.settings;
  const activity = status?.activity || [];
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
