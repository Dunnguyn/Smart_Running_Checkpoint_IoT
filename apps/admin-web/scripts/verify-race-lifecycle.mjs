import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.routeWebSocket("**/ws/v1/**", () => {});
  let status = "DRAFT",
    patches = [],
    mode = "normal",
    denyRead = false;
  const race = () => ({
    race_id: "lifecycle",
    name: "Giải kiểm thử trạng thái",
    status,
    start_at: "2026-10-28T01:00:00Z",
    actual_start_at: status === "LIVE" ? "2026-10-28T02:00:00Z" : null,
    total_laps: 4,
    participant_count: 0,
    location: "NEU",
    checkpoint_mode: "GPS_ONLY",
    config_version: 1,
  });
  await context.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace("/api/v1", "");
    const send = (body, code = 200) =>
      route.fulfill({
        status: code,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/auth/admin-key") return send({ authenticated: true });
    if (path === "/races/lifecycle/status" && req.method() === "PATCH") {
      const body = req.postDataJSON();
      patches.push(body);
      if (mode === "conflict") {
        status = "CANCELLED";
        return send(
          { detail: { code: "RACE_STATUS_CONFLICT", message: "Giải đã hủy" } },
          409,
        );
      }
      expect(body.expected_status).toBe(status);
      status = body.status;
      if (mode === "lost") return route.abort("failed");
      if (mode === "read-fail") denyRead = true;
      return send({ ...race(), idempotent: false });
    }
    if (path === "/races")
      return denyRead
        ? send({ detail: "unavailable" }, 500)
        : send({ items: [race()] });
    if (path === "/races/lifecycle/dashboard")
      return send({
        race: race(),
        summary: {
          participants: 0,
          active_runners: 0,
          completed_runners: 0,
          checkpoint_events: 0,
          checkpoint_events_by_status: {},
        },
        runners: [],
        top_runners: [],
        recent_checkpoint_events: [],
        route: { points: [], distance_m: 0 },
        checkpoints: [],
        server_time: new Date().toISOString(),
      });
    if (path === "/races/lifecycle/live")
      return send({
        race_id: "lifecycle",
        runners: [],
        server_time: new Date().toISOString(),
      });
    if (path.endsWith("/participants"))
      return send({ race_id: "lifecycle", items: [] });
    return send({ error: `Unmocked ${req.method()} ${path}` }, 404);
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function open() {
    await page.goto("http://127.0.0.1:5187/races/lifecycle?setup=general");
    await page
      .getByLabel("Admin key", { exact: true })
      .fill("fixture-only-key");
    await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  }
  await mkdir("test-results/lifecycle", { recursive: true });
  await open();
  await page
    .getByRole("button", { name: "Chuyển sang Sắp diễn ra", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xác nhận chuyển trạng thái", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mở giải sang LIVE", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/lifecycle/scheduled.png",
    fullPage: true,
  });
  mode = "lost";
  await page
    .getByRole("button", { name: "Mở giải sang LIVE", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xác nhận mở giải", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Kiểm tra trạng thái", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Kiểm tra trạng thái", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Mở giải sang LIVE", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/09:00:00.*28\/10\/26/)).toBeVisible();
  expect(patches).toHaveLength(2);
  await mkdir("test-results/lifecycle", { recursive: true });
  await page.screenshot({
    path: "test-results/lifecycle/live.png",
    fullPage: true,
  });
  status = "SCHEDULED";
  mode = "conflict";
  await open();
  await page
    .getByRole("button", { name: "Mở giải sang LIVE", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xác nhận mở giải", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Giải đã hủy" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Kiểm tra trạng thái", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Xác nhận mở giải", exact: true }),
  ).toHaveCount(0);
  expect(patches).toHaveLength(3);
  status = "SCHEDULED";
  mode = "read-fail";
  await open();
  await page
    .getByRole("button", { name: "Mở giải sang LIVE", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xác nhận mở giải", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Kiểm tra trạng thái", exact: true }),
  ).toBeVisible();
  denyRead = false;
  await page
    .getByRole("button", { name: "Kiểm tra trạng thái", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(patches).toHaveLength(4);
  expect(errors).toEqual([]);
  console.log(
    "PASS: DRAFT→SCHEDULED, LIVE lost-response reconciliation, 409 conflict, committed write/read failure; no duplicate PATCH; no page errors.",
  );
} finally {
  await browser.close();
}
