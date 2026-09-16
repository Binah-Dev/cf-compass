const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const {makeReferenceFixture}=require('./fixtures/virtual-reference.cjs');
const {mergeSessions}=require('../electron/services/contest-session.cjs');
const {estimateVirtualReference}=require('../electron/services/virtual-reference.cjs');
const {buildVirtualRating}=require('../electron/services/virtual-rating.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/playwright',`dual-rating-${Date.now()}`),profile=path.join(output,'user-data');
fs.mkdirSync(profile,{recursive:true});
const write=(name,data)=>fs.writeFileSync(path.join(profile,name+'.json'),JSON.stringify(data));
let app;
(async()=>{
 const f=makeReferenceFixture(); f.cache.user.rating=1200;f.cache.user.rank='pupil';
 f.cache.ratingDistribution={handle:f.cache.handle,ratings:[2400,1800,1200,800],syncedAt:new Date().toISOString()};
 f.study.settings.language='en-US';f.study.settings.autoSync=false;f.study.settings.autoBackup=false;
 const replay=mergeSessions(f.cache,{},f.center,()=>({primary:'div2',divisions:[2]}),4);
 for(const entry of replay.contests){
  if(entry.participationType!=='VIRTUAL') continue;
  const standings=structuredClone(f.standings);
  standings.rows.find(r=>r.party.participantType==='VIRTUAL').party.startTimeSeconds=entry.sessionStartTimeSeconds;
  entry.virtualReference=await estimateVirtualReference({...f,entry,standings});
 }
 const expected=await buildVirtualRating(f.cache,replay);
 assert.equal(expected.counted,2);
 for(const [name,value] of [['cache',f.cache],['study',f.study],['contest-center',f.center],['contest-replay',replay]])write(name,value);
 const original=fs.readFileSync(path.join(profile,'cache.json'),'utf8');
 const errors=[];
 async function launch(){
  app=await _electron.launch({executablePath:process.env.CF_COMPASS_QA_EXECUTABLE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.CF_COMPASS_QA_EXECUTABLE?[]:[root],cwd:root,env:{...process.env,CF_COMPASS_USER_DATA:profile}});
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(()=>{globalThis.fetch=async()=>{throw Error('QA offline')}});
  await page.getByRole('combobox',{name:'Personal Rating mode',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.rating-mode-control')?.textContent.includes('2/2'));
  return page;
 }
 let page=await launch();
 assert.match(await page.locator('.profile-rating').innerText(),/1,200/);
 await page.getByRole('combobox',{name:'Personal Rating mode',exact:true}).selectOption('estimated');
 await page.waitForFunction(r=>document.querySelector('.profile-rating .rating-score')?.textContent.replaceAll(',','')===String(r),expected.rating);
 assert.equal(await page.locator('.ranking-card--rating small').first().innerText(),'Estimated standing');
 assert.equal(await page.locator('.rank-label').evaluate(el=>getComputedStyle(el).color),await page.locator('.profile-copy h3').evaluate(el=>getComputedStyle(el).color));
 await page.getByRole('button',{name:"Today's Training",exact:true}).click();
 await page.waitForFunction(r=>document.querySelector('[data-testid="training-rating"]')?.textContent===String(Math.max(800,Math.min(3500,r))),expected.rating);
 await page.getByRole('button',{name:'Training Analytics',exact:true}).click();
 assert.match(await page.locator('.analytics-rating-panel h2').innerText(),/Estimated/);
 await app.close();app=null;
 page=await launch();
 assert.equal(await page.getByRole('combobox',{name:'Personal Rating mode',exact:true}).inputValue(),'estimated');
 await page.getByRole('combobox',{name:'Personal Rating mode',exact:true}).selectOption('official');
 await page.waitForFunction(()=>document.querySelector('.profile-rating .rating-score')?.textContent==='1,200');
 assert.equal(fs.readFileSync(path.join(profile,'cache.json'),'utf8'),original);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({output,rating:expected.rating,counted:2,checks:['official preserved','two sessions cumulative','home colors/rank mode','training uses estimate','analytics uses estimate','restart persists','switch back restores'],errors},null,2));
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({expected,errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(app)await app.close()});
