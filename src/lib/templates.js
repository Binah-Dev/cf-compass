const EMPTY_LIBRARY = {
  root: "",
  exists: false,
  scannedAt: null,
  categories: [{ id: "unclassified", label: "待整理", tone: "muted" }],
  items: [],
  summary: { total: 0, classified: 0, manual: 0, summarized: 0, languages: 0 },
};

export async function loadTemplateLibrary() {
  if (!window.cfBridge?.getTemplateLibrary) return EMPTY_LIBRARY;
  return window.cfBridge.getTemplateLibrary();
}

export async function refreshTemplateLibrary() {
  if (!window.cfBridge?.refreshTemplateLibrary) return EMPTY_LIBRARY;
  return window.cfBridge.refreshTemplateLibrary();
}

export async function chooseTemplateLibraryFolder() {
  if (!window.cfBridge?.chooseTemplateLibraryFolder) return { canceled: true };
  return window.cfBridge.chooseTemplateLibraryFolder();
}

export async function changeTemplateCategory(relativePath, categoryId) {
  if (!window.cfBridge?.setTemplateCategory) return EMPTY_LIBRARY;
  return window.cfBridge.setTemplateCategory(relativePath, categoryId);
}

export async function saveTemplateSummary(relativePath, summary) {
  if (!window.cfBridge?.setTemplateSummary) return EMPTY_LIBRARY;
  return window.cfBridge.setTemplateSummary(relativePath, summary);
}

export async function openTemplateFile(filePath) {
  if (!window.cfBridge?.openTemplateFile) {
    throw new Error("请在桌面版 CF Compass 中打开模板");
  }
  return window.cfBridge.openTemplateFile(filePath);
}

export function formatTemplateSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
