const { randomUUID } = require("node:crypto");

function createCustomTrainingService(options) {
  const controller = import("../../src/lib/training-session-model.mjs").then(({ createTrainingSessionController }) =>
    createTrainingSessionController({ ...options, createId: () => randomUUID() }));
  const call = (method) => async (...args) => (await controller)[method](...args);
  return {
    get: call("get"), saveDraft: call("saveDraft"), start: call("start"),
    finish: call("finish"), cancel: call("cancel"), sync: call("sync"), replaceStore: call("replaceStore"),
  };
}

module.exports = { createCustomTrainingService };
