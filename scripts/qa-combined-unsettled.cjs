// Synthetic API responses; real Electron services, scheduler, IPC and renderer.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require('playwright-core');
const {makeScoreFixture}=require('./fixtures/virtual-score.cjs');
const {submission}=require('./fixtures/contest-sessions.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/playwright',`unsettled-${Date.now()}`),profile=path.join(output,'user-data');
let app;
(async()=>{
  fs.mkdirSync(profile,{recursive:true});
  const f=makeScoreFixture('CF'),now=Math.floor(Date.now()/1000),originalStart=now-86400;
  Object.assign(f.standings.contest,{name:'Codeforces Round 999 (Div. 2)',startTimeSeconds:originalStart});
  f.standings.problems.forEach(p=>delete p.rating);
  const self=structuredClone(f.standings.rows[1]);self.party.members=[{handle:f.cache.handle}];self.party.startTimeSeconds=originalStart;f.standings.rows.push(self);
  const users=[{handle:'top',rating:2200},{handle:'middle',rating:1600},{handle:'lower',rating:1000},{handle:f.cache.handle,rating:1200}];
  const attempts=(base,type,start)=>[submission(base,type,start,600,'OK'),submission(base+1,type,start,1200,'OK','B')].map(s=>{delete s.problem.rating;return s;});
  const first=[...attempts(100,'CONTESTANT',originalStart),...attempts(200,'VIRTUAL',now-16000)];
  f.cache.submissions=[];f.cache.ratingHistory=[];f.cache.user.rating=1200;
  f.cache.problems=Array.from({length:160},(_,i)=>({contestId:3000+i,index:'A',name:`Training fixture ${i}`,rating:800+100*(i%23),tags:['implementation'],type:'PROGRAMMING'}));
  f.center.contests=[f.standings.contest];f.center.details={1900:{contestId:1900,problems:f.standings.problems}};
  Object.assign(f.study.settings,{language:'en-US',autoSync:false,autoBackup:false});
  for(const [name,value] of [['cache',f.cache],['study',f.study],['contest-center',f.center]])fs.writeFileSync(path.join(profile,name+'.json'),JSON.stringify(value));
  const original=fs.readFileSync(path.join(profile,'cache.json'),'utf8'),errors=[];
  app=await _electron.launch({executablePath:process.env.CF_COMPASS_QA_EXECUTABLE||require('electron'),args:process.env.CF_COMPASS_QA_EXECUTABLE?[]:[root],cwd:root,env:{...process.env,CF_COMPASS_USER_DATA:profile}});
  await app.evaluate((_,payload)=>{
    globalThis.qaScenario={...payload,submissions:[],calls:[]};
    globalThis.fetch=async input=>{
      const url=new URL(String(input)),q=globalThis.qaScenario,method=url.pathname.split('/').pop();
      q.calls.push({method,time:Date.now()});let result;
      if(method==='contest.ratingChanges')return {ok:true,json:async()=>({status:'FAILED',comment:'Rating changes are unavailable for this contest'})};
      if(method==='user.status'||method==='contest.status') result=q.submissions;
      else if(method==='contest.standings')result=q.standings;
      else if(method==='user.ratedList'||method==='user.info')result=q.users;
      else if(method==='contest.list')result=[q.standings.contest];
      else throw Error('Unexpected simulated API: '+method);
      return {ok:true,json:async()=>({status:'OK',result:structuredClone(result)})};
    };
  },{standings:f.standings,users});
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:"Today's Training",exact:true}).click();
  await page.locator('.training-preferences summary').first().click();
  await page.waitForFunction(()=>!document.querySelector('.training-preferences fieldset')?.disabled);
  await page.getByRole('combobox',{name:'Rating mode',exact:true}).selectOption('combined');
  await page.getByRole('button',{name:'Save training preferences',exact:true}).click();
  assert.equal(await page.getByTestId('training-rating').innerText(),'1200');
  const bandsBefore=await page.locator('.recommendation-lane').allTextContents();
  const keysBefore=await page.locator('.recommendation-lane [data-problem-key]').evaluateAll(nodes=>nodes.map(n=>n.dataset.problemKey));
  await app.evaluate((_,value)=>{globalThis.qaScenario.submissions=value;},first);
  await page.evaluate(()=>window.cfBridge.getCombinedRating(true));
  await page.waitForFunction(()=>document.querySelector('[data-testid="combined-status"]')?.textContent.includes('2/2'),null,{timeout:90000});
  const afterTwo=Number(await page.getByTestId('training-rating').innerText());
  assert.notEqual(afterTwo,1200);
  const vpStart=Math.floor(Date.now()/1000)-7155,endsAt=(vpStart+7200)*1000;
  const all=[...first,...attempts(300,'VIRTUAL',vpStart)];
  await app.evaluate((_,value)=>{globalThis.qaScenario.submissions=value;},all);
  await page.evaluate(()=>window.cfBridge.getCombinedRating(true));
  await page.waitForFunction(()=>document.querySelector('[data-testid="combined-status"]')?.textContent.includes('2/3'),null,{timeout:40000});
  const observedPendingAt=Date.now();assert.ok(observedPendingAt<endsAt,'VP must be seen pending before it ends');
  // No additional refresh button: the real scheduler and native completion event act.
  await page.waitForFunction(()=>document.querySelector('[data-testid="combined-status"]')?.textContent.includes('3/3'),null,{timeout:90000});
  const observedCompleteAt=Date.now(),afterThree=Number(await page.getByTestId('training-rating').innerText());
  assert.notEqual(afterThree,afterTwo);
  const bandsAfter=await page.locator('.recommendation-lane').allTextContents();assert.notDeepEqual(bandsAfter,bandsBefore);
  const keysAfter=await page.locator('.recommendation-lane [data-problem-key]').evaluateAll(nodes=>nodes.map(n=>n.dataset.problemKey));
  assert.ok(keysBefore.length&&keysAfter.length);assert.notDeepEqual(keysAfter,keysBefore);
  const store=JSON.parse(fs.readFileSync(path.join(profile,'combined-rating.json'),'utf8'));
  const records=Object.values(store.records);assert.equal(records.length,3);
  assert.ok(records.every(r=>r.reference.status==='ready'&&r.reference.provisional));
  assert.equal(fs.readFileSync(path.join(profile,'cache.json'),'utf8'),original);assert.deepEqual(errors,[]);
  // Saving preferences may collapse their outer details; reopen before the ledger.
  if (!(await page.locator('.training-preferences').evaluate(el=>el.open))) {
    await page.locator('.training-preferences > summary').click();
  }
  await page.getByText('Combined rating ledger',{exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-testid="combined-estimate"] details > p').length===3);
  const shot=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  fs.writeFileSync(path.join(output,'training.png'),Buffer.from(shot,'base64'));
  const calls=await app.evaluate(()=>globalThis.qaScenario.calls);
  const report={scope:'synthetic API, actual Electron pipeline; not real network latency',before:1200,afterTwo,afterThree,endedToUI_ms:observedCompleteAt-endsAt,records:records.map(r=>({method:r.reference.method,rank:r.reference.referenceRank,performance:r.reference.performance})),recommendationsChanged:true,keysBefore,keysAfter,officialCacheUnchanged:true,errors,calls,output};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;console.error('Artifacts: '+output);}).finally(async()=>{if(app)await app.close();});
