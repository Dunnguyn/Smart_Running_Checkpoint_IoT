import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
const server = await createServer({
  server: { host: "127.0.0.1", port: 5193, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.routeWebSocket("**/ws/v1/**", () => {});
  let checkpoints = [];
  let status = "LIVE",
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
    if (path.endsWith("/student-policy"))
      return send({
        race_id: "lifecycle",
        version: 0,
        published: false,
        registration_enabled: false,
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
        checkpoints,
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
  const errors = [],
    mutations = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("attendance-config")) mutations.push(r.method());
  });
  await page.goto("http://127.0.0.1:5193/races/lifecycle?setup=student");
  await page.getByLabel("Admin key", { exact: true }).fill("fixture-only-key");
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  const panel = page.locator(".attendance-settings");
  await expect(
    panel.getByText("Chưa thể đọc cấu hình hiện tại", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText("Chưa có trạm thuộc giải", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Lưu cấu hình điểm danh" }),
  ).toBeDisabled();
  await expect(
    panel.getByLabel("Trạm check-in", { exact: true }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "Kiểm tra bản nháp" }).click();
  await expect(panel.locator("[aria-invalid=true]")).toHaveCount(8);
  await panel
    .getByLabel("Tuổi vị trí tối đa (giây)", { exact: true })
    .fill("61");
  await panel.getByLabel("Sai số GPS tối đa (m)", { exact: true }).fill("25");
  await panel.getByRole("button", { name: "Kiểm tra bản nháp" }).click();
  await expect(
    panel.getByText("Nhập số nguyên từ 5 đến 60 giây."),
  ).toBeVisible();
  await mkdir("test-results/attendance", { recursive: true });
  await panel.screenshot({ path: "test-results/attendance/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.screenshot({ path: "test-results/attendance/mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  let warned = false;
  page.once("dialog", async (dialog) => {
    warned = true;
    await dialog.dismiss();
  });
  await page
    .getByRole("button", { name: "Thông tin giải", exact: true })
    .click();
  await expect.poll(() => warned).toBe(true);
  await expect(panel).toBeVisible();
  checkpoints = [
    {
      checkpoint_id: "station",
      code: "CP01",
      name: "Cổng chính",
      sequence_no: 1,
      kind: "LAP",
      latitude: 21.004,
      longitude: 105.842,
      radius_m: 30,
    },
  ];
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page.getByLabel("Admin key", { exact: true }).fill("fixture-only-key");
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await panel
    .getByLabel("Trạm check-in", { exact: true })
    .selectOption("station");
  await panel
    .getByLabel("Trạm check-out", { exact: true })
    .selectOption("station");
  for (const [label, value] of [
    ["Mở check-in (UTC+7)", "2026-10-28T08:00"],
    ["Đóng check-in (UTC+7)", "2026-10-28T09:00"],
    ["Mở check-out (UTC+7)", "2026-10-28T08:30"],
    ["Đóng check-out (UTC+7)", "2026-10-28T10:00"],
    ["Tuổi vị trí tối đa (giây)", "15"],
    ["Sai số GPS tối đa (m)", "20"],
  ]) {
    await panel.getByLabel(label, { exact: true }).fill(value);
  }
  await panel.getByRole("button", { name: "Kiểm tra bản nháp" }).click();
  await expect(
    panel.getByText("Bản nháp hợp lệ theo schema hiện tại.", { exact: false }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Lưu cấu hình điểm danh" }),
  ).toBeDisabled();
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "test-results/attendance/mobile-ready.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/attendance/desktop-ready.png",
    fullPage: true,
  });
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
  console.log(
    "Attendance UI: missing read contract, empty stations, validation, no writes, unsaved guard, desktop/mobile passed.",
  );
} finally {
  await browser.close();
  await server.close();
}
