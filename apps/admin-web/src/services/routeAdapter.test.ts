import { describe, expect, it } from "vitest";
import { mapGeometry } from "./routeAdapter";

const checkpoints = [
  {
    checkpoint_id: "cp-uuid",
    code: "01",
    name: "Lap",
    sequence_no: 1,
    kind: "LAP" as const,
    latitude: 21,
    longitude: 105,
    radius_m: 10,
  },
];
describe("stored backend geometry", () => {
  it("keeps API latitude/longitude and order, and does not snap GPS or derive a line from checkpoints", () => {
    const geometry = mapGeometry(
      "race-uuid",
      {
        distance_m: 425,
        points: [
          {
            sequence_no: 2,
            latitude: 21.001,
            longitude: 105.002,
            checkpoint_id: null,
          },
          {
            sequence_no: 1,
            latitude: 21,
            longitude: 105,
            checkpoint_id: "cp-uuid",
          },
        ],
      },
      checkpoints,
    );
    expect(geometry.route).toEqual([
      [21, 105],
      [21.001, 105.002],
    ]);
    expect(geometry.checkpoints[0]).toMatchObject({
      checkpoint_id: "cp-uuid",
      race_id: "race-uuid",
      latitude: 21,
      longitude: 105,
      radius_m: 10,
    });
    expect(
      mapGeometry("race-uuid", { points: [], distance_m: 0 }, checkpoints),
    ).toMatchObject({
      route: [],
      routeMessage: "Giải chạy chưa có tuyến được lưu.",
    });
  });
  it("does not bridge invalid vertices and preserves markers when the line is invalid or unsupported", () => {
    expect(
      mapGeometry(
        "race",
        {
          distance_m: 400,
          points: [
            {
              sequence_no: 1,
              latitude: 105,
              longitude: 21,
              checkpoint_id: null,
            },
          ],
        },
        checkpoints,
      ),
    ).toMatchObject({ route: [], checkpoints: [{ checkpoint_id: "cp-uuid" }] });
    expect(mapGeometry("race", undefined, checkpoints).routeMessage).toContain(
      "Chưa được backend hỗ trợ",
    );
  });
});
