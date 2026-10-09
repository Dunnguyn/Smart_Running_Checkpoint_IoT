import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
const key = process.env.ADMIN_API_KEY;
if (!key) throw new Error("Missing test-process Admin key");
const checks = [],
  errors = [],
  writes = [],
  sockets = new Set();
let messages = 0,
  opened = 0;
const api = async (path) => {
  const r = await fetch(
    (process.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1") + path,
    {
      headers: { "X-Admin-Key": key },
    },
  );
  if (!r.ok) throw new Error(`Read API HTTP ${r.status}`);
  return r.json();
};
const races = (await api("/races")).items;
const full = await Promise.all(
  races.map((r) => api(`/races/${r.race_id}/dashboard`)),
);
const done = full.find(
  (d) => d.summary.completed_runners > 0 && d.recent_checkpoint_events.length,
);
const active = full.find((d) => d.summary.active_runners > 0);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addInitScript(() => {
  const Native = window.WebSocket;
  window.__testSockets = [];
  window.WebSocket = class extends Native {
    constructor(...args) {
      super(...args);
      window.__testSockets.push(this);
    }
  };
});
if (process.env.BLOCK_EXTERNAL_TILES === "1") {
  await context.route("https://*.tile.openstreetmap.org/**", (route) =>
    route.abort("blockedbyclient"),
  );
}
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.name));
page.on("websocket", (s) => {
  if (!new URL(s.url()).pathname.startsWith("/ws/v1/")) return;
  sockets.add(s);
  opened++;
  s.on("close", () => sockets.delete(s));
  s.on("framereceived", () => messages++);
});
await page.route("**/api/v1/**", async (route) => {
  const req = route.request(),
    path = new URL(req.url()).pathname;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method()) &&
    path != "/api/v1/auth/admin-key"
  ) {
    writes.push({ method: req.method(), path });
    await route.abort();
    return;
  }
  await route.continue();
});
async function login(k = key) {
  await page.getByLabel("Admin key", { exact: true }).fill(k);
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
}
try {
  await page.goto("http://localhost:5173");
  await login(randomUUID());
  await expect(page.getByRole("alert")).toContainText("Admin key không hợp lệ");
  await login();
  await expect(page.getByLabel("Chọn giải chạy")).toBeVisible();
  await expect.poll(() => sockets.size).toBe(1);
  checks.push("real wrong-key 401 and correct-key login; race list; one WS");
  if (!done) throw new Error("Missing completed demo race");
  await page.getByLabel("Chọn giải chạy").selectOption(done.race.race_id);
  await expect(
    page.getByRole("cell", { name: "01", exact: true }).first(),
  ).toBeVisible();
  await expect.poll(() => sockets.size).toBe(1);
  const r = done.runners.find((r) => r.bib_number === "01");
  const url = `/runners/${r.student_id}/runs/${r.run_id}`;
  await page.locator(`a[href="${url}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(r.run_id));
  const before = await api(url);
  await page.getByRole("link", { name: "Tổng quan", exact: true }).click();
  await page.getByRole("button", { name: "Thử lại / Làm mới" }).click();
  await expect(page.locator(".connection-bar")).toContainText(
    "WebSocket: connected",
  );
  await expect.poll(() => sockets.size).toBe(1);
  const count = opened;
  await page.evaluate(() =>
    window.__testSockets.forEach((s) => {
      if (s.readyState === 1 && new URL(s.url).pathname.startsWith("/ws/v1/"))
        s.close(1000);
    }),
  );
  await expect.poll(() => opened, { timeout: 15000 }).toBeGreaterThan(count);
  await expect(page.locator(".connection-bar")).toContainText(
    "WebSocket: connected",
  );
  await expect.poll(() => sockets.size).toBe(1);
  const after = await api(url);
  expect(after.duration_total_s).toBe(before.duration_total_s);
  checks.push(
    "bib 01, real student/run URL, run detail/history, completed duration stable, refresh and forced real WS reconnect",
  );
  await page.getByRole("link", { name: "Checkpoint", exact: true }).click();
  await expect(
    page.getByText("MATCHED", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("COUNTED", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Chi tiết sự kiện", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Chi tiết và xác nhận sự kiện" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Xác nhận ứng viên", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Đăng ký thiết bị Gateway vào checkpoint",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Giải chạy", exact: true }).click();
  await page.locator(`a[href="/races/${done.race.race_id}"]`).click();
  await expect(page.getByText(/Chưa có dữ liệu trạng thái khóa/)).toBeVisible();
  checks.push(
    "MATCHED and COUNTED displayed separately; matching lock explicitly unknown without backend flag; no writes sent",
  );
  if (active) {
    await page.getByRole("link", { name: "Tổng quan", exact: true }).click();
    await page.getByLabel("Chọn giải chạy").selectOption(active.race.race_id);
    await expect(page.locator(".table-bib")).toHaveCount(
      active.summary.participants,
    );
    await expect.poll(() => sockets.size).toBe(1);
    await expect(
      page.getByText("Mất cập nhật", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Chưa có vị trí GPS mới để theo dõi", { exact: true }),
    ).toBeVisible();
    checks.push(
      "switch to other race clears previous runners/socket; stale GPS displayed",
    );
  }
  await page.route("**/dashboard", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
  );
  await page.getByRole("button", { name: "Thử lại / Làm mới" }).click();
  await expect(page.getByRole("alert").first()).toContainText(
    "Backend gặp lỗi",
  );
  await page.unroute("**/dashboard");
  await page.getByRole("button", { name: "Thử lại / Làm mới" }).click();
  await expect(page.locator(".connection-bar")).toContainText(
    "WebSocket: connected",
  );
  checks.push(
    "injected 500 displayed as error, refresh recovery (browser fault injection, not BE failure)",
  );
  await page.screenshot({
    path: "test-results/local-readonly-ui.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page.getByLabel("Admin key", { exact: true })).toBeVisible();
  await expect.poll(() => sockets.size).toBe(0);
  checks.push("logout clears protected screen and closes WS");
  await login();
  await expect(page.locator(".connection-bar")).toContainText(
    "WebSocket: connected",
  );
  await page.route("**/api/v1/races", (r) =>
    r.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );
  await page.getByRole("button", { name: "Thử lại / Làm mới" }).click();
  await expect(page.getByLabel("Admin key", { exact: true })).toBeVisible();
  await expect.poll(() => sockets.size).toBe(0);
  checks.push(
    "injected protected 401 expires session; no operation sent for processed event/device form",
  );
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  const report = {
    checks,
    errors,
    writes,
    opened,
    actualWebSocketMessages: messages,
    races: full.map((d) => ({
      race: d.race,
      summary: d.summary,
      events: d.recent_checkpoint_events.map((e) => ({
        event_id: e.event_id,
        checkpoint_id: e.checkpoint_id,
        device_id: e.device_id,
        match_status: e.match_status,
        lap_status: e.lap_status,
        version: e.version,
      })),
      runnerSample: d.runners.slice(0, 1),
    })),
  };
  await writeFile(
    "test-results/local-readonly-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      { checks, errors, writes, opened, actualWebSocketMessages: messages },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot({
    path: "test-results/local-readonly-failure.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      checks,
      opened,
      sockets: sockets.size,
      states: await page.evaluate(() =>
        window.__testSockets.map((s) => ({
          path: new URL(s.url).pathname,
          state: s.readyState,
        })),
      ),
    }),
  );
  throw new Error(e.message.replaceAll(key, "[REDACTED]"));
} finally {
  await browser.close();
}
