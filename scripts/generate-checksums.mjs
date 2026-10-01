import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve(process.argv[2] || "release");
const manifestArg = process.argv.find((argument) => argument.startsWith("--manifest="));
const manifestPath = manifestArg ? path.resolve(manifestArg.slice("--manifest=".length)) : null;
if (process.argv.includes("--manifest")) {
  throw new Error("Pass an explicit private output path with --manifest=<path>.");
}
if (manifestPath && (manifestPath === outputDirectory || manifestPath.startsWith(`${outputDirectory}${path.sep}`))) {
  throw new Error("The verification manifest must stay outside the published release assets directory.");
}
const packagePattern = /(?:\.(?:exe(?:\.blockmap)?|AppImage(?:\.zsync)?|deb|dmg)|^latest\.yml)$/;
const names = (await readdir(outputDirectory))
  .filter((name) => packagePattern.test(name))
  .sort((left, right) => left.localeCompare(right));

if (!names.length) {
  throw new Error(`No release packages found in ${outputDirectory}`);
}

const lines = [];
for (const name of names) {
  const bytes = await readFile(path.join(outputDirectory, name));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const line = `${hash}  ${name}`;
  lines.push(line);
}

if (manifestPath) {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${lines.join("\n")}\n`, "ascii");
}

console.log(lines.join("\n"));
