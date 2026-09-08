const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');
const { makeFixture } = require('./fixtures/contest-sessions.cjs');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-compass-native-'));
const fixture = makeFixture();
for (const [name, data] of [['cache', fixture.cache], ['study', fixture.study]]) fs.writeFileSync(path.join(userData, `${name}.json`), JSON.stringify(data));
let app;
(async () => {
  if (!process.env.CF_COMPASS_QA_EXECUTABLE) throw Error('Packaged executable required');
  app = await electron.launch({ executablePath: process.env.CF_COMPASS_QA_EXECUTABLE, env: { ...process.env, CF_COMPASS_USER_DATA: userData } });
  const page = await app.firstWindow(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForSelector('.workbench-move');
  await page.getByRole('button', { name: '数据中心', exact: true }).click();
  await page.waitForSelector('.data-center');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ platform: process.platform, version: await app.evaluate(({ app }) => app.getVersion()), mainWindow: true, errors }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (app) await app.close(); });
