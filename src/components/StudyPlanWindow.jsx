import { Check, Circle, CodeXml, ExternalLink, GripVertical, ListChecks, LoaderCircle, Timer, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadStudyData, onStudyDataChanged, saveProblemNote } from "../lib/study";
import { openStudyTimerWindow } from "../lib/study-timer";
import {
  getStudyPlan,
  onStudyPlanChanged,
  openStudyPlanItem,
  removeStudyPlanItem,
  reorderStudyPlan,
  setStudyPlanStatus,
} from "../lib/study-plan";
import ProblemNoteButton from "./ProblemNoteButton";
import ProblemNoteDrawer from "./ProblemNoteDrawer";

export default function StudyPlanWindow() {
  const [items, setItems] = useState([]);
  const [templateCompletions, setTemplateCompletions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [draggedId, setDraggedId] = useState("");
  const [studyData, setStudyData] = useState(null);
  const [noteProblem, setNoteProblem] = useState(null);
  const doneCount = useMemo(() => items.filter((item) => item.status === "done").length, [items]);
  const progress = items.length ? Math.round(doneCount / items.length * 100) : 0;

  useEffect(() => {
    let active = true;
    getStudyPlan()
      .then((queue) => { if (active) { setItems(queue?.items || []); setTemplateCompletions(queue?.templateCompletions || {}); } })
      .catch((reason) => { if (active) setError(reason?.message || "题单读取失败"); })
      .finally(() => { if (active) setLoading(false); });
    const dispose = onStudyPlanChanged((queue) => {
      if (active) {
        setItems(queue?.items || []);
        setTemplateCompletions(queue?.templateCompletions || {});
        setLoading(false);
        setError("");
      }
    });
    return () => { active = false; dispose?.(); };
  }, []);

  useEffect(() => {
    let active = true;
    loadStudyData().then((study) => { if (active) setStudyData(study); }).catch(() => undefined);
    const dispose = onStudyDataChanged((study) => { if (active) setStudyData(study); });
    return () => { active = false; dispose?.(); };
  }, []);

  async function run(itemId, action) {
    if (busyId) return;
    setBusyId(itemId);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason?.message || "操作失败，请重试");
    } finally {
      setBusyId("");
    }
  }

  async function dropBefore(targetId) {
    if (!draggedId || draggedId === targetId) return;
    const nextIds = items.map((item) => item.id).filter((id) => id !== draggedId);
    nextIds.splice(nextIds.indexOf(targetId), 0, draggedId);
    setDraggedId("");
    await run("reorder", () => reorderStudyPlan(nextIds));
  }

  return (
    <main className="study-plan-window-shell">
      <header className="study-plan-window-header">
        <span><ListChecks size={21} /></span>
        <div><small>MY TRAINING PLAN</small><strong>待做题单</strong></div>
        <button type="button" className="study-plan-window-timer" data-testid="study-timer-open" aria-label="打开计时表" title="打开计时表" disabled={busyId === "timer-window"} onClick={() => run("timer-window", openStudyTimerWindow)}><Timer size={17} /></button>
        <b>{items.length - doneCount}<small> / {items.length}</small></b>
      </header>
      <section className="study-plan-window-progress" aria-label="计划完成进度">
        <div><span style={{ width: `${progress}%` }} /></div><b>{progress}%</b>
      </section>

      <div>{error ? <p className="study-plan-window-error" role="alert">{error}</p> : null}</div>
      {loading ? (
        <div className="study-plan-window-empty"><LoaderCircle className="plan-spin" size={26} /><strong>正在打开题单…</strong></div>
      ) : items.length ? (
        <section className="study-plan-window-list" aria-label="独立待做题单">
          {items.map((item, index) => {
            const done = item.status === "done";
            const isTemplate = item.type === "template";
            const label = isTemplate ? item.name : item.problemKey;
            return (
              <article
                className={`study-plan-window-item ${isTemplate ? "is-template" : ""} ${done ? "is-done" : ""} ${draggedId === item.id ? "is-dragging" : ""}`}
                key={item.id}
                draggable
                onDragStart={(event) => {
                  setDraggedId(item.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", item.id);
                }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                onDrop={(event) => { event.preventDefault(); dropBefore(item.id); }}
                onDragEnd={() => setDraggedId("")}
              >
                <span className="study-plan-window-order" title="拖动调整顺序"><GripVertical size={14} /><b>{index + 1}</b></span>
                <button
                  type="button"
                  className="study-plan-window-problem"
                  title={isTemplate ? "在 VS Code 中打开模板" : "打开 Codeforces 题目"}
                  disabled={busyId === item.id}
                  onClick={() => run(item.id, () => openStudyPlanItem(item))}
                >
                  <small>{isTemplate ? "本地模板 · VS Code" : item.problemKey}</small>
                  <strong data-i18n-preserve>{item.name}{isTemplate ? <CodeXml size={12} /> : <ExternalLink size={12} />}</strong>
                  {isTemplate
                    ? <span title={item.relativePath}>{`${item.language} · 完成 ${templateCompletions[item.problemKey] || 0} 次 · ${item.relativePath}`}</span>
                    : <span>{item.rating || "—"}{item.tags?.length ? ` · ${item.tags.slice(0, 2).join(" / ")}` : ""}</span>}
                </button>
                {!isTemplate ? <ProblemNoteButton problem={item} onOpenNote={setNoteProblem} /> : null}
                <button
                  type="button"
                  className="study-plan-window-done"
                  aria-label={done ? `将 ${label} 恢复为待完成` : `完成 ${label}`}
                  aria-pressed={done}
                  disabled={busyId === item.id}
                  onClick={() => run(item.id, () => setStudyPlanStatus(item.id, done ? "pending" : "done"))}
                >
                  {busyId === item.id ? <LoaderCircle className="plan-spin" size={18} /> : done ? <Check size={18} /> : <Circle size={18} />}
                </button>
                <button
                  type="button"
                  className="study-plan-window-delete"
                  aria-label={`从独立题单删除 ${label}`}
                  title="从题单删除"
                  disabled={busyId === item.id}
                  onClick={() => run(item.id, () => removeStudyPlanItem(item.id))}
                ><Trash2 size={16} /></button>
              </article>
            );
          })}
        </section>
      ) : (
        <div className="study-plan-window-empty"><span><Check size={24} /></span><strong>今天的题单刷完啦</strong><p>回到主页面，从任意题目旁边加入新的待做题。</p></div>
      )}
      <footer>拖动题目调整顺序 · 点圆圈划掉 · 点垃圾桶移除</footer>
      {noteProblem && studyData ? (
        <ProblemNoteDrawer
          problem={noteProblem}
          studyData={studyData}
          plannedKeys={new Set(items.map((item) => item.problemKey))}
          onClose={() => setNoteProblem(null)}
          onSave={async (problemKey, note) => {
            const next = await saveProblemNote(problemKey, note);
            setStudyData(next);
            setNoteProblem(null);
          }}
        />
      ) : null}
    </main>
  );
}
