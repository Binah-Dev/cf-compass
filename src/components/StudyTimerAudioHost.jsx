import { useEffect } from "react";

const MAXIMUM_PLAYBACK_MS = 15000;
const AUDIO_URL = "cf-timer-audio://local/";

// Only the main process sends playback commands, after checking timer mode.
// This persistent, hidden renderer keeps audio independent of visible windows.
export default function StudyTimerAudioHost() {
  useEffect(() => {
    const bridge = window.cfBridge;
    if (!bridge?.onStudyTimerAudioCommand) return undefined;
    let mounted = true;
    let active = null;
    let eventVersion = 0;
    const seen = new Set();
    const report = (value) => {
      if (mounted) Promise.resolve(bridge.studyTimerAudioPlayback?.(value)).catch(() => {});
    };

    const stop = (notify = true) => {
      if (!active) return;
      const previous = active;
      active = null;
      clearTimeout(previous.timeout);
      previous.audio.onended = null;
      previous.audio.onerror = null;
      previous.audio.pause();
      previous.audio.removeAttribute("src");
      previous.audio.load();
      if (notify) report({ id: previous.id, playing: false });
    };

    const command = (value) => {
      if (!mounted || !value || typeof value.id !== "string" || !value.id || value.id.length > 160) return;
      if (value.type === "stop") { stop(); return; }
      if (value.type !== "play" || !["default", "custom"].includes(value.source)
        || !["preview", "alarm"].includes(value.reason) || seen.has(value.id)) return;
      seen.add(value.id);
      // A bounded deduplication history is sufficient because main uses unique
      // occurrence IDs and never queues old alarms on a host reload.
      if (seen.size > 256) seen.delete(seen.values().next().value);
      stop();
      const state = { id: value.id, audio: null, source: value.source, fallback: false, timeout: null };
      active = state;
      let attempt = 0;
      state.timeout = setTimeout(() => { if (active === state) stop(); }, MAXIMUM_PLAYBACK_MS);
      const failed = (generation) => {
        if (active !== state || !mounted || generation !== attempt) return;
        if (state.source === "custom" && !state.fallback) {
          state.fallback = true;
          state.source = "default";
          // Keep the occurrence active while its fallback starts, so main
          // retains the command identity and the visible Stop control.
          report({ id: state.id, playing: true, error: "audio-unavailable" });
          play();
        } else {
          report({ id: state.id, playing: false, error: "audio-playback" });
          stop(false);
        }
      };
      const play = () => {
        const generation = ++attempt;
        if (state.audio) {
          state.audio.onended = null;
          state.audio.onerror = null;
          state.audio.pause();
          state.audio.removeAttribute("src");
          state.audio.load();
        }
        // A new element also isolates late error/rejection events from the
        // failed custom resource while the default fallback is playing.
        const audio = new Audio();
        state.audio = audio;
        audio.loop = false;
        audio.volume = 0.65;
        audio.onended = () => { if (active === state && generation === attempt) stop(); };
        audio.onerror = () => failed(generation);
        // Cache-busting is an occurrence token, never a filesystem path.
        audio.src = `${AUDIO_URL}${state.source}?id=${encodeURIComponent(state.id)}`;
        audio.play().then(() => {
          if (active === state && generation === attempt) report({ id: state.id, playing: true });
          else audio.pause();
        }).catch(() => failed(generation));
      };
      play();
    };

    const unsubscribe = bridge.onStudyTimerAudioCommand((value) => {
      eventVersion += 1;
      command(value);
    });
    const readyVersion = eventVersion;
    Promise.resolve(bridge.studyTimerAudioHostReady?.()).then((pending) => {
      // A reply captured before a newer stop/play event must not resurrect an
      // old occurrence, even when this host has never seen its ID before.
      if (mounted && eventVersion === readyVersion && pending) command(pending);
    }).catch(() => {});
    return () => { stop(); mounted = false; unsubscribe?.(); };
  }, []);
  return null;
}
