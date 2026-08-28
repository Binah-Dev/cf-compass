import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpenText, CalendarRange, CalendarCheck2, Check, Code2, FileCode2, HelpCircle, History, ListChecks, Palette, Settings, Trophy } from "lucide-react";

const RAIL_LAYOUT_KEY = "cf-compass-activity-rail-v1";
const navItems = [
  { id: "library", label: "题库", Icon: BookOpenText },
  { id: "today", label: "今日训练", Icon: CalendarCheck2 },
  { id: "plan", label: "计划题单", Icon: ListChecks },
  { id: "review", label: "复习库", Icon: History },
  { id: "analytics", label: "训练分析", Icon: BarChart3 },
  { id: "contests", label: "赛事复盘", Icon: Trophy },
  { id: "contest-center", label: "赛事中心", Icon: CalendarRange },
  { id: "templates", label: "模板库", Icon: FileCode2 },
];

function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(RAIL_LAYOUT_KEY));
    const knownIds = new Set(navItems.map((item) => item.id));
    const order = Array.isArray(saved?.order) ? saved.order.filter((id) => knownIds.has(id)) : [];
    navItems.forEach(({ id }) => { if (!order.includes(id)) order.push(id); });
    const hidden = Array.isArray(saved?.hidden) ? saved.hidden.filter((id) => knownIds.has(id) && id !== "library") : [];
    return { order, hidden };
  } catch {
    return { order: navItems.map((item) => item.id), hidden: [] };
  }
}

export default function AppRail({ active, onNavigate, appearanceOpen, onOpenAppearance }) {
  const [layout, setLayout] = useState(loadLayout);
  const [menu, setMenu] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const itemById = useMemo(() => new Map(navItems.map((item) => [item.id, item])), []);
  const hiddenSet = useMemo(() => new Set(layout.hidden), [layout.hidden]);
  const visibleItems = layout.order.map((id) => itemById.get(id)).filter((item) => item && !hiddenSet.has(item.id));

  useEffect(() => { localStorage.setItem(RAIL_LAYOUT_KEY, JSON.stringify(layout)); }, [layout]);
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const onKeyDown = (event) => { if (event.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  function openMenu(event) {
    event.preventDefault();
    setMenu({ x: Math.min(event.clientX, window.innerWidth - 220), y: Math.max(38, Math.min(event.clientY, window.innerHeight - 360)) });
  }

  function toggleItem(id) {
    const willHide = !hiddenSet.has(id);
    if (id === "library" && willHide) return;
    const hidden = willHide ? [...layout.hidden, id] : layout.hidden.filter((itemId) => itemId !== id);
    setLayout({ ...layout, hidden });
    if (willHide && active === id) onNavigate("library");
  }

  function moveItem(targetId) {
    if (!draggedId || draggedId === targetId) return;
    const order = layout.order.filter((id) => id !== draggedId);
    order.splice(order.indexOf(targetId), 0, draggedId);
    setLayout({ ...layout, order });
    setDraggedId(null);
  }

  return (
    <aside className="app-rail" aria-label="主导航" onContextMenu={openMenu}>
      <button className="brand-mark" type="button" aria-label="CF Compass 首页" onClick={() => onNavigate("library")}><Code2 size={22} strokeWidth={2.3} /></button>
      <nav className="rail-nav" aria-label="可拖动的页面入口">
        {visibleItems.map(({ id, label, Icon }) => (
          <button key={id} type="button" draggable className={`rail-button ${active === id ? "is-active" : ""} ${draggedId === id ? "is-dragging" : ""}`} aria-label={label} data-tooltip={label}
            onClick={() => onNavigate(id)}
            onDragStart={(event) => { setDraggedId(id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
            onDrop={(event) => { event.preventDefault(); moveItem(id); }}
            onDragEnd={() => setDraggedId(null)}>
            <Icon size={21} strokeWidth={1.8} />
          </button>
        ))}
      </nav>
      <div className="rail-nav rail-nav--bottom">
        <button type="button" className={`rail-button ${appearanceOpen ? "is-active" : ""}`} aria-label="外观设置" data-tooltip="外观设置" onClick={onOpenAppearance}><Palette size={21} /></button>
        <button type="button" className={`rail-button ${active === "data" ? "is-active" : ""}`} aria-label="数据中心" data-tooltip="数据中心" onClick={() => onNavigate("data")}><Settings size={21} /></button>
        <button type="button" className="rail-button" aria-label="帮助" data-tooltip="帮助"><HelpCircle size={21} /></button>
      </div>
      {menu ? (
        <div className="rail-context-menu" role="menu" aria-label="活动栏显示设置" style={{ left: menu.x, top: menu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <div className="rail-context-menu__title">显示的页面</div>
          {layout.order.map((id) => {
            const item = itemById.get(id);
            if (!item) return null;
            const visible = !hiddenSet.has(id);
            return <button key={id} type="button" role="menuitemcheckbox" aria-checked={visible} disabled={id === "library"} onClick={() => toggleItem(id)}><span className="rail-context-menu__check">{visible ? <Check size={15} /> : null}</span>{item.label}</button>;
          })}
          <div className="rail-context-menu__hint">拖动左侧图标可调整顺序</div>
        </div>
      ) : null}
    </aside>
  );
}
