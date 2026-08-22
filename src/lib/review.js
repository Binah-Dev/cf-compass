import { problemKey } from "./codeforces";
import { normalizeTag } from "./stats";
import { getCurrentLocale } from "../i18n";

function localDateParts(timestamp) {
  const date = new Date(timestamp * 1000);
  return {
    date,
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

export function buildReviewItems(problems, submissionMap) {
  const items = [];
  for (const problem of problems || []) {
    const key = problemKey(problem);
    const stats = submissionMap.get(key);
    if (!stats?.accepted) continue;
    items.push({ key, problem, stats });
  }
  return items;
}

export function buildReviewTagCounts(items) {
  const counts = new Map();
  for (const { problem } of items) {
    for (const rawTag of problem.tags || []) {
      const tag = normalizeTag(rawTag);
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export function reviewDayKey(timestamp) {
  const { year, month, day } = localDateParts(timestamp);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function reviewMonthKey(timestamp) {
  const { year, month } = localDateParts(timestamp);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function formatReviewMonth(timestamp) {
  const { year, month } = localDateParts(timestamp);
  return `${year} 年 ${month} 月`;
}

export function formatReviewDay(timestamp) {
  const { month, day } = localDateParts(timestamp);
  return `${month} 月 ${day} 日`;
}

export function formatReviewDate(timestamp) {
  if (!timestamp) return "—";
  const { year, month, day } = localDateParts(timestamp);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatReviewDateTime(timestamp) {
  if (!timestamp) return "—";
  const { date, month, day } = localDateParts(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${hours}:${minutes}`;
}

export function describeReviewDay(timestamp) {
  if (!timestamp) return "";
  const target = new Date(timestamp * 1000);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const delta = Math.round((today - target) / 86400000);
  if (delta === 0) return "今天";
  if (delta === 1) return "昨天";
  return target.toLocaleDateString(getCurrentLocale(), { weekday: "short" });
}

export function groupReviewTimeline(items) {
  const months = [];
  let monthGroup = null;
  let dayGroup = null;

  for (const item of items) {
    const timestamp = item.stats.lastAc;
    const monthKey = reviewMonthKey(timestamp);
    const dayKey = reviewDayKey(timestamp);

    if (!monthGroup || monthGroup.key !== monthKey) {
      monthGroup = {
        key: monthKey,
        label: formatReviewMonth(timestamp),
        days: [],
      };
      months.push(monthGroup);
      dayGroup = null;
    }

    if (!dayGroup || dayGroup.key !== dayKey) {
      dayGroup = {
        key: dayKey,
        timestamp,
        label: formatReviewDay(timestamp),
        relative: describeReviewDay(timestamp),
        items: [],
      };
      monthGroup.days.push(dayGroup);
    }

    dayGroup.items.push(item);
  }

  return months;
}
