import { mockAdapter } from "./mockAdapter";
import { apiAdapter } from "./apiAdapter";
export const dataMode = import.meta.env.VITE_DATA_MODE ?? "mock";
export const raceService = dataMode === "mock" ? mockAdapter : apiAdapter;
