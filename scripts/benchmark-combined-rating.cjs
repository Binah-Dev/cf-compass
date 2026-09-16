const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const { buildCombinedRating, cachedCombinedRating } = require('../electron/services/combined-rating.cjs');
(async () => {
  const field = Array.from({length:10000},(_,i)=>[800+i%2500,i+1]);
  const replay = {handle:'benchmark',contests:Array.from({length:50},(_,i)=>({replayId:i%2?`1900:virtual:${1700000000+i*86400}`:String(1900+i),contestId:1900+i,
    participationType:i%2?'VIRTUAL':'CONTESTANT',startTimeSeconds:1700000000+i*86400,sessionStartTimeSeconds:1700000000+i*86400,durationSeconds:7200,submissionFingerprint:String(i),
    combinedReference:{status:'ready',ratedEvidence:{contestId:1900+i},ratingField:field,referenceRank:5001,submissionFingerprint:String(i),performance:1600}}))};
  const cache={handle:'benchmark',ratingHistory:[]};
  const start=performance.now(), cold=await cachedCombinedRating(cache,replay), coldMs=performance.now()-start;
  assert.equal(cold.counted,50);
  const samples=[];
  for(let i=0;i<15;i++){const start=performance.now();assert.deepEqual(await cachedCombinedRating(cache,replay),cold);samples.push(performance.now()-start);}
  const startPlain=performance.now();assert.deepEqual(await buildCombinedRating(cache,replay),cold);const plainMs=performance.now()-startPlain;
  samples.sort((a,b)=>a-b);
  const report={dataset:'50 mixed sessions x 10000 opponents, synthetic',coldMs,plainMs,warmP50Ms:samples[7],warmP95Ms:samples[14]};
  console.log(JSON.stringify(report));assert.ok(samples[14]<250);
})().catch(error=>{console.error(error);process.exitCode=1;});
