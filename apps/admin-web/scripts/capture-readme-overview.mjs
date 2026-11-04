import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

// Capture the actual overview route using isolated, anonymous demo data.
const seed = JSON.parse(
  await readFile(
    new URL("./fixtures/qa-dashboard.json", import.meta.url),
    "utf8",
  ),
);
seed.race.name = "NEU Campus Run · Giải chạy minh họa";
seed.server_time = new Date().toISOString();
for (const rows of [seed.runners, seed.top_runners]) {
  rows.forEach((runner, index) => {
    runner.full_name = `Người chạy demo ${String(index + 1).padStart(2, "0")}`;
    runner.student_code = `DEMO-${String(index + 1).padStart(3, "0")}`;
  });
}
const server = await createServer({
  server: { host: "127.0.0.1", port: 5197, strictPort: true },
});
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
  });
  await context.routeWebSocket("**/ws/v1/**", () => {});
  await context.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (body) => route.fulfill({ json: body });
    if (path.endsWith("/auth/admin-key")) return send({ authenticated: true });
    if (route.request().method() !== "GET")
      throw new Error("Unexpected write request");
    if (path === "/api/v1/races") return send({ items: [seed.race] });
    if (path.endsWith("/dashboard")) return send(seed);
    if (path.endsWith("/live"))
      return send({
        race_id: seed.race.race_id,
        server_time: seed.server_time,
        runners: seed.runners.map((r) => ({
          ...r,
          latitude: r.last_latitude,
          longitude: r.last_longitude,
        })),
      });
    if (path.endsWith("/route")) return send({ ...seed.route, ...seed.race });
    if (path.endsWith("/checkpoint-events"))
      return send({ items: [], next_cursor: null });
    throw new Error(`Unexpected read request: ${path}`);
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5197/");
  await page
    .getByLabel("Admin key", { exact: true })
    .fill("readme-fixture-key");
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: seed.race.name }),
  ).toBeVisible();
  await expect(page.locator(".overview-stats")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // Allow the map's public background tiles to finish loading before capture.
  await expect
    .poll(() => page.locator(".leaflet-tile-loaded").count(), {
      timeout: 20000,
    })
    .toBeGreaterThan(0);
  await expect
    .poll(
      () => page.locator(".leaflet-tile:not(.leaflet-tile-loaded)").count(),
      { timeout: 20000 },
    )
    .toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "../../docs/images/admin-overview.png",
    fullPage: true,
  });
  console.log("Captured overview route with anonymous demo data.");
} finally {
  await browser?.close();
  await server.close();
}
