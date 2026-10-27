import type { RaceService } from "./interface";
import type { ApiError } from "../types/domain";
const unavailable = (): never => {
  throw {
    code: "NOT_IMPLEMENTED",
    message:
      "API adapter chưa được triển khai. Hãy sử dụng VITE_DATA_MODE=mock.",
  } satisfies ApiError;
};
export const apiAdapter: RaceService = {
  // TODO GET /api/v1/races
  listRaces: async () => unavailable(),
  // TODO GET /api/v1/races/{race_id}/overview
  getRaceOverview: async (_raceId) => unavailable(),
  // TODO GET /api/v1/races/{race_id}/runners — confirm query/filter/pagination contract
  listRunners: async (_raceId, _filters) => unavailable(),
  // TODO GET /api/v1/races/{race_id}/live — confirm route/checkpoint contract
  getRaceLiveSnapshot: async (_raceId) => unavailable(),
  // TODO GET /api/v1/runners/{student_id}/runs/{run_id}
  getRunDetail: async (_studentId, _runId) => unavailable(),
  // TODO GET /api/v1/runners/{student_id}/runs/{run_id}/events
  getRunEvents: async (_studentId, _runId) => unavailable(),
  // TODO WebSocket /ws/v1/races/{race_id}/live — auth, reconnect and event envelope
  subscribeRaceLive: (_raceId, _handlers) => unavailable(),
};
