import type { RaceService } from "./interface";
import type {
  Race,
  LiveSnapshot,
  DeviceEvent,
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
  const [rows, live, overview, events] = await Promise.all([
    allPages<BackendRunner>(`${racePath(id)}/runners`, signal),
    request<{ race_id: string; server_time: string; runners: LiveRow[] }>(
      `${racePath(id)}/live`,
      { signal },
    ),
    request<Overview>(`${racePath(id)}/overview`, { signal }),
    loadDeviceEvents(id, signal),
  ]);
  const runners = rows.map((row) => {
    const point = live.runners.find(
      (p) => p.run_id === row.run_id && p.student_id === row.student_id,
    );
    return normalizeRunner(
      point &&
        row.status === "ACTIVE" &&
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
  const race = {
    ...(races.find((r) => r.race_id === id) ?? {
      race_id: id,
      name: id,
      started_at: null,
      location: "—",
    }),
    status: overview.status,
    participant_count: overview.participants,
    total_laps: rows[0]?.total_laps ?? null,
  };
  return {
    races: races.map((r) => (r.race_id === id ? race : r)),
    runners,
    route: [],
    checkpoints: [],
    events,
    laps: [],
    updated_at: utc(live.server_time)!,
    running: true,
    overview: {
      race,
      total: overview.participants,
      active: overview.active_runners,
      completed: overview.completed_runners,
      checkpoint_events: overview.checkpoint_events,
    },
  };
}
async function loadDeviceEvents(
  id: string,
  signal?: AbortSignal,
): Promise<DeviceEvent[]> {
  const rows = await allPages<{
    device_event_id: string;
    checkpoint_id: string;
    student_id: string | null;
    occurred_at: string;
    identity_status: "MATCHED" | "UNASSIGNED";
  }>(`${racePath(id)}/device-events`, signal);
  return rows.map((e) => ({
    event_id: e.device_event_id,
    checkpoint_id: e.checkpoint_id,
    student_id: e.student_id,
    run_id: null,
    occurred_at: utc(e.occurred_at)!,
    status: e.identity_status,
    source: "—",
  }));
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
  async listRaces() {
    const version = keyGeneration();
    const result = await request<{ items: BackendRace[] }>("/races");
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
  async listRunners(id, filters) {
    const result = await request<PaginatedResponse<BackendRunner>>(
      `${racePath(id)}/runners?${runnerQuery(filters)}`,
    );
    return {
      ...result,
      items: result.items.map((r) => normalizeRunner(r, id)),
    };
  },
  getRaceLiveSnapshot: loadSnapshot,
  async getRunDetail(studentId, runId) {
    const path = `/runners/${segment(studentId)}/runs/${segment(runId)}`;
    const [row, history] = await Promise.all([
      request<BackendRunner>(path),
      allPages<HistoryRow>(`${path}/events`),
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
