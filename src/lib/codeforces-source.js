export const DEFAULT_CODEFORCES_SOURCE_CONFIG = {
  enabled: false,
  hasCredentials: false,
  credentialSource: null,
};

export async function loadCodeforcesSourceConfig() {
  if (window.cfBridge?.getCodeforcesSourceConfig) {
    return window.cfBridge.getCodeforcesSourceConfig();
  }
  try {
    const saved = JSON.parse(localStorage.getItem("cf-compass-codeforces-source-v1") || "null");
    return {
      ...DEFAULT_CODEFORCES_SOURCE_CONFIG,
      ...(saved && typeof saved === "object" ? saved : {}),
    };
  } catch {
    return { ...DEFAULT_CODEFORCES_SOURCE_CONFIG };
  }
}

export async function saveCodeforcesSourceConfig(config) {
  if (window.cfBridge?.setCodeforcesSourceConfig) {
    return window.cfBridge.setCodeforcesSourceConfig(config);
  }
  const safe = {
    ...DEFAULT_CODEFORCES_SOURCE_CONFIG,
    enabled: config?.enabled === true,
    hasCredentials: false,
    credentialSource: null,
  };
  localStorage.setItem("cf-compass-codeforces-source-v1", JSON.stringify(safe));
  return safe;
}
