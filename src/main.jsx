import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import StudyPlanWindow from "./components/StudyPlanWindow";
import { I18nProvider } from "./i18n";
import "./styles.css";
import "./academy-theme.css";
import "./study-plan.css";
import "./study-plan-window.css";
import "./typography.css";
import "./interaction-motion.css";

const isStudyPlanWindow = new URLSearchParams(window.location.search).get("studyPlanWindow") === "1";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <I18nProvider>
      {isStudyPlanWindow ? <StudyPlanWindow /> : <App />}
    </I18nProvider>
  </StrictMode>,
);
