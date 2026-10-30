import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
const gpsGranted = process.env.QA_GPS === "granted";
const out = "test-results/challenge";
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ["scripts/serve.cjs", "dist", "8085"], {
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((resolve, reject) => {
  server.stdout.once("data", resolve);
  server.once("error", reject);
  server.once("exit", (code) => reject(new Error(`Server exited ${code}`)));
});
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: gpsGranted ? ["geolocation"] : [],
  geolocation: { latitude: 21.000389, longitude: 105.842583, accuracy: 5 },
});
const page = await context.newPage();
// Refresh simulated timestamps even while stationary; never connected to a real API.
const gpsTimer = gpsGranted
  ? setInterval(
      () =>
        context
          .setGeolocation({
            latitude: 21.000389,
            longitude: 105.842583,
            accuracy: 5,
          })
          .catch(() => {}),
      1000,
    )
  : undefined;
const errors = [],
  shots = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(15000);
async function shot(name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  shots.push(name);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
async function button(name) {
  await page.getByRole("button", { name, exact: true }).click();
}
async function tab(name) {
  await page.getByRole("tab", { name, exact: true }).click();
}
async function login(code = "11223344") {
  await page
    .getByRole("textbox", { name: "Mã sinh viên", exact: true })
    .fill(code);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("NeuRun@demo");
  await button("Đăng nhập");
  await expect(
    page.getByRole("tab", { name: "Giải chạy", exact: true }),
  ).toBeVisible();
}
try {
  await page.goto("http://127.0.0.1:8085");
  await login();
  await page.evaluate(() => {
    const key = "neu-student:mock-server:11223344";
    const db = JSON.parse(localStorage.getItem(key));
    db.snapshot.races[0].targetDistanceMeters = 50000;
    db.snapshot.races[0].name =
      "Thử thách tích lũy 50 km dành cho sinh viên Đại học Kinh tế Quốc dân";
    localStorage.setItem(key, JSON.stringify(db));
  });
  await page.reload();
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [768, 1024],
    [390, 844],
    [360, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByText("Tích lũy 50 km", { exact: false }).first(),
    ).toBeVisible();
    await shot(`list-${width}`);
    await page
      .getByRole("button", {
        name: "Thử thách tích lũy 50 km dành cho sinh viên Đại học Kinh tế Quốc dân",
        exact: true,
      })
      .click();
    const heading = page.getByRole("heading", {
      name: "Thử thách tích lũy 50 km dành cho sinh viên Đại học Kinh tế Quốc dân",
      exact: true,
    });
    await expect(heading).toBeVisible();
    const badge = await page
      .getByText("Đang diễn ra", { exact: true })
      .boundingBox();
    const header = await page
      .getByText("Chi tiết giải", { exact: true })
      .boundingBox();
    expect(badge.y).toBeGreaterThan(header.y + header.height);
    await shot(`detail-${width}`);
    await button("Quay lại");
  }
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.activeElement !== document.body),
  ).toBe(true);
  const unnamed = await page
    .locator('button, [role="button"]')
    .evaluateAll(
      (nodes) =>
        nodes.filter(
          (n) =>
            !n.getAttribute("aria-label") &&
            !n.getAttribute("aria-labelledby") &&
            !n.textContent.trim() &&
            !n.getAttribute("title"),
        ).length,
    );
  expect(unnamed).toBe(0);
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.activeElement !== document.body),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    "PASS challenge mock fixture: 5 viewports, list/detail, document overflow and keyboard focus smoke; not WCAG certification",
  );
} finally {
  clearInterval(gpsTimer);
  await browser.close();
  server.kill();
}
