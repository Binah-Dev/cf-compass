const CODEFORCES_HANDLE_PATTERN = /^[a-zA-Z0-9_.-]{3,24}$/;

function normalizeRemoteAvatar(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (url.protocol === "http:") url.protocol = "https:";
    return url.toString();
  } catch {
    return "";
  }
}

export function codeforcesAvatarSources(user) {
  const handle = String(user?.handle || "").trim();
  const sources = [];

  if (CODEFORCES_HANDLE_PATTERN.test(handle)) {
    sources.push(
      `https://codeforces.com/userphoto/avatar/${encodeURIComponent(handle)}/photo.jpg`,
    );
  }

  const apiAvatar = normalizeRemoteAvatar(user?.avatar);
  if (apiAvatar && !sources.includes(apiAvatar)) sources.push(apiAvatar);
  return sources;
}
