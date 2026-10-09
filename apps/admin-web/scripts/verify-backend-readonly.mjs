// No backend imports, startup, seed, simulator or business-data writes.
import { randomUUID } from "node:crypto";
const base = (
  process.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1"
).replace(/\/$/, "");
const origin = new URL(base).origin;
const key = process.env.ADMIN_API_KEY;
async function read(path, auth = key, method = "GET", expected = 200) {
  const response = await fetch(path.startsWith("http") ? path : base + path, {
    method,
    headers: auth ? { "X-Admin-Key": auth } : {},
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== expected)
    throw new Error(`HTTP ${response.status}, expected ${expected}`);
  return response.json();
}
async function socket(raceId) {
  const url = new URL(
    process.env.VITE_WS_BASE_URL || origin.replace(/^http/, "ws"),
  );
  url.pathname = `/ws/v1/races/${encodeURIComponent(raceId)}/live`;
  url.search = new URLSearchParams({ key }).toString();
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket timeout"));
    }, 10000);
    ws.onopen = () => {
      clearTimeout(timer);
      ws.close(1000);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(timer);
      ws.close();
      reject(new Error("WebSocket connection failed"));
    };
  });
}
try {
  await read(origin + "/health", null);
  const schema = await read(origin + "/openapi.json", null);
  for (const [path, method] of [
    ["/auth/admin-key", "post"],
    ["/races", "get"],
    ["/races/{race_id}/dashboard", "get"],
    ["/races/{race_id}/live", "get"],
    ["/races/{race_id}/runners", "get"],
    ["/races/{race_id}/checkpoint-events", "get"],
    ["/checkpoint-events/{event_id}", "get"],
    ["/checkpoint-events/{event_id}/resolve", "post"],
    ["/races/{race_id}/checkpoint-matching", "patch"],
    ["/checkpoints/{checkpoint_id}/devices", "post"],
  ]) {
    if (!schema.paths[new URL(base).pathname + path]?.[method])
      throw new Error(
        `Runtime contract missing ${method.toUpperCase()} ${path}`,
      );
  }
  console.log(
    "PASS health and published endpoint paths (not full schema equivalence)",
  );
  if (!key)
    throw new Error(
      "ADMIN_API_KEY is required in the test process environment; never put it in VITE_* variables",
    );
  await read("/auth/admin-key", randomUUID(), "POST", 401);
  await read("/auth/admin-key", key, "POST");
  console.log("PASS wrong/right key (no data writes)");
  const races = await read("/races");
  if (!races.items.length)
    console.log("SKIP race data and WS: backend has no existing races");
  for (const race of races.items.slice(0, 2)) {
    const path = `/races/${encodeURIComponent(race.race_id)}`;
    const [dashboard, live, runners, events] = await Promise.all([
      read(path + "/dashboard"),
      read(path + "/live"),
      read(path + "/runners?page=1&page_size=10"),
      read(path + "/checkpoint-events?limit=10"),
    ]);
    if (
      dashboard.race.race_id !== race.race_id ||
      live.race_id !== race.race_id
    )
      throw new Error("Race identity mismatch");
    const runner = runners.items.find((r) => r.run_id);
    if (runner) {
      const detail = `/runners/${encodeURIComponent(runner.student_id)}/runs/${encodeURIComponent(runner.run_id)}`;
      await read(detail);
      await read(detail + "/events?page=1&page_size=10");
    }
    if (events.items[0])
      await read(
        `/checkpoint-events/${encodeURIComponent(events.items[0].event_id)}`,
      );
    await socket(race.race_id);
    console.log(
      "PASS existing race dashboard/live/runners/events and WS handshake; optional run/event detail checked when present",
    );
  }
  console.log(
    "NOT TESTED: resolve/config/device writes, physical sensors, UI reconnect or WS message delivery",
  );
} catch (error) {
  // Never print fetch/WebSocket objects, stack traces, headers, keys or full URLs.
  console.error(
    error instanceof TypeError
      ? "BLOCKED: backend unreachable or response is not valid JSON; check local runtime"
      : error.message,
  );
  process.exitCode = 1;
}
