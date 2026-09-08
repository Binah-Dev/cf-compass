export function isOverallRatedEntry(contest) {
  return (!contest.participationType || contest.participationType === "CONTESTANT") &&
    contest.rated !== false && contest.status === "ready" && contest.performance != null;
}
export function virtualReferenceLabel(contest) {
  const reference = contest?.virtualReference;
  if (contest?.participationType === "VIRTUAL" && reference?.status === "unavailable" && reference.reason === "PUBLIC_STANDINGS_ONLY") return "接口受限";
  if (contest?.participationType !== "VIRTUAL" || reference?.status !== "ready" || !Number.isFinite(reference.performance)) return null;
  return `${reference.boundary === "upper" ? "≥" : reference.boundary === "lower" ? "≤" : ""}${Math.round(reference.performance)}`;
}
