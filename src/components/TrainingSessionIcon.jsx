import { createLucideIcon } from "lucide-react";

// A stopwatch with a play mark identifies a timed training session.
// Lucide supplies the same viewBox, rounded strokes and inherited color as the rail.
const TrainingSessionIcon = createLucideIcon("TrainingSession", [
  ["path", { d: "M9 3h6M12 3v4M17.5 8.5 19 7", key: "controls" }],
  ["circle", { cx: "12", cy: "14", r: "7", key: "dial" }],
  ["path", { d: "m10.5 11 4.5 3-4.5 3Z", key: "play" }],
]);

export default TrainingSessionIcon;
