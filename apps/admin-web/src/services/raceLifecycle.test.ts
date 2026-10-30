import { afterEach, expect, it, vi } from "vitest";
import { changeRaceStatus, nextRaceTransition } from "./raceLifecycle";
import { setAdminKey } from "./client";
afterEach(() => {
  setAdminKey("");
  vi.unstubAllGlobals();
});
it("only offers the two forward transitions supported by the web", () => {
  expect(nextRaceTransition("DRAFT")).toEqual({
    expected_status: "DRAFT",
    status: "SCHEDULED",
  });
  expect(nextRaceTransition("SCHEDULED")).toEqual({
    expected_status: "SCHEDULED",
    status: "LIVE",
  });
  for (const status of ["LIVE", "CANCELLED", "COMPLETED"] as const)
    expect(nextRaceTransition(status)).toBeUndefined();
});
it("sends the observed status and maps the actual start returned by the backend", async () => {
  setAdminKey("test");
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          race_id: "a/b",
          status: "LIVE",
          actual_start_at: "2026-10-28T01:00:00Z",
          idempotent: false,
        }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  const result = await changeRaceStatus(
    "a/b",
    nextRaceTransition("SCHEDULED")!,
  );
  expect(fetcher.mock.calls[0][0]).toContain("/races/a%2Fb/status");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: "PATCH",
    body: JSON.stringify({ expected_status: "SCHEDULED", status: "LIVE" }),
  });
  expect(result.actual_start_at).toBe("2026-10-28T01:00:00Z");
});
it("does not turn a conflict into success or automatically retry", async () => {
  setAdminKey("test");
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: { code: "RACE_STATUS_CONFLICT", message: "Giải đã hủy" },
        }),
        { status: 409 },
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    changeRaceStatus("race", nextRaceTransition("SCHEDULED")!),
  ).rejects.toMatchObject({ status: 409, code: "RACE_STATUS_CONFLICT" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("refuses an unverified success response", async () => {
  setAdminKey("test");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ race_id: "other", status: "LIVE" })),
      ),
  );
  await expect(
    changeRaceStatus("race", nextRaceTransition("SCHEDULED")!),
  ).rejects.toMatchObject({ status: 0 });
});
