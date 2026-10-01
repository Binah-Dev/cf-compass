// Custom training never enters the official replay or estimated-rating stores.
export const TRAINING_STORE_VERSION = 1;
export const TRAINING_MAX_PROBLEMS = 100;
export const TRAINING_MIN_DURATION_SECONDS = 60;
export const TRAINING_MAX_DURATION_SECONDS = 86400;
const PENDING_VERDICTS = new Set(["TESTING", "SUBMITTED"]);
const SESSION_STATUSES = new Set(["draft", "running", "finished", "cancelled"]);

export class TrainingSessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrainingSessionError";
    this.code = code;
  }
}

function fail(code, message) { throw new TrainingSessionError(code, message); }
function seconds(value) {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function handleOf(context) {
  const cache = context?.cache || context;
  return String(cache?.handle || cache?.user?.handle || "").trim();
}
function sameHandle(left, right) {
  return Boolean(left && right) && String(left).toLowerCase() === String(right).toLowerCase();
}
export function normalizeTrainingProblemKey(value) {
  const match = String(value || "").trim().toUpperCase().match(/^(\d+)-([A-Z][A-Z0-9]*)$/);
  const contestId = Number(match?.[1]);
  return match && Number.isSafeInteger(contestId) && contestId > 0 ? `${contestId}-${match[2]}` : "";
}
function problemKey(problem) {
  return normalizeTrainingProblemKey(`${problem?.contestId}-${problem?.index}`);
}
function cleanProblem(problem) {
  const key = problemKey(problem);
  if (!key) return null;
  const [contestId, index] = key.split("-");
  const rating = Number(problem.rating);
  const priorAttempts = Number(problem.priorAttempts);
  return {
    key, contestId: Number(contestId), index,
    name: String(problem.name || key).slice(0, 240),
    rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    tags: Array.isArray(problem.tags) ? [...new Set(problem.tags.map(String))].slice(0, 20).map((tag) => tag.slice(0, 80)) : [],
    priorAttempts: Number.isFinite(priorAttempts) ? Math.max(0, Math.floor(priorAttempts)) : 0,
    priorAccepted: problem.priorAccepted === true,
  };
}
function isSingleAuthor(submission, handle) {
  const members = submission?.author?.members;
  return Array.isArray(members) && members.length === 1 && sameHandle(members[0]?.handle, handle) &&
    !submission.author?.teamId && !submission.author?.teamName && !submission.author?.ghost;
}

// PRACTICE is intentional: official, unofficial, virtual and team attempts have
// their own contest identity and must not be attributed to a custom training.
export function isTrainingSubmission(submission, session) {
  const start = seconds(session?.startTimeSeconds);
  const end = seconds(session?.endTimeSeconds);
  const created = seconds(submission?.creationTimeSeconds);
  const id = Number(submission?.id);
  if (start == null || end == null || created == null || created < start || created > end ||
      !Number.isSafeInteger(id) || id <= 0 || submission?.author?.participantType !== "PRACTICE" ||
      !isSingleAuthor(submission, session.handle)) return false;
  const key = problemKey(submission?.problem);
  return Boolean(key && session.problems?.some((problem) => problem.key === key || problemKey(problem) === key));
}
function cleanSubmission(submission) {
  const key = problemKey(submission.problem);
  const [contestId, index] = key.split("-");
  return {
    id: Number(submission.id), creationTimeSeconds: Number(submission.creationTimeSeconds),
    problem: { contestId: Number(contestId), index },
    author: { participantType: "PRACTICE", members: [{ handle: String(submission.author.members[0].handle) }] },
    verdict: String(submission.verdict || "TESTING").slice(0, 80),
  };
}
export function mergeTrainingSubmissions(session, incoming = []) {
  const byId = new Map();
  for (const submission of [...(Array.isArray(session?.submissions) ? session.submissions : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    if (isTrainingSubmission(submission, session)) byId.set(Number(submission.id), cleanSubmission(submission));
  }
  return [...byId.values()].sort((left, right) => left.creationTimeSeconds - right.creationTimeSeconds || left.id - right.id);
}
export function sanitizeTrainingStore(value) {
  if (value?.version != null && value.version !== TRAINING_STORE_VERSION) {
    fail("TRAINING_STORE_VERSION", "This training store version is unsupported.");
  }
  const seen = new Set();
  const sessions = [];
  for (const source of Array.isArray(value?.sessions) ? value.sessions : []) {
    if (!source || typeof source !== "object") continue;
    const id = String(source.id || "").trim().slice(0, 100);
    const handle = handleOf(source);
    const durationSeconds = Number(source.durationSeconds);
    if (!id || seen.has(id) || !/^[a-zA-Z0-9_.-]{3,24}$/.test(handle) ||
        !Number.isInteger(durationSeconds) || durationSeconds < TRAINING_MIN_DURATION_SECONDS || durationSeconds > TRAINING_MAX_DURATION_SECONDS) continue;
    const problemIds = new Set();
    const problems = (Array.isArray(source.problems) ? source.problems : []).map(cleanProblem)
      .filter((problem) => problem && !problemIds.has(problem.key) && problemIds.add(problem.key)).slice(0, TRAINING_MAX_PROBLEMS);
    if (!problems.length) continue;
    const status = SESSION_STATUSES.has(source.status) ? source.status : "draft";
    const start = seconds(source.startTimeSeconds);
    const session = {
      id, title: String(source.title || "").trim().slice(0, 120), handle, durationSeconds,
      hideTags: source.hideTags === true, hideRating: source.hideRating === true,
      problems, status, createdAtSeconds: seconds(source.createdAtSeconds) ?? 0,
      startTimeSeconds: status === "draft" ? null : start,
      endTimeSeconds: status === "draft" || start == null ? null : Math.max(start, Math.min(seconds(source.endTimeSeconds) ?? start + durationSeconds, start + durationSeconds)),
      submissions: [], lastSyncAtSeconds: seconds(source.lastSyncAtSeconds),
      syncError: source.syncError ? String(source.syncError).slice(0, 500) : null,
    };
    if (status === "running" && start == null) continue;
    session.submissions = mergeTrainingSubmissions(session, source.submissions);
    seen.add(id);
    sessions.push(session);
  }
  return { version: TRAINING_STORE_VERSION, importEpoch: String(value?.importEpoch || "").slice(0, 100), sessions };
}
export function expireTrainingStore(value, nowSeconds) {
  const store = sanitizeTrainingStore(value);
  return {
    ...store,
    sessions: store.sessions.map((session) => session.status === "running" && nowSeconds >= session.endTimeSeconds
      ? { ...session, status: "finished" } : session),
  };
}
export function summarizeTrainingSession(session) {
  const submissions = mergeTrainingSubmissions(session);
  const grouped = new Map();
  for (const submission of submissions) {
    const key = problemKey(submission.problem);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(submission);
  }
  const problems = (session?.problems || []).map((problem) => {
    const attempts = grouped.get(problem.key || problemKey(problem)) || [];
    const accepted = attempts.find((submission) => submission.verdict === "OK");
    const pending = attempts.some((submission) => PENDING_VERDICTS.has(submission.verdict));
    return {
      ...problem,
      status: accepted ? "accepted" : pending ? "pending" : attempts.length ? "wrong" : "unattempted",
      firstAcSeconds: accepted ? accepted.creationTimeSeconds - session.startTimeSeconds : null,
      wrongAttempts: attempts.filter((submission) => submission.verdict !== "OK" && !PENDING_VERDICTS.has(submission.verdict)).length,
      attempts: attempts.length,
    };
  });
  const firstAc = problems.map((problem) => problem.firstAcSeconds).filter((value) => value != null);
  return {
    solved: problems.filter((problem) => problem.status === "accepted").length,
    total: problems.length, firstAcSeconds: firstAc.length ? Math.min(...firstAc) : null,
    wrongAttempts: problems.reduce((sum, problem) => sum + problem.wrongAttempts, 0),
    pending: submissions.filter((submission) => PENDING_VERDICTS.has(submission.verdict)).length,
    problems,
  };
}
function priorProblemRecords(cache, handle, cutoff, inclusive = true) {
  const prior = new Map();
  const seen = new Set();
  for (const submission of Array.isArray(cache?.submissions) ? cache.submissions : []) {
    const key = problemKey(submission?.problem);
    const created = seconds(submission?.creationTimeSeconds);
    const id = Number(submission?.id);
    if (!key || !Number.isSafeInteger(id) || id <= 0 || seen.has(id) || !isSingleAuthor(submission, handle) ||
        created == null || (inclusive ? created > cutoff : created >= cutoff)) continue;
    seen.add(id);
    const record = prior.get(key) || { priorAttempts: 0, priorAccepted: false };
    record.priorAttempts += 1;
    record.priorAccepted ||= submission.verdict === "OK";
    prior.set(key, record);
  }
  return prior;
}
export function createTrainingDraft(input, context, nowSeconds, id) {
  const cache = context?.cache || context;
  const handle = handleOf(cache);
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(handle)) fail("TRAINING_NO_ACCOUNT", "Sync a Codeforces account before creating a training.");
  const keys = Array.isArray(input?.problemKeys) ? input.problemKeys.map(normalizeTrainingProblemKey) : [];
  if (!keys.length || keys.length > TRAINING_MAX_PROBLEMS || keys.some((key) => !key) || new Set(keys).size !== keys.length) {
    fail("TRAINING_INVALID_PROBLEMS", "Select between 1 and 100 different valid problems.");
  }
  const durationSeconds = Number(input.durationSeconds);
  if (!Number.isInteger(durationSeconds) || durationSeconds < TRAINING_MIN_DURATION_SECONDS || durationSeconds > TRAINING_MAX_DURATION_SECONDS) {
    fail("TRAINING_INVALID_DURATION", "Training duration must be between 1 minute and 24 hours.");
  }
  const catalog = new Map((Array.isArray(cache?.problems) ? cache.problems : []).map((problem) => [problemKey(problem), problem]));
  const prior = priorProblemRecords(cache, handle, nowSeconds);
  const problems = keys.map((key) => {
    if (!catalog.has(key)) fail("TRAINING_PROBLEM_UNAVAILABLE", `Problem ${key} is missing from the local problem library.`);
    return { ...cleanProblem(catalog.get(key)), ...(prior.get(key) || { priorAttempts: 0, priorAccepted: false }) };
  });
  return {
    id, title: String(input.title || "").trim().slice(0, 120), handle, durationSeconds,
    hideTags: input.hideTags === true, hideRating: input.hideRating === true,
    problems, status: "draft", createdAtSeconds: nowSeconds,
    startTimeSeconds: null, endTimeSeconds: null, submissions: [], lastSyncAtSeconds: null, syncError: null,
  };
}

// The same controller is used in Electron and the browser. I/O is injected;
// each short read-modify-write is serialized, while HTTP never holds that lock.
export function createTrainingSessionController({ readStore, writeStore, loadContext, fetchJson,
  now = () => Math.floor(Date.now() / 1000), createId = () => globalThis.crypto.randomUUID(), withLock = null,
  pageSize = 1000, maxPages = 100 }) {
  let queue = Promise.resolve();
  let generation = 0;
  const syncing = new Map();
  const currentTime = () => {
    const value = seconds(Math.floor(now()));
    if (value == null) fail("TRAINING_INVALID_CLOCK", "Training clock is invalid.");
    return value;
  };
  function serial(task) {
    const work = queue.then(() => withLock ? withLock(task) : task());
    queue = work.catch(() => undefined);
    return work;
  }
  async function read() {
    const source = sanitizeTrainingStore(await readStore());
    const store = expireTrainingStore(source, currentTime());
    if (source.sessions.some((session, index) => session.status !== store.sessions[index].status)) await writeStore(store);
    return store;
  }
  function find(store, id) {
    const session = store.sessions.find((item) => item.id === String(id || ""));
    if (!session) fail("TRAINING_SESSION_MISSING", "This training session no longer exists.");
    return session;
  }
  async function assertAccount(session, context = null) {
    if (!sameHandle(session.handle, handleOf(context || await loadContext()))) {
      fail("TRAINING_ACCOUNT_MISMATCH", "Switch back to the Codeforces account saved with this training.");
    }
  }
  async function replaceSession(store, next) {
    const result = { ...store, sessions: store.sessions.map((session) => session.id === next.id ? next : session) };
    await writeStore(result);
    return result;
  }
  function get() { return serial(read); }
  function replaceStore(value) {
    return serial(async () => {
      const store = { ...expireTrainingStore(value, currentTime()), importEpoch: createId() };
      await writeStore(store);
      generation += 1;
      return store;
    });
  }
  function saveDraft(input) {
    return serial(async () => {
      const store = await read();
      const existing = input?.id ? find(store, input.id) : null;
      if (existing && existing.status !== "draft") fail("TRAINING_SESSION_LOCKED", "Started training problems and settings are locked.");
      const context = await loadContext();
      if (existing) await assertAccount(existing, context);
      const draft = createTrainingDraft(input, context, currentTime(), existing?.id || createId());
      if (existing) return replaceSession(store, { ...draft, createdAtSeconds: existing.createdAtSeconds });
      // A double-click on Save without an ID reuses an identical existing draft.
      const identical = store.sessions.find((session) => session.status === "draft" && sameHandle(session.handle, draft.handle) &&
        session.title === draft.title && session.durationSeconds === draft.durationSeconds && session.hideTags === draft.hideTags && session.hideRating === draft.hideRating &&
        session.problems.map((problem) => problem.key).join(",") === draft.problems.map((problem) => problem.key).join(","));
      if (identical) return replaceSession(store, { ...draft, id: identical.id, createdAtSeconds: identical.createdAtSeconds });
      const result = { ...store, sessions: [draft, ...store.sessions] };
      await writeStore(result);
      return result;
    });
  }
  function start(id) {
    return serial(async () => {
      const store = await read();
      const session = find(store, id);
      const context = await loadContext();
      await assertAccount(session, context);
      if (session.status === "running") return store;
      if (session.status !== "draft") fail("TRAINING_SESSION_LOCKED", "This training has already ended or been cancelled.");
      if (store.sessions.some((item) => item.status === "running")) fail("TRAINING_ALREADY_RUNNING", "Finish or cancel the running training first.");
      const startTimeSeconds = currentTime();
      const prior = priorProblemRecords(context?.cache || context, session.handle, startTimeSeconds, false);
      const problems = session.problems.map((problem) => ({ ...problem, ...(prior.get(problem.key) || { priorAttempts: 0, priorAccepted: false }) }));
      return replaceSession(store, { ...session, problems, status: "running", startTimeSeconds, endTimeSeconds: startTimeSeconds + session.durationSeconds });
    });
  }
  function close(id, status) {
    return serial(async () => {
      const store = await read();
      const session = find(store, id);
      if (session.status === "finished" || session.status === "cancelled") return store;
      if (session.status === "draft" && status === "finished") fail("TRAINING_NOT_STARTED", "Start the training before finishing it.");
      const next = { ...session, status,
        endTimeSeconds: session.startTimeSeconds == null ? null : Math.max(session.startTimeSeconds, Math.min(session.endTimeSeconds, currentTime())) };
      next.submissions = mergeTrainingSubmissions(next);
      return replaceSession(store, next);
    });
  }
  async function fetchSubmissions(session) {
    const result = [];
    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      const page = await fetchJson(`user.status?handle=${encodeURIComponent(session.handle)}&from=${pageNumber * pageSize + 1}&count=${pageSize}`);
      if (!Array.isArray(page)) fail("TRAINING_SYNC_RESPONSE", "Codeforces returned an invalid submission list.");
      result.push(...page);
      // Read all pages back to the start, including previously seen IDs: a
      // TESTING verdict may have changed and offline submissions may be older.
      if (page.length < pageSize || page.some((submission) => seconds(submission?.creationTimeSeconds) != null && submission.creationTimeSeconds < session.startTimeSeconds)) return result;
    }
    fail("TRAINING_SYNC_LIMIT", "The submission history is too large to finish this sync. Please retry later.");
  }
  function sync(id) {
    const key = `${generation}:${String(id || "")}`;
    if (syncing.has(key)) return syncing.get(key);
    const task = (async () => {
      const prepared = await serial(async () => {
        const store = await read();
        const session = find(store, id);
        await assertAccount(session);
        if (session.startTimeSeconds == null) fail("TRAINING_NOT_STARTED", "Start the training before syncing submissions.");
        return { session, generation, importEpoch: store.importEpoch };
      });
      let incoming = [];
      let failure = null;
      try { incoming = await fetchSubmissions(prepared.session); }
      catch (error) { failure = String(error?.message || error).slice(0, 500); }
      return serial(async () => {
        const store = await read();
        // Import/replacement invalidates any fetch started against the old store.
        if (prepared.generation !== generation || prepared.importEpoch !== store.importEpoch) return store;
        const session = find(store, id);
        await assertAccount(session);
        if (failure) return replaceSession(store, { ...session, syncError: failure });
        return replaceSession(store, {
          ...session, submissions: mergeTrainingSubmissions(session, incoming),
          lastSyncAtSeconds: currentTime(), syncError: null,
        });
      });
    })();
    syncing.set(key, task);
    task.finally(() => { if (syncing.get(key) === task) syncing.delete(key); }).catch(() => undefined);
    return task;
  }
  return { get, saveDraft, start, finish: (id) => close(id, "finished"), cancel: (id) => close(id, "cancelled"), sync, replaceStore };
}
