const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');
const { makeFixture, virtualTwo } = require('./fixtures/contest-sessions.cjs');
const { makeReferenceFixture } = require('./fixtures/virtual-reference.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output/playwright', `public-standings-${Date.now()}`), profile = path.join(output, 'user-data');
fs.mkdirSync(profile, { recursive: true });
const f = makeFixture(), ref = makeReferenceFixture();
f.study.settings.autoSync = false;
f.center.details = {}; // Force first-click loading; never precompute the replay in this test.
for (const [name, data] of [['cache', f.cache], ['study', f.study], ['contest-center', f.center]]) fs.writeFileSync(path.join(profile, `${name}.json`), JSON.stringify(data));
ref.standings.rows = ref.standings.rows.filter(row => row.party.participantType === 'CONTESTANT');
let app;
(async () => {
  app = await electron.launch({ executablePath: process.env.CF_COMPASS_QA_EXECUTABLE || path.join(root, 'node_modules/electron/dist/electron.exe'), args: process.env.CF_COMPASS_QA_EXECUTABLE ? [] : [root], cwd: root, env: { ...process.env, CF_COMPASS_USER_DATA: profile } });
  await app.evaluate((_electron, ref) => {
    globalThis.standingsQueries = []; globalThis.invalidStandingsQueries = []; globalThis.ratingQueries = []; globalThis.openedProblems = [];
    _electron.shell.openExternal = async url => { globalThis.openedProblems.push(url); };
    globalThis.fetch = async value => {
      const url = new URL(String(value));
      if (url.pathname.endsWith('contest.ratingChanges')) { globalThis.ratingQueries.push(url.search); throw Error('Virtual replay must not request rating data'); }
      if (url.pathname.endsWith('contest.standings')) {
        globalThis.standingsQueries.push(url.search);
        if ([...url.searchParams.keys()].join(',') !== 'contestId') {
          globalThis.invalidStandingsQueries.push(url.search);
          return { ok: false, status: 400, text: async () => JSON.stringify({ status: 'FAILED', comment: 'Non-gym contest standings require exactly contestId' }) };
        }
      }
      return { ok: true, json: async () => ({ status: 'OK', result: url.pathname.endsWith('contest.ratingChanges') ? ref.ratingChanges : ref.standings }) };
    };
  }, ref);
  const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.waitForSelector('.app-shell');
  await page.getByRole('button', { name: '赛事复盘', exact: true }).click();
  await page.locator('.contest-participation-tabs').getByRole('button', { name: '虚拟参赛', exact: true }).click();
  const row = page.locator('.contest-record').first();
  await row.waitFor();
  if (await row.locator('.contest-record__row').getAttribute('aria-expanded') !== 'true') {
    await row.locator('.contest-record__row').click();
  } else if (await row.getByRole('button', { name: '重新计算', exact: true }).count()) {
    await row.getByRole('button', { name: '重新计算', exact: true }).click();
  }
  await row.locator('.contest-problem-row').first().waitFor({ timeout: 45000 });
  assert.equal(await row.locator('.contest-problem-row').count(), 4);
  assert.equal(await page.locator('.contest-virtual-reference').count(), 1);
  assert.equal(await row.locator('.contest-performance strong').innerText(), '未估分');
  const problem = row.locator('.contest-problem-row').filter({ hasText: 'Fixture 1900C' });
  await problem.getByRole('button', { name: '打开题目', exact: true }).click();
  assert.deepEqual(await app.evaluate(() => globalThis.openedProblems), ['https://codeforces.com/contest/1900/problem/C']);
  await problem.getByRole('button', { name: '加入补题', exact: true }).click();
  await problem.getByRole('button', { name: '移出补题', exact: true }).waitFor();
  await page.waitForFunction(async () => (await window.cfBridge.getStudyData()).contestQueue.includes('1900-C'));
  await page.screenshot({ path: path.join(output, 'virtual-problems-upsolving.png') });
  await page.getByRole('button', { name: '赛事中心', exact: true }).click();
  await page.locator('.contest-center-shell > .contest-center-quick').getByRole('button', { name: '待补题', exact: true }).click();
  await page.locator('.contest-upsolve-item').filter({ hasText: 'Fixture 1900C' }).waitFor();
  assert.deepEqual(await app.evaluate(() => globalThis.ratingQueries), []);
  const requests = await app.evaluate(() => ({ count: globalThis.standingsQueries.length, invalid: globalThis.invalidStandingsQueries }));
  assert.ok(requests.count > 0); assert.deepEqual(requests.invalid, []); assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, requests, errors, replayReady: true, upsolveVisible: true, estimationOnDemandOnly: true }, null, 2));
  console.log(JSON.stringify({ passed: true, output, requests }));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (app) await app.close(); });
