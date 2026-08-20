const STUDY_KEY = "cf-compass-study-v1";
const ACTIVITY_KEY = "cf-compass-activity-v1";

export const DEFAULT_STUDY_DATA = {
  version: 1,
  notes: {},
  reviews: {},
  contestQueue: [],
  plan: null,
  settings: {
    themeVersion: 6,
    reviewLimit: 8,
    reviewRatingGap: 0,
    newProblemLimit: 5,
    recommendationTierCounts: {
      consolidate: 2,
      steady: 3,
      challenge: 2,
    },
    autoSync: true,
    autoSyncMinutes: 30,
    autoBackup: true,
    backupRetention: 14,
    problemCacheHours: 6,
    syncRatingHistory: true,
    wallpaperEnabled: false,
    wallpaperId: "",
    wallpaperClarity: 100,
    wallpaperOpacity: 92,
    wallpaperBrightness: 100,
    wallpaperScale: 100,
    wallpaperPosition: "center center",
    panelOpacity: 72,
    wallpaperFavorites: [],
    wallpaperLocked: true,
    randomWallpaperOnPageChange: false,
    wallpaperAutoRotateMinutes: 0,
    usePageWallpapers: false,
    pageWallpapers: {},
    accentTheme: "sky",
    reduceMotion: false,
  },
};

export function normalizeStudyData(value) {
  const source = value && typeof value === "object" ? value : {};
  const savedSettings = source.settings || {};
  const needsRecollectionTheme = Number(savedSettings.themeVersion || 0) < 3;
  const needsLobbyVisibilityUpgrade = Number(savedSettings.themeVersion || 0) < 4;
  const needsWallpaperLayoutUpgrade = Number(savedSettings.themeVersion || 0) < 6;
  const recollectionSettings = needsRecollectionTheme
    ? {
        ...savedSettings,
        wallpaperId:
          savedSettings.wallpaperId === "custom"
            ? "custom"
            : DEFAULT_STUDY_DATA.settings.wallpaperId,
        wallpaperClarity: DEFAULT_STUDY_DATA.settings.wallpaperClarity,
        wallpaperOpacity: DEFAULT_STUDY_DATA.settings.wallpaperOpacity,
        wallpaperBrightness: DEFAULT_STUDY_DATA.settings.wallpaperBrightness,
        wallpaperScale: DEFAULT_STUDY_DATA.settings.wallpaperScale,
        panelOpacity: DEFAULT_STUDY_DATA.settings.panelOpacity,
      }
    : savedSettings;
  const migratedSettings = needsLobbyVisibilityUpgrade
    ? {
        ...recollectionSettings,
        themeVersion: 4,
        wallpaperOpacity:
          Number(recollectionSettings.wallpaperOpacity ?? 78) === 78
            ? DEFAULT_STUDY_DATA.settings.wallpaperOpacity
            : recollectionSettings.wallpaperOpacity,
        wallpaperBrightness:
          Number(recollectionSettings.wallpaperBrightness ?? 82) === 82
            ? DEFAULT_STUDY_DATA.settings.wallpaperBrightness
            : recollectionSettings.wallpaperBrightness,
        panelOpacity:
          Number(recollectionSettings.panelOpacity ?? 82) === 82
            ? DEFAULT_STUDY_DATA.settings.panelOpacity
            : recollectionSettings.panelOpacity,
      }
    : recollectionSettings;
  const layoutSettings = needsWallpaperLayoutUpgrade
    ? {
        ...migratedSettings,
        themeVersion: 6,
        wallpaperScale: DEFAULT_STUDY_DATA.settings.wallpaperScale,
        wallpaperPosition: DEFAULT_STUDY_DATA.settings.wallpaperPosition,
      }
    : migratedSettings;
  return {
    ...DEFAULT_STUDY_DATA,
    ...source,
    notes: { ...(source.notes || {}) },
    reviews: { ...(source.reviews || {}) },
    contestQueue: Array.isArray(source.contestQueue)
      ? [...new Set(source.contestQueue.map(String))].slice(0, 1000)
      : [],
    settings: {
      ...DEFAULT_STUDY_DATA.settings,
      ...layoutSettings,
      recommendationTierCounts: {
        ...DEFAULT_STUDY_DATA.settings.recommendationTierCounts,
        ...(layoutSettings.recommendationTierCounts || {}),
      },
    },
  };
}

export async function loadStudyData() {
  if (window.cfBridge) {
    return normalizeStudyData(await window.cfBridge.getStudyData());
  }
  try {
    return normalizeStudyData(JSON.parse(localStorage.getItem(STUDY_KEY)));
  } catch {
    return normalizeStudyData();
  }
}

export async function saveStudyData(value) {
  const safe = normalizeStudyData(value);
  if (window.cfBridge) {
    return normalizeStudyData(await window.cfBridge.setStudyData(safe));
  }
  localStorage.setItem(STUDY_KEY, JSON.stringify(safe));
  return safe;
}

export async function getDataCenterStatus() {
  if (window.cfBridge) return window.cfBridge.getDataStatus();
  const data = JSON.parse(localStorage.getItem("cf-compass-cache-v1") || "null");
  const study = await loadStudyData();
  return {
    submissionCount: data?.submissions?.length || 0,
    latestSubmissionId: data?.submissions?.[0]?.id || null,
    lastSyncAt: data?.syncedAt || null,
    problemsetSyncedAt: data?.syncedAt || null,
    lastNewSubmissions: 0,
    incremental: false,
    reusedProblemset: false,
    ratingHistoryCount: data?.ratingHistory?.length || 0,
    settings: study.settings,
    backups: [],
    backupDirectory: "浏览器本地存储",
    activity: JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]"),
  };
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportAllData(data, favorites, study) {
  if (window.cfBridge) {
    return window.cfBridge.exportData({
      cache: data,
      favorites: [...favorites],
      study,
    });
  }
  downloadJson(`CF-Compass-backup-${new Date().toISOString().slice(0, 10)}.json`, {
    format: "cf-compass-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    reason: "browser-export",
    data: { cache: data, favorites: [...favorites], study },
  });
  return { canceled: false };
}

function chooseJsonFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        resolve(file ? JSON.parse(await file.text()) : null);
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}

export async function importAllData() {
  if (window.cfBridge) return window.cfBridge.importData();
  const bundle = await chooseJsonFile();
  if (!bundle) return { canceled: true };
  if (bundle.format !== "cf-compass-backup" || !bundle.data?.cache) {
    throw new Error("不是有效的 CF Compass 备份文件");
  }
  localStorage.setItem("cf-compass-cache-v1", JSON.stringify(bundle.data.cache));
  localStorage.setItem("cf-compass-favorites-v1", JSON.stringify(bundle.data.favorites || []));
  localStorage.setItem(STUDY_KEY, JSON.stringify(normalizeStudyData(bundle.data.study)));
  return {
    canceled: false,
    cache: bundle.data.cache,
    favorites: bundle.data.favorites || [],
    study: normalizeStudyData(bundle.data.study),
  };
}

export async function openBackupFolder() {
  if (window.cfBridge) return window.cfBridge.openBackupFolder();
  return undefined;
}
