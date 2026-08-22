import {
  BarChart3,
  BookOpenText,
  CalendarRange,
  CalendarCheck2,
  Code2,
  FileCode2,
  HelpCircle,
  History,
  Palette,
  Settings,
  Star,
  Trophy,
} from "lucide-react";

const navItems = [
  { id: "library", label: "题库", Icon: BookOpenText },
  { id: "today", label: "今日训练", Icon: CalendarCheck2 },
  { id: "review", label: "复习库", Icon: History },
  { id: "analytics", label: "训练分析", Icon: BarChart3 },
  { id: "contests", label: "赛事复盘", Icon: Trophy },
  { id: "contest-center", label: "赛事中心", Icon: CalendarRange },
  { id: "templates", label: "模板库", Icon: FileCode2 },
  { id: "favorites", label: "收藏", Icon: Star },
];

export default function AppRail({ active, onNavigate, appearanceOpen, onOpenAppearance }) {
  return (
    <aside className="app-rail" aria-label="主导航">
      <button className="brand-mark" type="button" aria-label="CF Compass 首页" onClick={() => onNavigate("library")}>
        <Code2 size={22} strokeWidth={2.3} />
      </button>
      <nav className="rail-nav">
        {navItems.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`rail-button ${active === id ? "is-active" : ""}`}
            aria-label={label}
            data-tooltip={label}
            onClick={() => onNavigate(id)}
          >
            <Icon size={19} strokeWidth={1.9} />
          </button>
        ))}
      </nav>
      <div className="rail-nav rail-nav--bottom">
        <button
          type="button"
          className={`rail-button ${appearanceOpen ? "is-active" : ""}`}
          aria-label="外观设置"
          data-tooltip="外观设置"
          onClick={onOpenAppearance}
        >
          <Palette size={19} />
        </button>
        <button
          type="button"
          className={`rail-button ${active === "data" ? "is-active" : ""}`}
          aria-label="数据中心"
          data-tooltip="数据中心"
          onClick={() => onNavigate("data")}
        >
          <Settings size={19} />
        </button>
        <button type="button" className="rail-button" aria-label="帮助" data-tooltip="帮助">
          <HelpCircle size={19} />
        </button>
      </div>
    </aside>
  );
}
