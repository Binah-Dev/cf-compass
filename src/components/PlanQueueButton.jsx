import { Check, ListPlus, RotateCcw } from "lucide-react";
import { problemKey } from "../lib/codeforces";

export default function PlanQueueButton({ problem, planKey, label, plannedKeys, onAddToPlan, compact = false, completed = false }) {
  const key = planKey || problemKey(problem);
  const name = label || key;
  const planned = plannedKeys?.has(key);
  return (
    <button
      type="button"
      className={`plan-queue-action ${compact ? "is-compact" : ""} ${planned ? "is-active" : ""}`}
      aria-label={planned ? `已加入待做 ${name}` : completed ? `再次复习 ${name}` : `加入待做 ${name}`}
      title={planned ? "已在计划题单" : completed ? "再次加入待做队列" : "加入待做队列"}
      disabled={planned}
      onClick={(event) => { event.stopPropagation(); if (!planned) onAddToPlan(key); }}
    >
      {planned ? <Check size={14} /> : completed ? <RotateCcw size={14} /> : <ListPlus size={14} />}
      {compact ? null : <span>{planned ? "已待做" : completed ? "再复习" : "加入待做"}</span>}
    </button>
  );
}
