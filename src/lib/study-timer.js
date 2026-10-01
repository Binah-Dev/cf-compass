function requireTimerBridge() {
  if (!window.cfBridge?.getStudyTimer) throw new Error("计时表由 CF Compass 桌面端提供");
  return window.cfBridge;
}

export function getStudyTimer() { return requireTimerBridge().getStudyTimer(); }
export function controlStudyTimer(action) { return requireTimerBridge().controlStudyTimer(action); }
export function openStudyTimerWindow() { return requireTimerBridge().openStudyTimerWindow(); }
export function onStudyTimerChanged(callback) { return requireTimerBridge().onStudyTimerChanged(callback); }
export function getStudyTimerAudio() { return requireTimerBridge().getStudyTimerAudio(); }
export function chooseStudyTimerAudio() { return requireTimerBridge().chooseStudyTimerAudio(); }
export function resetStudyTimerAudio() { return requireTimerBridge().resetStudyTimerAudio(); }
export function previewStudyTimerAudio() { return requireTimerBridge().previewStudyTimerAudio(); }
export function stopStudyTimerAudio() { return requireTimerBridge().stopStudyTimerAudio(); }
export function onStudyTimerAudioChanged(callback) { return requireTimerBridge().onStudyTimerAudioChanged(callback); }
