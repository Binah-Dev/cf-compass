const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// Background formats live in one table so future additions only need one edit.
const WALLPAPER_FORMATS = [
  {
    extensions: [".png", ".jpg", ".jpeg", ".webp"],
    mediaType: "image",
    maximumBytes: 160 * 1024 * 1024,
  },
  {
    extensions: [".mp4", ".webm"],
    mediaType: "video",
    maximumBytes: 2 * 1024 * 1024 * 1024,
  },
];

const SUPPORTED_EXTENSIONS = new Set(
  WALLPAPER_FORMATS.flatMap((format) => format.extensions),
);
const MANAGED_FILENAMES = [...new Set(
  [...SUPPORTED_EXTENSIONS].map((extension) =>
    `custom-wallpaper${extension === ".jpeg" ? ".jpg" : extension}`,
  ),
)];

function formatFor(extension) {
  return WALLPAPER_FORMATS.find((format) => format.extensions.includes(extension));
}

function createWallpaperService({
  dialog,
  nativeImage,
  resolveDataPath,
  getWindow,
  getUiLanguage,
  readJsonPath,
  writeJsonPath,
}) {
  const metaPath = () => resolveDataPath("custom-wallpaper.json");
  const previewPath = () => resolveDataPath("custom-wallpaper-preview.jpg");

  function sanitizeMetadataPatch(patch) {
    const source = patch && typeof patch === "object" ? patch : {};
    const width = Math.round(Number(source.width) || 0);
    const height = Math.round(Number(source.height) || 0);
    const duration = Number(source.duration) || 0;
    return {
      ...(width > 0 && width <= 32768 ? { width } : {}),
      ...(height > 0 && height <= 32768 ? { height } : {}),
      ...(duration > 0 && duration <= 24 * 60 * 60 ? { duration } : {}),
    };
  }

  async function createImagePreview(source, english) {
    const image = nativeImage?.createFromPath(source);
    if (!image || image.isEmpty()) {
      throw new Error(english
        ? "This image could not be decoded. Please check whether the file is complete."
        : "无法解析这张图片，请检查文件是否完整");
    }
    const { width, height } = image.getSize();
    const preview = Math.max(width, height) > 1280
      ? image.resize(
        width >= height ? { width: 1280, quality: "good" } : { height: 1280, quality: "good" },
      )
      : image;
    await fs.writeFile(previewPath(), preview.toJPEG(82));
    return { width, height, previewFilename: path.basename(previewPath()) };
  }

  async function get() {
    const meta = await readJsonPath(metaPath(), null);
    if (!meta?.filename) return null;
    const safeName = path.basename(String(meta.filename));
    const extension = path.extname(safeName).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) return null;
    const target = resolveDataPath(safeName);
    try {
      const stats = await fs.stat(target);
      if (!stats.isFile()) return null;
      const safePreviewName = meta.previewFilename
        ? path.basename(String(meta.previewFilename))
        : "";
      const previewExists = safePreviewName
        ? await fs.access(resolveDataPath(safePreviewName)).then(() => true).catch(() => false)
        : false;
      const metadata = sanitizeMetadataPatch(meta);
      return {
        url: pathToFileURL(target).href,
        ...(previewExists
          ? { previewUrl: pathToFileURL(resolveDataPath(safePreviewName)).href }
          : {}),
        name: String(meta.name || safeName).slice(0, 160),
        mediaType: formatFor(extension)?.mediaType || "image",
        byteSize: Math.max(0, Number(meta.byteSize) || stats.size),
        ...metadata,
        ...(metadata.width && metadata.height
          ? { resolution: `${metadata.width} × ${metadata.height}` }
          : {}),
      };
    } catch {
      return null;
    }
  }

  async function choose() {
    const english = (await getUiLanguage()) === "en-US";
    const result = await dialog.showOpenDialog(getWindow(), {
      title: english ? "Choose Background Asset" : "选择背景图片",
      properties: ["openFile"],
      filters: [{
        name: english ? "Lobby Assets" : "记忆大厅素材",
        extensions: [...SUPPORTED_EXTENSIONS].map((extension) => extension.slice(1)),
      }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    const source = result.filePaths[0];
    const extension = path.extname(source).toLowerCase();
    const format = formatFor(extension);
    if (!format) {
      throw new Error(english
        ? "Supported formats: PNG, JPG, WebP, MP4, and WebM."
        : "支持 PNG、JPG、WebP、MP4 和 WebM");
    }
    const stats = await fs.stat(source);
    if (stats.size > format.maximumBytes) {
      throw new Error(format.mediaType === "video"
        ? (english ? "Dynamic lobby videos cannot exceed 2 GB." : "动态大厅不能超过 2 GB")
        : (english ? "Lobby images cannot exceed 160 MB." : "大厅图片不能超过 160 MB"));
    }

    const normalizedExtension = extension === ".jpeg" ? ".jpg" : extension;
    const filename = `custom-wallpaper${normalizedExtension}`;
    const target = resolveDataPath(filename);
    if (path.resolve(source) !== path.resolve(target)) await fs.copyFile(source, target);
    const metadata = format.mediaType === "image"
      ? await createImagePreview(target, english)
      : {};
    if (format.mediaType === "video") {
      await fs.rm(previewPath(), { force: true }).catch(() => undefined);
    }
    await writeJsonPath(metaPath(), {
      filename,
      name: path.basename(source),
      mediaType: format.mediaType,
      byteSize: stats.size,
      ...metadata,
      updatedAt: new Date().toISOString(),
    });
    await Promise.all(
      MANAGED_FILENAMES
        .filter((managedName) => managedName !== filename)
        .map((managedName) =>
          fs.rm(resolveDataPath(managedName), { force: true }).catch(() => undefined),
        ),
    );
    return { canceled: false, ...(await get()) };
  }

  async function updateMetadata(patch) {
    const meta = await readJsonPath(metaPath(), null);
    if (!meta?.filename) return null;
    await writeJsonPath(metaPath(), {
      ...meta,
      ...sanitizeMetadataPatch(patch),
      metadataUpdatedAt: new Date().toISOString(),
    });
    return get();
  }

  async function clear() {
    await Promise.all(
      MANAGED_FILENAMES.map((filename) =>
        fs.rm(resolveDataPath(filename), { force: true }).catch(() => undefined),
      ),
    );
    await fs.rm(previewPath(), { force: true }).catch(() => undefined);
    await fs.rm(metaPath(), { force: true }).catch(() => undefined);
    return { cleared: true };
  }

  return { get, choose, updateMetadata, clear };
}

module.exports = { WALLPAPER_FORMATS, createWallpaperService };
