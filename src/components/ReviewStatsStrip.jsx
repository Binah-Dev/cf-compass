import { CalendarCheck2, CheckCircle2, CopyCheck, Sparkles } from "lucide-react";
import { formatNumber } from "../lib/stats";
import { describeReviewDay, formatReviewDate } from "../lib/review";

export default function ReviewStatsStrip({ overview, latestAcceptedAt }) {
  const items = [
    {
      key: "solved",
      label: "已刷题目",
      value: formatNumber(overview.solved),
      Icon: CheckCircle2,
      tone: "green",
    },
    {
      key: "accepted",
      label: "累计 AC",
      value: formatNumber(overview.solved + overview.repeatAc),
      Icon: Sparkles,
      tone: "amber",
    },
    {
      key: "repeat",
      label: "重复 AC",
      value: formatNumber(overview.repeatAc),
      Icon: CopyCheck,
      tone: "cyan",
    },
    {
      key: "latest",
      label: "最近通过",
      value: describeReviewDay(latestAcceptedAt) || "暂无",
      Icon: CalendarCheck2,
      tone: "blue",
    },
  ];

  return (
    <section className="stats-strip review-stats-strip" aria-label="复习库统计">
      {items.map(({ key, label, value, Icon, tone }) => (
        <div className="stat-item" key={key}>
          <span className={`stat-icon stat-icon--${tone}`}>
            <Icon size={16} />
          </span>
          <div>
            <span className="stat-label">{label}</span>
            <strong>{value}</strong>
          </div>
        </div>
      ))}
      <div className="stats-strip__note">
        <span className="live-dot" />
        {latestAcceptedAt ? `记录更新至 ${formatReviewDate(latestAcceptedAt)}` : "等待同步 AC 记录"}
      </div>
    </section>
  );
}
