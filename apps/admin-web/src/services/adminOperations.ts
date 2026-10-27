import { request } from "./client";
export interface SimulationJob {
  simulation_id: string;
  status: string;
  race_id: string | null;
  students: number;
  laps_required: number;
  checkpoint_mode: string;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  log_tail: string;
  already_running?: boolean;
}
export const jobActive = (status?: string) =>
  status === "RUNNING" || status === "STOPPING";
export const jobLabel = (status: string) =>
  ({
    RUNNING: "Đang mô phỏng",
    STOPPING: "Đang dừng",
    STOPPED: "Đã dừng",
    COMPLETED: "Đã hoàn tất",
    FAILED: "Mô phỏng gặp lỗi",
  })[status] ?? `Trạng thái: ${status}`;
export const adminOperations = {
  start: (
    body: {
      checkpoint_mode: string;
      seed: number;
      interval_seconds: number;
      runner_start_gap_seconds: number;
    },
    signal?: AbortSignal,
  ) => request<SimulationJob>("/simulations", { method: "POST", body, signal }),
  job: (id: string, signal?: AbortSignal) =>
    request<SimulationJob>(`/simulations/${encodeURIComponent(id)}`, {
      signal,
    }),
  stop: (id: string, signal?: AbortSignal) =>
    request<SimulationJob>(`/simulations/${encodeURIComponent(id)}/stop`, {
      method: "POST",
      signal,
    }),
  deleteRace: (id: string, signal?: AbortSignal) =>
    request<{
      deleted: boolean;
      race_id: string;
      cancelled_active_runs: number;
    }>(`/races/${encodeURIComponent(id)}`, { method: "DELETE", signal }),
};
