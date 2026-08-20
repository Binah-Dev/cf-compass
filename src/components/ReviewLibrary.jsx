import {
  ArrowDownUp,
  History,
  List,
  Search,
  Target,
} from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import {
  buildReviewItems,
  buildReviewTagCounts,
} from "../lib/review";
import { assessReviewValue, getReviewRatingFloor } from "../lib/planning";
import { formatNumber, normalizeTag } from "../lib/stats";
import RatingRange, { RATING_MAX, RATING_MIN } from "./RatingRange";
import ReviewProblemList from "./ReviewProblemList";
import ReviewTimeline from "./ReviewTimeline";
import Taxonomy from "./Taxonomy";

const REVIEW_PAGE_SIZE = 12;
const DEFAULT_RATING_RANGE = [RATING_MIN, RATING_MAX];
const reviewStatusOptions = [
  { id: "smart", label: "智能复习" },
  { id: "all", label: "全部已刷" },
  { id: "single", label: "仅一次 AC" },
  { id: "repeat", label: "重复 AC" },
  { id: "favorite", label: "已收藏" },
];

export default function ReviewLibrary({
  problems,
  submissionMap,
  favorites,
  user,
  studyData,
  onToggleFavorite,
  onOpenNote,
}) {
  const [viewMode, setViewMode] = useState("list");
  const [search, setSearch] = useState("");
  const [ratingRange, setRatingRange] = useState(DEFAULT_RATING_RANGE);
  const [selectedTag, setSelectedTag] = useState("all");
  const [status, setStatus] = useState("smart");
  const [sort, setSort] = useState("latest");
  const [timelineDirection, setTimelineDirection] = useState("newest");
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const deferredRatingRange = useDeferredValue(ratingRange);

  const reviewItems = useMemo(
    () => buildReviewItems(problems, submissionMap),
    [problems, submissionMap],
  );
  const smartReviewItems = useMemo(
    () =>
      reviewItems.filter((item) =>
        assessReviewValue(item.problem, item.stats, user, studyData).eligible,
      ),
    [reviewItems, user, studyData],
  );
  const smartReviewKeys = useMemo(
    () => new Set(smartReviewItems.map((item) => item.key)),
    [smartReviewItems],
  );
  const reviewRatingFloor = useMemo(
    () => getReviewRatingFloor(user, studyData),
    [user, studyData],
  );
  const reviewTagCounts = useMemo(
    () => buildReviewTagCounts(status === "smart" ? smartReviewItems : reviewItems),
    [reviewItems, smartReviewItems, status],
  );

  const filteredItems = useMemo(() => {
    const [minimum, maximum] = deferredRatingRange;
    const isFullRatingRange = minimum === RATING_MIN && maximum === RATING_MAX;
    const result = [];

    for (const item of reviewItems) {
      const { problem, stats, key } = item;
      if (status === "smart" && !smartReviewKeys.has(key)) continue;
      const rating = problem.rating;
      if (
        selectedTag !== "all" &&
        !(problem.tags || []).some((tag) => normalizeTag(tag) === selectedTag)
      ) {
        continue;
      }
      if (rating && (rating < minimum || rating > maximum)) continue;
      if (!rating && !isFullRatingRange) continue;
      if (status === "single" && stats.accepted !== 1) continue;
      if (status === "repeat" && stats.accepted <= 1) continue;
      if (status === "favorite" && !favorites.has(key)) continue;
      if (deferredSearch) {
        const haystack =
          `${problem.contestId}${problem.index} ${problem.name} ${(problem.tags || []).join(" ")}`.toLowerCase();
        if (!haystack.includes(deferredSearch)) continue;
      }
      result.push(item);
    }

    result.sort((a, b) => {
      if (sort === "firstAc") return (b.stats.firstAc || 0) - (a.stats.firstAc || 0);
      if (sort === "ratingAsc") {
        return (a.problem.rating || 0) - (b.problem.rating || 0);
      }
      if (sort === "mostRepeated") {
        return (
          b.stats.accepted - a.stats.accepted ||
          (b.stats.lastAc || 0) - (a.stats.lastAc || 0)
        );
      }
      return (b.stats.lastAc || 0) - (a.stats.lastAc || 0);
    });

    return result;
  }, [
    reviewItems,
    deferredRatingRange,
    selectedTag,
    status,
    favorites,
    deferredSearch,
    sort,
    smartReviewKeys,
  ]);

  const timelineItems = useMemo(() => {
    const ordered = [...filteredItems];
    ordered.sort((a, b) =>
      timelineDirection === "oldest"
        ? (a.stats.lastAc || 0) - (b.stats.lastAc || 0)
        : (b.stats.lastAc || 0) - (a.stats.lastAc || 0),
    );
    return ordered;
  }, [filteredItems, timelineDirection]);

  const totalPages = Math.ceil(filteredItems.length / REVIEW_PAGE_SIZE);
  const safePage = Math.min(Math.max(1, page), Math.max(1, totalPages));
  const visibleItems = filteredItems.slice(
    (safePage - 1) * REVIEW_PAGE_SIZE,
    safePage * REVIEW_PAGE_SIZE,
  );

  function resetResults(update) {
    startTransition(() => {
      update();
      setPage(1);
    });
  }

  function changeMode(nextMode) {
    startTransition(() => {
      setViewMode(nextMode);
      setPage(1);
    });
  }

  return (
    <section className="review-library" aria-label="复习库">
      <Taxonomy
        tagCounts={reviewTagCounts}
        selectedTag={selectedTag}
        onSelectTag={(tag) => resetResults(() => setSelectedTag(tag))}
        problemCount={status === "smart" ? smartReviewItems.length : reviewItems.length}
      />
      <main className="review-workspace">
        <div className="review-workspace__topline">
          <div>
            <span className="workspace-kicker">复习题目</span>
            <h2>{viewMode === "timeline" ? "复习时间轴" : "已刷题目"}</h2>
          </div>
          <span className="result-count">
            <strong>{formatNumber(filteredItems.length)}</strong>{" "}
            {status === "smart" ? "道复习候选" : "道已刷题目"}
          </span>
          <div className="review-mode-switch" role="tablist" aria-label="复习库视图">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "list"}
              className={viewMode === "list" ? "is-active" : ""}
              onClick={() => changeMode("list")}
            >
              <List size={14} />
              题目列表
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "timeline"}
              className={viewMode === "timeline" ? "is-active" : ""}
              onClick={() => changeMode("timeline")}
            >
              <History size={14} />
              时间轴
            </button>
          </div>
        </div>

        <div className="review-policy-banner">
          <Target size={16} />
          <span>
            <strong>智能复习下限 {reviewRatingFloor}</strong>
            低于当前训练价值的题不会进入自动复习；近期做错或明确标记困难的临界题会保留。
          </span>
          <small>已过滤 {reviewItems.length - smartReviewItems.length} 题</small>
        </div>

        <div className="filter-row review-filter-row">
          <label className="search-box">
            <Search size={16} />
            <input
              id="review-search"
              data-command-search
              value={search}
              onChange={(event) => resetResults(() => setSearch(event.target.value))}
              placeholder="搜索题号、题名或标签"
            />
            <kbd>Ctrl K</kbd>
          </label>
          <RatingRange
            value={ratingRange}
            onChange={(value) => resetResults(() => setRatingRange(value))}
          />
        </div>

        <div className="status-row review-status-row">
          <div className="status-tabs" role="tablist">
            {reviewStatusOptions.map((option) => (
              <button
                type="button"
                role="tab"
                aria-selected={status === option.id}
                key={option.id}
                className={status === option.id ? "is-active" : ""}
                onClick={() => resetResults(() => setStatus(option.id))}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="sort-control">
            <ArrowDownUp size={14} />
            {viewMode === "timeline" ? (
              <select
                aria-label="时间轴顺序"
                value={timelineDirection}
                onChange={(event) => setTimelineDirection(event.target.value)}
              >
                <option value="newest">时间从近到远</option>
                <option value="oldest">时间从远到近</option>
              </select>
            ) : (
              <select
                aria-label="复习题目排序"
                value={sort}
                onChange={(event) => resetResults(() => setSort(event.target.value))}
              >
                <option value="latest">最近通过</option>
                <option value="firstAc">首次通过</option>
                <option value="ratingAsc">Rating 从低到高</option>
                <option value="mostRepeated">重复 AC 优先</option>
              </select>
            )}
          </label>
        </div>

        {viewMode === "timeline" ? (
          <ReviewTimeline items={timelineItems} onOpenNote={onOpenNote} />
        ) : (
          <ReviewProblemList
            items={visibleItems}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
            onOpenNote={onOpenNote}
            page={safePage}
            totalPages={totalPages}
            totalFiltered={filteredItems.length}
            onPageChange={setPage}
          />
        )}
      </main>
    </section>
  );
}
