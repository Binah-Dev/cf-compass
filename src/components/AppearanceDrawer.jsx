import { Check, Palette, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

const accents = [
  { id: "sky", label: "天空蓝", color: "#2f86f6", hint: "清澈、专注" },
  { id: "mint", label: "薄荷绿", color: "#43c7a1", hint: "柔和、舒缓" },
  { id: "coral", label: "珊瑚粉", color: "#f27d9b", hint: "明快、醒目" },
];

export default function AppearanceDrawer({ settings, onPreview, onCommit, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...settings, accentTheme: settings?.accentTheme || "sky" }));

  useEffect(() => {
    setDraft({ ...settings, accentTheme: settings?.accentTheme || "sky" });
  }, [settings]);

  function updateAccent(accentTheme) {
    setDraft((current) => ({ ...current, accentTheme }));
    onPreview?.({ accentTheme });
  }

  function restoreDefault() {
    updateAccent("sky");
  }

  function finish() {
    onCommit?.(draft);
    onClose?.();
  }

  return (
    <div className="appearance-backdrop" role="presentation" onMouseDown={finish}>
      <aside
        className="appearance-drawer"
        aria-label="主题色设置"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="appearance-drawer__header">
          <span className="appearance-drawer__icon"><Palette size={19} /></span>
          <div>
            <span>APPEARANCE / 视觉终端</span>
            <strong>主题色</strong>
          </div>
          <button type="button" aria-label="关闭主题色设置" onClick={finish}><X size={18} /></button>
        </header>

        <div className="appearance-drawer__body">
          <section className="appearance-section">
            <div className="appearance-section__title">
              <span><Palette size={15} />三套主题色</span>
              <small>纯 CSS 配色，不包含第三方壁纸素材</small>
            </div>
            <div className="accent-picker">
              {accents.map((accent) => (
                <button
                  type="button"
                  key={accent.id}
                  className={draft.accentTheme === accent.id ? "is-active" : ""}
                  onClick={() => updateAccent(accent.id)}
                  title={accent.hint}
                >
                  <i style={{ background: accent.color }} />
                  <span>{accent.label}</span>
                  {draft.accentTheme === accent.id ? <Check size={13} /> : null}
                </button>
              ))}
            </div>
            <button type="button" className="appearance-reset-button" onClick={restoreDefault}>
              <RotateCcw size={14} />恢复天空蓝
            </button>
          </section>
        </div>

        <footer className="appearance-drawer__footer">
          <span>设置仅保存在本机</span>
          <button type="button" className="primary-button" onClick={finish}>
            <Check size={15} />完成
          </button>
        </footer>
      </aside>
    </div>
  );
}
