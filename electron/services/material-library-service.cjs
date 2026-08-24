const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { materialRejectionReason } = require("./material-quality-policy.cjs");

const EMPTY_COUNTS = {
  curated: 0,
  student: 0,
  scenario: 0,
  custom: 0,
  rejected: 0,
  total: 0,
};

function safeMaterialRelativePath(value) {
  const normalized = String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) return "";
  return normalized.slice(0, 500);
}

function safeDimension(value) {
  const number = Math.round(Number(value) || 0);
  return number > 0 && number <= 32768 ? number : 0;
}

function createMaterialLibraryService({ resolveDirectory, toUrl, toPreviewUrl = toUrl, nativeImage }) {
  let cache = null;
  let cacheSignature = "";
  const pendingPreviews = new Map();

  function resolveSafeAsset(relativePath) {
    const candidate = safeMaterialRelativePath(relativePath);
    if (!candidate) return null;
    const root = path.resolve(resolveDirectory());
    const target = path.resolve(root, candidate);
    if (target === root || !target.startsWith(`${root}${path.sep}`)) return null;
    return { candidate, root, target };
  }

  async function createPreview(source, target) {
    const image = nativeImage?.createFromPath(source);
    if (!image || image.isEmpty()) return source;
    const { width, height } = image.getSize();
    const preview = Math.max(width, height) > 1280
      ? image.resize(
        width >= height ? { width: 1280, quality: "good" } : { height: 1280, quality: "good" },
      )
      : image;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, preview.toJPEG(82));
    return target;
  }

  async function resolveAsset(relativePath, { preview = false } = {}) {
    const resolved = resolveSafeAsset(relativePath);
    if (!resolved) return null;
    if (!preview) return resolved.target;
    const extension = path.extname(resolved.candidate).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) return resolved.target;
    const digest = createHash("sha256").update(resolved.candidate).digest("hex").slice(0, 24);
    const previewTarget = path.join(resolved.root, ".previews", `${digest}.jpg`);
    const sourceStats = await fs.stat(resolved.target).catch(() => null);
    if (!sourceStats?.isFile()) return null;
    const previewStats = await fs.stat(previewTarget).catch(() => null);
    if (previewStats?.isFile() && previewStats.mtimeMs >= sourceStats.mtimeMs) {
      return previewTarget;
    }
    if (!pendingPreviews.has(resolved.candidate)) {
      pendingPreviews.set(
        resolved.candidate,
        createPreview(resolved.target, previewTarget)
          .catch(() => resolved.target)
          .finally(() => pendingPreviews.delete(resolved.candidate)),
      );
    }
    return pendingPreviews.get(resolved.candidate);
  }

  async function get() {
    const manifestPath = path.join(resolveDirectory(), "index.json");
    let signature = "";
    let manifest;
    try {
      const stats = await fs.stat(manifestPath);
      signature = `${stats.size}:${stats.mtimeMs}`;
      if (cache && signature === cacheSignature) return cache;
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    } catch {
      cache = { wallpapers: [], counts: { ...EMPTY_COUNTS }, defaultWallpaperId: "" };
      cacheSignature = signature;
      return cache;
    }

    if (!manifest || !Array.isArray(manifest.wallpapers)) {
      cache = { wallpapers: [], counts: { ...EMPTY_COUNTS }, defaultWallpaperId: "" };
      cacheSignature = signature;
      return cache;
    }

    const rejectedWallpaperIds = [];
    const wallpapers = manifest.wallpapers.slice(0, 1000).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const id = String(item.id || "").slice(0, 80);
      const relativeUrl = safeMaterialRelativePath(item.url);
      const rejectionReason = materialRejectionReason(item, relativeUrl);
      if (rejectionReason) {
        if (id) rejectedWallpaperIds.push(id);
        return [];
      }
      const relativePreview = safeMaterialRelativePath(item.previewUrl || item.url);
      if (!id || !relativeUrl || !relativePreview) return [];
      const extension = path.extname(relativeUrl).toLowerCase();
      const width = safeDimension(item.width);
      const height = safeDimension(item.height);
      const mediaType = item.mediaType === "video" || [".mp4", ".webm"].includes(extension)
        ? "video"
        : "image";
      return [{
        id,
        name: String(item.name || id).slice(0, 160),
        url: toUrl(relativeUrl),
        previewUrl: mediaType === "image" && relativePreview === relativeUrl
          ? toPreviewUrl(relativeUrl)
          : toUrl(relativePreview),
        mediaType,
        tone: item.tone === "day" ? "day" : "night",
        credit: String(item.credit || "Local material library").slice(0, 160),
        category: ["curated", "student", "scenario", "custom"].includes(item.category)
          ? item.category
          : "custom",
        keywords: String(item.keywords || item.name || "").slice(0, 500),
        resolution: String(
          item.resolution || (width && height ? `${width} × ${height}` : ""),
        ).slice(0, 40),
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
      }];
    });
    const counts = wallpapers.reduce((result, item) => {
      result[item.category] = (result[item.category] || 0) + 1;
      result.total += 1;
      return result;
    }, { ...EMPTY_COUNTS });
    counts.rejected = rejectedWallpaperIds.length;
    const requestedDefault = String(manifest.defaultWallpaperId || "").slice(0, 80);
    cache = {
      wallpapers,
      counts,
      defaultWallpaperId: wallpapers.some((item) => item.id === requestedDefault)
        ? requestedDefault
        : wallpapers[0]?.id || "",
      rejectedWallpaperIds,
    };
    cacheSignature = signature;
    return cache;
  }

  function invalidate() {
    cache = null;
    cacheSignature = "";
  }

  return { get, invalidate, resolveAsset };
}

module.exports = { createMaterialLibraryService, safeMaterialRelativePath };
