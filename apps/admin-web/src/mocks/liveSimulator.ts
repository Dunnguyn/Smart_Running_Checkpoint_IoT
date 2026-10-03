import { createFixture, epoch, pointAt } from "./fixtures";
import type { LiveEvent, LiveSnapshot } from "../types/domain";
export class LiveSimulator {
  private snapshot = createFixture();
  private tickCount = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private listeners = new Set<
    (snapshot: LiveSnapshot, events: LiveEvent[]) => void
  >();
  getSnapshot = () => this.snapshot;
  subscribe = (
    listener: (snapshot: LiveSnapshot, events: LiveEvent[]) => void,
  ) => {
    this.listeners.add(listener);
    this.syncTimer();
    return () => {
      this.listeners.delete(listener);
      this.syncTimer();
    };
  };
  private publish(events: LiveEvent[] = []) {
    this.listeners.forEach((listener) => listener(this.snapshot, events));
  }
  private syncTimer() {
    if (this.snapshot.running && this.listeners.size && !this.timer)
      this.timer = setInterval(() => this.advance(), 2000);
    if ((!this.snapshot.running || !this.listeners.size) && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
  start = () => {
    this.snapshot = { ...this.snapshot, running: true };
    this.syncTimer();
    this.publish();
  };
  pause = () => {
    this.snapshot = { ...this.snapshot, running: false };
    this.syncTimer();
    this.publish();
  };
  reset = () => {
    this.snapshot = createFixture();
    this.tickCount = 0;
    this.syncTimer();
    this.publish();
  };
  advance = () => {
    if (!this.snapshot.running) return;
    this.tickCount++;
    const updated_at = new Date(epoch + this.tickCount * 2000).toISOString();
    const events: LiveEvent[] = [],
      laps = [...this.snapshot.laps],
      deviceEvents = [...this.snapshot.events];
    const runners = this.snapshot.runners.map((run, i) => {
      if (i >= 8 || run.status !== "ACTIVE") return run;
      const meters = Math.min(5000, run.distance_total_m + 4.6 + i * 0.55);
      const lap_count = Math.floor(meters / 1000),
        completed = meters >= 5000;
      const point = pointAt(meters / 1000);
      const duration_total_s = (run.duration_total_s ?? 0) + 2;
      const previousLapSeconds = laps
        .filter((l) => l.run_id === run.run_id)
        .reduce((sum, l) => sum + l.duration_s, 0);
      const last_lap_duration_s =
        lap_count > run.lap_count
          ? duration_total_s - previousLapSeconds
          : run.last_lap_duration_s;
      const next = {
        ...run,
        distance_total_m: meters,
        lap_count,
        duration_total_s,
        last_lap_duration_s,
        total_steps: Math.floor(meters * 1.4),
        last_latitude: point[0],
        last_longitude: point[1],
        last_seen_at: updated_at,
        connection: "ONLINE" as const,
        status: completed ? ("COMPLETED" as const) : ("ACTIVE" as const),
        ended_at: completed ? updated_at : null,
      };
      if (lap_count > run.lap_count) {
        laps.push({
          event_id: `lap-${run.run_id}-${lap_count}`,
          student_id: run.student_id,
          run_id: run.run_id,
          lap: lap_count,
          duration_s: last_lap_duration_s!,
          occurred_at: updated_at,
          source: "SIMULATOR",
        });
        const event = {
          event_id: `event-${run.run_id}-${lap_count}`,
          checkpoint_id: "cp-1",
          student_id: run.student_id,
          run_id: run.run_id,
          occurred_at: updated_at,
          source: "SIMULATOR" as const,
          status: "MATCHED" as const,
        };
        deviceEvents.push(event);
        events.push({ type: "checkpoint.detected", event });
      }
      events.push({
        type: completed ? "runner.completed" : "runner.updated",
        runner: next,
      });
      return next;
    });
    this.snapshot = {
      ...this.snapshot,
      runners,
      laps,
      events: deviceEvents,
      updated_at,
    };
    this.publish(events);
  };
}
export const simulator = new LiveSimulator();
