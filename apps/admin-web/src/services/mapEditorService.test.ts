import { describe, expect, it, afterEach, vi } from "vitest";
import {
  checkpointErrors,
  checkpointPayload,
  routePayload,
  validateRoute,
  meters,
  hasRuns,
  mapEditorService,
  mapFailure,
  type RoutePoint,
} from "./mapEditorService";
import { setAdminKey, RequestError } from "./client";
import type { DashboardDto } from "./matchingContract";
const cp = {
  checkpoint_id: "cp",
  code: "01",
  name: "Lap",
  sequence_no: 1,
  kind: "LAP" as const,
  latitude: 21,
  longitude: 105,
  radius_m: 10,
};
const points: RoutePoint[] = [
  { latitude: 21, longitude: 105, checkpoint_id: "cp" },
  { latitude: 21.00095, longitude: 105, checkpoint_id: null },
  { latitude: 21.00095, longitude: 105.001, checkpoint_id: null },
  { latitude: 21, longitude: 105.001, checkpoint_id: null },
  { latitude: 21, longitude: 105, checkpoint_id: null },
];
afterEach(() => {
  setAdminKey("");
  vi.unstubAllGlobals();
});
describe("map editor contract", () => {
  it("uses consecutive haversine segments, explicit closing vertex, and every anchor exactly once", () => {
    const v = validateRoute(points, [cp]);
    expect(v.errors).toEqual([]);
    expect(v.gap).toBe(0);
    expect(v.distance).toBeGreaterThan(400);
    expect(v.distance).toBeLessThan(450);
    expect(meters(points[0], points[1])).toBeCloseTo(105.63518, 3);
    expect(validateRoute(points.slice(0, -1), [cp]).errors).not.toEqual([]);
    expect(
      validateRoute(
        [...points.slice(0, -1), { ...points[0] }],
        [cp],
      ).errors.join(),
    ).toContain("một điểm neo");
    expect(
      validateRoute(points, [
        { ...cp, checkpoint_id: "other-race" },
      ]).errors.join(),
    ).toContain("giải khác");
  });
  it("rejects invalid coordinates and nonpositive radius without substituting zero", () => {
    expect(
      checkpointErrors({ latitude: NaN, longitude: 181, radius_m: 0 }),
    ).toEqual({
      latitude: expect.any(String),
      longitude: expect.any(String),
      radius_m: expect.any(String),
    });
    expect(
      Object.values(
        checkpointErrors({ latitude: 0, longitude: 0, radius_m: 0.1 }),
      ),
    ).toEqual(["", "", ""]);
    expect(
      validateRoute(
        points.map((p, i) => (i === 2 ? { ...p, latitude: Infinity } : p)),
        [cp],
      ).errors.length,
    ).toBeGreaterThan(0);
  });
  it("keeps anchors and order, strips read-only fields, patches only changed writable values", async () => {
    const original = JSON.stringify(points);
    const changed = points.map((p, i) =>
      i === 1 ? { ...p, latitude: 21.00096 } : p,
    );
    expect(JSON.stringify(points)).toBe(original);
    expect(routePayload(changed).points[0].checkpoint_id).toBe("cp");
    expect(
      checkpointPayload({ latitude: 21.01, longitude: 105, radius_m: 10 }, cp),
    ).toEqual({ latitude: 21.01 });
    setAdminKey("test-only");
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await mapEditorService.patch("cp/id", { latitude: 21.01 });
    expect(fetch.mock.calls[0][0]).toContain("/checkpoints/cp%2Fid");
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: "PATCH",
      body: '{"latitude":21.01}',
    });
    await mapEditorService.put("race", changed);
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify(routePayload(changed)),
    });
  });
  it("completed runs lock edits and lock responses never imply success", () => {
    const d = {
      summary: { started_runners: 0 },
      runners: [{ run_id: "done", status: "COMPLETED" }],
    } as DashboardDto;
    expect(hasRuns(d)).toBe(true);
    expect(hasRuns(undefined)).toBe(false);
    expect(
      mapFailure(new RequestError(409, "conflict", {}, "CHECKPOINT_LOCKED")),
    ).toContain("kể cả phiên đã hoàn thành");
  });
});

it("identifies incomplete vertices and does not report unmeasurable geometry as out of bounds", () => {
  const result = validateRoute(
    points.map((p, i) => (i === 1 ? { ...p, latitude: NaN } : p)),
    [cp],
  );
  expect(result.invalidPoints).toEqual([1]);
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0]).toContain("Điểm 2");
  expect(result.errors[0]).not.toContain("400–450");
});
