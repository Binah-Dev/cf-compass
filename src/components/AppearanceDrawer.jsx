import {
  Check,
  Clock3,
  Eye,
  FolderOpen,
  Heart,
  Image as ImageIcon,
  ImagePlus,
  Languages,
  LocateFixed,
  Palette,
  RotateCcw,
  Search,
  Shuffle,
  Type,
  Video,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  BUILT_IN_WALLPAPERS,
  DEFAULT_WALLPAPER_ID,
  WALLPAPER_LIBRARY_COUNTS,
} from "../data/wallpapers";

const appearanceDefaults = {
  wallpaperEnabled: Boolean(DEFAULT_WALLPAPER_ID),
  wallpaperId: DEFAULT_WALLPAPER_ID,
  wallpaperClarity: 100,
  wallpaperOpacity: 92,
  wallpaperBrightness: 100,
  wallpaperScale: 100,
  wallpaperPosition: "center center",
  wallpaperFit: "smart",
  wallpaperVideoPlaybackRate: 100,
  pauseWallpaperWhenUnfocused: true,
  panelOpacity: 72,
  wallpaperFavorites: DEFAULT_WALLPAPER_ID ? [DEFAULT_WALLPAPER_ID] : [],
  wallpaperLocked: true,
  randomWallpaperOnPageChange: false,
  wallpaperAutoRotateMinutes: 0,
  usePageWallpapers: false,
  pageWallpapers: {},
  accentTheme: "sky",
  interfaceDensity: "comfortable",
  reduceMotion: false,
};

const WALLPAPER_PAGE_SIZE = 36;

const wallpaperCategories = [
  { id: "all", label: "全部", countKey: "total" },
  { id: "curated", label: "精选", countKey: "curated" },
  { id: "student", label: "学生大厅", countKey: "student" },
  { id: "scenario", label: "剧情原图", countKey: "scenario" },
  { id: "custom", label: "角色素材", countKey: "custom" },
];

const autoRotateOptions = [
  [0, "关闭"],
  [1, "每 1 分钟"],
  [5, "每 5 分钟"],
  [10, "每 10 分钟"],
  [15, "每 15 分钟"],
  [30, "每 30 分钟"],
  [60, "每 1 小时"],
  [120, "每 2 小时"],
];

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

const fitModes = [
  ["smart", "智能填充", "完整主体＋柔化延展，无黑边"],
  ["cover", "全屏裁切", "铺满窗口，可能裁掉画面边缘"],
  ["contain", "完整显示", "保留全部画面，允许深色留边"],
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
  activePage,
  wallpapers = BUILT_IN_WALLPAPERS,
  wallpaperCounts = WALLPAPER_LIBRARY_COUNTS,
  defaultWallpaperId = DEFAULT_WALLPAPER_ID,
  onClose,
}) {
  const [draft, setDraft] = useState(() => ({ ...appearanceDefaults, ...settings }));
  const [wallpaperSearch, setWallpaperSearch] = useState("");
  const [wallpaperCategory, setWallpaperCategory] = useState("all");
  const [importingWallpaper, setImportingWallpaper] = useState(false);
  const [visibleWallpaperLimit, setVisibleWallpaperLimit] = useState(WALLPAPER_PAGE_SIZE);
  const deferredWallpaperSearch = useDeferredValue(wallpaperSearch.trim().toLowerCase());
  const activeWallpaperId = draft.usePageWallpapers
    ? draft.pageWallpapers?.[activePage] || draft.wallpaperId
    : draft.wallpaperId;
  const selectedWallpaper = useMemo(
    () => wallpapers.find((item) => item.id === activeWallpaperId),
    [activeWallpaperId, wallpapers],
  );
  const filteredWallpapers = useMemo(() => {
    const query = deferredWallpaperSearch;
    return wallpapers.filter((wallpaper) => {
      const category = wallpaper.category || "curated";
      if (wallpaperCategory !== "all" && category !== wallpaperCategory) return false;
      if (!query) return true;
      return `${wallpaper.name} ${wallpaper.credit || ""} ${wallpaper.keywords || ""} ${wallpaper.resolution || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [deferredWallpaperSearch, wallpaperCategory, wallpapers]);
  const visibleWallpapers = filteredWallpapers.slice(0, visibleWallpaperLimit);

  useEffect(() => {
    setDraft({ ...appearanceDefaults, ...settings });
  }, [settings]);

  useEffect(() => {
    setVisibleWallpaperLimit(WALLPAPER_PAGE_SIZE);
  }, [deferredWallpaperSearch, wallpaperCategory]);

  function updateAccent(accentTheme) {
    updateAppearance({ accentTheme });
  }

  function updateAppearance(patch) {
    setDraft((current) => ({ ...current, ...patch }));
    onPreview?.(patch);
  }

  async function chooseCustomWallpaper() {
    setImportingWallpaper(true);
    try {
      const result = await onChooseCustom?.();
      if (!result?.canceled && (result?.dataUrl || result?.url)) {
        updateAppearance({ wallpaperEnabled: true, wallpaperId: "custom" });
      }
    } finally {
      setImportingWallpaper(false);
    }
  }

  function selectWallpaper(wallpaperId) {
    const patch = { wallpaperEnabled: true };
    if (draft.usePageWallpapers) {
      patch.pageWallpapers = {
        ...(draft.pageWallpapers || {}),
        [activePage]: wallpaperId,
      };
    } else {
      patch.wallpaperId = wallpaperId;
    }
    updateAppearance(patch);
  }

  function toggleWallpaperFavorite() {
    const favorites = new Set(draft.wallpaperFavorites || []);
    favorites.has(activeWallpaperId)
      ? favorites.delete(activeWallpaperId)
      : favorites.add(activeWallpaperId);
    updateAppearance({ wallpaperFavorites: [...favorites] });
  }

  function randomWallpaper() {
    const favoriteIds = (draft.wallpaperFavorites || []).filter((id) =>
      wallpapers.some((item) => item.id === id),
    );
    const pool = favoriteIds.length
      ? wallpapers.filter((item) => favoriteIds.includes(item.id))
      : filteredWallpapers;
    const alternatives = pool.filter((item) => item.id !== activeWallpaperId);
    const next = alternatives[Math.floor(Math.random() * alternatives.length)] || pool[0];
    if (next) selectWallpaper(next.id);
  }

  async function restoreLobbyTheme() {
    await onClearCustom?.();
    if (defaultWallpaperId) {
      updateAppearance({
        wallpaperEnabled: true,
        wallpaperId: defaultWallpaperId,
        wallpaperClarity: 100,
        wallpaperOpacity: 92,
        wallpaperBrightness: 100,
        wallpaperScale: 100,
        wallpaperPosition: "center center",
        wallpaperFit: "smart",
        wallpaperVideoPlaybackRate: 100,
        pauseWallpaperWhenUnfocused: true,
        panelOpacity: 72,
      });
    } else {
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
  const activeWallpaper = activeWallpaperId === "custom" ? customWallpaper : selectedWallpaper;
  const previewUrl = activeWallpaper?.previewUrl || activeWallpaper?.dataUrl || activeWallpaper?.url;
  const previewIsVideo = activeWallpaper?.mediaType === "video";
  const wallpaperResolution = activeWallpaper?.width && activeWallpaper?.height
    ? `${activeWallpaper.width} × ${activeWallpaper.height}`
    : activeWallpaper?.resolution || "";
  const isFavorite = (draft.wallpaperFavorites || []).includes(activeWallpaperId);

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
              <span><ImageIcon size={15} />背景图片</span>
              {selectedWallpaper?.credit
                ? <small data-i18n-preserve>{selectedWallpaper.credit}</small>
                : <small>本地素材 · 不随项目上传</small>}
            </div>

            {previewIsVideo ? (
              <div className={`wallpaper-preview wallpaper-preview--video wallpaper-preview--${draft.wallpaperFit || "smart"}`}>
                <video src={activeWallpaper?.url || previewUrl} muted loop autoPlay={!draft.reduceMotion} playsInline preload="metadata" />
                <span><Video size={14} /><em>动态预览</em>{wallpaperResolution ? ` · ${wallpaperResolution}` : ""}</span>
              </div>
            ) : (
              <div
                className={`wallpaper-preview wallpaper-preview--${draft.wallpaperFit || "smart"} ${previewUrl ? "" : "wallpaper-preview--empty"}`}
              >
                {previewUrl ? <>
                  <img className="wallpaper-preview__backdrop" src={previewUrl} alt="" />
                  <img className="wallpaper-preview__image" src={previewUrl} alt="" />
                </> : null}
                {previewUrl ? <span><Eye size={14} /><em>实时预览</em>{wallpaperResolution ? ` · ${wallpaperResolution}` : ""}</span> : <><ImagePlus size={28} /><span>尚未导入本地素材包</span></>}
              </div>
            )}

            <div className="wallpaper-actions">
              <button type="button" onClick={chooseCustomWallpaper} disabled={importingWallpaper}>
                <FolderOpen size={14} />{importingWallpaper ? "正在优化素材…" : "导入大厅画面"}
              </button>
              <button type="button" onClick={restoreLobbyTheme} disabled={!defaultWallpaperId && !customWallpaper}>
                <RotateCcw size={14} />恢复大厅主题
              </button>
            </div>
            <p className="wallpaper-library__hint">
              本机可用素材 {wallpaperCounts.total || 0} 张
              {wallpaperCounts.rejected ? `，已隔离 ${wallpaperCounts.rejected} 张不完整素材` : ""}；
              图片不进入 GitHub 安装包，请遵守原素材许可。
            </p>
            {wallpapers.length ? (
              <>
                <div className="wallpaper-tools">
                  <label><Search size={13} /><input value={wallpaperSearch} onChange={(event) => setWallpaperSearch(event.target.value)} placeholder="搜索学生或场景" aria-label="搜索大厅背景" /></label>
                  <button type="button" className={isFavorite ? "is-active" : ""} onClick={toggleWallpaperFavorite} title={isFavorite ? "取消收藏当前背景" : "收藏当前背景"}><Heart size={14} fill={isFavorite ? "currentColor" : "none"} /></button>
                  <button type="button" onClick={randomWallpaper} title="从收藏中随机"><Shuffle size={14} /></button>
                </div>
                <div className="wallpaper-category-tabs" role="tablist" aria-label="大厅素材分类">
                  {wallpaperCategories.map((category) => (
                    <button key={category.id} type="button" role="tab" aria-selected={wallpaperCategory === category.id} className={wallpaperCategory === category.id ? "is-active" : ""} onClick={() => setWallpaperCategory(category.id)}>
                      <span>{category.label}</span><small>{wallpaperCounts[category.countKey] || 0}</small>
                    </button>
                  ))}
                </div>
                <div className="wallpaper-library">
                  {visibleWallpapers.map((wallpaper) => (
                    <button key={wallpaper.id} type="button" data-i18n-preserve className={activeWallpaperId === wallpaper.id ? "is-active" : ""} onClick={() => selectWallpaper(wallpaper.id)} title={wallpaper.name}>
                      <img src={wallpaper.previewUrl || wallpaper.url} alt="" loading="lazy" decoding="async" />
                      <span>{wallpaper.name}</span>
                      {activeWallpaperId === wallpaper.id ? <Check size={13} /> : null}
                    </button>
                  ))}
                  {customWallpaper?.dataUrl || customWallpaper?.url ? (
                    <button type="button" className={activeWallpaperId === "custom" ? "is-active" : ""} onClick={() => selectWallpaper("custom")} title={customWallpaper.name || "本地图片"}>
                      {customWallpaper.mediaType === "video" ? <span className="wallpaper-library__video"><Video size={16} /></span> : <img src={customWallpaper.previewUrl || customWallpaper.dataUrl || customWallpaper.url} alt="" loading="lazy" decoding="async" />}
                      <span>我的大厅</span>{activeWallpaperId === "custom" ? <Check size={13} /> : null}
                    </button>
                  ) : null}
                </div>
                <div className="wallpaper-library__footer">
                  <span>显示 {Math.min(visibleWallpapers.length, filteredWallpapers.length)} / {filteredWallpapers.length} 张</span>
                  {visibleWallpapers.length < filteredWallpapers.length ? <button type="button" onClick={() => setVisibleWallpaperLimit((current) => current + WALLPAPER_PAGE_SIZE)}>加载更多</button> : null}
                </div>
              </>
            ) : null}
          </section>

          <section className="appearance-section">
            <div className="appearance-section__title">
              <span><ImageIcon size={15} />画面适配</span>
              <small>按素材比例选择无黑边或完整构图</small>
            </div>
            <div className="wallpaper-fit-picker" role="group" aria-label="背景适配模式">
              {fitModes.map(([id, label, hint]) => (
                <button
                  type="button"
                  key={id}
                  className={(draft.wallpaperFit || "smart") === id ? "is-active" : ""}
                  aria-pressed={(draft.wallpaperFit || "smart") === id}
                  onClick={() => updateAppearance({ wallpaperFit: id })}
                >
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
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

          {previewIsVideo ? (
            <section className="appearance-section appearance-controls">
              <label className="appearance-slider">
                <span className="appearance-slider__heading">
                  <strong>动态播放速度</strong>
                  <output>{draft.wallpaperVideoPlaybackRate || 100}%</output>
                </span>
                <small>适当降低速度可获得更舒缓的大厅效果</small>
                <input
                  type="range"
                  aria-label="动态播放速度"
                  min="50"
                  max="150"
                  value={draft.wallpaperVideoPlaybackRate || 100}
                  style={{ "--range-progress": `${((draft.wallpaperVideoPlaybackRate || 100) - 50)}%` }}
                  onChange={(event) => updateAppearance({ wallpaperVideoPlaybackRate: Number(event.target.value) })}
                />
              </label>
              <Toggle
                checked={draft.pauseWallpaperWhenUnfocused !== false}
                label="失焦时暂停动态大厅"
                hint="切到其他窗口或最小化时停止解码，降低功耗"
                onChange={(pauseWallpaperWhenUnfocused) => updateAppearance({ pauseWallpaperWhenUnfocused })}
              />
            </section>
          ) : null}

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
            <Toggle
              checked={draft.wallpaperLocked}
              label="锁定当前背景"
              hint="关闭后切换页面不会自动轮换"
              onChange={(wallpaperLocked) => updateAppearance({ wallpaperLocked })}
            />
            <Toggle
              checked={draft.randomWallpaperOnPageChange}
              label="切页随机轮换"
              hint="优先从收藏的大厅中随机选择"
              onChange={(randomWallpaperOnPageChange) => updateAppearance({ randomWallpaperOnPageChange })}
            />
            <div className="appearance-select-row">
              <span><Clock3 size={14} /><strong>自动轮换间隔</strong><small>到达间隔后优先从收藏中选择下一张</small></span>
              <select value={draft.wallpaperAutoRotateMinutes || 0} onChange={(event) => updateAppearance({ wallpaperAutoRotateMinutes: Number(event.target.value) })}>
                {autoRotateOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <Toggle
              checked={draft.usePageWallpapers}
              label="每页独立背景"
              hint="当前选择会记录这个页面的专属大厅"
              onChange={(usePageWallpapers) => updateAppearance({ usePageWallpapers })}
            />
          </section>

          <section className="appearance-section">
            <div className="appearance-section__title">
              <span><Languages size={15} />界面语言</span>
              <small>选择软件显示语言，立即生效</small>
            </div>
            <div className="language-picker" role="group" aria-label="界面语言">
              <button
                type="button"
                className={(draft.language || "zh-CN") === "zh-CN" ? "is-active" : ""}
                aria-pressed={(draft.language || "zh-CN") === "zh-CN"}
                onClick={() => updateAppearance({ language: "zh-CN" })}
              >
                <strong>简体中文</strong>
                <small>中文</small>
              </button>
              <button
                type="button"
                className={draft.language === "en-US" ? "is-active" : ""}
                aria-pressed={draft.language === "en-US"}
                onClick={() => updateAppearance({ language: "en-US" })}
              >
                <strong>English</strong>
                <small>English</small>
              </button>
            </div>
          </section>

          <section className="appearance-section">
            <div className="appearance-section__title">
              <span><Type size={15} />界面与字体</span>
              <small>调整信息密度，同时守住可读性底线</small>
            </div>
            <div className="density-picker" role="group" aria-label="界面密度">
              {[
                ["compact", "紧凑", "适合小屏与高信息量"],
                ["comfortable", "舒适", "正文 14 px，推荐"],
                ["large", "大字", "更大的文字与行距"],
              ].map(([id, label, hint]) => (
                <button
                  type="button"
                  key={id}
                  className={(draft.interfaceDensity || "comfortable") === id ? "is-active" : ""}
                  aria-pressed={(draft.interfaceDensity || "comfortable") === id}
                  onClick={() => updateAppearance({ interfaceDensity: id })}
                >
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
            <p className="appearance-readable-note">
              功能文字不会低于 12 px；长标题保持省略显示，悬停可查看全文。
            </p>
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
