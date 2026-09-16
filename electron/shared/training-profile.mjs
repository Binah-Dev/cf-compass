// Shared by the renderer and the main-process persistence boundary.
export const normalizeHandle = (value) => String(value || "").trim().toLowerCase();
const clampRating = (value) => Math.max(800, Math.min(3500, Math.round(value)));
const uniqueStrings = (values, pattern, limit) => [...new Set(
  (Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && pattern.test(value)),
)].sort().slice(0, limit);

export function normalizeTrainingProfile(value) {
  const source = value && typeof value === "object" ? value : {};
  const manual = Number(source.manualRating);
  return {
    ratingMode: source.ratingMode === "manual" ? "manual" : "auto",
    displayRatingMode: source.displayRatingMode === "estimated" ? "estimated" : "official",
    manualRating: Number.isFinite(manual) && manual >= 800 && manual <= 3500 ? Math.round(manual) : 1200,
    useVirtual: source.useVirtual === true,
    virtualSessionIds: uniqueStrings(source.virtualSessionIds, /^\d+:virtual:\d+$/, 100),
    weakTagsMode: source.weakTagsMode === "manual" ? "manual" : "auto",
    weakTags: uniqueStrings((Array.isArray(source.weakTags) ? source.weakTags : [])
      .map((tag) => typeof tag === "string" ? tag.trim().toLowerCase().replaceAll(" ", "_") : tag), /^[a-z0-9_*+-]{1,80}$/, 40),
  };
}

export function normalizeTrainingProfiles(value) {
  const result = {};
  for (const [key, profile] of Object.entries(value && typeof value === "object" && !Array.isArray(value) ? value : {}).slice(0, 100)) {
    const handle = normalizeHandle(key);
    if (!/^[a-z0-9_.-]{1,40}$/.test(handle) || ["__proto__", "constructor", "prototype"].includes(handle)) continue;
    result[handle] = normalizeTrainingProfile(profile);
  }
  return result;
}

export function getTrainingProfile(user, study = {}) {
  return normalizeTrainingProfile(study.trainingProfiles?.[normalizeHandle(user?.handle)]);
}

export function getVirtualTrainingSessions(replay, handle) {
  if (!normalizeHandle(handle) || normalizeHandle(replay?.handle) !== normalizeHandle(handle)) return [];
  const seen = new Set();
  return (Array.isArray(replay?.contests) ? replay.contests : []).filter((entry) => {
    const ref = entry.virtualReference;
    const id = entry.replayId;
    const valid = entry.participationType === "VIRTUAL" && /^\d+:virtual:\d+$/.test(id || "") &&
      ref?.status === "ready" && typeof ref.performance === "number" && Number.isFinite(ref.performance) &&
      !ref.boundary && !ref.practicedBefore && Boolean(entry.submissionFingerprint) &&
      ref.submissionFingerprint === entry.submissionFingerprint && !seen.has(id);
    if (valid) seen.add(id);
    return valid;
  }).map((entry) => ({
    id: entry.replayId, name: String(entry.contestName || entry.contestId),
    start: Number(entry.sessionStartTimeSeconds) || 0,
    performance: entry.virtualReference.performance,
  })).sort((a, b) => b.start - a.start || a.id.localeCompare(b.id));
}

export function resolveTrainingRating(user, study = {}) {
  if (user?.ratingMode === "estimated" && Number.isFinite(user.rating)) return { rating: clampRating(user.rating), source: "estimated", selected: [] };
  const profile = getTrainingProfile(user, study);
  const official = Number(user?.rating);
  const hasOfficial = Number.isFinite(official) && official > 0;
  if (profile.ratingMode === "manual") return { rating: profile.manualRating, source: "manual", selected: [] };
  return { rating: clampRating(hasOfficial ? official : 1200), source: hasOfficial ? "official" : "fallback", selected: [] };
}

export function trainingContextKey(user, study = {}) {
  const resolved = resolveTrainingRating(user, study);
  return JSON.stringify([normalizeHandle(user?.handle), getTrainingProfile(user, study), resolved.rating,
    resolved.source, resolved.selected.map(({ id, performance }) => [id, performance]).sort()]);
}
