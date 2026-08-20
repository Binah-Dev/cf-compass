import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Flame,
  Medal,
  Repeat2,
  Target,
  Trophy,
} from "lucide-react";
import {
  formatNumber,
  formatPercent,
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
  heatmap,
  recentActivity,
}) {
  const currentRatingTone = ratingTone(user?.rating);
  const isEliteRatingStanding =
    ratingStanding?.position && Number(ratingStanding.topPercent) < 0.1;

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
        <div className="panel-subheading">
          <div>
            <Flame size={15} />
            <strong>最近 16 周</strong>
          </div>
          <span>{overview.monthAc} 次 AC / 本月</span>
        </div>
        <div className="heatmap">
          {heatmap.map((cell) => (
            <span
              key={cell.key}
              className={`heat-cell level-${cell.level} ${cell.future ? "is-future" : ""}`}
              title={`${cell.key} · ${cell.count} 次 AC`}
            />
          ))}
        </div>
        <div className="heatmap-legend">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i className={`heat-cell level-${level}`} key={level} />
          ))}
          <span>多</span>
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
