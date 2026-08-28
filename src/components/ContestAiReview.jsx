import {
  Check,
  CheckCircle2,
  GitCompareArrows,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function ReviewList({ items, tone = "" }) {
  if (!items?.length) return <p className="ai-review-empty">暂无足够证据</p>;
  return (
    <div className={`ai-review-list ${tone ? `is-${tone}` : ""}`}>
      {items.map((item, index) => (
        <article key={`${item.title || item.evidence || "item"}-${index}`}>
          <span><Check size={13} /></span>
          <div>
            <strong>{item.title || item.evidence}</strong>
            {item.title && item.evidence ? <p>{item.evidence}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function formatTimelineTime(seconds) {
  if (!Number.isFinite(Number(seconds))) return "时间未知";
  const total = Math.max(0, Math.round(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function verdictLabel(verdict) {
  const labels = {
    OK: "AC",
    WRONG_ANSWER: "WA",
    COMPILATION_ERROR: "CE",
    TIME_LIMIT_EXCEEDED: "TLE",
    MEMORY_LIMIT_EXCEEDED: "MLE",
    RUNTIME_ERROR: "RE",
    SKIPPED: "跳过",
  };
  return labels[verdict] || verdict || "未知";
}

function verdictTone(verdict) {
  if (verdict === "OK") return "positive";
  if (verdict === "WRONG_ANSWER" || verdict === "RUNTIME_ERROR") return "negative";
  if (verdict === "COMPILATION_ERROR" || verdict === "TIME_LIMIT_EXCEEDED" || verdict === "MEMORY_LIMIT_EXCEEDED") return "warning";
  return "muted";
}

function SourceTimeline({ timeline, diffs }) {
  const [selectedDiffId, setSelectedDiffId] = useState("");
  const diffByTarget = useMemo(
    () => new Map((diffs || []).map((diff) => [Number(diff.toSubmissionId), diff])),
    [diffs],
  );
  const selectedDiff = (diffs || []).find((diff) => diff.id === selectedDiffId) || diffs?.[0] || null;

  useEffect(() => {
    if (!diffs?.some((diff) => diff.id === selectedDiffId)) {
      setSelectedDiffId(diffs?.[0]?.id || "");
    }
  }, [diffs, selectedDiffId]);

  if (!timeline?.length && !diffs?.length) return null;
  return (
    <section className="ai-review-section ai-source-review">
      <div className="ai-source-review__heading">
        <div>
          <h3><GitCompareArrows size={14} />提交时间线与代码 Diff</h3>
          <p>时间线覆盖 {timeline?.length || 0} 次提交，已获取源码 {timeline?.filter((item) => item.sourceAvailable).length || 0} 次，生成 {diffs?.length || 0} 组变化。</p>
        </div>
      </div>
      <div className="ai-source-review__layout">
        <div className="ai-source-timeline" aria-label="提交时间线">
          {(timeline || []).map((event) => {
            const diff = diffByTarget.get(Number(event.submissionId));
            const selected = diff?.id === selectedDiff?.id;
            return (
              <button
                type="button"
                key={`${event.submissionId || "event"}-${event.index}`}
                className={`ai-source-timeline__event ${selected ? "is-selected" : ""}`}
                disabled={!diff}
                onClick={() => diff && setSelectedDiffId(diff.id)}
              >
                <span className="ai-source-timeline__index">{event.index}</span>
                <span className="ai-source-timeline__main">
                  <strong>{event.problemIndex || event.problemKey || "题目"}</strong>
                  <small>{formatTimelineTime(event.relativeTimeSeconds)}</small>
                </span>
                <span className="ai-source-timeline__status">
                  <span
                    className={"ai-source-timeline__source " + (event.sourceAvailable ? "is-available" : "")}
                    aria-label={event.sourceAvailable ? "已获取源码，可查看 Diff" : "无源码"}
                    title={event.sourceAvailable ? "已获取源码，可查看 Diff" : "无源码"}
                  >
                    {event.sourceAvailable ? <GitCompareArrows size={12} /> : "无源码"}
                  </span>
                  <span className={"ai-source-verdict is-" + verdictTone(event.verdict)}>
                    {verdictLabel(event.verdict)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="ai-source-diff">
          {selectedDiff ? (
            <>
              <header className="ai-source-diff__header">
                <div>
                  <strong>{selectedDiff.problemKey || "题目"} · {selectedDiff.kind === "initial" ? "初始版本" : `第 ${selectedDiff.versionIndex} 次修改`}</strong>
                  <small>
                    {selectedDiff.fromSubmissionId ? `#${selectedDiff.fromSubmissionId} ${verdictLabel(selectedDiff.fromVerdict)} → ` : "空文件 → "}
                    #{selectedDiff.toSubmissionId} {verdictLabel(selectedDiff.toVerdict)} · {formatTimelineTime(selectedDiff.toRelativeTimeSeconds)}
                  </small>
                </div>
                <span className="ai-source-diff__stats"><Plus size={12} />{selectedDiff.addedLines}<Minus size={12} />{selectedDiff.removedLines}</span>
              </header>
              {selectedDiff.patch ? (
                <pre className="ai-source-diff__code"><code>{selectedDiff.patch.split("\n").map((line, index) => {
                  const marker = line[0];
                  const tone = marker === "+" ? "is-add" : marker === "-" ? "is-remove" : "is-context";
                  return <span className={tone} key={`${index}-${line}`}>{line || " "}</span>;
                })}</code></pre>
              ) : (
                <p className="ai-source-diff__empty">这次提交没有可展示的源码变化，或源码尚未返回。</p>
              )}
              {selectedDiff.patchTruncated || selectedDiff.sourceTruncated ? (
                <small className="ai-source-diff__note">Diff 内容已按请求长度限制截断，提交元数据仍完整保留。</small>
              ) : null}
            </>
          ) : (
            <p className="ai-source-diff__empty">暂无可查看的源码 Diff。</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function ContestAiReview({
  contest,
  review,
  loading,
  error,
  sourceMode = false,
  onClose,
  onRetry,
  onSave,
}) {
  if (!contest) return null;
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="ai-review-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="比赛 AI 复盘"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="ai-review-drawer__header">
          <div className="ai-review-drawer__icon"><Sparkles size={18} /></div>
          <div>
            <span>{sourceMode || review?.sourceIncluded ? "源码增强复盘" : "比赛 AI 复盘"}</span>
            <strong>{contest.contestName}</strong>
          </div>
          <button type="button" aria-label="关闭 AI 复盘" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="ai-review-drawer__body">
          {loading ? (
            <div className="ai-review-state">
              <LoaderCircle size={28} className="is-spinning" />
              <strong>{sourceMode || review?.sourceIncluded ? "正在读取源码并生成增强复盘" : "正在生成比赛复盘"}</strong>
              <span>
                {sourceMode || review?.sourceIncluded
                  ? "按提交时间整理完整时间线，并将源码版本 Diff 随本次请求发送给已配置的 AI。"
                  : "只分析本场比赛摘要、提交统计和本地笔记。"}
              </span>
            </div>
          ) : error ? (
            <div className="ai-review-state is-error">
              <X size={28} />
              <strong>AI 复盘失败</strong>
              <span>{error}</span>
              <button type="button" className="ghost-button" onClick={onRetry}>
                <RefreshCw size={14} />重新分析
              </button>
            </div>
          ) : review ? (
            <>
              <section className="ai-review-summary">
                <span>复盘摘要</span>
                <p>{review.summary || "AI 没有给出总体摘要。"}</p>
                <small>{review.provider} · {review.model}{review.savedAt ? " · 已保存" : ""}</small>
                {review.sourceIncluded ? (
                  <small>
                    源码增强 · 时间线 {review.sourceTimelineCount || review.sourceTimeline?.length || 0} 次 · Diff {review.sourceDiffCount || review.sourceDiffs?.length || 0} 组
                  </small>
                ) : null}
              </section>
              {review.sourceIncluded ? (
                <SourceTimeline timeline={review.sourceTimeline} diffs={review.sourceDiffs} />
              ) : null}
              <section className="ai-review-section">
                <h3>表现较好的地方</h3>
                <ReviewList items={review.strengths} tone="positive" />
              </section>
              <section className="ai-review-section">
                <h3>需要改进的地方</h3>
                <ReviewList items={review.weaknesses} tone="negative" />
              </section>
              {review.timeManagement?.length ? (
                <section className="ai-review-section">
                  <h3>时间管理</h3>
                  <ul className="ai-review-bullets">
                    {review.timeManagement.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                  </ul>
                </section>
              ) : null}
              {review.problemInsights?.length ? (
                <section className="ai-review-section">
                  <h3>逐题观察</h3>
                  <div className="ai-review-problems">
                    {review.problemInsights.map((item, index) => (
                      <article key={`${item.problemKey}-${index}`}>
                        <strong>{item.problemKey || "题目"} · {item.title || "观察"}</strong>
                        {item.observation ? <p>{item.observation}</p> : null}
                        {item.recommendation ? <small>{item.recommendation}</small> : null}
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
              <section className="ai-review-section">
                <h3>下一步行动</h3>
                {review.actions?.length ? (
                  <div className="ai-review-actions">
                    {review.actions.map((item, index) => (
                      <article key={`${item.title}-${index}`}>
                        <span className={`ai-review-priority is-${item.priority}`}>{item.priority}</span>
                        <div>
                          <strong>{item.title}</strong>
                          {item.reason ? <p>{item.reason}</p> : null}
                          {item.problemKeys?.length ? <small>{item.problemKeys.join("、")}</small> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <p className="ai-review-empty">暂无明确行动项</p>}
              </section>
            </>
          ) : null}
        </div>
        {!loading && !error && review ? (
          <footer className="ai-review-drawer__footer">
            <span><CheckCircle2 size={13} />结果仍需你确认</span>
            <div>
              <button type="button" className="ghost-button" onClick={onRetry}>
                <RefreshCw size={14} />重新分析
              </button>
              <button type="button" className="primary-button" onClick={() => onSave(review)}>
                <Save size={14} />保存复盘
              </button>
            </div>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
