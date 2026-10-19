import { activeTime, elapsed, terminal, type Run } from "./model";
export function statistics(runs: Run[], range: string, now = Date.now()) {
  const start =
    range === "Tuần"
      ? now - 7 * 86400000
      : range === "Tháng"
        ? now - 30 * 86400000
        : 0;
  const selected = runs.filter((r) => terminal(r) && r.endedAt! >= start);
  return {
    runs: selected,
    participated: new Set(selected.map((r) => r.raceId)).size,
    completed: new Set(
      selected.filter((r) => r.status === "COMPLETED").map((r) => r.raceId),
    ).size,
    distance: selected.reduce((total, r) => total + r.distance, 0),
    totalMs: selected.reduce((total, r) => total + elapsed(r), 0),
    activeMs: selected.reduce((total, r) => total + activeTime(r), 0),
  };
}
