import type { RaceService } from "./interface";
import type {
  Race,
  LiveSnapshot,
  RunnerFilters,
  PaginatedResponse,
} from "../types/domain";
import { request, keyGeneration, RequestError } from "./client";
import {
  normalizeRunner,
  utc,
  type BackendRace,
  type BackendRunner,
  type Overview,
  type LiveRow,
  type HistoryRow,
} from "./contract";
import type { DashboardDto } from "./matchingContract";
import { normalizeEvent } from "./matchingService";
import { subscribeLive } from "./liveService";
export { validPosition, normalizeRunner } from "./contract";
const segment = encodeURIComponent;
export const racePath = (id: string) => `/races/${segment(id)}`;
export async function allPages<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; ; page++) {
    const data = await request<PaginatedResponse<T>>(
      `${path}${path.includes("?") ? "&" : "?"}page=${page}&page_size=100`,
      { signal },
    );
    result.push(...data.items);
    if (result.length >= data.total || !data.items.length) return result;
  }
}
let races: Race[] = [];
export async function loadSnapshot(
  id: string,
  signal?: AbortSignal,
): Promise<LiveSnapshot> {
  const [dashboard, live] = await Promise.all([
    request<DashboardDto>(`${racePath(id)}/dashboard`, { signal }),
    request<{
      race_id: string;
      server_time: string;
      runners: (BackendRunner & LiveRow)[];
    }>(`${racePath(id)}/live`, { signal }),
  ]);
  const runners = dashboard.runners.map((row) => {
    const point = live.runners.find(
      (p) => p.run_id === row.run_id && p.student_id === row.student_id,
    );
    return normalizeRunner(
      point &&
        row.status !== "COMPLETED" &&
        (utc(point.last_seen_at) ?? "") >= (utc(row.last_seen_at) ?? "")
        ? {
            ...row,
            ...point,
            last_latitude: point.latitude,
            last_longitude: point.longitude,
          }
        : row,
      id,
    );
  });
  const race: Race = {
    ...(races.find((r) => r.race_id === id) ?? {
      started_at: null,
      location: "—",
    }),
    ...dashboard.race,
    participant_count: dashboard.summary.participants,
  };
  return {
    races: races.map((r) => (r.race_id === id ? race : r)),
    runners,
    route: [],
    checkpoints: [],
    events: [],
    laps: [],
    updated_at: utc(dashboard.server_time)!,
    running: dashboard.race.status === "LIVE",
    dashboard: {
      ...dashboard,
      recent_checkpoint_events:
        dashboard.recent_checkpoint_events.map(normalizeEvent),
    },
    overview: {
      race,
      total: dashboard.summary.participants,
      active: dashboard.summary.active_runners,
      completed: dashboard.summary.completed_runners,
      checkpoint_events: dashboard.summary.checkpoint_events,
    },
  };
}
export function clearApiCache() {
  races = [];
}
export function runnerQuery(filters: RunnerFilters) {
  const query = new URLSearchParams({
    page: String(filters.page ?? 1),
    page_size: String(filters.page_size ?? 10),
    sort_by: filters.sort ?? "student_code",
    sort_order: filters.direction ?? "asc",
  });
  if (filters.search) query.set("keyword", filters.search);
  if (filters.status)
    query.set(
      "status",
      filters.status === "PENDING" ? "REGISTERED" : filters.status,
    );
  return query;
}
export const apiAdapter: RaceService = {
  async listRaces(signal) {
    const version = keyGeneration();
    const result = await request<{ items: BackendRace[] }>("/races", {
      signal,
    });
    const mapped = result.items.map((r) => ({
      ...r,
      started_at: utc(r.start_at),
      location: "—",
      total_laps: null,
      participant_count: null,
    }));
    if (version === keyGeneration()) races = mapped;
    return mapped;
  },
  async getRaceOverview(id) {
    const data = await request<Overview>(`${racePath(id)}/overview`);
    const race = races.find((r) => r.race_id === id);
    if (!race) throw new RequestError(404, "Không tìm thấy giải chạy.");
    return {
      race,
      total: data.participants,
      active: data.active_runners,
      completed: data.completed_runners,
      checkpoint_events: data.checkpoint_events,
    };
  },
  async listRunners(id, filters, signal) {
    const result = await request<PaginatedResponse<BackendRunner>>(
      `${racePath(id)}/runners?${runnerQuery(filters)}`,
      { signal },
    );
    return {
      ...result,
      items: result.items.map((r) => normalizeRunner(r, id)),
    };
  },
  getRaceLiveSnapshot: loadSnapshot,
  async getRunDetail(studentId, runId, signal) {
    const path = `/runners/${segment(studentId)}/runs/${segment(runId)}`;
    const [row, history] = await Promise.all([
      request<BackendRunner>(path, { signal }),
      allPages<HistoryRow>(`${path}/events`, signal),
    ]);
    if (row.student_id !== studentId || row.run_id !== runId)
      throw new RequestError(404, "Phiên chạy không thuộc sinh viên này.");
    return {
      run: normalizeRunner(row),
      events: [],
      history: history.map((e) => ({ ...e, occurred_at: utc(e.occurred_at)! })),
      laps: history
        .filter((e) => e.type === "LAP")
        .map((e) => ({
          event_id: e.id,
          student_id: studentId,
          run_id: runId,
          lap: e.lap_no!,
          duration_s: e.duration_s!,
          occurred_at: utc(e.occurred_at)!,
          source: row.source ?? "—",
        })),
    };
  },
  // Backend /events is GPS/LAP history, not checkpoint device events.
  async getRunEvents(studentId, runId) {
    const rows = await allPages<HistoryRow>(
      `/runners/${segment(studentId)}/runs/${segment(runId)}/events`,
    );
    return rows.map((e) => ({ ...e, occurred_at: utc(e.occurred_at)! }));
  },
  subscribeRaceLive: (id, handlers) =>
    subscribeLive(id, handlers, loadSnapshot),
};
