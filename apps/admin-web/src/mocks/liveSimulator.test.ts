import { describe, it, expect, vi, afterEach } from "vitest";
import { LiveSimulator } from "./liveSimulator";
import { filterRunners, mockAdapter } from "../services/mockAdapter";
import { apiAdapter } from "../services/apiAdapter";
afterEach(() => vi.useRealTimers());
describe("simulation consistency and lifecycle", () => {
  it("isolates scheduled race snapshots from live race data", async () => {
    const snapshot = await mockAdapter.getRaceLiveSnapshot("neu-autumn");
    expect(snapshot.runners).toEqual([]);
    expect(snapshot.events).toEqual([]);
    expect(snapshot.checkpoints).toEqual([]);
    expect(snapshot.route).toEqual([]);
    const overview = await mockAdapter.getRaceOverview("neu-2026");
    expect(overview.total).toBe(128);
    expect(overview.checkpoint_events).toBe(
      (await mockAdapter.getRaceLiveSnapshot("neu-2026")).events.length,
    );
  });
  it("has 128 participants and preserves completed and unassigned records", () => {
    const sim = new LiveSimulator(),
      initial = sim.getSnapshot();
    expect(initial.runners).toHaveLength(128);
    expect(initial.runners.filter((r) => r.status === "ACTIVE")).toHaveLength(
      80,
    );
    expect(
      initial.runners.filter((r) => r.status === "COMPLETED"),
    ).toHaveLength(32);
    const completed = initial.runners.find((r) => r.status === "COMPLETED")!;
    const laps = initial.runners.map((r) => r.lap_count);
    sim.start();
    sim.advance();
    expect(
      sim.getSnapshot().runners.find((r) => r.run_id === completed.run_id),
    ).toEqual(completed);
    expect(sim.getSnapshot().runners.map((r) => r.lap_count)).toEqual(laps);
    expect(
      sim.getSnapshot().events.find((e) => e.student_id === null)?.status,
    ).toBe("UNASSIGNED");
    const next = sim.getSnapshot();
    sim.reset();
    sim.start();
    sim.advance();
    expect(sim.getSnapshot()).toEqual(next);
  });
  it("keeps one timer with multiple subscriptions, cleans up and pauses", () => {
    vi.useFakeTimers();
    const sim = new LiveSimulator();
    sim.start();
    expect(vi.getTimerCount()).toBe(0);
    const a = sim.subscribe(() => {}),
      b = sim.subscribe(() => {});
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(sim.getSnapshot().runners[0].duration_total_s).toBe(2102);
    a();
    expect(vi.getTimerCount()).toBe(1);
    b();
    expect(vi.getTimerCount()).toBe(0);
    const c = sim.subscribe(() => {});
    expect(vi.getTimerCount()).toBe(1);
    sim.pause();
    expect(vi.getTimerCount()).toBe(0);
    const paused = sim.getSnapshot();
    vi.advanceTimersByTime(4000);
    expect(sim.getSnapshot()).toBe(paused);
    c();
  });
  it("finishes runners with matched lap events and stops increasing their metrics", () => {
    const sim = new LiveSimulator();
    sim.start();
    for (let i = 0; i < 1100; i++) sim.advance();
    const snapshot = sim.getSnapshot();
    expect(
      snapshot.runners.slice(0, 8).every((r) => r.status === "COMPLETED"),
    ).toBe(true);
    for (const r of snapshot.runners.slice(0, 8)) {
      expect(r.distance_total_m).toBe(5000);
      expect(r.lap_count).toBe(5);
      expect(snapshot.laps.filter((l) => l.run_id === r.run_id)).toHaveLength(
        5,
      );
      expect(
        snapshot.events.filter(
          (e) => e.run_id === r.run_id && e.student_id === r.student_id,
        ),
      ).toHaveLength(5);
    }
    sim.advance();
    expect(sim.getSnapshot().runners.slice(0, 8)).toEqual(
      snapshot.runners.slice(0, 8),
    );
  });
  it("supports normalized search, status, sorting and pagination", () => {
    const runners = new LiveSimulator().getSnapshot().runners;
    expect(
      filterRunners(runners, { search: "nguyen minh anh" }).total,
    ).toBeGreaterThan(0);
    expect(filterRunners(runners, { search: "11230001" }).items[0].bib).toBe(
      "001",
    );
    expect(filterRunners(runners, { status: "COMPLETED" }).total).toBe(32);
    const sorted = filterRunners(runners, {
      sort: "distance_total_m",
      direction: "desc",
      page: 2,
      page_size: 10,
    });
    expect(sorted.items).toHaveLength(10);
    expect(sorted.total).toBe(128);
    expect(filterRunners(runners, { search: "no-such-student" }).total).toBe(0);
  });
  it("requires an in-memory admin key before API reads", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(apiAdapter.listRaces()).rejects.toMatchObject({ status: 401 });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
