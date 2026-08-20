import { problemKey } from "./codeforces";
import { displayTag, normalizeTag } from "./stats";

const DAY = 86400000;
const RECOMMENDATION_PLAN_VERSION = 4;
const RECOMMENDATION_HISTORY_LIMIT = 120;
const REVIEW_RATING_GAPS = new Set([300, 400, 500, 600]);

export const ALGORITHM_FAMILIES = [
  {
    id: "dynamic",
    label: "动态规划",
    tags: ["dp", "bitmasks", "divide_and_conquer"],
  },
  {
    id: "graph",
    label: "图论与树",
    tags: [
      "graphs",
      "dfs_and_similar",
      "shortest_paths",
      "dsu",
      "trees",
      "flows",
      "graph_matchings",
      "2-sat",
    ],
  },
  {
    id: "math",
    label: "数学",
    tags: [
      "math",
      "number_theory",
      "combinatorics",
      "probabilities",
      "geometry",
      "fft",
      "matrices",
      "chinese_remainder_theorem",
    ],
  },
  {
    id: "strings",
    label: "字符串",
    tags: ["strings", "string_suffix_structures", "hashing"],
  },
  {
    id: "data",
    label: "数据结构",
    tags: ["data_structures"],
  },
  {
    id: "search",
    label: "搜索与双指针",
    tags: [
      "binary_search",
      "two_pointers",
      "meet_in_the_middle",
      "ternary_search",
      "brute_force",
    ],
  },
  {
    id: "constructive",
    label: "贪心与构造",
    tags: ["greedy", "constructive_algorithms", "sortings"],
  },
  {
    id: "implementation",
    label: "模拟与综合",
    tags: [
      "implementation",
      "schedules",
      "games",
      "interactive",
      "expression_parsing",
    ],
  },
];

const FALLBACK_FAMILY = ALGORITHM_FAMILIES.at(-1);

export const RECOMMENDATION_TIERS = [
  {
    id: "consolidate",
    label: "巩固区",
    shortLabel: "稳住手感",
    minDelta: -300,
    maxDelta: -100,
    defaultCount: 2,
    tone: "mint",
    description: "低于当前段位，适合快速复现思路与补齐基础。",
  },
  {
    id: "steady",
    label: "同段区",
    shortLabel: "主训练",
    minDelta: -100,
    maxDelta: 100,
    defaultCount: 3,
    tone: "sky",
    description: "贴近当前实力，优先补强薄弱算法与解题稳定性。",
  },
  {
    id: "challenge",
    label: "挑战区",
    shortLabel: "向上突破",
    minDelta: 100,
    maxDelta: 300,
    defaultCount: 2,
    tone: "violet",
    description: "略高于当前段位，用来接触下一阶段的组合思路。",
  },
];

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function getProblemFamily(problem) {
  const tags = new Set((problem?.tags || []).map(normalizeTag));
  return (
    ALGORITHM_FAMILIES.find((family) =>
      family.tags.some((tag) => tags.has(tag)),
    ) || FALLBACK_FAMILY
  );
}

function createDiversityState(problems = [], keys = []) {
  const lookup = new Map(
    (problems || []).map((problem) => [problemKey(problem), problem]),
  );
  const familyCounts = new Map();
  const tagCounts = new Map();
  for (const key of keys || []) {
    const problem = lookup.get(key);
    if (!problem) continue;
    const family = getProblemFamily(problem);
    familyCounts.set(family.id, (familyCounts.get(family.id) || 0) + 1);
    for (const tag of (problem.tags || []).slice(0, 3).map(normalizeTag)) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  return { familyCounts, tagCounts };
}

function recordDiversity(state, candidate) {
  state.familyCounts.set(
    candidate.family.id,
    (state.familyCounts.get(candidate.family.id) || 0) + 1,
  );
  for (const tag of candidate.normalizedTags.slice(0, 3)) {
    state.tagCounts.set(tag, (state.tagCounts.get(tag) || 0) + 1);
  }
}

function selectDiverseCandidates(candidates, count, diversityState) {
  const remaining = [...candidates];
  const selected = [];
  while (selected.length < count && remaining.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const familyCount =
        diversityState.familyCounts.get(candidate.family.id) || 0;
      const unusedTagCount = candidate.normalizedTags.filter(
        (tag) => !diversityState.tagCounts.has(tag),
      ).length;
      const diversityScore =
        (familyCount === 0 ? 96 : -familyCount * 52) +
        Math.min(3, unusedTagCount) * 13;
      const effectiveScore = candidate.score + diversityScore;
      if (
        effectiveScore > bestScore ||
        (effectiveScore === bestScore &&
          Number(candidate.problem.contestId || 0) >
            Number(remaining[bestIndex].problem.contestId || 0))
      ) {
        bestIndex = index;
        bestScore = effectiveScore;
      }
    }
    const [candidate] = remaining.splice(bestIndex, 1);
    selected.push(candidate);
    recordDiversity(diversityState, candidate);
  }
  return selected;
}

export function describeComprehensiveProblem(problem, submissionMap) {
  const family = getProblemFamily(problem);
  const normalizedTags = (problem?.tags || []).map(normalizeTag);
  const focusTag =
    normalizedTags.find((tag) => tag !== "implementation") ||
    normalizedTags[0] ||
    "implementation";
  const attempts = submissionMap.get(problemKey(problem))?.attempts || 0;
  return {
    familyId: family.id,
    familyLabel: family.label,
    focusTag,
    reason: `综合轮换 · ${family.label} · ${displayTag(focusTag)} · ${
      attempts ? `曾尝试 ${attempts} 次` : "新题优先"
    }`,
  };
}

function collectHistory(plan, extraKeys = []) {
  return [
    ...new Set([
      ...(plan?.refreshHistory || []),
      ...extraKeys,
    ]),
  ].slice(-RECOMMENDATION_HISTORY_LIMIT);
}

export function applyReviewGrade(current, grade, now = Date.now()) {
  const previous = current || {
    ease: 2.5,
    intervalDays: 0,
    repetitions: 0,
    history: [],
  };
  let ease = Number(previous.ease) || 2.5;
  let repetitions = Number(previous.repetitions) || 0;
  let intervalDays = Number(previous.intervalDays) || 0;

  if (grade === "again") {
    ease = clamp(ease - 0.2, 1.3, 3.2);
    repetitions = 0;
    intervalDays = 1;
  } else if (grade === "hard") {
    ease = clamp(ease - 0.15, 1.3, 3.2);
    repetitions += 1;
    intervalDays = clamp(Math.round(intervalDays ? intervalDays * 1.25 : 2), 2, 30);
  } else if (grade === "easy") {
    ease = clamp(ease + 0.15, 1.3, 3.2);
    repetitions += 1;
    intervalDays =
      repetitions === 1
        ? 14
        : repetitions === 2
          ? 30
          : clamp(Math.round(intervalDays * ease * 1.25), 30, 180);
  } else {
    repetitions += 1;
    intervalDays =
      repetitions === 1
        ? 5
        : repetitions === 2
          ? 14
          : clamp(Math.round(intervalDays * ease), 14, 120);
  }

  return {
    ease,
    intervalDays,
    repetitions,
    lastReviewedAt: now,
    nextReviewAt: now + intervalDays * DAY,
    lastGrade: grade,
    history: [
      ...(Array.isArray(previous.history) ? previous.history : []),
      { at: now, grade, intervalDays },
    ].slice(-50),
  };
}

function adaptiveReviewGap(rating) {
  if (rating < 1200) return 300;
  if (rating < 2000) return 400;
  if (rating < 2400) return 500;
  return 600;
}

export function getReviewRatingFloor(user, studyData = {}) {
  const rating = clamp(Number(user?.rating) || 1200, 800, 3500);
  const configuredGap = Number(studyData.settings?.reviewRatingGap) || 0;
  const gap = REVIEW_RATING_GAPS.has(configuredGap)
    ? configuredGap
    : adaptiveReviewGap(rating);
  return clamp(Math.ceil((rating - gap) / 100) * 100, 800, 3500);
}

export function assessReviewValue(
  problem,
  stats,
  user,
  studyData = {},
  now = Date.now(),
) {
  const key = problemKey(problem);
  const rating = Number(problem?.rating) || 0;
  const userRating = clamp(Number(user?.rating) || 1200, 800, 3500);
  const ratingFloor = getReviewRatingFloor(user, studyData);
  const hardFloor = Math.max(800, ratingFloor - 200);
  const difficulty = clamp(Number(studyData.notes?.[key]?.difficulty) || 3, 1, 5);
  const record = studyData.reviews?.[key];
  const mistakes = Math.max(0, Number(stats?.attempts || 0) - Number(stats?.accepted || 0));
  const recentRecovery =
    ["again", "hard"].includes(record?.lastGrade) &&
    Number(record?.lastReviewedAt || 0) >= now - 45 * DAY;
  const difficultMistake = difficulty >= 4 && mistakes >= 2;
  const exception =
    rating > 0 &&
    rating < ratingFloor &&
    rating >= hardFloor &&
    (recentRecovery || difficultMistake);

  if (!rating) {
    return {
      eligible: false,
      reason: "无 Rating 题不自动安排",
      ratingFloor,
      exception: false,
    };
  }
  if (rating < ratingFloor && !exception) {
    return {
      eligible: false,
      reason: `低于智能下限 ${ratingFloor}`,
      ratingFloor,
      exception: false,
    };
  }

  let reason = "当前水平附近";
  if (recentRecovery) reason = "上次复习仍不稳";
  else if (difficultMistake) reason = `高难笔记 · 曾错 ${mistakes} 次`;
  else if (exception) reason = "保留的临界薄弱题";
  else if (rating > userRating + 200) reason = "高位题思路回忆";
  else if (rating < userRating - 250) reason = "有效基础巩固";

  let initialIntervalDays = 7;
  if (recentRecovery || difficultMistake || mistakes >= 3) initialIntervalDays = 3;
  else if (Number(stats?.accepted || 0) >= 3) initialIntervalDays = 21;
  else if (Number(stats?.accepted || 0) >= 2) initialIntervalDays = 14;
  else if (rating < userRating - 250) initialIntervalDays = 10;

  const distance = Math.abs(rating - userRating);
  const relevance = distance <= 200 ? 28 : distance <= 400 ? 18 : 10;
  const gradeBoost = record?.lastGrade === "again"
    ? 24
    : record?.lastGrade === "hard"
      ? 13
      : record?.lastGrade === "easy"
        ? -12
        : 0;
  const priorityBase =
    relevance +
    Math.min(mistakes, 6) * 7 +
    Math.max(0, difficulty - 2) * 5 +
    gradeBoost -
    Math.min(Math.max(0, Number(stats?.accepted || 0) - 1), 4) * 6;

  return {
    eligible: true,
    reason,
    ratingFloor,
    exception,
    mistakes,
    difficulty,
    initialIntervalDays,
    priorityBase,
  };
}

export function getDueReviews(
  problems,
  submissionMap,
  user,
  studyData,
  limit = 8,
  now = Date.now(),
) {
  const due = [];
  for (const problem of problems || []) {
    const key = problemKey(problem);
    const stats = submissionMap.get(key);
    if (!stats?.accepted) continue;
    const assessment = assessReviewValue(problem, stats, user, studyData, now);
    if (!assessment.eligible) continue;
    const record = studyData.reviews?.[key];
    const naturalDueAt =
      (stats.lastAc || 0) * 1000 + assessment.initialIntervalDays * DAY;
    const dueAt = record?.nextReviewAt || naturalDueAt;
    if (dueAt > now) continue;
    const overdueDays = Math.max(0, Math.floor((now - dueAt) / DAY));
    const priority = assessment.priorityBase + Math.min(overdueDays, 60) * 3;
    due.push({
      key,
      problem,
      stats,
      record,
      dueAt,
      overdueDays,
      priority,
      family: getProblemFamily(problem),
      normalizedTags: (problem.tags || []).map(normalizeTag),
      ...assessment,
    });
  }

  const remaining = due.sort((a, b) => b.priority - a.priority || a.dueAt - b.dueAt);
  const selected = [];
  const familyCounts = new Map();
  while (selected.length < limit && remaining.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const repeatedFamily = familyCounts.get(candidate.family.id) || 0;
      const score = candidate.priority - repeatedFamily * 18;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    const [candidate] = remaining.splice(bestIndex, 1);
    selected.push(candidate);
    familyCounts.set(candidate.family.id, (familyCounts.get(candidate.family.id) || 0) + 1);
  }
  return selected;
}

export function buildMasteryStats(problems, submissionMap) {
  const tags = new Map();
  for (const problem of problems || []) {
    const stats = submissionMap.get(problemKey(problem));
    for (const rawTag of problem.tags || []) {
      const key = normalizeTag(rawTag);
      const current = tags.get(key) || {
        tag: key,
        label: displayTag(key),
        total: 0,
        attempted: 0,
        solved: 0,
        attempts: 0,
        accepted: 0,
        ratingTotal: 0,
        ratingCount: 0,
        lastAc: 0,
      };
      current.total += 1;
      if (stats?.attempts) {
        current.attempted += 1;
        current.attempts += stats.attempts;
      }
      if (stats?.accepted) {
        current.solved += 1;
        current.accepted += stats.accepted;
        current.lastAc = Math.max(current.lastAc, stats.lastAc || 0);
        if (problem.rating) {
          current.ratingTotal += problem.rating;
          current.ratingCount += 1;
        }
      }
      tags.set(key, current);
    }
  }
  return [...tags.values()]
    .map((item) => {
      const solveRate = item.attempted ? item.solved / item.attempted : 0;
      const submissionEfficiency = item.attempts ? item.accepted / item.attempts : 0;
      const breadth = Math.min(1, Math.log2(item.solved + 1) / 5);
      const activity = item.lastAc
        ? clamp(1 - (Date.now() / 1000 - item.lastAc) / (180 * 86400), 0, 1)
        : 0;
      const sampleConfidence = Math.min(1, Math.log2(item.attempted + 1) / 4);
      const mastery = clamp(
        Math.round(
          breadth * 38 +
            solveRate * 27 +
            submissionEfficiency * 20 +
            activity * 15,
        ),
        0,
        100,
      );
      const unsolvedAttempts = Math.max(0, item.attempted - item.solved);
      const failedSubmissions = Math.max(0, item.attempts - item.accepted);
      const weakness =
        (100 - mastery) * (0.55 + sampleConfidence * 0.45) +
        unsolvedAttempts * 12 +
        Math.min(30, failedSubmissions * 1.8) +
        (activity < 0.2 && item.solved ? 8 : 0);
      return {
        ...item,
        mastery,
        weakness,
        averageRating: item.ratingCount ? Math.round(item.ratingTotal / item.ratingCount) : 0,
      };
    })
    .filter((item) => item.solved || item.attempted)
    .sort((a, b) => b.mastery - a.mastery);
}

export function getRecommendationBand(user, tier) {
  const rating = clamp(Number(user?.rating) || 1200, 800, 3500);
  return {
    rating,
    minimum: clamp(rating + tier.minDelta, 800, 3500),
    maximum: clamp(rating + tier.maxDelta, 800, 3500),
  };
}

function getTierCount(studyData, tier) {
  const configured = Number(studyData.settings?.recommendationTierCounts?.[tier.id]);
  return clamp(
    Number.isFinite(configured) ? Math.round(configured) : tier.defaultCount,
    1,
    6,
  );
}

export function generateTierRecommendations(
  problems,
  submissionMap,
  user,
  studyData,
  tier,
  count = tier.defaultCount,
  seed = todayKey(),
  excludedKeys = new Set(),
  diversityState = createDiversityState(),
) {
  const mastery = buildMasteryStats(problems, submissionMap);
  const weaknessMap = new Map(mastery.map((item) => [item.tag, item.weakness]));
  const band = getRecommendationBand(user, tier);
  const target = (band.minimum + band.maximum) / 2;
  const newestContestId = Math.max(
    0,
    ...(problems || []).map((problem) => Number(problem.contestId) || 0),
  );
  const scored = [];
  for (const problem of problems || []) {
    const key = problemKey(problem);
    if (excludedKeys.has(key)) continue;
    if (submissionMap.get(key)?.accepted) continue;
    if (!problem.rating) continue;
    if (problem.rating < band.minimum || problem.rating > band.maximum) continue;
    const distance = Math.abs(problem.rating - target);
    const normalizedTags = (problem.tags || []).map(normalizeTag);
    const family = getProblemFamily(problem);
    const personalBoost = Math.min(
      14,
      Math.max(0, ...normalizedTags.map((tag) => weaknessMap.get(tag) || 0)) *
        0.12,
    );
    const attempted = submissionMap.get(key)?.attempts || 0;
    const untouchedBonus = attempted ? 0 : 16;
    const contestAge = Math.max(0, newestContestId - (Number(problem.contestId) || 0));
    const freshnessBonus = clamp(78 - contestAge * 0.3, 0, 78);
    const score =
      personalBoost +
      untouchedBonus -
      distance / 8 +
      freshnessBonus +
      (hashText(`${seed}-${tier.id}-${key}`) % 100) / 10;
    const description = describeComprehensiveProblem(problem, submissionMap);
    scored.push({
      key,
      problem,
      score,
      family,
      normalizedTags,
      ...description,
      tierId: tier.id,
    });
  }
  return selectDiverseCandidates(scored, count, diversityState)
    .sort(
      (a, b) =>
        (Number(b.problem.contestId) || 0) - (Number(a.problem.contestId) || 0) ||
        String(b.problem.index || "").localeCompare(String(a.problem.index || "")),
    );
}

export function generateTieredRecommendations(
  problems,
  submissionMap,
  user,
  studyData,
  seed = todayKey(),
  excludedKeys = new Set(),
  diversityState = createDiversityState(),
) {
  const reserved = new Set(excludedKeys);
  const result = {};
  for (const tier of RECOMMENDATION_TIERS) {
    const items = generateTierRecommendations(
      problems,
      submissionMap,
      user,
      studyData,
      tier,
      getTierCount(studyData, tier),
      seed,
      reserved,
      diversityState,
    );
    result[tier.id] = items;
    items.forEach((item) => reserved.add(item.key));
  }
  return result;
}

export function describeWeaknessProblem(
  problem,
  masteryStats,
  submissionMap,
) {
  const statByTag = new Map(
    (masteryStats || []).map((item) => [item.tag, item]),
  );
  const normalizedTags = (problem?.tags || []).map(normalizeTag);
  const weakStat = normalizedTags
    .map((tag) => statByTag.get(tag))
    .filter(Boolean)
    .sort((a, b) => b.weakness - a.weakness)[0];
  const focusTag = weakStat?.tag || normalizedTags[0] || "implementation";
  const attempts = submissionMap.get(problemKey(problem))?.attempts || 0;
  return {
    weakTag: focusTag,
    mastery: weakStat?.mastery ?? null,
    reason: weakStat
      ? `薄弱专项 · ${displayTag(focusTag)} · 掌握度 ${weakStat.mastery}%${
          attempts ? ` · 已尝试 ${attempts} 次` : ""
        }`
      : `能力采样 · ${displayTag(focusTag)} · 完成后更新薄弱画像`,
  };
}

export function generateWeaknessRecommendations(
  problems,
  submissionMap,
  user,
  studyData,
  count = 5,
  seed = todayKey(),
  excludedKeys = new Set(),
) {
  const mastery = [...buildMasteryStats(problems, submissionMap)].sort(
    (a, b) => b.weakness - a.weakness,
  );
  const fallbackProfiles = [
    "implementation",
    "math",
    "greedy",
    "dp",
    "data_structures",
  ].map((tag) => ({ tag, weakness: 48, mastery: 0 }));
  const weakProfiles = (mastery.length ? mastery : fallbackProfiles).slice(0, 6);
  const weakMap = new Map(weakProfiles.map((item) => [item.tag, item]));
  const rating = clamp(Number(user?.rating) || 1200, 800, 3500);
  const minimum = clamp(rating - 200, 800, 3500);
  const maximum = clamp(rating + 200, 800, 3500);
  const newestContestId = Math.max(
    0,
    ...(problems || []).map((problem) => Number(problem.contestId) || 0),
  );
  const candidates = [];

  for (const problem of problems || []) {
    const key = problemKey(problem);
    const stats = submissionMap.get(key);
    if (excludedKeys.has(key) || stats?.accepted || !problem.rating) continue;
    if (problem.rating < minimum || problem.rating > maximum) continue;
    const normalizedTags = (problem.tags || []).map(normalizeTag);
    const matchingProfile = normalizedTags
      .map((tag) => weakMap.get(tag))
      .filter(Boolean)
      .sort((a, b) => b.weakness - a.weakness)[0];
    if (!matchingProfile) continue;
    const family = getProblemFamily(problem);
    const contestAge = Math.max(
      0,
      newestContestId - (Number(problem.contestId) || 0),
    );
    const score =
      matchingProfile.weakness * 1.6 +
      clamp(62 - contestAge * 0.24, 0, 62) -
      Math.abs(problem.rating - rating) / 10 +
      (stats?.attempts ? Math.min(28, stats.attempts * 7) : 0) +
      (hashText(`${seed}-weak-${key}`) % 100) / 12;
    candidates.push({
      key,
      problem,
      family,
      normalizedTags,
      score,
      ...describeWeaknessProblem(problem, mastery, submissionMap),
    });
  }

  const selected = [];
  const usedKeys = new Set();
  const diversityState = createDiversityState();
  for (const profile of weakProfiles) {
    if (selected.length >= count) break;
    const matching = candidates.filter(
      (candidate) =>
        !usedKeys.has(candidate.key) &&
        candidate.normalizedTags.includes(profile.tag),
    );
    const [next] = selectDiverseCandidates(matching, 1, diversityState);
    if (!next) continue;
    selected.push(next);
    usedKeys.add(next.key);
  }
  if (selected.length < count) {
    selected.push(
      ...selectDiverseCandidates(
        candidates.filter((candidate) => !usedKeys.has(candidate.key)),
        count - selected.length,
        diversityState,
      ),
    );
  }
  return selected.sort(
    (a, b) =>
      (Number(b.problem.contestId) || 0) -
        (Number(a.problem.contestId) || 0) ||
      String(b.problem.index || "").localeCompare(
        String(a.problem.index || ""),
      ),
  );
}

export function generateSmartProblems(
  problems,
  submissionMap,
  user,
  studyData,
  count = 5,
  seed = todayKey(),
) {
  const tiered = generateTieredRecommendations(
    problems,
    submissionMap,
    user,
    studyData,
    seed,
  );
  return RECOMMENDATION_TIERS.flatMap((tier) => tiered[tier.id]).slice(0, count);
}

export function createDailyPlan(problems, submissionMap, user, studyData, regenerate = false) {
  const date = todayKey();
  if (
    !regenerate &&
    studyData.plan?.date === date &&
    studyData.plan?.recommendationVersion === RECOMMENDATION_PLAN_VERSION &&
    studyData.plan?.tierProblemKeys &&
    studyData.plan?.weaknessProblemKeys
  ) {
    return studyData.plan;
  }
  const reviewLimit = studyData.settings?.reviewLimit || 8;
  const due = getDueReviews(problems, submissionMap, user, studyData, reviewLimit);
  const previousKeys = RECOMMENDATION_TIERS.flatMap(
    (tier) => studyData.plan?.tierProblemKeys?.[tier.id] || [],
  ).concat(studyData.plan?.weaknessProblemKeys || []);
  const refreshHistory = regenerate
    ? collectHistory(studyData.plan, previousKeys)
    : collectHistory(studyData.plan);
  const refreshSerial =
    (Number(studyData.plan?.refreshSerial) || 0) + (regenerate ? 1 : 0);
  const tiered = generateTieredRecommendations(
    problems,
    submissionMap,
    user,
    studyData,
    `${date}-${refreshSerial}`,
    new Set(refreshHistory),
  );
  const tierProblemKeys = Object.fromEntries(
    RECOMMENDATION_TIERS.map((tier) => [
      tier.id,
      tiered[tier.id].map((item) => item.key),
    ]),
  );
  const recommendedKeys = RECOMMENDATION_TIERS.flatMap(
    (tier) => tierProblemKeys[tier.id],
  );
  const weakness = generateWeaknessRecommendations(
    problems,
    submissionMap,
    user,
    studyData,
    5,
    `${date}-${refreshSerial}`,
    new Set([...refreshHistory, ...recommendedKeys]),
  );
  const weaknessProblemKeys = weakness.map((item) => item.key);
  const currentKeys = [...recommendedKeys, ...weaknessProblemKeys];
  return {
    date,
    recommendationVersion: RECOMMENDATION_PLAN_VERSION,
    generatedAt: Date.now(),
    refreshSerial,
    refreshHistory,
    reviewKeys: due.map((item) => item.key),
    tierProblemKeys,
    weaknessProblemKeys,
    newProblemKeys: currentKeys,
    completedNewKeys: (studyData.plan?.completedNewKeys || []).filter((key) =>
      currentKeys.includes(key),
    ),
  };
}

export function refreshRecommendationTier(
  problems,
  submissionMap,
  user,
  studyData,
  plan,
  tierId,
) {
  const tier = RECOMMENDATION_TIERS.find((item) => item.id === tierId);
  if (!tier) return plan;
  const currentTierKeys = plan.tierProblemKeys?.[tierId] || [];
  const fixedTierKeys = RECOMMENDATION_TIERS.filter(
    (item) => item.id !== tierId,
  ).flatMap((item) => plan.tierProblemKeys?.[item.id] || []);
  const fixedKeys = [...fixedTierKeys, ...(plan.weaknessProblemKeys || [])];
  const refreshHistory = collectHistory(plan, currentTierKeys);
  const refreshSerial = (Number(plan.refreshSerial) || 0) + 1;
  const excluded = new Set([...fixedKeys, ...refreshHistory]);
  const desiredCount = getTierCount(studyData, tier);
  const diversityState = createDiversityState(problems, fixedTierKeys);
  let items = generateTierRecommendations(
    problems,
    submissionMap,
    user,
    studyData,
    tier,
    desiredCount,
    `${plan.date}-${tierId}-${refreshSerial}`,
    excluded,
    diversityState,
  );
  if (items.length < desiredCount) {
    const fallbackExcluded = new Set([...fixedKeys, ...currentTierKeys]);
    const usedKeys = new Set(items.map((item) => item.key));
    const additional = generateTierRecommendations(
      problems,
      submissionMap,
      user,
      studyData,
      tier,
      desiredCount - items.length,
      `${plan.date}-${tierId}-${refreshSerial}-fallback`,
      new Set([...fallbackExcluded, ...usedKeys]),
      diversityState,
    );
    items = [...items, ...additional];
  }
  const tierProblemKeys = {
    ...(plan.tierProblemKeys || {}),
    [tierId]: items.map((item) => item.key),
  };
  return {
    ...plan,
    generatedAt: Date.now(),
    refreshSerial,
    refreshHistory,
    tierProblemKeys,
    newProblemKeys: RECOMMENDATION_TIERS.flatMap(
      (item) => tierProblemKeys[item.id] || [],
    ).concat(plan.weaknessProblemKeys || []),
  };
}

export function refreshWeaknessRecommendations(
  problems,
  submissionMap,
  user,
  studyData,
  plan,
) {
  const currentKeys = plan.weaknessProblemKeys || [];
  const fixedKeys = RECOMMENDATION_TIERS.flatMap(
    (tier) => plan.tierProblemKeys?.[tier.id] || [],
  );
  const refreshHistory = collectHistory(plan, currentKeys);
  const refreshSerial = (Number(plan.refreshSerial) || 0) + 1;
  let items = generateWeaknessRecommendations(
    problems,
    submissionMap,
    user,
    studyData,
    5,
    `${plan.date}-weak-${refreshSerial}`,
    new Set([...fixedKeys, ...refreshHistory]),
  );
  if (items.length < 5) {
    const usedKeys = new Set(items.map((item) => item.key));
    const additional = generateWeaknessRecommendations(
      problems,
      submissionMap,
      user,
      studyData,
      5 - items.length,
      `${plan.date}-weak-${refreshSerial}-fallback`,
      new Set([...fixedKeys, ...currentKeys, ...usedKeys]),
    );
    items = [...items, ...additional];
  }
  const weaknessProblemKeys = items.map((item) => item.key);
  return {
    ...plan,
    generatedAt: Date.now(),
    refreshSerial,
    refreshHistory,
    weaknessProblemKeys,
    newProblemKeys: [...fixedKeys, ...weaknessProblemKeys],
  };
}

export function buildStudyStreak(submissions, reviews = {}) {
  const days = new Set();
  for (const submission of submissions || []) {
    if (submission.verdict !== "OK") continue;
    days.add(todayKey(new Date((submission.creationTimeSeconds || 0) * 1000)));
  }
  for (const record of Object.values(reviews || {})) {
    for (const item of record.history || []) {
      days.add(todayKey(new Date(item.at)));
    }
  }
  const cursor = new Date();
  if (!days.has(todayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(todayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function buildRatingSeries(data) {
  const history = Array.isArray(data?.ratingHistory) ? data.ratingHistory : [];
  return history.map((item) => ({
    timestamp: item.ratingUpdateTimeSeconds * 1000,
    rating: item.newRating,
    label: item.contestName,
  }));
}
