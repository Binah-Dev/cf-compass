import { loadInitialData } from "./codeforces";
import { createTrainingSessionController, TrainingSessionError } from "./training-session-model.mjs";

export { summarizeTrainingSession } from "./training-session-model.mjs";
export const CUSTOM_TRAINING_STORAGE_KEY = "cf-compass-custom-training-v1";
const API_MIN_INTERVAL_MS = 2100;
let apiQueue = Promise.resolve();
let lastApiCallAt = 0;
let browserController;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function fetchTrainingApi(endpoint) {
  const task = apiQueue.then(async () => {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const delay = Math.max(0, API_MIN_INTERVAL_MS - (Date.now() - lastApiCallAt));
      if (delay) await wait(delay);
      try {
        const response = await fetch(`https://codeforces.com/api/${endpoint}`, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) {
          const error = new Error(`Codeforces request failed (HTTP ${response.status}).`);
          error.httpStatus = response.status;
          throw error;
        }
        const body = await response.json();
        if (body.status !== "OK") throw new Error(body.comment || "Codeforces API request failed.");
        return body.result;
      } catch (error) {
        lastError = error;
        if (error.httpStatus >= 400 && error.httpStatus < 500 && error.httpStatus !== 429) break;
      } finally { lastApiCallAt = Date.now(); }
    }
    throw lastError;
  });
  apiQueue = task.catch(() => undefined);
  return task;
}
function browserService() {
  if (!browserController) browserController = createTrainingSessionController({
    readStore: async () => {
      const raw = localStorage.getItem(CUSTOM_TRAINING_STORAGE_KEY);
      return raw ? JSON.parse(raw) : { version: 1, sessions: [] };
    },
    writeStore: async (store) => localStorage.setItem(CUSTOM_TRAINING_STORAGE_KEY, JSON.stringify(store)),
    loadContext: loadInitialData, fetchJson: fetchTrainingApi,
    withLock: globalThis.navigator?.locks?.request
      ? (task) => navigator.locks.request(CUSTOM_TRAINING_STORAGE_KEY, task) : null,
  });
  return browserController;
}
function call(bridgeMethod, method, ...args) {
  if (window.cfBridge?.[bridgeMethod]) return window.cfBridge[bridgeMethod](...args);
  if (window.cfBridge) return Promise.reject(new TrainingSessionError("TRAINING_BRIDGE_UNAVAILABLE", "Restart CF Compass to load the training service."));
  return browserService()[method](...args);
}
export const getTrainingSessions = () => call("getTrainingSessions", "get");
export const saveTrainingDraft = (input) => call("saveTrainingDraft", "saveDraft", input);
export const startTrainingSession = (id) => call("startTrainingSession", "start", id);
export const finishTrainingSession = (id) => call("finishTrainingSession", "finish", id);
export const cancelTrainingSession = (id) => call("cancelTrainingSession", "cancel", id);
export const syncTrainingSession = (id) => call("syncTrainingSession", "sync", id);
export const replaceTrainingSessions = (value) => call("replaceTrainingSessions", "replaceStore", value);
