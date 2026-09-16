const {performance,monitorEventLoopDelay}=require('node:perf_hooks');
const assert=require('node:assert/strict');
const {buildVirtualRating,cachedVirtualRating}=require('../electron/services/virtual-rating.cjs');
(async()=>{
 const field=Array.from({length:10000},(_,i)=>[800+i%2500,i+1]);
 const replay={handle:'benchmark',contests:Array.from({length:50},(_,i)=>({replayId:`1900:virtual:${1700000000+i*86400}`,contestId:1900,participationType:'VIRTUAL',sessionStartTimeSeconds:1700000000+i*86400,durationSeconds:7200,status:'ready',submissionFingerprint:String(i),virtualReference:{status:'ready',ratedEvidence:{contestId:1900,participants:10000},ratingField:field,referenceRank:5001,submissionFingerprint:String(i),performance:1600}}))};
 const cache={handle:'benchmark',ratingHistory:[]};
 const delay=monitorEventLoopDelay({resolution:10});delay.enable();
 const start=performance.now();const cold=await cachedVirtualRating(cache,replay);const coldMs=performance.now()-start;
 const samples=[];
 for(let i=0;i<10;i++){await new Promise(resolve=>setImmediate(resolve));const t=performance.now();assert.deepEqual(await cachedVirtualRating(cache,replay),cold);samples.push(performance.now()-t);}
 const before=performance.now();const plain=await buildVirtualRating(cache,replay);const recomputeMs=performance.now()-before;
 assert.deepEqual(plain,cold);assert.equal(cold.counted,50);
 delay.disable();samples.sort((a,b)=>a-b);
 const report={dataset:'50 sessions x 10000 rated opponents, synthetic',coldMs,recomputeMs,warmP50Ms:samples[5],warmP95Ms:samples[9],eventLoopP99Ms:delay.percentile(99)/1e6};
 console.log(JSON.stringify(report,null,2));
 assert.ok(samples[9]<250,'warm aggregation exceeds 250 ms');
})().catch(e=>{console.error(e);process.exitCode=1});
