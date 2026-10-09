import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
const ids = JSON.parse(process.env.MATCHING_FIXTURE),
  key = process.env.ADMIN_API_KEY;
const api = async (path, body) => {
  const response = await fetch("http://localhost:8001/api/v1" + path, {
    method: body ? "POST" : "GET",
    headers: { "X-Admin-Key": key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
  return response.json();
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
});
const page = await context.newPage(),
  errors = [],
  checks = [],
  sockets = new Set();
page.on("pageerror", (e) => errors.push(e.name));
page.on("websocket", (socket) => {
  if (!socket.url().includes("/ws/v1/")) return;
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});
async function login(value = key) {
  await page.getByLabel("Admin key", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
}
async function event(id) {
  await page.getByRole("link", { name: "Checkpoint", exact: true }).click();
  await page.evaluate((id) => {
    window.history.pushState({}, "", `/checkpoints?event=${id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, id);
  /* select directly from a link using fresh route mount */ await page
    .getByRole("link", { name: "Tổng quan", exact: true })
    .click();
  await page.evaluate((id) => {
    window.history.pushState({}, "", `/checkpoints?event=${id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, id);
  await expect(
    page.getByRole("heading", { name: "Chi tiết và xác nhận sự kiện" }),
  ).toBeVisible();
}
try {
  await page.goto("http://localhost:5175");
  await page.route("**/auth/admin-key", (route) =>
    route.fulfill({ status: 503, body: "{}", contentType: "application/json" }),
  );
  await login();
  await expect(page.getByRole("alert")).toContainText("Backend gặp lỗi");
  await expect(page.getByLabel("Admin key", { exact: true })).toBeVisible();
  await page.unroute("**/auth/admin-key");
  await login(randomUUID());
  await expect(page.getByRole("alert")).toContainText("Admin key không hợp lệ");
  await login();
  await page.getByLabel("Chọn giải chạy").selectOption(ids.race);
  await expect(
    page.locator(".table-bib").filter({ hasText: "01" }),
  ).toBeVisible();
  await expect.poll(() => sockets.size).toBe(1);
  checks.push(
    "503 stays at login; wrong key stays at login; verified key opens UI; bib 01 retained; one socket",
  );
  await event(ids.not_final);
  await expect(
    page.getByRole("button", { name: "Xác nhận ứng viên" }),
  ).toHaveCount(0);
  await event(ids.not_counted);
  await expect(
    page.getByRole("heading", { name: "Chi tiết và xác nhận sự kiện" }),
  ).toBeVisible();
  await expect(page.locator(".info-list")).toContainText("NOT_COUNTED");
  await expect(page.locator(".info-list")).toContainText(
    "MIN_LAP_INTERVAL_NOT_MET",
  );
  checks.push(
    "unfinalized candidates cannot resolve; MATCHED NOT_COUNTED remains distinct",
  );
  await event(ids.confirm);
  await page.getByLabel(`Chọn passage ${ids.passage}`).check();
  await page.getByLabel("Lý do xử lý").fill("Đối chiếu bản ghi test");
  await page.getByRole("button", { name: "Xác nhận ứng viên" }).click();
  await expect
    .poll(
      async () => (await api(`/checkpoint-events/${ids.confirm}`)).lap_status,
    )
    .toBe("COUNTED");
  const completed = await api(`/runners/${ids.student}/runs/${ids.run}`);
  expect(completed.status).toBe("COMPLETED");
  expect(completed.lap_count).toBe(1);
  const duration = completed.duration_total_s;
  checks.push(
    "CONFIRM sends passage ID; actual backend counts one lap and completes runner",
  );
  await event(ids.conflict);
  const stale = await api(`/checkpoint-events/${ids.conflict}`);
  const detailPattern = `**/checkpoint-events/${ids.conflict}`;
  await page.route(detailPattern, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(stale),
    }),
  );
  await page.getByLabel("Lý do xử lý").fill("Stale admin");
  await api(`/checkpoint-events/${ids.conflict}/resolve`, {
    action: "DISMISS",
    passage_id: null,
    expected_version: 1,
    idempotency_key: randomUUID(),
    reason: "Other admin test",
  });
  const conflictResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/checkpoint-events/${ids.conflict}/resolve`) &&
      response.status() === 409,
  );
  await page.getByRole("button", { name: "Loại bỏ sự kiện" }).click();
  await conflictResponse;
  await page.unroute(detailPattern);
  await page.getByRole("button", { name: "Đọc lại trạng thái" }).click();
  await expect(page.locator(".info-list")).toContainText("REJECTED");
  checks.push(
    "stale expected_version gets real 409, refetch replaces candidates/status without automatic overwrite",
  );
  await event(ids.retry);
  await page.getByLabel("Lý do xử lý").fill("Retry exact payload");
  const sent = [];
  let first = true;
  await page.route(
    `**/checkpoint-events/${ids.retry}/resolve`,
    async (route) => {
      sent.push(route.request().postDataJSON());
      if (first) {
        first = false;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    },
  );
  await page.getByRole("button", { name: "Loại bỏ sự kiện" }).click();
  await expect(
    page.getByRole("button", { name: "Thử lại đúng thao tác đã gửi" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Thử lại đúng thao tác đã gửi" })
    .click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[0]).toEqual(sent[1]);
  expect((await api(`/checkpoint-events/${ids.retry}`)).version).toBe(2);
  checks.push(
    "lost response -> refetch -> exact idempotent retry, no duplicate version increment",
  );
  await page.getByRole("link", { name: "Giải chạy", exact: true }).click();
  await page.getByRole("link", { name: /Matching integration/ }).click();
  await expect(page.getByText(/Chưa có dữ liệu trạng thái khóa/)).toBeVisible();
  await page.getByRole("link", { name: "Giải chạy", exact: true }).click();
  await page.getByRole("link", { name: /Config integration/ }).click();
  await page
    .getByLabel("Chế độ", { exact: true })
    .selectOption("GPS_AND_ARDUINO");
  await page.getByRole("button", { name: "Lưu cấu hình ghép" }).click();
  await expect
    .poll(
      async () =>
        (await api(`/races/${ids.draft}/dashboard`)).race.checkpoint_mode,
    )
    .toBe("GPS_AND_ARDUINO");
  checks.push(
    "lock is unknown without backend flag; unlocked PATCH config succeeds",
  );
  await page.getByRole("link", { name: "Checkpoint", exact: true }).click();
  await page
    .getByLabel("Checkpoint ID", { exact: true })
    .last()
    .fill(ids.checkpoint);
  await page.getByLabel("Device ID", { exact: true }).fill("new-device");
  await page
    .getByRole("button", { name: "Đăng ký thiết bị", exact: true })
    .click();
  await expect(page.getByText(/Đã đăng ký new-device/)).toBeVisible();
  await page.getByLabel("Chọn giải chạy").selectOption(ids.gps);
  await event(ids.gps_event);
  await expect(page.locator(".info-list")).toContainText("GPS_ONLY_MODE");
  await expect(page.locator(".info-list")).toContainText("UNASSIGNED");
  expect(
    (await api(`/runners/${ids.student}/runs/${ids.run}`)).duration_total_s,
  ).toBe(duration);
  checks.push(
    "device registration uses actual API; real Gateway request in GPS_ONLY remains UNASSIGNED; completed duration frozen",
  );
  await page.screenshot({
    path: "test-results/matching-checkpoints.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page.getByLabel("Admin key", { exact: true })).toBeVisible();
  await expect.poll(() => sockets.size).toBe(0);
  await login();
  await expect(
    page.getByRole("button", { name: "Thử lại / Làm mới" }),
  ).toBeVisible();
  await expect(page.locator(".connection-bar")).toContainText("connected");
  await page.route("**/api/v1/races", (route) =>
    route.fulfill({ status: 401, body: "{}", contentType: "application/json" }),
  );
  await page.getByRole("button", { name: "Thử lại / Làm mới" }).click();
  await expect(page.getByLabel("Admin key", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  checks.push("logout closes sockets; protected 401 invalidates session");
  await writeFile(
    "test-results/matching-integration.json",
    JSON.stringify({ checks, errors, physicalArduinoTested: false }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  await page.screenshot({
    path: "test-results/matching-failure.png",
    fullPage: true,
  });
  console.log((await page.locator("body").innerText()).slice(0, 14000));
  throw error;
} finally {
  await browser.close();
}
