import { ArrowUpRight, Check, Clock3, NotebookPen, Search } from "lucide-react";
import { openProblem } from "../lib/codeforces";
import {
  formatReviewDateTime,
  groupReviewTimeline,
} from "../lib/review";
import { acCountTone, displayTag, ratingTone } from "../lib/stats";

function TimelineEvent({ item, onOpenNote }) {
  const { problem, stats } = item;
  return (
    <article className="timeline-event">
      <span className="timeline-event__check">
        <Check size={13} />
      </span>
      <span className="timeline-event__id">
        {problem.contestId}
        {problem.index}
      </span>
      <button type="button" onClick={() => openProblem(problem)}>
        <span>{problem.name}</span>
        <ArrowUpRight size={13} />
      </button>
      <span className={`rating rating--${ratingTone(problem.rating)}`}>
        {problem.rating || "—"}
      </span>
      <span className="timeline-event__tags">
        {(problem.tags || []).slice(0, 2).map((tag) => (
          <span className="table-tag" key={tag}>
            {displayTag(tag)}
          </span>
        ))}
      </span>
      <span className="timeline-event__time">
        <Clock3 size={12} />
        首次 {formatReviewDateTime(stats.firstAc)}
      </span>
      <span className="timeline-event__time">
        <Clock3 size={12} />
        最近 {formatReviewDateTime(stats.lastAc)}
      </span>
      <strong className={`ac-count ac-count--${acCountTone(stats.accepted)}`}>
        AC {stats.accepted} 次
      </strong>
      <button type="button" className="timeline-note-button" aria-label={`编辑 ${problem.name} 的笔记`} onClick={() => onOpenNote(problem)}>
        <NotebookPen size={14} />
      </button>
    </article>
  );
}

export default function ReviewTimeline({ items, onOpenNote }) {
  const groups = groupReviewTimeline(items);

  if (!groups.length) {
    return (
      <div className="review-timeline review-timeline--empty">
        <Search size={25} />
        <strong>当前筛选下没有时间轴记录</strong>
        <span>调整筛选条件后，AC 轨迹会显示在这里</span>
      </div>
    );
  }

  return (
    <div className="review-timeline" aria-label="AC 时间轴">
      {groups.map((month) => (
        <section className="timeline-month" key={month.key}>
          <h3>{month.label}</h3>
          {month.days.map((day) => (
            <div className="timeline-day" key={day.key}>
              <div className="timeline-day__label">
                <strong>{day.label}</strong>
                <span>{day.relative}</span>
              </div>
              <span className="timeline-day__rail" aria-hidden="true">
                <i />
              </span>
              <div className="timeline-day__events">
                {day.items.map((item) => (
                  <TimelineEvent key={item.key} item={item} onOpenNote={onOpenNote} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
