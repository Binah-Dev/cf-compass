const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;
const DEFAULT_DURATION = 25 * 60 * SECOND;
const MAX_DURATION = 7 * DAY;
const MAX_TARGET_DISTANCE = 366 * DAY;
const MAX_ELAPSED = 999 * DAY;
const MAX_TIMESTAMP = 8.64e15;
const MODES = new Set(["stopwatch", "countdown", "target"]);
const STATUSES = new Set(["idle", "running", "paused", "completed"]);

const timestamp = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP;
const clockTime = (value) => timestamp(value) ? value : Date.now();
const boundedElapsed = (value, maximum = MAX_ELAPSED) => Number.isFinite(value)
  ? Math.min(maximum, Math.max(0, Math.floor(value))) : 0;
const validDuration = (value) => Number.isSafeInteger(value) && value >= SECOND && value <= MAX_DURATION;
const failure = (code, message) => Object.assign(new Error(message), { code });

/** Persisted values contain anchors and accumulated time, never a renderer tick. */
export function sanitizeTimerState(value, now = Date.now()) {
  const time = clockTime(now);
  const source = value && typeof value === "object" && !Array.isArray(value) && (value.version == null || value.version === 1)
    ? value : {};
  const mode = MODES.has(source.mode) ? source.mode : "stopwatch";
  const durationMs = validDuration(source.durationMs) ? source.durationMs : DEFAULT_DURATION;
  const targetAt = timestamp(source.targetAt) ? source.targetAt : null;
  let status = STATUSES.has(source.status) ? source.status : "idle";
  let startedAt = timestamp(source.startedAt) ? source.startedAt : null;
  let completedAt = timestamp(source.completedAt) ? source.completedAt : null;
  let elapsedMs = boundedElapsed(source.accumulatedMs ?? source.elapsedMs, mode === "countdown" ? durationMs : MAX_ELAPSED);

  if ((status === "running" && startedAt == null) || (mode === "target" && (targetAt == null || status === "paused"))) status = "idle";
  if (status === "completed" && (mode === "stopwatch" || completedAt == null)) status = "idle";
  if (status === "idle") elapsedMs = 0;
  if (status !== "running") startedAt = null;
  if (status !== "completed") completedAt = null;
  if (status === "completed" && mode === "countdown") elapsedMs = durationMs;
  if (status === "completed" && mode === "target") completedAt = targetAt;

  return {
    version: 1, mode, status, elapsedMs, startedAt, durationMs, targetAt,
    completedAt,
    notifiedAt: status === "completed" && timestamp(source.notifiedAt) ? source.notifiedAt : null,
    updatedAt: timestamp(source.updatedAt) ? source.updatedAt : time,
  };
}

function advanceTimerState(value, now) {
  const state = sanitizeTimerState(value, now);
  if (state.status !== "running" || state.mode === "stopwatch") return state;
  const deadline = state.mode === "target" ? state.targetAt : state.startedAt + Math.max(0, state.durationMs - state.elapsedMs);
  if (now < deadline) return state;
  return {
    ...state, status: "completed", startedAt: null, completedAt: deadline,
    elapsedMs: state.mode === "countdown" ? state.durationMs
      : boundedElapsed(state.elapsedMs + Math.max(0, deadline - state.startedAt)),
    updatedAt: now,
  };
}

/** A snapshot projects the absolute clock without changing a running timer's stored anchor. */
export function getTimerSnapshot(value, now = Date.now()) {
  const time = clockTime(now);
  const state = advanceTimerState(value, time);
  const elapsedMs = boundedElapsed(state.elapsedMs + (state.status === "running" ? Math.max(0, time - state.startedAt) : 0),
    state.mode === "countdown" ? state.durationMs : MAX_ELAPSED);
  const remainingMs = state.mode === "stopwatch" ? null : state.status === "completed" ? 0 : state.mode === "countdown"
    ? Math.max(0, state.durationMs - elapsedMs)
    : state.targetAt == null ? 0 : Math.max(0, state.targetAt - time);
  return {
    ...state, accumulatedMs: state.elapsedMs, elapsedMs, remainingMs,
    displayMs: state.mode === "stopwatch" ? elapsedMs : remainingMs,
    isOverdue: state.status === "completed" && time > state.completedAt,
  };
}

/** Transitions are idempotent for repeated control clicks; settings are locked while active. */
export function transitionTimer(value, action, now = Date.now()) {
  const time = clockTime(now);
  const state = advanceTimerState(value, time);
  if (!action || typeof action !== "object" || Array.isArray(action)) throw failure("STUDY_TIMER_INVALID_ACTION", "Invalid timer action.");
  switch (action.type) {
    case "configure": {
      if (state.status === "running" || state.status === "paused") throw failure("STUDY_TIMER_BUSY", "Reset or cancel the timer before changing its settings.");
      if (!MODES.has(action.mode)) throw failure("STUDY_TIMER_INVALID_ACTION", "Invalid timer mode.");
      const durationMs = action.durationMs ?? state.durationMs;
      if (!validDuration(durationMs)) throw failure("STUDY_TIMER_INVALID_DURATION", "Countdown duration must be between one second and seven days.");
      const targetAt = action.mode === "target" ? action.targetAt ?? state.targetAt : null;
      if (action.mode === "target" && (!timestamp(targetAt) || targetAt <= time || targetAt - time > MAX_TARGET_DISTANCE)) {
        throw failure("STUDY_TIMER_INVALID_TARGET", "Choose a future target time within 366 days.");
      }
      return { ...state, mode: action.mode, status: "idle", elapsedMs: 0, startedAt: null,
        durationMs, targetAt, completedAt: null, notifiedAt: null, updatedAt: time };
    }
    case "start":
      if (state.status !== "idle") return state;
      if (state.mode === "target" && (!timestamp(state.targetAt) || state.targetAt <= time || state.targetAt - time > MAX_TARGET_DISTANCE)) {
        throw failure("STUDY_TIMER_INVALID_TARGET", "Choose a future target time within 366 days.");
      }
      return { ...state, status: "running", elapsedMs: 0, startedAt: time, completedAt: null, notifiedAt: null, updatedAt: time };
    case "pause":
      if (state.mode === "target") throw failure("STUDY_TIMER_FIXED_TARGET", "A fixed target time cannot be paused. Cancel it to change the target.");
      if (state.status !== "running") return state;
      return { ...state, status: "paused", elapsedMs: getTimerSnapshot(state, time).elapsedMs, startedAt: null, updatedAt: time };
    case "resume":
      if (state.mode === "target") throw failure("STUDY_TIMER_FIXED_TARGET", "A fixed target time cannot be resumed. Start a new target after cancelling.");
      if (state.status !== "paused") return state;
      return { ...state, status: "running", startedAt: time, updatedAt: time };
    case "reset":
    case "cancel":
      return { ...state, status: "idle", elapsedMs: 0, startedAt: null, completedAt: null, notifiedAt: null, updatedAt: time };
    default:
      throw failure("STUDY_TIMER_INVALID_ACTION", "Invalid timer action.");
  }
}

/** Hours continue past 24 so the timer never disguises a multi-day duration. */
export function formatTimerDuration(value) {
  const seconds = Math.floor(boundedElapsed(value) / SECOND);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
