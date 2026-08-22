import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AppRail from "./components/AppRail";
import ProblemWorkspace from "./components/ProblemWorkspace";
import ProgressPanel from "./components/ProgressPanel";
import ReviewStatsStrip from "./components/ReviewStatsStrip";
import StatsStrip from "./components/StatsStrip";
import Taxonomy from "./components/Taxonomy";
import TitleBar from "./components/TitleBar";
import TopBar from "./components/TopBar";
import WorkbenchLayout from "./components/WorkbenchLayout";
import { useI18n } from "./i18n";
import { BUILT_IN_WALLPAPERS, DEFAULT_WALLPAPER_ID, WALLPAPER_LIBRARY_COUNTS } from "./data/wallpapers";
import {
  chooseCustomWallpaper,
  clearCustomWallpaper,
  loadCustomWallpaper,
  loadLocalWallpaperLibrary,
} from "./lib/appearance";
import {
  loadFavorites,
  loadInitialData,
  problemKey,
  saveFavorites,
  syncCodeforces,
} from "./lib/codeforces";
import {
  exportAllData,
  getDataCenterStatus,
  importAllData,
  loadStudyData,
  openBackupFolder,
  saveStudyData,
} from "./lib/study";
import {
  buildSubmissionMap,
  buildTagCounts,
  displayTag,
  getOverview,
  getRecentActivity,
  normalizeTag,
} from "./lib/stats";

const AppearanceDrawer = lazy(() => import("./components/AppearanceDrawer"));
const ContestCenterPage = lazy(() => import("./components/ContestCenterPage"));
const ContestReplayPage = lazy(() => import("./components/ContestReplayPage"));
const DataCenter = lazy(() => import("./components/DataCenter"));
const ProblemNoteDrawer = lazy(() => import("./components/ProblemNoteDrawer"));
const ReviewLibrary = lazy(() => import("./components/ReviewLibrary"));
const TemplateLibrary = lazy(() => import("./components/TemplateLibrary"));
const TodayTraining = lazy(() => import("./components/TodayTraining"));
const TrainingAnalytics = lazy(() => import("./components/TrainingAnalytics"));

const PAGE_SIZE = 14;
const DEFAULT_RATING_RANGE = [800, 3500];
const DEFAULT_PANEL_ORDER = ["taxonomy", "problems", "progress"];
const PANEL_LAYOUT_KEY = "cf-compass-panel-layout-v1";
function chooseNextWallpaperId(settings, currentId, wallpapers) {
  const wallpaperIds = wallpapers.map((wallpaper) => wallpaper.id);
  const wallpaperIdSet = new Set(wallpaperIds);
  const favoriteIds = (settings.wallpaperFavorites || []).filter((id) =>
    wallpaperIdSet.has(id),
  );
  const pool = favoriteIds.length ? favoriteIds : wallpaperIds;
  const alternatives = pool.filter((id) => id !== currentId);
  return alternatives[Math.floor(Math.random() * alternatives.length)] || pool[0];
}

function applyRotatedWallpaper(settings, pageId, wallpapers) {
  const currentId = settings.usePageWallpapers
    ? settings.pageWallpapers?.[pageId] || settings.wallpaperId
    : settings.wallpaperId;
  const nextId = chooseNextWallpaperId(settings, currentId, wallpapers);
  if (!nextId || nextId === currentId) return settings;
  return settings.usePageWallpapers
    ? {
        ...settings,
        pageWallpapers: {
          ...(settings.pageWallpapers || {}),
          [pageId]: nextId,
        },
      }
    : { ...settings, wallpaperId: nextId };
}

const pageMeta = {
  library: ["题库工作台", "筛选、追踪并完成下一道值得做的题"],
  favorites: ["收藏题目", "集中查看你标记过、准备继续挑战的题目"],
  today: ["今日训练", "复习该复习的，补强最值得补强的"],
  review: ["复习库", "回看刷过的题，让每次 AC 都留下轨迹"],
  contests: ["赛事复盘", "有效参加的 Rated 比赛与表现分记录"],
  "contest-center": ["赛事中心", "浏览全部 Codeforces 场次，找到最适合现在的下一场"],
  templates: ["模板库", "自动整理本地算法模板，点击即达 VS Code"],
  analytics: ["训练分析", "用真实数据看见长期进步与下一步突破口"],
  data: ["数据中心", "可靠同步、迁移并保护你的训练记录"],
};

function loadPanelOrder() {
  try {
    const savedOrder = JSON.parse(localStorage.getItem(PANEL_LAYOUT_KEY));
    const isValid =
      Array.isArray(savedOrder) &&
      savedOrder.length === DEFAULT_PANEL_ORDER.length &&
      DEFAULT_PANEL_ORDER.every((panelId) => savedOrder.includes(panelId));
    return isValid ? savedOrder : [...DEFAULT_PANEL_ORDER];
  } catch {
    return [...DEFAULT_PANEL_ORDER];
  }
}

function FeatureFallback() {
  return (
    <div className="feature-loading" role="status">
      <span />
      <strong>正在载入模块</strong>
      <small>首屏已就绪，功能模块正在按需加载</small>
    </div>
  );
}

export default function App() {
  const { setLocale } = useI18n();
  const [data, setData] = useState(null);
  const [studyData, setStudyData] = useState(null);
  const [dataStatus, setDataStatus] = useState(null);
  const [handle, setHandle] = useState("tourist");
  const [favorites, setFavorites] = useState(() => new Set());
  const [selectedTag, setSelectedTag] = useState("all");
  const [ratingRange, setRatingRange] = useState(DEFAULT_RATING_RANGE);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("ratingAsc");
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);
  const [activeNav, setActiveNav] = useState("library");
  const [panelOrder, setPanelOrder] = useState(loadPanelOrder);
  const [noteProblem, setNoteProblem] = useState(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [customWallpaper, setCustomWallpaper] = useState(null);
  const [localWallpaperLibrary, setLocalWallpaperLibrary] = useState(() => ({
    wallpapers: [],
    counts: {},
    defaultWallpaperId: "",
  }));
  const availableWallpapers = useMemo(
    () => [...BUILT_IN_WALLPAPERS, ...(localWallpaperLibrary.wallpapers || [])],
    [localWallpaperLibrary.wallpapers],
  );
  const syncingRef = useRef(false);
  const lastAutoAttemptRef = useRef(0);
  const studyDataRef = useRef(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const deferredRatingRange = useDeferredValue(ratingRange);
  const showToast = useCallback((type, message) => setToast({ type, message }), []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      loadInitialData(),
      loadFavorites(),
      loadStudyData(),
    ]).then(([initialData, initialFavorites, initialStudy]) => {
      if (!alive) return;
      setData(initialData);
      setHandle(initialData.handle || initialData.user?.handle || "");
      setFavorites(new Set(initialFavorites));
      setStudyData(initialStudy);
      setLocale(initialStudy.settings?.language || "zh-CN");
    });

    const loadSecondaryData = () => {
      Promise.all([
        getDataCenterStatus().catch(() => null),
        loadCustomWallpaper().catch(() => null),
        loadLocalWallpaperLibrary().catch(() => null),
      ]).then(([initialStatus, initialWallpaper, initialLibrary]) => {
        if (!alive) return;
        setDataStatus(initialStatus);
        setCustomWallpaper(initialWallpaper);
        if (initialLibrary) setLocalWallpaperLibrary(initialLibrary);
      });
    };
    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(loadSecondaryData, { timeout: 1200 })
        : window.setTimeout(loadSecondaryData, 350);
    return () => {
      alive = false;
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, []);

  useEffect(() => {
    studyDataRef.current = studyData;
  }, [studyData]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector("[data-command-search]")?.focus();
      }
      if (event.key === "Escape") {
        setNoteProblem(null);
        setImmersive(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify(panelOrder));
  }, [panelOrder]);

  useEffect(() => {
    if (
      !data ||
      !studyData?.settings?.autoSync ||
      data.isDemo ||
      !handle ||
      !data.syncedAt
    ) {
      return undefined;
    }

    const intervalMs = (studyData.settings.autoSyncMinutes || 30) * 60 * 1000;
    function maybeAutoSync() {
      if (!navigator.onLine || document.visibilityState === "hidden" || syncingRef.current) return;
      const lastSyncAt = new Date(data.syncedAt).getTime() || 0;
      const lastReference = Math.max(lastSyncAt, lastAutoAttemptRef.current);
      if (Date.now() - lastReference < intervalMs) return;
      lastAutoAttemptRef.current = Date.now();
      handleSync({ automatic: true });
    }

    const startupCheck = window.setTimeout(maybeAutoSync, 6000);
    const interval = window.setInterval(maybeAutoSync, 60000);
    window.addEventListener("online", maybeAutoSync);
    document.addEventListener("visibilitychange", maybeAutoSync);
    return () => {
      window.clearTimeout(startupCheck);
      window.clearInterval(interval);
      window.removeEventListener("online", maybeAutoSync);
      document.removeEventListener("visibilitychange", maybeAutoSync);
    };
  }, [
    data?.isDemo,
    data?.syncedAt,
    handle,
    studyData?.settings?.autoSync,
    studyData?.settings?.autoSyncMinutes,
  ]);

  useEffect(() => {
    const settings = studyData?.settings;
    const minutes = Number(settings?.wallpaperAutoRotateMinutes || 0);
    if (
      !studyData ||
      minutes <= 0 ||
      settings.wallpaperLocked ||
      !settings.wallpaperEnabled
    ) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const currentStudy = studyDataRef.current;
      if (!currentStudy) return;
      const nextSettings = applyRotatedWallpaper(currentStudy.settings, activeNav, availableWallpapers);
      if (nextSettings === currentStudy.settings) return;
      persistStudy({ ...currentStudy, settings: nextSettings });
    }, minutes * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [
    activeNav,
    studyData?.settings?.wallpaperAutoRotateMinutes,
    studyData?.settings?.wallpaperEnabled,
    studyData?.settings?.wallpaperLocked,
    availableWallpapers,
  ]);

  const problems = data?.problems || [];
  const submissions = data?.submissions || [];
  const submissionMap = useMemo(() => buildSubmissionMap(submissions), [submissions]);
  const tagCounts = useMemo(() => buildTagCounts(problems), [problems]);
  const overview = useMemo(
    () => getOverview(problems, submissions, submissionMap),
    [problems, submissions, submissionMap],
  );
  const recentActivity = useMemo(
    () => getRecentActivity(problems, submissions),
    [problems, submissions],
  );

  const filteredProblems = useMemo(() => {
    const [minimum, maximum] = deferredRatingRange;
    const isFullRatingRange = minimum === 800 && maximum === 3500;
    const result = [];
    for (const problem of problems) {
      const key = problemKey(problem);
      const stats = submissionMap.get(key);
      const solved = Boolean(stats?.accepted);
      const rating = problem.rating;
      if (selectedTag !== "all" && !(problem.tags || []).some((tag) => normalizeTag(tag) === selectedTag)) continue;
      if (rating && (rating < minimum || rating > maximum)) continue;
      if (!rating && !isFullRatingRange) continue;
      if (statusFilter === "solved" && !solved) continue;
      if (statusFilter === "unsolved" && solved) continue;
      if (statusFilter === "favorite" && !favorites.has(key)) continue;
      if (deferredSearch) {
        const haystack = `${problem.contestId}${problem.index} ${problem.name} ${(problem.tags || []).join(" ")}`.toLowerCase();
        if (!haystack.includes(deferredSearch)) continue;
      }
      result.push(problem);
    }
    result.sort((a, b) => {
      if (sort === "ratingDesc") return (b.rating || 0) - (a.rating || 0);
      if (sort === "newest") return (b.contestId || 0) - (a.contestId || 0);
      if (sort === "mostSolved") {
        return (submissionMap.get(problemKey(b))?.accepted || 0) - (submissionMap.get(problemKey(a))?.accepted || 0);
      }
      return (a.rating || 0) - (b.rating || 0) || (b.contestId || 0) - (a.contestId || 0);
    });
    return result;
  }, [
    problems,
    selectedTag,
    deferredRatingRange,
    statusFilter,
    favorites,
    deferredSearch,
    sort,
    submissionMap,
  ]);

  const totalPages = Math.ceil(filteredProblems.length / PAGE_SIZE);
  const safePage = Math.min(Math.max(1, page), Math.max(1, totalPages));
  const visibleProblems = filteredProblems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function resetPage(update) {
    startTransition(() => {
      update();
      setPage(1);
    });
  }

  async function refreshStatus() {
    const next = await getDataCenterStatus();
    setDataStatus(next);
    return next;
  }

  async function handleSync(options = {}) {
    const automatic = options?.automatic === true;
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const next = await syncCodeforces(handle);
      setData(next);
      setHandle(next.user?.handle || handle);
      await refreshStatus().catch(() => undefined);
      const added = next.syncMeta?.newSubmissions;
      setToast({
        type: "success",
        message:
          added === undefined
            ? `${automatic ? "自动" : ""}同步完成：${next.user?.handle}`
            : `${automatic ? "自动" : ""}${next.syncMeta?.incremental ? "增量" : "完整"}同步完成，新增 ${added} 条提交`,
      });
    } catch (error) {
      setToast({
        type: "error",
        message: automatic
          ? `自动同步失败：${error.message || "稍后会按设定间隔重试"}`
          : error.message || "同步失败，请稍后再试",
      });
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }

  function toggleFavorite(key) {
    setFavorites((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      saveFavorites([...next]);
      return next;
    });
  }

  function navigate(target) {
    const appearanceSettings = studyData?.settings;
    if (
      appearanceSettings?.randomWallpaperOnPageChange &&
      !appearanceSettings?.wallpaperLocked
    ) {
      const nextSettings = applyRotatedWallpaper(appearanceSettings, target, availableWallpapers);
      if (nextSettings !== appearanceSettings) {
        persistStudy({ ...studyData, settings: nextSettings });
      }
    }
    setActiveNav(target);
    if (target === "favorites") {
      resetPage(() => setStatusFilter("favorite"));
    } else if (target === "library") {
      resetPage(() => setStatusFilter("all"));
    }
  }

  async function persistStudy(next, message) {
    setStudyData(next);
    try {
      const saved = await saveStudyData(next);
      setStudyData(saved);
      if (message) setToast({ type: "success", message });
      if (activeNav === "data") await refreshStatus().catch(() => undefined);
    } catch (error) {
      setToast({ type: "error", message: error.message || "学习记录保存失败" });
    }
  }

  function previewAppearance(patch) {
    if (patch.language) setLocale(patch.language);
    setStudyData((current) => ({
      ...current,
      settings: { ...current.settings, ...patch },
    }));
  }

  function saveAppearance(settings) {
    persistStudy(
      { ...studyData, settings: { ...studyData.settings, ...settings } },
      "外观设置已保存",
    );
  }

  async function handleChooseCustomWallpaper() {
    try {
      const result = await chooseCustomWallpaper();
      if (!result?.canceled && (result?.dataUrl || result?.url)) {
        setCustomWallpaper(result);
      }
      return result;
    } catch (error) {
      setToast({ type: "error", message: error.message || "背景图片读取失败" });
      return { canceled: true };
    }
  }

  async function handleClearCustomWallpaper() {
    try {
      const result = await clearCustomWallpaper();
      setCustomWallpaper(null);
      return result;
    } catch (error) {
      setToast({ type: "error", message: error.message || "无法恢复默认背景" });
      return { cleared: false };
    }
  }

  function saveProblemNote(key, note) {
    persistStudy(
      { ...studyData, notes: { ...studyData.notes, [key]: note } },
      "复盘笔记已保存",
    );
    setNoteProblem(null);
  }

  async function handleExport() {
    try {
      const result = await exportAllData(data, favorites, studyData);
      if (!result?.canceled) {
        setToast({ type: "success", message: result.path ? `备份已导出到 ${result.path}` : "备份已导出" });
        await refreshStatus().catch(() => undefined);
      }
    } catch (error) {
      setToast({ type: "error", message: error.message || "导出失败" });
    }
  }

  async function handleImport() {
    try {
      const result = await importAllData();
      if (result?.canceled) return;
      setData(result.cache);
      setHandle(result.cache.handle || result.cache.user?.handle || "");
      setFavorites(new Set(result.favorites));
      setStudyData(result.study);
      setLocale(result.study.settings?.language || "zh-CN");
      await refreshStatus().catch(() => undefined);
      setToast({ type: "success", message: "数据已安全导入，导入前快照也已保留" });
    } catch (error) {
      setToast({ type: "error", message: error.message || "导入失败" });
    }
  }

  function changePanelOrder(nextOrder) {
    setPanelOrder(nextOrder);
    setToast({ type: "success", message: "布局已调整并自动保存" });
  }

  function optimizePanelLayout() {
    setPanelOrder([...DEFAULT_PANEL_ORDER]);
    setToast({ type: "success", message: "已恢复推荐布局" });
  }

  if (!data || !studyData) {
    return (
      <div className="loading-screen">
        <div className="loading-mark">&lt;/&gt;</div>
        <strong>正在载入 CF Compass</strong>
        <span>准备你的专属训练系统</span>
      </div>
    );
  }

  const isWorkbench = activeNav === "library" || activeNav === "favorites";
  const isReviewLibrary = activeNav === "review";
  const hasGlobalStats = isWorkbench || isReviewLibrary;
  const [title, subtitle] = pageMeta[activeNav] || pageMeta.library;
  const appearance = studyData.settings;
  const activeWallpaperId = appearance.usePageWallpapers
    ? appearance.pageWallpapers?.[activeNav] || appearance.wallpaperId
    : appearance.wallpaperId;
  const builtInWallpaper = availableWallpapers.find((item) => item.id === activeWallpaperId);
  const wallpaperUrl =
    activeWallpaperId === "custom"
      ? customWallpaper?.dataUrl || customWallpaper?.url
      : builtInWallpaper?.url;
  const isVideoWallpaper =
    activeWallpaperId === "custom" && customWallpaper?.mediaType === "video";
  const appStyle = {
    "--wallpaper-opacity": (appearance.wallpaperOpacity ?? 92) / 100,
    "--wallpaper-backdrop-opacity": ((appearance.wallpaperOpacity ?? 92) / 100) * 0.42,
    "--wallpaper-blur": `${Math.max(0, (100 - (appearance.wallpaperClarity ?? 100)) * 0.14)}px`,
    "--wallpaper-brightness": `${appearance.wallpaperBrightness ?? 100}%`,
    "--wallpaper-scale": (appearance.wallpaperScale ?? 100) / 100,
    "--wallpaper-position": appearance.wallpaperPosition || "center center",
    "--panel-opacity": (appearance.panelOpacity ?? 72) / 100,
  };
  const handleWallpaperError = (event) => {
    const previewUrl = builtInWallpaper?.previewUrl;
    if (previewUrl && !event.currentTarget.src.endsWith(previewUrl.replace("./", ""))) {
      event.currentTarget.src = previewUrl;
    }
  };

  return (
    <div
      className={`app-shell academy-theme accent-${appearance.accentTheme || "sky"} ${
        appearance.reduceMotion ? "reduce-motion" : ""
      } ${immersive ? "is-immersive" : ""} density-${appearance.interfaceDensity || "comfortable"}`}
      style={appStyle}
    >
      {isVideoWallpaper ? (
        <video
          key={`${wallpaperUrl}-${appearance.reduceMotion ? "paused" : "playing"}`}
          className={`app-wallpaper app-wallpaper--video ${
            appearance.wallpaperEnabled && wallpaperUrl ? "is-visible" : ""
          }`}
          src={wallpaperUrl}
          autoPlay={!appearance.reduceMotion}
          loop
          muted
          playsInline
          aria-hidden="true"
        />
      ) : (
        <>
          <img
            className={`app-wallpaper app-wallpaper--backdrop ${
              appearance.wallpaperEnabled && wallpaperUrl ? "is-visible" : ""
            }`}
            src={wallpaperUrl || undefined}
            alt=""
            aria-hidden="true"
            decoding="async"
            draggable={false}
            onError={handleWallpaperError}
          />
          <img
            className={`app-wallpaper app-wallpaper--image ${
              appearance.wallpaperEnabled && wallpaperUrl ? "is-visible" : ""
            }`}
            src={wallpaperUrl || undefined}
            alt=""
            aria-hidden="true"
            decoding="async"
            fetchPriority="high"
            draggable={false}
            onError={handleWallpaperError}
          />
        </>
      )}
      <div className="academy-grid" aria-hidden="true" />
      <TitleBar />
      <AppRail
        active={activeNav}
        onNavigate={navigate}
        appearanceOpen={appearanceOpen}
        onOpenAppearance={() => setAppearanceOpen(true)}
      />
      <div className={`app-content ${hasGlobalStats ? "" : "app-content--feature"}`}>
        <TopBar
          handle={handle}
          rating={data.user?.rating}
          onHandleChange={setHandle}
          onSync={handleSync}
          syncing={syncing}
          syncedAt={data.syncedAt}
          isDemo={data.isDemo}
          onOptimizeLayout={optimizePanelLayout}
          showLayoutButton={isWorkbench}
          title={title}
          subtitle={subtitle}
          immersive={immersive}
          onToggleImmersive={() => setImmersive(true)}
        />
        <Suspense fallback={<FeatureFallback />}>
          {isReviewLibrary ? (
          <ReviewStatsStrip overview={overview} latestAcceptedAt={recentActivity[0]?.timestamp} />
        ) : isWorkbench ? (
          <StatsStrip overview={overview} />
        ) : null}

        {isReviewLibrary ? (
          <ReviewLibrary
            problems={problems}
            submissionMap={submissionMap}
            favorites={favorites}
            user={data.user}
            studyData={studyData}
            onToggleFavorite={toggleFavorite}
            onOpenNote={setNoteProblem}
          />
        ) : activeNav === "today" ? (
          <TodayTraining
            data={data}
            submissionMap={submissionMap}
            studyData={studyData}
            onStudyChange={persistStudy}
            onOpenNote={setNoteProblem}
          />
        ) : activeNav === "contests" ? (
          <ContestReplayPage
            data={data}
            studyData={studyData}
            onStudyChange={persistStudy}
            onOpenNote={setNoteProblem}
            onToast={(type, message) => setToast({ type, message })}
          />
        ) : activeNav === "contest-center" ? (
          <ContestCenterPage
            data={data}
            studyData={studyData}
            onStudyChange={persistStudy}
            onToast={showToast}
          />
        ) : activeNav === "templates" ? (
          <TemplateLibrary onToast={showToast} />
        ) : activeNav === "analytics" ? (
          <TrainingAnalytics data={data} />
        ) : activeNav === "data" ? (
          <DataCenter
            status={dataStatus}
            studyData={studyData}
            syncing={syncing}
            onSync={handleSync}
            onExport={handleExport}
            onImport={handleImport}
            onOpenBackups={() => openBackupFolder().catch((error) => setToast({ type: "error", message: error.message }))}
            onSettingsChange={(patch) =>
              persistStudy(
                { ...studyData, settings: { ...studyData.settings, ...patch } },
                "数据设置已保存",
              )
            }
          />
        ) : (
          <WorkbenchLayout
            order={panelOrder}
            onOrderChange={changePanelOrder}
            panels={{
              taxonomy: (
                <Taxonomy
                  tagCounts={tagCounts}
                  selectedTag={selectedTag}
                  onSelectTag={(tag) => resetPage(() => setSelectedTag(tag))}
                  problemCount={problems.length}
                />
              ),
              problems: (
                <ProblemWorkspace
                  problems={visibleProblems}
                  totalFiltered={filteredProblems.length}
                  submissionMap={submissionMap}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  search={search}
                  onSearchChange={(value) => resetPage(() => setSearch(value))}
                  ratingRange={ratingRange}
                  onRatingRangeChange={(value) => {
                    setRatingRange(value);
                    setPage(1);
                  }}
                  statusFilter={statusFilter}
                  onStatusChange={(value) => resetPage(() => setStatusFilter(value))}
                  sort={sort}
                  onSortChange={(value) => resetPage(() => setSort(value))}
                  page={safePage}
                  totalPages={totalPages}
                  onPageChange={setPage}
                   selectedTagLabel={selectedTag === "all" ? "所有题目" : displayTag(selectedTag)}
                   showTags={studyData.settings.showProblemTags !== false}
                   onToggleTags={() =>
                     persistStudy(
                       {
                         ...studyData,
                         settings: {
                           ...studyData.settings,
                           showProblemTags: studyData.settings.showProblemTags === false,
                         },
                       },
                       studyData.settings.showProblemTags === false
                         ? "题目标签已显示"
                         : "题目标签已隐藏，Rating 保持显示",
                     )
                   }
                 />
              ),
              progress: (
                <ProgressPanel
                  user={data.user}
                  ratingStanding={data.ratingStanding}
                   overview={overview}
                   submissions={submissions}
                   recentActivity={recentActivity}
                />
              ),
            }}
          />
          )}
        </Suspense>
      </div>
      {noteProblem ? (
        <Suspense fallback={null}>
          <ProblemNoteDrawer
            problem={noteProblem}
            studyData={studyData}
            onClose={() => setNoteProblem(null)}
            onSave={saveProblemNote}
          />
        </Suspense>
      ) : null}
      {appearanceOpen ? (
        <Suspense fallback={null}>
          <AppearanceDrawer
            settings={studyData.settings}
            customWallpaper={customWallpaper}
            wallpapers={availableWallpapers}
            wallpaperCounts={{ ...WALLPAPER_LIBRARY_COUNTS, ...(localWallpaperLibrary.counts || {}), total: availableWallpapers.length }}
            defaultWallpaperId={localWallpaperLibrary.defaultWallpaperId || DEFAULT_WALLPAPER_ID}
            onPreview={previewAppearance}
            onCommit={saveAppearance}
            onChooseCustom={handleChooseCustomWallpaper}
            onClearCustom={handleClearCustomWallpaper}
            activePage={activeNav}
            onClose={() => setAppearanceOpen(false)}
          />
        </Suspense>
      ) : null}
      {immersive ? (
        <button
          type="button"
          className="immersive-exit"
          onClick={() => setImmersive(false)}
          aria-label="退出沉浸模式"
        >
          返回终端
          <span>Esc</span>
        </button>
      ) : null}
      {toast ? (
        <div className={`toast toast--${toast.type}`} role="status">
          <span />
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
