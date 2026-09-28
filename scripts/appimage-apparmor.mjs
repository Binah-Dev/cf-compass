import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// AppArmor attachments are path rules, not checks of a file's identity. The
// installation guide therefore uses a fixed, administrator-owned AppImage.
export function makeAppImageProfile(appImagePath) {
  if (typeof appImagePath !== "string" || !path.posix.isAbsolute(appImagePath)) {
    throw new Error("The AppImage path must be an absolute Linux path.");
  }
  if (/[\\*?\[\]{}'"]/u.test(appImagePath) || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(appImagePath)) {
    throw new Error("The AppImage path must not contain glob characters, quotes, backslashes, or control characters.");
  }
  if (appImagePath.endsWith("/") || path.posix.normalize(appImagePath) !== appImagePath) {
    throw new Error("The AppImage path must be an exact normalized file path without dot segments or repeated separators.");
  }
  const filename = path.posix.basename(appImagePath);
  if (!filename.endsWith(".AppImage") || filename === ".AppImage") {
    throw new Error("The AppImage path must name a file ending in .AppImage.");
  }
  return `# CF Compass: application-specific user namespace permission.
# This is an authorization exception, not full AppArmor confinement.
abi <abi/4.0>,
include <tunables/global>

profile cf-compass-appimage "${appImagePath}" flags=(unconfined) {
  userns,
}
`;
}

async function main(args) {
  if (args.length !== 2) {
    throw new Error("Usage: node scripts/appimage-apparmor.mjs /absolute/path/CF-Compass.AppImage output-profile");
  }
  const [appImagePath, outputFile] = args;
  const profile = makeAppImageProfile(appImagePath);
  // Refuse to replace existing files, including administrator-managed policy.
  // Generating this file does not install it or load it into the kernel.
  await writeFile(outputFile, profile, { encoding: "utf8", flag: "wx", mode: 0o644 });
  console.log(`Generated AppArmor profile: ${path.resolve(outputFile)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
