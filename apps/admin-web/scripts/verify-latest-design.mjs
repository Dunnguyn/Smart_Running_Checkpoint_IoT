// UI-only fixtures. Every API call and WebSocket is intercepted before navigation.
// Seed is a saved SIMULATED_GPS snapshot, never read from the running backend.
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const seed = JSON.parse(
  await readFile(
    new URL("./fixtures/qa-dashboard.json", import.meta.url),
    "utf8",
  ),
);
const dir = "test-results/design-20261014/states";
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [],
  writes = [],
  unexpected = [];
let detailError = false,
  conflict = true,
  authReject = false,
  paginateEvents = false;
const eventQueries = [];
const raceId = seed.race.race_id;
seed.race.locked = true;
seed.race.editable = false;
seed.race.locked_reason = "Đã tạo ít nhất một phiên chạy cho giải này.";
seed.runners[1].status = "ACTIVE";
seed.runners[1].last_seen_at = new Date(Date.now() - 20000).toISOString();
seed.runners[1].last_latitude = seed.runners[0].last_latitude;
seed.runners[1].last_longitude = seed.runners[0].last_longitude;
seed.runners[2].status = "ACTIVE";
seed.runners[2].last_seen_at = null;
seed.runners[2].last_latitude = null;
seed.runners[2].last_longitude = null;
seed.runners[3].status = "ACTIVE";
seed.runners[3].last_seen_at = new Date(Date.now() + 86400000).toISOString();
const cp = seed.checkpoints[0];
const event = {
  event_id: "qa-event",
  race_id: raceId,
  checkpoint_id: cp.checkpoint_id,
  device_id: "qa-device",
  device_event_id: "qa",
  occurred_at: new Date().toISOString(),
  received_at: new Date().toISOString(),
  match_deadline_at: null,
  match_status: "AMBIGUOUS",
  lap_status: "NOT_EVALUATED",
  reason_code: null,
  matched_runner: null,
  method: null,
  passage_id: null,
  lap_id: null,
  lap_number: null,
  lap_duration_ms: null,
  candidates_final: true,
  version: 1,
  config_version: 1,
  candidates: seed.runners.slice(0, 2).map((r, i) => ({
    ...r,
    passage_id: `passage-${i}`,
    entry_at: new Date().toISOString(),
    entry_distance_m: i + 1,
    time_delta_ms: i * 200,
    available: true,
  })),
};
page.on("pageerror", (e) => errors.push(e.message));
await page.routeWebSocket("**/ws/v1/**", () => {});
await page.route("https://*.tile.openstreetmap.org/**", (r) => r.abort());
await page.route("**/api/v1/**", async (route) => {
  const request = route.request(),
    url = new URL(request.url()),
    path = url.pathname;
  const json = (body, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  if (path.endsWith("/auth/admin-key")) {
    await new Promise((r) => setTimeout(r, 200));
    return authReject
      ? json({ detail: "Khóa không hợp lệ" }, 401)
      : json({ authenticated: true });
  }
  if (request.method() !== "GET") {
    writes.push({
      path,
      method: request.method(),
      body: request.postDataJSON(),
    });
    if (path.endsWith("/qa-event/resolve")) {
      if (conflict) {
        conflict = false;
        event.version++;
        return json({ detail: { code: "VERSION_CONFLICT" } }, 409);
      }
      event.version++;
      event.match_status =
        request.postDataJSON().action === "CONFIRM" ? "MATCHED" : "REJECTED";
      event.lap_status = "NOT_COUNTED";
      return json(event);
    }
    if (path.endsWith("/devices"))
      return json(
        {
          device_id: "qa-device",
          checkpoint_id: cp.checkpoint_id,
          race_id: raceId,
          status: "ACTIVE",
        },
        201,
      );
    unexpected.push(`${request.method()} ${path}`);
    return json({ detail: "Blocked unexpected write" }, 400);
  }
  if (path === "/api/v1/races") return json({ items: [seed.race] });
  if (path.endsWith("/dashboard")) return json(seed);
  if (path.endsWith("/live"))
    return json({
      race_id: raceId,
      runners: [],
      server_time: new Date().toISOString(),
    });
  if (path.endsWith("/route"))
    return json({ ...seed.route, ...seed.race, race_id: raceId });
  if (path.endsWith("/checkpoint-matching"))
    return json({
      checkpoint_mode: "GPS_ONLY",
      inner_radius_m: 10,
      outer_radius_m: 15,
      match_window_seconds: 3,
      late_grace_seconds: 2,
      max_sample_gap_seconds: 5,
      max_event_age_seconds: 30,
      max_future_skew_seconds: 5,
      config_version: 1,
      locked: true,
      locked_reason: seed.race.locked_reason,
    });
  if (path.endsWith("/checkpoint-events")) {
    eventQueries.push(Object.fromEntries(url.searchParams));
    return json({
      items: url.searchParams.has("cursor") ? [] : [event],
      next_cursor:
        paginateEvents && !url.searchParams.has("cursor") ? "qa-next" : null,
    });
  }
  if (path.endsWith("/checkpoint-events/qa-event")) return json(event);
  if (path.endsWith("/participants"))
    return json({ race_id: raceId, items: [] });
  if (path === "/api/v1/students")
    return json({ items: [], offset: 0, limit: 20 });
  if (path.includes("/runs/")) {
    if (detailError) return json({ detail: "Lỗi đọc fixture" }, 503);
    if (path.endsWith("/events"))
      return json({ items: [], total: 0, page: 1, page_size: 100 });
    const run = seed.runners.find((r) => path.endsWith(r.run_id));
    return run ? json(run) : json({ detail: "Không tìm thấy" }, 404);
  }
  if (path.endsWith("/runners"))
    return json({
      items: seed.runners,
      total: seed.runners.length,
      page: 1,
      page_size: 10,
    });
  unexpected.push(`GET ${path}`);
  return json({ detail: "Unexpected fixture route" }, 404);
});
async function open(path) {
  await page.goto(`http://localhost:5173${path}`);
  await page.getByLabel("Admin key", { exact: true }).fill("fixture-only");
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(page.locator("main")).toBeVisible();
}
async function capture(name) {
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

let studentAttempts = 0;
await page.route("**/api/v1/students", async (route) => {
  if (route.request().method() !== "POST") return route.fallback();
  studentAttempts++;
  const payload = route.request().postDataJSON();
  expect(payload).toEqual({
    student_code: "NEU-001",
    full_name: "Nguyễn Thị Minh Anh",
    faculty: "Kinh tế",
  });
  await route.fulfill({
    status: studentAttempts === 1 ? 409 : 201,
    contentType: "application/json",
    body: JSON.stringify(
      studentAttempts === 1
        ? { detail: "Mã sinh viên đã tồn tại" }
        : { student_id: "fixture-created", ...payload },
    ),
  });
});
try {
  await open("/runners?view=students");
  await page
    .getByRole("button", { name: "Thêm sinh viên", exact: true })
    .click();
  const form = page.getByRole("dialog");
  await expect(
    form.getByRole("button", { name: "Tạo sinh viên", exact: true }),
  ).toBeDisabled();
  await form.getByLabel("Mã sinh viên *", { exact: true }).fill("NEU-001");
  await form
    .getByLabel("Họ và tên *", { exact: true })
    .fill("Nguyễn Thị Minh Anh");
  await form.getByLabel("Khoa / Viện", { exact: true }).fill("Kinh tế");
  await form
    .getByRole("button", { name: "Tạo sinh viên", exact: true })
    .click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel("Mã sinh viên *", { exact: true })).toHaveValue(
    "NEU-001",
  );
  await capture("create-student-conflict");
  await form
    .getByRole("button", { name: "Tạo sinh viên", exact: true })
    .click();
  await expect(form).toHaveCount(0);
  expect(studentAttempts).toBe(2);
  await open("/checkpoints?tab=attention");
  await page.locator(".review-event").first().click();
  const review = page.locator(".journal-detail");
  await expect(review.getByRole("radio").first()).not.toBeChecked();
  await expect(
    review.getByRole("button", { name: "Xác nhận người chạy", exact: true }),
  ).toBeDisabled();
  await review.getByRole("radio").first().check();
  await review.getByLabel("Lý do xử lý").fill("Đối chiếu fixture");
  await capture("checkpoint-review");
  await review
    .getByRole("button", { name: "Xác nhận người chạy", exact: true })
    .click();
  await expect(review).toContainText("Sự kiện đã thay đổi");
  await expect(review.getByRole("radio").first()).not.toBeChecked();
  await open(`/races/${raceId}`);
  await expect(
    page.getByRole("button", { name: "Người tham gia", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Tuyến & trạm", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Chỉnh sửa bản đồ", exact: true }),
  ).toBeDisabled();
  await capture("setup-route-locked");
  await page
    .getByRole("button", { name: "Cấu hình ghi nhận", exact: true })
    .click();
  await capture("setup-matching");
  await open("/live");
  await page.locator(".watch-row").first().click();
  const before = await page.locator(".leaflet-container").boundingBox();
  await page.getByRole("button", { name: "Thu gọn hoặc mở sidebar" }).click();
  await page.waitForTimeout(400);
  const after = await page.locator(".leaflet-container").boundingBox();
  expect(after.width).toBeGreaterThan(before.width);
  await expect(page.locator(".watch-row").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await capture("map-collapsed-selected");
  await open("/analytics");
  await page
    .getByRole("button", { name: "Theo sinh viên", exact: true })
    .click();
  await page.getByLabel("Chọn phiên chạy").selectOption(seed.runners[0].run_id);
  await expect(page.locator("main")).toContainText("00:02:10");
  await capture("analytics-student");
  await open("/simulation");
  await page.getByRole("radio", { name: /GPS \+ Arduino/ }).check();
  await expect(
    page.getByLabel("Khoảng cách xuất phát giữa hai người (giây)"),
  ).toHaveValue("8");
  await page.getByText("Tùy chọn nâng cao", { exact: true }).click();
  await expect(page.getByLabel("Seed tái lập")).toBeVisible();
  await capture("simulation-options");
  await page.reload();
  await expect(page.getByLabel("Admin key", { exact: true })).toBeVisible();
  await capture("auth");
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
  await writeFile(
    `${dir}/results.json`,
    JSON.stringify(
      {
        checks: [
          "student validation/409/payload/success",
          "inline review 409 resets selection",
          "setup tabs and lock",
          "map resize retains selection",
          "analytics completed duration",
          "simulation mode defaults and advanced fields",
          "auth",
        ],
        errors,
        unexpected,
        interceptedWrites: studentAttempts + writes.length,
        realWrites: 0,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
