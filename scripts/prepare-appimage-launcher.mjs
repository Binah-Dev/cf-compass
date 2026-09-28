import assert from "node:assert/strict";
import { chmod, lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// electron-builder 26.15.3 silently injects --no-sandbox if its unshare probe
// fails. Preserve the generated launcher, including its environment and argument
// handling, but leave Chromium responsible for enforcing its sandbox policy.
export function preserveAppImageSandbox(launcher) {
  const startMarker = "HAVE_NO_SANDBOX=0\n";
  const endMarker = "\natexit()\n";
  const start = launcher.indexOf(startMarker);
  const end = launcher.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start && launcher.indexOf(startMarker, start + 1) === -1, "Unexpected AppRun template: inspect the updated electron-builder launcher");
  const automaticFallback = launcher.slice(start, end);
  const statements = automaticFallback.split("\n").filter(line => line.trim() && !line.trimStart().startsWith("#")).join("\n");
  assert.equal(statements, [
    "HAVE_NO_SANDBOX=0",
    'for arg in "${args[@]}" ; do',
    '  if [ "$arg" = --no-sandbox ] ; then',
    "    HAVE_NO_SANDBOX=1",
    "    break",
    "  fi",
    "done",
    "NO_SANDBOX=()",
    "if [ $HAVE_NO_SANDBOX -eq 0 ] && ! unshare -Ur true 2>/dev/null ; then",
    "  NO_SANDBOX=(--no-sandbox)",
    "fi",
  ].join("\n"), "AppRun sandbox probe changed: review it before repacking");
  const result = `${launcher.slice(0, start)}# Preserve Chromium sandboxing even if a host restricts user namespaces.\nNO_SANDBOX=()\n${launcher.slice(end)}`;
  assert.ok(!/--(?:no-sandbox|disable-setuid-sandbox)(?:\s|[)"']|$)/m.test(result), "AppRun still contains a sandbox-disabling argument");
  return result;
}

export async function prepareAppImageLauncher(appdir) {
  const launcherPath = path.join(appdir, "AppRun");
  assert.ok((await lstat(launcherPath)).isFile(), "AppRun must be a regular generated script");
  const launcher = preserveAppImageSandbox(await readFile(launcherPath, "utf8"));
  const desktop = await readFile(path.join(appdir, "cf-compass.desktop"), "utf8");
  assert.ok(/^Exec=AppRun(?:\s|$)/m.test(desktop), "Unexpected desktop entry launcher");
  assert.ok(!/--(?:no-sandbox|disable-setuid-sandbox)(?:\s|=|$)/m.test(desktop), "Desktop entry disables sandboxing: set appImage.executableArgs to []");
  await writeFile(launcherPath, launcher);
  await chmod(launcherPath, 0o755);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareAppImageLauncher(path.resolve(process.argv[2]))
    .then(() => console.log("AppRun and desktop entry preserve Chromium sandboxing"))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
