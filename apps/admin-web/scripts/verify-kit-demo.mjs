import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mkdir } from "node:fs/promises";
const server = await createServer({
  server: { host: "127.0.0.1", port: 5196, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  let status = "ARMED",
    laps = 0;
  let portsUnavailable = true;
  await mkdir("test-results/kit", { recursive: true });
  const mutations = [],
    errors = [];
  const snapshot = () => ({
    demo_id: "kit-test",
    status,
    serial_port: "COM3",
    race_id: "kit-race",
    full_name: "Người tham gia demo",
    student_code: "DEMO-001",
    last_lap_number: 9,
    message: "Kit xác nhận lượt qua C04",
    error: null,
    run:
      status === "ARMED"
        ? null
        : {
            status: status === "COMPLETED" ? "COMPLETED" : "ACTIVE",
            lap_count: laps,
            total_laps: 2,
            duration_total_s: laps * 65,
            distance_total_m: laps * 420,
            total_steps: laps * 600,
          },
  });
  await context.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace("/api/v1", "");
    if (req.method() !== "GET") mutations.push(path);
    const send = (body) => route.fulfill({ json: body });
    if (path === "/auth/admin-key") return send({ authenticated: true });
    if (path === "/races") return send({ items: [] });
    if (path === "/demos/kit/ports") {
      if (portsUnavailable) return route.abort("failed");
      return send({ items: [{ device: "COM3", description: "Arduino" }] });
    }
    if (
      path === "/demos/kit/sessions" ||
      path === "/demos/kit/sessions/kit-test"
    )
      return send(snapshot());
    if (path === "/demos/kit/sessions/kit-test/stop") {
      status = "STOPPED";
      return send(snapshot());
    }
    throw new Error(`Unexpected API request: ${path}`);
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  async function login() {
    await page.getByLabel("Admin key", { exact: true }).fill("fixture-key");
    await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  }
  await page.goto("http://127.0.0.1:5196/demos");
  await login();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.screenshot({
    path: "test-results/kit/connection-error.png",
    fullPage: true,
  });
  portsUnavailable = false;
  await page.getByRole("button", { name: "Thử kết nối lại" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("MSSV", { exact: true }).fill("DEMO-001");
  await page.getByLabel("Họ và tên", { exact: true }).fill("Người tham gia demo");
  await page.screenshot({
    path: "test-results/kit/setup-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Kết nối kit và tạo phiên" }).click();
  await expect(
    page.getByText("Chờ lượt qua C04 để xuất phát", { exact: true }),
  ).toBeVisible();
  status = "RUNNING";
  laps = 1;
  await expect(page.getByText("1/2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Dừng phiên kit" }),
  ).toBeEnabled();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "1");
  await page.screenshot({
    path: "test-results/kit/lap-one.png",
    fullPage: true,
  });
  // A page reload resumes the kit session without creating another one.
  await page.reload();
  await login();
  await expect(page.getByText("1/2", { exact: true })).toBeVisible();
  status = "COMPLETED";
  laps = 2;
  await expect(page.getByText("Đã hoàn thành", { exact: true })).toBeVisible();
  await expect(page.getByText("00:02:10", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Dừng phiên kit" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Kết nối kit và tạo phiên" }),
  ).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/kit/completed-mobile.png",
    fullPage: true,
  });
  expect(mutations.filter((path) => path !== "/auth/admin-key")).toEqual([
    "/demos/kit/sessions",
  ]);
  expect(errors).toEqual([]);
  console.log(
    "PASS: kit start, lap 1, reload recovery, lap 2 completion, frozen time, mobile layout, isolated APIs",
  );
} finally {
  await browser.close();
  await server.close();
}
