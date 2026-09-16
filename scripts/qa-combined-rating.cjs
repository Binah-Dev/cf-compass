const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron } = require('playwright-core');
const { makeReferenceFixture } = require('./fixtures/virtual-reference.cjs');
const { mergeSessions } = require('../electron/services/contest-session.cjs');
const { buildCombinedRating } = require('../electron/services/combined-rating.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output/playwright', `combined-${Date.now()}`), profile = path.join(output, 'user-data');
fs.mkdirSync(profile, { recursive: true });
let app;
(async () => {
  const f = makeReferenceFixture();
  f.cache.user.rating = 1200;
  Object.assign(f.study.settings, { language: 'en-US', autoSync: false, autoBackup: false });
  const replay = mergeSessions(f.cache, {}, f.center, () => ({ primary: 'div2', divisions: [2] }), 4);
  const store = { handle: f.cache.handle, records: {} };
  for (const entry of replay.contests) {
    if (!['VIRTUAL', 'CONTESTANT'].includes(entry.participationType)) continue;
    const ref = { status: 'ready', provisional: true, snapshotEvidence: { contestId: entry.contestId }, submissionFingerprint: entry.submissionFingerprint,
      ratingField: [[2200,1],[1600,3],[1000,4]], referenceRank: 2, performance: 1900, calculatedAt: new Date().toISOString() };
    entry.combinedReference = ref;
    store.records[entry.replayId] = { fingerprint: entry.submissionFingerprint, reference: ref, checkedAt: Date.now()/1000, startTimeSeconds: entry.startTimeSeconds, durationSeconds: entry.durationSeconds };
  }
  const expected = await buildCombinedRating(f.cache, replay);
  assert.ok(expected.counted >= 3);
  for (const [name, value] of [['cache',f.cache],['study',f.study],['contest-center',f.center],['contest-replay',replay],['combined-rating',store]]) fs.writeFileSync(path.join(profile,`${name}.json`),JSON.stringify(value));
  const original = fs.readFileSync(path.join(profile,'cache.json'),'utf8'), errors = [];
  async function launch() {
    app = await _electron.launch({executablePath:process.env.CF_COMPASS_QA_EXECUTABLE || require('electron'),args:process.env.CF_COMPASS_QA_EXECUTABLE ? [] : [root],cwd:root,env:{...process.env,CF_COMPASS_USER_DATA:profile}});
    await app.evaluate(() => { globalThis.fetch = async () => { throw Error('Offline fixture: network disabled'); }; });
    const page = await app.firstWindow(); page.on('pageerror',error => errors.push(error.message));
    await page.getByRole('button',{name:"Today's Training",exact:true}).click();
    await page.locator('.training-preferences summary').first().click();
    await page.waitForFunction(() => !document.querySelector('.training-preferences fieldset')?.disabled);
    return page;
  }
  let page = await launch();
  await page.getByRole('combobox',{name:'Rating mode',exact:true}).selectOption('combined');
  await page.getByRole('button',{name:'Save training preferences',exact:true}).click();
  const expectedTraining = Math.max(800,Math.min(3500,expected.rating));
  await page.waitForFunction(r => document.querySelector('[data-testid="training-rating"]')?.textContent === String(r),expectedTraining);
  assert.match(await page.getByTestId('rating-source').innerText(), /Combined official and virtual/);
  await page.getByText('Combined rating ledger',{exact:true}).click();
  // Native details toggle is queued; React populates the ledger afterwards.
  // Wait for actual entries, not the surrounding explanation containing Official.
  await page.waitForFunction(() => {
    const entries = [...document.querySelectorAll('[data-testid="combined-estimate"] details > p')];
    return entries.some(el => el.textContent.includes('Official'))
      && entries.some(el => el.textContent.includes('Virtual'));
  });
  assert.match(await page.getByTestId('combined-estimate').innerText(), /Official/);
  assert.match(await page.getByTestId('combined-estimate').innerText(), /Virtual/);
  const shot = await app.evaluate(async ({BrowserWindow}) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  fs.writeFileSync(path.join(output,'training.png'),Buffer.from(shot,'base64'));
  // Verify the native completion event updates recommendations without waiting
  // for the 15-second polling fallback. No profile or official data is written.
  const pushed = { ...expected, rating:1777, pending:1, status:'partial', updating:false };
  await app.evaluate(({BrowserWindow},value)=>BrowserWindow.getAllWindows()[0].webContents.send('rating:combined-changed',value),pushed);
  await page.waitForFunction(()=>document.querySelector('[data-testid="training-rating"]')?.textContent==='1777',null,{timeout:3000});
  assert.match(await page.getByTestId('combined-estimate').innerText(),/1 sessions are missing/);
  await app.evaluate(({BrowserWindow},value)=>BrowserWindow.getAllWindows()[0].webContents.send('rating:combined-changed',value),expected);
  await page.waitForFunction(r=>document.querySelector('[data-testid="training-rating"]')?.textContent===String(r),expectedTraining,{timeout:3000});
  await app.close(); app = null;
  page = await launch();
  assert.equal(await page.getByRole('combobox',{name:'Rating mode',exact:true}).inputValue(),'combined');
  await page.waitForFunction(r => document.querySelector('[data-testid="training-rating"]')?.textContent === String(r),expectedTraining);
  await page.getByRole('combobox',{name:'Rating mode',exact:true}).selectOption('auto');
  await page.getByRole('button',{name:'Save training preferences',exact:true}).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="training-rating"]')?.textContent === '1200');
  await page.getByRole('button',{name:'Problemset',exact:true}).click();
  assert.deepEqual(await page.getByRole('combobox',{name:'Personal Rating mode',exact:true}).locator('option').evaluateAll(nodes=>nodes.map(n=>n.value)),['official','combined']);
  await page.getByRole('combobox',{name:'Personal Rating mode',exact:true}).selectOption('combined');
  await page.waitForFunction(r => document.querySelector('.profile-rating .rating-score')?.textContent.replaceAll(',','') === String(r),expected.rating);
  await page.getByRole('button',{name:"Today's Training",exact:true}).click();
  await page.waitForFunction(r => document.querySelector('[data-testid="training-rating"]')?.textContent === String(r),expectedTraining);
  const preferences=page.locator('.training-preferences');
  if(!await preferences.evaluate(el=>el.open)) await preferences.locator('summary').first().click();
  await page.getByRole('combobox',{name:'Rating mode',exact:true}).selectOption('manual');
  await page.getByRole('spinbutton',{name:'Manual training Rating',exact:true}).fill('1500');
  await page.getByRole('button',{name:'Save training preferences',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="training-rating"]')?.textContent==='1500');
  assert.match(await page.getByTestId('rating-source').innerText(),/Manual/);
  await app.evaluate(({BrowserWindow},value)=>BrowserWindow.getAllWindows()[0].webContents.send('rating:combined-changed',value),{...expected,rating:2300});
  assert.equal(await page.getByTestId('training-rating').innerText(),'1500');
  await app.close();app=null;page=await launch();
  await page.waitForFunction(()=>document.querySelector('[data-testid="training-rating"]')?.textContent==='1500');
  assert.equal(await page.getByRole('combobox',{name:'Rating mode',exact:true}).inputValue(),'manual');
  await page.getByRole('combobox',{name:'Rating mode',exact:true}).selectOption('auto');
  await page.getByRole('button',{name:'Save training preferences',exact:true}).click();
  await page.waitForFunction(r=>document.querySelector('[data-testid="training-rating"]')?.textContent===String(r),expectedTraining);
  await page.getByRole('button',{name:'Problemset',exact:true}).click();
  await page.getByRole('combobox',{name:'Personal Rating mode',exact:true}).selectOption('official');
  await page.waitForFunction(() => document.querySelector('.profile-rating .rating-score')?.textContent === '1,200');
  assert.equal(fs.readFileSync(path.join(profile,'cache.json'),'utf8'),original);
  assert.deepEqual(errors,[]);
  const result = {expectedTraining,counted:expected.counted,output,errors,checks:['opt-in','combined ledger','training update','native completion push under 3 seconds','missing-session warning','restart persistence','automatic rollback','home combined mode and restore','manual override with estimated home','manual survives rating push and restart','automatic resumes home estimate','official cache byte-identical']};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
})().catch(error => {console.error(error);process.exitCode=1;}).finally(async()=>{if(app)await app.close();});
