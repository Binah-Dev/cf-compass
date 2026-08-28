import { Check, ListPlus } from "lucide-react";
import { problemKey } from "../lib/codeforces";

export default function PlanQueueButton({ problem, plannedKeys, onAddToPlan, compact = false }) {
  const key = problemKey(problem);
  const planned = plannedKeys?.has(key);
  return (
    <button
      type="button"
      className={`plan-queue-action ${compact ? "is-compact" : ""} ${planned ? "is-active" : ""}`}
      aria-label={planned ? `已加入待做 ${key}` : `加入待做 ${key}`}
      title={planned ? "已在计划题单" : "加入待做队列"}
      disabled={planned}
      onClick={(event) => { event.stopPropagation(); if (!planned) onAddToPlan(key); }}
    >
      {planned ? <Check size={14} /> : <ListPlus size={14} />}
      {compact ? null : <span>{planned ? "已待做" : "加入待做"}</span>}
    </button>
  );
}
