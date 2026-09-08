const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { PUBLIC_STANDINGS_ONLY, PUBLIC_STANDINGS_MESSAGE } = require('./codeforces-standings.cjs');
const METHOD = "carrot-virtual-insertion-v1";
const normalized = (value) => String(value || "").toLowerCase();
const validScore = (row) => row && Number.isFinite(row.points) && Number.isFinite(row.penalty);
function singleHandle(row) {
  return row?.party?.members?.length === 1 && !row.party.ghost && !row.party.teamId
    ? normalized(row.party.members[0].handle) : "";
}
async function estimateVirtualReference({ entry, cache, standings, ratingChanges, nowSeconds = Date.now() / 1000 }) {
  if (entry.participationType !== "VIRTUAL") throw Error("仅虚拟参赛使用单场参考分");
  const duration = Number(standings?.contest?.durationSeconds);
  if (Number(standings?.contest?.id) !== Number(entry.contestId) || standings.contest.phase !== "FINISHED" ||
      standings.contest.frozen || !(duration > 0) || !entry.sessionStartTimeSeconds ||
      nowSeconds < entry.sessionStartTimeSeconds + duration) throw Error("比赛或本次虚拟赛尚未结束，暂不计算参考分");
  if (!["CF", "ICPC"].includes(standings.contest.type)) throw Error("该计分赛制暂不支持参考分");
  if (!Array.isArray(ratingChanges) || ratingChanges.length < 2) throw Error("缺少原比赛 Rated 对照数据");
  const handle = normalized(cache.handle);
  const virtualRows = (standings.rows || []).filter((row) => singleHandle(row) === handle &&
    row.party.participantType === "VIRTUAL" && Number(row.party.startTimeSeconds) === Number(entry.sessionStartTimeSeconds));
  if (virtualRows.length === 0 && (standings.rows || []).every(row => row.party?.participantType === 'CONTESTANT')) {
    const error = Error(PUBLIC_STANDINGS_MESSAGE); error.code = PUBLIC_STANDINGS_ONLY; throw error;
  }
  if (virtualRows.length !== 1) throw Error("官方榜单没有唯一对应这次虚拟赛的成绩，无法可靠估分");
  const targetRow = virtualRows[0];
  if (!validScore(targetRow) || !Array.isArray(targetRow.problemResults) ||
      targetRow.problemResults.length !== standings.problems?.length ||
      targetRow.problemResults.some((result) => result.type !== "FINAL")) throw Error("这次虚拟赛的最终成绩尚不完整");
  const official = new Map();
  for (const row of standings.rows || []) {
    const name = singleHandle(row);
    if (!name || row.party.participantType !== "CONTESTANT") continue;
    if (official.has(name)) throw Error("原比赛榜单存在重复身份，无法可靠估分");
    official.set(name, row);
  }
  const module = await import(pathToFileURL(path.join(__dirname, "../carrot/predict.mjs")).href);
  const contestants = [];
  const seen = new Set();
  for (const change of ratingChanges) {
    const name = normalized(change.handle);
    if (!name || seen.has(name) || Number(change.contestId) !== Number(entry.contestId)) throw Error("Rated 对照数据不完整或重复");
    seen.add(name);
    if (name === handle) continue; // Do not compete with an earlier official version of yourself.
    const row = official.get(name);
    if (!validScore(row) || !Array.isArray(row.problemResults) || row.problemResults.length !== standings.problems.length ||
        row.problemResults.some((result) => result.type !== "FINAL")) throw Error("原比赛 Rated 选手榜单不完整，暂不估分");
    const rating = entry.contestId >= 1360 && change.oldRating === 0 ? 1400 : change.oldRating;
    if (!Number.isInteger(rating) || rating < module.MIN_RATING_LIMIT || rating >= module.MAX_RATING_LIMIT) throw Error("对照选手 Rating 超出计算范围");
    contestants.push(new module.Contestant(name, row.points, row.penalty, rating));
  }
  if (contestants.length < 2) throw Error("可用 Rated 对照选手不足");
  const past = (cache.ratingHistory || []).filter((change) =>
    Number(change.ratingUpdateTimeSeconds) <= entry.sessionStartTimeSeconds && Number.isInteger(change.newRating) &&
    change.newRating > 0 && change.newRating < module.MAX_RATING_LIMIT)
    .sort((a, b) => b.ratingUpdateTimeSeconds - a.ratingUpdateTimeSeconds)[0];
  const assumedRating = past?.newRating || 1400;
  const target = new module.Contestant("__cf_compass_virtual_reference__", targetRow.points, targetRow.penalty, assumedRating);
  contestants.push(target);
  const calculator = new module.RatingCalculator(contestants);
  calculator.calculate(false);
  // Calculate performance only for the inserted virtual participant.
  const binarySearch = (await import(pathToFileURL(path.join(__dirname, "../carrot/binsearch.mjs")).href)).default;
  const performance = target.rank === 1 ? module.MAX_RATING_LIMIT : binarySearch(
    module.MIN_RATING_LIMIT, module.MAX_RATING_LIMIT,
    (rating) => calculator.calculateDelta(target, rating) + calculator.adjustment <= 0,
  );
  if (!Number.isFinite(performance)) throw Error("参考分计算未得到有效结果");
  return {
    status: "ready", method: METHOD, performance, referenceRank: target.rank,
    participants: contestants.length, points: targetRow.points, penalty: targetRow.penalty,
    assumedRating, assumedRatingSource: past ? "rating-history-before-session" : "default-1400",
    boundary: performance >= module.MAX_RATING_LIMIT ? "upper" : performance <= module.MIN_RATING_LIMIT ? "lower" : null,
    practicedBefore: (entry.problems || []).some((problem) => problem.previouslySolved),
    submissionFingerprint: entry.submissionFingerprint,
    calculatedAt: new Date(nowSeconds * 1000).toISOString(),
  };
}
module.exports = { estimateVirtualReference, METHOD };
