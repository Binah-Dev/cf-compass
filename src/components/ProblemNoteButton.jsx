import { NotebookPen } from "lucide-react";

export default function ProblemNoteButton({ problem, onOpenNote, compact = true }) {
  if (!problem || typeof onOpenNote !== "function") return null;
  return (
    <button
      type="button"
      className={compact ? "icon-note-button" : "problem-note-button"}
      aria-label={`编辑 ${problem.name || problem.problemKey || "题目"} 的笔记`}
      title="复盘笔记"
      onClick={() => onOpenNote(problem)}
    >
      <NotebookPen size={compact ? 15 : 16} />
      {!compact ? <span>笔记</span> : null}
    </button>
  );
}
