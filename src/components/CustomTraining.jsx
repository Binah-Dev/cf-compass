import { ArrowDown, ArrowUp, Check, Clock3, ExternalLink, ListPlus, LoaderCircle, NotebookPen, Play, Plus, RefreshCw, Save, Search, Target, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { customTrainingMessages } from "../i18n/en-US";
import { openProblem, problemKey } from "../lib/codeforces";
import { displayTag, ratingTone } from "../lib/stats";
import { cancelTrainingSession, finishTrainingSession, getTrainingSessions, saveTrainingDraft, startTrainingSession, syncTrainingSession } from "../lib/custom-training";
import { summarizeTrainingSession, TRAINING_MAX_PROBLEMS } from "../lib/training-session-model.mjs";
import "../custom-training.css";

const PAGE_SIZE = 40;
const CHINESE = {
  title: "自定义训练赛", intro: "从题库、收藏或目标题单组一场自己的训练。结果独立保存在本地，不计入官方或综合估计 Rating。",
  newSession: "新建训练", history: "训练历史", newDraft: "新草稿", draft: "草稿", running: "进行中", finished: "已结束", cancelled: "已取消",
  sessionTitle: "训练名称", titlePlaceholder: "例如：周末综合训练", duration: "时长（分钟）", durationHint: "1–1440 分钟", hideTags: "隐藏算法标签", hideRating: "隐藏难度 Rating",
  visibilityHint: "隐藏仅作用于应用内，Codeforces原站显示不受影响", reviewVisibility: "复盘信息", revealTags: "展开标签", concealTags: "收起标签", revealRating: "展开难度", concealRating: "收起难度",
  source: "选题来源", all: "全部题库", favorites: "我的收藏", plan: "待做目标题单", search: "搜索完整题号或题名", selected: "本场题目", selectedCount: "已选择 {count} 题", matches: "找到 {count} 题",
  add: "加入训练", picked: "已选择", remove: "移除 {key}", up: "将 {key} 上移", down: "将 {key} 下移", previous: "上一页", next: "下一页", page: "第 {page} / {total} 页",
  emptyPool: "没有匹配的题目，请更换来源或搜索条件。", emptySelected: "从左侧选择题目，再用箭头调整顺序。", limitHint: "每场最多选择 {count} 道题；移除一道后可继续选择。", save: "保存草稿", start: "开始训练", saving: "处理中…", saved: "训练草稿已保存", started: "训练已开始，题目和配置已锁定",
  needAccount: "请先同步你的 Codeforces 账号，再开始训练。", currentAccount: "当前账号：{handle}", sessionAccount: "本场账号：{handle}", switched: "当前账号与本场账号不同。自动同步已暂停；切回 {handle} 后可继续同步。",
  locked: "本场题目、顺序、时长和隐藏设置已锁定。请在 Codeforces 原站提交；仅统计本场账号在时间窗口内对这些题目的单人 PRACTICE 提交。",
  countdown: "剩余时间", elapsed: "本场用时", deadline: "截止时间", sync: "同步提交", syncing: "正在同步…", autoSync: "每 30 秒自动同步；断网后可手动补同步。", syncStopped: "本场已结束。可再次同步，补齐截止前提交但稍后判出的结果。", lastSync: "上次同步：{time}", neverSync: "尚未同步提交", finish: "结束训练", cancel: "取消训练", cancelPrompt: "取消会停止本场计时，保留题单与提交历史。", confirmCancel: "确认取消并保留历史", keepRunning: "继续训练", ended: "训练已结束", cancelledNotice: "训练已取消，历史已保留",
  unattempted: "未尝试", pending: "判题中", wrong: "未通过", accepted: "已通过", priorAccepted: "已有通过记录", priorAttempts: "已有 {count} 次提交记录", noPrior: "没有已缓存的提交记录", priorHint: "开始前的已有记录仅作提示，不计入本场成绩。",
  open: "在 Codeforces 打开 {key}", note: "复盘笔记", upsolve: "加入待补题", inPlan: "已在目标题单", summary: "本场总结", solved: "通过题数", firstAc: "首次 AC 用时", wrongAttempts: "错误尝试", pendingCount: "判题中提交", upsolveCount: "待补题：{count} 题", firstAcProblem: "首次 AC：{time}", wrongProblem: "错误尝试：{count}", attempts: "本场提交：{count}", noAc: "尚无 AC", pendingHint: "有提交仍在判题，结束后继续同步可更新总结。", noUpsolve: "本场题目全部通过。", cancelledSummary: "已取消的会话仅保留记录，不作为正式训练完成。", loading: "正在读取本地训练…", loadFailed: "读取训练会话失败", actionFailed: "训练操作失败", retry: "重试", configuration: "选题与配置", syncError: "同步失败：{message}", unnamed: "未命名训练", selectedUnavailable: "部分所选题目当前不在题库中，请重新同步题库或移除后重选。", invalidDuration: "请填写 1–1440 的整数分钟时长。", noSelection: "请至少选择一道题。",
};

function keyOf(problem) { return problem?.key || problem?.problemKey || problemKey(problem); }
function clock(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return "—";
  const safe = Math.max(0, Math.floor(Number(seconds)));
  const hours = Math.floor(safe / 3600);
  return `${String(hours).padStart(2, "0")}:${String(Math.floor(safe % 3600 / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
function normalizedHandle(value) { return String(value || "").trim().toLowerCase(); }
const ERROR_CHINESE = [
  ["This training store version is unsupported.", "训练会话存储版本不受支持。"],
  ["Sync a Codeforces account before creating a training.", "请先同步你的 Codeforces 账号，再创建训练。"],
  ["Select between 1 and 100 different valid problems.", "请选择 1–100 道不同的有效题目。"],
  ["Training duration must be between 1 minute and 24 hours.", "训练时长须为 1 分钟至 24 小时。"],
  ["Training clock is invalid.", "训练时间无效，请检查系统时间。"],
  ["This training session no longer exists.", "这场训练已不存在。"],
  ["Switch back to the Codeforces account saved with this training.", "请切回本场训练绑定的 Codeforces 账号。"],
  ["Started training problems and settings are locked.", "已开始训练的题目和设置已锁定。"],
  ["This training has already ended or been cancelled.", "这场训练已结束或已取消。"],
  ["Finish or cancel the running training first.", "请先结束或取消正在进行的训练。"],
  ["Start the training before finishing it.", "请先开始训练，再结束训练。"],
  ["Codeforces returned an invalid submission list.", "Codeforces 返回的提交列表无效。"],
  ["The submission history is too large to finish this sync. Please retry later.", "提交历史过多，暂无法完成本次同步，请稍后重试。"],
  ["Start the training before syncing submissions.", "请先开始训练，再同步提交。"],
  ["Restart CF Compass to load the training service.", "请重启 CF Compass 以加载训练服务。"],
];

export default function CustomTraining({ data, submissionMap, favorites, planItems = [], onOpenNote, onAddToPlan, onToast }) {
  const { locale, t } = useI18n();
  const text = (key, values = {}) => Object.entries(values).reduce((message, [name, value]) => message.replaceAll(`{${name}}`, String(value)), (locale === "en-US" ? customTrainingMessages[key] : CHINESE[key]) || CHINESE[key] || key);
  const localizeError = (value) => {
    const message = String(value || "");
    if (locale !== "zh-CN") return t(message);
    const known = ERROR_CHINESE.find(([source]) => message.includes(source));
    if (known) return known[1];
    const missing = message.match(/Problem ([\d]+-[A-Z][A-Z0-9]*) is missing from the local problem library\./);
    return missing ? `题目 ${missing[1]} 不在本地题库中，请同步题库或重新选题。` : message;
  };
  const [store, setStore] = useState({ version: 1, sessions: [] });
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const busyRef = useRef(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const syncBusyRef = useRef(false);
  const mountedRef = useRef(true);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("120");
  const [hideTags, setHideTags] = useState(true);
  const [hideRating, setHideRating] = useState(true);
  const [reviewVisibility, setReviewVisibility] = useState({ sessionId: "", tags: null, rating: null });
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const autoFinishedRef = useRef(new Set());
  const handle = data?.handle || data?.user?.handle || "";
  const session = store.sessions.find((item) => item.id === selectedId);
  const runningSession = store.sessions.find((item) => item.status === "running");
  const editable = !session || session.status === "draft";
  const accountMatches = !session?.handle || normalizedHandle(session.handle) === normalizedHandle(handle);
  const canStart = Boolean(handle) && !data?.isDemo && accountMatches;
  const plannedKeys = useMemo(() => new Set(planItems.map((item) => item.problemKey || keyOf(item))), [planItems]);
  const favoriteKeys = useMemo(() => favorites instanceof Set ? favorites : new Set(favorites || []), [favorites]);

  useEffect(() => {
    mountedRef.current = true;
    getTrainingSessions().then((next) => {
      if (!mountedRef.current) return;
      setStore(next);
      setSelectedId(next.sessions.find((item) => item.status === "running")?.id || next.sessions.find((item) => item.status === "draft")?.id || "");
    }).catch((cause) => mountedRef.current && setError(cause.message || text("loadFailed")))
      .finally(() => mountedRef.current && setLoading(false));
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setConfirmCancel(false);
    setError("");
    setReviewVisibility({ sessionId: "", tags: null, rating: null });
    if (!session || session.status !== "draft") return;
    setTitle(session.title || "");
    setMinutes(String(session.durationSeconds / 60));
    setHideTags(Boolean(session.hideTags));
    setHideRating(Boolean(session.hideRating));
    setSelectedKeys(session.problems.map(keyOf));
  }, [selectedId, session?.status]);

  useEffect(() => {
    if (!runningSession) return;
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    setNow(Math.floor(Date.now() / 1000));
    return () => clearInterval(timer);
  }, [runningSession?.id]);

  function applyStore(next) {
    if (!mountedRef.current || !next?.sessions) return;
    // A fetch started before Finish/Cancel may complete later. Keep a closed
    // session's persisted time window even if an older response arrives last.
    setStore((current) => ({ ...next, sessions: next.sessions.map((incoming) => {
      const previous = current.sessions.find((item) => item.id === incoming.id);
      return previous && ["finished", "cancelled"].includes(previous.status) && incoming.status === "running"
        ? { ...incoming, status: previous.status, endTimeSeconds: previous.endTimeSeconds } : incoming;
    }) }));
  }

  async function run(action, task, success) {
    const syncing = action === "sync";
    if (syncing ? syncBusyRef.current : busyRef.current) return;
    if (syncing) { syncBusyRef.current = true; setSyncBusy(true); }
    else { busyRef.current = true; setBusy(action); }
    setError("");
    try {
      const next = await task();
      applyStore(next);
      if (success) onToast?.("success", success);
      return next;
    } catch (cause) {
      if (mountedRef.current) setError(cause.message || text("actionFailed"));
    } finally {
      if (syncing) { syncBusyRef.current = false; if (mountedRef.current) setSyncBusy(false); }
      else { busyRef.current = false; if (mountedRef.current) setBusy(""); }
    }
  }

  useEffect(() => {
    if (!runningSession || normalizedHandle(runningSession.handle) !== normalizedHandle(handle) || !handle) return;
    const id = runningSession.id;
    const sync = () => run("sync", () => syncTrainingSession(id));
    const timer = setInterval(sync, 30000);
    const reconnect = () => sync();
    window.addEventListener("online", reconnect);
    return () => { clearInterval(timer); window.removeEventListener("online", reconnect); };
  }, [runningSession?.id, handle]);

  const deadline = session?.status !== "draft" ? session?.endTimeSeconds : null;
  const remaining = deadline == null ? 0 : Math.max(0, deadline - now);
  useEffect(() => {
    if (!runningSession || now < runningSession.endTimeSeconds || busy || autoFinishedRef.current.has(runningSession.id)) return;
    const id = runningSession.id;
    autoFinishedRef.current.add(id);
    // A storage failure should leave an actionable error rather than trigger
    // an automatic retry loop on every timer tick. Manual Finish can retry.
    run("finish", () => finishTrainingSession(id), text("ended"));
  }, [runningSession?.id, now, busy]);

  const problemsByKey = useMemo(() => {
    const map = new Map();
    for (const problem of [...(session?.problems || []), ...planItems, ...(data?.problems || [])]) {
      if (problem?.contestId && problem?.index) map.set(keyOf(problem), problem);
    }
    return map;
  }, [data?.problems, planItems, session?.problems]);
  const pool = useMemo(() => {
    const wantedPlan = new Set(planItems.filter((item) => item.status !== "done").map((item) => item.problemKey || keyOf(item)));
    const candidates = source === "plan" ? [...problemsByKey.values()].filter((item) => wantedPlan.has(keyOf(item))) : (data?.problems || []);
    const query = search.trim().toLowerCase();
    const idQuery = query.replace(/[-\s]/g, "");
    return candidates.filter((problem) => {
      if (source === "favorites" && !favoriteKeys.has(keyOf(problem))) return false;
      return !query || `${problem.contestId}${problem.index}`.toLowerCase().includes(idQuery) || String(problem.name || "").toLowerCase().includes(query);
    });
  }, [data?.problems, problemsByKey, planItems, source, search, favoriteKeys]);
  useEffect(() => { setPage(1); }, [source, search]);
  const pageCount = Math.max(1, Math.ceil(pool.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visiblePool = pool.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selectedSet = new Set(selectedKeys);
  const selectedProblems = selectedKeys.map((key) => problemsByKey.get(key)).filter(Boolean);
  const unavailable = selectedProblems.length !== selectedKeys.length;
  const summary = useMemo(() => session && session.status !== "draft" ? summarizeTrainingSession(session) : null, [session]);
  // Review visibility is deliberately transient. Bind overrides to the viewed
  // session so switching sessions cannot expose metadata even for one render.
  const reviewOverrides = reviewVisibility.sessionId === session?.id && session?.status !== "running" ? reviewVisibility : {};
  const showTags = editable ? !hideTags : (reviewOverrides.tags ?? !session.hideTags);
  const showRating = editable ? !hideRating : (reviewOverrides.rating ?? !session.hideRating);
  const validDuration = /^\d+$/.test(minutes) && Number(minutes) >= 1 && Number(minutes) <= 1440;

  function resetEditor() {
    setSelectedId(""); setTitle(""); setMinutes("120"); setSelectedKeys([]); setHideTags(true); setHideRating(true); setError(""); setConfirmCancel(false);
  }
  function move(key, offset) {
    setSelectedKeys((keys) => {
      const index = keys.indexOf(key), target = index + offset;
      if (index < 0 || target < 0 || target >= keys.length) return keys;
      const next = [...keys]; [next[index], next[target]] = [next[target], next[index]]; return next;
    });
  }
  async function persistDraft() {
    if (!validDuration) throw new Error(text("invalidDuration"));
    if (!selectedKeys.length) throw new Error(text("noSelection"));
    if (unavailable) throw new Error(text("selectedUnavailable"));
    const oldIds = new Set(store.sessions.map((item) => item.id));
    const next = await saveTrainingDraft({ id: session?.status === "draft" ? session.id : undefined, title: title.trim(), problemKeys: selectedKeys, durationSeconds: Number(minutes) * 60, hideTags, hideRating });
    const id = session?.status === "draft" ? session.id : next.sessions.find((item) => !oldIds.has(item.id))?.id || next.sessions.find((item) =>
      item.status === "draft" && normalizedHandle(item.handle) === normalizedHandle(handle) && item.title === title.trim() &&
      item.durationSeconds === Number(minutes) * 60 && item.hideTags === hideTags && item.hideRating === hideRating &&
      item.problems.map(keyOf).join(",") === selectedKeys.join(","))?.id;
    if (!id) throw new Error(text("actionFailed"));
    if (mountedRef.current) { setStore(next); setSelectedId(id); }
    return { next, id };
  }
  function save() { return run("save", async () => (await persistDraft()).next, text("saved")); }
  function start() {
    if (!canStart) return;
    return run("start", async () => { const { id } = await persistDraft(); return startTrainingSession(id); }, text("started"));
  }
  function prior(problem) {
    const state = editable ? submissionMap?.get(keyOf(problem)) : { attempts: problem.priorAttempts, accepted: problem.priorAccepted };
    return state?.accepted ? text("priorAccepted") : state?.attempts ? text("priorAttempts", { count: state.attempts }) : text("noPrior");
  }
  function metadata(problem) {
    if (!showTags && !showRating) return null;
    return <span className="custom-training-meta">{showRating ? <b className={`rating rating--${ratingTone(problem.rating)}`}>{problem.rating || "—"}</b> : null}{showTags ? (problem.tags || []).map((tag) => <span key={tag}>{displayTag(tag)}</span>) : null}</span>;
  }
  function toggleReviewVisibility(field, visible) {
    setReviewVisibility((current) => ({
      ...(current.sessionId === session.id ? current : { tags: null, rating: null }),
      sessionId: session.id, [field]: !visible,
    }));
  }
  function problemTitle(problem) {
    return <button type="button" className="custom-training-problem-title" title={text("open", { key: keyOf(problem) })} onClick={() => openProblem(problem)}><span className="custom-training-problem-key">{problem.contestId}{problem.index}</span><strong data-i18n-preserve>{problem.name || keyOf(problem)}</strong><ExternalLink size={14} /></button>;
  }
  function reviewActions(problem) {
    const planned = plannedKeys.has(keyOf(problem));
    const noteSnapshot = { ...problem, ...(showTags ? {} : { tags: [] }), ...(showRating ? {} : { rating: null }) };
    return <div className="custom-training-review-actions">{onOpenNote ? <button type="button" onClick={() => onOpenNote(noteSnapshot)}><NotebookPen size={14} />{text("note")}</button> : null}{onAddToPlan ? <button type="button" disabled={planned} onClick={() => onAddToPlan(keyOf(problem))}>{planned ? <Check size={14} /> : <ListPlus size={14} />}{text(planned ? "inPlan" : "upsolve")}</button> : null}</div>;
  }
  const syncError = session?.syncError ? String(session.syncError.message || session.syncError) : "";
  const date = (seconds) => seconds ? new Date(seconds * 1000).toLocaleString(locale) : "—";

  return (
    <main className="feature-page custom-training" data-testid="custom-training">
      <header className="custom-training-hero">
        <div><span className="custom-training-kicker"><Target size={15} />CUSTOM TRAINING</span><h2>{text("title")}</h2><p>{text("intro")}</p></div>
        <button type="button" className="custom-training-button" data-testid="training-new" onClick={resetEditor} disabled={Boolean(busy) || loading}><Plus size={15} />{text("newSession")}</button>
      </header>
      <div className="custom-training-history">
        <label><span>{text("history")}</span><select data-testid="training-history" value={selectedId} disabled={Boolean(busy) || loading} onChange={(event) => event.target.value ? setSelectedId(event.target.value) : resetEditor()}><option value="">{text("newDraft")}</option>{store.sessions.map((item) => <option key={item.id} value={item.id}>{item.title || text("unnamed")} · {item.handle || "—"} · {text(item.status)} · {date(item.createdAtSeconds)}</option>)}</select></label>
        <span>{text("currentAccount", { handle: data?.isDemo ? "—" : handle || "—" })}</span>
      </div>
      {loading ? <div className="custom-training-empty" role="status"><LoaderCircle size={20} />{text("loading")}</div> : null}
      {error ? <div className="custom-training-notice is-error" role="alert">{localizeError(error)}{loading ? null : <button type="button" onClick={() => run("load", () => getTrainingSessions())}>{text("retry")}</button>}</div> : null}
      {!loading && !accountMatches ? <p className="custom-training-notice" role="status">{text("switched", { handle: session.handle })}</p> : null}
      {!loading && editable ? <>
        <section className="custom-training-config" aria-label={text("configuration")}>
          <label className="custom-training-title-field"><span>{text("sessionTitle")}</span><input data-testid="training-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={text("titlePlaceholder")} maxLength={120} disabled={Boolean(busy)} /></label>
          <label><span>{text("duration")}</span><input data-testid="training-duration" type="number" min="1" max="1440" step="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} disabled={Boolean(busy)} aria-describedby="training-duration-hint" /><small id="training-duration-hint">{text("durationHint")}</small></label>
          <div className="custom-training-toggles"><label><input data-testid="training-hide-tags" type="checkbox" checked={hideTags} onChange={(event) => setHideTags(event.target.checked)} disabled={Boolean(busy)} />{text("hideTags")}</label><label><input data-testid="training-hide-rating" type="checkbox" checked={hideRating} onChange={(event) => setHideRating(event.target.checked)} disabled={Boolean(busy)} />{text("hideRating")}</label></div>
        </section>
        <p className="custom-training-help" data-testid="training-privacy-hint">{text("visibilityHint")}</p>
        <div className="custom-training-builder">
          <section className="custom-training-panel">
            <div className="custom-training-filters"><label><span>{text("source")}</span><select data-testid="training-source" value={source} onChange={(event) => setSource(event.target.value)}><option value="all">{text("all")}</option><option value="favorites">{text("favorites")}</option><option value="plan">{text("plan")}</option></select></label><label className="custom-training-search"><Search size={15} /><input data-testid="training-search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label={text("search")} placeholder={text("search")} /></label></div>
            <p className="custom-training-list-count">{text("matches", { count: pool.length })}</p>
            <div className="custom-training-pool" data-testid="training-candidates">{visiblePool.length ? visiblePool.map((problem) => <article className="custom-training-candidate" key={keyOf(problem)}>{problemTitle(problem)}{metadata(problem)}<small data-testid={`training-prior-${keyOf(problem)}`}>{prior(problem)}</small><button type="button" className="custom-training-icon" data-testid={`training-pick-${keyOf(problem)}`} disabled={selectedSet.has(keyOf(problem)) || selectedKeys.length >= TRAINING_MAX_PROBLEMS || Boolean(busy)} aria-label={`${text(selectedSet.has(keyOf(problem)) ? "picked" : "add")} ${keyOf(problem)}`} onClick={() => setSelectedKeys((keys) => keys.includes(keyOf(problem)) || keys.length >= TRAINING_MAX_PROBLEMS ? keys : [...keys, keyOf(problem)])}>{selectedSet.has(keyOf(problem)) ? <Check size={17} /> : <Plus size={17} />}</button></article>) : <p className="custom-training-empty">{text("emptyPool")}</p>}</div>
            <div className="custom-training-pagination"><button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>{text("previous")}</button><span>{text("page", { page: safePage, total: pageCount })}</span><button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>{text("next")}</button></div>
          </section>
          <section className="custom-training-panel custom-training-selected" aria-label={text("selected")}>
            <header><h3>{text("selected")}</h3><span>{text("selectedCount", { count: selectedKeys.length })}</span></header>
            <p className="custom-training-help">{text("priorHint")}</p>{selectedKeys.length >= TRAINING_MAX_PROBLEMS ? <p className="custom-training-notice">{text("limitHint", { count: TRAINING_MAX_PROBLEMS })}</p> : null}
            {unavailable ? <p className="custom-training-notice">{text("selectedUnavailable")}</p> : null}
            <ol className="custom-training-selected-list">{selectedKeys.map((key, index) => { const problem = problemsByKey.get(key); return <li key={key} data-testid={`training-problem-${key}`}><span className="custom-training-order">{index + 1}</span><div>{problem ? problemTitle(problem) : <strong>{key}</strong>}{problem ? metadata(problem) : null}{problem ? <small data-testid={`training-prior-${keyOf(problem)}`}>{prior(problem)}</small> : null}</div><div className="custom-training-order-actions"><button type="button" data-testid={`training-up-${key}`} disabled={index === 0 || Boolean(busy)} aria-label={text("up", { key })} onClick={() => move(key, -1)}><ArrowUp size={14} /></button><button type="button" data-testid={`training-down-${key}`} disabled={index === selectedKeys.length - 1 || Boolean(busy)} aria-label={text("down", { key })} onClick={() => move(key, 1)}><ArrowDown size={14} /></button><button type="button" data-testid={`training-remove-${key}`} disabled={Boolean(busy)} aria-label={text("remove", { key })} onClick={() => setSelectedKeys((keys) => keys.filter((entry) => entry !== key))}><Trash2 size={14} /></button></div></li>; })}</ol>
            {!selectedKeys.length ? <p className="custom-training-empty">{text("emptySelected")}</p> : null}
          </section>
        </div>
        <footer className="custom-training-builder-actions">{!canStart && accountMatches ? <p>{text("needAccount")}</p> : <span />}
          <button type="button" className="custom-training-button" data-testid="training-save" disabled={Boolean(busy) || !selectedKeys.length || !validDuration || unavailable} onClick={save}>{busy === "save" ? <LoaderCircle className="custom-training-spin" size={16} /> : <Save size={16} />}{text(busy === "save" ? "saving" : "save")}</button>
          <button type="button" className="custom-training-button is-primary" data-testid="training-start" disabled={Boolean(busy) || !selectedKeys.length || !validDuration || unavailable || !canStart} onClick={start}>{busy === "start" ? <LoaderCircle className="custom-training-spin" size={16} /> : <Play size={16} />}{text(busy === "start" ? "saving" : "start")}</button>
        </footer>
      </> : null}
      {!loading && !editable && session && summary ? <>
        <section className={`custom-training-session is-${session.status}`}>
          <div><span className="custom-training-session-status">{text(session.status)}</span><h3 data-i18n-preserve>{session.title || text("unnamed")}</h3><p>{text("sessionAccount", { handle: session.handle })} · {text("deadline")}: {date(deadline)}</p></div>
          <div className="custom-training-clock"><span>{text(session.status === "running" ? "countdown" : "elapsed")}</span><strong data-testid="training-countdown"><Clock3 size={22} />{clock(session.status === "running" ? remaining : Math.max(0, (session.endTimeSeconds || deadline) - session.startTimeSeconds))}</strong></div>
        </section>
        <p className="custom-training-help">{text("locked")}</p>
        <p className="custom-training-help" data-testid="training-privacy-hint">{text("visibilityHint")}</p>
        <div className="custom-training-sync-bar"><div><span>{session.lastSyncAtSeconds ? text("lastSync", { time: date(session.lastSyncAtSeconds) }) : text("neverSync")}</span><small>{text(session.status === "running" ? "autoSync" : "syncStopped")}</small></div><button type="button" className="custom-training-button" data-testid="training-sync" disabled={Boolean(busy) || syncBusy || !accountMatches || !handle} onClick={() => run("sync", () => syncTrainingSession(session.id))}><RefreshCw className={syncBusy ? "custom-training-spin" : ""} size={15} />{text(syncBusy ? "syncing" : "sync")}</button>{session.status === "running" ? <><button type="button" className="custom-training-button" data-testid="training-finish" disabled={Boolean(busy)} onClick={() => run("finish", () => finishTrainingSession(session.id), text("ended"))}>{text("finish")}</button><button type="button" className="custom-training-button is-danger" data-testid="training-cancel" disabled={Boolean(busy)} onClick={() => setConfirmCancel(true)}><X size={15} />{text("cancel")}</button></> : null}</div>
        {syncError ? <p className="custom-training-notice is-error" role="alert">{text("syncError", { message: localizeError(syncError) })}</p> : null}
        {confirmCancel ? <div className="custom-training-notice custom-training-confirm"><p>{text("cancelPrompt")}</p><button type="button" data-testid="training-cancel-confirm" disabled={Boolean(busy)} onClick={() => run("cancel", () => cancelTrainingSession(session.id), text("cancelledNotice"))}>{text("confirmCancel")}</button><button type="button" disabled={Boolean(busy)} onClick={() => setConfirmCancel(false)}>{text("keepRunning")}</button></div> : null}
        <section className="custom-training-summary" data-testid="training-summary" aria-label={text("summary")}><div><span>{text("solved")}</span><strong>{summary.solved} / {summary.total}</strong></div><div><span>{text("firstAc")}</span><strong>{summary.firstAcSeconds == null ? text("noAc") : clock(summary.firstAcSeconds)}</strong></div><div><span>{text("wrongAttempts")}</span><strong>{summary.wrongAttempts}</strong></div><div><span>{text("pendingCount")}</span><strong>{summary.pending}</strong></div></section>
        {summary.pending > 0 ? <p className="custom-training-notice" role="status">{text("pendingHint")}</p> : null}
        {session.status === "cancelled" ? <p className="custom-training-help">{text("cancelledSummary")}</p> : null}
        {session.status !== "running" ? <div className="custom-training-review-visibility" aria-label={text("reviewVisibility")}>
          <span>{text("reviewVisibility")}</span>
          <button type="button" className="custom-training-button" data-testid="training-reveal-tags" aria-pressed={showTags} onClick={() => toggleReviewVisibility("tags", showTags)}>{text(showTags ? "concealTags" : "revealTags")}</button>
          <button type="button" className="custom-training-button" data-testid="training-reveal-rating" aria-pressed={showRating} onClick={() => toggleReviewVisibility("rating", showRating)}>{text(showRating ? "concealRating" : "revealRating")}</button>
        </div> : null}
        <section className="custom-training-panel custom-training-results"><header><h3>{text("selected")}</h3><span>{text("upsolveCount", { count: summary.total - summary.solved })}</span></header><ol className="custom-training-results-list">{summary.problems.map((problem, index) => <li className={`is-${problem.status}`} key={keyOf(problem)} data-testid={`training-problem-${keyOf(problem)}`} data-status={problem.status}><span className="custom-training-order">{index + 1}</span><div>{problemTitle(problem)}{metadata(problem)}<small data-testid={`training-prior-${keyOf(problem)}`}>{prior(problem)}</small><div className="custom-training-problem-metrics"><span>{text("attempts", { count: typeof problem.attempts === "number" ? problem.attempts : problem.attempts?.length || 0 })}</span><span>{text("wrongProblem", { count: problem.wrongAttempts })}</span>{problem.firstAcSeconds != null ? <span>{text("firstAcProblem", { time: clock(problem.firstAcSeconds) })}</span> : null}</div></div><span className={`custom-training-verdict is-${problem.status}`}>{text(problem.status)}</span>{session.status !== "running" ? reviewActions(problem) : null}</li>)}</ol></section>
      </> : null}
    </main>
  );
}
