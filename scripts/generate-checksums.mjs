import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve(process.argv[2] || "release");
const writeManifest = process.argv.includes("--manifest");
const packagePattern = /\.(?:exe|AppImage|deb|dmg)$/;
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
  await writeFile(path.join(outputDirectory, `${name}.sha256`), `${line}\n`, "ascii");
}

if (writeManifest) {
  await writeFile(path.join(outputDirectory, "SHA256SUMS.txt"), `${lines.join("\n")}\n`, "ascii");
}

console.log(lines.join("\n"));
