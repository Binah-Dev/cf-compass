const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildVirtualRating} = require('../electron/services/virtual-rating.cjs');
const {estimateVirtualReference} = require('../electron/services/virtual-reference.cjs');
const {makeReferenceFixture} = require('./fixtures/virtual-reference.cjs');
async function fixture() {
 const f=makeReferenceFixture();
 const ref=await estimateVirtualReference(f);
 const first={...f.entry,durationSeconds:7200,status:'ready',virtualReference:ref};
 const second={...first,replayId:first.replayId+'1',sessionStartTimeSeconds:first.sessionStartTimeSeconds+86400,virtualReference:{...ref,practicedBefore:true}};
 return {f,first,second,replay:{handle:f.cache.handle,contests:[second,first]}};
}
test('chronological cumulative deltas equal Carrot and include repeat sessions with warnings',async()=>{
 const {f,first,replay}=await fixture(); const original=JSON.stringify(f.cache);
 const result=await buildVirtualRating(f.cache,replay);
 assert.equal(result.counted,2); assert.equal(result.entries[0].id,first.replayId);
 assert.equal(result.entries[1].oldRating,result.entries[0].newRating);
 assert.equal(result.entries[1].practicedBefore,true);
 const {Contestant,RatingCalculator}=await import('../electron/carrot/predict.mjs');
 let r=result.baseline;
 for(const entry of result.entries){
  const contestants=first.virtualReference.ratingField.map(([rating,rank],i)=>Object.assign(new Contestant(String(i),0,0,rating),{rank}));
  const target=Object.assign(new Contestant('self',0,0,r),{rank:first.virtualReference.referenceRank});
  const c=new RatingCalculator([...contestants,target]);c.calculateSeed();c.calculateDeltas();c.adjustDeltas();
  r+=target.delta;assert.equal(entry.newRating,r);
 }
 assert.equal(JSON.stringify(f.cache),original);
 assert.deepEqual(await buildVirtualRating(f.cache,replay),result);
});
test('every session recorded, unavailable/unrated/stale never silently counted; retry rebuilds downstream',async()=>{
 const {f,first,second,replay}=await fixture();
 const complete=await buildVirtualRating(f.cache,replay);
 first.virtualReference={status:'unavailable',error:'No official Rated comparison'};
 const partial=await buildVirtualRating(f.cache,{...replay,contests:[first,second,second]});
 assert.equal(partial.total,2);assert.equal(partial.counted,1);assert.equal(partial.status,'partial');
 assert.equal(partial.entries[0].error,'No official Rated comparison');
 assert.equal(partial.entries[1].oldRating,partial.baseline);
 first.virtualReference=await estimateVirtualReference(f);
 assert.deepEqual(await buildVirtualRating(f.cache,replay),complete);
 first.submissionFingerprint='changed';assert.equal((await buildVirtualRating(f.cache,replay)).counted,1);
 assert.equal((await buildVirtualRating({...f.cache,handle:'other'},replay)).counted,0);
});
test('non-rated/no historical field is rejected; later official scores do not reset virtual history',async()=>{
 const {f,first,replay}=await fixture();
 await assert.rejects(estimateVirtualReference({...f,ratingChanges:[]}),/Rated/);
 await assert.rejects(estimateVirtualReference({...f,standings:{...f.standings,contest:{...f.standings.contest,type:'IOI'}}}),/赛制/);
 f.cache.ratingHistory=[{ratingUpdateTimeSeconds:first.sessionStartTimeSeconds-10,newRating:1700},{ratingUpdateTimeSeconds:first.sessionStartTimeSeconds+10,newRating:2800}];
 const result=await buildVirtualRating(f.cache,replay);assert.equal(result.baseline,1700);assert.equal(result.counted,2);
 first.virtualReference={status:'unavailable',reason:'NO_RATED_FIELD',error:'No official Rated results'};
 const excluded=await buildVirtualRating(f.cache,replay);
 assert.equal(excluded.entries[0].status,'excluded');assert.equal(excluded.excluded,1);assert.equal(excluded.counted,1);
});
test('losing sessions count too, cached recomputation invalidates when evidence changes',async()=>{
 const {cachedVirtualRating}=require('../electron/services/virtual-rating.cjs');
 const {f,replay,first,second}=await fixture();
 const bad=structuredClone(f);bad.standings.rows.find(r=>r.party.participantType==='VIRTUAL').points=0;
 first.virtualReference=await estimateVirtualReference({...bad,entry:first});
 const result=await cachedVirtualRating(f.cache,replay);
 assert.equal(result.counted,2);assert.ok(result.entries[0].delta<0);
 assert.deepEqual(await cachedVirtualRating(f.cache,replay),result);
 second.virtualReference={status:'unavailable',error:'offline'};
 assert.equal((await cachedVirtualRating(f.cache,replay)).counted,1);
});
test('two rating views switch user, rank, chart and training without mutating official data',async()=>{
 const {selectRatingView}=await import('../electron/shared/rating-view.mjs');
 const {resolveTrainingRating}=await import('../electron/shared/training-profile.mjs');
 const {f,replay}=await fixture();const estimate=await buildVirtualRating(f.cache,replay);
 const cache={...f.cache,ratingDistribution:{handle:f.cache.handle,ratings:[3000,2000,1000],syncedAt:'fixture'}};
 const study={trainingProfiles:{[cache.handle.toLowerCase()]:{displayRatingMode:'estimated',ratingMode:'manual',manualRating:900}}};
 const original=JSON.stringify(cache);const view=selectRatingView(cache,study,null,estimate);
 assert.equal(selectRatingView(cache,study,estimate).ratingMode,'official','retired virtual-only result must not masquerade as combined');
 assert.equal(view.user.rating,estimate.rating);assert.equal(view.ratingHistory.length,2);assert.equal(view.ratingStanding.estimated,true);
 assert.deepEqual(resolveTrainingRating(view.user,study),{rating:900,source:'manual',selected:[]});
 const automatic={trainingProfiles:{[cache.handle.toLowerCase()]:{displayRatingMode:'estimated',ratingMode:'auto'}}};
 assert.equal(resolveTrainingRating(view.user,automatic).source,'estimated');
 assert.equal(view.ratingStanding.position,1+cache.ratingDistribution.ratings.filter(r=>r>estimate.rating).length);
 const official=selectRatingView(cache,{},estimate);assert.equal(official.user.rating,cache.user.rating);assert.deepEqual(official.ratingHistory,cache.ratingHistory);
 assert.equal(JSON.stringify(cache),original);
 assert.equal(selectRatingView(cache,study,null,{...estimate,handle:'foreign'}).ratingMode,'official');
 assert.equal(selectRatingView(cache,study,null,{...estimate,rating:null}).estimatedPending,true);
});
