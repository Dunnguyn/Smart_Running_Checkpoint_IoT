import { isCheckpointEvent } from "./matchingContract";
import { normalizeEvent } from "./matchingService";
import { reconcileRunner, reconcileSnapshot } from "./reconcile";
import type { LiveSnapshot, RunSession } from "../types/domain";
import type { RaceService } from "./interface";
import { keyGeneration, liveUrl, RequestError, expireSession } from "./client";
import {
  utc,
  validPosition,
  runnerConnection,
  type WireEvent,
} from "./contract";
const refreshListeners = new Map<string, () => void>();
export const refreshRaceLive = (id: string) => refreshListeners.get(id)?.();
export function applyLive(
  snapshot: LiveSnapshot,
  event: WireEvent,
  id: string,
): LiveSnapshot {
  if (event.race_id && event.race_id !== id) return snapshot;
  const data = event.data;
  if (typeof data?.race_id === "string" && data.race_id !== id) return snapshot;
  if (event.type === "checkpoint.match.updated") {
    if (typeof data.event_id !== "string" || typeof data.version !== "number")
      return snapshot;
    const current = snapshot.dashboard?.recent_checkpoint_events.find(
      (e) => e.event_id === data.event_id,
    );
    if (current && current.version >= data.version) return snapshot;
    return {
      ...snapshot,
      eventRevision: (snapshot.eventRevision ?? 0) + 1,
      dashboard:
        snapshot.dashboard && isCheckpointEvent(data)
          ? {
              ...snapshot.dashboard,
              recent_checkpoint_events: [
                normalizeEvent(data),
                ...snapshot.dashboard.recent_checkpoint_events.filter(
                  (e) => e.event_id !== data.event_id,
                ),
              ]
                .sort(
                  (a, b) =>
                    Date.parse(b.received_at) - Date.parse(a.received_at),
                )
                .slice(0, 10),
            }
          : snapshot.dashboard,
    };
  }
  if (
    event.type === "checkpoint.passed" &&
    data.identity_status === "GPS_PASSAGE_PENDING_ARDUINO"
  ) {
    return {
      ...snapshot,
      pendingPassages: [
        ...new Set([
          ...(snapshot.pendingPassages ?? []),
          String(data.passage_id ?? data.run_id ?? ""),
        ]),
      ],
    };
  }
  if (
    !data ||
    typeof data.run_id !== "string" ||
    typeof data.student_id !== "string"
  )
    return snapshot;
  if (event.type !== "runner.updated" && event.type !== "runner.completed")
    return snapshot;
  const runners = snapshot.runners.map((r) => {
    if (
      r.run_id !== data.run_id ||
      r.student_id !== data.student_id ||
      r.race_id !== id
    )
      return r;
    if (r.status === "COMPLETED" && event.type !== "runner.completed") return r;
    if (typeof data.lap_count === "number" && data.lap_count < r.lap_count)
      return r;
    const timestamp =
      typeof data.last_seen_at === "string" ? utc(data.last_seen_at) : null;
    const completed =
      event.type === "runner.completed" || data.status === "COMPLETED";
    if (
      timestamp &&
      r.last_seen_at &&
      Date.parse(timestamp) < Date.parse(r.last_seen_at) &&
      !completed
    )
      return r;
    const next = { ...r };
    for (const field of [
      "lap_count",
      "distance_total_m",
      "total_steps",
      "duration_total_s",
      "last_lap_duration_s",
    ] as const) {
      if (typeof data[field] === "number" && Number.isFinite(data[field])) {
        // Totals are monotonic within a run; an older buffered delta must not regress a newer snapshot.
        if (
          ["lap_count", "distance_total_m", "total_steps"].includes(field) &&
          (data[field] as number) < (r[field] ?? 0)
        )
          continue;
        next[field] = data[field] as number;
      }
    }
    const latitude = data.latitude ?? data.last_latitude;
    const longitude = data.longitude ?? data.last_longitude;
    if (validPosition(latitude, longitude)) {
      next.last_latitude = latitude as number;
      next.last_longitude = longitude as number;
    }
    if (timestamp) {
      next.last_seen_at = timestamp;
      next.connection = "ONLINE";
    }
    if (typeof data.source === "string") next.source = data.source;
    if (["ACTIVE", "COMPLETED", "ABANDONED"].includes(String(data.status)))
      next.status = data.status as RunSession["status"];
    if (typeof data.ended_at === "string") next.ended_at = utc(data.ended_at);
    if (typeof data.bib_number === "string") next.bib = data.bib_number;
    if (event.type === "runner.completed") next.status = "COMPLETED";
    if (next.status === "COMPLETED") next.connection = "FINISHED";
    return reconcileRunner(r, next);
  });
  return {
    ...snapshot,
    runners,
    updated_at: utc(event.occurred_at) ?? snapshot.updated_at,
  };
}
export function subscribeLive(
  id: string,
  handlers: Parameters<RaceService["subscribeRaceLive"]>[1],
  load: (id: string, signal?: AbortSignal) => Promise<LiveSnapshot>,
) {
  let stopped = false,
    socket: WebSocket | undefined,
    retry = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let state: LiveSnapshot | null = null;
  let loading = false,
    dirty = false;
  let buffer: WireEvent[] = [];
  const eventVersions = new Map<string, number>();
  let lastSync = 0;
  const controller = new AbortController();
  const version = keyGeneration();
  const alive = () => !stopped && version === keyGeneration();
  const emit = () => {
    if (alive() && state) handlers.onSnapshot(state);
  };
  const fail = (error: unknown) => {
    if (!alive()) return;
    handlers.onError?.(error as Error);
    if (error instanceof RequestError && [401, 403].includes(error.status)) {
      stopped = true;
      controller.abort();
      socket?.close();
      expireSession();
      handlers.onStatus?.("disconnected");
    }
  };
  const sync = async () => {
    if (!alive()) return;
    if (loading) {
      dirty = true;
      return;
    }
    loading = true;
    lastSync = Date.now();
    buffer = [];
    try {
      const fresh = await load(id, controller.signal);
      if (!alive()) return;
      // No global backend sequence: buffer committed deltas during REST reads, then reconcile periodically.
      state = buffer.reduce<LiveSnapshot>(
        (s, e) => applyLive(s, e, id),
        reconcileSnapshot(state, {
          ...fresh,
          eventRevision: (state?.eventRevision ?? 0) + 1,
        }),
      );
      emit();
    } catch (error) {
      fail(error);
    } finally {
      loading = false;
      buffer = [];
      if (dirty && alive()) {
        dirty = false;
        schedule();
      }
    }
  };
  const schedule = () => {
    if (!refreshTimer && alive())
      refreshTimer = setTimeout(
        () => {
          refreshTimer = undefined;
          void sync();
        },
        Math.max(1500, 5000 - (Date.now() - lastSync)),
      );
  };
  const connect = () => {
    if (!alive()) return;
    handlers.onStatus?.(retry ? "reconnecting" : "connecting");
    try {
      socket = new WebSocket(liveUrl(id));
    } catch {
      fail(new Error("Không mở được WebSocket. Kiểm tra cấu hình URL."));
      return;
    }
    socket.onopen = () => {
      if (!alive()) return;
      handlers.onStatus?.("connected");
      void sync();
    };
    socket.onmessage = (message) => {
      if (!alive()) return;
      try {
        const event = JSON.parse(String(message.data)) as WireEvent;
        if (
          !event ||
          !event.data ||
          typeof event.data !== "object" ||
          (event.race_id && event.race_id !== id)
        )
          return;
        if (
          ![
            "runner.updated",
            "runner.completed",
            "checkpoint.detected",
            "checkpoint.match.updated",
            "checkpoint.passed",
          ].includes(event.type)
        )
          return;
        if (event.type === "checkpoint.match.updated") {
          const eventId = event.data.event_id,
            eventVersion = event.data.version;
          if (
            typeof eventId !== "string" ||
            typeof eventVersion !== "number" ||
            (eventVersions.get(eventId) ?? 0) >= eventVersion
          )
            return;
          eventVersions.set(eventId, eventVersion);
        }
        if (loading) {
          if (buffer.length < 2000) buffer.push(event);
          else dirty = true;
        }
        if (state) {
          state = applyLive(state, event, id);
          emit();
        }
        schedule();
      } catch {
        /* Ignore malformed frames; never log URLs or credentials. */
      }
    };
    socket.onclose = (close) => {
      if (!alive()) return;
      handlers.onStatus?.("disconnected");
      if ([4401, 4403, 1008].includes(close.code)) {
        fail(
          new RequestError(401, "WebSocket từ chối Admin key. Hãy nhập lại."),
        );
        return;
      }
      if (retry >= 6) {
        handlers.onError?.(
          new Error("Mất WebSocket. Nhấn Thử lại để kết nối lại."),
        );
        return;
      }
      handlers.onStatus?.("reconnecting");
      reconnectTimer = setTimeout(
        connect,
        Math.min(1000 * 2 ** retry++, 30000),
      );
    };
    socket.onerror = () => {
      /* onclose owns bounded retry, including opaque 1006 handshake failures */
    };
  };
  const refresh = () => {
    void sync();
  };
  refreshListeners.set(id, refresh);
  handlers.onStatus?.("connecting");
  void sync().then(() => {
    if (alive() && state) connect();
  });
  const poll = setInterval(() => {
    if (alive() && state) {
      state = {
        ...state,
        runners: state.runners.map((row) => ({
          ...row,
          connection: runnerConnection(row),
        })),
      };
      emit();
    }
    if (alive() && socket?.readyState !== 1)
      void sync().then(() => {
        if (alive() && state && !socket) connect();
      });
  }, 15000);
  return () => {
    if (refreshListeners.get(id) === refresh) refreshListeners.delete(id);
    stopped = true;
    controller.abort();
    clearInterval(poll);
    clearTimeout(reconnectTimer);
    clearTimeout(refreshTimer);
    if (socket) {
      socket.onclose = null;
      socket.onmessage = null;
      socket.onopen = null;
      socket.close();
    }
  };
}
