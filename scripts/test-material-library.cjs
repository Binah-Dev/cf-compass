const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createMaterialLibraryService } = require("../electron/services/material-library-service.cjs");

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-compass-materials-"));
  try {
    await fs.writeFile(path.join(root, "safe.webp"), "safe");
    await fs.writeFile(path.join(root, "broken.webp"), "broken");
    await fs.mkdir(path.join(root, "lobbies-hq"));
    await fs.writeFile(path.join(root, "lobbies-hq", "ch0058_01.webp"), "known broken");
    await fs.writeFile(path.join(root, "index.json"), JSON.stringify({
      defaultWallpaperId: "broken",
      wallpapers: [
        {
          id: "safe",
          name: "Complete lobby",
          url: "safe.webp",
          category: "student",
          width: 1920,
          height: 1080,
        },
        {
          id: "broken",
          name: "Extracted layer",
          url: "broken.webp",
          category: "student",
          wallpaperReady: false,
          qualityIssue: "layered-asset",
        },
        {
          id: "declared-layer",
          name: "Character sprite",
          url: "broken.webp",
          assetRole: "sprite",
        },
        {
          id: "known-broken-source",
          name: "Known extracted composition",
          url: "lobbies-hq/ch0058_01.webp",
        },
      ],
    }));

    const service = createMaterialLibraryService({
      resolveDirectory: () => root,
      toUrl: (value) => `full:${value}`,
      toPreviewUrl: (value) => `preview:${value}`,
    });
    const library = await service.get();
    assert.deepEqual(library.wallpapers.map((item) => item.id), ["safe"]);
    assert.equal(library.defaultWallpaperId, "safe");
    assert.equal(library.counts.total, 1);
    assert.equal(library.counts.student, 1);
    assert.deepEqual(library.rejectedWallpaperIds, [
      "broken",
      "declared-layer",
      "known-broken-source",
    ]);
    assert.equal(library.counts.rejected, 3);
    console.log("material library quarantine: ok");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
