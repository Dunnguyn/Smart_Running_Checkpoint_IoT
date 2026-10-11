import { request } from "./client";

export interface RaceDraft {
  name: string;
  route_name: string;
  start_at: string;
  end_at: string;
  total_laps: string;
  min_lap_interval_seconds: string;
  checkpoint_mode: "GPS_ONLY" | "GPS_AND_ARDUINO";
}
export function racePayload(draft: RaceDraft) {
  const fields: Record<string, string> = {};
  const name = draft.name.trim();
  if (!name || name.length > 160)
    fields.name = "Tên giải cần từ 1 đến 160 ký tự.";
  const total_laps = Number(draft.total_laps);
  if (!Number.isInteger(total_laps) || total_laps < 1 || total_laps > 100)
    fields.total_laps = "Số vòng phải là số nguyên từ 1 đến 100.";
  const interval =
    draft.min_lap_interval_seconds.trim() === ""
      ? null
      : Number(draft.min_lap_interval_seconds);
  if (
    interval !== null &&
    (!Number.isInteger(interval) || interval < 1 || interval > 3600)
  )
    fields.min_lap_interval_seconds =
      "Nhập số nguyên từ 1 đến 3600 giây hoặc để trống.";
  const date = (key: "start_at" | "end_at") => {
    if (!draft[key]) return null;
    const value = new Date(draft[key]);
    if (!Number.isFinite(value.getTime())) {
      fields[key] = "Ngày giờ không hợp lệ.";
      return null;
    }
    return value.toISOString();
  };
  const start_at = date("start_at"),
    end_at = date("end_at");
  if (start_at && end_at && end_at < start_at)
    fields.end_at = "Kết thúc không được trước thời điểm bắt đầu.";
  return {
    fields,
    body: {
      name,
      status: "DRAFT" as const,
      route_name: draft.route_name.trim() || null,
      start_at,
      end_at,
      total_laps,
      min_lap_interval_seconds: interval,
      checkpoint_mode: draft.checkpoint_mode,
    },
  };
}
export function createRace(draft: RaceDraft, signal?: AbortSignal) {
  const { fields, body } = racePayload(draft);
  if (Object.keys(fields).length)
    throw new Error("Thông tin giải chưa hợp lệ.");
  return request<{ race_id: string; name: string; status: string }>("/races", {
    method: "POST",
    body,
    signal,
  });
}
