function requirePlanBridge() {
  if (!window.cfBridge?.getStudyPlan) throw new Error("计划题单仅在 CF Compass 桌面端提供");
  return window.cfBridge;
}

export function getStudyPlan() { return requirePlanBridge().getStudyPlan(); }
export function addStudyPlanProblem(problemKey) { return requirePlanBridge().addStudyPlanProblem(problemKey); }
export function setStudyPlanStatus(itemId, status) { return requirePlanBridge().setStudyPlanStatus(itemId, status); }
export function removeStudyPlanItem(itemId) { return requirePlanBridge().removeStudyPlanItem(itemId); }
export function reorderStudyPlan(itemIds) { return requirePlanBridge().reorderStudyPlan(itemIds); }
export function openStudyPlanWindow() { return requirePlanBridge().openStudyPlanWindow(); }
export function onStudyPlanChanged(callback) { return requirePlanBridge().onStudyPlanChanged(callback); }
