const fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output', `v41-verification-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const units = ['test-template-summary-format.mjs', 'test-carrot.mjs', 'test-analytics.mjs', 'test-ai-service.cjs', 'test-contest-recommendations.cjs', 'test-codeforces-source-service.cjs', 'test-study-plan-service.cjs', 'test-material-library.cjs', 'test-performance.mjs', 'test-contest-sessions.cjs', 'test-virtual-reference.cjs', 'test-workbench-layout.mjs', 'test-frame-queue.mjs'];
const ui = ['qa-issue-25-virtual.cjs', 'qa-workbench-layout.cjs', 'benchmark-interactions.cjs', 'qa-material-quarantine.cjs', 'qa-template-summary-persistence.cjs', 'qa-study-plan.cjs', 'qa-issue-13-layout.cjs', 'qa-typography.cjs'];
const results = [];
for (const file of process.argv.includes('--ui') ? ui : units) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(root, 'scripts', file)], { cwd: root, encoding: 'utf8', timeout: 180000 });
  fs.writeFileSync(path.join(output, `${file}.txt`), `${run.stdout || ''}\n${run.stderr || ''}\n${run.error?.message || ''}`);
  const result = { file, passed: run.status === 0, durationMs: Date.now() - started };
  results.push(result); console.log(JSON.stringify(result));
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ results }, null, 2));
  if (!result.passed) { console.error((run.stderr || run.stdout || run.error?.message || '').slice(-2500)); process.exitCode = 1; }
}
console.log(output);
