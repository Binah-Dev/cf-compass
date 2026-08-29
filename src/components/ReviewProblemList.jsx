import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  Star,
  NotebookPen,
} from "lucide-react";
import { openProblem } from "../lib/codeforces";
import { formatReviewDate } from "../lib/review";
import { acCountTone, displayTag, ratingTone } from "../lib/stats";
import PlanQueueButton from "./PlanQueueButton";

function ReviewProblemRow({ item, isFavorite, onToggleFavorite, onOpenNote, plannedKeys, onAddToPlan }) {
  const { key, problem, stats } = item;
  return (
    <div className="review-row" role="row">
      <div className="review-row-actions">
        <button
          type="button"
          className={`favorite-button ${isFavorite ? "is-active" : ""}`}
          aria-label={isFavorite ? "取消收藏" : "收藏题目"}
          onClick={() => onToggleFavorite(key)}
        >
          <Star size={15} fill={isFavorite ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          className="favorite-button note-button"
          aria-label={`编辑 ${problem.name} 的笔记`}
          onClick={() => onOpenNote(problem)}
        >
          <NotebookPen size={14} />
        </button>
        <PlanQueueButton problem={problem} plannedKeys={plannedKeys} onAddToPlan={onAddToPlan} compact />
      </div>
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
      <time dateTime={new Date(stats.firstAc * 1000).toISOString()}>
        {formatReviewDate(stats.firstAc)}
      </time>
      <time
        className="review-row__latest"
        dateTime={new Date(stats.lastAc * 1000).toISOString()}
      >
        {formatReviewDate(stats.lastAc)}
      </time>
      <strong className={`ac-count ac-count--${acCountTone(stats.accepted)}`}>
        {stats.accepted} 次
      </strong>
    </div>
  );
}

export default function ReviewProblemList({
  items,
  favorites,
  onToggleFavorite,
  onOpenNote,
  page,
  totalPages,
  totalFiltered,
  onPageChange,
  plannedKeys,
  onAddToPlan,
}) {
  return (
    <>
      <div className="review-list" role="table" aria-label="已刷题目列表">
        <div className="review-list__header" role="row">
          <span />
          <span>题号</span>
          <span>题目</span>
          <span>Rating</span>
          <span>标签</span>
          <span>首次通过</span>
          <span>最近通过</span>
          <span>AC 次数</span>
        </div>
        <div className="review-list__body">
          {items.length ? (
            items.map((item) => (
              <ReviewProblemRow
                key={item.key}
                item={item}
                isFavorite={favorites.has(item.key)}
                onToggleFavorite={onToggleFavorite}
                onOpenNote={onOpenNote}
                plannedKeys={plannedKeys}
                onAddToPlan={onAddToPlan}
              />
            ))
          ) : (
            <div className="empty-state">
              <Search size={25} />
              <strong>没有找到匹配的已刷题目</strong>
              <span>试试调整 Rating、算法分类或搜索关键词</span>
            </div>
          )}
        </div>
      </div>
      <footer className="review-footer">
        <span>
          第 {totalPages ? page : 0} / {totalPages} 页，共 {totalFiltered} 题
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
    </>
  );
}
