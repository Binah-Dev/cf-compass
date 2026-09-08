const MAX_CANDIDATES = 60;
const MAX_RECOMMENDATIONS = 8;
const SLOW_SOLVE_RATIO = 0.55;

function problemKey(problem) {
  const contestId = Number(problem?.contestId);
  const index = String(problem?.index || "").trim().toUpperCase();
  return Number.isFinite(contestId) && index ? `${contestId}-${index}` : "";
}

function tagsOf(problem) {
  return [...new Set((Array.isArray(problem?.tags) ? problem.tags : []).map(String).filter(Boolean))];
}

function buildTargets(contest) {
  const problems = Array.isArray(contest?.problems) ? contest.problems : [];
  const duration = Math.max(1, Number(contest?.durationSeconds) || 7200);
  const targets = [];
  let highestSolved = -1;
  problems.forEach((problem, order) => {
    const key = problemKey(problem);
    if (!key) return;
    const attempts = Math.max(0, Number(problem.contestAttempts) || 0);
    const solved = problem.contestResult === "accepted" || problem.currentStatus === "contest-ac";
    if (solved) highestSolved = order;
    if (!solved) {
      targets.push({ key, problem, order, type: attempts ? "unsolved" : "frontier", evidence: attempts ? `比赛中尝试 ${attempts} 次仍未通过` : "比赛中尚未通过" });
    } else if (attempts > 1) {
      targets.push({ key, problem, order, type: "corrected", evidence: `经过 ${attempts} 次提交后通过` });
    } else if (Number(problem.firstAcTimeSeconds) / duration >= SLOW_SOLVE_RATIO) {
      targets.push({ key, problem, order, type: "slow", evidence: `在比赛进行 ${Math.round(Number(problem.firstAcTimeSeconds) / 60)} 分钟后通过` });
    }
  });
  const bridge = problems[highestSolved + 1];
  if (bridge) {
    const key = problemKey(bridge);
    if (key && !targets.some((target) => target.key === key)) {
      targets.unshift({ key, problem: bridge, order: highestSolved + 1, type: "bridge", evidence: "作为已通过题目之后的下一档衔接题" });
    }
  }
  if (!targets.length && problems.length) {
    const problem = problems[problems.length - 1];
    targets.push({ key: problemKey(problem), problem, order: problems.length - 1, type: "reinforce", evidence: "巩固本场最高进度题" });
  }
  return targets.filter((target) => target.key && Number(target.problem?.rating) > 0 && tagsOf(target.problem).length);
}

function ratingWindow(type) {
  return ["unsolved", "frontier", "bridge"].includes(type) ? [-300, 150] : [-150, 250];
}

function buildCandidatePool({ contest, problems, solvedKeys = [], plannedKeys = [] }) {
  const startedAt = Date.now();
  const library = Array.isArray(problems) ? problems : [];
  const metadata = new Map(library.map(problem => [problemKey(problem), problem]));
  const enrichedContest = { ...contest, problems: (contest?.problems || []).map(problem => {
    const known = metadata.get(problemKey(problem));
    return { ...problem,
      rating: Number(problem.rating) > 0 ? problem.rating : known?.rating,
      tags: tagsOf(problem).length ? problem.tags : known?.tags,
    };
  }) };
  const targets = buildTargets(enrichedContest);
  const excluded = new Set([...solvedKeys, ...plannedKeys].map(String));
  (contest?.problems || []).forEach((problem) => excluded.add(problemKey(problem)));
  const bestByKey = new Map();
  for (const candidate of Array.isArray(problems) ? problems : []) {
    const key = problemKey(candidate);
    const rating = Number(candidate?.rating);
    const candidateTags = tagsOf(candidate);
    if (!key || Number(candidate?.contestId) === Number(contest?.contestId) || excluded.has(key) || !rating || !candidateTags.length) continue;
    for (const target of targets) {
      const targetRating = Number(target.problem.rating);
      const [low, high] = ratingWindow(target.type);
      const gap = rating - targetRating;
      if (gap < low || gap > high) continue;
      const overlap = candidateTags.filter((tag) => tagsOf(target.problem).includes(tag));
      if (!overlap.length) continue;
      const tagScore = overlap.length / Math.max(1, new Set([...candidateTags, ...tagsOf(target.problem)]).size);
      const ratingScore = Math.max(0, 1 - Math.abs(gap) / Math.max(Math.abs(low), Math.abs(high), 1));
      const intentBoost = ["unsolved", "bridge"].includes(target.type) ? 0.12 : target.type === "corrected" ? 0.08 : 0.04;
      const score = tagScore * 0.58 + ratingScore * 0.3 + intentBoost;
      const item = {
        id: key,
        problemKey: key,
        contestId: Number(candidate.contestId),
        index: String(candidate.index),
        name: String(candidate.name || ""),
        rating,
        tags: candidateTags.slice(0, 12),
        sourceProblemKey: target.key,
        targetType: target.type,
        evidence: target.evidence,
        sharedTags: overlap.slice(0, 6),
        score: Number(score.toFixed(5)),
        scoreBreakdown: { tagOverlap: Number(tagScore.toFixed(5)), ratingFit: Number(ratingScore.toFixed(5)), intentBoost },
      };
      if (!bestByKey.has(key) || bestByKey.get(key).score < score) bestByKey.set(key, item);
    }
  }
  const contestCounts = new Map();
  const candidates = [...bestByKey.values()].sort((a, b) => b.score - a.score || a.problemKey.localeCompare(b.problemKey)).filter((item) => {
    const count = contestCounts.get(item.contestId) || 0;
    if (count >= 2) return false;
    contestCounts.set(item.contestId, count + 1);
    return true;
  }).slice(0, MAX_CANDIDATES);
  const emptyReason = !library.length ? 'library-empty' : !targets.length ? 'target-metadata-missing' : !candidates.length ? 'no-eligible-candidates' : null;
  return { targets, candidates, emptyReason, libraryCount: library.length, latencyMs: Date.now() - startedAt };
}

function normalizeRecommendations(input, candidates) {
  const byId = new Map((candidates || []).map((candidate) => [candidate.id, candidate]));
  const source = Array.isArray(input) ? input : (Array.isArray(input?.recommendations) ? input.recommendations : []);
  const seen = new Set();
  return source.slice(0, MAX_RECOMMENDATIONS * 2).map((item) => {
    const id = String(item?.id || item?.problemKey || "").trim().toUpperCase();
    const trusted = byId.get(id);
    if (!trusted || seen.has(id)) return null;
    seen.add(id);
    return {
      ...trusted,
      reason: String(item?.reason || "").trim().slice(0, 300),
      focus: String(item?.focus || "").trim().slice(0, 160),
    };
  }).filter(Boolean).slice(0, MAX_RECOMMENDATIONS);
}

module.exports = { MAX_CANDIDATES, MAX_RECOMMENDATIONS, SLOW_SOLVE_RATIO, problemKey, buildTargets, buildCandidatePool, normalizeRecommendations };
