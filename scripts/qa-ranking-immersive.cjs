const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron } = require('playwright-core');
const { makeFixture } = require('./fixtures/contest-sessions.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output/playwright', `ranking-immersive-${Date.now()}`);
fs.mkdirSync(output, {recursive:true});
(async () => {
 for (const position of [1, 500, 501]) {
  const profile = path.join(output, String(position)); fs.mkdirSync(profile);
  const fixture = makeFixture();
  fixture.study.settings.language = 'zh-CN'; fixture.study.settings.autoSync = false;
  fixture.cache.ratingStanding = {position, total:50000, topPercent:position/500};
  for (const [name,data] of [['cache',fixture.cache],['study',fixture.study]]) fs.writeFileSync(path.join(profile,name+'.json'),JSON.stringify(data));
  const app = await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root],cwd:root,env:{...process.env,CF_COMPASS_USER_DATA:profile}});
  try {
   const page = await app.firstWindow();
   const card = page.locator('.ranking-card--rating'); await card.waitFor();
   assert.equal(await card.locator('strong').innerText(),position<=500 ? '#'+position : 'Top 1.00%');
   assert.equal(await card.locator('.ranking-card__position').count(),position<=500?0:1);
   await page.getByRole('button',{name:'沉浸大厅',exact:true}).click();
   await page.waitForTimeout(350);
   assert.deepEqual(await page.locator('.titlebar').evaluate(el=>({opacity:getComputedStyle(el).opacity,visibility:getComputedStyle(el).visibility,inert:el.inert,hidden:el.getAttribute('aria-hidden')})),{opacity:'1',visibility:'visible',inert:false,hidden:null});
   assert.equal(await page.locator('.titlebar__drag').evaluate(el=>getComputedStyle(el).getPropertyValue('-webkit-app-region')),'drag');
   await page.getByRole('button',{name:'最大化',exact:true}).click({trial:true});
   await page.screenshot({path:path.join(output,`immersive-${position}.png`),timeout:5000});
   console.log('PASS rank '+position+' and immersive titlebar');
  } finally {await app.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
