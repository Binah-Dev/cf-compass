import { BookOpenCheck, CircleCheckBig, CopyCheck, Send, Sparkles } from "lucide-react";
import { formatNumber } from "../lib/stats";

const items = [
  { key: "total", label: "题库总量", Icon: BookOpenCheck, tone: "blue" },
  { key: "solved", label: "已解决", Icon: CircleCheckBig, tone: "green" },
  { key: "monthNew", label: "本月新解", Icon: Sparkles, tone: "amber" },
  { key: "repeatAc", label: "重复 AC", Icon: CopyCheck, tone: "cyan" },
  { key: "submissions", label: "提交总数", Icon: Send, tone: "violet" },
];

export default function StatsStrip({ overview }) {
  return (
    <section className="stats-strip" aria-label="题库统计">
      {items.map(({ key, label, Icon, tone }) => (
        <div className="stat-item" key={key}>
          <span className={`stat-icon stat-icon--${tone}`}>
            <Icon size={16} />
          </span>
          <div>
            <span className="stat-label">{label}</span>
            <strong>{formatNumber(overview[key])}</strong>
          </div>
        </div>
      ))}
      <div className="stats-strip__note">
        <span className="live-dot" />
        数据来自 Codeforces 官方 API
      </div>
    </section>
  );
}
