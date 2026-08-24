import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Medal,
  Repeat2,
  Target,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildHeatmap,
  formatNumber,
  formatPercent,
  getHeatmapYears,
  ratingTone,
  relativeTime,
} from "../lib/stats";
import { openProblem } from "../lib/codeforces";
import { RatedName, RatingScore } from "./RatingDisplay";

function rankLabel(rank) {
  return String(rank || "unrated")
    .split(" ")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

export default function ProgressPanel({
  user,
  ratingStanding,
  overview,
  submissions,
  recentActivity,
}) {
  const currentRatingTone = ratingTone(user?.rating);
  const isEliteRatingStanding =
    ratingStanding?.position && Number(ratingStanding.topPercent) < 0.1;
  const heatmapYears = useMemo(() => getHeatmapYears(submissions), [submissions]);
  const [heatmapYear, setHeatmapYear] = useState(
    () => heatmapYears.at(-1) || new Date().getFullYear(),
  );
  const [hoveredHeatCell, setHoveredHeatCell] = useState(null);
  const heatmapScrollRef = useRef(null);
  const heatmapYearStripRef = useRef(null);
  const heatmap = useMemo(
    () => buildHeatmap(submissions, heatmapYear),
    [submissions, heatmapYear],
  );

  useEffect(() => {
    if (heatmapYears.length && !heatmapYears.includes(heatmapYear)) {
      setHeatmapYear(heatmapYears.at(-1));
    }
  }, [heatmapYear, heatmapYears]);

  useEffect(() => {
    const frame = heatmapScrollRef.current;
    if (frame) frame.scrollLeft = frame.scrollWidth;
    const yearStrip = heatmapYearStripRef.current;
    const selectedYear = yearStrip?.querySelector('[aria-selected="true"]');
    if (yearStrip && selectedYear) {
      // scrollIntoView also scrolls the document viewport. After a first sync adds
      // the multi-year strip, that can shift the whole desktop UI and hide the rail.
      yearStrip.scrollLeft = Math.max(
        0,
        selectedYear.offsetLeft - (yearStrip.clientWidth - selectedYear.offsetWidth) / 2,
      );
    }
  }, [heatmapYear]);

  function selectHeatmapYear(year) {
    setHoveredHeatCell(null);
    setHeatmapYear(year);
  }

  return (
    <aside
      className={`progress-panel rating-tone-${currentRatingTone}`}
      id="progress-panel"
    >
      <div className="section-label">
        <span>个人进度</span>
        <Trophy size={15} />
      </div>

      <section className="profile-block">
        <div className="avatar-wrap">
          {user?.avatar ? (
            <img src={user.avatar} alt={`${user.handle} 的头像`} />
          ) : (
            <span>{user?.handle?.slice(0, 1)?.toUpperCase() || "C"}</span>
          )}
          <i />
        </div>
        <div className="profile-copy">
          <h3><RatedName name={user?.handle} rating={user?.rating} /></h3>
          <span className="rank-label">{rankLabel(user?.rank)}</span>
        </div>
        <div className="profile-rating">
          <span>Rating</span>
          <strong><RatingScore value={user?.rating} /></strong>
        </div>
      </section>

      <section className="profile-ranking-grid" aria-label="个人排名与题量统计">
        <article
          className={`ranking-card ranking-card--rating ${
            isEliteRatingStanding ? "is-elite" : ""
          }`}
        >
          <span className="ranking-card__icon">
            <Medal size={15} />
          </span>
          <div>
            <small>Rating 活跃榜</small>
            <strong className="ranking-card__percent">
              {ratingStanding?.position
                ? isEliteRatingStanding
                  ? `Top ${formatNumber(ratingStanding.position)}`
                  : `Top ${formatPercent(ratingStanding.topPercent)}`
                : "同步后计算"}
            </strong>
            <span className="ranking-card__position">
              {ratingStanding?.position
                ? `第 ${formatNumber(ratingStanding.position)} / ${formatNumber(
                    ratingStanding.total,
                  )} 名`
                : "近 30 天 Rated 活跃用户"}
            </span>
          </div>
        </article>
        <article
          className="ranking-card ranking-card--ac"
          title="Codeforces 官方 API 没有公开全站用户 AC 题量分布，因此这里显示可验证的唯一 AC 题数与官方题库覆盖率。"
        >
          <span className="ranking-card__icon">
            <Target size={15} />
          </span>
          <div>
            <small>AC 题量</small>
            <strong>{formatNumber(overview.solved)} 题</strong>
            <span>题库覆盖 {formatPercent(overview.progress)}</span>
          </div>
        </article>
      </section>

      <section className="progress-overview">
        <div
          className="progress-ring"
          style={{ "--progress": `${Math.max(2, overview.progress)}%` }}
          aria-label={`完成进度 ${overview.progress}%`}
        >
          <div>
            <strong>{formatPercent(overview.progress)}</strong>
            <span>题库覆盖</span>
          </div>
        </div>
        <div className="progress-metrics">
          <div>
            <span className="metric-icon metric-icon--green">
              <CheckCircle2 size={14} />
            </span>
            <span>已解决</span>
            <strong>{formatNumber(overview.solved)}</strong>
          </div>
          <div>
            <span className="metric-icon metric-icon--amber">
              <CalendarDays size={14} />
            </span>
            <span>本月</span>
            <strong>{formatNumber(overview.monthNew)}</strong>
          </div>
          <div>
            <span className="metric-icon metric-icon--cyan">
              <Repeat2 size={14} />
            </span>
            <span>重复 AC</span>
            <strong>{formatNumber(overview.repeatAc)}</strong>
          </div>
        </div>
      </section>

      <section className="heatmap-block">
        <div className="heatmap-summary">
          <span><strong>{overview.monthAc}</strong> 次 AC / 本月</span>
        </div>
        {heatmapYears.length > 1 ? (
          <div className="heatmap-year-strip" ref={heatmapYearStripRef} aria-label="选择热力图年份">
            {heatmapYears.map((year) => (
              <button
                type="button"
                aria-selected={year === heatmapYear}
                className={year === heatmapYear ? "is-active" : ""}
                key={year}
                onClick={() => selectHeatmapYear(year)}
              >{year}</button>
            ))}
          </div>
        ) : null}
        <div
          className="heatmap-scroll"
          ref={heatmapScrollRef}
          onMouseLeave={() => setHoveredHeatCell(null)}
        >
          <div className="heatmap-canvas">
            <div className="heatmap-months" aria-hidden="true">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => (
                <span key={month}>{month}月</span>
              ))}
            </div>
            <div className="heatmap-frame">
              <div className="heatmap" role="grid" aria-label={`${heatmapYear} 年首次通过题目热力图`}>
                {heatmap.map((cell) => (
                  <span
                    key={cell.key}
                    role="gridcell"
                    className={`heat-cell level-${cell.level} ${cell.future ? "is-future" : ""} ${cell.blank ? "is-blank" : ""}`}
                    aria-label={cell.blank ? undefined : `${cell.key}，首次通过 ${cell.count} 道题`}
                    onMouseEnter={() => !cell.blank && setHoveredHeatCell(cell)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        {hoveredHeatCell ? (
          <div className="heatmap-tooltip" role="tooltip">
            <strong>{hoveredHeatCell.key}</strong>
            <span>首次通过 {hoveredHeatCell.count} 道题</span>
          </div>
        ) : null}
        <div className="heatmap-legend">
          {["0", "1", "2", "3+"].map((label, level) => (
            <span className="heatmap-legend__item" key={label}>
              <i className={`heat-cell level-${level}`} />{label}
            </span>
          ))}
        </div>
      </section>

      <section className="recent-block">
        <div className="panel-subheading">
          <strong>最近通过</strong>
          <span>最近活动</span>
        </div>
        <div className="recent-list">
          {recentActivity.length ? (
            recentActivity.map(({ problem, timestamp }) => (
              <button type="button" key={`${problem.contestId}-${problem.index}`} onClick={() => openProblem(problem)}>
                <span className="recent-check">
                  <CheckCircle2 size={15} />
                </span>
                <span className="recent-copy">
                  <strong>{problem.name}</strong>
                  <small>
                    {problem.contestId}
                    {problem.index} · {relativeTime(timestamp)}
                  </small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))
          ) : (
            <div className="recent-empty">同步后显示最近通过的题目</div>
          )}
        </div>
      </section>
    </aside>
  );
}
