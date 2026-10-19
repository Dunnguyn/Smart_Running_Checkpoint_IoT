// Isolated cba5339 contract tests. All API requests intercepted; no real mutations.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const b = await chromium.launch({ channel: "msedge", headless: true });
const page = await b.newPage({ viewport: { width: 1366, height: 768 } });
let races = [
    { race_id: "a", name: "Giải tùy chỉnh", status: "DRAFT", start_at: null },
    { race_id: "b", name: "Giải thứ hai", status: "DRAFT", start_at: null },
  ],
  writes = [],
  errors = [],
  polls = 0,
  startCount = 0,
  jobStatus = "RUNNING",
  missing = false,
  lostStart = false,
  deleteMode = "",
  active = 0,
  patchError = false;
let config = {
  checkpoint_mode: "GPS_ONLY",
  inner_radius_m: 10,
  outer_radius_m: 15,
  match_window_seconds: 3,
  late_grace_seconds: 2,
  max_sample_gap_seconds: 5,
  max_event_age_seconds: 30,
  max_future_skew_seconds: 5,
  config_version: 1,
  min_lap_interval_seconds: 30,
  locked: false,
  locked_at: null,
  locked_reason: null,
};
const meta = {
  route_profile: "CUSTOM",
  route_length_min_m: null,
  route_length_max_m: null,
  editable: true,
  locked: false,
  locked_reason: null,
  route_status: "NOT_CONFIGURED",
};
const dashboard = (id) => ({
  race: {
    ...races.find((r) => r.race_id === id),
    ...meta,
    ...config,
    total_laps: 4,
  },
  summary: {
    participants: 0,
    started_runners: active,
    active_runners: active,
    completed_runners: 0,
    not_started_runners: 0,
    checkpoint_events: 0,
    checkpoint_events_by_status: {},
    pending_matches: 0,
    ambiguous_matches: 0,
    laps_recorded: 0,
    distance_total_m: 0,
    steps_total: 0,
  },
  runners: [],
  top_runners: [],
  recent_checkpoint_events: [],
  route: { points: [], distance_m: 0 },
  checkpoints: [],
  server_time: new Date().toISOString(),
});
const job = () => ({
  simulation_id: "job",
  status: jobStatus,
  race_id: "a",
  students: 5,
  laps_required: 4,
  checkpoint_mode: "GPS_ONLY",
  started_at: new Date().toISOString(),
  finished_at: jobStatus === "RUNNING" ? null : new Date().toISOString(),
  exit_code: null,
  log_tail: "Fixture cô lập — không chạy simulator thật",
  already_running: false,
});
const sockets = new Set();
await page.routeWebSocket("**/ws/v1/**", (ws) => {
  sockets.add(ws);
  ws.onClose(() => sockets.delete(ws));
});
await page.route("https://*.tile.openstreetmap.org/**", (r) => r.abort());
page.on("pageerror", (e) => errors.push(e.message));
let roster = { a: [], b: [] };
let bibConflict = false;
await page.route("**/api/v1/**", async (r) => {
  const req = r.request(),
    path = new URL(req.url()).pathname,
    method = req.method();
  const json = (body, status = 200) =>
    r.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  if (path.endsWith("/auth/admin-key")) return json({ authenticated: true });
  if (method !== "GET") writes.push({ path, method, body: req.postDataJSON() });
  if (path === "/api/v1/students") {
    const q = new URL(req.url()).searchParams.get("q") || "";
    if (q === "old") await new Promise((resolve) => setTimeout(resolve, 900));
    return json({
      items: [
        {
          student_id: q || "student",
          student_code: q || "SV01",
          full_name: q ? `Tên ${q}` : "Nguyễn An",
          faculty: null,
          status: "ACTIVE",
        },
      ],
      limit: 20,
      offset: 0,
    });
  }
  if (path.endsWith("/participants")) {
    const id = path.split("/")[4];
    if (method === "POST") {
      if (bibConflict)
        return json(
          { detail: { code: "BIB_NUMBER_EXISTS", message: "Bib trùng" } },
          422,
        );
      roster[id].push({
        participant_id: "p",
        student_id: req.postDataJSON().student_id,
        student_code: "SV01",
        full_name: "Nguyễn An",
        bib_number: req.postDataJSON().bib_number ?? "01",
        registration_status: "REGISTERED",
      });
      return json(
        {
          race_id: id,
          student_id: req.postDataJSON().student_id,
          registration_status: "REGISTERED",
        },
        201,
      );
    }
    if (id === "a") await new Promise((resolve) => setTimeout(resolve, 600));
    return json({ race_id: id, items: roster[id] });
  }
  if (path.endsWith("/runners"))
    return json({ items: [], total: 0, page: 1, page_size: 10 });
  if (path === "/api/v1/races") return json({ items: races });
  if (path === "/api/v1/simulations" && method === "POST") {
    startCount++;
    await new Promise((r) => setTimeout(r, 200));
    if (lostStart) return r.abort();
    jobStatus = "RUNNING";
    polls = 0;
    return json(job(), 202);
  }
  if (path.endsWith("/simulations/job/stop")) {
    jobStatus = "STOPPED";
    return json(job());
  }
  if (path.endsWith("/simulations/job")) {
    polls++;
    return missing
      ? json({ detail: { code: "SIMULATION_NOT_FOUND" } }, 404)
      : json(job());
  }
  if (path.endsWith("/checkpoint-matching")) {
    if (method === "PATCH") {
      if (patchError)
        return json({ detail: { code: "INVALID_GEOFENCE_RADII" } }, 422);
      config = {
        ...config,
        ...req.postDataJSON(),
        config_version: config.config_version + 1,
      };
    }
    return json(config);
  }
  const match = path.match(/\/races\/([^/]+)/),
    id = match?.[1];
  if (method === "DELETE") {
    if (deleteMode === "conflict")
      return json({ detail: { code: "RACE_HAS_ACTIVE_RUNS" } }, 409);
    races = races.filter((r) => r.race_id !== id);
    if (deleteMode === "lost") return r.abort();
    return json({ deleted: true, race_id: id });
  }
  if (path.endsWith("/dashboard"))
    return races.some((r) => r.race_id === id)
      ? json(dashboard(id))
      : json({}, 404);
  if (path.endsWith("/live"))
    return json({
      race_id: id,
      runners: [],
      server_time: new Date().toISOString(),
    });
  if (path.endsWith("/route"))
    return json({ race_id: id, ...meta, points: [], distance_m: 0 });
  throw new Error("Unexpected fixture " + method + " " + path);
});
try {
  await page.goto("http://localhost:5173/runners");
  await page.getByLabel("Admin key", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await page
    .getByRole("button", { name: "Sinh viên toàn hệ thống", exact: true })
    .click();
  const search = page.getByLabel("Tìm sinh viên theo tên hoặc mã");
  await expect(page.getByText("Nguyễn An", { exact: true })).toBeVisible();
  await search.fill("old");
  await page.waitForTimeout(400);
  await search.fill("new");
  await expect(page.getByText("Tên new", { exact: true })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText("Tên old", { exact: true })).toHaveCount(0);
  await expect(search).toBeFocused();
  await page
    .getByRole("button", { name: "Đăng ký của giải", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Đăng ký sinh viên", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Đăng ký sinh viên vào giải",
  });
  await modal.getByRole("button", { name: "Chọn SV01" }).click();
  await modal.getByLabel("Số báo danh (không bắt buộc)").fill("01");
  bibConflict = true;
  await modal.getByRole("button", { name: "Xác nhận đăng ký" }).click();
  await expect(
    modal.getByText("Số báo danh này đã được dùng trong giải."),
  ).toBeVisible();
  await expect(modal.getByLabel("Số báo danh (không bắt buộc)")).toHaveValue(
    "01",
  );
  bibConflict = false;
  await modal.getByLabel("Số báo danh (không bắt buộc)").fill("");
  await modal.getByRole("button", { name: "Xác nhận đăng ký" }).click();
  await expect(modal).toHaveCount(0);
  expect(writes.at(-1).body).toEqual({ student_id: "student" });
  await expect(
    page.getByRole("cell", { name: "01", exact: true }),
  ).toBeVisible();
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await mkdir("test-results/current", { recursive: true });
    await page.screenshot({
      path: `test-results/current/participants-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Làm mới đăng ký" }).click();
  await page.getByLabel("Chọn giải chạy").selectOption("b");
  await expect(
    page.locator(".roster-heading").getByText(/Giải thứ hai/),
  ).toBeVisible();
  await page.waitForTimeout(900);
  await expect(page.getByRole("cell", { name: "01", exact: true })).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
  expect(polls).toBe(0);
  expect(startCount).toBe(0);
  await writeFile(
    "test-results/current/enrollment-report.json",
    JSON.stringify({ realWrites: 0, interceptedWrites: writes.length, errors }),
  );
  console.log(
    JSON.stringify({
      checks: [
        "debounce ignores stale search, focus retained",
        "registration bib conflict keeps values; blank bib omitted; UUID linked",
        "01 display preserved",
        "old race response ignored",
        "three viewport screenshots without page overflow",
      ],
      interceptedWrites: writes.length,
      realWrites: 0,
      errors,
    }),
  );
} finally {
  await b.close();
}
