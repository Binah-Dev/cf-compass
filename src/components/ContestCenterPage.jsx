import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  ExternalLink,
  FilterX,
  Flame,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { openProblem, problemKey } from "../lib/codeforces";
import { getCurrentLocale } from "../i18n";
import {
  formatContestCenterDate,
  formatContestCenterDuration,
  loadContestCenter,
  loadContestCenterDetail,
  openContestPage,
} from "../lib/contest-center";
import { RatingScore } from "./RatingDisplay";
import PlanQueueButton from "./PlanQueueButton";

const PAGE_SIZE = 50;
const QUICK_FILTERS = [
  ["all", "全部场次"],
  ["suitable", "适合当前水平"],
  ["participated", "我参加过"],
  ["upsolve", "待补题"],
  ["upcoming", "即将开始"],
];
const TYPE_FILTERS = [
  ["all", "全部类型"],
  ["div1", "Div.1"],
  ["div2", "Div.2"],
  ["div3", "Div.3"],
  ["div4", "Div.4"],
  ["educational", "Educational"],
  ["global", "Global"],
  ["icpc", "ICPC / 区域赛"],
  ["special", "其他特殊"],
];

function contestProblemKey(contestId, index) {
  return `${Number(contestId)}-${String(index)}`;
}

function contestMatchesRating(contest, rating) {
  const divisions = contest.category?.divisions || [];
  const special = contest.category?.special;
  if (special === "educational") return rating >= 1100 && rating <= 2100;
  if (special === "global") return rating >= 1500;
  if (rating < 1200) return divisions.some((division) => division === 3 || division === 4);
  if (rating < 1600) return divisions.some((division) => division === 2 || division === 3);
  if (rating < 2000) return divisions.includes(2) || special === "educational";
  return divisions.includes(1) || (divisions.includes(1) && divisions.includes(2)) || special === "global";
}

function matchesType(contest, type) {
  if (type === "all") return true;
  if (/^div[1-4]$/.test(type)) {
    return contest.category?.divisions?.includes(Number(type.slice(-1)));
  }
  if (["educational", "global", "icpc"].includes(type)) {
    return contest.category?.special === type;
  }
  return contest.category?.special === "other";
}

function phaseMeta(contest) {
  if (contest.phaseGroup === "upcoming") return ["即将开始", "upcoming"];
  if (contest.phaseGroup === "running") return ["进行中", "running"];
  return ["已结束", "finished"];
}

function recommendationFor(contest, context) {
  const participated = context.participatedIds.has(contest.id) || contest.demoParticipation;
  const knownProblems = context.problemsByContest.get(contest.id) || [];
  const solved = new Set(contest.demoSolved || []);
  for (const problem of knownProblems) {
    if (context.submissionMap.get(problemKey(problem))?.accepted) solved.add(problem.index);
  }
  const unfinished = participated && knownProblems.length > 0 && solved.size < knownProblems.length;
  const suitable = contestMatchesRating(contest, context.rating) || contest.demoRecommended;
  if (unfinished) return { key: "upsolve", label: "优先补题", reason: `还有 ${knownProblems.length - solved.size} 题未掌握`, score: 100 };
  if (contest.phaseGroup === "running" && suitable) return { key: "live", label: "正在进行", reason: "难度与你当前水平匹配", score: 96 };
  if (contest.phaseGroup === "upcoming" && suitable) return { key: "register", label: "建议报名", reason: "适合作为下一场正式训练", score: 92 };
  if (participated && knownProblems.length && solved.size >= knownProblems.length) {
    return { key: "complete", label: "已完成", reason: `已通过 ${solved.size}/${knownProblems.length}`, score: 54 };
  }
  if (suitable && !participated) return { key: "suitable", label: "适合当前水平", reason: "建议作为虚拟参赛训练", score: 82 };
  if (participated) return { key: "history", label: "参赛记录", reason: "可展开回看本场题目", score: 68 };
  return { key: "practice", label: "可供训练", reason: "按需加入你的补题队列", score: 30 };
}

function StatCard({ icon: Icon, tone, label, value, detail }) {
  return (
    <article className={`contest-center-stat contest-center-stat--${tone}`}>
      <span className="contest-center-stat__icon"><Icon size={21} /></span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </span>
    </article>
  );
}

function SelectField({ value, onChange, label, children }) {
  return (
    <label className="contest-center-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      <ChevronDown size={15} aria-hidden="true" />
    </label>
  );
}

function ProblemStrip({ contest, problems, submissionMap, onAddQueue, queueSet, plannedKeys, onAddToPlan }) {
  if (!problems.length) {
    return <div className="contest-center-problems__empty">该场次暂未返回题目数据，请稍后重试。</div>;
  }
  return (
    <div className="contest-center-problems">
      <div className="contest-center-problems__grid">
        {problems.map((problem) => {
          const state = submissionMap.get(problemKey(problem));
          const demoSolved = contest.demoSolved?.includes(problem.index);
          const solved = demoSolved || state?.accepted;
          const attempted = !solved && Boolean(state?.attempts);
          return (
            <div className="contest-problem-wrap" key={contestProblemKey(contest.id, problem.index)}>
            <button
              className={`contest-problem ${solved ? "is-solved" : attempted ? "is-attempted" : ""}`}
              type="button"
              onClick={() => openProblem(problem)}
              title={`打开 ${problem.index}. ${problem.name}`}
            >
              <span className="contest-problem__index">{problem.index}</span>
              <span className="contest-problem__body">
                <strong>{problem.name}</strong>
                <small>{solved ? "已通过" : attempted ? "尝试过" : "尚未练习"}</small>
              </span>
              <RatingScore value={problem.rating} fallback="未定级" />
              <ExternalLink size={14} />
            </button>
            <PlanQueueButton problem={problem} plannedKeys={plannedKeys} onAddToPlan={onAddToPlan} compact />
            </div>
          );
        })}
      </div>
      <div className="contest-center-problems__actions">
        <button type="button" onClick={() => openContestPage(contest.id)}><ExternalLink size={15} />打开比赛</button>
        <button type="button" onClick={() => openContestPage(contest.id)}><Play size={15} />虚拟参赛</button>
        <button
          className="is-primary"
          type="button"
          onClick={() => onAddQueue(problems)}
          disabled={problems.every((problem) => queueSet.has(problemKey(problem)))}
        >
          <Target size={15} />加入补题
        </button>
      </div>
    </div>
  );
}

function ContestRow({
  contest,
  detail,
  expanded,
  loadingDetail,
  recommendation,
  participated,
  solvedCount,
  problemCount,
  submissionMap,
  queueSet,
  onToggle,
  onAddQueue,
  plannedKeys,
  onAddToPlan,
}) {
  const [phaseLabel, phaseTone] = phaseMeta(contest);
  const participantText = detail?.participantCount
    ? Number(detail.participantCount).toLocaleString(getCurrentLocale())
    : "—";
  const progressText = participated
    ? problemCount
      ? `${solvedCount}/${problemCount}`
      : "参加过"
    : "未参加";
  return (
    <article className={`contest-center-row ${expanded ? "is-expanded" : ""}`}>
      <button className="contest-center-row__summary" type="button" onClick={onToggle} aria-expanded={expanded}>
        <span className="contest-center-row__date">
          <strong>{formatContestCenterDate(contest.startTimeSeconds)}</strong>
          <em className={`contest-phase contest-phase--${phaseTone}`}><CircleDot size={11} />{phaseLabel}</em>
        </span>
        <span className="contest-center-row__name">
          <strong>{contest.name}</strong>
          <small>#{contest.id}{contest.isRated ? " · Rated" : " · 官方场次"}</small>
        </span>
        <span className="contest-center-row__type">{contest.category?.label || "特殊类型"}</span>
        <span className="contest-center-row__metric"><Clock3 size={14} />{formatContestCenterDuration(contest.durationSeconds)}</span>
        <span className="contest-center-row__metric"><Users size={14} />{participantText}</span>
        <span className={`contest-center-row__progress ${participated ? "is-participated" : ""}`}>{progressText}</span>
        <span className={`contest-recommendation contest-recommendation--${recommendation.key}`}>
          <strong>{recommendation.label}</strong>
          <small>{recommendation.reason}</small>
        </span>
        <ChevronDown className="contest-center-row__chevron" size={19} />
      </button>
      {expanded ? (
        <div className="contest-center-row__detail">
          {loadingDetail ? (
            <div className="contest-center-detail-loading"><LoaderCircle size={18} />正在获取本场题目与参赛规模…</div>
          ) : (
            <ProblemStrip
              contest={contest}
              problems={detail?.problems || []}
              submissionMap={submissionMap}
              queueSet={queueSet}
              onAddQueue={onAddQueue}
              plannedKeys={plannedKeys}
              onAddToPlan={onAddToPlan}
            />
          )}
        </div>
      ) : null}
    </article>
  );
}

export default function ContestCenterPage({ data, studyData, onStudyChange, onToast, plannedKeys, onAddToPlan }) {
  const [center, setCenter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [participationFilter, setParticipationFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  async function refresh(force = false) {
    force ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const next = await loadContestCenter(data, force);
      setCenter(next);
      if (next.warning) onToast?.("warning", next.warning);
      if (force) onToast?.("success", "场次列表已更新");
    } catch (refreshError) {
      setError(refreshError.message || "场次列表加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadContestCenter(data)
      .then((next) => active && setCenter(next))
      .catch((loadError) => active && setError(loadError.message || "场次列表加载失败"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [data?.handle, data?.isDemo]);

  const problemsByContest = useMemo(() => {
    const map = new Map();
    for (const problem of data?.problems || []) {
      const contestId = Number(problem.contestId);
      if (!contestId) continue;
      if (!map.has(contestId)) map.set(contestId, []);
      map.get(contestId).push(problem);
    }
    for (const problems of map.values()) problems.sort((a, b) => String(a.index).localeCompare(String(b.index)));
    return map;
  }, [data?.problems]);

  const submissionMap = useMemo(() => {
    const map = new Map();
    for (const submission of data?.submissions || []) {
      const problem = submission.problem;
      if (!problem?.contestId || !problem?.index) continue;
      const key = problemKey(problem);
      const previous = map.get(key) || { attempts: 0, accepted: false };
      previous.attempts += 1;
      previous.accepted ||= submission.verdict === "OK";
      map.set(key, previous);
    }
    return map;
  }, [data?.submissions]);

  const participatedIds = useMemo(() => {
    const ids = new Set((data?.ratingHistory || []).map((entry) => Number(entry.contestId)));
    for (const submission of data?.submissions || []) {
      if (submission?.author?.participantType === "CONTESTANT") {
        const contestId = Number(submission.problem?.contestId || submission.contestId);
        if (contestId) ids.add(contestId);
      }
    }
    return ids;
  }, [data?.ratingHistory, data?.submissions]);

  const queueSet = useMemo(() => new Set(studyData?.contestQueue || []), [studyData?.contestQueue]);
  const context = useMemo(() => ({
    rating: Number(data?.user?.rating) || 1200,
    participatedIds,
    problemsByContest,
    submissionMap,
  }), [data?.user?.rating, participatedIds, problemsByContest, submissionMap]);

  const enriched = useMemo(() => (center?.contests || []).map((contest) => {
    const localProblems = problemsByContest.get(contest.id) || [];
    const storedDetail = center?.details?.[contest.id];
    const detail = storedDetail?.problems?.length ? storedDetail : { problems: localProblems, participantCount: null };
    const participated = participatedIds.has(contest.id) || contest.demoParticipation;
    const solvedCount = detail.problems.reduce((count, problem) => (
      count + (contest.demoSolved?.includes(problem.index) || submissionMap.get(problemKey(problem))?.accepted ? 1 : 0)
    ), 0);
    return {
      contest,
      detail,
      participated,
      solvedCount,
      problemCount: detail.problems.length,
      recommendation: recommendationFor(contest, context),
    };
  }), [center, context, participatedIds, problemsByContest, submissionMap]);

  const stats = useMemo(() => ({
    total: enriched.length,
    suitable: enriched.filter((item) => item.recommendation.key === "suitable" || item.recommendation.key === "register" || item.recommendation.key === "live").length,
    participated: enriched.filter((item) => item.participated).length,
    upsolve: enriched.filter((item) => item.recommendation.key === "upsolve").length,
  }), [enriched]);

  const filtered = useMemo(() => {
    const result = enriched.filter((item) => {
      const { contest, recommendation, participated } = item;
      if (deferredSearch && !`${contest.id} ${contest.name}`.toLowerCase().includes(deferredSearch)) return false;
      if (!matchesType(contest, typeFilter)) return false;
      if (statusFilter !== "all" && contest.phaseGroup !== statusFilter) return false;
      if (participationFilter === "joined" && !participated) return false;
      if (participationFilter === "notJoined" && participated) return false;
      if (quickFilter === "suitable" && !["suitable", "register", "live"].includes(recommendation.key)) return false;
      if (quickFilter === "participated" && !participated) return false;
      if (quickFilter === "upsolve" && recommendation.key !== "upsolve") return false;
      if (quickFilter === "upcoming" && contest.phaseGroup !== "upcoming") return false;
      return true;
    });
    return result.sort((first, second) => {
      if (sort === "oldest") return first.contest.startTimeSeconds - second.contest.startTimeSeconds;
      if (sort === "recommended") return second.recommendation.score - first.recommendation.score || second.contest.startTimeSeconds - first.contest.startTimeSeconds;
      return second.contest.startTimeSeconds - first.contest.startTimeSeconds;
    });
  }, [enriched, deferredSearch, typeFilter, statusFilter, participationFilter, quickFilter, sort]);

  useEffect(() => { setPage(1); }, [deferredSearch, typeFilter, statusFilter, participationFilter, quickFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function toggleContest(item) {
    if (expandedId === item.contest.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.contest.id);
    if (item.detail?.problems?.length) return;
    setLoadingDetailId(item.contest.id);
    try {
      const detail = await loadContestCenterDetail(item.contest.id, data);
      setCenter((current) => ({
        ...current,
        details: { ...(current?.details || {}), [item.contest.id]: detail },
      }));
    } catch (detailError) {
      onToast?.("error", detailError.message || "比赛详情加载失败");
    } finally {
      setLoadingDetailId(null);
    }
  }

  function addToQueue(problems) {
    const unsolved = problems.filter((problem) => !submissionMap.get(problemKey(problem))?.accepted);
    const nextQueue = [...new Set([...(studyData?.contestQueue || []), ...unsolved.map(problemKey)])];
    if (nextQueue.length === (studyData?.contestQueue || []).length) {
      onToast?.("info", "这些题已经在补题队列中");
      return;
    }
    onStudyChange({ ...studyData, contestQueue: nextQueue }, `已加入 ${nextQueue.length - (studyData?.contestQueue || []).length} 道待补题`);
  }

  function resetFilters() {
    startTransition(() => {
      setQuickFilter("all");
      setTypeFilter("all");
      setStatusFilter("all");
      setParticipationFilter("all");
      setSort("newest");
      setSearch("");
    });
  }

  if (loading) {
    return <section className="contest-center-state"><LoaderCircle size={28} /><strong>正在整理全部 Codeforces 场次</strong><span>首次加载后会在本地缓存 30 分钟</span></section>;
  }
  if (error && !center) {
    return <section className="contest-center-state is-error"><Trophy size={30} /><strong>赛事中心加载失败</strong><span>{error}</span><button type="button" onClick={() => refresh(true)}>重新获取</button></section>;
  }

  return (
    <section className="contest-center-page">
      <div className="contest-center-stats">
        <StatCard icon={Trophy} tone="sky" label="官方场次" value={stats.total.toLocaleString(getCurrentLocale())} detail="全量 contest.list" />
        <StatCard icon={Sparkles} tone="mint" label="适合当前水平" value={stats.suitable.toLocaleString(getCurrentLocale())} detail={`按 Rating ${context.rating} 匹配`} />
        <StatCard icon={CheckCircle2} tone="violet" label="我参加过" value={stats.participated.toLocaleString(getCurrentLocale())} detail="Rated 与正式参赛" />
        <StatCard icon={Flame} tone="amber" label="待补题场次" value={stats.upsolve.toLocaleString(getCurrentLocale())} detail="优先补齐训练缺口" />
      </div>

      <div className="contest-center-shell">
        <header className="contest-center-intro">
          <div>
            <span className="section-kicker">CONTEST NAVIGATOR</span>
            <h2>从全部场次里，找到下一场值得打的比赛</h2>
            <p>按你的 Rating、参赛记录和补题进度自动排序；默认始终优先展示最新场次。</p>
          </div>
          <div className="contest-center-sync">
            <span><span className="status-dot" />{center?.stale ? "使用本地缓存" : "已连接官方场次列表"}</span>
            <small>更新于 {center?.syncedAt ? new Date(center.syncedAt).toLocaleString(getCurrentLocale(), { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</small>
            <button type="button" onClick={() => refresh(true)} disabled={refreshing}><RefreshCw size={16} />{refreshing ? "更新中" : "更新场次"}</button>
          </div>
        </header>

        <div className="contest-center-quick" aria-label="快速筛选">
          {QUICK_FILTERS.map(([value, label]) => (
            <button key={value} type="button" className={quickFilter === value ? "is-active" : ""} onClick={() => setQuickFilter(value)}>{label}</button>
          ))}
        </div>

        <div className="contest-center-toolbar">
          <label className="contest-center-search">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索比赛名称或编号" />
            <kbd>Ctrl K</kbd>
          </label>
          <SelectField label="类型" value={typeFilter} onChange={setTypeFilter}>
            {TYPE_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectField>
          <SelectField label="状态" value={statusFilter} onChange={setStatusFilter}>
            <option value="all">全部状态</option><option value="upcoming">即将开始</option><option value="running">进行中</option><option value="finished">已结束</option>
          </SelectField>
          <SelectField label="参赛" value={participationFilter} onChange={setParticipationFilter}>
            <option value="all">全部记录</option><option value="joined">我参加过</option><option value="notJoined">未参加</option>
          </SelectField>
          <SelectField label="排序" value={sort} onChange={setSort}>
            <option value="newest">比赛时间（新 → 旧）</option><option value="oldest">比赛时间（旧 → 新）</option><option value="recommended">智能推荐优先</option>
          </SelectField>
          <button className="contest-center-reset" type="button" onClick={resetFilters} title="重置筛选"><FilterX size={17} /></button>
        </div>

        <div className="contest-center-table-head" aria-hidden="true">
          <span>时间 / 状态</span><span>比赛名称</span><span>类型</span><span>时长</span><span>参赛规模</span><span>我的进度</span><span>智能建议</span><span />
        </div>
        <div className="contest-center-list">
          {visible.length ? visible.map((item) => (
            <ContestRow
              key={item.contest.id}
              {...item}
              expanded={expandedId === item.contest.id}
              loadingDetail={loadingDetailId === item.contest.id}
              submissionMap={submissionMap}
              queueSet={queueSet}
              onToggle={() => toggleContest(item)}
              onAddQueue={addToQueue}
              plannedKeys={plannedKeys}
              onAddToPlan={onAddToPlan}
            />
          )) : (
            <div className="contest-center-empty"><Search size={27} /><strong>没有匹配的场次</strong><span>放宽类型、状态或搜索条件后再试试</span><button type="button" onClick={resetFilters}>清空筛选</button></div>
          )}
        </div>
        <footer className="contest-center-pagination">
          <span>找到 <strong>{filtered.length.toLocaleString(getCurrentLocale())}</strong> 场 · 每页 {PAGE_SIZE} 场</span>
          <div>
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={17} /></button>
            <strong>{page}</strong><span>/ {pageCount}</span>
            <button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><ChevronRight size={17} /></button>
          </div>
        </footer>
      </div>
    </section>
  );
}
