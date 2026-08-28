import { Check, ExternalLink, NotebookPen, Plus, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { openProblem, problemKey } from "../lib/codeforces";
import { getCurrentLocale } from "../i18n";
import { displayTag } from "../lib/stats";
import PlanQueueButton from "./PlanQueueButton";

const mistakeOptions = ["思路偏差", "边界遗漏", "复杂度误判", "实现错误", "公式推导", "读题失误"];

export default function ProblemNoteDrawer({ problem, studyData, onClose, onSave, plannedKeys, onAddToPlan }) {
  const key = problem ? problemKey(problem) : "";
  const saved = studyData.notes?.[key];
  const [draft, setDraft] = useState({
    difficulty: 3,
    mistakeReason: "",
    mistakeTags: [],
    keyIdea: "",
    content: "",
  });

  useEffect(() => {
    setDraft({
      difficulty: saved?.difficulty || 3,
      mistakeReason: saved?.mistakeReason || "",
      mistakeTags: saved?.mistakeTags || [],
      keyIdea: saved?.keyIdea || "",
      content: saved?.content || "",
    });
  }, [key, saved]);

  if (!problem) return null;

  function toggleTag(tag) {
    setDraft((current) => ({
      ...current,
      mistakeTags: current.mistakeTags.includes(tag)
        ? current.mistakeTags.filter((item) => item !== tag)
        : [...current.mistakeTags, tag],
    }));
  }

  function submit() {
    onSave(key, { ...draft, updatedAt: new Date().toISOString() });
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="note-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="题目复盘笔记"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="note-drawer__header">
          <div className="note-drawer__icon"><NotebookPen size={18} /></div>
          <div>
            <span>复盘笔记</span>
            <strong>{problem.contestId}{problem.index} · {problem.name}</strong>
          </div>
          <button type="button" aria-label="关闭笔记" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="note-drawer__body">
          <div className="note-problem-summary">
            <div>
              {(problem.tags || []).slice(0, 3).map((tag) => (
                <span className="table-tag" key={tag}>{displayTag(tag)}</span>
              ))}
            </div>
            <button type="button" onClick={() => openProblem(problem)}>
              打开题目 <ExternalLink size={13} />
            </button>
            <PlanQueueButton problem={problem} plannedKeys={plannedKeys} onAddToPlan={onAddToPlan} />
          </div>

          <section className="note-section">
            <label>主观难度</label>
            <div className="difficulty-picker" aria-label="主观难度">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  type="button"
                  key={value}
                  className={draft.difficulty === value ? "is-active" : ""}
                  onClick={() => setDraft({ ...draft, difficulty: value })}
                >
                  {value}
                </button>
              ))}
              <span>{["", "轻松", "简单", "适中", "困难", "很难"][draft.difficulty]}</span>
            </div>
          </section>

          <section className="note-section">
            <label htmlFor="mistake-reason">错误原因</label>
            <input
              id="mistake-reason"
              value={draft.mistakeReason}
              onChange={(event) => setDraft({ ...draft, mistakeReason: event.target.value })}
              placeholder="一句话总结：为什么第一次没有做出来？"
            />
            <div className="mistake-tags">
              {mistakeOptions.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  className={draft.mistakeTags.includes(tag) ? "is-active" : ""}
                  onClick={() => toggleTag(tag)}
                >
                  {draft.mistakeTags.includes(tag) ? <Check size={12} /> : <Plus size={12} />}
                  {tag}
                </button>
              ))}
            </div>
          </section>

          <section className="note-section">
            <label htmlFor="key-idea">关键思路</label>
            <textarea
              id="key-idea"
              rows="4"
              value={draft.keyIdea}
              onChange={(event) => setDraft({ ...draft, keyIdea: event.target.value })}
              placeholder="写下突破口、状态定义、关键观察或证明。"
            />
          </section>

          <section className="note-section note-section--grow">
            <label htmlFor="full-note">完整笔记</label>
            <textarea
              id="full-note"
              value={draft.content}
              onChange={(event) => setDraft({ ...draft, content: event.target.value })}
              placeholder="记录易错细节、可复用模板、下次复习时要检查的点……"
            />
          </section>
        </div>
        <footer className="note-drawer__footer">
          <span>{saved?.updatedAt ? `上次保存 ${new Date(saved.updatedAt).toLocaleString(getCurrentLocale())}` : "尚未保存"}</span>
          <button type="button" className="primary-button" onClick={submit}>
            <Save size={15} /> 保存笔记
          </button>
        </footer>
      </aside>
    </div>
  );
}
