import type {
  Race,
  RaceOverview,
  RunnerFilters,
  PaginatedResponse,
  RunSession,
  RunDetail,
  DeviceEvent,
  LiveSnapshot,
  LiveEvent,
} from "../types/domain";
export interface RaceService {
  listRaces(signal?: AbortSignal): Promise<Race[]>;
  getRaceOverview(raceId: string): Promise<RaceOverview>;
  listRunners(
    raceId: string,
    filters: RunnerFilters,
    signal?: AbortSignal,
  ): Promise<PaginatedResponse<RunSession>>;
  getRaceLiveSnapshot(raceId: string): Promise<LiveSnapshot>;
  getRunDetail(
    studentId: string,
    runId: string,
    signal?: AbortSignal,
  ): Promise<RunDetail>;
  getRunEvents(
    studentId: string,
    runId: string,
  ): Promise<(DeviceEvent | NonNullable<RunDetail["history"]>[number])[]>;
  subscribeRaceLive(
    raceId: string,
    handlers: {
      onSnapshot: (snapshot: LiveSnapshot) => void;
      onEvent?: (event: LiveEvent) => void;
      onError?: (error: Error) => void;
      onStatus?: (
        status: "connecting" | "connected" | "reconnecting" | "disconnected",
      ) => void;
    },
  ): () => void;
}
