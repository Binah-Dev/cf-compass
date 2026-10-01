import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import StudyPlanWindow from "./components/StudyPlanWindow";
import StudyTimerWindow from "./components/StudyTimerWindow";
import StudyTimerAudioHost from "./components/StudyTimerAudioHost";
import { I18nProvider } from "./i18n";
import "./styles.css";
import "./academy-theme.css";
import "./study-plan.css";
import "./study-plan-window.css";
import "./typography.css";
import "./interaction-motion.css";
import "./panel-transparency.css";
import "./accent-themes.css";
import "./study-timer-window.css";

const windowQuery = new URLSearchParams(window.location.search);
const isStudyPlanWindow = windowQuery.get("studyPlanWindow") === "1";
const isStudyTimerWindow = windowQuery.get("studyTimerWindow") === "1";
const isStudyTimerAudio = windowQuery.get("studyTimerAudio") === "1";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <I18nProvider>
      {isStudyTimerAudio ? <StudyTimerAudioHost /> : isStudyTimerWindow ? <StudyTimerWindow /> : isStudyPlanWindow ? <StudyPlanWindow /> : <App />}
    </I18nProvider>
  </StrictMode>,
);
