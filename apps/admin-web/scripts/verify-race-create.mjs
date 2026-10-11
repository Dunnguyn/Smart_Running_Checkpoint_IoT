// Every business endpoint is intercepted. No real race is created.
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
let races = [],
  writes = [],
  failure = "validation";
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.routeWebSocket("**/ws/v1/**", (ws) => ws.close());
await page.route("**/api/v1/**", async (route) => {
  const req = route.request(),
    path = new URL(req.url()).pathname;
  const json = (body, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  if (path.endsWith("/auth/admin-key")) return json({ authenticated: true });
  if (path === "/api/v1/races" && req.method() === "GET")
    return json({ items: races });
  if (path === "/api/v1/races" && req.method() === "POST") {
    writes.push(req.postDataJSON());
    if (failure === "validation")
      return json(
        {
          detail: [
            { loc: ["body", "name"], msg: "Tên giải không hợp lệ từ fixture" },
          ],
        },
        422,
      );
    if (failure === "network") return route.abort();
    await new Promise((r) => setTimeout(r, 350));
    const race = { ...req.postDataJSON(), race_id: "new-fixture" };
    races = [race];
    return json(race, 201);
  }
  if (path.endsWith("/dashboard"))
    return json({
      race: races[0],
      summary: {
        participants: 0,
        started_runners: 0,
        active_runners: 0,
        completed_runners: 0,
        not_started_runners: 0,
        laps_recorded: 0,
        distance_total_m: 0,
        total_steps: 0,
        checkpoint_events: 0,
        checkpoint_events_by_status: {},
        pending_matches: 0,
        ambiguous_matches: 0,
      },
      runners: [],
      top_runners: [],
      recent_checkpoint_events: [],
      route: { points: [], distance_m: 0 },
      checkpoints: [],
      server_time: new Date().toISOString(),
    });
  if (path.endsWith("/live"))
    return json({
      race_id: "new-fixture",
      runners: [],
      server_time: new Date().toISOString(),
    });
  throw new Error("Unexpected fixture request: " + req.method() + " " + path);
});
try {
  await page.goto("http://localhost:5173/races");
  await page.getByLabel("Admin key", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(
    page.getByText("Chưa có giải chạy", { exact: true }),
  ).toBeVisible();
  const open = () =>
    page.getByRole("button", { name: "Tạo giải chạy", exact: true }).click();
  await open();
  const dialog = page.getByRole("dialog", { name: "Tạo giải chạy" });
  const submit = () =>
    dialog.getByRole("button", { name: "Tạo giải", exact: true });
  await submit().click();
  await expect(
    dialog.getByText("Tên giải cần từ 1 đến 160 ký tự."),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  await dialog
    .getByLabel("Tên giải", { exact: true })
    .fill("Giải fixture cô lập");
  await dialog.getByLabel("Số vòng", { exact: true }).fill("101");
  await submit().click();
  expect(writes).toHaveLength(0);
  await dialog.getByLabel("Số vòng", { exact: true }).fill("4");
  await submit().click();
  await expect(
    dialog.getByText("Tên giải không hợp lệ từ fixture"),
  ).toBeVisible();
  await expect(dialog.getByLabel("Tên giải", { exact: true })).toHaveValue(
    "Giải fixture cô lập",
  );
  failure = "";
  await dialog.getByLabel("Chế độ tính vòng").selectOption("GPS_AND_ARDUINO");
  await mkdir("test-results/ux", { recursive: true });
  await page.screenshot({
    path: "test-results/ux/create-race-isolated.png",
    fullPage: true,
  });
  await submit().click();
  await expect(
    dialog.getByRole("button", { name: "Đang tạo…" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Đã tạo giải chạy.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Mở giải vừa tạo" }),
  ).toBeVisible();
  await expect(page.getByLabel("Chọn giải chạy")).toHaveValue("new-fixture");
  expect(writes).toHaveLength(2);
  expect(writes[1]).toMatchObject({
    status: "DRAFT",
    checkpoint_mode: "GPS_AND_ARDUINO",
    total_laps: 4,
    min_lap_interval_seconds: null,
  });
  await open();
  await dialog
    .getByLabel("Tên giải", { exact: true })
    .fill("Không chắc đã tạo");
  failure = "network";
  await submit().click();
  await expect(
    dialog.getByText("Chưa xác định giải đã được tạo hay chưa.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(submit()).toBeDisabled();
  expect(writes).toHaveLength(3);
  await dialog
    .getByRole("button", { name: "Đóng và tải lại danh sách" })
    .click();
  await open();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(3);
  expect(errors).toEqual([]);
  console.log(
    JSON.stringify(
      {
        checks: [
          "empty database create form",
          "validation and 422 keep draft",
          "POST payload, busy guard, refetch list/header",
          "network failure prevents retry",
          "Escape/cancel no write",
        ],
        interceptedWrites: writes.length,
        realWrites: 0,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
