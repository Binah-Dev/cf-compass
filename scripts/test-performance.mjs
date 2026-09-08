import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
const { createWallpaperService } = require("../electron/services/wallpaper-service.cjs");
const {
  createMaterialLibraryService,
  safeMaterialRelativePath,
} = require("../electron/services/material-library-service.cjs");

const vite = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true, watch: null },
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
});
const { getRecentActivity } = await vite.ssrLoadModule("/src/lib/stats.js");

function problemKey(problem) {
  return `${problem.contestId}-${problem.index}`;
}

function legacyRecentActivity(problems, submissions, limit = 5) {
  const lookup = new Map((problems || []).map((problem) => [problemKey(problem), problem]));
  const seen = new Set();
  const result = [];
  const sorted = [...(submissions || [])].sort(
    (a, b) => (b.creationTimeSeconds || 0) - (a.creationTimeSeconds || 0),
  );
  for (const submission of sorted) {
    if (submission.verdict !== "OK") continue;
    const key = `${submission.problem?.contestId || submission.contestId}-${submission.problem?.index}`;
    if (seen.has(key)) continue;
    const problem = lookup.get(key) || submission.problem;
    if (!problem) continue;
    seen.add(key);
    result.push({ problem, timestamp: submission.creationTimeSeconds });
    if (result.length >= limit) break;
  }
  return result;
}

const problems = Array.from({ length: 12000 }, (_, index) => ({
  contestId: 1000 + Math.floor(index / 20),
  index: String.fromCharCode(65 + (index % 20)),
  name: `Problem ${index}`,
}));
const submissions = Array.from({ length: 100000 }, (_, index) => {
  const problem = problems[(index * 7919) % problems.length];
  return {
    id: index + 1,
    verdict: index % 5 === 0 ? "WRONG_ANSWER" : "OK",
    creationTimeSeconds: 2_000_000_000 - ((index * 97) % 600_000),
    problem: { contestId: problem.contestId, index: problem.index },
  };
});
submissions.push({
  id: 100001,
  verdict: "OK",
  creationTimeSeconds: submissions[1].creationTimeSeconds,
  problem: submissions[1].problem,
});

for (const limit of [0, 1, 5, 25, 200]) {
  assert.deepEqual(
    getRecentActivity(problems, submissions, limit),
    legacyRecentActivity(problems, submissions, limit),
    `recent activity must preserve the legacy result for limit=${limit}`,
  );
}

const newestFirstSubmissions = [...submissions].sort(
  (a, b) => (b.creationTimeSeconds || 0) - (a.creationTimeSeconds || 0),
);
for (const limit of [0, 1, 5, 25, 200]) {
  assert.deepEqual(
    getRecentActivity(problems, newestFirstSubmissions, limit),
    legacyRecentActivity(problems, newestFirstSubmissions, limit),
    `newest-first fast path must preserve the legacy result for limit=${limit}`,
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function benchmark(callback, iterations = 5) {
  const samples = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    callback();
    samples.push(performance.now() - startedAt);
  }
  return median(samples);
}

const legacyMs = benchmark(() => legacyRecentActivity(problems, newestFirstSubmissions, 5));
const optimizedMs = benchmark(() => getRecentActivity(problems, newestFirstSubmissions, 5));

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cf-compass-wallpaper-"));
try {
  assert.equal(safeMaterialRelativePath("curated/lobby.png"), "curated/lobby.png");
  assert.equal(safeMaterialRelativePath("../private.txt"), "");
  const materialRoot = path.join(tempRoot, "material-library");
  await fs.mkdir(materialRoot, { recursive: true });
  await fs.writeFile(path.join(materialRoot, "index.json"), JSON.stringify({
    defaultWallpaperId: "safe",
    wallpapers: [
      { id: "safe", name: "Safe", url: "curated/lobby.png", previewUrl: "previews/lobby.jpg", width: 3840, height: 2160, category: "curated" },
      { id: "blocked", name: "Blocked", url: "../private.png" },
    ],
  }));
  const materialService = createMaterialLibraryService({
    resolveDirectory: () => materialRoot,
    toUrl: (relativePath) => `cf-material://library/${relativePath}`,
    toPreviewUrl: (relativePath) => `cf-material://preview/${relativePath}`,
    nativeImage: {
      createFromPath: () => ({
        isEmpty: () => false,
        getSize: () => ({ width: 3840, height: 2160 }),
        resize: ({ width }) => {
          assert.equal(width, 1280);
          return { toJPEG: () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]) };
        },
      }),
    },
  });
  const materialLibrary = await materialService.get();
  assert.equal(materialLibrary.wallpapers.length, 1);
  assert.equal(materialLibrary.wallpapers[0].resolution, "3840 × 2160");
  assert.equal(materialLibrary.wallpapers[0].previewUrl, "cf-material://library/previews/lobby.jpg");
  assert.equal(materialLibrary.defaultWallpaperId, "safe");
  assert.equal(await materialService.get(), materialLibrary, "unchanged manifests must reuse the parsed cache");
  await fs.mkdir(path.join(materialRoot, "curated"), { recursive: true });
  await fs.writeFile(path.join(materialRoot, "curated", "same-source.png"), Buffer.from([1, 2, 3]));
  const generatedLibraryPath = path.join(materialRoot, "index.json");
  await fs.writeFile(generatedLibraryPath, JSON.stringify({
    wallpapers: [{ id: "generated", url: "curated/same-source.png" }],
  }));
  materialService.invalidate();
  const generatedLibrary = await materialService.get();
  assert.equal(
    generatedLibrary.wallpapers[0].previewUrl,
    "cf-material://preview/curated/same-source.png",
  );
  const generatedPreview = await materialService.resolveAsset("curated/same-source.png", { preview: true });
  assert.equal(path.extname(generatedPreview), ".jpg");
  assert.equal((await fs.stat(generatedPreview)).size, 4);

  const sourcePath = path.join(tempRoot, "source.png");
  await fs.writeFile(sourcePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const readJsonPath = async (target, fallback) => {
    try {
      return JSON.parse(await fs.readFile(target, "utf8"));
    } catch {
      return fallback;
    }
  };
  const writeJsonPath = async (target, value) => {
    await fs.writeFile(target, JSON.stringify(value), "utf8");
  };
  const service = createWallpaperService({
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [sourcePath] }),
    },
    nativeImage: {
      createFromPath: () => ({
        isEmpty: () => false,
        getSize: () => ({ width: 7680, height: 4320 }),
        resize: ({ width }) => {
          assert.equal(width, 1280, "8K landscape previews must be bounded to 1280 px");
          return { toJPEG: () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]) };
        },
      }),
    },
    resolveDataPath: (filename) => path.join(tempRoot, filename),
    getWindow: () => null,
    getUiLanguage: async () => "zh-CN",
    readJsonPath,
    writeJsonPath,
  });
  const chosen = await service.choose();
  assert.equal(chosen.canceled, false);
  assert.equal(chosen.mediaType, "image");
  assert.equal(chosen.resolution, "7680 × 4320");
  assert.equal(chosen.previewUrl, pathToFileURL(path.join(tempRoot, "custom-wallpaper-preview.jpg")).href);
  assert.equal(chosen.url, pathToFileURL(path.join(tempRoot, "custom-wallpaper.png")).href);
  assert.equal("dataUrl" in chosen, false, "static backgrounds must not be copied into IPC as Base64");
  const updated = await service.updateMetadata({ width: 1920, height: 1080, duration: 12.5 });
  assert.equal(updated.resolution, "1920 × 1080");
  assert.equal(updated.duration, 12.5);
  assert.deepEqual(await service.clear(), { cleared: true });
  assert.equal(await service.get(), null);
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
  await vite.close();
}

console.log("performance and wallpaper regression checks passed");
console.log(JSON.stringify({
  submissions: submissions.length,
  inputOrder: "newest-first",
  legacyMs: Number(legacyMs.toFixed(2)),
  optimizedMs: Number(optimizedMs.toFixed(2)),
  speedup: Number((legacyMs / optimizedMs).toFixed(2)),
}));
