export type RaceStatus =
  "DRAFT" | "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED";
export type RunStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "ABANDONED";
export interface Race {
  race_id: string;
  name: string;
  started_at: string;
  location: string;
  status: RaceStatus;
  total_laps: number;
  participant_count: number;
}
export interface Student {
  student_id: string;
  student_code: string;
  full_name: string;
  faculty: string;
}
export interface RaceParticipant extends Student {
  race_id: string;
  bib: string;
  color: string;
}
export interface RunnerLiveStatus {
  last_latitude: number | null;
  last_longitude: number | null;
  last_seen_at: string | null;
  connection: "ONLINE" | "STALE" | "UNAVAILABLE";
}
export interface RunSession extends RaceParticipant, RunnerLiveStatus {
  run_id: string;
  status: RunStatus;
  lap_count: number;
  total_laps: number;
  distance_total_m: number;
  duration_total_s: number | null;
  last_lap_duration_s: number | null;
  total_steps: number | null;
  started_at: string | null;
  ended_at: string | null;
  source: "SIMULATOR";
}
export interface Checkpoint {
  checkpoint_id: string;
  race_id: string;
  code: string;
  name: string;
  type: "START_FINISH" | "INTERMEDIATE";
  order: number;
  device: string;
  latitude: number;
  longitude: number;
}
export interface LapEvent {
  event_id: string;
  student_id: string;
  run_id: string;
  lap: number;
  duration_s: number;
  occurred_at: string;
  source: "SIMULATOR";
}
export interface DeviceEvent {
  event_id: string;
  checkpoint_id: string;
  student_id: string | null;
  run_id: string | null;
  occurred_at: string;
  source: "SIMULATOR";
  status: "MATCHED" | "UNASSIGNED";
}
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
export interface ApiError {
  code: "NOT_IMPLEMENTED" | "NOT_FOUND" | "UNAVAILABLE";
  message: string;
}
export type LiveEvent =
  | { type: "runner.updated" | "runner.completed"; runner: RunSession }
  | { type: "checkpoint.detected"; event: DeviceEvent };
export interface RunnerFilters {
  search?: string;
  status?: RunStatus | "";
  sort?: "lap_count" | "distance_total_m" | "duration_total_s";
  direction?: "asc" | "desc";
  page?: number;
  page_size?: number;
}
export interface RunDetail {
  run: RunSession;
  laps: LapEvent[];
  events: DeviceEvent[];
}
export interface RaceOverview {
  race: Race;
  total: number;
  active: number;
  completed: number;
  checkpoint_events: number;
}
export interface LiveSnapshot {
  races: Race[];
  runners: RunSession[];
  checkpoints: Checkpoint[];
  route: [number, number][];
  events: DeviceEvent[];
  laps: LapEvent[];
  updated_at: string;
  running: boolean;
}
