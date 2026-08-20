import { GripHorizontal } from "lucide-react";
import { useState } from "react";

const PANEL_LABELS = {
  taxonomy: "算法分类",
  problems: "题目列表",
  progress: "个人进度",
};

export default function WorkbenchLayout({ order, panels, onOrderChange }) {
  const [draggingId, setDraggingId] = useState(null);
  const [dropHint, setDropHint] = useState(null);

  function startDrag(event, panelId) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", panelId);
    setDraggingId(panelId);
    setDropHint(null);
  }

  function updateDropHint(event, targetId) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!draggingId || draggingId === targetId) {
      setDropHint(null);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const position =
      event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
    setDropHint({ targetId, position });
  }

  function finishDrop(event, targetId) {
    event.preventDefault();
    const sourceId = draggingId || event.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId) {
      setDraggingId(null);
      setDropHint(null);
      return;
    }

    const nextOrder = order.filter((panelId) => panelId !== sourceId);
    const targetIndex = nextOrder.indexOf(targetId);
    const position = dropHint?.targetId === targetId ? dropHint.position : "after";
    nextOrder.splice(targetIndex + (position === "after" ? 1 : 0), 0, sourceId);
    onOrderChange(nextOrder);
    setDraggingId(null);
    setDropHint(null);
  }

  function endDrag() {
    setDraggingId(null);
    setDropHint(null);
  }

  return (
    <div className="workbench" aria-label="可拖动工作台">
      {order.map((panelId) => {
        const isDropTarget = dropHint?.targetId === panelId;
        const dropClass = isDropTarget
          ? ` is-drop-${dropHint.position}`
          : "";

        return (
          <section
            className={`draggable-panel draggable-panel--${panelId}${
              draggingId === panelId ? " is-dragging" : ""
            }${dropClass}`}
            data-panel-id={panelId}
            key={panelId}
            onDragOver={(event) => updateDropHint(event, panelId)}
            onDrop={(event) => finishDrop(event, panelId)}
          >
            <button
              className="panel-drag-handle"
              type="button"
              draggable
              aria-label={`拖动${PANEL_LABELS[panelId]}调整位置`}
              title={`拖动调整${PANEL_LABELS[panelId]}位置`}
              onDragStart={(event) => startDrag(event, panelId)}
              onDragEnd={endDrag}
            >
              <GripHorizontal size={17} />
            </button>
            {panels[panelId]}
          </section>
        );
      })}
    </div>
  );
}
