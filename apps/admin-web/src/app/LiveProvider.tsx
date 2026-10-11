import { Link, useLocation, useBlocker } from "react-router-dom";
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
import {
  reconcileRunner,
  reconcileSnapshot,
  sameRun,
} from "../services/reconcile";
import { clearApiCache, evictRace } from "../services/apiAdapter";
import {
  apiBase,
  setAdminKey,
  RequestError,
  request,
  onSessionExpired,
  cancelRequests,
} from "../services/client";
import type { LiveSnapshot, Race, RunSession } from "../types/domain";
interface LiveContextValue {
  logout: () => void;
  setDirty: (dirty: boolean) => void;
  snapshot: LiveSnapshot | null;
  error: string;
  raceId: string;
  races: Race[];
  racesLoaded: boolean;
  mergeRunners: (rows: RunSession[]) => void;
  selectRace: (id: string) => void;
  retry: () => void;
  reloadRaces: (signal?: AbortSignal) => Promise<Race[]>;
  forgetRace: (id: string) => void;
  refreshData: () => void;
  connection: string;
  start: () => void;
  pause: () => void;
  reset: () => void;
}
const Context = createContext<LiveContextValue | null>(null);
export function LiveProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState("");
  const [races, setRaces] = useState<Race[]>([]);
  const [raceId, setRaceId] = useState(
    () => sessionStorage.getItem(`neu-race-id:${apiBase}`) ?? "",
  );
  const liveCleanup = useRef<(() => void) | null>(null);
  const [dirty, setDirty] = useState(false);
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm("Có thay đổi chưa lưu. Bỏ thay đổi và rời trang?")) {
        setDirty(false);
        blocker.proceed();
      } else blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const selectRace = useCallback(
    (id: string) => {
      if (
        id !== raceId &&
        dirty &&
        !window.confirm("Bỏ thay đổi bản đồ chưa lưu để đổi giải?")
      )
        return;
      if (id !== raceId) {
        setDirty(false);
        setRaceId(id);
      }
    },
    [dirty, raceId],
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
    sessionStorage.removeItem(`neu-race-id:${apiBase}`);
    setRaceId("");
    setDirty(false);
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
          const incoming = rows.find((row) => sameRun(row, current));
          return incoming ? reconcileRunner(current, incoming) : current;
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
        setRaceId((current) =>
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
    sessionStorage.setItem(`neu-race-id:${apiBase}`, raceId);
    let disposed = false;
    setError("");
    const accept = (s: LiveSnapshot) => {
      if (!disposed) {
        setSnapshot((previous) =>
          dataMode === "mock" ? s : reconcileSnapshot(previous, s),
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
    liveCleanup.current = unsubscribe;
    return () => {
      disposed = true;
      unsubscribe();
      if (liveCleanup.current === unsubscribe) liveCleanup.current = null;
    };
  }, [raceId, ready, listed, revision]);
  const reloadRaces = useCallback(async (signal?: AbortSignal) => {
    const items = await raceService.listRaces(signal);
    if (signal?.aborted) return [];
    setRaces(items);
    setListed(true);
    setSnapshot((s) =>
      s
        ? {
            ...s,
            races: items.map(
              (r) => s.races.find((old) => old.race_id === r.race_id) ?? r,
            ),
          }
        : s,
    );
    return items;
  }, []);
  const forgetRace = (id: string) => {
    evictRace(id);
    setRaces((rows) => rows.filter((r) => r.race_id !== id));
    if (raceId === id) {
      liveCleanup.current?.();
      liveCleanup.current = null;
      setDirty(false);
      setSnapshot(null);
      setRaceId("");
      sessionStorage.removeItem(`neu-race-id:${apiBase}`);
      setConnection("disconnected");
    } else
      setSnapshot((s) =>
        s ? { ...s, races: s.races.filter((r) => r.race_id !== id) } : s,
      );
  };
  return (
    <Context.Provider
      value={{
        logout: () => {
          if (!dirty || window.confirm("Bỏ thay đổi chưa lưu và đăng xuất?"))
            logout();
        },
        setDirty,
        snapshot,
        error,
        raceId,
        races,
        racesLoaded: listed,
        selectRace,
        mergeRunners,
        retry,
        reloadRaces,
        forgetRace,
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
          {error && (
            <div className="connection-error" role="alert">
              {error}
            </div>
          )}
          {listed && !races.length && location.pathname !== "/races" ? (
            <div className="empty">
              <h2>Chưa có giải chạy</h2>
              <p>
                Chưa có giải chạy. Tạo giải và cấu hình tuyến trước khi bắt đầu
                phiên chạy.
              </p>
              <Link className="button primary" to="/races">
                Tạo giải chạy
              </Link>
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
