const { createHash } = require("node:crypto");

const SESSION_VERSION = 1;
function replayKey(entry) {
  return String(entry?.replayId || entry?.contestId || "");
}
function virtualStart(submission) {
  const explicit = Number(submission?.author?.startTimeSeconds);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const relative = submission?.relativeTimeSeconds;
  const created = Number(submission?.creationTimeSeconds);
  if (relative != null && Number.isFinite(Number(relative)) && Number(relative) >= 0 &&
      Number(relative) < 2147483647 && created > Number(relative)) {
    return created - Number(relative);
  }
  return null;
}
function findReplayEntry(contests, id) {
  return (contests || []).find((entry) => replayKey(entry) === String(id));
}
function isSessionSubmission(submission, contest) {
  const contestId = Number(submission?.problem?.contestId || submission?.contestId);
  if (contestId !== Number(contest.contestId || contest.id)) return false;
  const type = submission?.author?.participantType || "CONTESTANT";
  const expected = contest.participationType || "CONTESTANT";
  if (type !== expected) return false;
  if (expected === "VIRTUAL" && (!contest.sessionStartTimeSeconds ||
      virtualStart(submission) !== Number(contest.sessionStartTimeSeconds))) return false;
  const duration = Number(contest.durationSeconds);
  if (!(duration > 0)) return false;
  const start = Number(contest.sessionStartTimeSeconds || contest.startTimeSeconds);
  const relative = submission?.relativeTimeSeconds == null
    ? Number(submission?.creationTimeSeconds) - start
    : Number(submission.relativeTimeSeconds);
  return Number.isFinite(relative) && relative >= 0 && relative <= duration;
}
function summarizeProblem(problem, contest, submissions) {
  const relevant = (submissions || []).filter((submission) =>
    Number(submission?.problem?.contestId || submission?.contestId) === Number(problem.contestId) &&
    String(submission?.problem?.index || "") === String(problem.index));
  const attempts = relevant.filter((submission) => isSessionSubmission(submission, contest))
    .sort((a, b) => Number(a.creationTimeSeconds) - Number(b.creationTimeSeconds) || Number(a.id) - Number(b.id));
  const accepted = attempts.find((submission) => submission.verdict === "OK");
  const allAccepted = relevant.filter((submission) => submission.verdict === "OK");
  const start = Number(contest.sessionStartTimeSeconds || contest.startTimeSeconds);
  const before = allAccepted.some((submission) => Number(submission.creationTimeSeconds) < start);
  const after = allAccepted.some((submission) => Number(submission.creationTimeSeconds) > start + Number(contest.durationSeconds || 0));
  return {
    contestResult: accepted ? "accepted" : attempts.length ? "attempted" : "not-attempted",
    contestAttempts: attempts.length,
    rejectedAttempts: attempts.filter((submission) =>
      submission.verdict && !["OK", "TESTING", "SUBMITTED"].includes(submission.verdict)).length,
    firstAcTimeSeconds: accepted
      ? accepted.relativeTimeSeconds != null ? Number(accepted.relativeTimeSeconds)
        : Number(accepted.creationTimeSeconds) - start
      : null,
    currentStatus: accepted ? "contest-ac" : before ? "pre-solved" : after ? "upsolved" : allAccepted.length ? "outside-session-ac" : "unsolved",
    currentAcCount: allAccepted.length,
    previouslySolved: before,
  };
}
function sessionTimeline(entry, submissions) {
  return (submissions || []).filter((submission) => isSessionSubmission(submission, entry))
    .sort((a, b) => Number(a.creationTimeSeconds) - Number(b.creationTimeSeconds) || Number(a.id) - Number(b.id))
    .slice(0, 1000).map((submission) => ({
      id: Number(submission.id),
      index: String(submission.problem?.index || ""),
      verdict: String(submission.verdict || "TESTING"),
      timeSeconds: submission.relativeTimeSeconds != null ? Number(submission.relativeTimeSeconds)
        : Number(submission.creationTimeSeconds) - Number(entry.sessionStartTimeSeconds || entry.startTimeSeconds),
    }));
}
function enrichSession(entry, metadata, problems, submissions) {
  const start = entry.participationType === "VIRTUAL"
    ? Number(entry.sessionStartTimeSeconds) : Number(metadata.startTimeSeconds || entry.startTimeSeconds);
  const result = {
    ...entry,
    sessionVersion: SESSION_VERSION,
    contestName: metadata.name || entry.contestName,
    startTimeSeconds: Number(metadata.startTimeSeconds || entry.startTimeSeconds) || 0,
    sessionStartTimeSeconds: start || null,
    dateSeconds: start || entry.dateSeconds,
    durationSeconds: Number(metadata.durationSeconds || entry.durationSeconds),
    contestType: String(metadata.type || entry.contestType || ""),
    status: "ready", error: null, retryCount: 0,
  };
  result.problems = problems.map((problem) => ({
    ...problem, contestId: entry.contestId,
    ...summarizeProblem({ ...problem, contestId: entry.contestId }, result, submissions),
  }));
  result.totalProblems = result.problems.length;
  result.solved = result.problems.filter((problem) => problem.contestResult === "accepted").length;
  result.timeline = sessionTimeline(result, submissions);
  if (!entry.rated) Object.assign(result, {
    oldRating: null, newRating: null, ratingDelta: null, officialRank: null,
    calculatedRank: null, performance: null, participants: null, points: null, penalty: null,
    calculationSource: "Codeforces submission history",
  });
  return result;
}
function mergeSessions(cache, previous, center, classify, version) {
  const handle = String(cache?.handle || cache?.user?.handle || "");
  const sameHandle = String(previous?.handle || "").toLowerCase() === handle.toLowerCase();
  const previousMap = new Map((sameHandle ? previous?.contests || [] : []).map((entry) => [replayKey(entry), entry]));
  const grouped = new Map();
  const descriptors = new Map();
  const metadata = new Map((center?.contests || []).map((contest) => [Number(contest.id), contest]));
  const recordedProblems = new Map();
  // The contest metadata is shared; performance and submissions are never shared.
  for (const entry of previousMap.values()) {
    if (!entry.problems?.length || !(Number(entry.durationSeconds) > 0)) continue;
    recordedProblems.set(Number(entry.contestId), entry.problems);
    if (!metadata.has(Number(entry.contestId))) metadata.set(Number(entry.contestId), {
      name: entry.contestName, startTimeSeconds: entry.startTimeSeconds,
      durationSeconds: entry.durationSeconds, type: entry.contestType,
    });
  }
  for (const change of cache?.ratingHistory || []) {
    const contestId = Number(change.contestId);
    if (!Number.isInteger(contestId) || contestId <= 0) continue;
    descriptors.set(String(contestId), {
      contestId, replayId: String(contestId), participationType: "CONTESTANT", rated: true,
      contestName: change.contestName, dateSeconds: Number(change.ratingUpdateTimeSeconds) || 0,
      oldRating: Number(change.oldRating) || 0, newRating: Number(change.newRating) || 0,
      ratingDelta: Number(change.newRating) - Number(change.oldRating),
      officialRank: Number(change.rank) || null,
    });
  }
  for (const submission of cache?.submissions || []) {
    const contestId = Number(submission?.problem?.contestId || submission?.contestId);
    if (!Number.isInteger(contestId) || contestId <= 0) continue;
    if (!grouped.has(contestId)) grouped.set(contestId, []);
    grouped.get(contestId).push(submission);
    const type = submission.author?.participantType;
    if (!["VIRTUAL", "CONTESTANT", "OUT_OF_COMPETITION"].includes(type)) continue;
    const start = type === "VIRTUAL" ? virtualStart(submission) : null;
    // Without a start timestamp, separate virtual attempts cannot be identified safely.
    if (type === "VIRTUAL" && !start) continue;
    const key = type === "VIRTUAL" ? `${contestId}:virtual:${start}`
      : type === "OUT_OF_COMPETITION" ? `${contestId}:unofficial` : String(contestId);
    if (!descriptors.has(key)) descriptors.set(key, {
      contestId, replayId: key, participationType: type, rated: false,
      sessionStartTimeSeconds: start, dateSeconds: start || Number(submission.creationTimeSeconds) || 0,
    });
  }
  const contests = [];
  for (const [key, descriptor] of descriptors) {
    const existing = previousMap.get(key);
    const meta = metadata.get(descriptor.contestId) || {};
    const submissions = grouped.get(descriptor.contestId) || [];
    const fingerprint = createHash("sha256").update(JSON.stringify(submissions.map((s) =>
      [s.id, s.verdict, s.relativeTimeSeconds, s.author?.participantType, virtualStart(s)]))).digest("hex").slice(0, 16);
    const unchanged = existing?.submissionFingerprint === fingerprint;
    let entry = {
      ...existing, ...descriptor,
      contestName: descriptor.contestName || meta.name || existing?.contestName || `Contest ${descriptor.contestId}`,
      status: existing?.status === "ready" && (!descriptor.rated || (existing.rated !== false && existing.performance != null)) ? "ready"
        : unchanged && existing?.status === "calculating" ? "calculating"
        : unchanged && existing?.status === "error" && previous.version >= version ? "error" : "pending",
      error: unchanged ? existing?.error || null : null,
      retryCount: unchanged ? Number(existing?.retryCount || 0) : 0,
      submissionFingerprint: fingerprint,
      virtualReference: existing?.virtualReference?.submissionFingerprint === fingerprint ? existing.virtualReference : null,
    };
    entry.category = classify(entry.contestName);
    const knownProblems = center?.details?.[descriptor.contestId]?.problems;
    const problems = knownProblems?.length ? knownProblems : existing?.problems?.length ? existing.problems : recordedProblems.get(descriptor.contestId);
    const durationSeconds = Number(meta.durationSeconds || existing?.durationSeconds);
    if (problems?.length && durationSeconds > 0 && (entry.status === "ready" || !entry.rated)) {
      entry = enrichSession(entry, { ...meta, durationSeconds }, problems, submissions);
    }
    contests.push(entry);
  }
  return { version, handle, syncedAt: new Date().toISOString(),
    contests: contests.sort((a, b) => b.dateSeconds - a.dateSeconds) };
}
module.exports = {
  replayKey, virtualStart, findReplayEntry, isSessionSubmission, summarizeProblem,
  sessionTimeline, enrichSession, mergeSessions,
};
