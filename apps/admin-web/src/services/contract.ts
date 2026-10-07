import type { RunSession, RaceStatus, RunDetail } from "../types/domain";
export interface BackendRace {
  race_id: string;
  name: string;
  status: RaceStatus;
  start_at: string | null;
}
export interface BackendRunner {
  display_id?: string | null;
  bib_number?: string | null;
  student_id: string;
  run_id: string | null;
  race_id?: string;
  student_code?: string | null;
  full_name?: string | null;
  status: string;
  source?: string;
  total_laps?: number;
  lap_count: number;
  distance_total_m: number;
  total_steps?: number | null;
  duration_total_s?: number | null;
  last_lap_duration_s?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
  last_seen_at?: string | null;
  last_latitude?: number | null;
  last_longitude?: number | null;
}
export interface Overview {
  race_id: string;
  status: RaceStatus;
  participants: number;
  active_runners: number;
  completed_runners: number;
  checkpoint_events: number;
  server_time: string;
}
export interface LiveRow {
  student_id: string;
  run_id: string;
  latitude: number | null;
  longitude: number | null;
  lap_count: number;
  distance_total_m: number;
  total_steps: number;
  status: string;
  last_seen_at: string | null;
}
export interface WireEvent {
  type: string;
  race_id?: string;
  occurred_at?: string;
  data: Record<string, unknown>;
}
export type HistoryRow = NonNullable<RunDetail["history"]>[number];
export function utc(value?: string | null): string | null {
  if (typeof value !== "string" || !value) return null;
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`;
  return Number.isFinite(Date.parse(normalized)) ? normalized : null;
}
export function validPosition(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}
export function normalizeRunner(
  row: BackendRunner,
  raceId = row.race_id ?? "",
): RunSession {
  const hash = Array.from(row.student_id).reduce(
    (h, c) => (h * 31 + c.charCodeAt(0)) >>> 0,
    0,
  );
  const valid = validPosition(row.last_latitude, row.last_longitude);
  const lastSeen = utc(row.last_seen_at);
  return {
    ...row,
    race_id: raceId,
    run_id: row.run_id ?? "",
    student_code: row.student_code ?? "—",
    full_name: row.full_name ?? "—",
    faculty: "—",
    bib: row.bib_number ?? row.display_id ?? "—",
    color: ["#2563eb", "#0d9488", "#9333ea", "#ea580c", "#db2777"][hash % 5],
    status:
      row.status === "REGISTERED"
        ? "PENDING"
        : (row.status as RunSession["status"]),
    total_laps: row.total_laps ?? 0,
    total_steps: row.total_steps ?? null,
    duration_total_s: row.duration_total_s ?? null,
    last_lap_duration_s: row.last_lap_duration_s ?? null,
    started_at: utc(row.started_at),
    ended_at: utc(row.ended_at),
    source: row.source ?? "—",
    last_seen_at: lastSeen,
    last_latitude: valid ? row.last_latitude! : null,
    last_longitude: valid ? row.last_longitude! : null,
    connection:
      row.status === "COMPLETED"
        ? "FINISHED"
        : !valid || !lastSeen
          ? "UNAVAILABLE"
          : Date.now() - Date.parse(lastSeen) > 30000
            ? "STALE"
            : "ONLINE",
  };
}
