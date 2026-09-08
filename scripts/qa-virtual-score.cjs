const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');
const { makeScoreFixture } = require('./fixtures/virtual-score.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/playwright', `virtual-score-${Date.now()}`);
const profile = path.join(output, 'user-data');
fs.mkdirSync(profile, { recursive: true });
const fixture = makeScoreFixture();
fixture.center.contests[0] = fixture.standings.contest;
fixture.center.details[1900].problems = fixture.standings.problems;
fixture.cache.problems = fixture.standings.problems;
for (const [file, data] of [['cache', fixture.cache], ['study', fixture.study], ['contest-center', fixture.center]]) fs.writeFileSync(path.join(profile, `${file}.json`), JSON.stringify(data));
let app, page;
const errors = [];
async function launch() {
  app = await electron.launch({ executablePath: process.env.CF_COMPASS_QA_EXECUTABLE || path.join(root, 'node_modules/electron/dist/electron.exe'), args: process.env.CF_COMPASS_QA_EXECUTABLE ? [] : [root], cwd: root, env: { ...process.env, CF_COMPASS_USER_DATA: profile } });
  await app.evaluate((_electron, fixture) => {
    globalThis.scoreRequests = []; globalThis.scoreOffline = false;
    globalThis.fetch = async input => {
      const u = new URL(String(input)); globalThis.scoreRequests.push(u.pathname);
      if (globalThis.scoreOffline) throw Error('fixture offline');
      let result;
      if (u.pathname.endsWith('contest.standings')) {
        if ([...u.searchParams.keys()].join(',') !== 'contestId') throw Error('Invalid standings parameters');
        result = fixture.standings;
      } else if (u.pathname.endsWith('contest.ratingChanges')) result = fixture.ratingChanges;
      else if (u.pathname.endsWith('contest.status')) result = fixture.cache.submissions;
      else throw Error('Unexpected request');
      return { ok: true, json: async () => ({ status: 'OK', result }) };
    };
  }, fixture);
  page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: '赛事复盘', exact: true }).click();
  await page.locator('.contest-participation-tabs').getByRole('button', { name: '虚拟参赛', exact: true }).click();
  const row = page.locator('.contest-record').first();
  if (await row.locator('.contest-record__row').getAttribute('aria-expanded') !== 'true') await row.locator('.contest-record__row').click();
  await row.locator('.contest-problem-row').first().waitFor();
}
(async () => {
  await launch();
  assert.deepEqual(await app.evaluate(() => globalThis.scoreRequests), []);
  await page.getByRole('button', { name: '计算估计分', exact: true }).click();
  await page.getByRole('button', { name: '重新估分', exact: true }).waitFor();
  const reference = JSON.parse(fs.readFileSync(path.join(profile, 'contest-replay.json'), 'utf8')).contests[0].virtualReference;
  assert.equal(reference.status, 'ready'); assert.equal(reference.points, 2); assert.equal(reference.penalty, 40);
  assert.equal(reference.method, 'carrot-virtual-reconstructed-v1');
  assert.match(await page.locator('.contest-virtual-reference').innerText(), /并非官方虚拟排名/);
  assert.equal(await page.locator('.contest-problem-row').count(), 2);
  assert.equal(await page.locator('.contest-record .contest-rank strong').first().innerText(), '—');
  assert.equal((await app.evaluate(() => globalThis.scoreRequests)).length, 3);
  const bytes = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  fs.writeFileSync(path.join(output, 'estimate.png'), Buffer.from(bytes, 'base64'));
  await app.close(); app = null;
  await launch();
  assert.equal(await page.locator('.contest-performance strong').first().innerText(), String(reference.performance));
  assert.deepEqual(await app.evaluate(() => globalThis.scoreRequests), [], 'cached estimates must work offline without automatic requests');
  await app.evaluate(() => { globalThis.scoreOffline = true; });
  await page.getByRole('button', { name: '重新估分', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.contest-virtual-reference')?.textContent.includes('fixture offline'), null, { timeout: 45000 });
  assert.equal(await page.locator('.contest-performance strong').first().innerText(), String(reference.performance));
  assert.equal(await page.locator('.contest-problem-row').count(), 2);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, reference, errors, offlineRetained: true, coldStart: true }, null, 2));
  console.log(JSON.stringify({ passed: true, output, reference }));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (app) await app.close(); });
