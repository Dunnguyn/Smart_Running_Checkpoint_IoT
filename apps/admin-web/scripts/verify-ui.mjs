import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [],
  backendRequests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => {
  if (/\/api\/v1\/|\/ws\/v1\//.test(request.url()))
    backendRequests.push(new URL(request.url()).pathname);
});
page.on("websocket", (socket) =>
  backendRequests.push(new URL(socket.url()).pathname),
);
await mkdir("test-results", { recursive: true });
await page.goto("http://localhost:5174/");
await expect(
  page.getByRole("heading", { name: "NEU RUN 2026", exact: false }),
).toBeVisible();
await expect(page.locator(".kpi-value").first()).toContainText("128");
await expect(page.locator(".runner-marker")).toHaveCount(8);
await page.waitForTimeout(1200);
await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
await page.getByRole("button", { name: "Trần Đức Huy", exact: false }).click();
await expect(page.locator(".watch-row.chosen")).toContainText("Trần Đức Huy");
await expect(page.locator(".runner-marker.selected")).toContainText("002");
await page.locator(".runner-marker.selected").click();
await expect(page.locator(".leaflet-popup")).toContainText("Trần Đức Huy");
await page.getByRole("button", { name: "Lớp bản đồ", exact: true }).click();
await page.getByRole("checkbox", { name: "Sinh viên", exact: true }).uncheck();
await expect(page.locator(".runner-marker")).toHaveCount(0);
await page.getByRole("checkbox", { name: "Sinh viên", exact: true }).check();
await page.getByRole("checkbox", { name: "Checkpoint", exact: true }).uncheck();
await expect(page.locator(".checkpoint-marker")).toHaveCount(0);
await page.getByRole("checkbox", { name: "Checkpoint", exact: true }).check();
await page.getByRole("button", { name: "Về toàn tuyến", exact: true }).click();
await page.waitForTimeout(800);
const mapTransform = await page
  .locator(".leaflet-map-pane")
  .getAttribute("style");
const markerPosition = await page
  .locator(".runner-marker")
  .first()
  .getAttribute("style");
await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
await expect(
  page.getByRole("button", { name: "Tạm dừng", exact: true }),
).toBeVisible();
await page.waitForTimeout(2200);
expect(await page.locator(".leaflet-map-pane").getAttribute("style")).toBe(
  mapTransform,
);
expect(
  await page.locator(".runner-marker").first().getAttribute("style"),
).not.toBe(markerPosition);
await page.getByRole("button", { name: "Tạm dừng", exact: true }).click();
await expect(
  page.getByRole("button", { name: "Bắt đầu", exact: true }),
).toBeVisible();
await page.getByRole("button", { name: "Bắt đầu", exact: true }).click();
await page.getByRole("link", { name: "Sinh viên", exact: true }).click();
await expect(page.locator("tbody tr")).toHaveCount(10);
await page.getByRole("button", { name: "Trang sau", exact: true }).click();
await expect(page.locator(".page-number")).toHaveText("2");
await page.getByLabel("Tìm theo họ tên hoặc mã sinh viên").fill("11230001");
await expect(page.locator("tbody tr")).toHaveCount(1);
await page.getByRole("link", { name: "Nguyễn Minh Anh", exact: false }).click();
await expect(
  page.getByRole("heading", { name: "Nguyễn Minh Anh", exact: true }),
).toBeVisible();
await expect(
  page.locator(".detail-metrics").getByRole("heading").nth(2),
).not.toHaveText("00:35:00");
await page.screenshot({ path: "test-results/detail.png", fullPage: true });
await page.goto("http://localhost:5174/runners");
await page.getByLabel("Lọc trạng thái").selectOption("COMPLETED");
await expect(page.locator(".pagination")).toContainText("32 sinh viên");
await expect(page.locator("tbody .badge-completed")).toHaveCount(10);
await page.getByRole("button", { name: "QUÃNG ĐƯỜNG", exact: false }).click();
await page.getByLabel("Tìm theo họ tên hoặc mã sinh viên").fill("khongtimthay");
await expect(
  page.getByText("Không tìm thấy kết quả", { exact: true }),
).toBeVisible();
await page.goto("http://localhost:5174/checkpoints/cp-2");
await expect(
  page.getByText("Chưa xác định sinh viên", { exact: true }),
).toBeVisible();
await page.goto("http://localhost:5174/races/neu-autumn");
await expect(
  page.getByText("Chưa có tuyến minh họa", { exact: true }),
).toBeVisible();
await page.goto("http://localhost:5174/");
await page.getByLabel("Chọn giải chạy").selectOption("neu-2026");
await page
  .getByRole("button", { name: "Đặt lại mô phỏng", exact: true })
  .click();
await expect(
  page.getByRole("button", { name: "Bắt đầu", exact: true }),
).toBeVisible();
await page.goto("http://localhost:5174/runners/student-1/runs/run-1");
await expect(
  page.locator(".detail-metrics").getByRole("heading").nth(2),
).toHaveText("00:35:00");
for (const [name, width, height] of [
  ["tablet", 820, 1180],
  ["mobile", 390, 844],
]) {
  await page.setViewportSize({ width, height });
  await page.goto("http://localhost:5174/");
  await expect(page.locator(".runner-marker")).toHaveCount(8);
  await page.waitForTimeout(700);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
}
await page.route("**/*.tile.openstreetmap.org/**", (route) => route.abort());
await page.reload();
await expect(
  page.getByText("Không tải được một số ô bản đồ nền.", { exact: false }),
).toBeVisible();
await expect(page.locator(".kpi-value").first()).toContainText("128");
expect(errors).toEqual([]);
expect(backendRequests).toEqual([]);
await writeFile(
  "test-results/ui-report.json",
  JSON.stringify(
    {
      passed: true,
      viewports: ["1440×1080", "820×1180", "390×844"],
      errors,
      backendRequests,
      checks: [
        "search",
        "status filter",
        "sort",
        "pagination",
        "direct detail URL",
        "runner selection",
        "marker popup",
        "map layers",
        "simulation start/pause/reset",
        "checkpoint unassigned",
        "scheduled race",
        "no horizontal overflow",
        "tile failure fallback",
      ],
    },
    null,
    2,
  ),
);
await browser.close();
