import { getCurrentLocale } from "../i18n";

export const DEFAULT_AI_CONFIG = {
  enabled: false,
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  hasApiKey: false,
  keySource: null,
};

function safeText(value, maximum = 2400) {
  return String(value || "").trim().slice(0, maximum);
}

function normalizeEvidenceList(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => {
    const source = item && typeof item === "object" ? item : {};
    return {
      title: safeText(source.title || source.name, 160),
      evidence: safeText(source.evidence || source.detail || source.reason, 500),
    };
  }).filter((item) => item.title || item.evidence);
}

function normalizeSourceTimeline(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 300).map((item, index) => {
    const source = item && typeof item === "object" ? item : {};
    return {
      index: Number.isFinite(Number(source.index)) ? Math.max(1, Math.round(Number(source.index))) : index + 1,
      submissionId: Number.isFinite(Number(source.submissionId)) ? Number(source.submissionId) : null,
      problemKey: safeText(source.problemKey, 80),
      problemIndex: safeText(source.problemIndex, 20),
      problemName: safeText(source.problemName, 180),
      verdict: safeText(source.verdict, 40) || "UNKNOWN",
      relativeTimeSeconds: Number.isFinite(Number(source.relativeTimeSeconds)) ? Number(source.relativeTimeSeconds) : null,
      creationTimeSeconds: Number.isFinite(Number(source.creationTimeSeconds)) ? Number(source.creationTimeSeconds) : null,
      programmingLanguage: safeText(source.programmingLanguage, 100),
      timeConsumedMillis: Number.isFinite(Number(source.timeConsumedMillis)) ? Number(source.timeConsumedMillis) : null,
      memoryConsumedBytes: Number.isFinite(Number(source.memoryConsumedBytes)) ? Number(source.memoryConsumedBytes) : null,
      sourceAvailable: source.sourceAvailable === true,
    };
  });
}

function normalizeSourceDiffs(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 300).map((item, index) => {
    const source = item && typeof item === "object" ? item : {};
    return {
      id: safeText(source.id, 160) || `diff-${index + 1}`,
      problemKey: safeText(source.problemKey, 80),
      versionIndex: Number.isFinite(Number(source.versionIndex)) ? Math.max(1, Math.round(Number(source.versionIndex))) : index + 1,
      kind: source.kind === "revision" ? "revision" : "initial",
      fromSubmissionId: Number.isFinite(Number(source.fromSubmissionId)) ? Number(source.fromSubmissionId) : null,
      toSubmissionId: Number.isFinite(Number(source.toSubmissionId)) ? Number(source.toSubmissionId) : null,
      fromVerdict: safeText(source.fromVerdict, 40),
      toVerdict: safeText(source.toVerdict, 40) || "UNKNOWN",
      fromRelativeTimeSeconds: Number.isFinite(Number(source.fromRelativeTimeSeconds)) ? Number(source.fromRelativeTimeSeconds) : null,
      toRelativeTimeSeconds: Number.isFinite(Number(source.toRelativeTimeSeconds)) ? Number(source.toRelativeTimeSeconds) : null,
      programmingLanguage: safeText(source.programmingLanguage, 100),
      addedLines: Math.max(0, Math.round(Number(source.addedLines) || 0)),
      removedLines: Math.max(0, Math.round(Number(source.removedLines) || 0)),
      changedLines: Math.max(0, Math.round(Number(source.changedLines) || 0)),
      patch: safeText(source.patch, 12000),
      coarse: source.coarse === true,
      sourceTruncated: source.sourceTruncated === true,
      patchTruncated: source.patchTruncated === true,
    };
  });
}

export function normalizeAiReview(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    summary: safeText(source.summary || source.overview, 1200),
    strengths: normalizeEvidenceList(source.strengths),
    weaknesses: normalizeEvidenceList(source.weaknesses),
    timeManagement: Array.isArray(source.timeManagement)
      ? source.timeManagement.slice(0, 8).map((item) => safeText(item, 500)).filter(Boolean)
      : [],
    problemInsights: Array.isArray(source.problemInsights)
      ? source.problemInsights.slice(0, 12).map((item) => {
          const insight = item && typeof item === "object" ? item : {};
          return {
            problemKey: safeText(insight.problemKey || insight.key, 80),
            title: safeText(insight.title || insight.name, 160),
            observation: safeText(insight.observation || insight.evidence || insight.detail, 500),
            recommendation: safeText(
              insight.recommendation || insight.action || insight.nextStep,
              500,
            ),
          };
        }).filter((item) => item.problemKey || item.title || item.observation || item.recommendation)
      : [],
    actions: Array.isArray(source.actions || source.nextActions)
      ? (source.actions || source.nextActions).slice(0, 8).map((item) => {
          const action = item && typeof item === "object" ? item : {};
          return {
            title: safeText(action.title || action.name, 160),
            reason: safeText(action.reason || action.evidence || action.detail, 500),
            priority: ["high", "medium", "low"].includes(action.priority)
              ? action.priority
              : "medium",
            problemKeys: Array.isArray(action.problemKeys)
              ? [...new Set(action.problemKeys.map(String))].slice(0, 8)
              : [],
          };
        }).filter((item) => item.title || item.reason)
      : [],
    analysisMode: source.analysisMode === "source" ? "source" : "summary",
    sourceIncluded: source.sourceIncluded === true,
    sourceSubmissionCount: Number.isFinite(Number(source.sourceSubmissionCount))
      ? Math.max(0, Math.round(Number(source.sourceSubmissionCount)))
      : 0,
    sourceTimeline: normalizeSourceTimeline(source.sourceTimeline),
    sourceDiffs: normalizeSourceDiffs(source.sourceDiffs),
    sourceTimelineCount: Number.isFinite(Number(source.sourceTimelineCount))
      ? Math.max(0, Math.round(Number(source.sourceTimelineCount)))
      : 0,
    sourceDiffCount: Number.isFinite(Number(source.sourceDiffCount))
      ? Math.max(0, Math.round(Number(source.sourceDiffCount)))
      : 0,
  };
}

function browserConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem("cf-compass-ai-config-v1") || "null");
    return { ...DEFAULT_AI_CONFIG, ...(saved && typeof saved === "object" ? saved : {}) };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

export async function loadAiConfig() {
  if (window.cfBridge?.getAiConfig) return window.cfBridge.getAiConfig();
  return browserConfig();
}

export async function saveAiConfig(config) {
  if (window.cfBridge?.setAiConfig) return window.cfBridge.setAiConfig(config);
  const safe = {
    enabled: config?.enabled === true,
    provider: "deepseek",
    baseUrl: safeText(config?.baseUrl, 300) || DEFAULT_AI_CONFIG.baseUrl,
    model: safeText(config?.model, 100) || DEFAULT_AI_CONFIG.model,
    hasApiKey: false,
    keySource: null,
  };
  localStorage.setItem("cf-compass-ai-config-v1", JSON.stringify(safe));
  return safe;
}

export async function analyzeContestWithAi(contestId, options = {}) {
  if (!window.cfBridge?.analyzeContestWithAi) {
    throw new Error("AI 复盘需要桌面版 Electron 运行环境");
  }
  return window.cfBridge.analyzeContestWithAi(contestId, {
    includeSource: options?.includeSource === true,
    language: getCurrentLocale() === "en-US" ? "en-US" : "zh-CN",
  });
}
