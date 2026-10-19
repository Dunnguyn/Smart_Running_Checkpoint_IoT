import { beforeEach, describe, expect, it } from "vitest";
import {
  activeTime,
  elapsed,
  type Auth,
  type Fix,
  type Operation,
} from "../src/domain/model";
import type { Gps } from "../src/gps/port";
import { demoRoute } from "../src/services/fixtures";
import { MockService } from "../src/services/mock";
import { apiService } from "../src/services/api";
import { MemoryStore } from "../src/storage/port";
import { Engine, MAX_QUEUE, type AuthStore } from "../src/state/engine";
import { statistics } from "../src/domain/statistics";
import { segments } from "../src/map/model";

class FakeGps implements Gps {
  starts = 0;
  stops = 0;
  callback?: (fix: Fix) => void;
  issue?: string;
  constructor(private now: () => number) {}
  async fresh() {
    if (this.issue) throw new Error(this.issue);
    return {
      ...demoRoute[0],
      timestamp: this.now(),
      accuracy: 5,
      simulated: true,
    };
  }
  async start(callback: (fix: Fix) => void) {
    this.starts++;
    this.callback = callback;
  }
  async stop() {
    this.stops++;
  }
  emit(fix: Fix) {
    this.callback?.(fix);
  } // includes late callbacks after stop
}
let now: number,
  store: MemoryStore,
  mock: MockService,
  gps: FakeGps,
  engine: Engine,
  authStore: AuthStore,
  savedAuth: Auth | undefined;
beforeEach(async () => {
  now = Date.UTC(2026, 9, 16, 1);
  store = new MemoryStore();
  mock = new MockService(store, () => now);
  mock.latency = 0;
  gps = new FakeGps(() => now);
  savedAuth = undefined;
  authStore = {
    read: async () => savedAuth,
    write: async (auth) => {
      savedAuth = auth;
    },
    clear: async () => {
      savedAuth = undefined;
    },
  };
  engine = new Engine(mock, store, authStore, gps, "mock", () => now);
  await engine.login("11223344", "NeuRun@demo");
});
async function ready() {
  await engine.action("register", "campus");
  await engine.action("checkin", "campus");
}
it("confirms check-in when a periodic snapshot is already in flight", async () => {
  await engine.action("register", "campus");
  const original = mock.snapshot.bind(mock);
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  mock.snapshot = async (auth) => {
    if (first) {
      first = false;
      await barrier;
    }
    return original(auth);
  };
  const poll = engine.sync();
  const checkin = engine.action("checkin", "campus");
  await Promise.resolve();
  release();
  await poll;
  expect(await checkin).toBe(true);
  expect(
    engine.get().snapshot?.enrollments.find((e) => e.raceId === "campus")
      ?.checkedInAt,
  ).toBe(now);
  expect(engine.get().tracking?.operations).toEqual([]);
});
async function started() {
  await ready();
  await engine.action("start", "campus");
  return engine.get().snapshot!.runs.find((r) => r.status === "ACTIVE")!;
}
function emit(index: number) {
  now += 5000;
  gps.emit({
    ...demoRoute[index],
    timestamp: now,
    accuracy: 5,
    simulated: true,
  });
}

describe("durable background collection", () => {
  it("lost ACK retries exactly the same samples without adding distance twice", async () => {
    await started();
    emit(0);
    emit(1);
    const ids = engine.get().tracking!.queue.map((s) => s.id);
    mock.scenario = "ack-lost";
    await engine.sync();
    expect(engine.get().tracking!.queue.map((s) => s.id)).toEqual(ids);
    await engine.sync();
    expect(engine.get().tracking?.queue).toHaveLength(0);
    expect(engine.get().snapshot!.runs[0].samples.map((s) => s.id)).toEqual(
      ids,
    );
    expect(engine.get().snapshot!.runs[0].distance).toBeCloseTo(
      engine.get().tracking!.distance,
    );
  });
  it("cold task restores active tracking, persists batch and ignores repeated callbacks", async () => {
    const run = await started();
    const task = new Engine(mock, store, authStore, gps, "mock", () => now);
    now += 5000;
    const fix = {
      ...demoRoute[0],
      timestamp: now,
      accuracy: 5,
      simulated: true,
    };
    await task.backgroundFixes([fix, fix]);
    expect(task.get().tracking?.sequence).toBe(1);
    expect(
      task.get().snapshot?.runs.find((r) => r.id === run.id)?.laps,
    ).toHaveLength(0);
    expect(
      task.get().snapshot?.runs.find((r) => r.id === run.id)?.samples,
    ).toHaveLength(1);
  });
  it("late background batch honors a durable pause even with stale in-memory capture", async () => {
    await started();
    const task = new Engine(mock, store, authStore, gps, "mock", () => now);
    await task.boot(true);
    const tracking = engine.get().tracking!;
    store.write("tracking:mock:11223344", { ...tracking, capture: "PAUSED" });
    now += 5000;
    await task.backgroundFixes([
      { ...demoRoute[1], timestamp: now, accuracy: 5, simulated: true },
    ]);
    expect(task.get().tracking?.sequence).toBe(0);
    expect(gps.stops).toBeGreaterThan(0);
  });
  it("retains sample identities across an offline background batch and retry", async () => {
    await started();
    await engine.boot(true);
    mock.scenario = "offline";
    now += 5000;
    await engine.backgroundFixes([
      { ...demoRoute[0], timestamp: now, accuracy: 5, simulated: true },
    ]);
    const batch = engine.get().tracking!.queue;
    expect(batch).toHaveLength(1);
    mock.scenario = "normal";
    await engine.sync();
    expect(engine.get().snapshot!.runs[0].samples[0].id).toBe(batch[0].id);
    expect(engine.get().tracking?.queue).toHaveLength(0);
  });
  it("breaks distance and map continuity after a GPS outage", async () => {
    await started();
    emit(0);
    const before = engine.get().tracking!.distance;
    now += 31000;
    emit(2);
    expect(engine.get().tracking?.segment).toBe(2);
    expect(engine.get().tracking?.distance).toBe(before);
    expect(segments(engine.get().tracking!.queue)).toHaveLength(2);
  });
  it("accuracy loss opens one new segment without bridging the gap", async () => {
    await started();
    emit(0);
    now += 5000;
    engine.ingest({
      ...demoRoute[1],
      timestamp: now,
      accuracy: 500,
      simulated: true,
    });
    now += 5000;
    engine.ingest({
      ...demoRoute[1],
      timestamp: now,
      accuracy: 500,
      simulated: true,
    });
    emit(2);
    expect(engine.get().tracking?.segment).toBe(2);
    expect(engine.get().tracking?.distance).toBe(0);
  });
});

describe("student authentication and isolation", () => {
  it("rejects invalid password without creating a session", async () => {
    await engine.logout();
    await engine.login("11223344", "bad");
    expect(engine.get().auth).toBeUndefined();
    expect(engine.get().error).toContain("chính xác");
  });
  it("restores paused sessions without starting location", async () => {
    const run = await started();
    emit(0);
    await engine.action("pause", "campus", run.id);
    const freshGps = new FakeGps(() => now);
    const restored = new Engine(
      mock,
      store,
      authStore,
      freshGps,
      "mock",
      () => now,
    );
    await restored.boot();
    expect(restored.get().tracking?.capture).toBe("PAUSED");
    expect(freshGps.starts).toBe(0);
    expect(
      restored.get().snapshot?.runs.find((r) => r.id === run.id)?.startedAt,
    ).toBe(run.startedAt);
  });
  it("expires session, halts capture, retains isolated queue", async () => {
    await started();
    emit(0);
    mock.scenario = "expired";
    await engine.refresh();
    expect(engine.get().auth).toBeUndefined();
    expect(store.read("tracking:mock:11223344")).toBeDefined();
    expect(engine.get().tracking).toBeUndefined();
  });
  it("does not show or upload the old account queue on account switch", async () => {
    await started();
    emit(0);
    mock.scenario = "offline";
    emit(1);
    await engine.logout();
    mock.scenario = "normal";
    await engine.login("11223345", "NeuRun@demo");
    await engine.sync();
    expect(engine.get().snapshot?.runs).toEqual([]);
    expect(engine.get().tracking).toBeUndefined();
    const old = store.read<{ queue: unknown[] }>("tracking:mock:11223344");
    expect(old!.queue.length).toBe(2);
  });
  it("API adapter never falls back to fixtures or guessed endpoints", async () => {
    await expect(
      apiService.login("11223344", "NeuRun@demo"),
    ).rejects.toMatchObject({ code: "CONTRACT_PENDING" });
  });
  it("does not restore mock credentials after switching to API mode", async () => {
    const real = new Engine(
      apiService,
      store,
      authStore,
      gps,
      "api",
      () => now,
    );
    await real.boot();
    expect(real.get().auth).toBeUndefined();
  });
});
describe("registration and attendance", () => {
  it("assigns a race-specific bib and prevents duplicate registration", async () => {
    await engine.action("register", "campus");
    await engine.action("register", "campus");
    await engine.action("register", "economics");
    const snap = engine.get().snapshot!;
    expect(snap.enrollments.filter((e) => e.raceId === "campus")).toHaveLength(
      1,
    );
    expect(snap.enrollments.find((e) => e.raceId === "campus")?.bib).not.toBe(
      snap.enrollments.find((e) => e.raceId === "economics")?.bib,
    );
    expect(snap.races.find((r) => r.id === "campus")?.registered).toBe(265);
  });
  it.each(["summer", "friendship", "green", "winter"])(
    "rejects closed/full/cancelled/not-open registration %s",
    async (raceId) => {
      // Second demo student has no seeded enrollment.
      await engine.logout();
      await engine.login("11223345", "NeuRun@demo");
      expect(await engine.action("register", raceId)).toBe(false);
      expect(engine.get().snapshot?.enrollments).toHaveLength(0);
    },
  );
  it("check-in does not automatically start", async () => {
    await ready();
    expect(gps.starts).toBe(0);
    expect(engine.get().snapshot?.runs.some((r) => r.status === "ACTIVE")).toBe(
      false,
    );
  });
  it("permission denied does not check-in", async () => {
    await engine.action("register", "campus");
    gps.issue = "Quyền vị trí bị từ chối";
    expect(await engine.action("checkin", "campus")).toBe(false);
    expect(
      engine.get().snapshot?.enrollments.find((e) => e.raceId === "campus")
        ?.checkedInAt,
    ).toBeUndefined();
  });
  it("outside and inaccurate GPS are rejected by service", async () => {
    await engine.action("register", "campus");
    const auth = engine.get().auth!;
    const op: Operation = {
      id: "outside",
      owner: auth.student.id,
      kind: "checkin",
      raceId: "campus",
      createdAt: now,
      fix: { ...(await gps.fresh()), latitude: 22 },
    };
    await expect(mock.execute(auth, op)).rejects.toMatchObject({
      code: "OUTSIDE",
    });
    await expect(
      mock.execute(auth, {
        ...op,
        id: "inaccurate",
        fix: { ...(await gps.fresh()), accuracy: 200 },
      }),
    ).rejects.toMatchObject({ code: "ACCURACY" });
  });
  it("unknown registration outcome reconciles and retries same operation ID", async () => {
    mock.scenario = "ambiguous";
    expect(await engine.action("register", "campus")).toBe(false);
    const pending = engine.get().tracking!.operations[0];
    expect(pending).toBeDefined();
    await engine.sync();
    expect(engine.get().tracking?.operations).toHaveLength(0);
    expect(
      engine.get().snapshot?.races.find((r) => r.id === "campus")?.registered,
    ).toBe(265);
    const db = store.read<{ operations: Record<string, string> }>(
      "mock-server:11223344",
    );
    expect(db?.operations[pending.id]).toBe(JSON.stringify(pending));
  });
});
describe("capture and synchronization", () => {
  it("handles storage exhaustion by stopping GPS and reporting an error", async () => {
    await started();
    const write = store.write.bind(store);
    store.write = () => {
      throw new Error("Quota exceeded");
    };
    expect(() => emit(0)).not.toThrow();
    expect(engine.get().tracking?.capture).toBe("ERROR");
    expect(engine.get().error).toContain("Bộ nhớ");
    store.write = write;
  });
  it("coalesces concurrent startCapture calls into one GPS subscription", async () => {
    const run = await started();
    await engine.suspendForeground();
    const before = gps.starts;
    await Promise.all([
      engine.startCapture(run.id),
      engine.startCapture(run.id),
    ]);
    expect(gps.starts - before).toBe(1);
  });
  it("failed start does not activate collector", async () => {
    await ready();
    mock.scenario = "start-error";
    expect(await engine.action("start", "campus")).toBe(false);
    expect(gps.starts).toBe(0);
  });
  it("blocks a second unfinished run", async () => {
    await started();
    expect(await engine.action("start", "campus")).toBe(false);
    expect(gps.starts).toBe(1);
  });
  it("pause immediately rejects late fixes and never restarts on network failure", async () => {
    const run = await started();
    emit(0);
    emit(1);
    const before = engine.get().tracking!.distance;
    mock.scenario = "offline";
    const pause = engine.action("pause", "campus", run.id);
    emit(2);
    await pause;
    expect(engine.get().tracking?.capture).toBe("PAUSED");
    expect(engine.get().tracking?.distance).toBe(before);
    expect(gps.starts).toBe(1);
    expect(engine.get().tracking?.queue).toHaveLength(2);
    expect(engine.get().tracking?.operations[0]?.kind).toBe("pause");
    expect(await engine.action("resume", "campus", run.id)).toBe(false);
    mock.scenario = "normal";
    await engine.sync();
    expect(
      engine.get().snapshot?.runs.find((r) => r.id === run.id)?.status,
    ).toBe("PAUSED");
  });
  it("resume starts a new segment with no distance bridge or checkpoint lap", async () => {
    const run = await started();
    emit(0);
    emit(1);
    await engine.action("pause", "campus", run.id);
    const distance = engine.get().tracking!.distance;
    now += 30000;
    await engine.action("resume", "campus", run.id);
    emit(0);
    expect(engine.get().tracking?.segment).toBe(2);
    expect(engine.get().tracking?.distance).toBe(distance);
    await engine.sync();
    const confirmed = engine.get().snapshot!.runs.find((r) => r.id === run.id)!;
    expect(confirmed.laps).toHaveLength(0);
    expect(confirmed.distance).toBeCloseTo(distance);
    expect(segments(confirmed.samples)).toHaveLength(2);
  });
  it("total time continues in pause while active time and finalized clock freeze", async () => {
    const run = await started();
    now += 10000;
    await engine.action("pause", "campus", run.id);
    const paused = engine.get().snapshot!.runs.find((r) => r.id === run.id)!;
    now += 20000;
    expect(elapsed(paused, now)).toBe(30000);
    expect(activeTime(paused, now)).toBe(10000);
    await engine.action("finish", "campus", run.id);
    now += 5000;
    await engine.refresh();
    const ended = engine.get().snapshot!.runs.find((r) => r.id === run.id)!;
    expect(elapsed(ended, now + 60000)).toBe(elapsed(ended, now));
    expect(ended.status).toBe("ENDED");
  });
  it("deduplicates retried samples at service boundary", async () => {
    const run = await started();
    emit(0);
    emit(1);
    const batch = engine.get().tracking!.queue;
    await mock.upload(engine.get().auth!, batch);
    await engine.sync();
    const serverRun = engine.get().snapshot!.runs.find((r) => r.id === run.id)!;
    expect(serverRun.samples).toHaveLength(2);
    expect(engine.get().tracking?.queue).toHaveLength(0);
    expect(serverRun.distance).toBeCloseTo(engine.get().tracking!.distance);
  });
  it("removes only acknowledged samples and separates permanent rejection", async () => {
    await started();
    emit(0);
    emit(1);
    const [a, b] = engine.get().tracking!.queue;
    const original = mock.upload.bind(mock);
    mock.upload = async () => ({ accepted: [a.id, "unrelated"], rejected: [] });
    await engine.sync();
    expect(engine.get().tracking?.queue.map((s) => s.id)).toEqual([b.id]);
    mock.upload = async () => ({
      accepted: [],
      rejected: [{ id: b.id, reason: "Invalid sample" }],
    });
    await engine.sync();
    expect(engine.get().tracking?.queue).toHaveLength(0);
    expect(engine.get().tracking?.rejected).toHaveLength(1);
    mock.upload = original;
  });
  it("caps the persistent queue without discarding unsent samples", async () => {
    await started();
    const tracking = engine.get().tracking!;
    store.write("tracking:mock:11223344", {
      ...tracking,
      queue: Array.from({ length: MAX_QUEUE }, (_, i) => ({
        ...demoRoute[0],
        id: `q-${i}`,
        owner: "11223344",
        runId: tracking.runId,
        segment: 1,
        sequence: i,
        timestamp: now,
        accuracy: 5,
        simulated: true,
      })),
    });
    const background = new Engine(
      mock,
      store,
      authStore,
      gps,
      "mock",
      () => now,
    );
    await background.boot(true);
    background.ingest({
      ...demoRoute[1],
      timestamp: now + 100,
      accuracy: 5,
      simulated: true,
    });
    expect(background.get().tracking?.queue).toHaveLength(MAX_QUEUE);
    expect(background.get().tracking?.capture).toBe("ERROR");
  });
  it("service alone confirms completion and engine stops GPS", async () => {
    const run = await started();
    emit(0);
    for (let lap = 0; lap < 4; lap++) {
      emit(1);
      emit(2);
      emit(3);
      emit(0);
    }
    await engine.sync();
    const confirmed = engine.get().snapshot!.runs.find((r) => r.id === run.id)!;
    expect(confirmed.status).toBe("COMPLETED");
    expect(confirmed.laps).toHaveLength(4);
    expect(engine.get().tracking?.capture).toBe("STOPPED");
    expect(statistics([confirmed], "Toàn bộ", now).completed).toBe(1);
  });
  it("check-out never modifies official results", async () => {
    const run = await started();
    await engine.action("finish", "campus", run.id);
    now += 2000;
    await engine.refresh();
    const result = engine.get().snapshot!.runs.find((r) => r.id === run.id)!;
    expect(await engine.action("checkout", "campus")).toBe(true);
    expect(engine.get().snapshot!.runs.find((r) => r.id === run.id)).toEqual(
      result,
    );
    expect(
      engine.get().snapshot!.enrollments.find((e) => e.raceId === "campus")
        ?.checkedOutAt,
    ).toBe(now);
  });
});
