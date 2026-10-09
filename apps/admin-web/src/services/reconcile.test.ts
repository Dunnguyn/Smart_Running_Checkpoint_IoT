import { afterEach, expect, it, vi } from "vitest";
import { normalizeRunner, runnerConnection } from "./contract";
import { reconcileRunner, reconcileSnapshot } from "./reconcile";
import { applyLive, subscribeLive } from "./liveService";
import type { LiveSnapshot } from "../types/domain";
import type { CheckpointEvent, DashboardDto } from "./matchingContract";

const runner = normalizeRunner({
  student_id: "student",
  run_id: "run",
  race_id: "race",
  bib_number: "01",
  status: "ACTIVE",
  lap_count: 1,
  distance_total_m: 10,
  total_steps: 20,
  last_seen_at: "2026-10-07T01:00:00.000Z",
  last_latitude: 21,
  last_longitude: 105,
});
const event = (version: number): CheckpointEvent => ({
  event_id: "event",
  race_id: "race",
  checkpoint_id: "cp",
  device_id: "dev",
  device_event_id: "source",
  occurred_at: "2026-10-07T01:00:00Z",
  received_at: "2026-10-07T01:00:00Z",
  match_deadline_at: null,
  match_status: version > 1 ? "MATCHED" : "AMBIGUOUS",
  lap_status: "NOT_COUNTED",
  reason_code: null,
  matched_runner: null,
  method: null,
  passage_id: null,
  lap_id: null,
  lap_number: null,
  lap_duration_ms: null,
  candidates: [],
  candidates_final: true,
  version,
  config_version: 1,
  checkpoint_source: "ARDUINO_GATEWAY",
  telemetry_source: null,
});
const dashboard = (version: number): DashboardDto => ({
  race: {
    race_id: "race",
    name: "Race",
    status: "LIVE",
    checkpoint_mode: "GPS_AND_ARDUINO",
    total_laps: 2,
    config_version: 1,
  },
  summary: {
    participants: 1,
    started_runners: 1,
    active_runners: 1,
    completed_runners: 0,
    not_started_runners: 0,
    runners_at_lap_target: 0,
    laps_recorded: 1,
    distance_total_m: 10,
    steps_total: 20,
    average_duration_s: 0,
    checkpoint_events: 1,
    checkpoint_events_by_status: {},
    pending_matches: 0,
    ambiguous_matches: 1,
  },
  runners: [],
  top_runners: [],
  recent_checkpoint_events: [event(version)],
  server_time: "2026-10-07T01:00:00Z",
});
const snapshot = (version: number): LiveSnapshot => ({
  runners: [runner],
  races: [],
  checkpoints: [],
  events: [],
  route: [],
  laps: [],
  updated_at: "2026-10-07T01:00:00Z",
  running: true,
  dashboard: dashboard(version),
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("ages GPS independently of socket traffic and never marks completed runners offline", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T01:00:31Z"));
  expect(runnerConnection(runner)).toBe("STALE");
  expect(runnerConnection({ ...runner, status: "COMPLETED" })).toBe("FINISHED");
  expect(runnerConnection({ ...runner, last_latitude: null })).toBe(
    "UNAVAILABLE",
  );
});

it("keeps completed duration and totals but allows a different run", () => {
  const completed = {
    ...runner,
    status: "COMPLETED" as const,
    duration_total_s: 60,
  };
  expect(
    reconcileRunner(completed, { ...runner, total_steps: 1 }),
  ).toMatchObject({
    status: "COMPLETED",
    duration_total_s: 60,
    total_steps: 20,
    connection: "FINISHED",
  });
  expect(
    reconcileRunner(completed, { ...runner, run_id: "new-run", lap_count: 0 })
      .lap_count,
  ).toBe(0);
});
it("accepts backend completion with older GPS without moving the marker backwards", () => {
  const result = applyLive(
    snapshot(1),
    {
      type: "runner.completed",
      data: {
        run_id: "run",
        student_id: "student",
        last_seen_at: "2026-10-07T00:59:00Z",
        last_latitude: 20,
        last_longitude: 104,
        duration_total_s: 60,
      },
    },
    "race",
  );
  expect(result.runners[0]).toMatchObject({
    status: "COMPLETED",
    last_latitude: 21,
    duration_total_s: 60,
    connection: "FINISHED",
  });
});
it("preserves newer event versions absent from stale REST, never across races", () => {
  const previous = snapshot(3),
    fresh = snapshot(1);
  expect(
    reconcileSnapshot(previous, fresh).dashboard?.recent_checkpoint_events[0]
      .version,
  ).toBe(3);
  fresh.dashboard!.recent_checkpoint_events = [];
  expect(
    reconcileSnapshot(previous, fresh).dashboard?.recent_checkpoint_events,
  ).toHaveLength(1);
  fresh.dashboard!.race.race_id = "another";
  expect(
    reconcileSnapshot(previous, fresh).dashboard?.recent_checkpoint_events,
  ).toHaveLength(0);
});
it("reconnects with backoff, resyncs and cancels old race requests and timers", async () => {
  vi.useFakeTimers();
  class Socket {
    static instances: Socket[] = [];
    readyState = 0;
    onopen: (() => void) | null = null;
    onclose: ((e: { code: number }) => void) | null = null;
    onmessage = null;
    onerror = null;
    close = vi.fn(() => {
      this.readyState = 3;
    });
    constructor() {
      Socket.instances.push(this);
    }
  }
  vi.stubGlobal("WebSocket", Socket);
  const load = vi.fn((_id: string, _signal?: AbortSignal) =>
    Promise.resolve(snapshot(1)),
  );
  const stop = subscribeLive("race", { onSnapshot: vi.fn() }, load);
  await vi.advanceTimersByTimeAsync(0);
  const first = Socket.instances[0];
  first.readyState = 1;
  first.onopen?.();
  await vi.advanceTimersByTimeAsync(0);
  first.readyState = 3;
  first.onclose?.({ code: 1006 });
  await vi.advanceTimersByTimeAsync(999);
  expect(Socket.instances).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(Socket.instances).toHaveLength(2);
  Socket.instances[1].readyState = 1;
  Socket.instances[1].onopen?.();
  await vi.advanceTimersByTimeAsync(0);
  expect(load).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(30000);
  expect(load).toHaveBeenCalledTimes(3);
  stop();
  expect(load.mock.calls[0][1]?.aborted).toBe(true);
  expect(Socket.instances[1].close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
