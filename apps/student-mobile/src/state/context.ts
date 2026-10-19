import { createContext, useContext } from "react";
import type { Engine, ViewState } from "./engine";
export type Screen =
  | "races"
  | "detail"
  | "map"
  | "run"
  | "result"
  | "stats"
  | "history"
  | "history-detail"
  | "profile";
export type Route = { screen: Screen; raceId?: string; runId?: string };
export const AppContext = createContext<
  | {
      view: ViewState;
      engine: Engine;
      route: Route;
      go: (route: Route) => void;
      back: () => void;
    }
  | undefined
>(undefined);
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("Thiếu AppContext");
  return context;
}
