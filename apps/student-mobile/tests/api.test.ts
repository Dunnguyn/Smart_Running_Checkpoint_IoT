import { beforeEach, expect, it, vi } from "vitest";
import { ApiService } from "../src/services/api";
import { MemoryStore } from "../src/storage/port";
import type { Auth, Sample } from "../src/domain/model";
import type { AuthStore } from "../src/state/engine";
const auth: Auth = {
  token: "access",
  refreshToken: "refresh",
  installationId: "installation",
  expiresAt: Date.now() + 3600000,
  student: {
    id: "student",
    code: "11223344",
    name: "Student",
    faculty: "",
    className: "",
  },
};
const sample: Sample = {
  id: "sample-1",
  runId: "run",
  owner: "student",
  sequence: 1,
  segment: 1,
  timestamp: Date.now(),
  latitude: 21,
  longitude: 105,
  accuracy: 5,
  simulated: false,
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
let store: MemoryStore, credentials: AuthStore;
beforeEach(() => {
  store = new MemoryStore();
  credentials = { read: vi.fn(), write: vi.fn(), clear: vi.fn() };
});
it("logs in with student credentials and a stable installation UUID", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      json({
        access_token: "a",
        refresh_token: "r",
        expires_in: 900,
        profile: {
          student_id: "student",
          student_code: "11223344",
          full_name: "A",
          must_change_password: true,
        },
      }),
    );
  const api = new ApiService(
    "http://backend/api/v1/",
    store,
    credentials,
    "IOS",
    fetcher,
  );
  expect((await api.login("11223344", "password")).mustChangePassword).toBe(
    true,
  );
  fetcher.mockResolvedValue(
    json({
      access_token: "a",
      refresh_token: "r",
      expires_in: 900,
      profile: { student_id: "student" },
    }),
  );
  await api.login("11223344", "password");
  expect(fetcher.mock.calls[0][0]).toBe(
    "http://backend/api/v1/student/auth/login",
  );
  const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(body.installation_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(body.platform).toBe("IOS");
  expect(
    JSON.parse(fetcher.mock.calls[1][1]!.body as string).installation_id,
  ).toBe(body.installation_id);
  expect(fetcher.mock.calls[0][1]!.headers).not.toHaveProperty("X-Admin-Key");
});
it("preserves exactly the batch body after lost response and process restart", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error("lost"));
  const api = new ApiService(
    "http://backend",
    store,
    credentials,
    "ANDROID",
    fetcher,
  );
  await expect(api.upload(auth, [sample])).rejects.toMatchObject({
    code: "NETWORK",
    retryable: true,
  });
  fetcher.mockResolvedValue(
    json({
      items: [{ sample_id: sample.id, accepted: true, status: "DUPLICATE" }],
    }),
  );
  const restarted = new ApiService(
    "http://backend",
    store,
    credentials,
    "ANDROID",
    fetcher,
  );
  expect(
    await restarted.upload(auth, [
      sample,
      { ...sample, id: "sample-2", sequence: 2 },
    ]),
  ).toEqual({ accepted: [sample.id], rejected: [] });
  expect(fetcher.mock.calls[1][1]!.body).toBe(fetcher.mock.calls[0][1]!.body);
  // Crash after ACK but before queue persistence: serve durable ACK without a new batch.
  await restarted.upload(auth, [sample]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("keeps samples when server ACK is incomplete", async () => {
  const api = new ApiService(
    "http://backend",
    store,
    credentials,
    "ANDROID",
    vi.fn<typeof fetch>().mockResolvedValue(json({ items: [] })),
  );
  await expect(api.upload(auth, [sample])).rejects.toMatchObject({
    code: "ACK",
    retryable: true,
  });
});
it("records explicit stale GPS rejection without turning it into success", async () => {
  const api = new ApiService(
    "http://backend",
    store,
    credentials,
    "ANDROID",
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json({
          items: [
            {
              sample_id: sample.id,
              accepted: false,
              status: "REJECTED",
              reason_code: "GPS_TOO_OLD",
            },
          ],
        }),
      ),
  );
  expect(await api.upload(auth, [sample])).toEqual({
    accepted: [],
    rejected: [{ id: sample.id, reason: "GPS_TOO_OLD" }],
  });
});
it("blocks simulated GPS and another student's queue before network access", async () => {
  const fetcher = vi.fn<typeof fetch>();
  const api = new ApiService(
    "http://backend",
    store,
    credentials,
    "ANDROID",
    fetcher,
  );
  await expect(
    api.upload(auth, [{ ...sample, simulated: true }]),
  ).rejects.toMatchObject({ code: "IDENTITY" });
  await expect(
    api.upload(auth, [{ ...sample, owner: "other" }]),
  ).rejects.toMatchObject({ code: "IDENTITY" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("rotates refresh token once for concurrent requests and persists it", async () => {
  const session = { ...auth, expiresAt: 0 };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input) =>
      String(input).endsWith("/auth/refresh")
        ? json({
            access_token: "new",
            refresh_token: "rotated",
            expires_in: 900,
          })
        : new Response(null, { status: 204 }),
    );
  const api = new ApiService(
    "http://backend",
    store,
    credentials,
    "ANDROID",
    fetcher,
  );
  await Promise.all([
    api.changePassword(session, "old", "new"),
    api.changePassword(session, "old", "new"),
  ]);
  expect(
    fetcher.mock.calls.filter((c) => String(c[0]).endsWith("/auth/refresh")),
  ).toHaveLength(1);
  expect(session.refreshToken).toBe("rotated");
  expect(credentials.write).toHaveBeenCalledWith(
    expect.objectContaining({ refreshToken: "rotated" }),
  );
});
it("requires login again after an ambiguous refresh response", async () => {
  const api = new ApiService(
    "http://backend",
    store,
    credentials,
    "ANDROID",
    vi.fn<typeof fetch>().mockRejectedValue(new Error("lost")),
  );
  await expect(
    api.changePassword({ ...auth, expiresAt: 0 }, "old", "new"),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(credentials.clear).toHaveBeenCalled();
});
it("retains committed operation after reconciliation failure without another POST", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json({ registration_id: "registration" }))
    .mockResolvedValue(
      json(
        { detail: { error: { code: "BACKEND_ERROR", message: "Failed" } } },
        500,
      ),
    );
  const api = new ApiService(
    "http://backend",
    store,
    credentials,
    "ANDROID",
    fetcher,
  );
  const op = {
    id: "op",
    owner: "student",
    kind: "register" as const,
    raceId: "race",
    createdAt: Date.now(),
  };
  await expect(api.execute(auth, op)).rejects.toMatchObject({
    retryable: true,
  });
  await expect(api.execute(auth, op)).rejects.toMatchObject({
    retryable: true,
  });
  expect(
    fetcher.mock.calls.filter((c) => c[1]?.method === "POST"),
  ).toHaveLength(1);
});
it("freezes expected revision across a retry and withdraws instead of completing", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      json({ revision: 4, bound_to_current_installation: true }),
    )
    .mockRejectedValue(new Error("lost"));
  const api = new ApiService(
    "http://backend",
    store,
    credentials,
    "ANDROID",
    fetcher,
  );
  const op = {
    id: "op",
    owner: "student",
    kind: "finish" as const,
    raceId: "race",
    runId: "run",
    createdAt: Date.now(),
  };
  await expect(api.execute(auth, op)).rejects.toMatchObject({
    retryable: true,
  });
  await expect(api.execute(auth, op)).rejects.toMatchObject({
    retryable: true,
  });
  expect(fetcher.mock.calls[1][0]).toContain("/runs/run/withdraw");
  expect(fetcher.mock.calls[2][1]!.body).toBe(fetcher.mock.calls[1][1]!.body);
  expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string)).toEqual({
    expected_revision: 4,
  });
});
it("reads cursor pages, authoritative gates, paused state, laps and track", async () => {
  const race = {
    race_id: "race",
    name: "Race",
    status: "SCHEDULED",
    capacity: null,
    can_register: true,
    registered_count: 0,
    target_laps: 4,
    actions: { can_check_in: true, can_start: false },
    participation: {
      bib_number: "001",
      attendance: {
        checked_in_at: "2026-10-27T00:00:00",
        checked_out_at: null,
      },
    },
  };
  const run = {
    run_id: "run",
    race_id: "race",
    status: "ACTIVE",
    tracking_state: "PAUSED",
    revision: 2,
    started_at: "2026-10-27T00:00:00",
    active_seconds: 30,
    distance_total_m: 50,
    last_processed_sequence: 7,
    bound_to_current_installation: false,
  };
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/races?"))
      return json({
        items: url.includes("cursor") ? [race] : [],
        has_more: !url.includes("cursor"),
        next_cursor: url.includes("cursor") ? null : "next",
      });
    if (url.endsWith("/map"))
      return json({ route_points: [], checkpoints: [] });
    if (url.includes("/runs?")) return json({ items: [run], has_more: false });
    if (url.endsWith("/current-run")) return json({ run });
    if (url.includes("/laps?"))
      return json({
        items: [{ lap_no: 1, occurred_at: "2026-10-27T00:00:30" }],
        has_more: false,
      });
    if (url.includes("/track?")) return json({ items: [], has_more: false });
    throw new Error(url);
  });
  const snapshot = await new ApiService(
    "http://backend",
    store,
    credentials,
    "ANDROID",
    fetcher,
  ).snapshot(auth);
  expect(snapshot.races[0].registrationAllowed).toBe(true);
  expect(snapshot.races[0].registrationMessage).toBe("Đang mở đăng ký");
  expect(snapshot.enrollments[0].checkedInAt).toBe(
    Date.parse("2026-10-27T00:00:00Z"),
  );
  expect(snapshot.runs[0]).toMatchObject({
    status: "PAUSED",
    activeMs: 30000,
    lastSequence: 7,
    boundToInstallation: false,
  });
  expect(snapshot.runs[0].laps).toHaveLength(1);
});
it("does not silently return a partial list when the cursor is broken", async () => {
  const api = new ApiService(
    "http://backend",
    store,
    credentials,
    "ANDROID",
    vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        json({ items: [], has_more: true, next_cursor: "same" }),
      ),
  );
  await expect(api.snapshot(auth)).rejects.toMatchObject({
    code: "PAGINATION",
  });
});
