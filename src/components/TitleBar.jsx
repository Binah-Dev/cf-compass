import { Code2, Minus, Square, X } from "lucide-react";

export default function TitleBar({ immersive = false }) {
  return (
    <div className="titlebar" inert={immersive} aria-hidden={immersive || undefined}>
      <div className="titlebar__brand">
        <span className="brand-mark brand-mark--mini">
          <Code2 size={14} strokeWidth={2.4} />
        </span>
        <span>CF Compass</span>
      </div>
      <div className="titlebar__drag" />
      <div className="window-actions">
        <button type="button" aria-label="最小化" onClick={() => window.cfBridge?.minimize()}>
          <Minus size={14} />
        </button>
        <button type="button" aria-label="最大化" onClick={() => window.cfBridge?.maximize()}>
          <Square size={12} />
        </button>
        <button
          type="button"
          className="window-actions__close"
          aria-label="关闭"
          onClick={() => window.cfBridge?.close()}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
