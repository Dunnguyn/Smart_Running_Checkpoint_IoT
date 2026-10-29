import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
const gpsGranted = process.env.QA_GPS === "granted";
const out = `test-results/ui-${gpsGranted ? "gps-simulated" : "denied"}`;
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
  await expect(
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
  await shot("login-390");
  await page.setViewportSize({ width: 320, height: 640 });
  await shot("login-320");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("textbox", { name: "Mã sinh viên", exact: true })
    .fill("11223344");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("bad");
  await button("Hiện mật khẩu");
  await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveJSProperty(
    "type",
    "text",
  );
  await button("Ẩn mật khẩu");
  await button("Đăng nhập");
  await expect(
    page.getByText("Mã sinh viên hoặc mật khẩu chưa chính xác.", {
      exact: true,
    }),
  ).toBeVisible();
  await shot("login-error");
  await login();
  await expect(
    page.getByRole("button", { name: "NEU Campus Run 2026", exact: true }),
  ).toBeVisible();
  await shot("races");
  await button("Đã đăng ký");
  await expect(
    page.getByRole("button", { name: "NEU Spring Run", exact: true }),
  ).toBeVisible();
  await shot("registered");
  await button("Khám phá");
  await page
    .getByRole("textbox", { name: "Tìm kiếm giải chạy" })
    .fill("không tồn tại");
  await expect(page.getByText("Chưa tìm thấy giải phù hợp")).toBeVisible();
  await shot("races-empty");
  await page.getByRole("textbox", { name: "Tìm kiếm giải chạy" }).fill("");
  await button("NEU Campus Run 2026");
  await shot("detail");
  await button("Xem bản đồ chi tiết");
  await shot("map");
  await button("Lấy vị trí hiện tại");
  if (gpsGranted)
    await expect(
      page.getByRole("button", { name: "Về vị trí", exact: true }),
    ).toBeEnabled();
  if (
    await page
      .getByRole("button", { name: "Về vị trí", exact: true })
      .isDisabled()
  ) {
    await expect(
      page.getByText("Chưa có quyền vị trí.", { exact: false }),
    ).toBeVisible();
    await shot("location-denied");
    throw new Error(
      "BLOCKED: quyền vị trí bị từ chối; đã xác minh thông báo và nút khóa. Luồng GPS còn lại NOT RUN. Chạy nhánh cấp quyền trong môi trường geolocation mô phỏng riêng hoặc trên thiết bị thật.",
    );
  }
  await button("Về vị trí");
  await shot("map-location");
  await button("Quay lại");
  await button("Đăng ký tham gia");
  await shot("registration-confirm");
  await button("Xác nhận đăng ký");
  await expect(
    page.getByText("Đăng ký thành công", { exact: true }),
  ).toBeVisible();
  await shot("registration-success");
  await button("Xem thông tin tham gia");
  await expect(page.getByText("NR-0265", { exact: true })).toBeVisible();
  await button("Check-in bằng GPS");
  await shot("checkin");
  await button("Lấy vị trí và check-in");
  await expect(page.getByText("Đã check-in", { exact: true })).toBeVisible();
  await button("Bắt đầu chạy");
  await button("Bắt đầu phiên chạy");
  await expect(page.getByText("Đang ghi GPS", { exact: true })).toBeVisible();
  await page.waitForTimeout(2100);
  await shot("run-active");
  await button("Tạm dừng");
  await expect(page.getByText("Đang tạm dừng", { exact: true })).toBeVisible();
  await shot("run-paused");
  const paused = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("neu-student:tracking:mock:11223344")),
  );
  await page.waitForTimeout(1600);
  const later = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("neu-student:tracking:mock:11223344")),
  );
  expect(later.sequence).toBe(paused.sequence);
  expect(later.distance).toBe(paused.distance);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Quay lại phiên chạy", exact: true }),
  ).toBeVisible();
  await button("Quay lại phiên chạy");
  await expect(page.getByText("Đang tạm dừng", { exact: true })).toBeVisible();
  await button("Tiếp tục");
  await expect(page.getByText("Đang ghi GPS", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("neu-student:tracking:mock:11223344"))
          .segment,
    ),
  ).toBe(paused.segment + 1);
  await button("Trạm & vòng");
  await shot("run-stations");
  await button("Tạm dừng");
  await button("Kết thúc sớm");
  await shot("finish-confirm");
  await button("Xác nhận kết thúc");
  await expect(
    page.getByText("Đang xác nhận kết quả", { exact: true }),
  ).toBeVisible();
  await shot("result-pending");
  await expect(
    page.getByText("Phiên chạy đã kết thúc", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await shot("result-under");
  await button("Check-out bằng GPS");
  await button("Lấy vị trí và check-out");
  await button("Xem lịch sử các giải");
  await shot("history");
  await button("Đạt mục tiêu");
  await button("Chi tiết NEU Spring Run");
  await expect(
    page.getByText("Hoàn thành giải chạy", { exact: true }),
  ).toBeVisible();
  await shot("history-completed");
  await button("Quay lại");
  await tab("Thống kê");
  await shot("stats");
  await button("Tuần");
  await shot("stats-week");
  await tab("Hồ sơ");
  await shot("profile");
  await page.setViewportSize({ width: 320, height: 640 });
  await shot("profile-320");
  await tab("Giải chạy");
  await shot("races-320");
  await page.setViewportSize({ width: 430, height: 932 });
  await shot("races-430");
  await tab("Hồ sơ");
  await button("Đăng xuất");
  await button("Xác nhận đăng xuất");
  await login("11223345");
  await tab("Lịch sử");
  await expect(
    page.getByText("Chưa có phiên chạy", { exact: true }),
  ).toBeVisible();
  await tab("Thống kê");
  await expect(
    page.getByText("Chưa có kết quả trong khoảng này"),
  ).toBeVisible();
  await shot("stats-empty");
  expect(errors).toEqual([]);
  await writeFile(
    `${out}/report.json`,
    JSON.stringify(
      {
        status: "passed",
        gps: "Browser geolocation simulation at mock checkpoint; no real GPS or backend",
        platform:
          "React Native Web / Edge desktop headless; not a native device",
        shots,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(`Passed UI flow and ${shots.length} screenshots.`);
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` });
  await writeFile(
    `${out}/failure.txt`,
    `${error.stack}\nPAGE ERRORS: ${errors.join("\n")}\n${await page.locator("body").innerText()}`,
  );
  throw error;
} finally {
  clearInterval(gpsTimer);
  await browser.close();
  server.kill();
}
