const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cfBridge", {
  getCache: () => ipcRenderer.invoke("data:get-cache"),
  sync: (handle) => ipcRenderer.invoke("data:sync", handle),
  getContestReplay: () => ipcRenderer.invoke("contests:get"),
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
  exportData: (snapshot) => ipcRenderer.invoke("data:export", snapshot),
  importData: () => ipcRenderer.invoke("data:import"),
  openBackupFolder: () => ipcRenderer.invoke("data:open-backups"),
  getFavorites: () => ipcRenderer.invoke("favorites:get"),
  setFavorites: (favorites) => ipcRenderer.invoke("favorites:set", favorites),
  getStudyData: () => ipcRenderer.invoke("study:get"),
  setStudyData: (studyData) => ipcRenderer.invoke("study:set", studyData),
  getStudyPlan: () => ipcRenderer.invoke("plan:get"),
  addStudyPlanProblem: (problemKey) => ipcRenderer.invoke("plan:add", problemKey),
  setStudyPlanStatus: (itemId, status) => ipcRenderer.invoke("plan:status", itemId, status),
  removeStudyPlanItem: (itemId) => ipcRenderer.invoke("plan:remove", itemId),
  reorderStudyPlan: (itemIds) => ipcRenderer.invoke("plan:reorder", itemIds),
  openStudyPlanWindow: () => ipcRenderer.invoke("plan:window-open"),
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
