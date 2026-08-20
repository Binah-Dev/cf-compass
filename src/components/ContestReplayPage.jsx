import {
  Award,
  BarChart3,
  BookmarkCheck,
  BookmarkPlus,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Medal,
  NotebookPen,
  RefreshCw,
  Search,
  Target,
  Trophy,
  Users,
  X,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { openProblem } from "../lib/codeforces";
import {
  calculateContest,
  CONTEST_FILTERS,
  contestProblemKey,
  formatContestDate,
  formatContestDuration,
  formatPerformance,
  formatSolveTime,
  loadContestReplay,
  matchesContestFilter,
  performanceTone,
  SPECIAL_CONTEST_FILTERS,
} from "../lib/contests";
import { formatNumber, formatPercent, ratingTone } from "../lib/stats";
import { RatingScore } from "./RatingDisplay";

const SORT_OPTIONS = [
  { id: "newest", label: "比赛时间（新 → 旧）" },
  { id: "oldest", label: "比赛时间（旧 → 新）" },
  { id: "performance", label: "表现分从高到低" },
  { id: "rank", label: "实际排名从高到低" },
  { id: "delta", label: "Rating 涨幅从高到低" },
];

function average(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function SummaryMetric({ Icon, label, value, hint, tone = "cyan" }) {
  return (
    <article className={`contest-summary-metric contest-summary-metric--${tone}`}>
      <span className="contest-summary-metric__icon">
        <Icon size={18} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {hint ? <small>{hint}</small> : null}
      </div>
    </article>
  );
}

function ContestResult({ problem }) {
  if (problem.contestResult === "accepted") {
    return (
      <span className="contest-result contest-result--accepted">
        <Check size={13} />
        比赛内 AC
        {problem.firstAcTimeSeconds
          ? ` · ${formatSolveTime(problem.firstAcTimeSeconds)}`
          : ""}
      </span>
    );
  }
  if (problem.contestResult === "attempted") {
    return (
      <span className="contest-result contest-result--attempted">
        <X size={13} />
        尝试未过
      </span>
    );
  }
  return (
    <span className="contest-result contest-result--idle">
      <span />
      比赛时未做
    </span>
  );
}

function CurrentProblemStatus({ status }) {
  if (status === "contest-ac") {
    return (
      <span className="contest-current-status contest-current-status--mastered">
        <CheckCircle2 size={13} />
        比赛内已掌握
      </span>
    );
  }
  if (status === "upsolved") {
    return (
      <span className="contest-current-status contest-current-status--upsolved">
        <CheckCircle2 size={13} />
        赛后已补题
      </span>
    );
  }
  return (
    <span className="contest-current-status contest-current-status--pending">
      <Target size={13} />
      尚未补题
    </span>
  );
}

function ProblemTable({
  contest,
  queuedProblems,
  onToggleQueue,
  onOpenNote,
}) {
  return (
    <section className="contest-problem-table" aria-label={`${contest.contestName} 比赛题目`}>
      <header className="contest-problem-table__header">
        <span>比赛题目</span>
        <span>Rating</span>
        <span>比赛内结果</span>
        <span>提交</span>
        <span>当前状态</span>
        <span>复习操作</span>
      </header>
      <div className="contest-problem-table__body">
        {(contest.problems || []).map((problem) => {
          const key = contestProblemKey(problem);
          const queued = queuedProblems.has(key);
          return (
            <article className="contest-problem-row" key={key}>
              <button
                type="button"
                className="contest-problem-name"
                onClick={() => openProblem(problem)}
              >
                <span>{problem.index}</span>
                <strong>{problem.name}</strong>
              </button>
              <span className={`rating rating--${ratingTone(problem.rating)}`}>
                {problem.rating || "—"}
              </span>
              <ContestResult problem={problem} />
              <span className="contest-attempt-count">
                <strong>{problem.contestAttempts || 0}</strong> 次
              </span>
              <CurrentProblemStatus status={problem.currentStatus} />
              <div className="contest-problem-actions">
                <button type="button" onClick={() => openProblem(problem)}>
                  <ExternalLink size={13} />
                  打开题目
                </button>
                <button
                  type="button"
                  className={queued ? "is-active" : ""}
                  onClick={() => onToggleQueue(problem)}
                >
                  {queued ? <BookmarkCheck size={13} /> : <BookmarkPlus size={13} />}
                  {queued ? "已加入" : "加入复习"}
                </button>
                <button type="button" onClick={() => onOpenNote(problem)}>
                  <NotebookPen size={13} />
                  笔记
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ContestDetail({
  contest,
  queuedProblems,
  onToggleQueue,
  onOpenNote,
}) {
  return (
    <div className="contest-detail">
      <div className="contest-detail-metrics">
        <div>
          <Clock3 size={17} />
          <span>比赛时长</span>
          <strong>{formatContestDuration(contest.durationSeconds)}</strong>
        </div>
        <div>
          <BarChart3 size={17} />
          <span>赛前 Rating</span>
          <strong><RatingScore value={contest.oldRating} /></strong>
        </div>
        <div>
          <Award size={17} />
          <span>赛后 Rating</span>
          <strong><RatingScore value={contest.newRating} /></strong>
        </div>
        <div>
          <Medal size={17} />
          <span>Rating 变化</span>
          <strong className={contest.ratingDelta >= 0 ? "is-positive" : "is-negative"}>
            {contest.ratingDelta > 0 ? "+" : ""}
            {contest.ratingDelta}
          </strong>
        </div>
        <div>
          <CheckCircle2 size={17} />
          <span>比赛通过</span>
          <strong>
            {contest.solved} / {contest.totalProblems}
          </strong>
        </div>
      </div>
      <ProblemTable
        contest={contest}
        queuedProblems={queuedProblems}
        onToggleQueue={onToggleQueue}
        onOpenNote={onOpenNote}
      />
      <footer className="contest-detail-source">
        <span>表现分由 Carrot Plus 算法计算，通常与精确值相差 0～4 分。</span>
        <span>官方排名：第 {formatNumber(contest.officialRank)} 名</span>
      </footer>
    </div>
  );
}

function ContestRow({
  contest,
  expanded,
  calculating,
  queuedProblems,
  onToggle,
  onRetry,
  onToggleQueue,
  onOpenNote,
}) {
  const tone = performanceTone(contest.performance);
  const ready = contest.status === "ready";
  const performanceLabel = ready
    ? formatPerformance(contest.performance)
    : contest.status === "error"
      ? "计算失败"
      : "待计算";
  return (
    <article
      className={`contest-record performance-tone-${tone} ${
        expanded ? "is-expanded" : ""
      }`}
    >
      <button
        type="button"
        className="contest-record__row"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <time>{formatContestDate(contest.dateSeconds)}</time>
        <span className="contest-record__title">
          <strong>{contest.contestName}</strong>
          <small>{contest.category?.label || "Rated"}</small>
        </span>
        <span className="contest-division">{contest.category?.label || "Rated"}</span>
        <span className="contest-performance">
          <small>Carrot 表现分</small>
          <strong>{performanceLabel}</strong>
        </span>
        <span className="contest-rank">
          <small>实际排名</small>
          <strong>
            {ready ? formatNumber(contest.officialRank) : "—"}
          </strong>
          <span>{ready ? `/ ${formatNumber(contest.participants)}` : ""}</span>
        </span>
        <span
          className={`contest-delta ${
            contest.ratingDelta >= 0 ? "is-positive" : "is-negative"
          }`}
        >
          {contest.ratingDelta > 0 ? "+" : ""}
          {contest.ratingDelta}
        </span>
        <span className="contest-solved">
          {ready ? `${contest.solved} / ${contest.totalProblems}` : "—"}
        </span>
        <span className="contest-record__chevron">
          {calculating ? (
            <LoaderCircle size={16} className="is-spinning" />
          ) : expanded ? (
            <ChevronDown size={16} />
          ) : (
            <ChevronRight size={16} />
          )}
        </span>
      </button>
      {expanded ? (
        ready ? (
          <ContestDetail
            contest={contest}
            queuedProblems={queuedProblems}
            onToggleQueue={onToggleQueue}
            onOpenNote={onOpenNote}
          />
        ) : (
          <div className="contest-detail-loading">
            {calculating ? (
              <>
                <LoaderCircle size={22} className="is-spinning" />
                <strong>正在计算本场 Carrot 表现分</strong>
                <span>正在获取完整榜单与官方 Rating 变化，请稍候。</span>
              </>
            ) : (
              <>
                <RefreshCw size={22} />
                <strong>{contest.error || "本场数据尚未计算"}</strong>
                <button type="button" onClick={onRetry}>
                  重新计算
                </button>
              </>
            )}
          </div>
        )
      ) : null}
    </article>
  );
}

export default function ContestReplayPage({
  data,
  studyData,
  onStudyChange,
  onOpenNote,
  onToast,
}) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [specialFilter, setSpecialFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [expandedId, setExpandedId] = useState(null);
  const [calculatingId, setCalculatingId] = useState(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadContestReplay(data)
      .then((next) => {
        if (!alive) return;
        setHistory(next);
        setExpandedId(
          next?.contests?.find((contest) => contest.status === "ready")?.contestId ||
            next?.contests?.[0]?.contestId ||
            null,
        );
      })
      .catch((error) => {
        if (alive) onToast?.("error", error.message || "赛事复盘数据加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [data?.handle, data?.ratingHistory?.length, data?.syncedAt, data?.isDemo]);

  useEffect(() => {
    if (data?.isDemo || !history?.progress?.autoRemaining) {
      return undefined;
    }
    let alive = true;
    const timeout = window.setTimeout(async () => {
      try {
        const next = await loadContestReplay(data);
        if (alive && next) setHistory(next);
      } catch (error) {
        if (alive) onToast?.("error", error.message || "自动计算进度读取失败");
      }
    }, 1200);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, [
    data?.handle,
    data?.isDemo,
    history?.progress?.autoRemaining,
    history?.progress?.completed,
    history?.progress?.failed,
    history?.syncedAt,
  ]);

  const queuedProblems = useMemo(
    () => new Set(studyData?.contestQueue || []),
    [studyData?.contestQueue],
  );

  const visibleContests = useMemo(() => {
    const result = [];
    for (const contest of history?.contests || []) {
      if (!matchesContestFilter(contest, filter, specialFilter)) continue;
      if (
        deferredSearch &&
        !`${contest.contestId} ${contest.contestName} ${contest.category?.label || ""}`
          .toLowerCase()
          .includes(deferredSearch)
      ) {
        continue;
      }
      result.push(contest);
    }
    result.sort((first, second) => {
      if (sort === "oldest") return first.dateSeconds - second.dateSeconds;
      if (sort === "performance") {
        return (
          (second.performance === "Infinity" ? 10000 : Number(second.performance) || -10000) -
          (first.performance === "Infinity" ? 10000 : Number(first.performance) || -10000)
        );
      }
      if (sort === "rank") {
        return (
          (first.officialRank || Number.POSITIVE_INFINITY) -
          (second.officialRank || Number.POSITIVE_INFINITY)
        );
      }
      if (sort === "delta") return second.ratingDelta - first.ratingDelta;
      return second.dateSeconds - first.dateSeconds;
    });
    return result;
  }, [history?.contests, filter, specialFilter, deferredSearch, sort]);

  const summary = useMemo(() => {
    const ready = (history?.contests || []).filter(
      (contest) => contest.status === "ready",
    );
    const numericPerformances = ready
      .map((contest) =>
        contest.performance === "Infinity" ? 6000 : Number(contest.performance),
      )
      .filter(Number.isFinite);
    const best = ready
      .filter((contest) => contest.performance === "Infinity" || Number.isFinite(Number(contest.performance)))
      .sort(
        (first, second) =>
          (second.performance === "Infinity" ? 10000 : Number(second.performance)) -
          (first.performance === "Infinity" ? 10000 : Number(first.performance)),
      )[0];
    const averageRankPercent = average(
      ready
        .filter((contest) => contest.officialRank && contest.participants)
        .map((contest) => (contest.officialRank / contest.participants) * 100),
    );
    return {
      averagePerformance: average(numericPerformances),
      best,
      averageRankPercent,
    };
  }, [history?.contests]);

  async function toggleContest(contest) {
    setExpandedId((current) =>
      Number(current) === Number(contest.contestId) ? null : contest.contestId,
    );
    if (data?.isDemo || contest.status === "ready" || calculatingId) return;
    setCalculatingId(contest.contestId);
    try {
      const next = await calculateContest(
        contest.contestId,
        contest.status === "error",
      );
      if (next) setHistory(next);
    } catch (error) {
      onToast?.("error", error.message || "比赛数据计算失败");
    } finally {
      setCalculatingId(null);
    }
  }

  async function retryContest(contest) {
    if (data?.isDemo || calculatingId) return;
    setCalculatingId(contest.contestId);
    try {
      const next = await calculateContest(contest.contestId, true);
      if (next) setHistory(next);
    } catch (error) {
      onToast?.("error", error.message || "比赛数据重新计算失败");
    } finally {
      setCalculatingId(null);
    }
  }

  function toggleQueue(problem) {
    const key = contestProblemKey(problem);
    const current = new Set(studyData?.contestQueue || []);
    const removing = current.has(key);
    removing ? current.delete(key) : current.add(key);
    onStudyChange(
      { ...studyData, contestQueue: [...current] },
      removing ? "已移出赛事复习队列" : "已加入赛事复习队列",
    );
  }

  if (loading || !history) {
    return (
      <section className="contest-replay-loading">
        <LoaderCircle size={26} className="is-spinning" />
        <strong>正在读取有效参赛记录</strong>
        <span>同步官方 Rating 历史与本地复盘缓存。</span>
      </section>
    );
  }

  return (
    <section className="contest-replay-page">
      <section className="contest-summary-strip" aria-label="赛事复盘概览">
        <SummaryMetric
          Icon={Trophy}
          label="有效参赛"
          value={formatNumber(history.contests.length)}
          hint="仅统计官方 Rated 记录"
          tone="green"
        />
        <SummaryMetric
          Icon={BarChart3}
          label="平均表现分"
          value={
            summary.averagePerformance == null
              ? "—"
              : (
                <RatingScore value={Math.round(summary.averagePerformance)} />
                )
          }
          hint="Carrot Plus 计算"
        />
        <SummaryMetric
          Icon={Award}
          label="最佳表现"
          value={
            summary.best ? (
              <RatingScore
                value={summary.best.performance}
                tone={performanceTone(summary.best.performance)}
              >
                {formatPerformance(summary.best.performance)}
              </RatingScore>
            ) : "—"
          }
          hint={summary.best ? formatContestDate(summary.best.dateSeconds) : "等待计算"}
          tone="amber"
        />
        <SummaryMetric
          Icon={Users}
          label="平均排名"
          value={
            summary.averageRankPercent == null
              ? "—"
              : `Top ${formatPercent(summary.averageRankPercent)}`
          }
          hint="按每场 Rated 人数归一化"
          tone="violet"
        />
      </section>

      <section className="contest-replay-board">
        <div className="contest-replay-toolbar">
          <div className="contest-filter-tabs" role="tablist" aria-label="比赛类型筛选">
            {CONTEST_FILTERS.map((option) => (
              <button
                type="button"
                role="tab"
                aria-selected={filter === option.id}
                className={filter === option.id ? "is-active" : ""}
                key={option.id}
                onClick={() => setFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="contest-search">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索比赛名称或编号"
            />
          </label>
          <label className="contest-sort">
            <CalendarDays size={15} />
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              {SORT_OPTIONS.map((option) => (
                <option value={option.id} key={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="contest-sync-progress">
            <span>
              {history.progress.autoRemaining
                ? `自动计算 ${history.progress.processed}/${history.progress.total}${
                    history.progress.failed
                      ? ` · ${history.progress.failed} 场重试中`
                      : ""
                  }`
                : history.progress.failed
                  ? `${history.progress.completed}/${history.progress.total} 已完成 · ${history.progress.failed} 场需重试`
                  : "表现分已自动同步"}
            </span>
            <i>
              <b style={{ width: `${history.progress.percent}%` }} />
            </i>
          </div>
        </div>

        {filter === "special" ? (
          <div className="special-contest-filters">
            {SPECIAL_CONTEST_FILTERS.map((option) => (
              <button
                type="button"
                className={specialFilter === option.id ? "is-active" : ""}
                key={option.id}
                onClick={() => setSpecialFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        <header className="contest-list-header">
          <span>日期</span>
          <span>比赛名称</span>
          <span>类型</span>
          <span>Carrot 表现分</span>
          <span>实际排名</span>
          <span>Rating 变化</span>
          <span>通过</span>
          <span />
        </header>

        <div className="contest-record-list">
          {visibleContests.length ? (
            visibleContests.map((contest) => (
              <ContestRow
                key={contest.contestId}
                contest={contest}
                expanded={Number(expandedId) === Number(contest.contestId)}
                calculating={Number(calculatingId) === Number(contest.contestId)}
                queuedProblems={queuedProblems}
                onToggle={() => toggleContest(contest)}
                onRetry={() => retryContest(contest)}
                onToggleQueue={toggleQueue}
                onOpenNote={onOpenNote}
              />
            ))
          ) : (
            <div className="contest-replay-empty">
              <Search size={24} />
              <strong>当前筛选下没有有效参赛记录</strong>
              <span>可以切换 Div 类型、特殊比赛分类或搜索关键词。</span>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
