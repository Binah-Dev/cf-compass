import { AlarmClock, Bell, BellOff, CalendarClock, Clock3, LoaderCircle, Pause, Play, RotateCcw, Square, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { studyTimerMessages } from "../i18n/en-US";
import { loadStudyData, onStudyDataChanged } from "../lib/study";
import { formatTimerDuration, getTimerSnapshot } from "../lib/study-timer-model.mjs";
import {
  chooseStudyTimerAudio, controlStudyTimer, getStudyTimer, getStudyTimerAudio,
  onStudyTimerAudioChanged, onStudyTimerChanged, previewStudyTimerAudio,
  resetStudyTimerAudio, stopStudyTimerAudio,
} from "../lib/study-timer";

const chinese = {
  title: "计划计时表", intro: "给一道题留一段专注时间", stopwatch: "正向计时", countdown: "反向计时", target: "定点计时",
  idle: "准备就绪", running: "正在计时", paused: "已暂停", completed: "计时已结束", elapsed: "已计时", remaining: "剩余时间",
  hours: "小时", minutes: "分钟", seconds: "秒", duration: "倒计时时长", durationHint: "1 秒至 7 天；分钟和秒为 0–59。",
  targetDate: "结束日期与时刻", targetHint: "指定本地结束时刻；可跨日，最远 366 天。", timezone: "本地时区", today: "今日", tomorrow: "明日", crossDay: "跨日", pastDay: "已到日期",
  targetAbsolute: "到达指定时刻即结束。定点计时不能暂停；取消后可修改结束时刻。",
  start: "开始", pause: "暂停", resume: "继续", reset: "重置", cancel: "取消定点计时", startAgain: "重新开始", resetHint: "重置会停止本次计时并清零。",
  switchHint: "本次计时已锁定模式。先重置或取消，再切换模式。", stopwatchHint: "按真实时间累计；暂停期间不计时。", countdownHint: "暂停保留剩余时长，继续后从剩余时间计算。",
  finished: "时间到了", completedHint: "本次计时已结束；关闭窗口后仍保留提示。", recoveredHint: "休眠或退出期间到达时刻，恢复后已补记结果。",
  lifecycle: "点击开始后自动保存计时状态；尚未开始的输入不会保存。运行中的计时在切页、最小化或关闭此窗口后继续；退出应用后仍按真实时间恢复，已暂停的计时保持暂停。",
  audioLifecycle: "定点计时：应用运行时，即使关闭此窗口仍会响铃；应用完全退出或系统休眠时无法准时响铃，恢复后补提示。",
  silent: "此模式静音，到时只显示提示。", loading: "正在读取计时表…", working: "正在处理…", loadFailed: "计时表读取失败，请重试。", failed: "操作未完成，请重试。", retry: "重试",
  invalidDuration: "请输入 1 秒至 7 天的整数时长，分钟和秒不能超过 59。", invalidTarget: "请选择未来 366 天内的有效本地日期与时刻。", busy: "计时中不能切换模式，请先重置或取消。", fixedTarget: "定点计时不能暂停，请取消后修改时刻。",
  audio: "到时铃声", defaultAudio: "默认短铃声", customAudio: "本地音频", chooseAudio: "选择本地音频", resetAudio: "使用默认铃声", previewAudio: "试听铃声", stopAudio: "停止铃声", audioHint: "本地音频最大 20 MB。试听和到时响铃最多 15 秒；仅定点计时可发声。", audioFailed: "音频未能播放，请选择其他文件或使用默认铃声。", audioMissing: "保存的音频已缺失，将使用默认铃声。", audioFallback: "自定义音频无法播放，已改用默认铃声。", audioFormat: "请选择 MP3、WAV、OGG、M4A、AAC 或 FLAC 音频。", audioTooLarge: "音频文件不能为空，且不能超过 20 MB。",
};

const modes = [
  { id: "stopwatch", icon: Timer },
  { id: "countdown", icon: Clock3 },
  { id: "target", icon: CalendarClock },
];

function localDateTimeValue(timestamp) {
  const date = new Date(timestamp);
  const part = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

function defaultTarget() {
  return localDateTimeValue(Math.ceil((Date.now() + 60 * 60 * 1000) / 60000) * 60000);
}

function localDay(timestamp) {
  const date = new Date(timestamp);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function timerError(reason) {
  const code = `${reason?.code || ""} ${reason?.message || ""}`;
  if (code.includes("STUDY_TIMER_INVALID_DURATION")) return "invalidDuration";
  if (code.includes("STUDY_TIMER_INVALID_TARGET")) return "invalidTarget";
  if (code.includes("STUDY_TIMER_BUSY")) return "busy";
  if (code.includes("STUDY_TIMER_FIXED_TARGET")) return "fixedTarget";
  if (code.includes("audio-format")) return "audioFormat";
  if (code.includes("audio-too-large")) return "audioTooLarge";
  if (code.includes("audio-")) return "audioFailed";
  return "failed";
}

export default function StudyTimerWindow() {
  const { locale, setLocale } = useI18n();
  const messages = locale === "en-US" ? studyTimerMessages : chinese;
  const [timer, setTimer] = useState(null);
  const [appearance, setAppearance] = useState({});
  const [audio, setAudio] = useState({ source: "default", name: "", playing: false });
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("25");
  const [seconds, setSeconds] = useState("0");
  const [targetValue, setTargetValue] = useState(defaultTarget);
  const busyRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    getStudyTimer().then((state) => { if (active) setTimer(state); }).catch(() => { if (active) setError("loadFailed"); });
    getStudyTimerAudio().then((state) => { if (active) setAudio(state); }).catch(() => undefined);
    loadStudyData().then((study) => { if (active) setAppearance(study.settings || {}); }).catch(() => undefined);
    const disposeTimer = onStudyTimerChanged((state) => { if (active) setTimer(state); });
    const disposeAudio = onStudyTimerAudioChanged((state) => { if (active) setAudio(state); });
    const disposeStudy = onStudyDataChanged((study) => { if (active) setAppearance(study.settings || {}); });
    const update = () => { if (active) setNow(Date.now()); };
    const refresh = () => {
      update();
      getStudyTimer().then((state) => { if (active) setTimer(state); }).catch(() => undefined);
    };
    const heartbeat = window.setInterval(update, 250);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      mounted.current = false;
      disposeTimer?.(); disposeAudio?.(); disposeStudy?.();
      window.clearInterval(heartbeat);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
    // Each live renderer subscribes once; language changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (appearance.language) setLocale(appearance.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance.language]);

  useEffect(() => {
    if (!timer) return;
    const duration = Math.floor((timer.durationMs || 25 * 60000) / 1000);
    setHours(String(Math.floor(duration / 3600)));
    setMinutes(String(Math.floor(duration / 60) % 60));
    setSeconds(String(duration % 60));
    if (timer.targetAt) setTargetValue(localDateTimeValue(timer.targetAt));
  }, [timer?.mode, timer?.durationMs, timer?.targetAt]);

  async function perform(action) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      if (mounted.current) setError(timerError(reason));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function dispatch(action) {
    const state = await controlStudyTimer(action);
    if (mounted.current) { setTimer(state); setNow(Date.now()); }
    return state;
  }

  function configuration(mode) {
    if (mode === "countdown") {
      const values = [hours, minutes, seconds].map((value) => value.trim());
      if (values.some((value) => !/^\d+$/.test(value))) throw new Error("STUDY_TIMER_INVALID_DURATION");
      const [h, m, s] = values.map(Number);
      const durationMs = ((h * 60 + m) * 60 + s) * 1000;
      if (m > 59 || s > 59 || durationMs < 1000 || durationMs > 7 * 86400000) throw new Error("STUDY_TIMER_INVALID_DURATION");
      return { type: "configure", mode, durationMs };
    }
    if (mode === "target") {
      const targetAt = new Date(targetValue).getTime();
      if (!Number.isFinite(targetAt) || targetAt <= Date.now() || targetAt - Date.now() > 366 * 86400000) throw new Error("STUDY_TIMER_INVALID_TARGET");
      // Reject DST gaps rather than silently normalizing to another wall-clock time.
      if (localDateTimeValue(targetAt) !== targetValue) throw new Error("STUDY_TIMER_INVALID_TARGET");
      return { type: "configure", mode, targetAt };
    }
    return { type: "configure", mode };
  }

  function switchMode(mode) {
    if (!timer || timer.mode === mode || timer.status === "running" || timer.status === "paused") return;
    perform(async () => {
      await stopStudyTimerAudio();
      // A previous target may have expired. Switching modes creates a fresh future default.
      const nextTarget = timer.targetAt > Date.now() ? timer.targetAt : new Date(defaultTarget()).getTime();
      const next = { type: "configure", mode };
      if (mode === "target") next.targetAt = nextTarget;
      if (mode === "countdown") next.durationMs = timer.durationMs || 25 * 60000;
      await dispatch(next);
    });
  }

  function start() {
    perform(async () => {
      await stopStudyTimerAudio();
      await dispatch(configuration(timer.mode));
      await dispatch({ type: "start" });
    });
  }

  function stop(type) {
    perform(async () => {
      await stopStudyTimerAudio();
      await dispatch({ type });
    });
  }

  function audioAction(action) {
    perform(async () => {
      const state = await action();
      if (mounted.current && state) setAudio(state);
    });
  }

  const mode = timer?.mode || "stopwatch";
  const snapshot = timer ? getTimerSnapshot(timer, now) : null;
  const locked = timer?.status === "running" || timer?.status === "paused";
  const editable = !locked;
  const completed = snapshot?.status === "completed";
  const draftDurationMs = ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000;
  const displayMs = timer?.status === "idle" && mode === "countdown" ? draftDurationMs
    : timer?.status === "idle" && mode === "target" ? Math.max(0, new Date(targetValue).getTime() - now)
    : snapshot?.displayMs || 0;
  const activeTarget = locked || completed ? timer?.targetAt : new Date(targetValue).getTime();
  const targetDate = Number.isFinite(activeTarget) ? new Date(activeTarget) : null;
  const dayDifference = targetDate ? Math.round((localDay(activeTarget) - localDay(now)) / 86400000) : 0;
  const dayLabel = dayDifference === 0 ? messages.today : dayDifference === 1 ? messages.tomorrow : dayDifference > 1 ? messages.crossDay : messages.pastDay;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  const timezoneOffset = targetDate ? -targetDate.getTimezoneOffset() : -new Date().getTimezoneOffset();
  const offset = `${timezoneOffset >= 0 ? "+" : "−"}${String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, "0")}:${String(Math.abs(timezoneOffset) % 60).padStart(2, "0")}`;
  const style = {
    "--panel-opacity": Math.max(0, Math.min(100, appearance.panelOpacity ?? 72)) / 100,
    "--panel-blur": `${appearance.panelBlur ?? 12}px`,
    "--panel-shadow": Math.max(0, Math.min(100, appearance.panelShadow ?? 30)) / 100,
  };
  const accent = ["sky", "mint", "coral"].includes(appearance.accentTheme) ? appearance.accentTheme : "sky";
  const density = ["compact", "comfortable", "large"].includes(appearance.interfaceDensity) ? appearance.interfaceDensity : "comfortable";

  return (
    <main className={`app-shell academy-theme study-timer-window accent-${accent} density-${density} ${appearance.reduceMotion ? "reduce-motion" : ""}`} style={style} data-testid="study-timer-window" data-i18n-preserve>
      <header className="study-timer-header">
        <span><Timer size={22} /></span>
        <div><small>STUDY TIMER</small><h1>{messages.title}</h1><p>{messages.intro}</p></div>
        {timer ? <b className={`study-timer-status is-${snapshot.status}`} role="status">{messages[snapshot.status]}</b> : null}
      </header>

      <nav className="study-timer-modes" aria-label={messages.title}>
        {modes.map(({ id, icon: Icon }) => <button type="button" key={id} data-testid={`study-timer-mode-${id}`} aria-pressed={mode === id} className={mode === id ? "is-active" : ""} disabled={busy || (locked && mode !== id) || !timer} onClick={() => switchMode(id)}><Icon size={17} />{messages[id]}</button>)}
      </nav>

      {error ? <p className="study-timer-error" role="alert">{messages[error]}{!timer ? <button type="button" disabled={busy} onClick={() => perform(async () => { setTimer(await getStudyTimer()); })}>{messages.retry}</button> : null}</p> : null}
      {!timer ? <p className="study-timer-loading"><LoaderCircle size={20} className="plan-spin" />{messages.loading}</p> : (
        <>
          <section className={`study-timer-clock ${completed ? "is-completed" : ""}`} aria-label={mode === "stopwatch" ? messages.elapsed : messages.remaining}>
            <small>{mode === "stopwatch" ? messages.elapsed : messages.remaining}</small>
            <output className="study-timer-digits" aria-live="off" data-testid="study-timer-display">{Number.isFinite(displayMs) ? formatTimerDuration(mode === "stopwatch" ? displayMs : Math.ceil(displayMs / 1000) * 1000) : "--:--:--"}</output>
            {mode === "target" && targetDate ? <div className="study-timer-target-summary"><b>{dayLabel}</b><time dateTime={targetDate.toISOString()}>{targetDate.toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</time></div> : null}
          </section>

          {completed ? <section className="study-timer-finished" data-testid="study-timer-due-banner" role="status"><AlarmClock size={21} /><div><strong>{messages.finished}</strong><p>{messages.completedHint}</p></div></section> : null}

          {mode === "countdown" ? <fieldset className="study-timer-settings" disabled={!editable || busy}><legend>{messages.duration}</legend><div className="study-timer-duration-fields">{[[messages.hours, hours, setHours, 168], [messages.minutes, minutes, setMinutes, 59], [messages.seconds, seconds, setSeconds, 59]].map(([label, value, setter, max]) => <label key={label}><input type="number" min="0" max={max} step="1" value={value} aria-label={label} onChange={(event) => setter(event.target.value)} /><span>{label}</span></label>)}</div><p>{messages.durationHint}</p></fieldset> : null}

          {mode === "target" ? <section className="study-timer-settings"><label className="study-timer-target-field"><span>{messages.targetDate}</span><input type="datetime-local" step="60" value={targetValue} aria-label={messages.targetDate} disabled={!editable || busy} onChange={(event) => setTargetValue(event.target.value)} /></label><p>{messages.targetHint}</p><p>{messages.timezone}：<span>{timeZone} · UTC{offset}</span></p><p>{messages.targetAbsolute}</p></section> : null}

          <div className="study-timer-actions">
            {editable ? <button type="button" className="study-timer-primary" data-testid="study-timer-start" disabled={busy} onClick={start}><Play size={17} />{completed ? messages.startAgain : messages.start}</button> : timer.status === "paused" ? <button type="button" className="study-timer-primary" data-testid="study-timer-resume" disabled={busy} onClick={() => perform(() => dispatch({ type: "resume" }))}><Play size={17} />{messages.resume}</button> : mode !== "target" ? <button type="button" className="study-timer-primary" data-testid="study-timer-pause" disabled={busy} onClick={() => perform(() => dispatch({ type: "pause" }))}><Pause size={17} />{messages.pause}</button> : <button type="button" className="study-timer-primary" data-testid="study-timer-cancel" disabled={busy} onClick={() => stop("cancel")}><Square size={17} />{messages.cancel}</button>}
            <button type="button" data-testid="study-timer-reset" disabled={busy || (timer.status === "idle" && !timer.elapsedMs)} title={messages.resetHint} onClick={() => stop("reset")}><RotateCcw size={17} />{messages.reset}</button>
            {busy ? <span className="study-timer-busy" role="status"><LoaderCircle size={15} className="plan-spin" />{messages.working}</span> : null}
          </div>
          <p className="study-timer-mode-hint">{locked ? messages.switchHint : mode === "stopwatch" ? messages.stopwatchHint : mode === "countdown" ? messages.countdownHint : messages.targetAbsolute}</p>

          {mode === "target" ? <section className="study-timer-audio" aria-label={messages.audio}><header><Bell size={17} /><strong>{messages.audio}</strong><span>{audio.source === "custom" ? audio.name || messages.customAudio : messages.defaultAudio}</span></header><div>{editable ? <><button type="button" data-testid="study-timer-audio-choose" disabled={busy} onClick={() => audioAction(chooseStudyTimerAudio)}>{messages.chooseAudio}</button><button type="button" data-testid="study-timer-audio-default" disabled={busy || audio.source !== "custom"} onClick={() => audioAction(resetStudyTimerAudio)}>{messages.resetAudio}</button><button type="button" data-testid="study-timer-audio-preview" disabled={busy || audio.playing} onClick={() => audioAction(previewStudyTimerAudio)}><Play size={14} />{messages.previewAudio}</button></> : null}<button type="button" data-testid="study-timer-audio-stop" disabled={!audio.playing || busy} onClick={() => audioAction(stopStudyTimerAudio)}><BellOff size={14} />{messages.stopAudio}</button></div><p>{messages.audioHint}</p>{audio.error ? <p className="study-timer-audio-error" role="alert">{audio.error === "audio-missing" ? messages.audioMissing : audio.error === "audio-unavailable" ? messages.audioFallback : messages.audioFailed}</p> : null}</section> : null}

          <footer className="study-timer-footer"><p>{messages.lifecycle}</p><p>{mode === "target" ? messages.audioLifecycle : messages.silent}</p></footer>
        </>
      )}
    </main>
  );
}
