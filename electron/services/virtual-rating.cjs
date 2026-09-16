const VERSION = 'virtual-rating-v1';
const normalize = value => String(value || '').toLowerCase();
async function buildVirtualRating(cache, replay) {
  const handle = normalize(cache?.handle);
  if (!handle || normalize(replay?.handle) !== handle) return { handle, version: VERSION, entries: [], total: 0, counted: 0, rating: null, status: 'empty' };
  const seen = new Set();
  const sessions = (replay.contests || []).filter(entry => {
    if (entry.participationType !== 'VIRTUAL' || !entry.replayId || seen.has(entry.replayId)) return false;
    seen.add(entry.replayId); return true;
  }).sort((a,b) => a.sessionStartTimeSeconds - b.sessionStartTimeSeconds || a.replayId.localeCompare(b.replayId));
  const firstEligible = sessions.find(s => s.virtualReference?.status === 'ready' && s.virtualReference?.ratedEvidence?.contestId === s.contestId && s.virtualReference?.submissionFingerprint === s.submissionFingerprint);
  const prior = (cache.ratingHistory || []).filter(c => Number(c.ratingUpdateTimeSeconds) < Number(firstEligible?.sessionStartTimeSeconds) && Number.isInteger(c.newRating) && c.newRating >= -500 && c.newRating < 6000).sort((a,b)=>b.ratingUpdateTimeSeconds-a.ratingUpdateTimeSeconds)[0];
  const baseline = prior?.newRating ?? 1400;
  let rating = baseline, counted = 0;
  const entries = [];
  const { Contestant, RatingCalculator } = await import('../carrot/predict.mjs');
  for (const session of sessions) {
    // Let Electron service window/input events between independent sessions.
    await new Promise(resolve => setImmediate(resolve));
    const ref = session.virtualReference;
    const entry = { id:session.replayId, contestId:session.contestId, contestName:session.contestName, ratingUpdateTimeSeconds:Number(session.sessionStartTimeSeconds) + (Number(session.durationSeconds) || 0), oldRating:rating, newRating:rating, status:'pending', error:null, practicedBefore:Boolean(ref?.practicedBefore), performance:ref?.performance ?? null };
    if (session.status === 'error') { entry.status='unavailable'; entry.error=session.error || 'Replay unavailable'; }
    else if (ref?.status === 'unavailable') { entry.status=ref.reason==='NO_RATED_FIELD'?'excluded':'unavailable'; entry.error=ref.error; }
    else if (ref?.status === 'ready' && ref.ratedEvidence?.contestId === session.contestId && ref.ratedEvidence?.participants >= 2 && ref.submissionFingerprint === session.submissionFingerprint && Array.isArray(ref.ratingField) && entry.ratingUpdateTimeSeconds <= Date.now()/1000) {
      const field = ref.ratingField;
      if (field.length >= 2 && field.every(pair => Array.isArray(pair) && Number.isInteger(pair[0]) && pair[0]>=-500 && pair[0]<6000 && Number.isInteger(pair[1]) && pair[1]>0) && Number.isInteger(ref.referenceRank) && ref.referenceRank>0) {
        const contestants = field.map(([r,rank],i) => Object.assign(new Contestant(String(i),0,0,r),{rank}));
        const target = Object.assign(new Contestant('virtual-self',0,0,rating),{rank:ref.referenceRank});
        contestants.push(target);
        const calculator = new RatingCalculator(contestants);
        calculator.calculateSeed(); calculator.calculateDeltas(); calculator.adjustDeltas();
        const rawRating = rating + target.delta;
        rating = Math.max(-500,Math.min(5999,rawRating));
        Object.assign(entry,{status:'counted',newRating:rating,delta:rating-entry.oldRating,bounded:rawRating!==rating,missingRatedCount:ref.missingRatedCount || 0});
        counted++;
      } else {entry.status='unavailable';entry.error='Invalid rating field';}
    }
    entries.push(entry);
  }
  const excluded=entries.filter(e=>e.status==='excluded').length;
  return {version:VERSION,handle,baseline,baselineSource:prior?'official-before-first-virtual':'default-1400',rating:counted?rating:null,counted,total:entries.length,excluded,status:counted===entries.length-excluded && counted>0?'ready':counted?'partial':entries.length?'pending':'empty',entries};
}
let cachedKey, cachedResult, inFlight;
async function cachedVirtualRating(cache, replay) {
  const key=JSON.stringify([cache?.handle,cache?.ratingHistory,replay?.handle,(replay?.contests||[]).filter(e=>e.participationType==='VIRTUAL').map(e=>[e.replayId,e.contestId,e.contestName,e.sessionStartTimeSeconds,e.durationSeconds,e.status,e.error,e.submissionFingerprint,e.virtualReference])]);
  if(key===cachedKey) return cachedResult;
  if(inFlight?.key===key) return inFlight.promise;
  const task={key};
  task.promise=buildVirtualRating(cache,replay).then(result=>{cachedKey=key;cachedResult=result;return result;}).finally(()=>{if(inFlight===task)inFlight=null;});
  inFlight=task;
  return task.promise;
}
module.exports = {buildVirtualRating, cachedVirtualRating, VERSION};
