import { GripHorizontal, Maximize2, Minimize2, MoveDiagonal2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { translateText } from "../i18n";
import { PANEL_IDS, WORKBENCH_LAYOUT_KEY, validLayout, resolveFrames, normalizeFrames, changeFrame } from "../lib/workbench-layout";
import "../workbench-layout.css";

const LABELS = { taxonomy: "算法分类", problems: "题目列表", progress: "个人进度" };
const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

export default function WorkbenchLayout({ order, panels, resetVersion = 0 }) {
  const canvasRef = useRef(null), gesture = useRef(null), resetSeen = useRef(resetVersion);
  const paintFrame = useRef(null);
  function cancelPaint() {
    if (paintFrame.current !== null) cancelAnimationFrame(paintFrame.current);
    paintFrame.current = null;
  }
  useEffect(() => () => cancelPaint(), []);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [layout, setLayout] = useState(() => {
    try { return validLayout(JSON.parse(localStorage.getItem(WORKBENCH_LAYOUT_KEY))); } catch { return null; }
  });
  const [draft, setDraft] = useState(null), [active, setActive] = useState(null);
  const [maximized, setMaximized] = useState(null), [front, setFront] = useState("problems");
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      cancelPaint();
      gesture.current = null; setDraft(null); setActive(null);
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (resetSeen.current === resetVersion) return;
    resetSeen.current = resetVersion;
    cancelPaint();
    gesture.current = null; setDraft(null); setActive(null); setMaximized(null); setLayout(null); setFront("problems");
    try { localStorage.removeItem(WORKBENCH_LAYOUT_KEY); setSaveError(false); } catch { setSaveError(true); }
  }, [resetVersion]);
  const frames = size.width && size.height ? draft || resolveFrames(layout, size, order) : null;
  function save(next) {
    const value = normalizeFrames(next, size);
    setLayout(value);
    try { localStorage.setItem(WORKBENCH_LAYOUT_KEY, JSON.stringify(value)); setSaveError(false); } catch { setSaveError(true); }
  }
  function begin(event, id, mode) {
    if (event.button !== 0 || !frames || maximized) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id, mode, x: event.clientX, y: event.clientY, frames, pointerId: event.pointerId, next: frames };
    setActive({ id, mode }); setFront(id);
  }
  function move(event) {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    g.next = { ...g.frames, [g.id]: changeFrame(g.frames[g.id], size, g.id, g.mode, event.clientX - g.x, event.clientY - g.y) };
    if (paintFrame.current === null) paintFrame.current = requestAnimationFrame(() => {
      paintFrame.current = null;
      if (gesture.current === g) setDraft(g.next);
    });
  }
  function finish(event, cancel = false) {
    const g = gesture.current;
    if (!g || (event.pointerId != null && g.pointerId !== event.pointerId)) return;
    cancelPaint();
    if (!cancel) save(g.next);
    gesture.current = null; setDraft(null); setActive(null);
  }
  function keyboard(event, id, mode) {
    if (event.key === "Escape") { finish(event, true); return; }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction || maximized || !frames) return;
    event.preventDefault(); const step = event.shiftKey ? 40 : 10;
    setFront(id);
    save({ ...frames, [id]: changeFrame(frames[id], size, id, mode, direction[0] * step, direction[1] * step) });
  }
  const handlers = (id, mode) => ({
    onPointerDown: (e) => begin(e, id, mode), onPointerMove: move,
    onPointerUp: (e) => finish(e), onPointerCancel: (e) => finish(e, true),
    onLostPointerCapture: (e) => finish(e, true), onKeyDown: (e) => keyboard(e, id, mode),
  });
  return <div className="workbench workbench--free" aria-label="可拖动工作台">
    <div className="workbench-hint">
      <span title="拖动标题移动 · 拖动边角缩放 · 智能复位恢复预设">拖动标题移动 · 拖动边角缩放 · 智能复位恢复预设</span>
      <div className="workbench-layer-picker" role="group" aria-label="显示面板">
        {PANEL_IDS.map((id) => <button key={id} type="button" aria-pressed={front === id}
          aria-label={`${translateText("显示面板")} · ${translateText(LABELS[id])}`}
          title="被遮挡时点击置顶" onClick={() => { setMaximized(null); setFront(id); }}>{LABELS[id]}</button>)}
      </div>
      <span role="status">{saveError ? "布局仅在当前窗口生效，保存失败" : active ? "松开保存 · Esc 取消" : "布局自动记忆"}</span>
    </div>
    <div className="workbench-canvas" ref={canvasRef}>
      {frames && PANEL_IDS.map((id) => {
        const full = maximized === id, f = full ? { x: 0, y: 0, ...size } : frames[id];
        return <section key={id} data-panel-id={id} inert={Boolean(maximized && !full)}
          className={`draggable-panel draggable-panel--${id}${active?.id === id ? " is-manipulating" : ""}${full ? " is-expanded" : ""}`}
          style={{ left: 0, top: 0, transform: `translate3d(${f.x}px, ${f.y}px, 0)`, width: f.width, height: f.height, zIndex: full ? 5 : front === id ? 3 : 1 }}
          onPointerDownCapture={() => setFront(id)}>
          <header className="workbench-panel-bar">
            <button type="button" className="workbench-move" aria-label={`${translateText("移动面板")} · ${translateText(LABELS[id])}`}
              title={translateText("拖动移动，方向键微调，Shift 加速，Esc 取消")} disabled={full} {...handlers(id, "move")}>
              <GripHorizontal size={16} /><span>{LABELS[id]}</span>
            </button>
            {active?.id === id && <output className="workbench-size">{Math.round(f.width)} × {Math.round(f.height)}</output>}
            <button type="button" className="workbench-expand" aria-label={`${translateText(full ? "还原面板" : "展开面板")} · ${translateText(LABELS[id])}`}
              title={full ? "还原面板" : "展开面板"} aria-expanded={full} onClick={() => { setMaximized(full ? null : id); setFront(id); }}>
              {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </header>
          <div className="workbench-panel-content">{panels[id]}</div>
          {!full && EDGES.map((edge) => <button key={edge} type="button" tabIndex={edge === "se" ? 0 : -1}
            className={`workbench-resize workbench-resize--${edge}`} data-resize={edge}
            aria-label={`${translateText("调整面板大小")} · ${translateText(LABELS[id])} · ${edge}`}
            title={translateText("拖动边角调整大小，方向键微调")} {...handlers(id, edge)}>
            {edge === "se" && <MoveDiagonal2 size={16} />}
          </button>)}
        </section>;
      })}
    </div>
  </div>;
}
