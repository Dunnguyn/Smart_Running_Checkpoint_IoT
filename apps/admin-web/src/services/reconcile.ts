import type { LiveSnapshot, RunSession } from "../types/domain";

export const sameRun = (a: RunSession, b: RunSession) =>
  a.race_id === b.race_id &&
  a.student_id === b.student_id &&
  a.run_id === b.run_id;

// last_seen_at is a GPS timestamp, not a version of the run's lifecycle.
export function reconcileRunner(
  current: RunSession,
  incoming: RunSession,
): RunSession {
  if (!sameRun(current, incoming)) return incoming;
  const olderPosition =
    Date.parse(incoming.last_seen_at ?? "") <
      Date.parse(current.last_seen_at ?? "") ||
    (!incoming.last_seen_at && !!current.last_seen_at);
  const keepCompletion = current.status === "COMPLETED";
  return {
    ...incoming,
    lap_count: Math.max(current.lap_count, incoming.lap_count),
    distance_total_m: Math.max(
      current.distance_total_m,
      incoming.distance_total_m,
    ),
    total_steps:
      incoming.total_steps === null
        ? current.total_steps
        : Math.max(current.total_steps ?? 0, incoming.total_steps),
    ...(olderPosition
      ? {
          last_seen_at: current.last_seen_at,
          last_latitude: current.last_latitude,
          last_longitude: current.last_longitude,
          connection: current.connection,
        }
      : {}),
    ...(keepCompletion
      ? {
          status: current.status,
          duration_total_s: current.duration_total_s,
          ended_at: current.ended_at,
        }
      : {}),
    ...(keepCompletion || incoming.status === "COMPLETED"
      ? { connection: "FINISHED" as const }
      : {}),
  };
}

export function reconcileSnapshot(
  current: LiveSnapshot | null,
  fresh: LiveSnapshot,
): LiveSnapshot {
  if (!current) return fresh;
  const sameRace =
    !!fresh.dashboard &&
    current.dashboard?.race.race_id === fresh.dashboard.race.race_id;
  return {
    ...fresh,
    runners: fresh.runners.map((row) => {
      const previous = current.runners.find((r) => sameRun(r, row));
      return previous ? reconcileRunner(previous, row) : row;
    }),
    // Preserve versions only within the current race. Rankings and aggregates remain server-owned.
    dashboard:
      fresh.dashboard && sameRace
        ? {
            ...fresh.dashboard,
            recent_checkpoint_events: [
              ...fresh.dashboard.recent_checkpoint_events.map((event) => {
                const previous =
                  current.dashboard?.recent_checkpoint_events.find(
                    (e) => e.event_id === event.event_id,
                  );
                return previous && previous.version > event.version
                  ? previous
                  : event;
              }),
              ...(current.dashboard?.recent_checkpoint_events ?? []).filter(
                (event) =>
                  !fresh.dashboard!.recent_checkpoint_events.some(
                    (e) => e.event_id === event.event_id,
                  ),
              ),
            ]
              .sort(
                (a, b) => Date.parse(b.received_at) - Date.parse(a.received_at),
              )
              .slice(0, 10),
          }
        : fresh.dashboard,
  };
}
