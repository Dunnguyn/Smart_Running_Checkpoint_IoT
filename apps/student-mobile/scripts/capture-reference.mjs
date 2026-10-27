import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
const out = "test-results/reference-ui";
await mkdir(out, { recursive: true });
const server = spawn(
  process.execPath,
  ["scripts/serve.cjs", "test-results/reference", "8086"],
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
await new Promise((resolve, reject) => {
  server.stdout.once("data", resolve);
  server.once("error", reject);
  server.once("exit", reject);
});
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [],
  shots = [];
page.on("pageerror", (error) => errors.push(error.message));
async function shot(name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  shots.push(name);
}
async function button(name) {
  await page.getByRole("button", { name, exact: true }).click();
}
try {
  await page.goto("http://127.0.0.1:8086");
  await shot("login-390");
  await page.getByPlaceholder("Nhập mã sinh viên").fill("11223344");
  await page.getByPlaceholder("Nhập mật khẩu").fill("demo");
  await button("Đăng nhập");
  await page.getByRole("button", { name: "Khám phá", exact: true }).waitFor();
  await shot("races");
  for (const [name, label] of [
    ["stats", "Thống kê"],
    ["history", "Lịch sử"],
    ["profile", "Hồ sơ"],
  ]) {
    await page
      .locator(".bottom-nav")
      .getByRole("button", { name: label, exact: true })
      .click();
    await shot(name);
  }
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "Giải chạy", exact: true })
    .click();
  await page.locator(".race-card").first().click();
  await shot("detail");
  await button("Mở bản đồ");
  await shot("map");
  await button("Quay lại");
  await button("Đăng ký tham gia");
  await shot("registration-confirm");
  await button("Xác nhận");
  await page
    .getByRole("heading", { name: "Đăng ký thành công", exact: true })
    .waitFor();
  await shot("registration-success");
  await button("Xem chi tiết giải");
  await button("Check-in bằng GPS");
  await shot("checkin");
  const modalButtons = await page
    .locator(".modal")
    .getByRole("button")
    .allTextContents();
  await writeFile(`${out}/checkin-buttons.json`, JSON.stringify(modalButtons));
  await page
    .locator(".modal")
    .getByRole("button", { name: /Xác nhận|Lấy vị trí/ })
    .click();
  await button("Bắt đầu chạy");
  await shot("run-active");
  await button("Tạm dừng");
  await shot("run-paused");
  await button("Kết thúc sớm");
  await shot("finish-confirm");
  await button("Xác nhận kết thúc");
  await page
    .getByRole("button", { name: "Kiểm tra lại kết quả", exact: true })
    .waitFor();
  await shot("result-pending");
  await button("Kiểm tra lại kết quả");
  await shot("result-under");
  await writeFile(
    `${out}/report.json`,
    JSON.stringify({ shots, errors }, null, 2),
  );
  console.log(`Captured ${shots.length} reference screens.`);
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` });
  await writeFile(
    `${out}/failure.txt`,
    `${error.stack}\n${await page.locator("body").innerText()}`,
  );
  throw error;
} finally {
  await browser.close();
  server.kill();
}
