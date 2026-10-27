import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const base = "http://localhost:8000";
const key = process.env.ADMIN_API_KEY;
async function api(path, method = "GET", body) {
  const response = await fetch(base + path, {
    method,
    headers: { "X-Admin-Key": key, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`API ${method} ${path}: HTTP ${response.status}`);
  return response.json();
}
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
});
const page = await context.newPage();
const errors = [],
  received = [],
  connections = new Set();
// Do not record request headers, socket URLs, console output, traces or credentials.
page.on("pageerror", (error) => errors.push(error.name));
page.on("websocket", (socket) => {
  if (!socket.url().includes("/ws/v1/")) return;
  connections.add(socket);
  socket.on("close", () => connections.delete(socket));
  socket.on("framereceived", (frame) => {
    try {
      received.push(JSON.parse(String(frame.payload)));
    } catch {
      /* Ignore non-JSON frames. */
    }
  });
});
const checks = [];
let simulator;
try {
  await mkdir("test-results", { recursive: true });
  const openapi = await (await fetch(base + "/openapi.json")).json();
  const parameters = openapi.paths[
    "/api/v1/races/{race_id}/runners"
  ].get.parameters.map((p) => p.name);
  for (const name of [
    "keyword",
    "status",
    "page",
    "page_size",
    "sort_by",
    "sort_order",
  ])
    expect(parameters).toContain(name);
  await page.goto("http://localhost:5173");
  await page.getByLabel("Admin key", { exact: true }).fill(randomUUID());
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Admin key không hợp lệ");
  await page.getByRole("button", { name: "Nhập lại Admin key" }).click();
  await page.getByLabel("Admin key", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Chưa có giải chạy" }),
  ).toBeVisible();
  checks.push("wrong key, re-entry, empty database");
  simulator = spawn(
    process.env.BACKEND_PYTHON,
    ["-m", "app.simulator", "--base-url", base, "--laps", "2"],
    { cwd: "../../services/backend", env: process.env, stdio: "ignore" },
  );
  const simulatorDone = new Promise((resolve, reject) => {
    simulator.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Simulator exit ${code}`)),
    );
  });
  await expect
    .poll(async () => (await api("/api/v1/races")).items.length, {
      timeout: 15000,
    })
    .toBe(1);
  const race = (await api("/api/v1/races")).items[0];
  await page.getByRole("button", { name: "Thử lại / Làm mới" }).click();
  await expect(page.getByLabel("Chọn giải chạy")).toHaveValue(race.race_id);
  await expect(page.locator(".connection-bar")).toContainText("connected", {
    timeout: 15000,
  });
  await expect(page.locator(".runner-marker")).toHaveCount(1, {
    timeout: 15000,
  });
  const firstTransform = await page
    .locator(".runner-marker")
    .getAttribute("style");
  await expect
    .poll(
      async () =>
        (await api(`/api/v1/races/${race.race_id}/runners`)).items[0]
          ?.total_steps,
      { timeout: 18000 },
    )
    .toBeGreaterThan(1000);
  await expect
    .poll(() => page.locator(".runner-marker").getAttribute("style"), {
      timeout: 10000,
    })
    .not.toBe(firstTransform);
  checks.push("race selected, CORS REST, one live socket, GPS marker moves");
  const other = await api("/api/v1/races", "POST", {
    name: "Integration empty race",
    status: "DRAFT",
    total_laps: 2,
  });
  await page.getByRole("button", { name: "Thử lại / Làm mới" }).click();
  await expect(page.getByLabel("Chọn giải chạy")).toHaveValue(race.race_id);
  await page.getByLabel("Chọn giải chạy").selectOption(other.race_id);
  await expect(page.locator(".kpi-value").first()).toContainText("0");
  await expect(page.locator(".runner-marker")).toHaveCount(0);
  await page.waitForTimeout(8500);
  await expect(page.locator(".runner-marker")).toHaveCount(0);
  await expect.poll(() => connections.size).toBe(1);
  checks.push("race switch closes old socket and excludes old race events");
  await page.getByLabel("Chọn giải chạy").selectOption(race.race_id);
  await expect(page.locator(".runner-marker")).toHaveCount(1);
  // Force a real socket close while keeping REST reachable; verify reconnect and resnapshot.
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await context.setOffline(true);
  await page.waitForTimeout(1500);
  await context.setOffline(false);
  await page.getByRole("button", { name: "Thử lại / Làm mới" }).click();
  await expect(page.locator(".connection-bar")).toContainText("connected", {
    timeout: 15000,
  });
  checks.push("network recovery and resnapshot");
  await simulatorDone;
  const runner = (await api(`/api/v1/races/${race.race_id}/runners`)).items[0];
  expect(runner.lap_count).toBe(2);
  expect(runner.total_steps).toBe(1640);
  await expect(page.locator("tbody tr").first()).toContainText("1.640", {
    timeout: 15000,
  });
  expect(received.some((e) => e.type === "runner.updated")).toBe(true);
  expect(received.some((e) => e.type === "checkpoint.passed")).toBe(true);
  await page.screenshot({
    path: "test-results/api-dashboard.png",
    fullPage: true,
  });
  checks.push(
    "single simulator run: 9 GPS points, 1640 steps, 2 geofence laps with default timing",
  );
  await page.locator(".student-link").first().click();
  await expect(
    page.getByRole("heading", { name: "Lịch sử GPS / LAP" }),
  ).toBeVisible();
  await expect(page.locator(".lap-list > div")).toHaveCount(2);
  const before = runner.lap_count;
  // No physical gateway: UNASSIGNED semantics are additionally unit tested, not claimed as hardware coverage.
  const finished = await api(
    `/api/v1/runs/${runner.run_id}/finish`,
    "POST",
    {},
  );
  expect(finished.status).toBe("COMPLETED");
  await expect(page.locator(".page-title .badge")).toContainText("Hoàn thành", {
    timeout: 15000,
  });
  const finalDuration = (
    await api(`/api/v1/runners/${runner.student_id}/runs/${runner.run_id}`)
  ).duration_total_s;
  await page.waitForTimeout(1500);
  expect(
    (await api(`/api/v1/runners/${runner.student_id}/runs/${runner.run_id}`))
      .duration_total_s,
  ).toBe(finalDuration);
  expect(
    (await api(`/api/v1/runners/${runner.student_id}/runs/${runner.run_id}`))
      .lap_count,
  ).toBe(before);
  checks.push("detail history matches API and completed result remains fixed");
  await page.goto(
    `http://localhost:5173/runners/${randomUUID()}/runs/${runner.run_id}`,
  );
  await page.getByLabel("Admin key", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await expect(
    page
      .getByText("Tài nguyên không còn tồn tại hoặc không thuộc sinh viên này.")
      .first(),
  ).toBeVisible();
  checks.push("reload asks for key; runner/run identity mismatch rejected");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(errors).toEqual([]);
  await writeFile(
    "test-results/api-integration.json",
    JSON.stringify({ checks, errors, hardwareGatewayTested: false }, null, 2),
  );
  console.log(
    JSON.stringify({ checks, errors, hardwareGatewayTested: false }, null, 2),
  );
} finally {
  simulator?.kill();
  await browser.close();
}
