const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { _electron: electron } = require("playwright-core");

const projectRoot = path.resolve(__dirname, "..");
const source = process.env.CF_COMPASS_QA_WALLPAPER_SOURCE
  ? path.resolve(process.env.CF_COMPASS_QA_WALLPAPER_SOURCE)
  : "";
const previewSource = process.env.CF_COMPASS_QA_WALLPAPER_PREVIEW
  ? path.resolve(process.env.CF_COMPASS_QA_WALLPAPER_PREVIEW)
  : "";
const outputRoot = path.join(projectRoot, ".qa-output", "wallpaper-engine");
const userDataRoot = path.join(outputRoot, `user-data-${Date.now()}`);
const executablePath = process.env.CF_COMPASS_QA_EXECUTABLE
  ? path.resolve(process.env.CF_COMPASS_QA_EXECUTABLE)
  : path.join(projectRoot, "node_modules", "electron", "dist", "electron.exe");

fs.mkdirSync(userDataRoot, { recursive: true });
fs.mkdirSync(outputRoot, { recursive: true });
const extension = path.extname(source).toLowerCase() || ".png";
const filename = `custom-wallpaper${extension === ".jpeg" ? ".jpg" : extension}`;
const previewFilename = previewSource
  ? `custom-wallpaper-preview${path.extname(previewSource).toLowerCase() || ".jpg"}`
  : "custom-wallpaper-preview.png";

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function createWideTestPng(width, height, color) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  row[0] = 0;
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = Math.min(255, color[0] + Math.round((x / width) * 24));
    row[2 + x * 3] = color[1];
    row[3 + x * 3] = color[2];
  }
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(pixels, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

if (source) {
  fs.copyFileSync(source, path.join(userDataRoot, filename));
} else {
  fs.writeFileSync(
    path.join(userDataRoot, filename),
    createWideTestPng(1920, 1080, [42, 112, 184]),
  );
}
if (previewSource) {
  fs.copyFileSync(previewSource, path.join(userDataRoot, previewFilename));
} else {
  fs.writeFileSync(
    path.join(userDataRoot, previewFilename),
    createWideTestPng(1280, 720, [24, 74, 128]),
  );
}
fs.writeFileSync(
  path.join(userDataRoot, "custom-wallpaper.json"),
  JSON.stringify({
    filename,
    previewFilename,
    name: source ? path.basename(source) : "generated-16x9-wallpaper.png",
    mediaType: "image",
    updatedAt: new Date().toISOString(),
  }),
);
fs.writeFileSync(
  path.join(userDataRoot, "study.json"),
  JSON.stringify({
    version: 1,
    notes: {},
    reviews: {},
    contestQueue: [],
    plan: null,
    settings: {
      language: "zh-CN",
      themeVersion: 7,
      wallpaperEnabled: true,
      wallpaperId: "custom",
      wallpaperFit: "smart",
      wallpaperOpacity: 100,
      wallpaperClarity: 100,
      wallpaperBrightness: 100,
      wallpaperScale: 100,
      wallpaperPosition: "center center",
      panelOpacity: 72,
      reduceMotion: true,
    },
  }),
);

let app;
(async () => {
  const errors = [];
  app = await electron.launch({
    executablePath,
    args: process.env.CF_COMPASS_QA_EXECUTABLE ? [] : [projectRoot],
    cwd: projectRoot,
    env: { ...process.env, CF_COMPASS_USER_DATA: userDataRoot },
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForSelector(".app-wallpaper--image.is-visible");
  await page.waitForFunction(() => document.querySelector(".app-wallpaper--image")?.naturalWidth > 0);

  const readFit = () => page.evaluate(() => {
    const shell = document.querySelector(".app-shell");
    const image = document.querySelector(".app-wallpaper--image");
    const backdrop = document.querySelector(".app-wallpaper--backdrop");
    const imageStyle = getComputedStyle(image);
    const backdropStyle = getComputedStyle(backdrop);
    return {
      shellClass: shell.className,
      imageFit: imageStyle.objectFit,
      imageBackground: imageStyle.backgroundColor,
      backdropFit: backdropStyle.objectFit,
      backdropOpacity: Number(backdropStyle.opacity),
      naturalSize: [image.naturalWidth, image.naturalHeight],
      imageSource: image.currentSrc,
      backdropSource: backdrop.currentSrc,
    };
  });

  await page.waitForFunction(() =>
    document.querySelector(".app-wallpaper--image")?.dataset.smartFit === "cover",
  );
  const smart = await readFit();
  if (smart.imageFit !== "cover" || smart.backdropFit !== "cover" || smart.backdropOpacity <= 0) {
    throw new Error(`智能填充样式异常：${JSON.stringify(smart)}`);
  }
  if (smart.imageBackground !== "rgba(0, 0, 0, 0)") {
    throw new Error(`智能填充前景仍在制造黑边：${smart.imageBackground}`);
  }
  if (smart.imageSource === smart.backdropSource) {
    throw new Error("高清原图与轻量预览仍指向同一资源");
  }

  await page.getByRole("button", { name: "外观设置", exact: true }).click();
  await page.waitForSelector(".appearance-drawer");
  await page.getByRole("button", { name: /全屏裁切/ }).click();
  const cover = await readFit();
  if (cover.imageFit !== "cover" || cover.backdropOpacity !== 0) {
    throw new Error(`全屏裁切样式异常：${JSON.stringify(cover)}`);
  }
  await page.getByRole("button", { name: /完整显示/ }).click();
  const contain = await readFit();
  if (contain.imageFit !== "contain" || contain.backdropOpacity !== 0) {
    throw new Error(`完整显示样式异常：${JSON.stringify(contain)}`);
  }
  await page.getByRole("button", { name: /智能填充/ }).click();
  await page.screenshot({
    path: path.join(outputRoot, "appearance-drawer.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "关闭外观设置", exact: true }).click();
  const normalGeometry = await page.evaluate(() => {
    const image = document.querySelector(".app-wallpaper--image").getBoundingClientRect();
    const backdrop = document.querySelector(".app-wallpaper--backdrop").getBoundingClientRect();
    return {
      image: [image.x, image.y, image.width, image.height],
      backdrop: [backdrop.x, backdrop.y, backdrop.width, backdrop.height],
    };
  });
  await page.getByRole("button", { name: "沉浸大厅", exact: true }).click();
  await page.waitForSelector(".app-shell.is-immersive");
  await page.waitForTimeout(500);
  const immersive = await page.evaluate(() => {
    const image = document.querySelector(".app-wallpaper--image").getBoundingClientRect();
    const backdrop = document.querySelector(".app-wallpaper--backdrop").getBoundingClientRect();
    return {
      viewport: [window.innerWidth, window.innerHeight],
      image: [image.x, image.y, image.width, image.height],
      backdrop: [backdrop.x, backdrop.y, backdrop.width, backdrop.height],
    };
  });
  const backdropRight = immersive.backdrop[0] + immersive.backdrop[2];
  const backdropBottom = immersive.backdrop[1] + immersive.backdrop[3];
  if (
    immersive.backdrop[0] > 0 ||
    immersive.backdrop[1] > 34 ||
    backdropRight < immersive.viewport[0] ||
    backdropBottom < immersive.viewport[1]
  ) {
    throw new Error(`沉浸模式未覆盖完整宽度：${JSON.stringify(immersive)}`);
  }
  const geometryShift = [...normalGeometry.image, ...normalGeometry.backdrop]
    .map((value, index) => Math.abs(value - [...immersive.image, ...immersive.backdrop][index]));
  if (Math.max(...geometryShift) > 0.25) {
    throw new Error(`沉浸模式切换导致壁纸位移：${JSON.stringify({ normalGeometry, immersive, geometryShift })}`);
  }
  await page.screenshot({
    path: path.join(outputRoot, "smart-fill-immersive.png"),
    fullPage: true,
  });

  const videoBytes = await page.evaluate(async () => {
    const mimeType = ["video/webm;codecs=vp8", "video/webm"].find((value) =>
      MediaRecorder.isTypeSupported(value),
    );
    if (!mimeType) throw new Error("当前 Electron 不支持 WebM MediaRecorder");
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d");
    const stream = canvas.captureStream(12);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 240000 });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const completed = new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    recorder.start();
    for (let frame = 0; frame < 12; frame += 1) {
      context.fillStyle = frame % 2 ? "#4fc3f7" : "#8e7dff";
      context.fillRect(0, 0, 320, 180);
      context.fillStyle = "white";
      context.beginPath();
      context.arc(28 + frame * 22, 90, 18, 0, Math.PI * 2);
      context.fill();
      await new Promise((resolve) => setTimeout(resolve, 84));
    }
    recorder.stop();
    await completed;
    const bytes = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer());
    return Array.from(bytes);
  });
  const videoFilename = "custom-wallpaper.webm";
  fs.writeFileSync(path.join(userDataRoot, videoFilename), Buffer.from(videoBytes));
  fs.writeFileSync(
    path.join(userDataRoot, "custom-wallpaper.json"),
    JSON.stringify({
      filename: videoFilename,
      name: "generated-wallpaper-engine-test.webm",
      mediaType: "video",
      byteSize: videoBytes.length,
      updatedAt: new Date().toISOString(),
    }),
  );
  fs.writeFileSync(
    path.join(userDataRoot, "study.json"),
    JSON.stringify({
      version: 1,
      notes: {},
      reviews: {},
      contestQueue: [],
      plan: null,
      settings: {
        language: "zh-CN",
        themeVersion: 7,
        wallpaperEnabled: true,
        wallpaperId: "custom",
        wallpaperFit: "smart",
        wallpaperVideoPlaybackRate: 80,
        pauseWallpaperWhenUnfocused: false,
        wallpaperOpacity: 100,
        wallpaperClarity: 100,
        wallpaperBrightness: 100,
        wallpaperScale: 100,
        wallpaperPosition: "center center",
        panelOpacity: 72,
        reduceMotion: false,
      },
    }),
  );
  await page.reload();
  await page.waitForSelector(".app-wallpaper--video.is-visible");
  await page.waitForFunction(() => {
    const video = document.querySelector(".app-wallpaper--video");
    return video?.videoWidth === 320 && video?.videoHeight === 180 && video.currentTime > 0.08;
  });
  const video = await page.evaluate(() => {
    const element = document.querySelector(".app-wallpaper--video");
    const style = getComputedStyle(element);
    return {
      size: [element.videoWidth, element.videoHeight],
      duration: element.duration,
      currentTime: element.currentTime,
      playbackRate: element.playbackRate,
      muted: element.muted,
      objectFit: style.objectFit,
      paused: element.paused,
    };
  });
  if (
    video.objectFit !== "cover" ||
    video.playbackRate !== 0.8 ||
    !video.muted ||
    video.paused
  ) {
    throw new Error(`动态大厅运行状态异常：${JSON.stringify(video)}`);
  }
  await page.waitForTimeout(250);
  const videoMetadata = JSON.parse(
    fs.readFileSync(path.join(userDataRoot, "custom-wallpaper.json"), "utf8"),
  );
  if (videoMetadata.width !== 320 || videoMetadata.height !== 180 || videoMetadata.duration <= 0) {
    throw new Error(`动态大厅元数据未正确回写：${JSON.stringify(videoMetadata)}`);
  }

  const reducedMotionStudyPath = path.join(userDataRoot, "study.json");
  const reducedMotionStudy = JSON.parse(fs.readFileSync(reducedMotionStudyPath, "utf8"));
  reducedMotionStudy.settings.reduceMotion = true;
  fs.writeFileSync(reducedMotionStudyPath, JSON.stringify(reducedMotionStudy));
  await page.reload();
  await page.waitForSelector(".app-wallpaper--video.is-visible");
  await page.waitForTimeout(300);
  const reducedMotionPaused = await page.evaluate(() =>
    document.querySelector(".app-wallpaper--video")?.paused,
  );
  if (!reducedMotionPaused) throw new Error("减少动态效果开启后，动态大厅仍在播放");

  console.log(JSON.stringify({
    errors,
    smart,
    cover,
    contain,
    immersive,
    normalGeometry,
    video,
    videoMetadata,
    reducedMotionPaused,
  }, null, 2));
  if (errors.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (app) await app.close();
});
