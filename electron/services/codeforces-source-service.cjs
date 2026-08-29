const crypto = require("node:crypto");
const fs = require("node:fs/promises");

const DEFAULT_CODEFORCES_SOURCE_CONFIG = {
  enabled: false,
};

const CREDENTIAL_FILE = "codeforces-api-credentials.bin";
const CONFIG_FILE = "codeforces-source-config.json";
const PAGE_SIZE = 1000;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

function text(value, maximum = 300) {
  return String(value || "").trim().slice(0, maximum);
}

function sanitizeConfig(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    enabled: source.enabled === true,
  };
}

function environmentCredentials() {
  const apiKey = text(
    process.env.CF_COMPASS_CODEFORCES_API_KEY || process.env.CODEFORCES_API_KEY,
  );
  const apiSecret = text(
    process.env.CF_COMPASS_CODEFORCES_API_SECRET || process.env.CODEFORCES_API_SECRET,
  );
  return apiKey && apiSecret ? { apiKey, apiSecret, source: "environment" } : null;
}

function canonicalQuery(parameters) {
  return Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

function createApiSignature(method, parameters, secret, rand) {
  const nonce = String(rand || crypto.randomInt(100000, 1000000));
  const payload = `${nonce}/${method}?${canonicalQuery(parameters)}#${secret}`;
  const digest = crypto.createHash("sha512").update(payload).digest("hex");
  return `${nonce}${digest}`;
}

function signedEndpoint(method, parameters, credentials, now = Math.floor(Date.now() / 1000)) {
  const signedParameters = {
    ...parameters,
    apiKey: credentials.apiKey,
    time: now,
  };
  const apiSig = createApiSignature(method, signedParameters, credentials.apiSecret);
  const query = canonicalQuery({ ...signedParameters, apiSig });
  return `${method}?${query}`;
}

function decodeBase64Source(value) {
  if (typeof value !== "string") return "";
  const encoded = value.replace(/\s+/g, "");
  if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    return "";
  }
  const estimatedBytes = Math.floor((encoded.length * 3) / 4);
  if (estimatedBytes > MAX_SOURCE_BYTES + 2) return "";
  try {
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.length > MAX_SOURCE_BYTES) return "";
    const canonical = decoded.toString("base64").replace(/=+$/, "");
    if (canonical !== encoded.replace(/=+$/, "")) return "";
    return decoded.toString("utf8");
  } catch {
    return "";
  }
}

function sourceText(submission) {
  const candidates = [submission?.source, submission?.sourceCode, submission?.program];
  const plainSource = candidates.find((value) => typeof value === "string" && value.length);
  return plainSource || decodeBase64Source(submission?.sourceBase64);
}

function normalizeSourceSubmission(submission, fallback) {
  const source = sourceText(submission);
  return {
    submissionId: Number(submission?.id || fallback?.id) || null,
    problemKey: fallback?.problemKey || "",
    verdict: text(submission?.verdict || fallback?.verdict, 40),
    programmingLanguage: text(submission?.programmingLanguage || fallback?.programmingLanguage, 100),
    relativeTimeSeconds: Number.isFinite(Number(submission?.relativeTimeSeconds))
      ? Number(submission.relativeTimeSeconds)
      : Number.isFinite(Number(fallback?.relativeTimeSeconds))
        ? Number(fallback.relativeTimeSeconds)
        : null,
    timeConsumedMillis: Number.isFinite(Number(submission?.timeConsumedMillis))
      ? Number(submission.timeConsumedMillis)
      : null,
    memoryConsumedBytes: Number.isFinite(Number(submission?.memoryConsumedBytes))
      ? Number(submission.memoryConsumedBytes)
      : null,
    source,
    sourceAvailable: Boolean(source),
  };
}

function createCodeforcesSourceService({ dataPath, safeStorage, fetchJson }) {
  async function readConfig() {
    try {
      return sanitizeConfig(JSON.parse(await fs.readFile(dataPath(CONFIG_FILE), "utf8")));
    } catch {
      return { ...DEFAULT_CODEFORCES_SOURCE_CONFIG };
    }
  }

  function encryptionAvailable() {
    try {
      return Boolean(safeStorage?.isEncryptionAvailable?.());
    } catch {
      return false;
    }
  }

  async function readStoredCredentials() {
    try {
      if (!encryptionAvailable()) return null;
      const encrypted = await fs.readFile(dataPath(CREDENTIAL_FILE));
      const value = JSON.parse(safeStorage.decryptString(encrypted));
      const apiKey = text(value?.apiKey);
      const apiSecret = text(value?.apiSecret);
      return apiKey && apiSecret ? { apiKey, apiSecret, source: "encrypted" } : null;
    } catch {
      return null;
    }
  }

  async function readCredentials() {
    return environmentCredentials() || readStoredCredentials();
  }

  async function getConfig() {
    const config = await readConfig();
    const credentials = await readCredentials();
    return {
      ...config,
      hasCredentials: Boolean(credentials),
      credentialSource: credentials?.source || null,
    };
  }

  async function setConfig(input = {}) {
    const current = await readConfig();
    const patch = input && typeof input === "object" ? input : {};
    const config = sanitizeConfig({ ...current, ...patch });
    const stored = await readStoredCredentials();

    if (patch.clearCredentials === true) {
      await fs.rm(dataPath(CREDENTIAL_FILE), { force: true });
    }

    const apiKey = text(patch.apiKey) || stored?.apiKey || "";
    const apiSecret = text(patch.apiSecret) || stored?.apiSecret || "";
    const suppliedCredential = Boolean(text(patch.apiKey) || text(patch.apiSecret));
    if (suppliedCredential) {
      if (!apiKey || !apiSecret) {
        throw new Error("Codeforces API Key 和 Secret 需要同时填写");
      }
      if (!encryptionAvailable()) {
        throw new Error(
          "系统加密存储不可用，请改用 CF_COMPASS_CODEFORCES_API_KEY 和 CF_COMPASS_CODEFORCES_API_SECRET 环境变量",
        );
      }
      await fs.writeFile(
        dataPath(CREDENTIAL_FILE),
        safeStorage.encryptString(JSON.stringify({ apiKey, apiSecret })),
      );
    }

    await fs.mkdir(dataPath("."), { recursive: true });
    await fs.writeFile(dataPath(CONFIG_FILE), JSON.stringify(config, null, 2), "utf8");
    return getConfig();
  }

  async function fetchSources({ handle, candidates, cachedSubmissions }) {
    const safeHandle = text(handle, 40);
    if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(safeHandle)) {
      throw new Error("请输入有效的 Codeforces Handle 后再获取源码");
    }
    const credentials = await readCredentials();
    if (!credentials) {
      throw new Error("请先在数据中心配置 Codeforces API Key 和 Secret");
    }
    const requested = Array.isArray(candidates)
      ? candidates.filter((item) => Number.isInteger(Number(item?.id)) && Number(item.id) > 0)
      : [];
    if (!requested.length) return [];

    const cached = Array.isArray(cachedSubmissions) ? cachedSubmissions : [];
    const positions = new Map(cached.map((submission, index) => [Number(submission?.id), index]));
    const pageStarts = new Set();
    for (const candidate of requested) {
      const position = positions.get(Number(candidate.id));
      if (position === undefined) continue;
      pageStarts.add(Math.floor(position / PAGE_SIZE) * PAGE_SIZE + 1);
    }
    if (!pageStarts.size) {
      throw new Error("本地提交缓存中找不到待分析的提交，请先完成一次同步");
    }

    const byId = new Map();
    for (const from of [...pageStarts].sort((first, second) => first - second)) {
      const endpoint = signedEndpoint(
        "user.status",
        { handle: safeHandle, from, count: PAGE_SIZE, includeSources: true },
        credentials,
      );
      const page = await fetchJson(endpoint);
      for (const submission of Array.isArray(page) ? page : []) {
        byId.set(Number(submission?.id), submission);
      }
    }

    return requested.map((candidate) =>
      normalizeSourceSubmission(byId.get(Number(candidate.id)), candidate),
    );
  }

  return { getConfig, setConfig, fetchSources };
}

module.exports = {
  DEFAULT_CODEFORCES_SOURCE_CONFIG,
  canonicalQuery,
  createApiSignature,
  decodeBase64Source,
  signedEndpoint,
  createCodeforcesSourceService,
};
