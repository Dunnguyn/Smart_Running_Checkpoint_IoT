import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createServer } from "vite";
const server = await createServer({
  server: { host: "127.0.0.1", port: 5194, strictPort: true },
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
    target_distance_m: 50000,
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
  await page.goto("http://127.0.0.1:5194/races/lifecycle?setup=general");
  await page.getByLabel("Admin key", { exact: true }).fill("fixture-only-key");
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();

  await mkdir("test-results/challenge", { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [768, 1024],
    [390, 844],
    [360, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await page
      .getByRole("link", { name: "← Tất cả giải chạy", exact: true })
      .click();
    await expect(
      page.getByText("Tích lũy quãng đường", { exact: false }).first(),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/challenge/list-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page
      .getByRole("link", { name: "Giải kiểm thử trạng thái", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Thông tin giải", exact: true })
      .click();
    await expect(
      page.getByText("Mục tiêu tích lũy", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/challenge/detail-${width}.png`,
      fullPage: true,
    });
  }
  const unnamed = await page
    .locator('button, [role="button"]')
    .evaluateAll(
      (nodes) =>
        nodes.filter(
          (n) =>
            !n.getAttribute("aria-label") &&
            !n.getAttribute("aria-labelledby") &&
            !n.textContent.trim() &&
            !n.getAttribute("title"),
        ).length,
    );
  expect(unnamed).toBe(0);
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.activeElement !== document.body),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS challenge list/detail 5 viewports, no document overflow/page errors; mock API",
  );
} finally {
  await browser.close();
  await server.close();
}
