// Real API reads only. Mutation interception is a safety boundary, not an E2E mutation test.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const key = process.env.ADMIN_API_KEY;
if (!key) throw new Error("Missing credential");
const out = "test-results/design-live";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  const Native = window.WebSocket;
  window.__testSockets = [];
  window.WebSocket = class extends Native {
    constructor(...args) {
      super(...args);
      window.__testSockets.push(this);
    }
  };
});
const liveSocketCount = () =>
  page.evaluate(
    () =>
      window.__testSockets.filter(
        (s) =>
          s.readyState === 1 && new URL(s.url).pathname.startsWith("/ws/v1/"),
      ).length,
  );
const errors = [],
  writes = [],
  reads = new Set();
let messages = 0;
let completedDuration = "No completed row available";
page.on("pageerror", (e) => errors.push(e.message));
page.on("websocket", (ws) => {
  if (ws.url().includes("/ws/v1/")) ws.on("framereceived", () => messages++);
});
await page.route("**/api/v1/**", (r) => {
  const req = r.request();
  const path = new URL(req.url()).pathname;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method()) &&
    !path.endsWith("/auth/admin-key")
  ) {
    writes.push(req.method() + " " + path);
    return r.abort();
  }
  reads.add(path);
  return r.continue();
});
// Preserve real tile rendering if the provider is reachable.
async function shot(name) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: out + "/" + name + ".png", fullPage: true });
}
try {
  await page.goto("http://localhost:5173");
  await page.getByLabel("Admin key", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(page.getByLabel("Chọn giải chạy")).toBeVisible();
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await page.getByRole("link", { name: "Tổng quan", exact: true }).click();
    await expect(page.locator(".kpi-grid")).toBeVisible();
    await shot("overview-" + width);
    await page
      .getByRole("link", { name: "Bản đồ trực tiếp", exact: true })
      .click();
    await expect(page.locator(".watch-panel")).toBeVisible();
    if (await page.locator(".watch-row").count()) {
      await page.locator(".watch-row").first().click();
      await expect(page.locator(".selected-runner")).toBeVisible();
    }
    await shot("map-" + width);
    await page.getByRole("link", { name: "Giải chạy", exact: true }).click();
    await expect(page.locator(".race-table")).toBeVisible();
    await shot("races-" + width);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const create = page.getByRole("button", {
    name: "Tạo giải chạy",
    exact: true,
  });
  await create.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const formBounds = await page
    .getByRole("dialog")
    .locator("form")
    .boundingBox();
  const fieldBounds = await page
    .getByRole("dialog")
    .locator("fieldset")
    .boundingBox();
  expect(fieldBounds.width).toBeGreaterThan(formBounds.width * 0.9);
  await shot("create-dialog");
  await page.keyboard.press("Escape");
  await expect(create).toBeFocused();
  for (const [label, name] of [
    ["Sinh viên", "students"],
    ["Trạm kiểm soát", "checkpoints"],
    ["Mô phỏng", "simulation"],
    ["Thiết lập giải", "setup"],
  ]) {
    const link = page.getByRole("link", { name: label, exact: true });
    if (await link.count()) {
      await link.click();
      await page.waitForTimeout(800);
      await shot(name);
      if (name === "students") {
        const row = page
          .locator("tbody tr")
          .filter({ hasText: "Hoàn thành" })
          .first();
        if (await row.count()) {
          const durationCell = row.locator("td").nth(3),
            before = await durationCell.innerText();
          await page.waitForTimeout(2200);
          await expect(durationCell).toHaveText(before);
          const action = row.getByRole("button", { name: /^Xem chi tiết / });
          await action.click();
          await expect(page.getByRole("dialog")).toContainText("Hoàn thành");
          await shot("runner-drawer");
          await page.keyboard.press("Escape");
          await expect(action).toBeFocused();
          completedDuration =
            "Real completed row remained frozen across background refresh; drawer Escape restored focus";
        }
      }
    }
  }
  await page
    .getByRole("link", { name: "Bản đồ trực tiếp", exact: true })
    .click();
  const select = page.getByLabel("Chọn giải chạy");
  const ids = await select
    .locator("option")
    .evaluateAll((options) => options.map((o) => o.value));
  if (ids.length > 1) {
    await select.selectOption(ids[1]);
    await expect(select).toHaveValue(ids[1]);
    await page.waitForTimeout(1200);
    await shot("race-switched");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const map = page.locator(".leaflet-map"),
    box = await map.boundingBox();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width * 0.65 - 80,
    box.y + box.height * 0.4 + 40,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(400);
  const transform = await map
    .locator(".leaflet-map-pane")
    .getAttribute("style");
  await page.waitForTimeout(2200);
  await expect(map.locator(".leaflet-map-pane")).toHaveAttribute(
    "style",
    transform,
  );
  await expect.poll(liveSocketCount).toBe(1);
  await page.evaluate(() =>
    window.__testSockets
      .filter(
        (s) =>
          s.readyState === 1 && new URL(s.url).pathname.startsWith("/ws/v1/"),
      )
      .forEach((s) => s.close(1000, "readonly reconnect test")),
  );
  await expect.poll(liveSocketCount, { timeout: 15000 }).toBe(1);
  await page.locator(".account-menu > summary").click();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page.getByLabel("Admin key", { exact: true })).toBeVisible();
  await expect.poll(liveSocketCount).toBe(0);
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  await writeFile(
    out + "/report.json",
    JSON.stringify(
      {
        reads: [...reads],
        errors,
        writes,
        messages,
        availableRaceCount: ids.length,
        raceSwitchExecuted: ids.length > 1,
        viewports: ["1440x900", "1366x768", "768x1024"],
        checks: [
          "login",
          "all pages read",
          "pan preserved across background refresh",
          "reconnect returns to one socket; logout closes socket",
          "map selection when rows exist",
          "race switch when multiple races",
          "dialog Escape and focus restoration",
          "no horizontal overflow",
        ],
        completedDuration,
      },
      null,
      2,
    ),
  );
  console.log(
    "Read-only design browser checks passed; real business writes: 0.",
  );
} catch (e) {
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  throw new Error(e.message.replaceAll(key, "[REDACTED]"));
} finally {
  await browser.close();
}
