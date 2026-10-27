import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const key = process.env.ADMIN_API_KEY;
if (!key) throw new Error("Missing test credential");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const writes = [],
  errors = [],
  wsPorts = new Set(),
  reads = new Set();
page.on("pageerror", (e) => errors.push(e.message));
page.on("websocket", (s) => { const u=new URL(s.url()); if(u.pathname.startsWith("/ws/v1/"))wsPorts.add(u.port); });
await page.route("**/api/v1/**", (r) => {
  const req = r.request();
  if (!["GET", "OPTIONS", "HEAD"].includes(req.method()) && !new URL(req.url()).pathname.endsWith("/auth/admin-key")) {
    writes.push(req.method());
    return r.abort();
  }
  reads.add(new URL(req.url()).pathname);
  return r.continue();
});
await page.route("https://*.tile.openstreetmap.org/**", (r) => r.abort());
try {
  await page.goto("http://localhost:5173/runners");
  await page.getByLabel("Admin key", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await page
    .getByRole("button", { name: "Sinh viên toàn hệ thống", exact: true })
    .click();
  await expect(page.locator(".people-panel tbody tr").first()).toBeVisible();
  await mkdir("test-results/new-runtime", { recursive: true });
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/new-runtime/students-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Đăng ký của giải", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Đăng ký của giải:/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Làm mới đăng ký" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/new-runtime/participants.png",
    fullPage: true,
  });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  expect([...wsPorts]).toEqual(["8000"]);
  expect([...reads]).toContain("/api/v1/students");
  expect([...reads].some((p) => p.endsWith("/participants"))).toBe(true);
  const report = {
    realReads: ["students", "participants", "dashboard/live"],
    wsPorts: [...wsPorts],
    writes,
    errors,
  };
  await writeFile(
    "test-results/new-runtime/read-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  await browser.close();
}
