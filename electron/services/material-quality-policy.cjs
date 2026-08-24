// Material packs can contain character layers, transition fragments, or card crops
// alongside complete lobby backgrounds. Keep that source-specific knowledge here so
// the library reader stays generic and future packs can extend the policy cleanly.
const NON_WALLPAPER_ASSET_ROLES = new Set([
  "layer",
  "sprite",
  "thumbnail",
  "transition",
]);

const KNOWN_INCOMPLETE_ASSET_PATHS = new Set([
  "originals/custom-10000-role.webp",
  "originals/custom-10000-role2.webp",
  "lobbies-hq/ayane_01.webp",
  "lobbies-hq/ch0058_01.webp",
  "lobbies-hq/ch0086_01.webp",
  "lobbies-hq/ch0092_01.webp",
  "lobbies-hq/ch0100_01.webp",
  "lobbies-hq/ch0187_01.webp",
  "lobbies-hq/ch0190_01.webp",
  "lobbies-hq/ch0196_01.webp",
  "lobbies-hq/ch0198_01.webp",
  "lobbies-hq/ch0224_01.webp",
  "lobbies-hq/ch0233_01.webp",
  "lobbies-hq/ch0242_01.webp",
  "lobbies-hq/ch0250_01.webp",
  "lobbies-hq/ch0251_01.webp",
  "lobbies-hq/ch0281_01.webp",
  "lobbies-hq/ch0293_01.webp",
  "lobbies-hq/ch0294_01.webp",
  "lobbies-hq/ch0301_01.webp",
  "lobbies-hq/hoshino_01.webp",
  "lobbies-hq/hoshino_swimsuit_01.webp",
  "lobbies-hq/juri_01.webp",
]);

function materialRejectionReason(item, relativeUrl) {
  if (!item || typeof item !== "object") return "invalid-manifest-entry";
  if (item.wallpaperReady === false) {
    return String(item.qualityIssue || "manifest-rejected").slice(0, 80);
  }
  const role = String(item.assetRole || item.mediaRole || "").trim().toLowerCase();
  if (NON_WALLPAPER_ASSET_ROLES.has(role)) return `asset-role:${role}`;
  if (KNOWN_INCOMPLETE_ASSET_PATHS.has(relativeUrl)) {
    return "known-incomplete-layered-asset";
  }
  return "";
}

module.exports = {
  KNOWN_INCOMPLETE_ASSET_PATHS,
  NON_WALLPAPER_ASSET_ROLES,
  materialRejectionReason,
};
