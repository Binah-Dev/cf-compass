import { problemKey } from "./codeforces";
import { displayTag, normalizeTag } from "./stats";

function submissionKey(submission) {
  const problem = submission?.problem || {};
  return `${problem.contestId || submission?.contestId || ""}-${problem.index || ""}`;
}

export function analyticsDayKey(timestamp) {
  const date = new Date(Number(timestamp) * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function resolveAnalyticsRange(preset, customStart, customEnd, nowValue = Date.now()) {
  const now = new Date(nowValue);
  let start = new Date(0);
  let end = now;
  if (preset === "year") start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  if (preset === "quarter") start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  if (preset === "month") start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  if (preset === "fortnight") start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14);
  if (preset === "custom") {
    const parsedStart = customStart ? new Date(`${customStart}T00:00:00`) : null;
    const parsedEnd = customEnd ? new Date(`${customEnd}T23:59:59`) : null;
    if (parsedStart && !Number.isNaN(parsedStart.getTime())) start = parsedStart;
    if (parsedEnd && !Number.isNaN(parsedEnd.getTime())) end = parsedEnd;
  }
  return {
    startSeconds: Math.floor(start.getTime() / 1000),
    endSeconds: Math.floor(end.getTime() / 1000),
  };
}

export function zoomRatingWindow(currentWindow, historyLength, direction, anchorRatio = 0.5) {
  const length = Math.max(0, Number(historyLength) || 0);
  if (length <= 1) return [0, Math.max(0, length - 1)];
  const lastIndex = length - 1;
  const start = Math.max(0, Math.min(lastIndex - 1, Number(currentWindow?.[0]) || 0));
  const end = Math.max(start + 1, Math.min(lastIndex, Number(currentWindow?.[1]) || lastIndex));
  const currentCount = end - start + 1;
  const targetCount = direction === "in"
    ? Math.max(2, Math.floor(currentCount * 0.78))
    : Math.min(length, Math.ceil(currentCount / 0.78));
  if (targetCount === currentCount) return [start, end];
  const anchor = Math.max(0, Math.min(1, Number(anchorRatio) || 0));
  const anchorIndex = start + anchor * (currentCount - 1);
  let nextStart = Math.round(anchorIndex - anchor * (targetCount - 1));
  nextStart = Math.max(0, Math.min(lastIndex - targetCount + 1, nextStart));
  return [nextStart, nextStart + targetCount - 1];
}

export function buildTrainingAnalytics(data, range) {
  const problems = data?.problems || [];
  const submissions = data?.submissions || [];
  const ratingHistory = data?.ratingHistory || [];
  const problemLookup = new Map(problems.map((problem) => [problemKey(problem), problem]));
  const inRange = (timestamp) => {
    const value = Number(timestamp) || 0;
    return value >= range.startSeconds && value <= range.endSeconds;
  };

  const scopedSubmissions = submissions.filter((submission) =>
    inRange(submission.creationTimeSeconds),
  );
  const acceptedSubmissions = scopedSubmissions.filter(
    (submission) => submission.verdict === "OK",
  );
  const activeDays = new Set(
    scopedSubmissions
      .map((submission) => Number(submission.creationTimeSeconds) || 0)
      .filter(Boolean)
      .map(analyticsDayKey),
  );

  const firstAcceptedByProblem = new Map();
  for (const submission of submissions) {
    if (submission.verdict !== "OK") continue;
    const key = submissionKey(submission);
    const timestamp = Number(submission.creationTimeSeconds) || 0;
    const current = firstAcceptedByProblem.get(key);
    if (timestamp && (!current || timestamp < current)) firstAcceptedByProblem.set(key, timestamp);
  }
  const firstSolved = [...firstAcceptedByProblem.values()].filter(inRange).length;

  const tags = new Map();
  for (const submission of scopedSubmissions) {
    const problem = problemLookup.get(submissionKey(submission)) || submission.problem || {};
    const uniqueTags = new Set((problem.tags || []).map(normalizeTag));
    for (const tag of uniqueTags) {
      const current = tags.get(tag) || {
        tag,
        label: displayTag(tag),
        submissions: 0,
        accepted: 0,
        solvedKeys: new Set(),
      };
      current.submissions += 1;
      if (submission.verdict === "OK") {
        current.accepted += 1;
        current.solvedKeys.add(submissionKey(submission));
      }
      tags.set(tag, current);
    }
  }

  const tagPerformance = [...tags.values()]
    .map((item) => ({
      tag: item.tag,
      label: item.label,
      submissions: item.submissions,
      accepted: item.accepted,
      solved: item.solvedKeys.size,
      rate: item.submissions ? (item.accepted / item.submissions) * 100 : 0,
      sampleLow: item.submissions < 5,
    }))
    .filter((item) => item.solved > 0)
    .sort(
      (a, b) =>
        b.rate - a.rate ||
        b.solved - a.solved ||
        b.submissions - a.submissions ||
        a.label.localeCompare(b.label, "zh-CN"),
    );

  const scopedRatingHistory = ratingHistory
    .filter((change) => inRange(change.ratingUpdateTimeSeconds))
    .sort((a, b) => a.ratingUpdateTimeSeconds - b.ratingUpdateTimeSeconds);

  const activity = new Map();
  for (const submission of acceptedSubmissions) {
    const key = analyticsDayKey(submission.creationTimeSeconds);
    activity.set(key, (activity.get(key) || 0) + 1);
  }

  return {
    firstSolved,
    submissions: scopedSubmissions.length,
    accepted: acceptedSubmissions.length,
    acceptanceRate: scopedSubmissions.length
      ? (acceptedSubmissions.length / scopedSubmissions.length) * 100
      : 0,
    activeDays: activeDays.size,
    ratingHistory: scopedRatingHistory,
    tagPerformance,
    activity,
  };
}
