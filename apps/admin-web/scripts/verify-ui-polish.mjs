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
let readError = false;
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
  if (path.endsWith("/dashboard") && readError)
    return json({ detail: "Temporary read failure" }, 503);
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
  await page.goto("http://localhost:5173/");
  await page.getByLabel("Admin key", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tiến độ nổi bật", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Đã kết nối server", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("0 sự kiện cần xác nhận người chạy")).toHaveCount(
    0,
  );
  await mkdir("test-results/ui-after", { recursive: true });
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/ui-after/dashboard-${width}.png`,
      fullPage: true,
    });
  }
  readError = true;
  await page
    .getByRole("button", { name: "Làm mới dữ liệu", exact: true })
    .click();
  await expect(
    page.getByText("Chưa thể tải dữ liệu mới. Vui lòng thử lại.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Đang hiển thị dữ liệu đã tải trước đó."),
  ).toBeVisible();
  await page.waitForTimeout(1400);
  await expect(page.locator(".connection-notice")).toBeVisible();
  await page.screenshot({
    path: "test-results/ui-after/read-error.png",
    fullPage: true,
  });
  readError = false;
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.locator(".connection-notice")).toHaveCount(0);
  for (const ws of sockets)
    ws.close({ code: 1012, reason: "fixture reconnect" });
  await expect(page.locator(".connection-notice")).toBeVisible();
  await expect(page.locator(".connection-notice")).toHaveCount(0, {
    timeout: 10000,
  });
  await page.getByRole("link", { name: "Giải chạy", exact: true }).click();
  await expect(page.getByLabel("Chọn giải chạy")).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "Giải tùy chỉnh" });
  const menu = row.getByRole("button", { name: /Thao tác khác:/ });
  await menu.focus();
  await expect(
    row.getByRole("tooltip").filter({ hasText: /Thao tác khác:/ }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Xóa giải" })).toBeFocused();
  const h1 = await row.boundingBox();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  const h2 = await row.boundingBox();
  expect(h1.height).toBe(h2.height);
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await menu.click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/ui-after/races-${width}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
  }
  await row
    .getByRole("link", { name: "Mở giải Giải tùy chỉnh", exact: true })
    .click();
  await expect(page.getByLabel("Chọn giải chạy")).toHaveValue("a");
  await page.getByRole("link", { name: "← Tất cả giải chạy" }).click();
  await page.getByLabel("Tìm giải", { exact: true }).fill("does not exist");
  await expect(page.getByText("Không có giải phù hợp")).toBeVisible();
  await page.getByLabel("Tìm giải", { exact: true }).fill("");
  races.push({
    race_id: "long-name",
    status: "DRAFT",
    start_at: null,
    name: "Giải chạy với tên rất dài để kiểm tra xuống dòng và hành động không bị che ".repeat(
      3,
    ),
  });
  await page
    .getByRole("button", { name: "Làm mới dữ liệu", exact: true })
    .click();
  await expect(page.locator(".race-name").last()).toContainText(
    "Giải chạy với tên rất dài",
  );
  await page.screenshot({
    path: "test-results/ui-after/long-name.png",
    fullPage: true,
  });
  // Chromium page zoom equivalent via device metrics: CSS viewport at 80% of physical size.
  await page.setViewportSize({ width: 1093, height: 614 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1093,
    height: 614,
    deviceScaleFactor: 1.25,
    mobile: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/ui-after/scale125.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  await writeFile(
    "test-results/ui-after/report.json",
    JSON.stringify(
      {
        checks: [
          "normal header quiet, refresh tooltip",
          "read failure persists despite stale snapshots and recovers",
          "reconnect warning clears",
          "menu keyboard escape focus and no row resize",
          "global selector hidden, action navigation selects race",
          "empty search, 3 viewports, 125% equivalent CSS viewport",
        ],
        errors,
        realWrites: 0,
        fixtureWrites: writes.length,
        polls,
        startCount,
      },
      null,
      2,
    ),
  );
  console.log("UI polish fixture checks passed; zero mutations.");
} finally {
  await b.close();
}
