import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Search, Target, X } from "lucide-react";
import { openProblem } from "../lib/codeforces";
import { updateContestQueue } from "../lib/contest-queue";
import { RatingScore } from "./RatingDisplay";
import PlanQueueButton from "./PlanQueueButton";
import ProblemNoteButton from "./ProblemNoteButton";

export default function ContestUpsolveQueue({ entries, studyData, onStudyChange, plannedKeys, onAddToPlan, onOpenNote }) {
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const pending = entries.filter((entry) => !entry.solved).length;
  const visible = useMemo(() => entries.filter((entry) =>
    (status === "all" || (status === "done" ? entry.solved : !entry.solved)) &&
    `${entry.key} ${entry.problem.name}`.toLowerCase().includes(search.trim().toLowerCase())),
  [entries, status, search]);
  return (
    <section className="contest-upsolve-queue" aria-label="补题队列">
      <header className="contest-upsolve-header">
        <div><h3>队列进度</h3>
          <p>不限制是否参赛。通过状态随提交同步更新；已完成的题保留在队列中，由你决定何时移除。</p></div>
        <strong><Target size={18} />{pending} 待完成 · {entries.length - pending} 已完成</strong>
      </header>
      <div className="contest-upsolve-toolbar">
        <div className="contest-center-quick" aria-label="补题状态">
          {[["pending", "待完成"], ["done", "已完成"], ["all", "全部已加入"]].map(([id, label]) =>
            <button type="button" key={id} aria-pressed={status === id} className={status === id ? "is-active" : ""} onClick={() => setStatus(id)}>{label}</button>)}
        </div>
        <label className="contest-center-search"><Search size={17} />
          <input aria-label="搜索补题队列" placeholder="搜索队列中的题目或编号" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      <div className="contest-upsolve-list">
        {visible.map(({ key, problem, solved, metadataMissing, canOpen }) => (
          <article className={`contest-upsolve-item ${solved ? "is-solved" : ""}`} key={key}>
            <span className="contest-upsolve-state">{solved ? <CheckCircle2 size={20} /> : <Target size={20} />}</span>
            <button className="contest-upsolve-title" type="button" disabled={!canOpen} onClick={() => openProblem(problem)}>
              <small>{key} · {solved ? "已通过" : "待完成"}</small><strong>{problem.name}</strong>
              {metadataMissing && <small>题目详情暂未缓存，记录仍保留</small>}
            </button>
            <RatingScore value={problem.rating} fallback="未定级" />
            <div className="contest-problem-actions">
              {canOpen && <><button type="button" onClick={() => openProblem(problem)}><ExternalLink size={14} />打开题目</button>
                <ProblemNoteButton problem={problem} onOpenNote={onOpenNote} />
                <PlanQueueButton problem={problem} plannedKeys={plannedKeys} onAddToPlan={onAddToPlan} compact /></>}
              <button type="button" aria-label={`移出补题 ${key}`} onClick={() => onStudyChange(updateContestQueue(studyData, [], [key]), "已移出补题队列")}><X size={14} />移出</button>
            </div>
          </article>
        ))}
        {!visible.length && <div className="contest-center-empty"><Target size={28} />
          <strong>{entries.length ? "这个视图下暂时没有题目" : "补题队列还是空的"}</strong>
          <span>{entries.length ? "试试“全部已加入”，或清空搜索条件。" : "在任意已结束场次或赛事复盘中点击“加入补题”，题目就会出现在这里。"}</span>
        </div>}
      </div>
    </section>
  );
}
