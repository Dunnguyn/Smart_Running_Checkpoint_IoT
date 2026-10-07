import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { raceService, dataMode } from "../services";
import { simulator } from "../mocks/liveSimulator";
import { refreshRaceLive } from "../services/liveService";
import { clearApiCache } from "../services/apiAdapter";
import {
  setAdminKey,
  RequestError,
  request,
  onSessionExpired,
  cancelRequests,
} from "../services/client";
import type { LiveSnapshot, Race, RunSession } from "../types/domain";
interface LiveContextValue {
  snapshot: LiveSnapshot | null;
  error: string;
  raceId: string;
  races: Race[];
  mergeRunners: (rows: RunSession[]) => void;
  selectRace: (id: string) => void;
  retry: () => void;
  refreshData: () => void;
  connection: string;
  start: () => void;
  pause: () => void;
  reset: () => void;
}
const Context = createContext<LiveContextValue | null>(null);
export function LiveProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState("");
  const [races, setRaces] = useState<Race[]>([]);
  const [raceId, selectRace] = useState(
    () => sessionStorage.getItem("neu-race-id") ?? "",
  );
  const [ready, setReady] = useState(dataMode === "mock");
  const [authBusy, setAuthBusy] = useState(false);
  const authGuard = useRef(false);
  const [keyInput, setKeyInput] = useState("");
  const [revision, setRevision] = useState(0);
  const [connection, setConnection] = useState("disconnected");
  const [listed, setListed] = useState(false);
  const logout = useCallback(() => {
    setAdminKey("");
    clearApiCache();
    sessionStorage.removeItem("neu-race-id");
    selectRace("");
    setReady(false);
    setSnapshot(null);
    setRaces([]);
    setListed(false);
    setKeyInput("");
    setConnection("disconnected");
  }, []);
  useEffect(
    () =>
      onSessionExpired(() => {
        logout();
        setError("Phiên demo không còn hợp lệ. Hãy nhập lại Admin key.");
      }),
    [logout],
  );
  useEffect(
    () => () => {
      cancelRequests();
    },
    [],
  );
  const mergeRunners = useCallback((rows: RunSession[]) => {
    setSnapshot((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        runners: previous.runners.map((current) => {
          const incoming = rows.find(
            (r) =>
              r.run_id === current.run_id &&
              r.student_id === current.student_id &&
              r.race_id === current.race_id,
          );
          if (
            !incoming ||
            (current.status === "COMPLETED" && incoming.status !== "COMPLETED")
          )
            return current;
          if ((incoming.last_seen_at ?? "") < (current.last_seen_at ?? ""))
            return current;
          return {
            ...current,
            ...incoming,
            total_laps: incoming.total_laps || current.total_laps,
          };
        }),
      };
    });
  }, []);
  const retry = () => setRevision((n) => n + 1);
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    const controller = new AbortController();
    setListed(false);
    setError("");
    raceService
      .listRaces(controller.signal)
      .then((items) => {
        if (disposed) return;
        setRaces(items);
        setListed(true);
        selectRace((current) =>
          items.some((r) => r.race_id === current)
            ? current
            : (items[0]?.race_id ?? ""),
        );
      })
      .catch((e: Error) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [ready, revision]);
  useEffect(() => {
    setSnapshot(null);
    if (!ready || !listed || !raceId) return;
    sessionStorage.setItem("neu-race-id", raceId);
    let disposed = false;
    setError("");
    const accept = (s: LiveSnapshot) => {
      if (!disposed) {
        setSnapshot((previous) =>
          dataMode === "mock"
            ? s
            : {
                ...s,
                runners: s.runners.map((incoming) => {
                  const cached = previous?.runners.find(
                    (r) =>
                      r.run_id === incoming.run_id &&
                      r.student_id === incoming.student_id &&
                      r.race_id === incoming.race_id,
                  );
                  if (!cached) return incoming;
                  if (
                    cached.status === "COMPLETED" &&
                    incoming.status !== "COMPLETED"
                  )
                    return cached;
                  if (
                    (cached.last_seen_at ?? "") > (incoming.last_seen_at ?? "")
                  )
                    return cached;
                  return {
                    ...incoming,
                    lap_count: Math.max(cached.lap_count, incoming.lap_count),
                    distance_total_m: Math.max(
                      cached.distance_total_m,
                      incoming.distance_total_m,
                    ),
                    total_steps:
                      incoming.total_steps === null
                        ? cached.total_steps
                        : Math.max(
                            cached.total_steps ?? 0,
                            incoming.total_steps,
                          ),
                  };
                }),
              },
        );
        setError("");
      }
    };
    const fail = (e: Error) => {
      if (disposed) return;
      setError(e.message);
      if (e instanceof RequestError && [401, 403].includes(e.status))
        setConnection("disconnected");
    };
    // API subscription owns initial snapshot -> socket -> resync ordering.
    if (dataMode === "mock")
      void raceService.getRaceLiveSnapshot(raceId).then(accept).catch(fail);
    const unsubscribe = raceService.subscribeRaceLive(raceId, {
      onSnapshot: accept,
      onError: fail,
      onStatus: setConnection,
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [raceId, ready, listed, revision]);
  return (
    <Context.Provider
      value={{
        snapshot,
        error,
        raceId,
        races,
        selectRace,
        mergeRunners,
        retry,
        refreshData: () => refreshRaceLive(raceId),
        connection,
        start: dataMode === "mock" ? simulator.start : () => {},
        pause: dataMode === "mock" ? simulator.pause : () => {},
        reset: dataMode === "mock" ? simulator.reset : retry,
      }}
    >
      {!ready ? (
        <main className="panel auth-panel">
          <h1>NEU Smart Running</h1>
          <p>
            Kết nối API demo. Admin key chỉ được giữ trong bộ nhớ; tải lại trang
            cần nhập lại.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (authGuard.current || !keyInput.trim()) return;
              authGuard.current = true;
              setAuthBusy(true);
              setError("");
              setAdminKey(keyInput.trim());
              try {
                await request("/auth/admin-key", { method: "POST" });
                setKeyInput("");
                setReady(true);
              } catch (error) {
                setAdminKey("");
                setError((error as Error).message);
              } finally {
                authGuard.current = false;
                setAuthBusy(false);
              }
            }}
          >
            <label>
              Admin key{" "}
              <input
                type="password"
                autoComplete="off"
                required
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
              />
            </label>
            <button
              className="button primary"
              type="submit"
              disabled={authBusy}
            >
              {authBusy ? "Đang xác thực…" : "Kết nối"}
            </button>
          </form>
          {error && <p role="alert">{error}</p>}
        </main>
      ) : (
        <>
          <div className="connection-bar">
            <span>
              {dataMode === "api"
                ? `API thật · WebSocket: ${connection}`
                : "Mock frontend"}
            </span>
            <label>
              Giải chạy{" "}
              <select
                aria-label="Chọn giải chạy"
                value={raceId}
                onChange={(e) => selectRace(e.target.value)}
              >
                {races.map((r) => (
                  <option key={r.race_id} value={r.race_id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button" onClick={retry}>
              Thử lại / Làm mới
            </button>
            {dataMode === "api" && (
              <button
                className="button"
                onClick={() => {
                  logout();
                  setError("");
                }}
              >
                Đăng xuất
              </button>
            )}
          </div>
          {error && (
            <div className="connection-error" role="alert">
              {error}
            </div>
          )}
          {listed && !races.length ? (
            <div className="empty">
              <h2>Chưa có giải chạy</h2>
              <p>
                Chạy python -m app.simulator --laps 2 tại backend, rồi nhấn Làm
                mới.
              </p>
            </div>
          ) : (
            children
          )}
        </>
      )}
    </Context.Provider>
  );
}
export function useLive() {
  const value = useContext(Context);
  if (!value) throw new Error("LiveProvider required");
  return value;
}
