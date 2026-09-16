const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron } = require('playwright-core');
const { makeReferenceFixture } = require('./fixtures/virtual-reference.cjs');
const { mergeSessions } = require('../electron/services/contest-session.cjs');
const { estimateVirtualReference } = require('../electron/services/virtual-reference.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/playwright', `unified-replay-${Date.now()}`);
let app;
(async () => {
  const errors = [], checks = [];
  for (const language of ['zh-CN', 'en-US']) {
    const f = makeReferenceFixture();
    f.study.settings.language = language;
    f.cache.ratingHistory = [{contestId:1900, contestName:f.center.contests[0].name, handle:f.cache.handle, rank:12, oldRating:1400, newRating:1500, ratingUpdateTimeSeconds:1700007200}];
    const replay = mergeSessions(f.cache, {}, f.center, () => ({primary:'div2',divisions:[2],label:'Div.2'}), 4);
    for (const entry of replay.contests) {
      if (entry.participationType === 'VIRTUAL') {
        const standings = structuredClone(f.standings);
        standings.rows.find(r => r.party.participantType === 'VIRTUAL').party.startTimeSeconds = entry.sessionStartTimeSeconds;
        entry.virtualReference = await estimateVirtualReference({...f, entry, standings});
      } else Object.assign(entry, {status:'ready',performance:1600,officialRank:12,participants:100,oldRating:1400,newRating:1500,ratingDelta:100});
    }
    const profile = path.join(output, language); fs.mkdirSync(profile, {recursive:true});
    for (const [name,value] of [['cache',f.cache],['study',f.study],['contest-center',f.center],['contest-replay',replay]]) fs.writeFileSync(path.join(profile,`${name}.json`),JSON.stringify(value));
    const original = fs.readFileSync(path.join(profile,'cache.json'),'utf8');
    app = await _electron.launch({executablePath:process.env.CF_COMPASS_QA_EXECUTABLE || path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.CF_COMPASS_QA_EXECUTABLE?[]:[root],cwd:root,env:{...process.env,CF_COMPASS_USER_DATA:profile}});
    await app.evaluate(() => {globalThis.fetch = async () => {throw Error('fixture offline');};});
    const page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
    await page.getByRole('button',{name:language==='zh-CN'?'赛事复盘':'Contest Replay',exact:true}).click();
    await page.locator('.contest-record').first().waitFor();
    for (const width of [1600,1040]) {
      await page.setViewportSize({width,height:width===1040?700:1000});
      let commonLabels;
      for (const type of ['rated','virtual']) {
        const tabs=page.locator('.contest-participation-tabs button');
        await tabs.nth(type==='rated'?1:2).click();
        const row=page.locator('.contest-record').first();
        if (await row.locator('.contest-record__row').getAttribute('aria-expanded')!=='true') await row.locator('.contest-record__row').click();
        await row.locator('.contest-result-panel').waitFor();
        const labels=await row.locator('.contest-detail-metrics > div > span').allTextContents();
        assert.equal(labels.length,5);
        if(commonLabels) assert.deepEqual(labels,commonLabels); else commonLabels=labels;
        assert.equal(await row.locator('.contest-result-panel').count(),1);
        assert.ok(await row.locator('.contest-problem-row').count()>0);
        if(type==='rated') assert.match(await row.locator('.contest-result-rating').innerText(),/1,400[\s\S]*1,500[\s\S]*\+100/);
        else assert.equal(await row.locator('.contest-result-rating').count(),0,'no fabricated official rating changes');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        if(language==='en-US') assert.doesNotMatch(await row.innerText(),/[\u3400-\u9fff]/);
        await page.screenshot({path:path.join(output,`${language}-${type}-${width}.png`)});
        checks.push(`${language}/${width}/${type}`);
      }
    }
    assert.equal(fs.readFileSync(path.join(profile,'cache.json'),'utf8'),original);
    await app.close(); app=null;
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({output,checks,errors}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(app)await app.close();});
