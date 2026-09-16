const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCombinedRatingService, isAwaitingSettlement } = require('../electron/services/combined-rating-service.cjs');
const { makeReferenceFixture } = require('./fixtures/virtual-reference.cjs');
test('service distinguishes unpublished ratings from network failures', () => {
  assert.equal(isAwaitingSettlement(Error('Codeforces: Rating changes are unavailable for this contest')), true);
  for (const msg of ['HTTP 503', 'timeout', 'invalid API key']) assert.equal(isAwaitingSettlement(Error(msg)), false);
});
test('service caches provisional evidence, preserves official data and corrects the same record on settlement', async () => {
  const f = makeReferenceFixture(); const now = Math.floor(Date.now()/1000);
  f.standings.contest.startTimeSeconds = now - 30000;
  f.standings.contest.name = 'Codeforces Round 999 (Div. 2)';
  f.entry = { ...f.entry, participationType: 'CONTESTANT', replayId: '1900', startTimeSeconds: now - 30000, durationSeconds: 7200 };
  const self = f.standings.rows.find(r => r.party.participantType === 'VIRTUAL'); self.party.participantType = 'CONTESTANT';
  const context = { cache: f.cache, replay: { handle: f.cache.handle, contests: [f.entry] }, center: f.center };
  const original = JSON.stringify(context);
  let store = {}, settled = false;
  const calls = [];
  const service = createCombinedRatingService({
    loadContext: async () => structuredClone(context), mergeReplay: (_cache, replay) => replay,
    readStore: async () => structuredClone(store), writeStore: async value => { store = structuredClone(value); },
    fetchJson: async endpoint => {
      calls.push(endpoint);
      if (endpoint.startsWith('user.status')) return [];
      if (endpoint.startsWith('contest.standings')) return f.standings;
      if (endpoint.startsWith('contest.ratingChanges')) {
        if (!settled) throw Error('Rating changes are unavailable for this contest');
        return [{ contestId: 1900, handle: 'top', rank: 1, oldRating: 2300 }, { contestId: 1900, handle: f.cache.handle, rank: 2, oldRating: 1200 }, { contestId: 1900, handle: 'lower', rank: 3, oldRating: 1000 }];
      }
      if (endpoint.startsWith('user.ratedList')) return [{ handle: 'top', rating: 2200 }, { handle: 'middle', rating: 1600 }, { handle: 'lower', rating: 1000 }, { handle: f.cache.handle, rating: 1200 }];
      throw Error(`Unexpected endpoint ${endpoint}`);
    },
  });
  await service.run(false);
  assert.equal(store.records['1900'].reference.provisional, true);
  assert.ok(store.records['1900'].reference.performance);
  const before = calls.length; await service.run(false); assert.equal(calls.length, before);
  settled = true; await service.run(true);
  assert.equal(Object.keys(store.records).length, 1);
  assert.equal(store.records['1900'].reference.provisional, false);
  assert.equal(JSON.stringify(context), original);
});
test('combined training selection is opt-in, account-bound and independent of displayed rating', async () => {
  const { resolveTrainingRating, normalizeTrainingProfiles, trainingContextKey } = await import('../electron/shared/training-profile.mjs');
  const { selectRatingView } = await import('../electron/shared/rating-view.mjs');
  const raw = { handle:'fixture',user:{handle:'fixture',rating:1200} };
  const estimate = {handle:'fixture',rating:1875,counted:1,entries:[{id:'1',status:'counted',performance:2100}]};
  const study = {trainingProfiles:normalizeTrainingProfiles({fixture:{ratingMode:'combined'}})};
  const view = selectRatingView(raw,study,null,estimate);
  assert.equal(view.user.rating,1200); assert.equal(resolveTrainingRating(view.user,study).rating,1875);
  assert.equal(resolveTrainingRating(view.user,{}).rating,1200);
  assert.equal(resolveTrainingRating(selectRatingView(raw,study,null,{...estimate,handle:'other'}).user,study).source,'combined-pending');
  assert.notEqual(trainingContextKey(view.user,study),trainingContextKey({...view.user,trainingEstimate:{...estimate,rating:1800}},study));
  assert.deepEqual(raw,{handle:'fixture',user:{handle:'fixture',rating:1200}});
});

test('account switch while discovering submissions discards the previous account task', async () => {
  let handle = 'first', writes = 0;
  const service = createCombinedRatingService({
    loadContext: async () => ({cache:{handle,syncedAt:'fixed',submissions:[]},replay:{handle,contests:[]},center:{}}),
    mergeReplay: (_cache,replay) => replay, readStore: async () => ({}), writeStore: async () => {writes++;},
    fetchJson: async () => {handle='second';return [];},
  });
  await service.run(false);assert.equal(writes,0);
});

test('manual training rating overrides both estimated display modes, auto still follows display', async () => {
  const {resolveTrainingRating}=await import('../electron/shared/training-profile.mjs');
  const {selectRatingView}=await import('../electron/shared/rating-view.mjs');
  const raw={handle:'fixture',user:{handle:'fixture',rating:1200}};
  const estimate={handle:'fixture',rating:1900,baseline:1400,entries:[]};
  for(const mode of ['official','estimated','combined']) {
    const study={trainingProfiles:{fixture:{ratingMode:'manual',manualRating:1500,displayRatingMode:mode}}};
    const view=selectRatingView(raw,study,estimate,estimate);
    assert.equal(resolveTrainingRating(view.user,study).rating,1500,mode);
    assert.equal(resolveTrainingRating(view.user,study).source,'manual');
    study.trainingProfiles.fixture.ratingMode='auto';
    assert.equal(resolveTrainingRating(view.user,study).rating,mode==='official'?1200:1900);
  }
});

test('incomplete ready reference retries, preserves offline result, and becomes complete after recovery', async () => {
  const f=makeReferenceFixture(), now=Date.now()/1000;
  const entry={...f.entry,durationSeconds:f.standings.contest.durationSeconds};
  const cached={status:'ready',submissionFingerprint:entry.submissionFingerprint,missingRatedCount:1,matchedRatedCount:2,performance:1600};
  let store={handle:f.cache.handle,records:{[entry.replayId]:{fingerprint:entry.submissionFingerprint,checkedAt:now-86400,reference:cached}}};
  let offline=true, calls=0;
  const service=createCombinedRatingService({
    loadContext:async()=>({cache:structuredClone(f.cache),replay:{handle:f.cache.handle,contests:[entry]},center:f.center}),mergeReplay:(_,r)=>r,
    readStore:async()=>structuredClone(store),writeStore:async s=>{store=s;},
    fetchJson:async e=>{
      if(e.startsWith('user.status'))return [];
      calls++;
      if(offline)throw Error('fixture offline');
      if(e.startsWith('contest.standings'))return f.standings;
      if(e.startsWith('contest.ratingChanges'))return f.ratingChanges;
      if(e.startsWith('contest.status'))return [];
      throw Error('Unexpected '+e);
    },
  });
  await service.run(false);assert.equal(calls,1,'missing rated field must trigger refresh');
  assert.equal(store.records[entry.replayId].reference.performance,1600);
  assert.match(store.records[entry.replayId].reference.refreshError,/offline/);
  await service.run(false);assert.equal(calls,1,'failure backoff prevents request storms');
  offline=false;store.records[entry.replayId].checkedAt=now-86400;
  await service.run(false);
  assert.equal(store.records[entry.replayId].reference.missingRatedCount,0);
  assert.equal(store.records[entry.replayId].reference.refreshError,undefined);
  assert.equal(Object.keys(store.records).length,1);
  const completedCalls=calls;store.records[entry.replayId].checkedAt=now-86400;
  await service.run(false);assert.equal(calls,completedCalls,'complete result does not keep refreshing');
});

test('newly ended retry precedes old backlog, while every fourth turn makes historical progress', async () => {
  const now = Date.now()/1000;
  const recent = {contestId:2000,replayId:'2000:virtual:100',participationType:'VIRTUAL',sessionStartTimeSeconds:now-8000,durationSeconds:7200,submissionFingerprint:'new'};
  const old = {contestId:1900,replayId:'1900',participationType:'CONTESTANT',startTimeSeconds:now-864000,durationSeconds:7200,submissionFingerprint:'old'};
  let store={handle:'fixture',records:{[recent.replayId]:{checkedAt:now-100,fingerprint:'new',reference:{status:'unavailable'}}}};
  const selected=[];
  const service=createCombinedRatingService({
    loadContext:async()=>({cache:{handle:'fixture',syncedAt:'fixed'},replay:{handle:'fixture',contests:[recent,old]},center:{}}),
    mergeReplay:(_,r)=>r,readStore:async()=>structuredClone(store),writeStore:async s=>{store=s;},
    fetchJson:async e=>{if(e.startsWith('user.status'))return [];selected.push(e);throw Error('fixture network failure');},
  });
  for(let i=0;i<4;i++) await service.run(i>0);
  assert.deepEqual(selected.map(e=>Number(e.split('=')[1])),[2000,2000,2000,1900]);
});

test('completion pushes an update without waiting for another renderer poll', async () => {
  let done;
  const received=new Promise(resolve=>{done=resolve;});
  const service=createCombinedRatingService({
    loadContext:async()=>({cache:{handle:'fixture'},replay:{handle:'fixture',contests:[]},center:{}}),
    mergeReplay:(_,r)=>r,readStore:async()=>({handle:'fixture'}),writeStore:async()=>{},fetchJson:async()=>[],
    onChanged:value=>done(value),
  });
  try { await service.get(); assert.equal((await received).handle,'fixture'); }
  finally { service.dispose(); }
});

test('known session end bypasses a previous failure backoff', async () => {
  const now=Date.now()/1000;
  const entry={contestId:2000,replayId:'2000:virtual:100',participationType:'VIRTUAL',sessionStartTimeSeconds:now-7201,durationSeconds:7200,submissionFingerprint:'same'};
  let requested=false;
  const service=createCombinedRatingService({
    loadContext:async()=>({cache:{handle:'fixture'},replay:{handle:'fixture',contests:[entry]},center:{}}),mergeReplay:(_,r)=>r,
    readStore:async()=>({handle:'fixture',records:{[entry.replayId]:{fingerprint:'same',checkedAt:now-2,failures:4,waitingUntil:now-1,reference:{status:'unavailable'}}}}),writeStore:async()=>{},
    fetchJson:async e=>{if(e.startsWith('user.status'))return [];requested=true;throw Error('fixture stop');},
  });
  await service.run(false);assert.equal(requested,true);
});

test('old heuristic exclusions are retried, official unrated exclusions are retained', async () => {
  for(const official of [false,true]) {
    const now=Date.now()/1000;let fetched=false;
    const entry={contestId:1900,replayId:'1900',participationType:'CONTESTANT',startTimeSeconds:now-9000,durationSeconds:7200,submissionFingerprint:'same'};
    const service=createCombinedRatingService({
      loadContext:async()=>({cache:{handle:'fixture'},replay:{handle:'fixture',contests:[entry]},center:{}}),mergeReplay:(_,r)=>r,
      readStore:async()=>({handle:'fixture',records:{1900:{checkedAt:now-1000,fingerprint:'same',reference:{status:'excluded',...(official?{exclusionReason:'official-unrated'}:{})}}}}),writeStore:async()=>{},
      fetchJson:async e=>{if(e.startsWith('user.status'))return [];fetched=true;throw Error('fixture stop');},
    });
    await service.run(false);assert.equal(fetched,!official);
  }
});

test('an active lease wakes at known session end without a second renderer request', {timeout:5000}, async () => {
  const now=Date.now()/1000;let fetched=false,resolve;
  const completed=new Promise(r=>{resolve=r;});
  const entry={contestId:1900,replayId:'1900',participationType:'CONTESTANT',startTimeSeconds:now-7199.5,durationSeconds:7200,submissionFingerprint:'same'};
  let store={handle:'fixture',records:{}};
  const service=createCombinedRatingService({
    loadContext:async()=>({cache:{handle:'fixture'},replay:{handle:'fixture',contests:[entry]},center:{}}),mergeReplay:(_,r)=>r,
    readStore:async()=>structuredClone(store),writeStore:async s=>{store=s;},
    fetchJson:async e=>{if(e.startsWith('user.status'))return [];fetched=true;throw Error('fixture data unavailable');},
    onChanged:()=>{if(fetched)resolve();},
  });
  // Keep Node alive while the production scheduler correctly uses unref timers.
  const guard=setTimeout(()=>resolve(),3000);
  try { await service.get();await completed;assert.equal(fetched,true);assert.ok(Date.now()/1000-now<2); }
  finally { clearTimeout(guard);service.dispose(); }
});
