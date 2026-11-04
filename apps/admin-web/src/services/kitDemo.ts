import { request } from "./client";

export interface KitDemo {
  demo_id: string;
  status: string;
  serial_port: string;
  race_id: string;
  full_name: string;
  student_code: string;
  message: string | null;
  error: string | null;
  last_lap_number: number;
  run: {
    status: string;
    total_laps: number;
    lap_count: number;
    duration_total_s: number;
    distance_total_m: number;
    total_steps: number;
  } | null;
}
export const kitActive = (status: string) =>
  [
    "CONNECTING",
    "WAITING_FOR_START",
    "ARMED",
    "RUNNING",
    "FINISH_REQUESTED",
  ].includes(status);
export const kitLabel = (status: string) =>
  ({
    CONNECTING: "Đang kết nối kit",
    WAITING_FOR_START: "Chờ nút START trên kit",
    ARMED: "Chờ lượt qua C04 để xuất phát",
    RUNNING: "Đang chạy",
    FINISH_REQUESTED: "Đang xác nhận kết quả",
    COMPLETED: "Đã hoàn thành",
    STOPPED: "Đã dừng",
    FAILED: "Kit gặp lỗi",
  })[status] ?? status;

// Only backend-confirmed laps count; the serial LAP counter includes start
// and rejected crossings, so it must never determine progress or completion.
export function kitProgress(demo: KitDemo) {
  const laps = demo.run?.lap_count ?? 0;
  const total = demo.run?.total_laps ?? 2;
  return {
    laps,
    total,
    completed: demo.status === "COMPLETED",
    text:
      demo.status === "COMPLETED"
        ? `Đã hoàn thành ${laps}/${total} vòng tại C04.`
        : demo.run
          ? `Đã ghi nhận ${laps}/${total} vòng. Tiếp tục chạy và qua C04 sau ít nhất 60 giây mỗi vòng.`
          : "Nhấn START trên kit, sau đó đi qua C04 để bắt đầu đồng hồ.",
  };
}
export const kitDemo = {
  ports: (signal?: AbortSignal) =>
    request<{
      items: { device: string; description: string }[];
      error?: string;
    }>("/demos/kit/ports", { signal }),
  start: (body: {
    serial_port: string;
    student_code: string;
    full_name: string;
  }) => request<KitDemo>("/demos/kit/sessions", { method: "POST", body }),
  get: (id: string, signal?: AbortSignal) =>
    request<KitDemo>(`/demos/kit/sessions/${encodeURIComponent(id)}`, {
      signal,
    }),
  stop: (id: string) =>
    request<KitDemo>(`/demos/kit/sessions/${encodeURIComponent(id)}/stop`, {
      method: "POST",
    }),
};
