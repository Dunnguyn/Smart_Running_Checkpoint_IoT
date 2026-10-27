import { mockAdapter } from "./mockAdapter";
import { apiAdapter } from "./apiAdapter";
export const dataMode = import.meta.env.VITE_DATA_MODE ?? "api";
export const raceService = dataMode === "mock" ? mockAdapter : apiAdapter;
