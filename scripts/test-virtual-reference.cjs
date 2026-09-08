const { test } = require("node:test");
const assert = require("node:assert/strict");
const { estimateVirtualReference } = require("../electron/services/virtual-reference.cjs");
const { mergeSessions } = require("../electron/services/contest-session.cjs");
const { makeReferenceFixture } = require("./fixtures/virtual-reference.cjs");
test("reference matches the existing complete Carrot insertion calculation", async () => {
  const f = makeReferenceFixture();
  const ref = await estimateVirtualReference(f);
  const carrot = await import("../electron/carrot/predict.mjs");
  const contestants = f.ratingChanges.map((c, i) => new carrot.Contestant(c.handle, f.standings.rows[i].points, 0, c.oldRating));
  const target = new carrot.Contestant("virtual", 1100, 0, 1400);
  contestants.push(target);
  carrot.default(contestants, true);
  assert.equal(ref.performance, target.performance);
  assert.equal(ref.referenceRank, target.rank);
  assert.equal(ref.participants, 4);
  assert.equal(ref.assumedRating, 1400);
  assert.equal(ref.status, "ready");
  assert.equal(f.entry.performance, undefined);
});
test("higher scores cannot lower the reference; boundaries are explicit", async () => {
  const values = [];
  for (const points of [0, 500, 1100, 1800, 2500]) {
    const f = makeReferenceFixture();
    f.standings.rows.at(-1).points = points;
    const ref = await estimateVirtualReference(f);
    values.push(ref.performance);
    if (points === 2500) assert.equal(ref.boundary, "upper");
  }
  assert.deepEqual(values, [...values].sort((a,b) => a-b));
});
test("wrong virtual start, practice identity, partial and missing cohort refuse estimation", async () => {
  for (const mutate of [
    (f) => { f.standings.rows.at(-1).party.startTimeSeconds += 1; },
    (f) => { f.standings.rows.at(-1).party.participantType = "PRACTICE"; },
    (f) => { f.standings.rows.at(-1).problemResults[0].type = "PRELIMINARY"; },
    (f) => { f.standings.rows.shift(); },
    (f) => { f.ratingChanges = []; },
    (f) => { f.standings.contest.phase = "CODING"; },
    (f) => { f.standings.contest.frozen = true; },
    (f) => { f.standings.contest.type = "IOI"; },
  ]) {
    const f = makeReferenceFixture(); mutate(f);
    await assert.rejects(estimateVirtualReference(f));
  }
});
test("unended virtual sessions, duplicate rows, malformed ratings are rejected", async () => {
  const future = makeReferenceFixture();
  future.nowSeconds = future.entry.sessionStartTimeSeconds + 100;
  await assert.rejects(estimateVirtualReference(future));
  const duplicate = makeReferenceFixture(); duplicate.standings.rows.push(duplicate.standings.rows.at(-1));
  await assert.rejects(estimateVirtualReference(duplicate));
  const invalid = makeReferenceFixture(); invalid.ratingChanges[0].oldRating = 10000;
  await assert.rejects(estimateVirtualReference(invalid));
});
test("own official result is excluded, and only pre-session Rating anchors are used", async () => {
  const f = makeReferenceFixture();
  f.ratingChanges.push({ contestId: 1900, handle: f.cache.handle, oldRating: 1700 });
  f.standings.rows.push({ ...f.standings.rows[0], party: { participantType: "CONTESTANT", members: [{ handle: f.cache.handle }] } });
  f.cache.ratingHistory = [
    { newRating: 1550, ratingUpdateTimeSeconds: f.entry.sessionStartTimeSeconds - 100 },
    { newRating: 2400, ratingUpdateTimeSeconds: f.entry.sessionStartTimeSeconds + 100 },
  ];
  const ref = await estimateVirtualReference(f);
  assert.equal(ref.participants, 4);
  assert.equal(ref.assumedRating, 1550);
  assert.equal(ref.assumedRatingSource, "rating-history-before-session");
});
test("ties are deterministic and previously solved problems are disclosed", async () => {
  const f = makeReferenceFixture();
  f.standings.rows.at(-1).points = 1000;
  f.entry.problems = [{ previouslySolved: true }];
  const first = await estimateVirtualReference(f);
  f.standings.rows.reverse();
  const second = await estimateVirtualReference(f);
  assert.equal(first.performance, second.performance);
  assert.equal(first.referenceRank, 3);
  assert.equal(first.practicedBefore, true);
});
test("reference survives refresh separately but invalidates when submissions change", async () => {
  const f = makeReferenceFixture();
  let replay = mergeSessions(f.cache, {}, f.center, () => ({}), 4);
  const entry = replay.contests.find((c) => c.replayId === f.entry.replayId);
  entry.virtualReference = await estimateVirtualReference({ ...f, entry });
  replay = mergeSessions(f.cache, replay, f.center, () => ({}), 4);
  const kept = replay.contests.find((c) => c.replayId === f.entry.replayId);
  assert.equal(kept.virtualReference.status, "ready");
  assert.equal(kept.performance, null);
  assert.equal(kept.officialRank, null);
  assert.equal(kept.ratingDelta, null);
  f.cache.submissions[0].verdict = "CHALLENGED";
  replay = mergeSessions(f.cache, replay, f.center, () => ({}), 4);
  assert.equal(replay.contests.find((c) => c.replayId === f.entry.replayId).virtualReference, null);
});
test("overall statistics are invariant even with an extremely high virtual reference", async () => {
  const { isOverallRatedEntry, virtualReferenceLabel } = await import("../src/lib/contest-reference.js");
  const official = [{ status: "ready", rated: true, performance: 1400 }, { status: "ready", rated: true, performance: 1800 }];
  const virtual = { status: "ready", participationType: "VIRTUAL", rated: false, performance: null,
    virtualReference: { status: "ready", performance: 6000, boundary: "upper" } };
  const summarize = (entries) => {
    const p = entries.filter(isOverallRatedEntry).map((e) => e.performance);
    return { average: p.reduce((a,b) => a+b,0)/p.length, best: Math.max(...p) };
  };
  assert.deepEqual(summarize([...official, virtual]), summarize(official));
  assert.deepEqual(summarize([...official, { ...virtual, rated: true, performance: 6000 }]), summarize(official));
  assert.equal(virtualReferenceLabel(virtual), "≥6000");
});
test("calculation latency is measured without claiming predictive accuracy", async () => {
  const f = makeReferenceFixture(), values = [];
  for (let i=0;i<7;i++) {
    const started=performance.now();
    await estimateVirtualReference(f);
    values.push(performance.now()-started);
  }
  values.sort((a,b)=>a-b);
  console.log(JSON.stringify({ dataset: "3 rated opponents + 1 virtual fixture", p50Ms: values[3], maxMs: values.at(-1) }));
  assert.ok(values.at(-1)<2000);
});

test("AI receives the reference only as explicitly unofficial session evidence", async () => {
  const f = makeReferenceFixture();
  const { buildContestContext } = require("../electron/services/ai-service.cjs");
  const ref = await estimateVirtualReference(f);
  const context = buildContestContext({ cache: f.cache, study: {}, contest: {
    ...f.entry, durationSeconds: 7200, problems: [], performance: null, ratingDelta: null, virtualReference: ref,
  } });
  assert.equal(context.contest.virtualReference.official, false);
  assert.equal(context.contest.virtualReference.excludedFromOverall, true);
  assert.equal(context.contest.performance, null);
  assert.equal(context.contest.ratingDelta, null);
});
test("10,000-opponent calculation remains bounded", async () => {
  const f = makeReferenceFixture();
  const virtual = f.standings.rows.at(-1);
  const prototype = f.standings.rows[0];
  f.ratingChanges = Array.from({length:10000},(_,i)=>({contestId:1900,handle:"rated_"+i,oldRating:800+i%2600}));
  f.standings.rows = f.ratingChanges.map((c,i)=>({...prototype,points:Math.floor(i/10),party:{participantType:"CONTESTANT",members:[{handle:c.handle}]}}));
  f.standings.rows.push(virtual);
  const started=performance.now();
  const result=await estimateVirtualReference(f);
  const elapsed=performance.now()-started;
  console.log(JSON.stringify({dataset:"10,000 synthetic Rated opponents",elapsedMs:elapsed}));
  assert.equal(result.participants,10001);
  assert.ok(elapsed<2000);
});

