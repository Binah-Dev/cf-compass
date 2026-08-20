import {
  ArrowDownUp,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  Star,
} from "lucide-react";
import { acCountTone, displayTag, formatNumber, ratingTone } from "../lib/stats";
import { openProblem, problemKey } from "../lib/codeforces";
import RatingRange from "./RatingRange";

const statusOptions = [
  { id: "all", label: "全部题目" },
  { id: "unsolved", label: "未通过" },
  { id: "solved", label: "已通过" },
  { id: "favorite", label: "已收藏" },
];

function ProblemRow({ problem, stats, isFavorite, onToggleFavorite }) {
  const key = problemKey(problem);
  const solved = Boolean(stats?.accepted);
  return (
    <div className="problem-row" role="row">
      <button
        type="button"
        className={`favorite-button ${isFavorite ? "is-active" : ""}`}
        aria-label={isFavorite ? "取消收藏" : "收藏题目"}
        onClick={() => onToggleFavorite(key)}
      >
        <Star size={15} fill={isFavorite ? "currentColor" : "none"} />
      </button>
      <button type="button" className="problem-id" onClick={() => openProblem(problem)}>
        {problem.contestId}
        {problem.index}
      </button>
      <button type="button" className="problem-name" onClick={() => openProblem(problem)}>
        <span>{problem.name}</span>
        <ArrowUpRight size={14} />
      </button>
      <div>
        <span className={`rating rating--${ratingTone(problem.rating)}`}>
          {problem.rating || "—"}
        </span>
      </div>
      <div className="tag-stack">
        {(problem.tags || []).slice(0, 2).map((tag) => (
          <span className="table-tag" key={tag}>
            {displayTag(tag)}
          </span>
        ))}
        {(problem.tags || []).length > 2 ? (
          <span className="table-tag table-tag--more">+{problem.tags.length - 2}</span>
        ) : null}
      </div>
      <div className={`solve-state ${solved ? "is-solved" : ""}`}>
        <span>{solved ? <Check size={12} /> : null}</span>
        {solved ? "已通过" : stats?.attempts ? "尝试过" : "未通过"}
      </div>
      <div className={`solve-count ac-count ac-count--${acCountTone(stats?.accepted)}`}>
        <strong>{stats?.accepted || 0}</strong>
        <span>次</span>
      </div>
    </div>
  );
}

export default function ProblemWorkspace({
  problems,
  totalFiltered,
  submissionMap,
  favorites,
  onToggleFavorite,
  search,
  onSearchChange,
  ratingRange,
  onRatingRangeChange,
  statusFilter,
  onStatusChange,
  sort,
  onSortChange,
  page,
  totalPages,
  onPageChange,
  selectedTagLabel,
}) {
  return (
    <main className="problem-workspace">
      <div className="workspace-topline">
        <div>
          <span className="workspace-kicker">当前题单</span>
          <h2>{selectedTagLabel}</h2>
        </div>
        <span className="result-count">
          <strong>{formatNumber(totalFiltered)}</strong> 道匹配题目
        </span>
      </div>

      <div className="filter-row">
        <label className="search-box">
          <Search size={16} />
          <input
            id="problem-search"
            data-command-search
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索题号、题名或标签"
          />
          <kbd>Ctrl K</kbd>
        </label>
        <RatingRange value={ratingRange} onChange={onRatingRangeChange} />
      </div>

      <div className="status-row">
        <div className="status-tabs" role="tablist">
          {statusOptions.map((option) => (
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === option.id}
              key={option.id}
              className={statusFilter === option.id ? "is-active" : ""}
              onClick={() => onStatusChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="sort-control">
          <ArrowDownUp size={14} />
          <select value={sort} onChange={(event) => onSortChange(event.target.value)}>
            <option value="ratingAsc">Rating 从低到高</option>
            <option value="ratingDesc">Rating 从高到低</option>
            <option value="newest">题号从新到旧</option>
            <option value="mostSolved">重复 AC 优先</option>
          </select>
        </label>
      </div>

      <div className="problem-table" role="table" aria-label="Codeforces 题目列表">
        <div className="problem-table__header" role="row">
          <span />
          <span>题号</span>
          <span>题目</span>
          <span>Rating</span>
          <span>标签</span>
          <span>状态</span>
          <span>通过次数</span>
        </div>
        <div className="problem-table__body">
          {problems.length ? (
            problems.map((problem) => (
              <ProblemRow
                key={problemKey(problem)}
                problem={problem}
                stats={submissionMap.get(problemKey(problem))}
                isFavorite={favorites.has(problemKey(problem))}
                onToggleFavorite={onToggleFavorite}
              />
            ))
          ) : (
            <div className="empty-state">
              <Search size={25} />
              <strong>没有找到匹配的题目</strong>
              <span>试试调整 Rating、状态或搜索关键词</span>
            </div>
          )}
        </div>
      </div>

      <footer className="table-footer">
        <span>
          第 {totalPages ? page : 0} / {totalPages} 页
        </span>
        <div className="pagination">
          <button
            type="button"
            aria-label="上一页"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>{page}</span>
          <button
            type="button"
            aria-label="下一页"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </footer>
    </main>
  );
}
