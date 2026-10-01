function createStudyTimerService({ readStore, writeStore, now = Date.now, onChanged = () => {}, onElapsed = () => {}, shouldNotify = () => true }) {
  if (typeof readStore !== "function" || typeof writeStore !== "function") throw new TypeError("Timer storage callbacks are required.");
  const model = import("../../src/lib/study-timer-model.mjs");
  let state;
  let queue = Promise.resolve();
  let disposed = false;
  const unchanged = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const emit = (callback, snapshot) => {
    try {
      const result = callback(snapshot);
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch { /* A failed UI/OS notification must not roll back committed timer data. */ }
  };
  const enqueue = (operation) => {
    if (disposed) return Promise.reject(Object.assign(new Error("Timer service has been disposed."), { code: "STUDY_TIMER_DISPOSED" }));
    const pending = queue.then(operation);
    queue = pending.catch(() => {});
    return pending;
  };
  const persist = async (next, api, time, elapsed = false) => {
    if (unchanged(state, next)) return;
    // The in-memory anchor advances only after the atomic store write succeeds.
    await writeStore({ ...next });
    state = next;
    emit(onChanged, api.getTimerSnapshot(state, time));
    if (elapsed) {
      if (shouldNotify()) emit(onElapsed, api.getTimerSnapshot(state, time));
      else {
        // Quitting can begin while the notification marker write is awaiting
        // disk. Preserve the completion, but let the next launch deliver it.
        const deferred = { ...state, notifiedAt: null };
        await writeStore({ ...deferred });
        state = deferred;
        emit(onChanged, api.getTimerSnapshot(state, time));
      }
    }
  };
  const ready = async (api, time) => {
    if (!state) {
      const raw = await readStore();
      const restored = api.sanitizeTimerState(raw, time);
      if (!unchanged(raw, restored)) await writeStore({ ...restored });
      state = restored;
    }
    const snapshot = api.getTimerSnapshot(state, time);
    let next = snapshot.status !== state.status ? api.sanitizeTimerState(snapshot, time) : state;
    const elapsed = next.status === "completed" && next.notifiedAt == null && shouldNotify();
    if (elapsed) next = { ...next, notifiedAt: time, updatedAt: time };
    await persist(next, api, time, elapsed);
  };
  const inspect = () => enqueue(async () => {
    const api = await model;
    const time = now();
    await ready(api, time);
    return api.getTimerSnapshot(state, time);
  });
  return {
    getState: inspect,
    tick: inspect,
    dispatch: (action) => enqueue(async () => {
      const api = await model;
      const time = now();
      await ready(api, time);
      const next = api.transitionTimer(state, action, time);
      await persist(next, api, time);
      return api.getTimerSnapshot(state, time);
    }),
    dispose: () => { disposed = true; return queue; },
  };
}

module.exports = { createStudyTimerService };
