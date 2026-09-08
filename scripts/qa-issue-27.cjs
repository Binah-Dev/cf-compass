const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');
const { makeFixture, virtualOne, virtualTwo } = require('./fixtures/contest-sessions.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'output/playwright', `issue27-${Date.now()}`), profile = path.join(output, 'user-data');
fs.mkdirSync(profile, { recursive: true });
const fixture = makeFixture();
const key = `1900:virtual:${virtualOne}:source`, legacyKey = `1900:virtual:${virtualTwo}:source`;
const report = { contestId: 1900, replayId: `1900:virtual:${virtualOne}`, analysisMode: 'source', sourceIncluded: true, savedAt: '2026-09-08', summary: 'Saved fixture report', sourceTimeline: [{ index: 1, submissionId: 2, problemKey: '1900-A', relativeTimeSeconds: 0, sourceAvailable: true }], sourceDiffs: [{ id: 'initial', toSubmissionId: 2, patch: '+fixture code', kind: 'initial', problemKey: '1900-A' }] };
fixture.study.aiReviews = { [key]: report, [legacyKey]: { ...report, replayId: `1900:virtual:${virtualTwo}`, summary: 'Legacy saved report', sourceTimeline: [], sourceDiffs: [] } };
for (const [name,data] of [['cache',fixture.cache],['study',fixture.study],['contest-center',fixture.center]]) fs.writeFileSync(path.join(profile,`${name}.json`),JSON.stringify(data));
let app;
(async()=>{
  for (const restart of [false,true]) {
    app = await electron.launch({ executablePath: process.env.CF_COMPASS_QA_EXECUTABLE || require('electron'), args: process.env.CF_COMPASS_QA_EXECUTABLE ? [] : [root], cwd: root, env:{...process.env,CF_COMPASS_USER_DATA:profile} });
    await app.evaluate(({ipcMain})=>{
      globalThis.aiCalls=0;
      ipcMain.removeHandler('ai:analyze-contest');
      ipcMain.handle('ai:analyze-contest',()=>{globalThis.aiCalls++;throw Error('No paid API calls allowed in fixture');});
    });
    const page=await app.firstWindow();
    await page.getByRole('button',{name:'赛事复盘',exact:true}).click();
    await page.locator('.contest-participation-tabs').getByRole('button',{name:'虚拟参赛',exact:true}).click();
    const rows=page.locator('.contest-record');
    for (let index=0;index<2;index++) {
      const row=rows.nth(index);
      if (await row.locator('.contest-record__row').getAttribute('aria-expanded') !== 'true') await row.locator('.contest-record__row').click();
      await row.locator('.contest-problem-row').first().waitFor();
      await row.getByRole('button',{name:'查看增强复盘',exact:true}).click();
      await page.locator('.ai-review-summary').waitFor();
      assert.match(await page.locator('.ai-review-summary').innerText(),/saved report|Saved fixture report/);
      if(index===0) assert.ok(await page.getByText('已读取保存的报告；旧版未保存源码时间线。只有点击重新分析才会重新请求 AI。',{exact:true}).count());
      await page.getByRole('button',{name:'保存复盘',exact:true}).click();
      await page.waitForFunction(()=>document.body.innerText.includes('AI 复盘已保存'));
      await page.getByRole('button',{name:'关闭 AI 复盘',exact:true}).click();
    }
    assert.equal(await app.evaluate(()=>globalThis.aiCalls),0);
    if (!restart) {
      await app.evaluate(({ipcMain})=>{
        ipcMain.removeHandler('ai:analyze-contest');
        ipcMain.handle('ai:analyze-contest',()=>new Promise(resolve=>{globalThis.lateReview=resolve;}));
        ipcMain.removeHandler('ai:recommend-contest');
        ipcMain.handle('ai:recommend-contest',()=>new Promise(resolve=>{globalThis.lateRecommendations=resolve;}));
      });
      const openSaved = async index => {
        const row=rows.nth(index);
        if(await row.locator('.contest-record__row').getAttribute('aria-expanded')!=='true')await row.locator('.contest-record__row').click();
        await row.getByRole('button',{name:'查看增强复盘',exact:true}).click();
      };
      await openSaved(1);
      await page.getByRole('button',{name:'重新分析',exact:true}).click();
      while(!await app.evaluate(()=>Boolean(globalThis.lateReview)))await page.waitForTimeout(20);
      await page.getByRole('button',{name:'关闭 AI 复盘',exact:true}).click();
      await openSaved(0);
      await app.evaluate(()=>globalThis.lateReview({summary:'STALE RESPONSE MUST NOT APPEAR'}));
      await page.waitForTimeout(150);
      assert.match(await page.locator('.ai-review-summary').innerText(),/Legacy saved report/);
      await page.getByRole('button',{name:'推荐下一组题',exact:true}).click();
      while(!await app.evaluate(()=>Boolean(globalThis.lateRecommendations)))await page.waitForTimeout(20);
      await page.getByRole('button',{name:'关闭 AI 复盘',exact:true}).click();
      await openSaved(1);
      await app.evaluate(()=>globalThis.lateRecommendations({recommendations:[{problemKey:'999-A',name:'STALE RECOMMENDATION'}]}));
      await page.waitForTimeout(150);
      assert.equal(await page.getByText('STALE RECOMMENDATION',{exact:false}).count(),0);
      await app.evaluate(({ipcMain}, report)=>{
        ipcMain.removeHandler('ai:analyze-contest');
        ipcMain.handle('ai:analyze-contest',()=>({...report,summary:'Unsaved fixture report',savedAt:''}));
        ipcMain.removeHandler('study:set');
        ipcMain.handle('study:set',()=>{throw Error('Fixture save failure');});
      },report);
      await page.getByRole('button',{name:'重新分析',exact:true}).click();
      await page.getByText('Unsaved fixture report',{exact:true}).waitFor();
      const beforeFailure=fs.readFileSync(path.join(profile,'study.json'),'utf8');
      await page.getByRole('button',{name:'保存复盘',exact:true}).click();
      await page.getByText(/Fixture save failure/).waitFor();
      assert.ok(!(await page.locator('.ai-review-summary').innerText()).includes('已保存'));
      assert.equal(fs.readFileSync(path.join(profile,'study.json'),'utf8'),beforeFailure);
      await page.getByRole('button',{name:'关闭 AI 复盘',exact:true}).click();
    }
    const saved=JSON.parse(fs.readFileSync(path.join(profile,'study.json'),'utf8'));
    assert.equal(saved.aiReviews[key].sourceDiffs[0].patch,'+fixture code');
    assert.equal(saved.aiReviews[key].sourceTimeline[0].relativeTimeSeconds,0);
    await page.screenshot({path:path.join(output,`restart-${restart}.png`)});
    await app.close();app=null;
  }
  console.log(JSON.stringify({passed:true,output,checks:['saved source report','legacy saved report','no credential needed to reopen','save and cold restart','zero AI calls']}));
})().catch(async e=>{console.error(e); if(app) { const p=await app.firstWindow();fs.writeFileSync(path.join(output,'failure.yml'),await p.locator('body').ariaSnapshot()); } process.exitCode=1}).finally(async()=>{if(app)await app.close()});
