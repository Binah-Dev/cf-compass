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
  exportData: (snapshot) => ipcRenderer.invoke("data:export", snapshot),
  importData: () => ipcRenderer.invoke("data:import"),
  openBackupFolder: () => ipcRenderer.invoke("data:open-backups"),
  getFavorites: () => ipcRenderer.invoke("favorites:get"),
  setFavorites: (favorites) => ipcRenderer.invoke("favorites:set", favorites),
  getStudyData: () => ipcRenderer.invoke("study:get"),
  setStudyData: (studyData) => ipcRenderer.invoke("study:set", studyData),
  getCustomWallpaper: () => ipcRenderer.invoke("appearance:get-wallpaper"),
  getLocalWallpaperLibrary: () => ipcRenderer.invoke("appearance:get-local-library"),
  chooseCustomWallpaper: () => ipcRenderer.invoke("appearance:choose-wallpaper"),
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
