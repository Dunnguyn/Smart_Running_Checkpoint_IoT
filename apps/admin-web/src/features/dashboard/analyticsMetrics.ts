export function paceLabel(
  seconds: number | null | undefined,
  meters: number | null | undefined,
) {
  if (
    seconds == null ||
    meters == null ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(meters) ||
    seconds < 0 ||
    meters <= 0
  )
    return "—";
  const pace = Math.round(seconds / (meters / 1000));
  return `${String(Math.floor(pace / 60)).padStart(2, "0")}:${String(pace % 60).padStart(2, "0")}`;
}
export function chartMaximum(distances: number[], target: number | null) {
  return Math.max(
    500,
    Math.ceil(
      Math.max(0, target ?? 0, ...distances.filter(Number.isFinite)) / 500,
    ) * 500,
  );
}
export function lapProgress(laps: number, total: number | null | undefined) {
  return total != null && total > 0
    ? Math.max(0, Math.min(100, (laps / total) * 100))
    : 0;
}
