import type { BackendRunner } from "./contract";
export type MatchStatus =
  "PENDING_MATCH" | "MATCHED" | "AMBIGUOUS" | "UNASSIGNED" | "REJECTED";
export type LapStatus = "NOT_EVALUATED" | "COUNTED" | "NOT_COUNTED";
export type CheckpointMode = "GPS_ONLY" | "GPS_AND_ARDUINO";
export interface Candidate {
  passage_id: string;
  student_id: string;
  student_code: string | null;
  display_id: string | null;
  run_id: string;
  wearable_device_id: string;
  entry_at: string;
  entry_distance_m: number;
  time_delta_ms: number;
  available: boolean;
}
export interface CheckpointEvent {
  event_id: string;
  race_id: string;
  checkpoint_id: string;
  device_id: string;
  device_event_id: string;
  occurred_at: string;
  received_at: string;
  match_deadline_at: string | null;
  match_status: MatchStatus;
  lap_status: LapStatus;
  reason_code: string | null;
  matched_runner: {
    student_id: string;
    student_code: string | null;
    full_name: string | null;
    display_id: string | null;
    run_id: string;
    wearable_device_id: string | null;
  } | null;
  method: string | null;
  passage_id: string | null;
  lap_id: string | null;
  lap_number: number | null;
  lap_duration_ms: number | null;
  candidates: Candidate[] | null;
  candidates_final: boolean;
  version: number;
  config_version: number | null;
  checkpoint_source: string;
  telemetry_source: string | null;
}
export interface DashboardDto {
  race: {
    race_id: string;
    name: string;
    status: import("../types/domain").RaceStatus;
    checkpoint_mode: CheckpointMode;
    total_laps: number;
    config_version: number;
  };
  summary: {
    participants: number;
    started_runners: number;
    active_runners: number;
    completed_runners: number;
    not_started_runners: number;
    runners_at_lap_target: number;
    laps_recorded: number;
    distance_total_m: number;
    steps_total: number;
    average_duration_s: number;
    checkpoint_events: number;
    checkpoint_events_by_status: Partial<Record<MatchStatus, number>>;
    pending_matches: number;
    ambiguous_matches: number;
  };
  runners: BackendRunner[];
  top_runners: BackendRunner[];
  recent_checkpoint_events: CheckpointEvent[];
  server_time: string;
}
export interface MatchingConfig {
  checkpoint_mode: CheckpointMode;
  inner_radius_m: number;
  outer_radius_m: number;
  match_window_seconds: number;
  late_grace_seconds: number;
  max_sample_gap_seconds: number;
  max_event_age_seconds: number;
  max_future_skew_seconds: number;
  config_version: number;
}
export interface Resolution {
  action: "CONFIRM" | "DISMISS";
  passage_id: string | null;
  expected_version: number;
  idempotency_key: string;
  reason: string;
}
export const matchLabels: Record<MatchStatus, string> = {
  PENDING_MATCH: "Chờ đối chiếu",
  MATCHED: "Đã ghép",
  AMBIGUOUS: "Cần xác nhận",
  UNASSIGNED: "Chưa gán",
  REJECTED: "Đã loại bỏ",
};
export const lapLabels: Record<LapStatus, string> = {
  NOT_EVALUATED: "Chưa xét vòng",
  COUNTED: "Đã tính vòng",
  NOT_COUNTED: "Không tính vòng",
};
const reasons: Record<string, string> = {
  GPS_ONLY_MODE:
    "Chế độ GPS_ONLY: sự kiện Arduino được lưu, không cộng vòng (hành vi dự kiến).",
  GPS_PASSAGE_PENDING_ARDUINO:
    "Đã có bằng chứng GPS, đang chờ Arduino; chưa tính vòng.",
  COMPETING_EVENTS: "Nhiều sự kiện cùng tranh một passage GPS.",
  MULTIPLE_CANDIDATES: "Có nhiều ứng viên hợp lệ; cần admin xác nhận.",
  NO_ELIGIBLE_PASSAGE:
    "Không có passage GPS đủ điều kiện trong cửa sổ đối chiếu.",
  PASSAGE_ALREADY_USED: "Passage đã được một sự kiện khác sử dụng.",
  RUN_NOT_ACTIVE: "Phiên chạy không còn ACTIVE.",
  CHECKPOINT_NOT_LAP: "Checkpoint này không dùng để tính vòng.",
  NON_MONOTONIC_CROSSING_TIME:
    "Thời điểm qua checkpoint không sau lần ghi nhận trước.",
  MIN_LAP_INTERVAL_NOT_MET: "Chưa đủ khoảng thời gian tối thiểu giữa hai vòng.",
  ADMIN_DISMISSED: "Admin đã loại bỏ sự kiện.",
  LATE_DEVICE_EVENT: "Sự kiện thiết bị đến quá muộn.",
  CHECKPOINT_NOT_FOUND: "Không tìm thấy checkpoint.",
};
export const reasonText = (code: string | null) =>
  code
    ? (reasons[code] ?? "Backend trả mã lý do chưa có bản dịch.")
    : "Không có lý do bổ sung";
export const canResolve = (
  event: Pick<CheckpointEvent, "match_status" | "candidates_final">,
) => event.match_status === "AMBIGUOUS" && event.candidates_final;

// Live messages are untrusted JSON. Only install a full checkpoint DTO after structural checks.
export function isCheckpointEvent(value: unknown): value is CheckpointEvent {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<CheckpointEvent>;
  return (
    [
      "event_id",
      "race_id",
      "checkpoint_id",
      "device_id",
      "device_event_id",
      "occurred_at",
      "received_at",
      "checkpoint_source",
    ].every((k) => typeof (value as Record<string, unknown>)[k] === "string") &&
    typeof e.version === "number" &&
    Number.isFinite(e.version) &&
    typeof e.candidates_final === "boolean" &&
    typeof e.match_status === "string" &&
    e.match_status in matchLabels &&
    typeof e.lap_status === "string" &&
    e.lap_status in lapLabels &&
    (e.candidates === null ||
      (Array.isArray(e.candidates) &&
        e.candidates.every(
          (c) =>
            c &&
            typeof c.passage_id === "string" &&
            typeof c.entry_at === "string",
        )))
  );
}
