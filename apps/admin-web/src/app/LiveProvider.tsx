import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { raceService } from "../services";
import { simulator } from "../mocks/liveSimulator";
import type { LiveSnapshot } from "../types/domain";
interface LiveContextValue {
  snapshot: LiveSnapshot | null;
  error: string;
  start: () => void;
  pause: () => void;
  reset: () => void;
}
const Context = createContext<LiveContextValue | null>(null);
export function LiveProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    raceService
      .getRaceLiveSnapshot("neu-2026")
      .then((s) => {
        if (!disposed) setSnapshot(s);
      })
      .catch((e) => {
        if (!disposed)
          setError(
            (e as { message?: string }).message ?? "Dữ liệu không khả dụng",
          );
      });
    try {
      unsubscribe = raceService.subscribeRaceLive("neu-2026", {
        onSnapshot: (s) => {
          if (!disposed) setSnapshot(s);
        },
      });
    } catch (e) {
      setError((e as { message: string }).message);
    }
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);
  return (
    <Context.Provider
      value={{
        snapshot,
        error,
        start: simulator.start,
        pause: simulator.pause,
        reset: simulator.reset,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useLive() {
  const value = useContext(Context);
  if (!value) throw new Error("LiveProvider required");
  return value;
}
