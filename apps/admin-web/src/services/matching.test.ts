import { afterEach, expect, it, vi } from "vitest";
import { canResolve, reasonText } from "./matchingContract";
import { normalizeRunner } from "./contract";
import { applyLive } from "./liveService";
import { request, setAdminKey, getAdminKey, onSessionExpired } from "./client";
import { matchingService } from "./matchingService";
import type { LiveSnapshot } from "../types/domain";
const runner = normalizeRunner({
  student_id: "student-uuid",
  run_id: "run-uuid",
  race_id: "race",
  bib_number: "01",
  status: "ACTIVE",
  lap_count: 0,
  distance_total_m: 5,
  total_steps: 10,
});
afterEach(() => {
  setAdminKey("");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("preserves bib as display-only and completed position is not a lost connection", () => {
  expect(runner.bib).toBe("01");
  expect(runner.student_id).toBe("student-uuid");
  expect(normalizeRunner({ ...runner, status: "COMPLETED" }).connection).toBe(
    "FINISHED",
  );
});
it("GPS evidence pending Arduino and event updates never count a lap", () => {
  const snapshot: LiveSnapshot = {
    races: [],
    runners: [runner],
    checkpoints: [],
    events: [],
    laps: [],
    route: [],
    updated_at: new Date().toISOString(),
    running: true,
  };
  const next = applyLive(
    snapshot,
    {
      type: "checkpoint.passed",
      data: {
        run_id: "run-uuid",
        identity_status: "GPS_PASSAGE_PENDING_ARDUINO",
        lap_updated: false,
      },
    },
    "race",
  );
  expect(next.pendingPassages).toEqual(["run-uuid"]);
  expect(next.runners[0].lap_count).toBe(0);
  const matched = applyLive(
    next,
    {
      type: "checkpoint.match.updated",
      data: {
        event_id: "event",
        version: 2,
        match_status: "MATCHED",
        lap_status: "NOT_COUNTED",
      },
    },
    "race",
  );
  expect(matched.runners[0].lap_count).toBe(0);
  expect(reasonText("GPS_ONLY_MODE")).toContain("không cộng vòng");
});
it("requires ambiguous plus finalized candidates", () => {
  const minimal = {
    match_status: "AMBIGUOUS" as const,
    candidates_final: false,
  };
  expect(canResolve(minimal)).toBe(false);
  expect(canResolve({ ...minimal, candidates_final: true })).toBe(true);
  expect(
    canResolve({ ...minimal, match_status: "MATCHED", candidates_final: true }),
  ).toBe(false);
});
it("protected 401 expires the session once; login 401 does not emit expiry", async () => {
  const expired = vi.fn();
  const off = onSessionExpired(expired);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
  );
  setAdminKey(crypto.randomUUID());
  await expect(
    request("/auth/admin-key", { method: "POST" }),
  ).rejects.toMatchObject({ status: 401 });
  expect(expired).not.toHaveBeenCalled();
  await expect(request("/races")).rejects.toMatchObject({ status: 401 });
  await expect(request("/races")).rejects.toMatchObject({ status: 401 });
  expect(expired).toHaveBeenCalledTimes(1);
  expect(getAdminKey()).toBe("");
  off();
});
it("sends exact resolution payload on retries; parses backend conflict code", async () => {
  setAdminKey(crypto.randomUUID());
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ detail: { code: "VERSION_CONFLICT" } }), {
        status: 409,
      }),
    );
  vi.stubGlobal("fetch", fetch);
  const payload = {
    action: "CONFIRM" as const,
    passage_id: "passage-uuid",
    expected_version: 4,
    idempotency_key: crypto.randomUUID(),
    reason: "Đã đối chiếu",
  };
  await expect(matchingService.resolve("event", payload)).rejects.toMatchObject(
    { status: 409, code: "VERSION_CONFLICT" },
  );
  await expect(matchingService.resolve("event", payload)).rejects.toMatchObject(
    { status: 409 },
  );
  expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty(
    "student_id",
  );
});
