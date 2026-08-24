const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { _electron: electron } = require("playwright-core");

function readArguments(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 2) {
    result[values[index]?.replace(/^--/, "")] = values[index + 1];
  }
  return result;
}

const args = readArguments(process.argv.slice(2));
const baseline = path.resolve(args.baseline || "");
const candidate = path.resolve(args.candidate || "");
const sourceProfile = path.resolve(args.profile || "");
const runs = Math.max(1, Math.min(7, Number(args.runs) || 3));

if (!baseline || !candidate || !sourceProfile) {
  throw new Error("需要 --baseline、--candidate 与 --profile 参数");
}

const profileFiles = [
  "cache.json",
  "study.json",
  "favorites.json",
  "activity.json",
  "contest-replay.json",
  "contest-center.json",
];

async function prepareProfile(target) {
  await fs.mkdir(target, { recursive: true });
  for (const filename of profileFiles) {
    const source = path.join(sourceProfile, filename);
    await fs.copyFile(source, path.join(target, filename)).catch(() => undefined);
  }
}

async function measure(executablePath, label, run) {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), `cf-compass-${label}-${run}-`));
  await prepareProfile(userData);
  const startedAt = performance.now();
  const app = await electron.launch({
    executablePath,
    env: { ...process.env, CF_COMPASS_USER_DATA: userData },
  });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector(".app-shell", { timeout: 30000 });
    return performance.now() - startedAt;
  } finally {
    await app.close();
    await fs.rm(userData, { recursive: true, force: true });
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const baselineSamples = [];
  const candidateSamples = [];
  // Alternate versions to reduce cache, antivirus, and thermal bias between groups.
  for (let run = 1; run <= runs; run += 1) {
    const order = run % 2
      ? [[baseline, "baseline", baselineSamples], [candidate, "candidate", candidateSamples]]
      : [[candidate, "candidate", candidateSamples], [baseline, "baseline", baselineSamples]];
    for (const [executablePath, label, samples] of order) {
      samples.push(await measure(executablePath, label, run));
    }
  }
  const baselineMedian = median(baselineSamples);
  const candidateMedian = median(candidateSamples);

  console.log(JSON.stringify({
    runs,
    baseline: {
      executablePath: baseline,
      samplesMs: baselineSamples.map((value) => Number(value.toFixed(2))),
      medianMs: Number(baselineMedian.toFixed(2)),
    },
    candidate: {
      executablePath: candidate,
      samplesMs: candidateSamples.map((value) => Number(value.toFixed(2))),
      medianMs: Number(candidateMedian.toFixed(2)),
    },
    medianChangePercent: Number((((candidateMedian / baselineMedian) - 1) * 100).toFixed(2)),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
