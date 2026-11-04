import { afterEach, describe, expect, it, vi } from "vitest";
import { kitActive, kitDemo, kitProgress, type KitDemo } from "./kitDemo";
import { setAdminKey } from "./client";

const snapshot = (laps: number, status = "RUNNING", counter = 3): KitDemo => ({
  demo_id: "kit-1",
  status,
  serial_port: "COM3",
  race_id: "race-1",
  full_name: "Sinh viên",
  student_code: "11235723",
  message: null,
  error: null,
  last_lap_number: counter,
  run: {
    status: status === "COMPLETED" ? "COMPLETED" : "ACTIVE",
    lap_count: laps,
    total_laps: 2,
    duration_total_s: 125,
    distance_total_m: 400,
    total_steps: 570,
  },
});
afterEach(() => {
  setAdminKey("");
  vi.unstubAllGlobals();
});
describe("C04 kit two-lap flow", () => {
  it("waits for a real start before showing any progress", () => {
    const demo = { ...snapshot(0, "ARMED"), run: null };
    expect(kitProgress(demo)).toMatchObject({
      laps: 0,
      total: 2,
      completed: false,
    });
    expect(kitActive(demo.status)).toBe(true);
  });
  it("keeps running after lap one even with three or more serial hits", () => {
    const demo = snapshot(1, "RUNNING", 7);
    expect(kitProgress(demo)).toMatchObject({
      laps: 1,
      total: 2,
      completed: false,
    });
    expect(kitProgress(demo).text).toContain("1/2");
    expect(kitActive(demo.status)).toBe(true);
  });
  it("does not finish based on the lap counter alone", () => {
    expect(kitProgress(snapshot(2, "FINISH_REQUESTED")).completed).toBe(false);
    expect(kitActive("FINISH_REQUESTED")).toBe(true);
  });
  it("finishes only on the authoritative backend status", () => {
    const demo = snapshot(2, "COMPLETED");
    expect(kitProgress(demo)).toMatchObject({
      laps: 2,
      total: 2,
      completed: true,
    });
    expect(kitActive(demo.status)).toBe(false);
    expect(kitActive("STOPPED")).toBe(false);
    expect(kitActive("FAILED")).toBe(false);
  });
  it("uses only kit endpoints and sends no simulation settings", async () => {
    setAdminKey("test");
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(snapshot(0)), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const body = {
      serial_port: "COM03",
      student_code: "11235723",
      full_name: "Sinh viên",
    };
    await kitDemo.start(body);
    await kitDemo.get("kit-1");
    await kitDemo.stop("kit-1");
    expect(fetcher.mock.calls.map((call) => new URL(call[0]).pathname)).toEqual(
      [
        "/api/v1/demos/kit/sessions",
        "/api/v1/demos/kit/sessions/kit-1",
        "/api/v1/demos/kit/sessions/kit-1/stop",
      ],
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(body);
  });
});
