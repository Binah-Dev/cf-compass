const { estimateVirtualReference } = require("./services/virtual-reference.cjs");
const { writeAtomicJson } = require("./services/atomic-json.cjs");
const { replayKey, findReplayEntry, summarizeProblem, enrichSession, mergeSessions } = require("./services/contest-session.cjs");
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  nativeImage,
  nativeTheme,
  protocol,
  safeStorage,
  session,
  shell,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createWallpaperService } = require("./services/wallpaper-service.cjs");
const {
  createMaterialLibraryService,
  safeMaterialRelativePath,
} = require("./services/material-library-service.cjs");
const { createStudyPlanService, sanitizeStudyPlan } = require("./services/study-plan-service.cjs");
const { createAiService, normalizeAiReview } = require("./services/ai-service.cjs");
const { buildDemoAiData } = require("./services/ai-demo-data.cjs");
const { createCodeforcesSourceService } = require("./services/codeforces-source-service.cjs");

nativeTheme.themeSource = "dark";
app.setAppUserModelId("com.cfcompass.desktop");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "cf-material",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

if (process.env.CF_COMPASS_USER_DATA) {
  app.setPath("userData", path.resolve(process.env.CF_COMPASS_USER_DATA));
}

const API_MIN_INTERVAL_MS = 2100;
const SUBMISSION_PAGE_SIZE = 1000;
const MAX_SUBMISSIONS = 100000;
const RATING_STANDING_CACHE_MS = 6 * 60 * 60 * 1000;
const CONTEST_REPLAY_VERSION = 4;
const CONTEST_AUTO_RETRY_LIMIT = 2;
const CONTEST_CENTER_VERSION = 1;
const CONTEST_CENTER_CACHE_MS = 30 * 60 * 1000;
const CONTEST_DETAIL_CACHE_MS = 14 * 24 * 60 * 60 * 1000;
const DEFAULT_SETTINGS = {
  language: "zh-CN",
  themeVersion: 7,
  showProblemTags: true,
  interfaceDensity: "comfortable",
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
  wallpaperFit: "smart",
  wallpaperVideoPlaybackRate: 100,
  pauseWallpaperWhenUnfocused: true,
  panelOpacity: 72,
  wallpaperFavorites: [],
  wallpaperLocked: true,
  randomWallpaperOnPageChange: false,
  wallpaperAutoRotateMinutes: 0,
  usePageWallpapers: false,
  pageWallpapers: {},
  accentTheme: "sky",
  reduceMotion: false,
};
const DEFAULT_STUDY_DATA = {
  version: 1,
  notes: {},
  reviews: {},
  aiReviews: {},
  contestQueue: [],
  plan: null,
  settings: DEFAULT_SETTINGS,
};

function getSystemDefaultLanguage() {
  try {
    return /^zh(?:-|$)/i.test(app.getLocale()) ? "zh-CN" : "en-US";
  } catch {
    return "zh-CN";
  }
}

function createFirstLaunchStudyData() {
  return {
    ...DEFAULT_STUDY_DATA,
    settings: {
      ...DEFAULT_SETTINGS,
      language: getSystemDefaultLanguage(),
    },
  };
}

let mainWindow;
let studyPlanWindow;
let apiQueue = Promise.resolve();
let lastApiCallAt = 0;
let carrotModulePromise;
const contestCalculationTasks = new Map();
let contestAutoCalculationPromise = null;
let automaticBackupTimer = null;
let templateLibraryCache = null;
let studyPlanService = null;

const TEMPLATE_SOURCE_EXTENSIONS = new Set([
  ".cpp",
  ".cc",
  ".cxx",
  ".c",
  ".h",
  ".hpp",
  ".py",
  ".java",
  ".rs",
  ".go",
  ".js",
  ".ts",
]);
const TEMPLATE_CATEGORIES = [
  { id: "dynamic-programming", label: "动态规划", tone: "violet" },
  { id: "graph", label: "图论", tone: "blue" },
  { id: "sorting", label: "分治与排序", tone: "orange" },
  { id: "tree", label: "树与树形算法", tone: "cyan" },
  { id: "data-structures", label: "数据结构", tone: "indigo" },
  { id: "number-theory", label: "数论", tone: "amber" },
  { id: "strings", label: "字符串", tone: "rose" },
  { id: "search", label: "搜索与回溯", tone: "sky" },
  { id: "greedy", label: "贪心", tone: "green" },
  { id: "basic", label: "基础算法", tone: "slate" },
  { id: "geometry", label: "计算几何", tone: "pink" },
  { id: "combinatorics", label: "组合数学", tone: "yellow" },
  { id: "network-flow", label: "网络流与匹配", tone: "blue" },
  { id: "polynomial", label: "多项式与 FFT", tone: "violet" },
  { id: "linear-algebra", label: "线性代数", tone: "cyan" },
  { id: "probability", label: "概率与期望", tone: "green" },
  { id: "game-theory", label: "博弈论", tone: "rose" },
  { id: "bitwise", label: "位运算", tone: "indigo" },
  { id: "constructive", label: "构造算法", tone: "amber" },
  { id: "randomized", label: "随机化算法", tone: "pink" },
  { id: "offline", label: "离线算法", tone: "orange" },
  { id: "misc", label: "专题与其他", tone: "slate" },
  { id: "unclassified", label: "待整理", tone: "muted" },
];
const TEMPLATE_CATEGORY_IDS = new Set(TEMPLATE_CATEGORIES.map((item) => item.id));
const TEMPLATE_RULES = [
  {
    id: "network-flow",
    filename: [/网络流/, /最大流/, /最小割/, /费用流/, /二分图匹配/, /匈牙利/, /dinic/i, /hopcroft/i],
    content: [/\bdinic\b/i, /min.?cost.?max.?flow/i, /hopcroft.?karp/i, /hungarian/i],
  },
  {
    id: "polynomial",
    filename: [/多项式/, /fft/i, /ntt/i, /卷积/, /生成函数/],
    content: [/\b(?:fft|ntt)\s*\(/i, /primitive\s*root/i, /polynomial/i],
  },
  {
    id: "linear-algebra",
    filename: [/线性代数/, /高斯消元/, /矩阵快速幂/, /行列式/, /线性基/],
    content: [/gauss(?:ian)?\s*(?:elimination)?/i, /determinant/i, /linear\s*basis/i],
  },
  {
    id: "probability",
    filename: [/概率/, /期望/, /随机变量/, /马尔可夫/],
    content: [/expected\s*value/i, /markov/i, /概率dp/i],
  },
  {
    id: "game-theory",
    filename: [/博弈/, /nim/i, /sg函数/i, /sprague/i],
    content: [/sprague.?grundy/i, /\bsg\s*\[/i, /\bnim\b/i],
  },
  {
    id: "bitwise",
    filename: [/位运算/, /异或/, /xor/i, /子集枚举/, /按位/],
    content: [/\b__builtin_popcount/i, /\bxor\b/i, /bitmask/i],
  },
  {
    id: "offline",
    filename: [/离线/, /莫队/, /cdq/i, /整体二分/, /平行二分/],
    content: [/\bmo'?s\s*algorithm/i, /\bcdq\b/i, /offline\s*query/i],
  },
  {
    id: "randomized",
    filename: [/随机化/, /模拟退火/, /随机增量/, /哈希防卡/, /蒙特卡洛/],
    content: [/simulated\s*annealing/i, /monte\s*carlo/i, /\bmt19937\b/i],
  },
  {
    id: "constructive",
    filename: [/构造/, /构造算法/, /constructive/i],
    content: [/\bconstructive\b/i, /构造方案/],
  },
  {
    id: "tree",
    filenameWeight: 10,
    filename: [/树/, /\btree\b/i, /lca/i, /重心/, /直径/, /子树/, /树链/],
    content: [/\blca\b/i, /\bsubtree\b/i, /\bcentroid\b/i, /tree\s*diameter/i],
  },
  {
    id: "dynamic-programming",
    filename: [/动态规划/, /(^|[^a-z])dp([^a-z]|$)/i, /背包/, /状态压缩/, /digit\s*dp/i],
    content: [/\bdp\s*\[/i, /memo(?:ization)?/i, /记忆化/],
  },
  {
    id: "graph",
    filename: [/图论/, /dijkstra/i, /最短路/, /spfa/i, /floyd/i, /拓扑/, /网络流/, /最小生成树/, /并查集/],
    content: [/\bdijkstra\b/i, /priority_queue[\s\S]{0,600}\bdist\b/i, /\btopological\b/i, /\bdisjoint\s*set\b/i],
  },
  {
    id: "data-structures",
    filename: [/线段树/, /树状数组/, /fenwick/i, /segment\s*tree/i, /单调栈/, /单调队列/, /稀疏表/, /st表/i, /trie/i],
    content: [/\bfenwick\b/i, /\bsegment\s*tree\b/i, /lowbit\s*\(/i, /\btrie\b/i],
  },
  {
    id: "number-theory",
    filename: [/数论/, /质数/, /素数/, /约数/, /因数/, /欧拉/, /筛/, /gcd/i, /同余/, /快速幂/, /逆元/],
    content: [/\bis_?prime\b/i, /\bsieve\b/i, /\bgcd\s*\(/i, /prime\s*factor/i, /欧拉函数/],
  },
  {
    id: "strings",
    filename: [/字符串/, /kmp/i, /字典树/, /后缀/, /回文/, /manacher/i, /z函数/i, /字符串哈希/],
    content: [/\bkmp\b/i, /prefix_function/i, /\bmanacher\b/i, /suffix\s*array/i],
  },
  {
    id: "sorting",
    filename: [/排序/, /逆序对/, /归并/, /快排/, /分治/, /merge\s*sort/i],
    content: [/merge[_\s-]*sort/i, /inversion\s*count/i, /归并排序/],
  },
  {
    id: "greedy",
    filename: [/贪心/, /区间调度/, /greedy/i, /活动安排/],
    content: [/\bgreedy\b/i, /区间调度/],
  },
  {
    id: "geometry",
    filename: [/几何/, /凸包/, /叉积/, /向量/, /半平面/],
    content: [/\bcross\s*\(/i, /convex\s*hull/i, /struct\s+point/i],
  },
  {
    id: "combinatorics",
    filename: [/组合/, /排列/, /卡特兰/, /容斥/, /斯特林/],
    content: [/catalan/i, /inclusion.?exclusion/i, /组合数/],
  },
  {
    id: "search",
    filename: [/搜索/, /dfs/i, /bfs/i, /二分/, /回溯/, /递归/, /汉诺塔/],
    content: [/\b(?:dfs|bfs)\s*\(/i, /binary[_\s-]*search/i, /\bbacktrack/i],
  },
  {
    id: "basic",
    filename: [/基础算法/, /前缀和/, /差分/, /双指针/, /滑动窗口/, /枚举/, /模拟/, /离散化/],
    content: [/prefix\s*sum/i, /two\s*pointers/i, /sliding\s*window/i, /coordinate\s*compress/i],
  },
];

function dataPath(filename) {
  return path.join(app.getPath("userData"), filename);
}

function backupDirectory() {
  return dataPath("backups");
}

function localMaterialDirectory() {
  return dataPath("material-library");
}

function localMaterialUrl(relativePath) {
  return `cf-material://library/${safeMaterialRelativePath(relativePath)}`;
}

function localMaterialPreviewUrl(relativePath) {
  return `cf-material://preview/${safeMaterialRelativePath(relativePath)}`;
}

async function readJson(filename, fallback) {
  try {
    const text = await fs.readFile(dataPath(filename), "utf8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function readJsonPath(target, fallback) {
  try {
    const text = await fs.readFile(target, "utf8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeJsonPath(target, value, { pretty = true } = {}) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(value, null, pretty ? 2 : 0), "utf8");
}

async function writeJson(filename, value, options) {
  if (["study.json", "contest-replay.json"].includes(filename)) return writeAtomicJson(dataPath(filename), value, options);
  await writeJsonPath(dataPath(filename), value, options);
}

function getStudyPlanService() {
  if (!studyPlanService) {
    studyPlanService = createStudyPlanService({
      readJson,
      writeJson,
      onChanged: () => {
        scheduleAutomaticBackup("plan-update");
        void broadcastStudyPlan();
      },
    });
  }
  return studyPlanService;
}

async function broadcastStudyPlan() {
  const queue = await getStudyPlanService().getQueue();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("plan:changed", queue);
  }
}

const wallpaperService = createWallpaperService({
  dialog,
  nativeImage,
  resolveDataPath: dataPath,
  getWindow: () => mainWindow,
  getUiLanguage: readUiLanguage,
  readJsonPath,
  writeJsonPath,
});
const materialLibraryService = createMaterialLibraryService({
  resolveDirectory: localMaterialDirectory,
  toUrl: localMaterialUrl,
  toPreviewUrl: localMaterialPreviewUrl,
  nativeImage,
});

function templateConfigPath() {
  return dataPath("template-library.json");
}

function templateConfigBackupPath() {
  return dataPath("template-library.json.bak");
}

function templateRootKey(root) {
  const normalized = path.resolve(root).replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function defaultTemplateRoot() {
  return path.join(app.getPath("desktop"), "OJ", "Template Library");
}

async function readTemplateConfig() {
  let saved = await readJsonPath(templateConfigPath(), null);
  if (!saved || typeof saved !== "object") {
    saved = await readJsonPath(templateConfigBackupPath(), {});
  }
  const root = typeof saved?.root === "string" && saved.root.trim()
    ? path.resolve(saved.root)
    : defaultTemplateRoot();
  const profiles = saved?.profiles && typeof saved.profiles === "object"
    ? { ...saved.profiles }
    : {};
  const profile = profiles[templateRootKey(root)];
  return {
    root,
    overrides:
      profile?.overrides && typeof profile.overrides === "object"
        ? { ...profile.overrides }
        : saved?.overrides && typeof saved.overrides === "object"
          ? { ...saved.overrides }
        : {},
    summaries:
      profile?.summaries && typeof profile.summaries === "object"
        ? { ...profile.summaries }
        : saved?.summaries && typeof saved.summaries === "object"
          ? { ...saved.summaries }
        : {},
    profiles,
  };
}

async function saveTemplateConfig(config) {
  const root = path.resolve(config.root);
  const overrides = Object.fromEntries(
    Object.entries(config.overrides || {})
      .filter(([, category]) => TEMPLATE_CATEGORY_IDS.has(category))
      .slice(0, 5000),
  );
  const summaries = Object.fromEntries(
    Object.entries(config.summaries || {})
      .filter(([, summary]) => typeof summary === "string" && summary.trim())
      .map(([relativePath, summary]) => [
        normalizeRelativePath(relativePath),
        summary.replace(/\r\n/g, "\n").trim().slice(0, 1200),
      ])
      .slice(0, 5000),
  );
  const profiles = { ...(config.profiles || {}) };
  profiles[templateRootKey(root)] = { root, overrides, summaries };
  const safe = {
    root,
    overrides,
    summaries,
    profiles: Object.fromEntries(Object.entries(profiles).slice(-20)),
    updatedAt: new Date().toISOString(),
  };
  const target = templateConfigPath();
  const temporary = `${target}.tmp`;
  await writeJsonPath(temporary, safe);
  await fs.rename(temporary, target).catch(async () => {
    await fs.copyFile(temporary, target);
    await fs.unlink(temporary).catch(() => undefined);
  });
  await fs.copyFile(target, templateConfigBackupPath());
  return safe;
}

function normalizeRelativePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function isPathWithin(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function readFilePrefix(filePath, size, maximum = 192 * 1024) {
  const handle = await fs.open(filePath, "r");
  try {
    const length = Math.min(Math.max(0, Number(size) || 0), maximum);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function classifyTemplate(filename, content, manualCategory) {
  if (TEMPLATE_CATEGORY_IDS.has(manualCategory)) {
    return {
      categoryId: manualCategory,
      source: "manual",
      confidence: 100,
      signals: ["手动分类"],
    };
  }

  const scores = new Map();
  const signals = new Map();
  for (const rule of TEMPLATE_RULES) {
    let score = 0;
    const matchedSignals = [];
    for (const matcher of rule.filename) {
      if (matcher.test(filename)) {
        score += rule.filenameWeight || 7;
        matchedSignals.push("文件名");
      }
    }
    for (const matcher of rule.content) {
      if (matcher.test(content)) {
        score += 3;
        matchedSignals.push("源码特征");
      }
    }
    if (score > 0) {
      scores.set(rule.id, score);
      signals.set(rule.id, [...new Set(matchedSignals)]);
    }
  }

  const ranking = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [bestId, bestScore] = ranking[0] || [];
  if (!bestId || bestScore < 4) {
    return {
      categoryId: "unclassified",
      source: "unknown",
      confidence: 0,
      signals: ["等待手动整理"],
    };
  }
  const runnerUp = ranking[1]?.[1] || 0;
  const confidence = Math.max(
    54,
    Math.min(98, 58 + bestScore * 3 + Math.max(0, bestScore - runnerUp) * 2),
  );
  return {
    categoryId: bestId,
    source: signals.get(bestId)?.includes("文件名") ? "filename" : "content",
    confidence,
    signals: signals.get(bestId) || ["源码特征"],
  };
}

function templateLanguage(extension) {
  const languages = {
    ".cpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    ".c": "C",
    ".h": "C/C++ Header",
    ".hpp": "C++ Header",
    ".py": "Python",
    ".java": "Java",
    ".rs": "Rust",
    ".go": "Go",
    ".js": "JavaScript",
    ".ts": "TypeScript",
  };
  return languages[extension] || extension.slice(1).toUpperCase();
}

async function collectTemplateFiles(root, limit = 2000) {
  const results = [];
  async function walk(directory) {
    if (results.length >= limit) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= limit) return;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(target);
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (entry.isFile() && TEMPLATE_SOURCE_EXTENSIONS.has(extension)) {
        results.push(target);
      }
    }
  }
  await walk(root);
  return results;
}

async function scanTemplateLibrary(force = false) {
  const config = await readTemplateConfig();
  if (!force && templateLibraryCache?.root === config.root) return templateLibraryCache;

  let rootStats;
  try {
    rootStats = await fs.stat(config.root);
  } catch {
    return {
      root: config.root,
      exists: false,
      scannedAt: new Date().toISOString(),
      categories: TEMPLATE_CATEGORIES,
      items: [],
      summary: { total: 0, classified: 0, manual: 0, summarized: 0, languages: 0 },
    };
  }
  if (!rootStats.isDirectory()) throw new Error("模板库路径不是文件夹");

  const filePaths = await collectTemplateFiles(config.root);
  const items = await Promise.all(
    filePaths.map(async (filePath) => {
      const stats = await fs.stat(filePath);
      const relativePath = normalizeRelativePath(path.relative(config.root, filePath));
      const extension = path.extname(filePath).toLowerCase();
      const filename = path.basename(filePath);
      const content = await readFilePrefix(filePath, stats.size).catch(() => "");
      const classification = classifyTemplate(
        path.basename(filename, extension),
        content,
        config.overrides[relativePath],
      );
      return {
        id: Buffer.from(relativePath).toString("base64url"),
        filename,
        title: path.basename(filename, extension),
        relativePath,
        filePath,
        extension,
        language: templateLanguage(extension),
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        summary: String(config.summaries[relativePath] || "").slice(0, 1200),
        ...classification,
      };
    }),
  );
  items.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
  const library = {
    root: config.root,
    exists: true,
    scannedAt: new Date().toISOString(),
    categories: TEMPLATE_CATEGORIES,
    items,
    summary: {
      total: items.length,
      classified: items.filter((item) => item.categoryId !== "unclassified").length,
      manual: items.filter((item) => item.source === "manual").length,
      summarized: items.filter((item) => item.summary).length,
      languages: new Set(items.map((item) => item.language)).size,
    },
  };
  templateLibraryCache = library;
  return library;
}

async function chooseTemplateRoot() {
  const config = await readTemplateConfig();
  const english = (await readUiLanguage()) === "en-US";
  const result = await dialog.showOpenDialog(mainWindow, {
    title: english ? "Choose Algorithm Template Folder" : "选择算法模板库文件夹",
    defaultPath: config.root,
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const nextRoot = path.resolve(result.filePaths[0]);
  const savedProfile = config.profiles?.[templateRootKey(nextRoot)];
  const sameRoot = templateRootKey(nextRoot) === templateRootKey(config.root);
  await saveTemplateConfig({
    root: nextRoot,
    overrides: sameRoot ? config.overrides : savedProfile?.overrides || {},
    summaries: sameRoot ? config.summaries : savedProfile?.summaries || {},
    profiles: config.profiles,
  });
  templateLibraryCache = null;
  return { canceled: false, library: await scanTemplateLibrary(true) };
}

async function setTemplateCategory(relativePathValue, categoryId) {
  if (!TEMPLATE_CATEGORY_IDS.has(categoryId)) throw new Error("无效的模板分类");
  const config = await readTemplateConfig();
  const relativePath = normalizeRelativePath(relativePathValue);
  const target = path.resolve(config.root, relativePath);
  if (!isPathWithin(config.root, target)) throw new Error("模板路径不安全");
  config.overrides[relativePath] = categoryId;
  await saveTemplateConfig(config);
  templateLibraryCache = null;
  return scanTemplateLibrary(true);
}

async function setTemplateSummary(relativePathValue, summaryValue) {
  const config = await readTemplateConfig();
  const relativePath = normalizeRelativePath(relativePathValue);
  const target = path.resolve(config.root, relativePath);
  if (!isPathWithin(config.root, target)) throw new Error("模板路径不安全");
  const extension = path.extname(target).toLowerCase();
  if (!TEMPLATE_SOURCE_EXTENSIONS.has(extension)) throw new Error("不支持该模板文件");
  const stats = await fs.stat(target);
  if (!stats.isFile()) throw new Error("模板文件不存在");

  const summary = String(summaryValue || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, 1200);
  if (summary) config.summaries[relativePath] = summary;
  else delete config.summaries[relativePath];
  await saveTemplateConfig(config);

  if (templateLibraryCache?.root === config.root) {
    const items = templateLibraryCache.items.map((item) =>
      item.relativePath === relativePath ? { ...item, summary } : item,
    );
    templateLibraryCache = {
      ...templateLibraryCache,
      items,
      summary: {
        ...templateLibraryCache.summary,
        summarized: items.filter((item) => item.summary).length,
      },
    };
    return templateLibraryCache;
  }
  return scanTemplateLibrary(true);
}

async function openTemplateFile(filePathValue) {
  const config = await readTemplateConfig();
  const target = path.resolve(String(filePathValue || ""));
  if (!isPathWithin(config.root, target)) throw new Error("模板路径不安全");
  const extension = path.extname(target).toLowerCase();
  if (!TEMPLATE_SOURCE_EXTENSIONS.has(extension)) throw new Error("不支持打开该文件");
  const stats = await fs.stat(target);
  if (!stats.isFile()) throw new Error("模板文件不存在");
  const normalized = target.replace(/\\/g, "/");
  try {
    await shell.openExternal(`vscode://file/${encodeURI(normalized)}`);
    return { opened: true, method: "vscode" };
  } catch {
    const fallbackError = await shell.openPath(target);
    if (fallbackError) throw new Error(fallbackError);
    return { opened: true, method: "system" };
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchCodeforcesNow(endpoint) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://codeforces.com/api/${endpoint}`, {
        headers: {
          "User-Agent": "CF-Compass/2.0",
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const responseText = await response.text();
        let failureBody = null;
        try {
          failureBody = responseText ? JSON.parse(responseText) : null;
        } catch {
          failureBody = null;
        }
        throw new Error(
          failureBody?.comment
            ? `Codeforces：${failureBody.comment}`
            : `Codeforces 请求失败（HTTP ${response.status}）`,
        );
      }
      const body = await response.json();
      if (body.status !== "OK") {
        throw new Error(body.comment || "Codeforces API 返回异常");
      }
      return body.result;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await wait(900 * (attempt + 1));
    }
  }
  throw lastError;
}

function fetchCodeforces(endpoint) {
  const task = apiQueue.then(async () => {
    const delay = Math.max(0, API_MIN_INTERVAL_MS - (Date.now() - lastApiCallAt));
    if (delay) await wait(delay);
    try {
      return await fetchCodeforcesNow(endpoint);
    } finally {
      lastApiCallAt = Date.now();
    }
  });
  apiQueue = task.catch(() => undefined);
  return task;
}

function buildRatingStanding(ratedUsers, rating) {
  const currentRating = Number(rating);
  if (!Number.isFinite(currentRating) || !Array.isArray(ratedUsers) || !ratedUsers.length) {
    return null;
  }
  const total = ratedUsers.length;
  const position =
    ratedUsers.reduce(
      (count, user) => count + (Number(user?.rating) > currentRating ? 1 : 0),
      0,
    ) + 1;
  return {
    position,
    total,
    topPercent: Number(((position / total) * 100).toFixed(2)),
    scope: "近 30 天参加过 Rated 比赛的活跃用户",
    source: "Codeforces user.ratedList",
    syncedAt: new Date().toISOString(),
  };
}

function contestReplayPath() {
  return dataPath("contest-replay.json");
}

function classifyContestName(name) {
  const contestName = String(name || "");
  const normalized = contestName.toLowerCase();
  if (normalized.includes("educational")) {
    return { primary: "special", divisions: [], special: "educational", label: "Educational" };
  }
  if (normalized.includes("global round")) {
    return { primary: "special", divisions: [], special: "global", label: "Global" };
  }
  if (normalized.includes("kotlin")) {
    return { primary: "special", divisions: [], special: "kotlin", label: "Kotlin" };
  }
  if (
    normalized.includes("icpc") ||
    normalized.includes("regional") ||
    normalized.includes("neerc") ||
    normalized.includes("nwerc") ||
    normalized.includes("swerc") ||
    normalized.includes("championship")
  ) {
    return { primary: "special", divisions: [], special: "icpc", label: "ICPC / 区域赛" };
  }

  const divisions = [];
  for (let division = 1; division <= 4; division += 1) {
    const pattern = new RegExp(`div(?:ision)?\\.?\\s*${division}(?:\\D|$)`, "i");
    if (pattern.test(contestName)) divisions.push(division);
  }
  if (divisions.length) {
    return {
      primary: `div${divisions[0]}`,
      divisions,
      special: null,
      label: divisions.map((division) => `Div.${division}`).join(" + "),
    };
  }
  return { primary: "special", divisions: [], special: "other", label: "其他 Rated" };
}

function contestPhaseGroup(contest) {
  if (contest?.phase === "BEFORE") return "upcoming";
  if (contest?.phase === "CODING") return "running";
  return "finished";
}

function normalizeContestCenterEntry(contest) {
  const name = String(contest?.name || `Contest ${contest?.id || ""}`);
  const category = classifyContestName(name);
  const type = String(contest?.type || "CF");
  const isRated =
    type === "CF" &&
    !/(unrated|unofficial|mirror|practice)/i.test(name);
  return {
    id: Number(contest?.id) || 0,
    name,
    type,
    phase: String(contest?.phase || "FINISHED"),
    phaseGroup: contestPhaseGroup(contest),
    frozen: Boolean(contest?.frozen),
    durationSeconds: Number(contest?.durationSeconds) || 0,
    startTimeSeconds: Number(contest?.startTimeSeconds) || 0,
    relativeTimeSeconds: Number(contest?.relativeTimeSeconds) || 0,
    category,
    isRated,
  };
}

function contestCenterResponse(center, extra = {}) {
  const contests = Array.isArray(center?.contests) ? center.contests : [];
  return {
    version: CONTEST_CENTER_VERSION,
    syncedAt: center?.syncedAt || null,
    contests,
    details: center?.details && typeof center.details === "object" ? center.details : {},
    summary: {
      total: contests.length,
      upcoming: contests.filter((contest) => contest.phaseGroup === "upcoming").length,
      running: contests.filter((contest) => contest.phaseGroup === "running").length,
      finished: contests.filter((contest) => contest.phaseGroup === "finished").length,
    },
    ...extra,
  };
}

async function loadContestCenter(force = false) {
  const cached = await readJson("contest-center.json", null);
  const cacheTime = cached?.syncedAt ? new Date(cached.syncedAt).getTime() : 0;
  const cacheFresh =
    Array.isArray(cached?.contests) &&
    cached.contests.length > 0 &&
    Date.now() - cacheTime < CONTEST_CENTER_CACHE_MS;
  if (!force && cacheFresh) return contestCenterResponse(cached);

  try {
    const contests = (await fetchCodeforces("contest.list?gym=false"))
      .map(normalizeContestCenterEntry)
      .filter((contest) => Number.isInteger(contest.id) && contest.id > 0)
      .sort((first, second) => second.startTimeSeconds - first.startTimeSeconds);
    const next = {
      version: CONTEST_CENTER_VERSION,
      syncedAt: new Date().toISOString(),
      contests,
      details: cached?.details && typeof cached.details === "object" ? cached.details : {},
    };
    await writeJson("contest-center.json", next);
    return contestCenterResponse(next);
  } catch (error) {
    if (Array.isArray(cached?.contests) && cached.contests.length) {
      return contestCenterResponse(cached, {
        stale: true,
        warning: error.message || "Codeforces 场次列表更新失败，正在使用本地缓存",
      });
    }
    throw error;
  }
}

async function loadContestCenterDetail(contestIdValue, force = false) {
  const contestId = Number(contestIdValue);
  if (!Number.isInteger(contestId) || contestId <= 0) throw new Error("比赛编号无效");
  const center = await loadContestCenter(false);
  const contest = center.contests.find((item) => item.id === contestId);
  if (!contest) throw new Error("场次不在 Codeforces 官方列表中");
  const cachedDetail = center.details?.[contestId];
  const detailTime = cachedDetail?.syncedAt
    ? new Date(cachedDetail.syncedAt).getTime()
    : 0;
  if (
    !force &&
    cachedDetail?.problems?.length &&
    Date.now() - detailTime < CONTEST_DETAIL_CACHE_MS
  ) {
    return cachedDetail;
  }

  const standings = await fetchCodeforces(
    `contest.standings?contestId=${contestId}&from=1&count=1&showUnofficial=true`,
  );
  const ratingChanges = contest.isRated
    ? await fetchCodeforces(`contest.ratingChanges?contestId=${contestId}`).catch(() => [])
    : [];
  const detail = {
    contestId,
    syncedAt: new Date().toISOString(),
    participantCount: Array.isArray(ratingChanges) && ratingChanges.length
      ? ratingChanges.length
      : null,
    problems: (standings?.problems || []).map((problem) => ({
      contestId,
      index: String(problem?.index || ""),
      name: String(problem?.name || ""),
      type: String(problem?.type || "PROGRAMMING"),
      points: Number(problem?.points) || null,
      rating: Number(problem?.rating) || null,
      tags: Array.isArray(problem?.tags) ? problem.tags : [],
    })),
  };
  const latest = await readJson("contest-center.json", center);
  latest.details = latest.details && typeof latest.details === "object" ? latest.details : {};
  latest.details[contestId] = detail;
  await writeJson("contest-center.json", latest);
  return detail;
}

function emptyContestReplay(handle = "") {
  return {
    version: CONTEST_REPLAY_VERSION,
    handle,
    syncedAt: null,
    contests: [],
  };
}

function contestReplayResponse(replay) {
  const contests = Array.isArray(replay?.contests) ? replay.contests : [];
  const completed = contests.filter((contest) => contest.status === "ready").length;
  const failed = contests.filter((contest) => contest.status === "error").length;
  const pending = contests.filter(
    (contest) =>
      contest.status === "pending" || contest.status === "calculating",
  ).length;
  const retryable = contests.filter(
    (contest) =>
      contest.status === "error" &&
      Number(contest.retryCount || 0) < CONTEST_AUTO_RETRY_LIMIT,
  ).length;
  const processed = completed + failed;
  const referencePending = contests.filter(needsAutomaticVirtualReference).length;
  return {
    ...replay,
    contests,
    progress: {
      total: contests.length,
      completed,
      failed,
      pending,
      retryable,
      referencePending,
      autoRemaining: pending + retryable + referencePending,
      processed,
      percent: contests.length
        ? Math.round((processed / contests.length) * 100)
        : 100,
    },
  };
}

function mergeContestReplayHistory(cache, previous, center) {
  return mergeSessions(cache, previous, center, classifyContestName, CONTEST_REPLAY_VERSION);
}

let contestReplayWriteQueue = Promise.resolve();
function withContestReplayLock(operation) {
  const task = contestReplayWriteQueue.then(operation);
  contestReplayWriteQueue = task.catch(() => undefined);
  return task;
}
async function refreshContestReplayIndex() {
  return withContestReplayLock(async () => {
    const cache = await readJson("cache.json", null);
    if (!cache?.handle) return contestReplayResponse(emptyContestReplay(cache?.handle));
    const previous = await readJson("contest-replay.json", emptyContestReplay(cache.handle));
    for (const entry of previous.contests || []) {
      if (entry.status === "calculating" && !contestCalculationTasks.has(replayKey(entry))) entry.status = "pending";
    }
    const center = await readJson("contest-center.json", {});
    const replay = mergeContestReplayHistory(cache, previous, center);
    await writeJson("contest-replay.json", replay);
    return contestReplayResponse(replay);
  });
}

async function loadCarrotModule() {
  if (!carrotModulePromise) {
    carrotModulePromise = import(
      pathToFileURL(path.join(__dirname, "carrot", "predict.mjs")).href
    );
  }
  return carrotModulePromise;
}

function findRatedHandle(row, ratingByHandle) {
  for (const member of row?.party?.members || []) {
    const normalized = String(member?.handle || "").toLowerCase();
    if (ratingByHandle.has(normalized)) return normalized;
  }
  return null;
}

function problemSubmissionSummary(problem, contest, submissions) {
  return summarizeProblem(problem, contest, submissions);
}

async function calculateContestReplayEntry(entry, cache) {
  const contestId = Number(entry.contestId);
  if (entry.rated === false) {
    const standings = await fetchCodeforces(`contest.standings?contestId=${contestId}&from=1&count=1&showUnofficial=true`);
    if (!standings?.contest || !standings.problems?.length) throw new Error("比赛题目或时长暂不可用，请稍后重试");
    const global = new Map((cache?.problems || []).filter((p) => Number(p.contestId) === contestId).map((p) => [p.index, p]));
    return {
      ...enrichSession(entry, standings.contest, standings.problems.map((p) => ({ ...global.get(p.index), ...p })), cache?.submissions || []),
      category: classifyContestName(standings.contest.name || entry.contestName),
      calculatedAt: new Date().toISOString(),
    };
  }
  const [standings, ratingChanges] = await Promise.all([
    fetchCodeforces(`contest.standings?contestId=${contestId}`),
    fetchCodeforces(`contest.ratingChanges?contestId=${contestId}`),
  ]);
  if (!standings?.contest || !Array.isArray(standings.rows)) {
    throw new Error("Codeforces 未返回完整比赛榜单");
  }
  if (!Array.isArray(ratingChanges) || !ratingChanges.length) {
    throw new Error("该比赛没有可用的官方 Rating 变化");
  }

  const handle = String(cache?.handle || cache?.user?.handle || "").toLowerCase();
  const targetChange =
    ratingChanges.find(
      (change) => String(change.handle || "").toLowerCase() === handle,
    );
  if (!targetChange) throw new Error("无法在官方 Rating 变化中定位当前用户");

  const ratingByHandle = new Map(
    ratingChanges.map((change) => [
      String(change.handle || "").toLowerCase(),
      contestId >= 1360 && Number(change.oldRating) === 0
        ? 1400
        : Number(change.oldRating),
    ]),
  );
  const { Contestant, predictFromRanks } = await loadCarrotModule();
  const contestants = ratingChanges.map((change) => {
    const ratedHandle = String(change.handle || "").toLowerCase();
    const contestant = new Contestant(
      ratedHandle,
      0,
      0,
      ratingByHandle.get(ratedHandle),
    );
    contestant.rank = Number(change.rank);
    return contestant;
  });
  if (contestants.length < 2) throw new Error("有效 Rated 参赛者数据不足");
  predictFromRanks(contestants, true);

  const targetHandle = String(targetChange.handle || "").toLowerCase();
  const targetContestant = contestants.find(
    (contestant) => contestant.handle === targetHandle,
  );
  const targetRow = standings.rows.find(
    (row) => findRatedHandle(row, ratingByHandle) === targetHandle,
  );
  if (!targetContestant) throw new Error("无法在官方 Rating 变化中定位当前用户");

  const globalProblems = new Map(
    (cache?.problems || [])
      .filter((problem) => Number(problem.contestId) === contestId)
      .map((problem) => [String(problem.index), problem]),
  );
  const problems = (standings.problems || []).map((problem) => {
    const globalProblem = globalProblems.get(String(problem.index));
    const normalizedProblem = {
      ...globalProblem,
      ...problem,
      contestId,
      index: String(problem.index),
      name: String(problem.name || globalProblem?.name || `Problem ${problem.index}`),
      rating: Number(problem.rating || globalProblem?.rating) || null,
      tags: Array.isArray(problem.tags)
        ? problem.tags
        : Array.isArray(globalProblem?.tags)
          ? globalProblem.tags
          : [],
    };
    return {
      ...normalizedProblem,
      ...problemSubmissionSummary(
        normalizedProblem,
        standings.contest,
        cache?.submissions || [],
      ),
    };
  });
  const solved = problems.filter(
    (problem) => problem.contestResult === "accepted",
  ).length;
  const performance = Number.isFinite(targetContestant.performance)
    ? Math.round(targetContestant.performance)
    : "Infinity";

  return {
    ...entry,
    contestName: String(standings.contest.name || entry.contestName),
    category: classifyContestName(standings.contest.name || entry.contestName),
    status: "ready",
    error: null,
    performance,
    participants: ratingChanges.length,
    officialRank: Number(targetChange.rank) || Number(entry.officialRank) || null,
    calculatedRank: Number(targetContestant.rank) || null,
    oldRating: Number(targetChange.oldRating) || 0,
    newRating: Number(targetChange.newRating) || 0,
    ratingDelta:
      (Number(targetChange.newRating) || 0) -
      (Number(targetChange.oldRating) || 0),
    startTimeSeconds:
      Number(standings.contest.startTimeSeconds) || Number(entry.dateSeconds) || 0,
    dateSeconds:
      Number(standings.contest.startTimeSeconds) || Number(entry.dateSeconds) || 0,
    durationSeconds: Number(standings.contest.durationSeconds) || 0,
    contestType: String(standings.contest.type || ""),
    points: Number(targetRow?.points) || solved,
    penalty: Number(targetRow?.penalty) || null,
    solved,
    totalProblems: problems.length,
    problems,
    calculatedAt: new Date().toISOString(),
    calculationSource: "Carrot Plus",
    retryCount: 0,
    failedAt: null,
  };
}

async function calculateContestReplay(contestId, force = false) {
  const key = String(contestId);
  if (!/^[1-9]\d*(?::virtual:[1-9]\d*|:unofficial)?$/.test(key)) {
    throw new Error("无效的参赛记录编号");
  }
  if (contestCalculationTasks.has(key)) return contestCalculationTasks.get(key);

  const task = (async () => {
    const indexed = await refreshContestReplayIndex();
    const replay = {
      version: indexed.version,
      handle: indexed.handle,
      syncedAt: indexed.syncedAt,
      contests: indexed.contests,
    };
    const index = replay.contests.findIndex(
      (contest) => replayKey(contest) === key,
    );
    if (index < 0) throw new Error("比赛不在当前用户的有效参赛记录中");
    if (!force && replay.contests[index].status === "ready") {
      return contestReplayResponse(replay);
    }

    const cache = await readJson("cache.json", null);
    replay.contests[index] = {
      ...replay.contests[index],
      status: "calculating",
      error: null,
      retryCount: force ? 0 : Number(replay.contests[index].retryCount || 0),
    };
    await withContestReplayLock(async () => {
      const latest = await readJson("contest-replay.json", replay);
      if (latest.handle !== replay.handle) throw new Error("当前账号已变化，请重新打开复盘");
      latest.contests = latest.contests.map((item) => replayKey(item) === key ? replay.contests[index] : item);
      await writeJson("contest-replay.json", latest);
    });
    try {
      replay.contests[index] = await calculateContestReplayEntry(
        replay.contests[index],
        cache,
      );
    } catch (error) {
      replay.contests[index] = {
        ...replay.contests[index],
        status: "error",
        error: String(error?.message || "赛事数据计算失败").slice(0, 300),
        retryCount: Number(replay.contests[index].retryCount || 0) + 1,
        failedAt: new Date().toISOString(),
      };
    }
    // Network work can overlap other calculations or an account switch.
    // Merge only this result into the latest index, never overwrite another session.
    return withContestReplayLock(async () => {
      const latest = await readJson("contest-replay.json", replay);
      const currentCache = await readJson("cache.json", {});
      if (String(currentCache.handle || "").toLowerCase() !== replay.handle.toLowerCase() ||
          String(latest.handle || "").toLowerCase() !== replay.handle.toLowerCase()) {
        return contestReplayResponse(latest);
      }
      const latestEntry = findReplayEntry(latest.contests, key);
      if (latestEntry?.submissionFingerprint === replay.contests[index].submissionFingerprint) {
        latest.contests = latest.contests.map((item) => replayKey(item) === key ? replay.contests[index] : item);
      }
      latest.syncedAt = new Date().toISOString();
      latest.contests.sort((first, second) => second.dateSeconds - first.dateSeconds);
      await writeJson("contest-replay.json", latest);
      return contestReplayResponse(latest);
    });
  })().finally(() => contestCalculationTasks.delete(key));

  contestCalculationTasks.set(key, task);
  return task;
}

async function calculateNextContestReplay() {
  const replay = await refreshContestReplayIndex();
  const next =
    replay.contests.find((contest) => contest.status === "pending") ||
    replay.contests.find(
      (contest) =>
        contest.status === "error" &&
        Number(contest.retryCount || 0) < CONTEST_AUTO_RETRY_LIMIT,
    );
  if (next) return calculateContestReplay(replayKey(next));
  const virtual = replay.contests.find(needsAutomaticVirtualReference);
  return virtual ? calculateVirtualReference(replayKey(virtual)) : replay;
}

function needsAutomaticVirtualReference(contest) {
  return contest.participationType === "VIRTUAL" && contest.status === "ready" &&
    !contest.virtualReference && Number(contest.durationSeconds) > 0 &&
    Number(contest.sessionStartTimeSeconds) > 0 &&
    Date.now() / 1000 >= Number(contest.sessionStartTimeSeconds) + Number(contest.durationSeconds);
}

const virtualReferenceTasks = new Map();
async function calculateVirtualReference(id) {
  const key = String(id);
  if (!/^[1-9]\d*:virtual:[1-9]\d*$/.test(key)) throw Error("无效的虚拟参赛编号");
  const indexed = await refreshContestReplayIndex();
  const entry = findReplayEntry(indexed.contests, key);
  if (!entry || entry.participationType !== "VIRTUAL" || entry.status !== "ready") throw Error("本次虚拟复盘尚未准备好");
  const cache = await readJson("cache.json", {});
  if (normalizedReplayHandle(cache.handle) !== normalizedReplayHandle(indexed.handle)) throw Error("当前账号已变化，请重新打开复盘");
  const taskKey = `${normalizedReplayHandle(indexed.handle)}:${key}`;
  if (virtualReferenceTasks.has(taskKey)) return virtualReferenceTasks.get(taskKey);
  const task = (async () => {
    let reference;
    try {
      const [standings, ratingChanges] = await Promise.all([
        fetchCodeforces(`contest.standings?contestId=${entry.contestId}&showUnofficial=true`),
        fetchCodeforces(`contest.ratingChanges?contestId=${entry.contestId}`),
      ]);
      reference = await estimateVirtualReference({ entry, cache, standings, ratingChanges });
    } catch (error) {
      reference = { status: "unavailable", error: String(error.message || "参考分暂不可用").slice(0, 300),
        submissionFingerprint: entry.submissionFingerprint, calculatedAt: new Date().toISOString() };
    }
    return withContestReplayLock(async () => {
      const latest = await readJson("contest-replay.json", {});
      const latestCache = await readJson("cache.json", {});
      const current = findReplayEntry(latest.contests, key);
      if (normalizedReplayHandle(latest.handle) !== normalizedReplayHandle(indexed.handle) ||
          normalizedReplayHandle(latestCache.handle) !== normalizedReplayHandle(indexed.handle) ||
          latestCache.syncedAt !== cache.syncedAt || current?.submissionFingerprint !== entry.submissionFingerprint) {
        throw Error("参赛数据已更新，请重新计算本场参考分");
      }
      current.virtualReference = reference.status === "unavailable" && current.virtualReference?.status === "ready"
        ? { ...current.virtualReference, refreshError: reference.error }
        : reference;
      await writeJson("contest-replay.json", latest);
      return contestReplayResponse(latest);
    });
  })().finally(() => virtualReferenceTasks.delete(taskKey));
  virtualReferenceTasks.set(taskKey, task);
  return task;
}
function normalizedReplayHandle(value) { return String(value || "").toLowerCase(); }

function startContestReplayAutoCalculation() {
  if (contestAutoCalculationPromise) return contestAutoCalculationPromise;
  contestAutoCalculationPromise = (async () => {
    let replay = await refreshContestReplayIndex();
    let safetyCount = 0;
    while (replay.progress.autoRemaining > 0 && safetyCount < 500) {
      replay = await calculateNextContestReplay();
      safetyCount += 1;
    }
    return replay;
  })()
    .catch((error) => {
      console.error("赛事复盘自动计算失败:", error);
      return null;
    })
    .finally(() => {
      contestAutoCalculationPromise = null;
    });
  return contestAutoCalculationPromise;
}

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function sanitizeAiReviews(input) {
  const reviews = {};
  for (const [key, value] of Object.entries(input || {}).slice(0, 200)) {
    if (!value || typeof value !== "object") continue;
    const normalized = normalizeAiReview(value);
    reviews[String(key).slice(0, 80)] = {
      ...normalized,
      contestId: Number(value.contestId) || null,
      replayId: String(value.replayId || value.contestId || "").slice(0, 80),
      contestName: String(value.contestName || "").slice(0, 240),
      provider: String(value.provider || "deepseek").slice(0, 40),
      model: String(value.model || "").slice(0, 100),
      analysisMode: value.analysisMode === "source" ? "source" : "summary",
      sourceIncluded: value.sourceIncluded === true,
      sourceSubmissionCount: clampNumber(value.sourceSubmissionCount, 0, 300, 0),
      generatedAt: String(value.generatedAt || new Date().toISOString()).slice(0, 40),
      savedAt: String(value.savedAt || "").slice(0, 40),
      inputFingerprint: String(value.inputFingerprint || "").slice(0, 32),
    };
  }
  return reviews;
}

function sanitizeStudyData(input) {
  const source = input && typeof input === "object" ? input : {};
  const settings = source.settings && typeof source.settings === "object"
    ? source.settings
    : {};
  const needsRecollectionTheme = Number(settings.themeVersion || 0) < 3;
  const needsLobbyVisibilityUpgrade = Number(settings.themeVersion || 0) < 4;
  const needsWallpaperClarityUpgrade = Number(settings.themeVersion || 0) < 5;
  const needsWallpaperLayoutUpgrade = Number(settings.themeVersion || 0) < 6;
  const notes = {};
  for (const [key, value] of Object.entries(source.notes || {}).slice(0, 10000)) {
    if (!value || typeof value !== "object") continue;
    notes[String(key).slice(0, 80)] = sanitizeProblemNote(value);
  }

  const reviews = {};
  for (const [key, value] of Object.entries(source.reviews || {}).slice(0, 10000)) {
    if (!value || typeof value !== "object") continue;
    reviews[String(key).slice(0, 80)] = {
      ease: Math.min(3.2, Math.max(1.3, Number(value.ease) || 2.5)),
      intervalDays: clampNumber(value.intervalDays, 0, 3650, 0),
      repetitions: clampNumber(value.repetitions, 0, 10000, 0),
      lastReviewedAt: Number(value.lastReviewedAt) || null,
      nextReviewAt: Number(value.nextReviewAt) || null,
      lastGrade: String(value.lastGrade || "").slice(0, 20),
      history: Array.isArray(value.history)
        ? value.history.slice(-50).map((entry) => ({
            at: Number(entry?.at) || Date.now(),
            grade: String(entry?.grade || "").slice(0, 20),
            intervalDays: clampNumber(entry?.intervalDays, 0, 3650, 0),
          }))
        : [],
    };
  }

  const plan = source.plan && typeof source.plan === "object"
    ? {
        date: String(source.plan.date || "").slice(0, 20),
        recommendationVersion: clampNumber(
          source.plan.recommendationVersion,
          1,
          100,
          1,
        ),
        generatedAt: Number(source.plan.generatedAt) || Date.now(),
        refreshSerial: clampNumber(source.plan.refreshSerial, 0, 100000, 0),
        refreshHistory: Array.isArray(source.plan.refreshHistory)
          ? source.plan.refreshHistory.slice(-120).map(String)
          : [],
        reviewKeys: Array.isArray(source.plan.reviewKeys)
          ? source.plan.reviewKeys.slice(0, 50).map(String)
          : [],
        newProblemKeys: Array.isArray(source.plan.newProblemKeys)
          ? source.plan.newProblemKeys.slice(0, 50).map(String)
          : [],
        completedNewKeys: Array.isArray(source.plan.completedNewKeys)
          ? source.plan.completedNewKeys.slice(0, 50).map(String)
          : [],
        weaknessProblemKeys: Array.isArray(source.plan.weaknessProblemKeys)
          ? source.plan.weaknessProblemKeys.slice(0, 12).map(String)
          : [],
        tierProblemKeys:
          source.plan.tierProblemKeys && typeof source.plan.tierProblemKeys === "object"
            ? {
                consolidate: Array.isArray(source.plan.tierProblemKeys.consolidate)
                  ? source.plan.tierProblemKeys.consolidate.slice(0, 12).map(String)
                  : [],
                steady: Array.isArray(source.plan.tierProblemKeys.steady)
                  ? source.plan.tierProblemKeys.steady.slice(0, 12).map(String)
                  : [],
                challenge: Array.isArray(source.plan.tierProblemKeys.challenge)
                  ? source.plan.tierProblemKeys.challenge.slice(0, 12).map(String)
                  : [],
              }
            : null,
      }
    : null;
  const contestQueue = Array.isArray(source.contestQueue)
    ? [...new Set(source.contestQueue.slice(0, 1000).map((key) => String(key).slice(0, 80)))]
    : [];
  const contestQueueProblems = {};
  for (const key of contestQueue) {
    const value = source.contestQueueProblems?.[key];
    if (!value || typeof value !== "object" || !/^[1-9]\d*-[A-Za-z0-9]+$/.test(key)) continue;
    const [contestId, index] = key.split("-");
    contestQueueProblems[key] = {
      contestId: Number(contestId), index,
      name: String(value.name || "").slice(0, 240),
      rating: Number.isFinite(Number(value.rating)) && Number(value.rating) > 0 ? Number(value.rating) : null,
      tags: Array.isArray(value.tags) ? value.tags.slice(0, 20).map((tag) => String(tag).slice(0, 80)) : [],
    };
  }
  const aiReviews = sanitizeAiReviews(source.aiReviews);

  return {
    version: 1,
    notes,
    reviews,
    aiReviews,
    contestQueue,
    contestQueueProblems,
    plan,
    settings: {
      language: ["zh-CN", "en-US"].includes(settings.language)
        ? settings.language
        : DEFAULT_SETTINGS.language,
      themeVersion: 7,
      showProblemTags:
        typeof settings.showProblemTags === "boolean"
          ? settings.showProblemTags
          : DEFAULT_SETTINGS.showProblemTags,
      interfaceDensity: ["compact", "comfortable", "large"].includes(
        settings.interfaceDensity,
      )
        ? settings.interfaceDensity
        : DEFAULT_SETTINGS.interfaceDensity,
      reviewLimit: clampNumber(settings.reviewLimit, 1, 30, DEFAULT_SETTINGS.reviewLimit),
      reviewRatingGap: [0, 300, 400, 500, 600].includes(Number(settings.reviewRatingGap))
        ? Number(settings.reviewRatingGap)
        : DEFAULT_SETTINGS.reviewRatingGap,
      newProblemLimit: clampNumber(
        settings.newProblemLimit,
        1,
        20,
        DEFAULT_SETTINGS.newProblemLimit,
      ),
      recommendationTierCounts: {
        consolidate: clampNumber(
          settings.recommendationTierCounts?.consolidate,
          1,
          6,
          DEFAULT_SETTINGS.recommendationTierCounts.consolidate,
        ),
        steady: clampNumber(
          settings.recommendationTierCounts?.steady,
          1,
          6,
          DEFAULT_SETTINGS.recommendationTierCounts.steady,
        ),
        challenge: clampNumber(
          settings.recommendationTierCounts?.challenge,
          1,
          6,
          DEFAULT_SETTINGS.recommendationTierCounts.challenge,
        ),
      },
      autoSync:
        typeof settings.autoSync === "boolean"
          ? settings.autoSync
          : DEFAULT_SETTINGS.autoSync,
      autoSyncMinutes: clampNumber(
        settings.autoSyncMinutes,
        15,
        180,
        DEFAULT_SETTINGS.autoSyncMinutes,
      ),
      autoBackup:
        typeof settings.autoBackup === "boolean"
          ? settings.autoBackup
          : DEFAULT_SETTINGS.autoBackup,
      backupRetention: clampNumber(
        settings.backupRetention,
        3,
        60,
        DEFAULT_SETTINGS.backupRetention,
      ),
      problemCacheHours: clampNumber(
        settings.problemCacheHours,
        1,
        48,
        DEFAULT_SETTINGS.problemCacheHours,
      ),
      syncRatingHistory:
        typeof settings.syncRatingHistory === "boolean"
          ? settings.syncRatingHistory
          : DEFAULT_SETTINGS.syncRatingHistory,
      wallpaperEnabled:
        typeof settings.wallpaperEnabled === "boolean"
          ? settings.wallpaperEnabled
          : DEFAULT_SETTINGS.wallpaperEnabled,
      wallpaperId: String(
        needsRecollectionTheme && settings.wallpaperId !== "custom"
          ? DEFAULT_SETTINGS.wallpaperId
          : settings.wallpaperId || DEFAULT_SETTINGS.wallpaperId,
      ).slice(0, 80),
      wallpaperClarity: clampNumber(
        needsRecollectionTheme
          ? DEFAULT_SETTINGS.wallpaperClarity
          : settings.wallpaperClarity,
        0,
        100,
        DEFAULT_SETTINGS.wallpaperClarity,
      ),
      wallpaperOpacity: clampNumber(
        needsRecollectionTheme
          ? DEFAULT_SETTINGS.wallpaperOpacity
          : needsLobbyVisibilityUpgrade && Number(settings.wallpaperOpacity) === 78
            ? DEFAULT_SETTINGS.wallpaperOpacity
            : settings.wallpaperOpacity,
        0,
        100,
        DEFAULT_SETTINGS.wallpaperOpacity,
      ),
      wallpaperBrightness: clampNumber(
        needsRecollectionTheme
          ? DEFAULT_SETTINGS.wallpaperBrightness
          : needsLobbyVisibilityUpgrade && Number(settings.wallpaperBrightness) === 82
            ? DEFAULT_SETTINGS.wallpaperBrightness
            : settings.wallpaperBrightness,
        55,
        135,
        DEFAULT_SETTINGS.wallpaperBrightness,
      ),
      wallpaperScale: clampNumber(
        needsWallpaperLayoutUpgrade
          ? DEFAULT_SETTINGS.wallpaperScale
          : needsWallpaperClarityUpgrade && Number(settings.wallpaperScale) === 106
            ? DEFAULT_SETTINGS.wallpaperScale
          : settings.wallpaperScale,
        100,
        155,
        DEFAULT_SETTINGS.wallpaperScale,
      ),
      wallpaperPosition: needsWallpaperLayoutUpgrade
        ? DEFAULT_SETTINGS.wallpaperPosition
        : [
            "left top",
            "center top",
            "right top",
            "left center",
            "center center",
            "center right",
            "left bottom",
            "center bottom",
            "right bottom",
          ].includes(settings.wallpaperPosition)
          ? settings.wallpaperPosition
          : DEFAULT_SETTINGS.wallpaperPosition,
      wallpaperFit: ["smart", "cover", "contain"].includes(settings.wallpaperFit)
        ? settings.wallpaperFit
        : DEFAULT_SETTINGS.wallpaperFit,
      wallpaperVideoPlaybackRate: clampNumber(
        settings.wallpaperVideoPlaybackRate,
        50,
        150,
        DEFAULT_SETTINGS.wallpaperVideoPlaybackRate,
      ),
      pauseWallpaperWhenUnfocused:
        typeof settings.pauseWallpaperWhenUnfocused === "boolean"
          ? settings.pauseWallpaperWhenUnfocused
          : DEFAULT_SETTINGS.pauseWallpaperWhenUnfocused,
      panelOpacity: clampNumber(
        needsRecollectionTheme
          ? DEFAULT_SETTINGS.panelOpacity
          : needsLobbyVisibilityUpgrade && Number(settings.panelOpacity) === 82
            ? DEFAULT_SETTINGS.panelOpacity
            : settings.panelOpacity,
        58,
        96,
        DEFAULT_SETTINGS.panelOpacity,
      ),
      wallpaperFavorites: Array.isArray(settings.wallpaperFavorites)
        ? settings.wallpaperFavorites.slice(0, 500).map((item) => String(item).slice(0, 80))
        : DEFAULT_SETTINGS.wallpaperFavorites,
      wallpaperLocked:
        typeof settings.wallpaperLocked === "boolean"
          ? settings.wallpaperLocked
          : DEFAULT_SETTINGS.wallpaperLocked,
      randomWallpaperOnPageChange:
        typeof settings.randomWallpaperOnPageChange === "boolean"
          ? settings.randomWallpaperOnPageChange
          : DEFAULT_SETTINGS.randomWallpaperOnPageChange,
      wallpaperAutoRotateMinutes: clampNumber(
        settings.wallpaperAutoRotateMinutes,
        0,
        1440,
        DEFAULT_SETTINGS.wallpaperAutoRotateMinutes,
      ),
      usePageWallpapers:
        typeof settings.usePageWallpapers === "boolean"
          ? settings.usePageWallpapers
          : DEFAULT_SETTINGS.usePageWallpapers,
      pageWallpapers:
        settings.pageWallpapers && typeof settings.pageWallpapers === "object"
          ? Object.fromEntries(
              Object.entries(settings.pageWallpapers)
                .slice(0, 12)
                .map(([key, value]) => [
                  String(key).slice(0, 30),
                  String(value).slice(0, 80),
                ]),
            )
          : {},
      accentTheme: ["sky", "mint", "coral"].includes(settings.accentTheme)
        ? settings.accentTheme
        : DEFAULT_SETTINGS.accentTheme,
      reduceMotion:
        typeof settings.reduceMotion === "boolean"
          ? settings.reduceMotion
          : DEFAULT_SETTINGS.reduceMotion,
    },
  };
}

function sanitizeProblemNote(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    difficulty: clampNumber(source.difficulty, 1, 5, 3),
    mistakeReason: String(source.mistakeReason || "").slice(0, 80),
    mistakeTags: Array.isArray(source.mistakeTags)
      ? source.mistakeTags.slice(0, 12).map((tag) => String(tag).slice(0, 30))
      : [],
    keyIdea: String(source.keyIdea || "").slice(0, 5000),
    content: String(source.content || "").slice(0, 30000),
    updatedAt: String(source.updatedAt || new Date().toISOString()).slice(0, 40),
  };
}

async function broadcastStudyData(study) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("study:changed", study);
  }
}

async function readStudyData() {
  try {
    const source = JSON.parse(await fs.readFile(dataPath("study.json"), "utf8"));
    return sanitizeStudyData(source);
  } catch (error) {
    const fallback = error?.code === "ENOENT" ? createFirstLaunchStudyData() : DEFAULT_STUDY_DATA;
    return sanitizeStudyData(fallback);
  }
}

async function readUiLanguage() {
  try {
    return (await readStudyData()).settings.language;
  } catch {
    return DEFAULT_SETTINGS.language;
  }
}

function sanitizeFavorites(input) {
  return Array.isArray(input) ? input.slice(0, 10000).map(String) : [];
}

const codeforcesSourceService = createCodeforcesSourceService({
  dataPath,
  safeStorage,
  fetchJson: (endpoint) => fetchCodeforces(endpoint),
});

const aiService = createAiService({
  dataPath,
  readJson,
  writeJson,
  safeStorage,
  net,
  getCache: () => readJson("cache.json", null),
  getStudy: () => readStudyData(),
  getReplay: () => readJson("contest-replay.json", null),
  getDemoData: () => buildDemoAiData(),
  getSubmissionSources: (request) => codeforcesSourceService.fetchSources(request),
});

function validCache(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray(value.problems) &&
      Array.isArray(value.submissions),
  );
}

function validContestReplay(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      Number.isInteger(value.version) && value.version >= 1 && value.version <= CONTEST_REPLAY_VERSION &&
      Array.isArray(value.contests),
  );
}

async function appendActivity(type, detail, status = "success") {
  const current = await readJson("activity.json", []);
  const next = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      type,
      status,
      detail: String(detail || "").slice(0, 300),
    },
    ...(Array.isArray(current) ? current : []),
  ].slice(0, 100);
  await writeJson("activity.json", next);
  return next;
}

async function getBackupFiles() {
  try {
    const directory = backupDirectory();
    const names = await fs.readdir(directory);
    const files = [];
    for (const name of names.filter((item) => item.endsWith(".json"))) {
      const target = path.join(directory, name);
      const stats = await fs.stat(target);
      files.push({
        name,
        path: target,
        size: stats.size,
        createdAt: stats.mtime.toISOString(),
      });
    }
    return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

async function collectDataBundle(reason = "manual", snapshot = null) {
  const snapshotCache = validCache(snapshot?.cache) ? snapshot.cache : null;
  const snapshotFavorites = Array.isArray(snapshot?.favorites)
    ? sanitizeFavorites(snapshot.favorites)
    : null;
  const snapshotStudy = snapshot?.study ? sanitizeStudyData(snapshot.study) : null;
  const contestReplay = await readJson("contest-replay.json", null);
  return {
    format: "cf-compass-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    reason,
    data: {
      cache: snapshotCache || (await readJson("cache.json", null)),
      favorites: snapshotFavorites || sanitizeFavorites(await readJson("favorites.json", [])),
      study: snapshotStudy || (await readStudyData()),
      contestReplay: validContestReplay(contestReplay) ? contestReplay : null,
      studyPlan: sanitizeStudyPlan(await readJson("study-plan.json", { version: 1, items: [] })),
    },
  };
}

async function pruneBackups(retention) {
  const files = await getBackupFiles();
  const removable = files.slice(retention);
  await Promise.all(removable.map((file) => fs.unlink(file.path).catch(() => undefined)));
}

async function createAutomaticBackup(reason = "automatic", force = false) {
  const study = await readStudyData();
  if (!force && !study.settings.autoBackup) return null;
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const suffix = force ? `-${now.toISOString().replaceAll(":", "-").replaceAll(".", "-")}` : "";
  const filename = `cf-compass-backup-${day}${suffix}.json`;
  const target = path.join(backupDirectory(), filename);
  if (!force) {
    const exists = await fs.access(target).then(() => true).catch(() => false);
    if (exists) return target;
  }
  await writeJsonPath(target, await collectDataBundle(reason));
  await pruneBackups(study.settings.backupRetention);
  await appendActivity("自动备份", `已创建 ${filename}`);
  return target;
}

function scheduleAutomaticBackup(reason = "study-update") {
  if (automaticBackupTimer) clearTimeout(automaticBackupTimer);
  automaticBackupTimer = setTimeout(() => {
    automaticBackupTimer = null;
    void createAutomaticBackup(reason).catch((error) => {
      console.error("自动备份失败:", error);
    });
  }, 1200);
}

async function fetchIncrementalSubmissions(encodedHandle, cached) {
  const canIncrement =
    validCache(cached) &&
    String(cached.handle || "").toLowerCase() === decodeURIComponent(encodedHandle).toLowerCase();
  const existing = canIncrement ? cached.submissions : [];
  const existingIds = new Set(existing.map((submission) => submission.id));
  const added = [];
  const refreshed = new Map();
  let from = 1;
  let reachedKnown = false;

  while (from <= MAX_SUBMISSIONS && !reachedKnown) {
    const page = await fetchCodeforces(
      `user.status?handle=${encodedHandle}&from=${from}&count=${SUBMISSION_PAGE_SIZE}`,
    );
    if (!Array.isArray(page) || page.length === 0) break;
    for (const submission of page) {
      if (existingIds.has(submission.id)) {
        // A recently cached TESTING verdict can become OK without a new submission ID.
        refreshed.set(submission.id, submission);
        reachedKnown = true;
        continue;
      }
      added.push(submission);
    }
    if (page.length < SUBMISSION_PAGE_SIZE) break;
    from += SUBMISSION_PAGE_SIZE;
  }

  const merged = [...added, ...existing.map((submission) => refreshed.get(submission.id) || submission)];
  const seen = new Set();
  const submissions = merged.filter((submission) => {
    if (seen.has(submission.id)) return false;
    seen.add(submission.id);
    return true;
  });
  submissions.sort((a, b) => (b.id || 0) - (a.id || 0));

  return {
    submissions,
    newCount: added.length,
    incremental: canIncrement,
  };
}

async function syncHandle(handle) {
  const safeHandle = String(handle || "").trim();
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(safeHandle)) {
    throw new Error("请输入有效的 Codeforces Handle");
  }

  const encoded = encodeURIComponent(safeHandle);
  const cached = await readJson("cache.json", null);
  const study = await readStudyData();
  const cacheAge =
    validCache(cached) && cached.problemsetSyncedAt
      ? Date.now() - new Date(cached.problemsetSyncedAt).getTime()
      : Number.POSITIVE_INFINITY;
  const canReuseProblemset =
    validCache(cached) &&
    cacheAge < study.settings.problemCacheHours * 60 * 60 * 1000;

  const usersPromise = fetchCodeforces(
    `user.info?handles=${encoded}&checkHistoricHandles=false`,
  );
  const submissionsPromise = fetchIncrementalSubmissions(encoded, cached);
  const problemsetPromise = canReuseProblemset
    ? Promise.resolve({ problems: cached.problems })
    : fetchCodeforces("problemset.problems");
  const ratingPromise = study.settings.syncRatingHistory
    ? fetchCodeforces(`user.rating?handle=${encoded}`)
    : Promise.resolve(String(cached?.handle || "").toLowerCase() === safeHandle.toLowerCase() ? cached?.ratingHistory || [] : []);
  const ratingStandingFresh =
    cached?.ratingStanding?.syncedAt &&
    String(cached?.handle || "").toLowerCase() === safeHandle.toLowerCase() &&
    Date.now() - new Date(cached.ratingStanding.syncedAt).getTime() <
      RATING_STANDING_CACHE_MS;
  const ratedUsersPromise = ratingStandingFresh
    ? Promise.resolve(null)
    : fetchCodeforces("user.ratedList?activeOnly=true&includeRetired=false").catch(
        () => null,
      );

  const [users, submissionResult, problemset, ratingHistory, ratedUsers] = await Promise.all([
    usersPromise,
    submissionsPromise,
    problemsetPromise,
    ratingPromise,
    ratedUsersPromise,
  ]);

  const now = new Date().toISOString();
  const ratingStanding = Array.isArray(ratedUsers)
    ? buildRatingStanding(ratedUsers, users[0]?.rating)
    : String(cached?.handle || "").toLowerCase() === safeHandle.toLowerCase() ? cached?.ratingStanding || null : null;
  const payload = {
    version: 2,
    handle: safeHandle,
    user: users[0],
    problems: problemset.problems,
    submissions: submissionResult.submissions,
    ratingHistory: Array.isArray(ratingHistory) ? ratingHistory : [],
    ratingStanding,
    problemsetSyncedAt: canReuseProblemset ? cached.problemsetSyncedAt : now,
    syncedAt: now,
    isDemo: false,
    syncMeta: {
      newSubmissions: submissionResult.newCount,
      incremental: submissionResult.incremental,
      reusedProblemset: canReuseProblemset,
      latestSubmissionId: submissionResult.submissions[0]?.id || null,
    },
  };
  await writeJson("cache.json", payload, { pretty: false });
  await refreshContestReplayIndex();
  void startContestReplayAutoCalculation();
  void loadContestCenter(false).catch(() => undefined);
  await appendActivity(
    submissionResult.incremental ? "增量同步" : "完整同步",
    `新增 ${submissionResult.newCount} 条提交 · ${
      canReuseProblemset ? "复用题库缓存" : "更新题库缓存"
    }`,
  );
  await createAutomaticBackup("sync");
  return payload;
}

async function exportData(snapshot) {
  const english = (await readUiLanguage()) === "en-US";
  const result = await dialog.showSaveDialog(mainWindow, {
    title: english ? "Export CF Compass Data" : "导出 CF Compass 数据",
    defaultPath: `CF-Compass-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: english ? "JSON Data" : "JSON 数据", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await writeJsonPath(result.filePath, await collectDataBundle("manual-export", snapshot));
  await appendActivity("手动导出", `已导出到 ${path.basename(result.filePath)}`);
  return { canceled: false, path: result.filePath };
}

function validateImportBundle(bundle) {
  if (
    !bundle ||
    bundle.format !== "cf-compass-backup" ||
    bundle.version !== 1 ||
    !bundle.data ||
    !validCache(bundle.data.cache)
  ) {
    throw new Error("不是有效的 CF Compass 备份文件");
  }
  return {
    cache: bundle.data.cache,
    favorites: sanitizeFavorites(bundle.data.favorites),
    study: sanitizeStudyData(bundle.data.study),
    contestReplay: validContestReplay(bundle.data.contestReplay)
      ? bundle.data.contestReplay
      : emptyContestReplay(bundle.data.cache.handle),
    studyPlan: sanitizeStudyPlan(bundle.data.studyPlan || bundle.data.agentTodo),
  };
}

async function importData() {
  const english = (await readUiLanguage()) === "en-US";
  const result = await dialog.showOpenDialog(mainWindow, {
    title: english ? "Import CF Compass Data" : "导入 CF Compass 数据",
    properties: ["openFile"],
    filters: [{ name: english ? "JSON Data" : "JSON 数据", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const sourcePath = result.filePaths[0];
  const stats = await fs.stat(sourcePath);
  if (stats.size > 200 * 1024 * 1024) {
    throw new Error("备份文件过大，已停止导入");
  }
  const bundle = await readJsonPath(sourcePath, null);
  const imported = validateImportBundle(bundle);
  const confirmation = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: english ? "Confirm Data Import" : "确认导入数据",
    message: english
      ? "Importing will replace the current problemset cache, favorites, and training records."
      : "导入会替换当前的题库缓存、收藏和学习记录。",
    detail: english
      ? "A pre-import backup will be created automatically so you can restore it later."
      : "系统会先自动创建一份“导入前备份”，之后可随时恢复。",
    buttons: english ? ["Cancel", "Import"] : ["取消", "确认导入"],
    defaultId: 1,
    cancelId: 0,
    noLink: true,
  });
  if (confirmation.response !== 1) return { canceled: true };
  await createAutomaticBackup("before-import", true);
  await Promise.all([
    writeJson("cache.json", imported.cache, { pretty: false }),
    writeJson("favorites.json", imported.favorites),
    writeJson("study.json", imported.study),
    writeJson("contest-replay.json", imported.contestReplay),
    writeJson("study-plan.json", imported.studyPlan),
  ]);
  await appendActivity(
    "手动导入",
    `已导入 ${imported.cache.submissions.length} 条提交与 ${Object.keys(imported.study.notes).length} 份笔记`,
  );
  return {
    canceled: false,
    path: sourcePath,
    cache: imported.cache,
    favorites: imported.favorites,
    study: imported.study,
    studyPlan: imported.studyPlan,
  };
}

async function getDataCenterStatus() {
  const [cache, study, activity, backups] = await Promise.all([
    readJson("cache.json", null),
    readStudyData(),
    readJson("activity.json", []),
    getBackupFiles(),
  ]);
  return {
    submissionCount: cache?.submissions?.length || 0,
    latestSubmissionId: cache?.syncMeta?.latestSubmissionId || cache?.submissions?.[0]?.id || null,
    lastSyncAt: cache?.syncedAt || null,
    problemsetSyncedAt: cache?.problemsetSyncedAt || null,
    lastNewSubmissions: cache?.syncMeta?.newSubmissions || 0,
    incremental: Boolean(cache?.syncMeta?.incremental),
    reusedProblemset: Boolean(cache?.syncMeta?.reusedProblemset),
    ratingHistoryCount: cache?.ratingHistory?.length || 0,
    contestReplayCount:
      (await readJson("contest-replay.json", null))?.contests?.length || 0,
    settings: study.settings,
    backups,
    backupDirectory: backupDirectory(),
    activity: Array.isArray(activity) ? activity.slice(0, 20) : [],
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: "#07111f",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    frame: false,
    titleBarStyle: "hidden",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createStudyPlanWindow() {
  if (studyPlanWindow && !studyPlanWindow.isDestroyed()) {
    studyPlanWindow.show();
    studyPlanWindow.focus();
    return studyPlanWindow;
  }
  const mainBounds = mainWindow?.getBounds();
  studyPlanWindow = new BrowserWindow({
    width: 480,
    height: 580,
    minWidth: 360,
    minHeight: 320,
    x: mainBounds ? mainBounds.x + Math.max(40, mainBounds.width - 510) : undefined,
    y: mainBounds ? mainBounds.y + 82 : undefined,
    title: "CF Compass · 待做题单",
    backgroundColor: "#071825",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    show: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  studyPlanWindow.setMenuBarVisibility(false);
  studyPlanWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  studyPlanWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const target = new URL(devUrl);
    target.searchParams.set("studyPlanWindow", "1");
    studyPlanWindow.loadURL(target.toString());
  } else {
    studyPlanWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), { query: { studyPlanWindow: "1" } });
  }
  studyPlanWindow.once("ready-to-show", () => studyPlanWindow?.show());
  studyPlanWindow.on("closed", () => { studyPlanWindow = null; });
  return studyPlanWindow;
}

function trustedRendererUrl() {
  return (
    process.env.VITE_DEV_SERVER_URL ||
    pathToFileURL(path.join(__dirname, "..", "dist", "index.html")).toString()
  );
}

function isTrustedRendererUrl(candidate) {
  try {
    const expected = new URL(trustedRendererUrl());
    const actual = new URL(candidate);
    if (expected.protocol === "file:") {
      return actual.protocol === "file:" && actual.pathname === expected.pathname;
    }
    return actual.origin === expected.origin;
  } catch {
    return false;
  }
}

function assertTrustedIpcEvent(event) {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || "";
  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error("已拒绝来自非受信页面的应用请求");
  }
}

function handleTrusted(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpcEvent(event);
    return listener(event, ...args);
  });
}

function onTrusted(channel, listener) {
  ipcMain.on(channel, (event, ...args) => {
    assertTrustedIpcEvent(event);
    return listener(event, ...args);
  });
}

app.whenReady().then(() => {
  protocol.handle("cf-material", async (request) => {
    const requestUrl = new URL(request.url);
    const candidate = safeMaterialRelativePath(
      decodeURIComponent(requestUrl.pathname).replace(/^\/+/, ""),
    );
    if (!candidate) return new Response("Not found", { status: 404 });
    const target = await materialLibraryService.resolveAsset(candidate, {
      preview: requestUrl.hostname === "preview",
    });
    if (!target) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(target).href);
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  handleTrusted("data:get-cache", () => readJson("cache.json", null));
  handleTrusted("data:sync", (_event, handle) => syncHandle(handle));
  handleTrusted("contests:get", async () => {
    const replay = await refreshContestReplayIndex();
    void startContestReplayAutoCalculation();
    return replay;
  });
  handleTrusted("contests:calculate", (_event, contestId, force = false) =>
    calculateContestReplay(contestId, force),
  );
  handleTrusted("contests:calculate-next", () => calculateNextContestReplay());
  handleTrusted("contests:virtual-reference", (_event, id) => calculateVirtualReference(id));
  handleTrusted("contest-center:get", (_event, force = false) =>
    loadContestCenter(force),
  );
  handleTrusted("contest-center:get-detail", (_event, contestId, force = false) =>
    loadContestCenterDetail(contestId, force),
  );
  handleTrusted("data:status", () => getDataCenterStatus());
  handleTrusted("codeforces:get-source-config", () => codeforcesSourceService.getConfig());
  handleTrusted("codeforces:set-source-config", (_event, config) =>
    codeforcesSourceService.setConfig(config),
  );
  handleTrusted("ai:get-config", () => aiService.getConfig());
  handleTrusted("ai:set-config", (_event, config) => aiService.setConfig(config));
  handleTrusted("ai:analyze-contest", (_event, contestId, options = {}) =>
    aiService.analyzeContest(contestId, options),
  );
  handleTrusted("ai:recommend-contest", (_event, contestId, options = {}) =>
    aiService.recommendContestProblems(contestId, options),
  );
  handleTrusted("data:export", (_event, snapshot) => exportData(snapshot));
  handleTrusted("data:import", () => importData());
  handleTrusted("data:open-backups", async () => {
    await fs.mkdir(backupDirectory(), { recursive: true });
    return shell.openPath(backupDirectory());
  });
  handleTrusted("favorites:get", () => readJson("favorites.json", []));
  handleTrusted("favorites:set", async (_event, favorites) => {
    const safe = sanitizeFavorites(favorites);
    await writeJson("favorites.json", safe);
    return safe;
  });
  handleTrusted("study:get", () => readStudyData());
  handleTrusted("study:set", async (_event, studyData) => {
    const safe = sanitizeStudyData(studyData);
    await writeJson("study.json", safe);
    scheduleAutomaticBackup("study-update");
    await broadcastStudyData(safe);
    return safe;
  });
  handleTrusted("study:note-set", async (_event, problemKeyValue, noteValue) => {
    const problemKey = String(problemKeyValue || "").trim().toUpperCase().slice(0, 80);
    if (!/^\d+-?[A-Z][A-Z0-9]*$/.test(problemKey)) throw new Error("题目标识无效");
    const current = await readStudyData();
    const safe = sanitizeStudyData({
      ...current,
      notes: { ...current.notes, [problemKey]: sanitizeProblemNote(noteValue) },
    });
    await writeJson("study.json", safe);
    scheduleAutomaticBackup("study-note-update");
    await broadcastStudyData(safe);
    return safe;
  });
  handleTrusted("plan:get", () => getStudyPlanService().getQueue());
  handleTrusted("plan:add", (_event, problemKey) => getStudyPlanService().addProblem(problemKey));
  handleTrusted("plan:status", (_event, itemId, status) => getStudyPlanService().setStatus(itemId, status));
  handleTrusted("plan:remove", (_event, itemId) => getStudyPlanService().remove(itemId));
  handleTrusted("plan:reorder", (_event, itemIds) => getStudyPlanService().reorder(itemIds));
  handleTrusted("plan:window-open", () => {
    createStudyPlanWindow();
    return { opened: true };
  });
  handleTrusted("appearance:get-wallpaper", () => wallpaperService.get());
  handleTrusted("appearance:get-local-library", () => materialLibraryService.get());
  handleTrusted("appearance:choose-wallpaper", () => wallpaperService.choose());
  handleTrusted("appearance:update-wallpaper-metadata", (_event, metadata) =>
    wallpaperService.updateMetadata(metadata),
  );
  handleTrusted("appearance:clear-wallpaper", () => wallpaperService.clear());
  handleTrusted("templates:get", () => scanTemplateLibrary(false));
  handleTrusted("templates:refresh", () => scanTemplateLibrary(true));
  handleTrusted("templates:choose-folder", () => chooseTemplateRoot());
  handleTrusted("templates:set-category", (_event, relativePath, categoryId) =>
    setTemplateCategory(relativePath, categoryId),
  );
  handleTrusted("templates:set-summary", (_event, relativePath, summary) =>
    setTemplateSummary(relativePath, summary),
  );
  handleTrusted("templates:open", (_event, filePath) => openTemplateFile(filePath));
  handleTrusted("shell:open-problem", async (_event, url) => {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.hostname !== "codeforces.com") {
      throw new Error("不安全的题目链接");
    }
    await shell.openExternal(target.toString());
  });
  onTrusted("window:minimize", () => mainWindow?.minimize());
  onTrusted("window:maximize", () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  onTrusted("window:close", () => mainWindow?.close());

  createWindow();
  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
