import type { RaceStatus } from "../types/domain";
import { request, RequestError } from "./client";
export type RaceTransition = {
  expected_status: "DRAFT" | "SCHEDULED";
  status: "SCHEDULED" | "LIVE";
};
export function nextRaceTransition(
  status: RaceStatus,
): RaceTransition | undefined {
  if (status === "DRAFT")
    return { expected_status: "DRAFT", status: "SCHEDULED" };
  if (status === "SCHEDULED")
    return { expected_status: "SCHEDULED", status: "LIVE" };
}
export async function changeRaceStatus(
  id: string,
  transition: RaceTransition,
  signal?: AbortSignal,
) {
  if (
    nextRaceTransition(transition.expected_status)?.status !== transition.status
  )
    throw new RequestError(0, "Không hỗ trợ chuyển trạng thái này.");
  const result = await request<{
    race_id: string;
    status: RaceStatus;
    actual_start_at: string | null;
    idempotent: boolean;
  }>(`/races/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: transition,
    signal,
  });
  if (
    result.race_id !== id ||
    result.status !== transition.status ||
    (result.status === "LIVE" && !result.actual_start_at)
  )
    throw new RequestError(
      0,
      "Chưa xác minh được trạng thái giải sau yêu cầu. Hãy tải lại.",
    );
  return result;
}
