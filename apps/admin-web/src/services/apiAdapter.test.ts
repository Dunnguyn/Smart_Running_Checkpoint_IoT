import { afterEach, describe, expect, it, vi } from "vitest";
import { request, setAdminKey, liveUrl } from "./client";
import { normalizeRunner, utc, validPosition } from "./contract";
import { runnerQuery } from "./apiAdapter";
import { applyLive, subscribeLive } from "./liveService";
import type { LiveSnapshot } from "../types/domain";
const row = {
  run_id: "run",
  student_id: "student",
  race_id: "race",
  full_name: "Runner",
  student_code: "S1",
  status: "ACTIVE",
  lap_count: 1,
  distance_total_m: 80,
  total_steps: 1080,
  last_latitude: 21,
  last_longitude: 105,
  last_seen_at: "2026-10-04T00:00:00Z",
};
const snapshot = (): LiveSnapshot => ({
  runners: [normalizeRunner(row)],
  races: [],
  checkpoints: [],
  route: [],
  events: [],
  laps: [],
  updated_at: "2026-10-04T00:00:00Z",
  running: true,
});
afterEach(() => {
  setAdminKey("");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("backend contract and live consistency", () => {
  it("maps REGISTERED without inventing a run or position, handles SQLite UTC", () => {
    const r = normalizeRunner({
      ...row,
      run_id: null,
      status: "REGISTERED",
      last_latitude: null,
      last_longitude: null,
    });
    expect(r.status).toBe("PENDING");
    expect(r.run_id).toBe("");
    expect(r.last_latitude).toBeNull();
    expect(validPosition(91, 105)).toBe(false);
    expect(validPosition(NaN, 105)).toBe(false);
    expect(utc("invalid timestamp")).toBeNull();
    expect(utc("2026-10-04T00:00:00")).toBe("2026-10-04T00:00:00Z");
  });
  it("uses the actual query parameter names and status", () => {
    const query = runnerQuery({
      search: "Nguyễn",
      status: "PENDING",
      page: 3,
      sort: "lap_count",
      direction: "desc",
    });
    expect(Object.fromEntries(query)).toEqual({
      keyword: "Nguyễn",
      status: "REGISTERED",
      page: "3",
      page_size: "10",
      sort_by: "lap_count",
      sort_order: "desc",
    });
  });
  it("merges partial deltas, replaces step totals, ignores old/cross-race data and preserves completion", () => {
    let s = snapshot();
    s = applyLive(
      s,
      {
        type: "runner.updated",
        data: { run_id: "run", student_id: "student", total_steps: 1160 },
      },
      "race",
    );
    expect(s.runners[0].total_steps).toBe(1160);
    expect(s.runners[0].full_name).toBe("Runner");
    s = applyLive(
      s,
      {
        type: "runner.updated",
        data: { run_id: "run", student_id: "student", total_steps: 1080 },
      },
      "race",
    );
    expect(s.runners[0].total_steps).toBe(1160);
    expect(
      applyLive(
        s,
        {
          type: "runner.updated",
          race_id: "other",
          data: { run_id: "run", student_id: "student", total_steps: 9000 },
        },
        "race",
      ),
    ).toBe(s);
    s = applyLive(
      s,
      {
        type: "runner.completed",
        data: { run_id: "run", student_id: "student", duration_total_s: 64 },
      },
      "race",
    );
    s = applyLive(
      s,
      {
        type: "runner.updated",
        data: { run_id: "run", student_id: "student", total_steps: 9000 },
      },
      "race",
    );
    expect(s.runners[0].status).toBe("COMPLETED");
    expect(s.runners[0].duration_total_s).toBe(64);
    expect(s.runners[0].total_steps).toBe(1160);
    const before = s.runners[0].lap_count;
    s = applyLive(
      s,
      { type: "checkpoint.detected", data: { identity_status: "UNASSIGNED" } },
      "race",
    );
    expect(s.runners[0].lap_count).toBe(before);
  });
  it("encodes the key and normalizes auth / validation errors without leaking it", async () => {
    setAdminKey(crypto.randomUUID() + "&?#");
    expect(liveUrl("race").searchParams.get("key")).toMatch(/&\?#$/);
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: [{ loc: ["body", "device_id"], msg: "required" }],
        }),
        { status: 422 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      request("/runner-devices", { method: "POST", body: {} }),
    ).rejects.toMatchObject({
      status: 422,
      fields: { "body.device_id": "required" },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(request("/races")).rejects.toMatchObject({ status: 401 });
  });
  it("cancels pending requests when the key changes", async () => {
    setAdminKey(crypto.randomUUID());
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            ),
          ),
      ),
    );
    const pending = request("/races");
    setAdminKey(crypto.randomUUID());
    await expect(pending).rejects.toMatchObject({ status: 0 });
  });
  it("buffers events during resync and cleans up StrictMode subscriptions and auth rejection", async () => {
    vi.useFakeTimers();
    class Socket {
      static instances: Socket[] = [];
      onopen: (() => void) | null = null;
      onclose: ((e: { code: number }) => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      onerror = null;
      close = vi.fn();
      constructor() {
        Socket.instances.push(this);
      }
    }
    vi.stubGlobal("WebSocket", Socket);
    let resolve!: (s: LiveSnapshot) => void;
    const load = vi
      .fn()
      .mockResolvedValue(snapshot())
      .mockResolvedValueOnce(snapshot())
      .mockImplementationOnce(
        () =>
          new Promise<LiveSnapshot>((r) => {
            resolve = r;
          }),
      );
    const onSnapshot = vi.fn(),
      onStatus = vi.fn(),
      onError = vi.fn();
    const stop = subscribeLive("race", { onSnapshot, onStatus, onError }, load);
    await vi.advanceTimersByTimeAsync(0);
    const socket = Socket.instances[0];
    socket.onopen?.();
    socket.onmessage?.({
      data: JSON.stringify({
        type: "runner.updated",
        data: { run_id: "run", student_id: "student", total_steps: 1240 },
      }),
    });
    resolve(snapshot());
    await vi.advanceTimersByTimeAsync(0);
    expect(onSnapshot.mock.lastCall?.[0].runners[0].total_steps).toBe(1240);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onSnapshot.mock.lastCall?.[0].runners[0].total_steps).toBe(1240);
    socket.onmessage?.({ data: "malformed" });
    socket.onclose?.({ code: 4401 });
    await vi.advanceTimersByTimeAsync(60000);
    expect(Socket.instances).toHaveLength(1);
    expect(onError).toHaveBeenCalled();
    stop();
    expect(socket.close).toHaveBeenCalled();
    const deferredLoad = vi.fn(() => Promise.resolve(snapshot()));
    const strictCleanup = subscribeLive("other", { onSnapshot }, deferredLoad);
    strictCleanup();
    await vi.advanceTimersByTimeAsync(0);
    expect(Socket.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
