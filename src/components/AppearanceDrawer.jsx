import {
  Check,
  Eye,
  ImagePlus,
  LocateFixed,
  Palette,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

const appearanceDefaults = {
  wallpaperEnabled: false,
  wallpaperId: "",
  wallpaperClarity: 100,
  wallpaperOpacity: 92,
  wallpaperBrightness: 100,
  wallpaperScale: 100,
  wallpaperPosition: "center center",
  panelOpacity: 72,
  accentTheme: "sky",
  reduceMotion: false,
};

const visibilityPresets = [
  {
    id: "balanced",
    label: "大厅平衡",
    hint: "背景鲜明，中央题单保持清楚",
    values: { wallpaperClarity: 100, wallpaperOpacity: 92, wallpaperBrightness: 100, panelOpacity: 72 },
  },
  {
    id: "focus",
    label: "专注刷题",
    hint: "降低背景存在感，强化面板",
    values: { wallpaperClarity: 96, wallpaperOpacity: 82, wallpaperBrightness: 88, panelOpacity: 84 },
  },
  {
    id: "showcase",
    label: "大厅展示",
    hint: "最大程度展示当前本地素材",
    values: { wallpaperClarity: 100, wallpaperOpacity: 100, wallpaperBrightness: 108, panelOpacity: 62 },
  },
];

const sliderDefinitions = [
  ["wallpaperClarity", "背景清晰度", "向左柔化背景，向右保留原图细节", 0, 100],
  ["wallpaperOpacity", "背景显示强度", "调节背景在界面中的可见程度", 0, 100],
  ["wallpaperBrightness", "背景亮度", "单独修正偏暗或偏亮的图片", 55, 135],
  ["wallpaperScale", "背景缩放", "放大图片以寻找更合适的构图", 100, 155],
  ["panelOpacity", "面板透明度", "调节内容面板的遮挡强度与可读性", 58, 96],
];

const positions = [
  ["left top", "左上"],
  ["center top", "上方"],
  ["right top", "右上"],
  ["left center", "左侧"],
  ["center center", "居中"],
  ["center right", "右侧"],
  ["left bottom", "左下"],
  ["center bottom", "下方"],
  ["right bottom", "右下"],
];

const accents = [
  { id: "sky", label: "天空蓝", color: "#2f86f6", hint: "清澈、专注" },
  { id: "mint", label: "薄荷绿", color: "#43c7a1", hint: "柔和、舒缓" },
  { id: "coral", label: "珊瑚粉", color: "#f27d9b", hint: "明快、醒目" },
];

function Toggle({ checked, label, hint, onChange }) {
  return (
    <div className="appearance-toggle-row">
      <span><strong>{label}</strong><small>{hint}</small></span>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        className={`toggle ${checked ? "is-on" : ""}`}
        onClick={() => onChange(!checked)}
      ><i /></button>
    </div>
  );
}

export default function AppearanceDrawer({
  settings,
  customWallpaper,
  onPreview,
  onCommit,
  onChooseCustom,
  onClearCustom,
  onClose,
}) {
  const [draft, setDraft] = useState(() => ({ ...appearanceDefaults, ...settings }));

  useEffect(() => {
    setDraft({ ...appearanceDefaults, ...settings });
  }, [settings]);

  function updateAccent(accentTheme) {
    updateAppearance({ accentTheme });
  }

  function updateAppearance(patch) {
    setDraft((current) => ({ ...current, ...patch }));
    onPreview?.(patch);
  }

  async function chooseCustomWallpaper() {
    const result = await onChooseCustom?.();
    if (!result?.canceled && (result?.dataUrl || result?.url)) {
      updateAppearance({ wallpaperEnabled: true, wallpaperId: "custom" });
    }
  }

  async function clearCustomWallpaper() {
    const result = await onClearCustom?.();
    if (result?.cleared !== false) {
      updateAppearance({ wallpaperEnabled: false, wallpaperId: "" });
    }
  }

  function restoreDefault() {
    updateAccent("sky");
  }

  function finish() {
    onCommit?.(draft);
    onClose?.();
  }

  const activeVisibilityPreset = visibilityPresets.find(({ values }) =>
    Object.entries(values).every(([key, value]) => draft[key] === value),
  )?.id;

  return (
    <div className="appearance-backdrop" role="presentation" onMouseDown={finish}>
      <aside
        className="appearance-drawer"
        aria-label="外观设置"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="appearance-drawer__header">
          <span className="appearance-drawer__icon"><Palette size={19} /></span>
          <div>
            <span>APPEARANCE / 视觉终端</span>
            <strong>外观设置</strong>
          </div>
          <button type="button" aria-label="关闭外观设置" onClick={finish}><X size={18} /></button>
        </header>

        <div className="appearance-drawer__body">
          <section className="appearance-section">
            <div className="appearance-section__title">
              <span><ImagePlus size={15} />本地人物与背景</span>
              <small>仅保存在本机，不随项目上传</small>
            </div>

            {customWallpaper ? (
              customWallpaper.mediaType === "video" ? (
                <div className="wallpaper-preview wallpaper-preview--video">
                  <video src={customWallpaper.url} muted loop autoPlay playsInline />
                  <span>{customWallpaper.name || "本地动态素材"}</span>
                </div>
              ) : (
                <div
                  className="wallpaper-preview"
                  style={{
                    backgroundImage: `url("${customWallpaper.dataUrl || customWallpaper.url}")`,
                  }}
                >
                  <span>{customWallpaper.name || "本地图片"}</span>
                </div>
              )
            ) : (
              <div className="wallpaper-preview wallpaper-preview--empty">
                <ImagePlus size={28} />
                <span>尚未导入本地素材</span>
              </div>
            )}

            <div className="wallpaper-actions">
              <button type="button" onClick={chooseCustomWallpaper}>
                <ImagePlus size={14} />{customWallpaper ? "更换素材" : "导入本地素材"}
              </button>
              <button type="button" onClick={clearCustomWallpaper} disabled={!customWallpaper}>
                <Trash2 size={14} />移除素材
              </button>
            </div>
            <p className="wallpaper-library__hint">
              支持 PNG、JPG、WebP、MP4 和 WebM。请从原作者或官方渠道取得素材，并遵守对应许可。
            </p>
          </section>

          <section className="appearance-section">
            <div className="appearance-section__title">
              <span><Eye size={15} />大厅可见度</span>
              <small>一键平衡背景与内容面板</small>
            </div>
            <div className="visibility-presets">
              {visibilityPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={activeVisibilityPreset === preset.id ? "is-active" : ""}
                  aria-pressed={activeVisibilityPreset === preset.id}
                  title={preset.hint}
                  onClick={() => updateAppearance(preset.values)}
                >
                  <strong>{preset.label}</strong>
                  <small>{preset.hint}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="appearance-section appearance-controls">
            {sliderDefinitions.map(([key, label, hint, min, max]) => (
              <label className="appearance-slider" key={key}>
                <span className="appearance-slider__heading">
                  <strong>{label}</strong>
                  <output>{draft[key]}%</output>
                </span>
                <small>{hint}</small>
                <input
                  type="range"
                  aria-label={label}
                  min={min}
                  max={max}
                  value={draft[key]}
                  style={{ "--range-progress": `${((draft[key] - min) / (max - min)) * 100}%` }}
                  onChange={(event) => updateAppearance({ [key]: Number(event.target.value) })}
                />
              </label>
            ))}
          </section>

          <section className="appearance-section">
            <div className="appearance-section__title">
              <span><LocateFixed size={15} />背景位置</span>
              <small>选择人物或画面的焦点</small>
            </div>
            <div className="position-picker">
              {positions.map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-label={label}
                  title={label}
                  className={draft.wallpaperPosition === value ? "is-active" : ""}
                  onClick={() => updateAppearance({ wallpaperPosition: value })}
                ><i /></button>
              ))}
            </div>
          </section>

          <section className="appearance-section">
            <Toggle
              checked={draft.wallpaperEnabled}
              label="显示本地背景"
              hint="关闭后回到纯 CSS 战术终端背景"
              onChange={(wallpaperEnabled) => updateAppearance({ wallpaperEnabled })}
            />
            <Toggle
              checked={draft.reduceMotion}
              label="节能 / 降低动态"
              hint="暂停动态背景并减少界面动画"
              onChange={(reduceMotion) => updateAppearance({ reduceMotion })}
            />
          </section>

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
