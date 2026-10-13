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
const dir = "test-results/qa-20261013";
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [],
  errors = [],
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
  candidates: seed.runners
    .slice(0, 2)
    .map((r, i) => ({
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
try {
  for (const [width, height] of process.env.QA_INTERACTIONS_ONLY
    ? []
    : [
        [1440, 900],
        [1366, 768],
        [768, 1024],
        [390, 844],
      ]) {
    await page.setViewportSize({ width, height });
    for (const path of [
      "/",
      "/live",
      "/races",
      `/races/${raceId}`,
      "/runners",
      "/runners?view=participants",
      "/runners?view=students",
      "/checkpoints",
      "/checkpoints?tab=journal",
      "/checkpoints?tab=stations",
      "/simulation",
      "/not-a-page",
    ]) {
      await open(path);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      checks.push({
        path,
        width,
        state: "direct navigation + auth + layout",
        result: overflow ? "FAIL" : "PASS",
      });
      await capture(`${width}-${path.replace(/[^a-z0-9]+/gi, "-")}`);
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  seed.runners[1].last_seen_at = new Date(Date.now() - 20000).toISOString();
  await open("/live");
  await expect(
    page.getByText("Tuyến đã khóa vì giải đã có phiên chạy.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Chỉnh sửa bản đồ", exact: true }),
  ).toBeDisabled();
  const row = page.locator(".watch-row").first();
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".selected-runner")).toContainText("#01");
  await expect(page.locator(".watch-row").nth(2)).toContainText(
    "Chưa có vị trí mới",
  );
  await expect(page.locator(".watch-row").nth(3)).toContainText(
    "Thời gian GPS vượt thời gian hiện tại",
  );
  const before = await page.locator(".watch-row").nth(1).innerText();
  await page.waitForTimeout(1200);
  expect(await page.locator(".watch-row").nth(1).innerText()).not.toBe(before);
  const chosenMarker = page.locator(".runner-marker.selected");
  await expect(chosenMarker).toContainText("×3");
  expect(
    await chosenMarker.evaluate((e) => Number(e.style.zIndex)),
  ).toBeGreaterThan(1000);
  await chosenMarker.click();
  await page
    .locator(".leaflet-popup")
    .getByRole("button", { name: /#02/ })
    .click();
  await expect(page.locator(".watch-row").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator(".leaflet-popup-close-button").last().click();
  await page.locator(".checkpoint-marker").last().click();
  await expect(page.locator(".watch-row").nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator(".leaflet-popup-close-button").last().click();
  await page
    .getByRole("button", { name: "Theo dõi người chạy", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Dừng theo dõi", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const bounds = await page.locator(".leaflet-container").boundingBox();
  await page.mouse.move(bounds.x + 80, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 160, bounds.y + 140, { steps: 8 });
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Theo dõi người chạy", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(800); // Let Leaflet drag inertia finish before checking REST polling.
  const transform = await page
    .locator(".leaflet-map-pane")
    .getAttribute("style");
  await page.waitForTimeout(1500);
  expect(await page.locator(".leaflet-map-pane").getAttribute("style")).toBe(
    transform,
  );
  await page
    .getByRole("button", { name: "Xem toàn tuyến", exact: true })
    .click();
  await page.getByText("Lớp bản đồ", { exact: true }).click();
  await page.getByLabel("Người chạy", { exact: true }).uncheck();
  await expect(page.locator(".runner-marker")).toHaveCount(0);
  await page.getByLabel("Người chạy", { exact: true }).check();
  await expect(page.locator(".runner-marker")).toHaveCount(2);
  await capture("map-selected-overlap");
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.getByRole("link", { name: "Tổng quan", exact: true }).click();
  await page.waitForTimeout(300);
  const overviewHeading = await page.locator("h1").boundingBox();
  const overviewHeader = await page.locator("header").boundingBox();
  checks.push({
    path: "/",
    state: "long-page navigation from scrolled map",
    result:
      overviewHeading.y >= overviewHeader.y + overviewHeader.height
        ? "PASS"
        : "FAIL",
    overviewHeading,
    overviewHeader,
  });
  await capture("overview-navigation-heading");
  await page
    .getByRole("link", { name: "Bản đồ trực tiếp", exact: true })
    .click();
  // Reproduce navigation while scrolled; heading must not remain behind sticky header.
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.getByRole("link", { name: "Sinh viên", exact: true }).click();
  const heading = await page.locator("h1").boundingBox(),
    header = await page.locator("header").boundingBox();
  checks.push({
    path: "/runners",
    state: "navigation from scrolled map",
    result: heading.y >= header.y + header.height ? "PASS" : "FAIL",
    heading,
    header,
  });
  await capture("navigation-heading");
  await page
    .getByRole("button", { name: `Xem chi tiết ${seed.runners[0].full_name}` })
    .click();
  await expect(page.getByRole("dialog")).toContainText("00:02:10");
  detailError = true;
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Đang giữ dữ liệu",
    { timeout: 10000 },
  );
  await expect(page.getByRole("dialog")).toContainText("00:02:10");
  await capture("drawer-background-error");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  detailError = false;
  await open(
    `/runners/${seed.runners[0].student_id}/runs/${seed.runners[0].run_id}`,
  );
  await expect(page.locator("main")).toContainText("00:02:10");
  await capture("session-direct");
  await open("/checkpoints?event=qa-event");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio").first()).not.toBeChecked();
  await expect(
    dialog.getByRole("button", { name: "Xác nhận người chạy", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("radio").first().check();
  await dialog.getByLabel("Lý do xử lý").fill("Kiểm tra fixture cô lập");
  await dialog
    .getByRole("button", { name: "Xác nhận người chạy", exact: true })
    .click();
  await expect(dialog).toContainText("Sự kiện đã thay đổi");
  await expect(dialog.getByRole("radio").first()).not.toBeChecked();
  await dialog.getByRole("radio").nth(1).check();
  await dialog
    .getByRole("button", { name: "Xác nhận người chạy", exact: true })
    .click();
  await expect(dialog).toContainText("Backend đã ghi nhận thao tác.");
  expect(writes[0].body.expected_version).toBe(1);
  expect(writes[1].body.expected_version).toBe(2);
  expect(writes[1].body.passage_id).toBe("passage-1");
  expect(writes[1].body.idempotency_key).not.toBe(
    writes[0].body.idempotency_key,
  );
  await capture("resolve-conflict-recovered");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Trạm và thiết bị", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Đăng ký thiết bị", exact: true })
    .first()
    .click();
  await page.getByLabel("Device ID", { exact: true }).fill("qa-device");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Đăng ký thiết bị", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "không phải bằng chứng thiết bị online",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await capture("device-dialog-390");
  await page.setViewportSize({ width: 1366, height: 768 });
  await capture("device-dialog");
  await page.keyboard.press("Escape");
  event.match_status = "AMBIGUOUS";
  event.candidates_final = false;
  await open("/checkpoints?event=qa-event");
  await expect(
    page.getByRole("dialog").getByRole("radio").first(),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận người chạy", exact: true }),
  ).toHaveCount(0);
  event.candidates_final = true;
  await page.getByRole("button", { name: "Đọc lại trạng thái" }).click();
  await page.getByLabel("Lý do xử lý").fill("Loại bỏ trong fixture");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Loại bỏ sự kiện" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Backend đã ghi nhận thao tác.",
  );
  expect(writes.at(-1).body.action).toBe("DISMISS");
  expect(writes.at(-1).body.passage_id).toBeNull();
  await page.keyboard.press("Escape");
  paginateEvents = true;
  await open(`/checkpoints/${cp.checkpoint_id}?tab=journal`);
  await expect(page.getByRole("combobox", { name: "Checkpoint", exact: true })).toHaveValue(
    cp.checkpoint_id,
  );
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(
    page.getByText("Chưa có sự kiện phù hợp", { exact: true }),
  ).toBeVisible();
  expect(eventQueries.at(-1).cursor).toBe("qa-next");
  expect(eventQueries.at(-1).checkpoint_id).toBe(cp.checkpoint_id);
  await page.getByRole("button", { name: "Trang trước", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Chi tiết sự kiện", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Checkpoint", exact: true })).toHaveValue("");
  for (const [name, path] of [
    ["Giải chạy", "/races"],
    ["Sinh viên", "/runners"],
    ["Mô phỏng", "/simulation"],
    ["Tổng quan", "/"],
    ["Bản đồ trực tiếp", "/live"],
    ["Trạm kiểm soát", "/checkpoints"],
    ["Thiết lập giải", `/races/${raceId}`],
  ]) {
    const link = page.getByRole("link", { name, exact: true });
    await link.click();
    await expect(link).toHaveAttribute("aria-current", "page");
    expect(new URL(page.url()).pathname).toBe(path);
  }
  await page.goBack();
  await expect(
    page.getByRole("link", { name: "Trạm kiểm soát", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(
    page.getByRole("link", { name: "Thiết lập giải", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  checks.push({
    state:
      "checkpoint direct URL/filter cursor next previous/empty; sidebar routes scope active/back-forward; device dialog 390",
    result: "PASS",
  });
  await page.locator(".account-menu > summary").click();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page.getByLabel("Admin key", { exact: true })).toHaveValue("");
  authReject = true;
  await page.getByLabel("Admin key", { exact: true }).fill("fixture-invalid");
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("aside.sidebar")).toHaveCount(0);
  await capture("auth-invalid");
  authReject = false;
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(page.locator("aside.sidebar")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Admin key", { exact: true })).toBeVisible();
  checks.push({
    state:
      "marker cluster/z-index/checkpoint selection/follow-pan/layers; pending and dismiss; auth invalid/logout/refresh",
    result: "PASS",
  });
  checks.push({
    state:
      "GPS aging/overlap selection/locked editor/session frozen/background error/resolve 409 version reason/device registration",
    result: "PASS",
  });
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
  expect(checks.filter((check) => check.result !== "PASS")).toEqual([]);
} finally {
  await writeFile(
    `${dir}/${process.env.QA_INTERACTIONS_ONLY ? "interactions" : "results"}.json`,
    JSON.stringify(
      { checks, errors, unexpected, interceptedWrites: writes, realWrites: 0 },
      null,
      2,
    ),
  );
  await browser.close();
}
console.log(JSON.stringify(checks.filter((c) => c.result !== "PASS")));
