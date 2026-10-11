import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const key = process.env.ADMIN_API_KEY;
if (!key) throw new Error("ADMIN_API_KEY required in test process only");
const base = process.env.VITE_API_BASE_URL || "http://localhost:8001/api/v1";
const read = async (path) => {
  const r = await fetch(base + path, { headers: { "X-Admin-Key": key } });
  if (!r.ok) throw new Error(`GET failed ${r.status}`);
  return r.json();
};
const races = (await read("/races")).items;
const dashboards = await Promise.all(
  races.map((r) => read(`/races/${r.race_id}/dashboard`)),
);
const done = dashboards.find(
  (d) => d.summary.completed_runners > 0 && d.recent_checkpoint_events.length,
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
await context.route("https://*.tile.openstreetmap.org/**", (r) => r.abort());
const page = await context.newPage(),
  errors = [],
  writes = [],
  checks = [];
let messages = 0;
page.on("pageerror", (e) => errors.push(e.message));
page.on("websocket", (s) => {
  if (new URL(s.url()).pathname.startsWith("/ws/v1/"))
    s.on("framereceived", () => messages++);
});
await page.addInitScript(() => {
  const Native = window.WebSocket;
  window.__sockets = [];
  window.WebSocket = class extends Native {
    constructor(...args) {
      super(...args);
      window.__sockets.push(this);
    }
  };
});
await page.route("**/api/v1/**", async (r) => {
  if (
    !["GET", "OPTIONS", "HEAD"].includes(r.request().method()) &&
    !new URL(r.request().url()).pathname.endsWith("/auth/admin-key")
  ) {
    writes.push(r.request().method());
    await r.abort();
  } else await r.continue();
});
await mkdir("test-results/ux", { recursive: true });
async function noOverflow() {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
const sockets = () =>
  page.evaluate(
    () =>
      window.__sockets.filter(
        (s) =>
          s.readyState === 1 && new URL(s.url).pathname.startsWith("/ws/v1/"),
      ).length,
  );
try {
  await page.goto("http://localhost:5173");
  await page.getByLabel("Admin key", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(page.getByLabel("Chọn giải chạy")).toBeVisible();
  await expect.poll(sockets).toBe(1);
  if (!done)
    throw new Error("No existing completed race for readonly validation");
  await page.getByLabel("Chọn giải chạy").selectOption(done.race.race_id);
  await expect(page.locator(".kpi-value").first()).toContainText(
    String(done.summary.participants),
  );
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [1920, 1080],
    [820, 1180],
  ]) {
    await page.setViewportSize({ width, height });
    await noOverflow();
    await page.screenshot({
      path: `test-results/ux/overview-${width}.png`,
      fullPage: true,
    });
  }
  checks.push(
    "overview and reflow at 1366x768, 1440x900, 1920x1080, 820x1180; no document horizontal overflow",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: "Sinh viên", exact: true }).click();
  await page.getByLabel("Tìm tên, mã sinh viên, bib").fill("01");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  const row = page.locator("tbody tr").first();
  await expect(row).toContainText("01");
  await row.getByRole("button", { name: "Chi tiết", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Hoàn thành");
  await page.screenshot({
    path: "test-results/ux/runner-drawer.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Tìm tên, mã sinh viên, bib")).toHaveValue("01");
  await expect(
    row.getByRole("button", { name: "Chi tiết", exact: true }),
  ).toBeFocused();
  checks.push(
    "bib-inclusive whole-result search, drawer/escape/focus return; search and page preserved",
  );
  await page
    .getByRole("link", { name: "Bản đồ trực tiếp", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Chỉnh sửa bản đồ", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Tìm người chạy").fill("01");
  await page.locator(".watch-row").first().click();
  await expect(page.locator(".runner-marker.selected")).toHaveCount(1);
  await page.getByRole("button", { name: "Theo dõi runner đã chọn" }).click();
  await expect(
    page.getByRole("button", { name: "Dừng theo dõi" }),
  ).toBeVisible();
  const map = page.locator(".leaflet-container");
  const box = await map.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 80,
    box.y + box.height / 2 + 30,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Theo dõi runner đã chọn" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/ux/live-map.png",
    fullPage: true,
  });
  await noOverflow();
  checks.push(
    "completed race edit lock; list/marker selection; manual pan stops explicit following; grouped coincident markers",
  );
  await page.getByRole("link", { name: "Checkpoint", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sự kiện cần xác nhận", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nhật ký", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Chi tiết sự kiện", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByLabel("Checkpoint", { exact: true })).toHaveCount(1);
  await page
    .getByRole("button", { name: "Chi tiết sự kiện", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("đã chốt");
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "test-results/ux/checkpoint-journal.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Trạm và thiết bị", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Chỉnh sửa", exact: true }).first(),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Đăng ký thiết bị", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("Checkpoint", { exact: true }),
  ).not.toHaveValue("");
  await page.keyboard.press("Escape");
  checks.push(
    "checkpoint tabs, readable metadata filters, event detail, registration drawer with preselected UUID; no writes",
  );
  await page.getByRole("link", { name: "Giải chạy", exact: true }).click();
  await page.getByLabel("Trạng thái giải").selectOption("COMPLETED");
  await noOverflow();
  await page.screenshot({ path: "test-results/ux/races.png", fullPage: true });
  await page
    .getByLabel("Chọn giải chạy")
    .selectOption(races.find((r) => r.race_id !== done.race.race_id).race_id);
  await expect.poll(sockets).toBe(1);
  await page.evaluate(() =>
    window.__sockets
      .filter(
        (s) =>
          s.readyState === 1 && new URL(s.url).pathname.startsWith("/ws/v1/"),
      )
      .forEach((s) => s.close()),
  );
  await expect.poll(sockets, { timeout: 15000 }).toBe(1);
  await page.locator(".account-menu>summary").click();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page.getByLabel("Admin key", { exact: true })).toBeVisible();
  await expect.poll(sockets).toBe(0);
  checks.push(
    "race switch/reconnect keep one race socket; logout clears session",
  );
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  await writeFile(
    "test-results/ux/readonly-report.json",
    JSON.stringify(
      { checks, errors, writes, actualWebSocketMessages: messages },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { checks, errors, writes, actualWebSocketMessages: messages },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot({
    path: "test-results/ux/failure.png",
    fullPage: true,
  });
  throw new Error(e.message.replaceAll(key, "[REDACTED]"));
} finally {
  await browser.close();
}
