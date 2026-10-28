import type { Checkpoint } from "../types/domain";

// Preparation only: the backend currently exposes PUT but no read contract.
// Never infer expected_version=0 from a missing endpoint or an empty roster.
export const attendanceFields = [
  "check_in_checkpoint_id",
  "check_out_checkpoint_id",
  "check_in_open_at",
  "check_in_close_at",
  "check_out_open_at",
  "check_out_close_at",
  "max_position_age_seconds",
  "max_accuracy_m",
] as const;
export type AttendanceField = (typeof attendanceFields)[number];
export type AttendanceDraft = Record<AttendanceField, string>;
export const emptyAttendanceDraft = (): AttendanceDraft =>
  Object.fromEntries(
    attendanceFields.map((key) => [key, ""]),
  ) as AttendanceDraft;
export const vietnamToUtc = (value: string) =>
  new Date(`${value}+07:00`).toISOString();
export const validAttendanceCheckpoint = (cp: Checkpoint, raceId: string) =>
  cp.race_id === raceId &&
  cp.latitude != null &&
  cp.longitude != null &&
  Number.isFinite(cp.latitude) &&
  Number.isFinite(cp.longitude) &&
  (cp.radius_m ?? 0) > 0;

export function validateAttendanceDraft(
  d: AttendanceDraft,
  cps: Checkpoint[],
  raceId: string,
) {
  const errors: Partial<Record<AttendanceField, string>> = {};
  for (const key of attendanceFields)
    if (!d[key]) errors[key] = "Vui lòng nhập thông tin này.";
  for (const key of [
    "check_in_checkpoint_id",
    "check_out_checkpoint_id",
  ] as const) {
    if (
      d[key] &&
      !cps.some(
        (cp) =>
          cp.checkpoint_id === d[key] && validAttendanceCheckpoint(cp, raceId),
      )
    )
      errors[key] = "Chọn trạm thuộc giải, có tọa độ và vùng hợp lệ.";
  }
  const times = {} as Record<string, number>;
  for (const key of [
    "check_in_open_at",
    "check_in_close_at",
    "check_out_open_at",
    "check_out_close_at",
  ] as const) {
    times[key] = Date.parse(`${d[key]}+07:00`);
    if (d[key] && !Number.isFinite(times[key]))
      errors[key] = "Thời gian không hợp lệ.";
  }
  for (const prefix of ["check_in", "check_out"] as const) {
    if (times[`${prefix}_open_at`] >= times[`${prefix}_close_at`])
      errors[`${prefix}_close_at`] = "Giờ đóng phải sau giờ mở.";
  }
  if (times.check_out_close_at < times.check_in_open_at)
    errors.check_out_close_at =
      "Giờ đóng check-out không được trước giờ mở check-in.";
  const age = Number(d.max_position_age_seconds),
    accuracy = Number(d.max_accuracy_m);
  if (
    d.max_position_age_seconds &&
    (!Number.isInteger(age) || age < 5 || age > 60)
  )
    errors.max_position_age_seconds = "Nhập số nguyên từ 5 đến 60 giây.";
  if (
    d.max_accuracy_m &&
    (!Number.isFinite(accuracy) || accuracy < 5 || accuracy > 100)
  )
    errors.max_accuracy_m = "Nhập số từ 5 đến 100 mét.";
  return errors;
}
