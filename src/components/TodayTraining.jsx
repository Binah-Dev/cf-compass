import {
  ArrowUpRight,
  BookOpenCheck,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  NotebookPen,
  Radar,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { useMemo } from "react";
import { openProblem, problemKey } from "../lib/codeforces";
import {
  applyReviewGrade,
  buildMasteryStats,
  buildStudyStreak,
  createDailyPlan,
  describeComprehensiveProblem,
  describeWeaknessProblem,
  getRecommendationBand,
  getDueReviews,
  getReviewRatingFloor,
  RECOMMENDATION_TIERS,
  refreshRecommendationTier,
  refreshWeaknessRecommendations,
} from "../lib/planning";
import { acCountTone, displayTag, ratingTone } from "../lib/stats";
import { RatingScore } from "./RatingDisplay";

const gradeButtons = [
  { id: "again", label: "重来", hint: "1 天", tone: "red" },
  { id: "hard", label: "困难", hint: "稍后", tone: "amber" },
  { id: "good", label: "掌握", hint: "按节奏", tone: "green" },
  { id: "easy", label: "轻松", hint: "拉长间隔", tone: "blue" },
];

function MiniStat({ Icon, label, value, tone }) {
  return (
    <div className="training-stat">
      <span className={`stat-icon stat-icon--${tone}`}>
        <Icon size={17} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function ProblemIdentity({ problem }) {
  return (
    <button type="button" className="training-problem-name" onClick={() => openProblem(problem)}>
      <span className="training-problem-id">
        {problem.contestId}
        {problem.index}
      </span>
      <strong>{problem.name}</strong>
      <ArrowUpRight size={14} />
    </button>
  );
}

export default function TodayTraining({
  data,
  submissionMap,
  studyData,
  onStudyChange,
  onOpenNote,
}) {
  const problems = data.problems || [];
  const problemLookup = useMemo(
    () => new Map(problems.map((problem) => [problemKey(problem), problem])),
    [problems],
  );
  const plan = useMemo(
    () => createDailyPlan(problems, submissionMap, data.user, studyData),
    [problems, submissionMap, data.user, studyData],
  );
  const dueItems = useMemo(() => {
    const all = getDueReviews(problems, submissionMap, data.user, studyData, 100);
    const lookup = new Map(all.map((item) => [item.key, item]));
    return (plan.reviewKeys || []).map((key) => lookup.get(key)).filter(Boolean);
  }, [problems, submissionMap, data.user, studyData, plan]);
  const reviewRatingFloor = useMemo(
    () => getReviewRatingFloor(data.user, studyData),
    [data.user, studyData],
  );
  const masteryStats = useMemo(
    () => buildMasteryStats(problems, submissionMap),
    [problems, submissionMap],
  );
  const tierItems = useMemo(
    () =>
      Object.fromEntries(
        RECOMMENDATION_TIERS.map((tier) => [
          tier.id,
          (plan.tierProblemKeys?.[tier.id] || [])
            .map((key) => {
              const problem = problemLookup.get(key);
              return problem
                ? {
                    key,
                    problem,
                    ...describeComprehensiveProblem(problem, submissionMap),
                  }
                : null;
            })
            .filter(Boolean),
        ]),
      ),
    [plan.tierProblemKeys, problemLookup, submissionMap],
  );
  const weaknessItems = useMemo(
    () =>
      (plan.weaknessProblemKeys || [])
        .map((key) => {
          const problem = problemLookup.get(key);
          return problem
            ? {
                key,
                problem,
                ...describeWeaknessProblem(
                  problem,
                  masteryStats,
                  submissionMap,
                ),
              }
            : null;
        })
        .filter(Boolean),
    [
      plan.weaknessProblemKeys,
      problemLookup,
      masteryStats,
      submissionMap,
    ],
  );
  const newItems = RECOMMENDATION_TIERS.flatMap(
    (tier) => tierItems[tier.id] || [],
  );
  const algorithmCoverage = new Set(
    newItems.map((item) => item.familyId).filter(Boolean),
  ).size;
  const weakestStats = useMemo(
    () => [...masteryStats].sort((a, b) => b.weakness - a.weakness).slice(0, 4),
    [masteryStats],
  );
  const completed = new Set(plan.completedNewKeys || []);
  const completedMainCount = newItems.filter((item) =>
    completed.has(item.key),
  ).length;
  const reviewedToday = Object.values(studyData.reviews || {}).filter(
    (record) => record.lastReviewedAt && new Date(record.lastReviewedAt).toDateString() === new Date().toDateString(),
  ).length;

  function ensurePlan(nextPlan = plan) {
    if (studyData.plan?.date === nextPlan.date && studyData.plan === nextPlan) return studyData;
    return { ...studyData, plan: nextPlan };
  }

  function gradeReview(item, grade) {
    const currentPlan = { ...plan, reviewKeys: plan.reviewKeys.filter((key) => key !== item.key) };
    onStudyChange({
      ...ensurePlan(currentPlan),
      reviews: {
        ...studyData.reviews,
        [item.key]: applyReviewGrade(studyData.reviews?.[item.key], grade),
      },
      plan: currentPlan,
    }, `已记录「${item.problem.name}」的复习反馈`);
  }

  function toggleCompleted(key) {
    const nextCompleted = new Set(plan.completedNewKeys || []);
    nextCompleted.has(key) ? nextCompleted.delete(key) : nextCompleted.add(key);
    onStudyChange(
      { ...ensurePlan(plan), plan: { ...plan, completedNewKeys: [...nextCompleted] } },
      nextCompleted.has(key) ? "已完成今日新题" : "已取消完成标记",
    );
  }

  function regenerate() {
    const nextPlan = createDailyPlan(problems, submissionMap, data.user, studyData, true);
    onStudyChange({ ...studyData, plan: nextPlan }, "三个难度档位已全部更新");
  }

  function refreshTier(tierId) {
    const nextPlan = refreshRecommendationTier(
      problems,
      submissionMap,
      data.user,
      studyData,
      plan,
      tierId,
    );
    const tier = RECOMMENDATION_TIERS.find((item) => item.id === tierId);
    onStudyChange(
      { ...studyData, plan: nextPlan },
      `${tier?.label || "推荐"}已换一组`,
    );
  }

  function refreshWeakness() {
    const nextPlan = refreshWeaknessRecommendations(
      problems,
      submissionMap,
      data.user,
      studyData,
      plan,
    );
    onStudyChange(
      { ...studyData, plan: nextPlan },
      "薄弱题单已换一组，并避开刚才的题目",
    );
  }

  function changeTierCount(tierId, delta) {
    const current =
      studyData.settings?.recommendationTierCounts?.[tierId] ||
      RECOMMENDATION_TIERS.find((item) => item.id === tierId)?.defaultCount ||
      2;
    const nextCount = Math.min(6, Math.max(1, current + delta));
    if (nextCount === current) return;
    const nextStudy = {
      ...studyData,
      settings: {
        ...studyData.settings,
        recommendationTierCounts: {
          ...studyData.settings?.recommendationTierCounts,
          [tierId]: nextCount,
        },
      },
    };
    const nextPlan = createDailyPlan(
      problems,
      submissionMap,
      data.user,
      nextStudy,
      true,
    );
    onStudyChange(
      { ...nextStudy, plan: nextPlan },
      `每日推荐数量已调整为 ${nextCount} 道`,
    );
  }

  return (
    <section className="feature-page today-page">
      <div className="training-stats">
        <MiniStat Icon={RotateCcw} label="待复习" value={dueItems.length} tone="blue" />
        <MiniStat
          Icon={Sparkles}
          label="今日新题"
          value={newItems.length + weaknessItems.length}
          tone="amber"
        />
        <MiniStat
          Icon={Check}
          label="今日已完成"
          value={reviewedToday + completed.size}
          tone="green"
        />
        <MiniStat
          Icon={Flame}
          label="连续学习"
          value={`${buildStudyStreak(data.submissions, studyData.reviews)} 天`}
          tone="cyan"
        />
        <div className="training-stats__note">
          <BrainCircuit size={16} />
          计划会根据复习表现持续调整
        </div>
      </div>

      <div className="training-grid">
        <section className="feature-card review-queue">
          <header className="feature-card__header">
            <div>
              <span className="workspace-kicker">间隔复习</span>
              <h2>今天该巩固的题</h2>
            </div>
            <div className="review-queue__policy">
              <span className="soft-badge">{dueItems.length} 道到期</span>
              <small>智能下限 {reviewRatingFloor}</small>
            </div>
          </header>
          <div className="review-queue__body">
            {dueItems.length ? (
              dueItems.map((item) => (
                <article className="review-queue-item" key={item.key}>
                  <div className="review-queue-item__main">
                    <ProblemIdentity problem={item.problem} />
                    <div className="training-meta">
                      <span className={`rating rating--${ratingTone(item.problem.rating)}`}>
                        {item.problem.rating || "—"}
                      </span>
                      {(item.problem.tags || []).slice(0, 2).map((tag) => (
                        <span className="table-tag" key={tag}>{displayTag(tag)}</span>
                      ))}
                      <span>{item.overdueDays ? `逾期 ${item.overdueDays} 天` : "今天到期"}</span>
                      <span className="review-value-reason">{item.reason}</span>
                      <span className={`ac-count ac-count--${acCountTone(item.stats.accepted)}`}>
                        AC {item.stats.accepted} 次
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-note-button"
                    aria-label={`编辑 ${item.problem.name} 的笔记`}
                    onClick={() => onOpenNote(item.problem)}
                  >
                    <NotebookPen size={15} />
                  </button>
                  <div className="review-grade" aria-label="复习反馈">
                    {gradeButtons.map((grade) => (
                      <button
                        type="button"
                        key={grade.id}
                        className={`review-grade__${grade.tone}`}
                        onClick={() => gradeReview(item, grade.id)}
                      >
                        <strong>{grade.label}</strong>
                        <span>{grade.hint}</span>
                      </button>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <div className="feature-empty">
                <BookOpenCheck size={30} />
                <strong>今天的复习已经清空</strong>
                <span>低价值简单题已跳过；错得多或标记困难的临界题仍会保留。</span>
              </div>
            )}
          </div>
        </section>

        <section className="feature-card weakness-plan">
          <header className="feature-card__header">
            <div>
              <span className="workspace-kicker">独立薄弱题单</span>
              <h2>专门补齐短板</h2>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={refreshWeakness}
              aria-label="刷新薄弱题单"
            >
              <RefreshCw size={14} />
              换一组
            </button>
          </header>
          <div className="weakness-overview">
            <Radar size={18} />
            <div>
              <strong>只负责弱项，不干扰综合推荐</strong>
              <span>结合失败提交、通过率和近期练习活跃度生成</span>
            </div>
          </div>
          <div className="weakness-tags" aria-label="当前薄弱算法">
            {weakestStats.map((item) => (
              <span key={item.tag}>
                {displayTag(item.tag)}
                <small>{item.mastery}%</small>
              </span>
            ))}
          </div>
          <div className="weakness-problems">
            {weaknessItems.length ? (
              weaknessItems.map((item, index) => (
                <article
                  className={`smart-problem weakness-problem ${
                    completed.has(item.key) ? "is-complete" : ""
                  }`}
                  data-problem-key={item.key}
                  data-weak-tag={item.weakTag}
                  key={item.key}
                >
                  <span className="smart-problem__index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="smart-problem__copy">
                    <ProblemIdentity problem={item.problem} />
                    <span>{item.reason}</span>
                  </div>
                  <span
                    className={`rating rating--${ratingTone(
                      item.problem.rating,
                    )}`}
                  >
                    {item.problem.rating}
                  </span>
                  <button
                    type="button"
                    className={`complete-button ${
                      completed.has(item.key) ? "is-complete" : ""
                    }`}
                    onClick={() => toggleCompleted(item.key)}
                    aria-label={
                      completed.has(item.key) ? "取消完成" : "标记完成"
                    }
                  >
                    {completed.has(item.key) ? (
                      <Check size={15} />
                    ) : (
                      <Target size={15} />
                    )}
                  </button>
                </article>
              ))
            ) : (
              <div className="feature-empty feature-empty--compact">
                <Radar size={26} />
                <strong>正在积累薄弱画像</strong>
                <span>继续同步提交记录后会自动生成专项题单。</span>
              </div>
            )}
          </div>
        </section>

        <section className="feature-card smart-plan">
          <header className="feature-card__header">
            <div>
              <span className="workspace-kicker">三段式推荐题单</span>
              <h2>从稳住手感到向上突破</h2>
            </div>
            <button type="button" className="ghost-button" onClick={regenerate}>
              <RefreshCw size={14} />
              全部换一组
            </button>
          </header>
          <div className="recommendation-brief">
            <div>
              <span>你的当前 Rating</span>
              <strong><RatingScore value={data.user?.rating || 1200} /></strong>
            </div>
            <p>
              综合轮换不同算法家族，兼顾新题、Rating 匹配和少量个人数据；
              当前覆盖 <strong>{algorithmCoverage}</strong> 类算法。
            </p>
            <span className="recommendation-progress">
              {completedMainCount}/{newItems.length} 已完成
            </span>
          </div>
          <div className="recommendation-lanes">
            {RECOMMENDATION_TIERS.map((tier) => {
              const items = tierItems[tier.id] || [];
              const band = getRecommendationBand(data.user, tier);
              const desiredCount =
                studyData.settings?.recommendationTierCounts?.[tier.id] ||
                tier.defaultCount;
              return (
                <section
                  className={`recommendation-lane recommendation-lane--${tier.tone}`}
                  key={tier.id}
                >
                  <header className="recommendation-lane__header">
                    <div className="recommendation-lane__identity">
                      <span className="recommendation-lane__delta">
                        {tier.minDelta > 0 ? "+" : ""}
                        {tier.minDelta} ～ {tier.maxDelta > 0 ? "+" : ""}
                        {tier.maxDelta}
                      </span>
                      <div>
                        <strong>{tier.label}</strong>
                        <span>{tier.shortLabel}</span>
                      </div>
                    </div>
                    <div className="recommendation-lane__controls">
                      <span className="recommendation-band">
                        <RatingScore value={Math.ceil(band.minimum / 100) * 100} />
                        <span aria-hidden="true">–</span>
                        <RatingScore value={Math.floor(band.maximum / 100) * 100} />
                      </span>
                      <div className="recommendation-count" aria-label={`${tier.label}每日数量`}>
                        <button
                          type="button"
                          aria-label={`减少${tier.label}题目`}
                          onClick={() => changeTierCount(tier.id, -1)}
                        >
                          <ChevronDown size={13} />
                        </button>
                        <strong>{desiredCount}</strong>
                        <button
                          type="button"
                          aria-label={`增加${tier.label}题目`}
                          onClick={() => changeTierCount(tier.id, 1)}
                        >
                          <ChevronUp size={13} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="lane-refresh"
                        onClick={() => refreshTier(tier.id)}
                        aria-label={`刷新${tier.label}`}
                      >
                        <RefreshCw size={13} />
                      </button>
                    </div>
                  </header>
                  <p className="recommendation-lane__description">{tier.description}</p>
                  <div className="recommendation-lane__problems">
                    {items.length ? (
                      items.map((item, index) => (
                        <article
                          className={`smart-problem ${
                            completed.has(item.key) ? "is-complete" : ""
                          }`}
                          data-family={item.familyId}
                          data-problem-key={item.key}
                          key={item.key}
                        >
                          <span className="smart-problem__index">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div className="smart-problem__copy">
                            <ProblemIdentity problem={item.problem} />
                            <span>{item.reason}</span>
                          </div>
                          <span className={`rating rating--${ratingTone(item.problem.rating)}`}>
                            {item.problem.rating}
                          </span>
                          <button
                            type="button"
                            className={`complete-button ${
                              completed.has(item.key) ? "is-complete" : ""
                            }`}
                            onClick={() => toggleCompleted(item.key)}
                            aria-label={completed.has(item.key) ? "取消完成" : "标记完成"}
                          >
                            {completed.has(item.key) ? <Check size={15} /> : <Target size={15} />}
                          </button>
                        </article>
                      ))
                    ) : (
                      <div className="recommendation-lane__empty">
                        当前档位暂无未通过题目，可同步题库后重试。
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
