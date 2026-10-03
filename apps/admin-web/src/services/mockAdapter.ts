import { simulator } from "../mocks/liveSimulator";
import type { RaceService } from "./interface";
import type { RunnerFilters, RunSession, LiveSnapshot } from "../types/domain";
function snapshotForRace(s: LiveSnapshot, raceId: string): LiveSnapshot {
  if (!s.races.some((r) => r.race_id === raceId))
    throw { code: "NOT_FOUND", message: "Không tìm thấy giải chạy" };
  const runners = s.runners.filter((r) => r.race_id === raceId);
  const checkpoints = s.checkpoints.filter((c) => c.race_id === raceId);
  return {
    ...s,
    runners,
    checkpoints,
    events: s.events.filter((e) =>
      checkpoints.some((c) => c.checkpoint_id === e.checkpoint_id),
    ),
    laps: s.laps.filter((l) =>
      runners.some(
        (r) => r.run_id === l.run_id && r.student_id === l.student_id,
      ),
    ),
    route: raceId === "neu-2026" ? s.route : [],
  };
}
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
export function filterRunners(runners: RunSession[], filters: RunnerFilters) {
  const query = normalize(filters.search ?? "").trim();
  const items = runners.filter(
    (r) =>
      (!filters.status || r.status === filters.status) &&
      (!query || normalize(`${r.full_name} ${r.student_code}`).includes(query)),
  );
  if (filters.sort) {
    const field = filters.sort;
    items.sort(
      (a, b) =>
        ((a[field] ?? -1) - (b[field] ?? -1)) *
        (filters.direction === "asc" ? 1 : -1),
    );
  }
  const page = filters.page ?? 1,
    page_size = filters.page_size ?? 8;
  return {
    items: items.slice((page - 1) * page_size, page * page_size),
    total: items.length,
    page,
    page_size,
  };
}
export const mockAdapter: RaceService = {
  async listRaces() {
    return simulator.getSnapshot().races;
  },
  async getRaceOverview(raceId) {
    const s = simulator.getSnapshot(),
      race = s.races.find((r) => r.race_id === raceId);
    if (!race) throw { code: "NOT_FOUND", message: "Không tìm thấy giải chạy" };
    const runners = s.runners.filter((r) => r.race_id === raceId);
    return {
      race,
      total: runners.length,
      active: runners.filter((r) => r.status === "ACTIVE").length,
      completed: runners.filter((r) => r.status === "COMPLETED").length,
      checkpoint_events: s.events.filter((e) =>
        s.checkpoints.some(
          (c) => c.checkpoint_id === e.checkpoint_id && c.race_id === raceId,
        ),
      ).length,
    };
  },
  async listRunners(raceId, filters) {
    return filterRunners(
      simulator.getSnapshot().runners.filter((r) => r.race_id === raceId),
      filters,
    );
  },
  async getRaceLiveSnapshot(raceId) {
    return snapshotForRace(simulator.getSnapshot(), raceId);
  },
  async getRunDetail(studentId, runId) {
    const s = simulator.getSnapshot(),
      run = s.runners.find(
        (r) => r.student_id === studentId && r.run_id === runId,
      );
    if (!run) throw { code: "NOT_FOUND", message: "Không tìm thấy phiên chạy" };
    return {
      run,
      laps: s.laps.filter(
        (l) => l.run_id === runId && l.student_id === studentId,
      ),
      events: s.events.filter(
        (e) => e.run_id === runId && e.student_id === studentId,
      ),
    };
  },
  async getRunEvents(studentId, runId) {
    return (await this.getRunDetail(studentId, runId)).events;
  },
  subscribeRaceLive(raceId, handlers) {
    snapshotForRace(simulator.getSnapshot(), raceId);
    return simulator.subscribe((s, events) => {
      const snapshot = snapshotForRace(s, raceId);
      handlers.onSnapshot(snapshot);
      events.forEach((e) => {
        if (
          e.type === "checkpoint.detected"
            ? snapshot.checkpoints.some(
                (c) => c.checkpoint_id === e.event.checkpoint_id,
              )
            : e.runner.race_id === raceId
        )
          handlers.onEvent?.(e);
      });
    });
  },
};
