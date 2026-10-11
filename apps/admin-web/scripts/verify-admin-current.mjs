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
  await page.goto("http://localhost:5173/races");
  await page.getByLabel("Admin key", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Giải tùy chỉnh" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tạo mô phỏng", exact: true }).click();
  let modal = page.getByRole("dialog", { name: "Tạo mô phỏng" });
  await modal.getByLabel("Chế độ mô phỏng").selectOption("GPS_AND_ARDUINO");
  await expect(
    modal.getByText(/chưa phải dữ liệu từ kit Arduino thật/),
  ).toBeVisible();
  await expect(
    modal.getByLabel("Khoảng cách xuất phát giữa hai người (giây)"),
  ).toHaveValue("8");
  await modal
    .getByLabel("Khoảng cách xuất phát giữa hai người (giây)")
    .fill("0");
  await modal.getByLabel("Chế độ mô phỏng").selectOption("GPS_ONLY");
  await modal.getByLabel("Chế độ mô phỏng").selectOption("GPS_AND_ARDUINO");
  await expect(
    modal.getByLabel("Khoảng cách xuất phát giữa hai người (giây)"),
  ).toHaveValue("0");
  await modal.getByRole("button", { name: "Bắt đầu mô phỏng" }).click();
  expect(
    writes.find((w) => w.path === "/api/v1/simulations").body
      .runner_start_gap_seconds,
  ).toBe(0);
  await expect(page.getByText("Đang mô phỏng", { exact: true })).toBeVisible();
  expect(startCount).toBe(1);
  await expect.poll(() => polls).toBeGreaterThan(1);
  await page.locator('a[href="/races/a"]').click();
  await expect(
    page.getByRole("link", { name: "← Tất cả giải chạy" }),
  ).toBeVisible();
  const unmountedPolls = polls;
  await page.waitForTimeout(1800);
  expect(polls).toBe(unmountedPolls);
  await page.getByRole("link", { name: "← Tất cả giải chạy" }).click();
  jobStatus = "COMPLETED";
  await expect(page.getByText("Đã hoàn tất", { exact: true })).toBeVisible();
  const terminalPolls = polls;
  await page.waitForTimeout(1800);
  expect(polls).toBe(terminalPolls);
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
      path: `test-results/current/races-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Tạo mô phỏng", exact: true }).click();
  await modal.getByRole("button", { name: "Bắt đầu mô phỏng" }).click();
  await expect(page.getByText("Đang mô phỏng", { exact: true })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Dừng mô phỏng", exact: true })
    .click();
  await expect(page.getByText("Đã dừng", { exact: true })).toBeVisible();
  expect(writes.filter((r) => r.path.endsWith("/stop"))).toHaveLength(1);
  missing = true;
  await page.reload();
  await page.getByLabel("Admin key", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(page.getByText(/Máy chủ có thể đã khởi động lại/)).toBeVisible();
  const missingPolls = polls;
  await page.waitForTimeout(1700);
  expect(polls).toBe(missingPolls);
  expect(startCount).toBe(2);
  await expect(
    page.getByRole("button", { name: "Mở bản đồ giải" }),
  ).toBeVisible();
  await page.locator('a[href="/races/a"]').click();
  await page.getByText("Cấu hình GPS / Arduino", { exact: true }).click();
  const input = page.getByLabel("Bán kính trong (m)", { exact: true });
  await expect(input).toHaveValue("10");
  await input.fill("11");
  patchError = true;
  await page.getByRole("button", { name: "Lưu cấu hình ghép" }).click();
  await expect(page.getByRole("alert")).toContainText("INVALID_GEOFENCE_RADII");
  await expect(input).toHaveValue("11");
  patchError = false;
  await page.getByRole("button", { name: "Lưu cấu hình ghép" }).click();
  await expect(page.getByText("Đã đọc lại cấu hình sau lưu.")).toBeVisible();
  await expect(input).toHaveValue("11");
  await page.screenshot({
    path: "test-results/current/matching.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "← Tất cả giải chạy" }).click();
  const row = page.getByRole("row").filter({ hasText: "Giải tùy chỉnh" });
  await row.getByText("Thao tác khác").click();
  await row.getByRole("button", { name: "Xóa giải", exact: true }).click();
  const del = page.getByRole("dialog", { name: "Xóa giải chạy" });
  await expect(
    del.getByRole("button", { name: "Xóa giải", exact: true }),
  ).toBeDisabled();
  await del.getByLabel("Nhập XÓA để xác nhận").fill("XÓA");
  deleteMode = "conflict";
  await del.getByRole("button", { name: "Xóa giải", exact: true }).click();
  await expect(del.getByRole("alert")).toContainText("còn phiên đang chạy");
  await page.screenshot({
    path: "test-results/current/delete-confirm.png",
    fullPage: true,
  });
  deleteMode = "lost";
  await del.getByRole("button", { name: "Xóa giải", exact: true }).click();
  await expect(del).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "Giải tùy chỉnh" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Chọn giải chạy")).not.toHaveValue("a");
  await expect.poll(() => sockets.size).toBe(0);
  expect(page.url()).toContain("/races");
  await page.getByRole("button", { name: "Mở bản đồ giải" }).click();
  await expect(
    page.getByText(/Giải của mô phỏng không còn trong danh sách/),
  ).toBeVisible();
  expect(page.url()).toContain("/races");
  active = 1;
  const rowB = page.getByRole("row").filter({ hasText: "Giải thứ hai" });
  await rowB.getByText("Thao tác khác").click();
  await rowB.getByRole("button", { name: "Xóa giải", exact: true }).click();
  await expect(del.getByText(/Giải có 1 phiên/)).toBeVisible();
  await del.getByLabel("Nhập XÓA để xác nhận").fill("XÓA");
  await expect(
    del.getByRole("button", { name: "Xóa giải", exact: true }),
  ).toBeEnabled();
  await del.getByRole("button", { name: "Xóa giải", exact: true }).click();
  await expect(del).toHaveCount(0);
  lostStart = true;
  await page.getByRole("button", { name: "Tạo mô phỏng", exact: true }).click();
  await modal.getByRole("button", { name: "Bắt đầu mô phỏng" }).click();
  await expect(page.getByText(/Chưa xác định request tạo/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tạo mô phỏng", exact: true }),
  ).toBeDisabled();
  expect(startCount).toBe(3);
  expect(errors).toEqual([]);
  const report = {
    checks: [
      "simulation create single POST, polling terminal/unmount stop",
      "stop verified via GET without finishing runs",
      "404 after restart stops poll and keeps race link",
      "matching GET initializes form; PATCH error preserves draft and success rereads",
      "delete confirmation/409/lost-response readback, selected cache and socket cleanup",
      "active run warning allows confirmed DELETE",
      "ambiguous simulation creation no retry",
      "1366 and 1920 overflow/screenshots",
    ],
    errors,
    interceptedWrites: writes.length,
    realWrites: 0,
  };
  await writeFile(
    "test-results/current/admin-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await b.close();
}
