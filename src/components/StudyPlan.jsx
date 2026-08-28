import {
  Check,
  Circle,
  ExternalLink,
  GripVertical,
  ListChecks,
  LoaderCircle,
  PanelRightOpen,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { openProblem } from "../lib/codeforces";
import { displayTag, ratingTone } from "../lib/stats";

const filters = [
  { id: "all", label: "全部" },
  { id: "pending", label: "待完成" },
  { id: "done", label: "已完成" },
];

const FLOAT_KEY = "cf-compass-study-plan-float-v1";

export default function StudyPlan({ items, onToggleStatus, onRemove, onReorder, onOpenLibrary }) {
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState("");
  const [draggedId, setDraggedId] = useState("");
  const [floatOpen, setFloatOpen] = useState(() => localStorage.getItem(FLOAT_KEY) !== "closed");
  const doneCount = items.filter((item) => item.status === "done").length;
  const progress = items.length ? Math.round(doneCount / items.length * 100) : 0;
  const visibleItems = useMemo(
    () => items.filter((item) => filter === "all" || (filter === "done" ? item.status === "done" : item.status !== "done")),
    [filter, items],
  );
  const pendingItems = useMemo(() => items.filter((item) => item.status !== "done"), [items]);

  function toggleFloat(nextValue = !floatOpen) {
    setFloatOpen(nextValue);
    localStorage.setItem(FLOAT_KEY, nextValue ? "open" : "closed");
  }

  async function dropBefore(targetId) {
    if (!draggedId || draggedId === targetId) return;
    const nextIds = items.map((item) => item.id).filter((id) => id !== draggedId);
    nextIds.splice(nextIds.indexOf(targetId), 0, draggedId);
    setDraggedId("");
    await onReorder(nextIds);
  }

  async function run(itemId, action) {
    if (busyId) return;
    setBusyId(itemId);
    try {
      await action();
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="feature-page study-plan-page">
      <section className="study-plan-hero">
        <div className="study-plan-hero__copy">
          <span className="study-plan-hero__icon"><ListChecks size={22} /></span>
          <div>
            <span>MY TRAINING PLAN</span>
            <h2>把想刷的题，一道道变成完成</h2>
            <p>完成后题目不会消失，而是留下一道划线的轨迹；不再需要的题可以随时删除。</p>
          </div>
        </div>
        <div className="study-plan-hero__actions">
          <button type="button" className={`study-plan-float-toggle ${floatOpen ? "is-active" : ""}`} onClick={() => toggleFloat()}><PanelRightOpen size={16} /> {floatOpen ? "收起悬浮题单" : "打开悬浮题单"}</button>
          <button type="button" className="study-plan-add" onClick={onOpenLibrary}><Plus size={16} /> 从题库加题</button>
        </div>
      </section>

      <section className="study-plan-progress" aria-label="计划完成进度">
        <div>
          <span>计划进度</span>
          <strong>{doneCount}<small> / {items.length}</small></strong>
        </div>
        <div className="study-plan-progress__track"><span style={{ width: `${progress}%` }} /></div>
        <b>{progress}%</b>
      </section>

      <section className="study-plan-board">
        <header>
          <div>
            <span>计划题单</span>
            <strong>{items.length ? `${items.length - doneCount} 道等待完成` : "先选一道想攻克的题"}</strong>
          </div>
          <div className="study-plan-filters" role="tablist">
            {filters.map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                className={filter === item.id ? "is-active" : ""}
                key={item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        {visibleItems.length ? (
          <div className="study-plan-list">
            {visibleItems.map((item) => {
              const done = item.status === "done";
              const planNumber = items.findIndex((entry) => entry.id === item.id) + 1;
              return (
                <article className={`study-plan-item ${done ? "is-done" : ""} ${draggedId === item.id ? "is-dragging" : ""}`} key={item.id} draggable
                  onDragStart={(event) => { setDraggedId(item.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                  onDrop={(event) => { event.preventDefault(); dropBefore(item.id); }}
                  onDragEnd={() => setDraggedId("")}>
                  <span className="study-plan-item__order" title="拖动调整顺序"><GripVertical size={14} /><b>{planNumber}</b></span>
                  <button
                    type="button"
                    className="study-plan-item__check"
                    aria-label={done ? `将 ${item.problemKey} 恢复为待完成` : `完成 ${item.problemKey}`}
                    aria-pressed={done}
                    disabled={busyId === item.id}
                    onClick={() => run(item.id, () => onToggleStatus(item))}
                  >
                    {busyId === item.id ? <LoaderCircle className="plan-spin" size={18} /> : done ? <Check size={18} /> : <Circle size={18} />}
                  </button>
                  <button type="button" className="study-plan-item__problem" onClick={() => openProblem(item)}>
                    <span className="study-plan-item__id">{item.problemKey}</span>
                    <span className="study-plan-item__title">{item.name}<ExternalLink size={13} /></span>
                    <span className="study-plan-item__meta">
                      <b className={`rating rating--${ratingTone(item.rating)}`}>{item.rating || "—"}</b>
                      {(item.tags || []).slice(0, 2).map((tag) => <em key={tag}>{displayTag(tag)}</em>)}
                      {item.reason ? <small>{item.reason}</small> : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="study-plan-item__delete"
                    aria-label={`从计划题单删除 ${item.problemKey}`}
                    title="从计划题单删除"
                    disabled={busyId === item.id}
                    onClick={() => run(item.id, () => onRemove(item))}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="study-plan-empty">
            <span><ListChecks size={29} /></span>
            <strong>{filter === "all" ? "计划题单还是空的" : filter === "done" ? "还没有划掉的题目" : "待完成题目已经清空"}</strong>
            <p>{filter === "all" ? "去题库点击题目旁的计划按钮，给今天一个清晰的起点。" : "切换筛选查看其他题目。"}</p>
            {filter === "all" ? <button type="button" onClick={onOpenLibrary}><Plus size={15} /> 去题库加题</button> : null}
          </div>
        )}
      </section>
      {floatOpen ? (
        <aside className="study-plan-float" aria-label="待刷题悬浮题单">
          <header>
            <div><span><ListChecks size={15} /></span><strong>待刷题</strong><small>{pendingItems.length}</small></div>
            <button type="button" aria-label="关闭悬浮题单" onClick={() => toggleFloat(false)}><X size={16} /></button>
          </header>
          <div className="study-plan-float__list">
            {pendingItems.length ? pendingItems.map((item) => {
              const planNumber = items.findIndex((entry) => entry.id === item.id) + 1;
              return (
                <article key={item.id} draggable className={draggedId === item.id ? "is-dragging" : ""}
                  onDragStart={(event) => { setDraggedId(item.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                  onDrop={(event) => { event.preventDefault(); dropBefore(item.id); }}
                  onDragEnd={() => setDraggedId("")}>
                  <span className="study-plan-float__order"><GripVertical size={13} /><b>{planNumber}</b></span>
                  <button type="button" className="study-plan-float__problem" onClick={() => openProblem(item)}><strong>{item.name}</strong><small>{item.problemKey} · {item.rating || "—"}</small></button>
                  <button type="button" className="study-plan-float__done" aria-label={`完成 ${item.problemKey}`} onClick={() => run(item.id, () => onToggleStatus(item))}><Circle size={16} /></button>
                  <button type="button" className="study-plan-float__delete" aria-label={`从悬浮题单删除 ${item.problemKey}`} onClick={() => run(item.id, () => onRemove(item))}><Trash2 size={14} /></button>
                </article>
              );
            }) : <div className="study-plan-float__empty"><Check size={20} /><span>今天的题都划掉啦</span></div>}
          </div>
          <footer>拖动题目调整顺序 · 拖动右下角改变窗口大小</footer>
        </aside>
      ) : null}
    </main>
  );
}
