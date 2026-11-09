import { Check, FolderPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { saveProblemList, setProblemListMembership } from "../../electron/shared/problem-lists.mjs";
import { problemKey } from "../lib/codeforces";
import "./problem-lists.css";

export default function ProblemListsControl({ lists, selectedId, onSelect, onChange, problem, onCloseProblem }) {
  const [mode, setMode] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = lists.find((item) => item.id === selectedId);
  const open = Boolean(mode || problem);

  function close() {
    if (saving) return;
    setMode(null);
    setError("");
    onCloseProblem();
  }

  useEffect(() => {
    if (!open) return;
    const escape = (event) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, saving]);

  function edit(nextMode) {
    setName(nextMode === "rename" ? selected.name : "");
    setError("");
    setMode(nextMode);
  }

  async function persist(next) {
    const result = await onChange(next);
    if (!result) throw new Error("题单保存失败，请重试");
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      if (mode === "delete") {
        await persist(lists.filter((item) => item.id !== selectedId));
        onSelect("");
      } else {
        const result = saveProblemList(lists, {
          id: mode === "rename" ? selectedId : undefined, name,
          problemKey: problem ? problemKey(problem) : undefined,
        });
        await persist(result.lists);
        if (!problem) onSelect(result.item.id);
      }
      setMode(null);
      onCloseProblem();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(list) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const key = problemKey(problem);
      await persist(setProblemListMembership(lists, list.id, key, !list.problemKeys.includes(key)));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="problem-list-controls" aria-label="自建题单">
        <select aria-label="查看题单" value={selectedId} onChange={(event) => onSelect(event.target.value)}>
          <option value="">全部题目</option>
          {lists.map((item) => <option key={item.id} value={item.id} data-i18n-preserve>{item.name}</option>)}
        </select>
        <button type="button" onClick={() => edit("create")} title="新建题单"><Plus size={15} /><span>新建题单</span></button>
        {selected ? <>
          <button type="button" onClick={() => edit("rename")} title="重命名题单" aria-label="重命名题单"><Pencil size={14} /></button>
          <button type="button" onClick={() => edit("delete")} title="删除题单" aria-label="删除题单"><Trash2 size={14} /></button>
        </> : null}
      </div>
      {open ? createPortal(
        <div className="problem-list-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="problem-list-dialog" role="dialog" aria-modal="true" aria-labelledby="problem-list-dialog-title">
            <header>
              <FolderPlus size={21} />
              <h2 id="problem-list-dialog-title">{mode === "create" ? "新建题单" : mode === "rename" ? "重命名题单" : mode === "delete" ? "删除题单" : "收录到自建题单"}</h2>
              <button type="button" aria-label="关闭题单窗口" onClick={close} disabled={saving}><X size={18} /></button>
            </header>
            {error ? <p className="problem-list-error" role="alert">{error}</p> : null}
            {mode ? (
              <form onSubmit={submit}>
                {mode === "delete" ? <p>删除题单后，题目仍保留在题库中。</p> : (
                  <label className="problem-list-name">题单名称
                    <input autoFocus required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：图论专项、周末训练" />
                  </label>
                )}
                {mode === "delete" ? <strong data-i18n-preserve>{selected?.name}</strong> : null}
                {problem ? <p data-i18n-preserve>{problemKey(problem)} · {problem.name}</p> : null}
                <footer>
                  <button type="button" className="ghost-button" onClick={close} disabled={saving}>取消</button>
                  <button type="submit" className="primary-button" disabled={saving}>{saving ? "保存中" : mode === "delete" ? "确认删除题单" : mode === "rename" ? "保存名称" : "创建题单"}</button>
                </footer>
              </form>
            ) : (
              <>
                <p className="problem-list-target" data-i18n-preserve>{problemKey(problem)} · {problem.name}</p>
                <div className="problem-list-picker">
                  {lists.length ? lists.map((item) => {
                    const included = item.problemKeys.includes(problemKey(problem));
                    return <button key={item.id} type="button" aria-pressed={included} disabled={saving} onClick={() => toggle(item)}>
                      <span className={included ? "is-included" : ""}>{included ? <Check size={15} /> : <Plus size={15} />}</span>
                      <strong data-i18n-preserve>{item.name}</strong>
                      <small>{item.problemKeys.length} 道题</small>
                    </button>;
                  }) : <p>还没有自建题单，先创建一份。</p>}
                </div>
                <footer><button type="button" className="ghost-button" disabled={saving} onClick={() => edit("create")}><Plus size={15} /> 新建题单</button><button type="button" className="primary-button" disabled={saving} onClick={close}>完成</button></footer>
              </>
            )}
          </section>
        </div>, document.body,
      ) : null}
    </>
  );
}
