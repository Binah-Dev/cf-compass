const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cfBridge", {
  getAppUpdateState: () => ipcRenderer.invoke("app-update:get"),
  checkAppUpdate: () => ipcRenderer.invoke("app-update:check"),
  setAutoUpdateCheck: (enabled) => ipcRenderer.invoke("app-update:set-auto-check", enabled),
  downloadAppUpdate: () => ipcRenderer.invoke("app-update:download"),
  cancelAppUpdate: () => ipcRenderer.invoke("app-update:cancel"),
  installAppUpdate: () => ipcRenderer.invoke("app-update:install"),
  openAppRelease: () => ipcRenderer.invoke("app-update:open-release"),
  onAppUpdateChanged: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("app-update:changed", listener);
    return () => ipcRenderer.removeListener("app-update:changed", listener);
  },
  getCache: () => ipcRenderer.invoke("data:get-cache"),
  getTrainingSessions: () => ipcRenderer.invoke("training:get"),
  saveTrainingDraft: (input) => ipcRenderer.invoke("training:save-draft", input),
  startTrainingSession: (id) => ipcRenderer.invoke("training:start", id),
  finishTrainingSession: (id) => ipcRenderer.invoke("training:finish", id),
  cancelTrainingSession: (id) => ipcRenderer.invoke("training:cancel", id),
  syncTrainingSession: (id) => ipcRenderer.invoke("training:sync", id),
  sync: (handle) => ipcRenderer.invoke("data:sync", handle),
  getContestReplay: () => ipcRenderer.invoke("contests:get"),
  getEstimatedRating: (retry = false) => ipcRenderer.invoke("rating:estimated", retry),
  getCombinedRating: (retry = false) => ipcRenderer.invoke("rating:combined", retry),
  onCombinedRatingChanged: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('rating:combined-changed', listener);
    return () => ipcRenderer.removeListener('rating:combined-changed', listener);
  },
  calculateVirtualReference: (replayId) => ipcRenderer.invoke("contests:virtual-reference", replayId),
  calculateContestReplay: (contestId, force = false) =>
    ipcRenderer.invoke("contests:calculate", contestId, force),
  calculateNextContestReplay: () => ipcRenderer.invoke("contests:calculate-next"),
  getContestCenter: (force = false) => ipcRenderer.invoke("contest-center:get", force),
  getContestCenterDetail: (contestId, force = false) =>
    ipcRenderer.invoke("contest-center:get-detail", contestId, force),
  getDataStatus: () => ipcRenderer.invoke("data:status"),
  getCodeforcesSourceConfig: () => ipcRenderer.invoke("codeforces:get-source-config"),
  setCodeforcesSourceConfig: (config) => ipcRenderer.invoke("codeforces:set-source-config", config),
  getAiConfig: () => ipcRenderer.invoke("ai:get-config"),
  setAiConfig: (config) => ipcRenderer.invoke("ai:set-config", config),
  analyzeContestWithAi: (contestId, options = {}) =>
    ipcRenderer.invoke("ai:analyze-contest", contestId, options),
  recommendContestProblems: (contestId, options = {}) =>
    ipcRenderer.invoke("ai:recommend-contest", contestId, options),
  exportData: (snapshot) => ipcRenderer.invoke("data:export", snapshot),
  importData: () => ipcRenderer.invoke("data:import"),
  openBackupFolder: () => ipcRenderer.invoke("data:open-backups"),
  getFavorites: () => ipcRenderer.invoke("favorites:get"),
  setFavorites: (favorites) => ipcRenderer.invoke("favorites:set", favorites),
  getStudyData: () => ipcRenderer.invoke("study:get"),
  setStudyData: (studyData) => ipcRenderer.invoke("study:set", studyData),
  setProblemNote: (problemKey, note) => ipcRenderer.invoke("study:note-set", problemKey, note),
  onStudyChanged: (callback) => {
    const listener = (_event, study) => callback(study);
    ipcRenderer.on("study:changed", listener);
    return () => ipcRenderer.removeListener("study:changed", listener);
  },
  getStudyPlan: () => ipcRenderer.invoke("plan:get"),
  addStudyPlanProblem: (problemKey) => ipcRenderer.invoke("plan:add", problemKey),
  setStudyPlanStatus: (itemId, status) => ipcRenderer.invoke("plan:status", itemId, status),
  removeStudyPlanItem: (itemId) => ipcRenderer.invoke("plan:remove", itemId),
  reorderStudyPlan: (itemIds) => ipcRenderer.invoke("plan:reorder", itemIds),
  openStudyPlanWindow: () => ipcRenderer.invoke("plan:window-open"),
  getStudyTimer: () => ipcRenderer.invoke("timer:get"),
  controlStudyTimer: (action) => ipcRenderer.invoke("timer:control", action),
  openStudyTimerWindow: () => ipcRenderer.invoke("timer:window-open"),
  onStudyTimerChanged: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("timer:changed", listener);
    return () => ipcRenderer.removeListener("timer:changed", listener);
  },
  getStudyTimerAudio: () => ipcRenderer.invoke("timer:audio-get"),
  chooseStudyTimerAudio: () => ipcRenderer.invoke("timer:audio-choose"),
  resetStudyTimerAudio: () => ipcRenderer.invoke("timer:audio-reset"),
  previewStudyTimerAudio: () => ipcRenderer.invoke("timer:audio-preview"),
  stopStudyTimerAudio: () => ipcRenderer.invoke("timer:audio-stop"),
  onStudyTimerAudioChanged: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("timer:audio-changed", listener);
    return () => ipcRenderer.removeListener("timer:audio-changed", listener);
  },
  onStudyTimerAudioCommand: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("timer:audio-command", listener);
    return () => ipcRenderer.removeListener("timer:audio-command", listener);
  },
  studyTimerAudioHostReady: () => ipcRenderer.invoke("timer:audio-host-ready"),
  studyTimerAudioPlayback: (value) => ipcRenderer.invoke("timer:audio-playback", value),
  onStudyPlanChanged: (callback) => {
    const listener = (_event, queue) => callback(queue);
    ipcRenderer.on("plan:changed", listener);
    return () => ipcRenderer.removeListener("plan:changed", listener);
  },
  getCustomWallpaper: () => ipcRenderer.invoke("appearance:get-wallpaper"),
  getLocalWallpaperLibrary: () => ipcRenderer.invoke("appearance:get-local-library"),
  chooseCustomWallpaper: () => ipcRenderer.invoke("appearance:choose-wallpaper"),
  updateCustomWallpaperMetadata: (metadata) =>
    ipcRenderer.invoke("appearance:update-wallpaper-metadata", metadata),
  clearCustomWallpaper: () => ipcRenderer.invoke("appearance:clear-wallpaper"),
  getTemplateLibrary: () => ipcRenderer.invoke("templates:get"),
  refreshTemplateLibrary: () => ipcRenderer.invoke("templates:refresh"),
  chooseTemplateLibraryFolder: () => ipcRenderer.invoke("templates:choose-folder"),
  setTemplateCategory: (relativePath, categoryId) =>
    ipcRenderer.invoke("templates:set-category", relativePath, categoryId),
  setTemplateSummary: (relativePath, summary) =>
    ipcRenderer.invoke("templates:set-summary", relativePath, summary),
  openTemplateFile: (filePath) => ipcRenderer.invoke("templates:open", filePath),
  openProblem: (url) => ipcRenderer.invoke("shell:open-problem", url),
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  platform: process.platform,
});
