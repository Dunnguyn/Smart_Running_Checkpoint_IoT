import { afterEach, expect, it, vi } from "vitest";
import { createRace, racePayload, type RaceDraft } from "./raceCreation";
import { setAdminKey } from "./client";
const draft: RaceDraft = {
  name: " Giải NEU ",
  route_name: "",
  start_at: "",
  end_at: "",
  total_laps: "4",
  min_lap_interval_seconds: "",
  checkpoint_mode: "GPS_ONLY",
};
afterEach(() => {
  setAdminKey("");
  vi.unstubAllGlobals();
});
it("validates bounds, whitespace and dates without substituting backend defaults", () => {
  expect(racePayload(draft)).toMatchObject({
    fields: {},
    body: {
      name: "Giải NEU",
      status: "DRAFT",
      start_at: null,
      end_at: null,
      min_lap_interval_seconds: null,
    },
  });
  expect(
    Object.keys(
      racePayload({
        ...draft,
        name: " ",
        total_laps: "1.5",
        min_lap_interval_seconds: "3601",
        start_at: "invalid",
      }).fields,
    ),
  ).toEqual(["name", "total_laps", "min_lap_interval_seconds", "start_at"]);
  expect(
    racePayload({
      ...draft,
      start_at: "2026-10-10T09:00",
      end_at: "2026-10-09T09:00",
    }).fields.end_at,
  ).toBeTruthy();
});
it("sends only RaceIn fields and preserves absolute date instants", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ race_id: "new" }), { status: 201 }),
    );
  vi.stubGlobal("fetch", fetch);
  setAdminKey("fixture");
  await createRace({
    ...draft,
    start_at: "2026-10-10T09:00",
    checkpoint_mode: "GPS_AND_ARDUINO",
  });
  const [url, options] = fetch.mock.calls[0];
  expect(url).toMatch(/\/api\/v1\/races$/);
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body)).toEqual({
    name: "Giải NEU",
    status: "DRAFT",
    route_name: null,
    start_at: new Date("2026-10-10T09:00").toISOString(),
    end_at: null,
    total_laps: 4,
    min_lap_interval_seconds: null,
    checkpoint_mode: "GPS_AND_ARDUINO",
  });
});
it("does not retry ambiguous creation failure", async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError("network"));
  vi.stubGlobal("fetch", fetch);
  setAdminKey("fixture");
  await expect(createRace(draft)).rejects.toMatchObject({ status: 0 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
