// Keys remain the v1 contestQueue source of truth; snapshots only preserve display data.
export function queueProblemKey(problem) {
  return `${Number(problem.contestId)}-${String(problem.index)}`;
}
export function snapshotProblem(problem) {
  return {
    contestId: Number(problem.contestId), index: String(problem.index || "").slice(0, 20),
    name: String(problem.name || "").slice(0, 240),
    rating: Number(problem.rating) || null,
    tags: Array.isArray(problem.tags) ? problem.tags.slice(0, 20).map((tag) => String(tag).slice(0, 80)) : [],
  };
}
export function updateContestQueue(study, problems = [], removeKeys = []) {
  const removing = new Set(removeKeys);
  const queue = new Set((study?.contestQueue || []).filter((key) => !removing.has(key)));
  const snapshots = { ...(study?.contestQueueProblems || {}) };
  for (const problem of problems) {
    const key = queueProblemKey(problem);
    if (!/^[1-9]\d*-[A-Za-z0-9]+$/.test(key) || (!queue.has(key) && queue.size >= 1000)) continue;
    queue.add(key);
    snapshots[key] = snapshotProblem(problem);
  }
  return {
    ...study, contestQueue: [...queue],
    contestQueueProblems: Object.fromEntries([...queue].filter((key) => snapshots[key]).map((key) => [key, snapshots[key]])),
  };
}
export function buildContestQueue(study, data, center) {
  const known = new Map();
  for (const problem of Object.values(study?.contestQueueProblems || {})) known.set(queueProblemKey(problem), problem);
  for (const submission of data?.submissions || []) {
    const problem = submission?.problem;
    if (problem?.contestId && problem?.index) known.set(queueProblemKey(problem), { ...known.get(queueProblemKey(problem)), ...problem });
  }
  for (const detail of Object.values(center?.details || {})) {
    for (const problem of detail?.problems || []) known.set(queueProblemKey(problem), { ...known.get(queueProblemKey(problem)), ...problem });
  }
  for (const problem of data?.problems || []) known.set(queueProblemKey(problem), { ...known.get(queueProblemKey(problem)), ...problem });
  const solved = new Set((data?.submissions || []).filter((s) => s.verdict === "OK" && s.problem).map((s) => queueProblemKey(s.problem)));
  return [...new Set(study?.contestQueue || [])].map((key) => {
    const match = /^([1-9]\d*)-([A-Za-z0-9]+)$/.exec(key);
    const problem = known.get(key) || (match ? {
      contestId: Number(match[1]), index: match[2], name: `Problem ${match[1]}${match[2]}`,
    } : { name: key, index: "?", contestId: null });
    return { key, problem, solved: solved.has(key), metadataMissing: !known.has(key), canOpen: Boolean(match) };
  });
}

