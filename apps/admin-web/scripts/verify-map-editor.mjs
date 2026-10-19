// Isolated browser contract tests. Every /api/v1 request is intercepted;
// no business write reaches the real backend and no runtime fallback is added.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const race = "editor-fixture",
  cp = "checkpoint-fixture",
  writes = [],
  errors = [],
  checks = [];
let version = 1,
  fail = "",
  runs = false,
  empty = false;
let checkpoint = {
  checkpoint_id: cp,
  code: "CP01",
  name: "Trạm kiểm thử cô lập",
  sequence_no: 1,
  kind: "LAP",
  latitude: 21,
  longitude: 105,
  radius_m: 10,
};
let points = [
  { latitude: 21, longitude: 105, checkpoint_id: cp },
  { latitude: 21.00095, longitude: 105, checkpoint_id: null },
  { latitude: 21.00095, longitude: 105.001, checkpoint_id: null },
  { latitude: 21, longitude: 105.001, checkpoint_id: null },
  { latitude: 21, longitude: 105, checkpoint_id: null },
];
const metadata = () => ({
  route_profile: "NEU_DEMO",
  route_length_min_m: 400,
  route_length_max_m: 450,
  editable: !runs,
  locked: runs,
  locked_reason: runs ? "Đã có phiên chạy" : null,
  route_status: empty ? "NOT_CONFIGURED" : "CONFIGURED",
});
const route = () => ({
  ...metadata(),
  points: empty ? [] : points.map((p, i) => ({ ...p, sequence_no: i + 1 })),
  distance_m: 419,
});
const dashboard = () => ({
  race: {
    ...metadata(),
    race_id: race,
    name: "Kiểm thử editor · dữ liệu cô lập",
    status: "DRAFT",
    checkpoint_mode: "GPS_ONLY",
    total_laps: 1,
    config_version: version,
  },
  summary: {
    participants: 0,
    started_runners: runs ? 1 : 0,
    active_runners: 0,
    completed_runners: runs ? 1 : 0,
    not_started_runners: 0,
    runners_at_lap_target: 0,
    laps_recorded: 0,
    distance_total_m: 0,
    steps_total: 0,
    average_duration_s: 0,
    checkpoint_events: 0,
    checkpoint_events_by_status: {},
    pending_matches: 0,
    ambiguous_matches: 0,
  },
  runners: [],
  top_runners: [],
  recent_checkpoint_events: [],
  server_time: new Date().toISOString(),
  route: route(),
  checkpoints: [checkpoint],
});
await page.route("https://*.tile.openstreetmap.org/**", (r) => r.abort());
await page.routeWebSocket("**/ws/v1/**", (ws) => ws.close());
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/v1/**", async (r) => {
  const req = r.request(),
    path = new URL(req.url()).pathname,
    method = req.method();
  const json = (body, status = 200) =>
    r.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  if (method === "POST" && path.endsWith("/auth/admin-key"))
    return json({ authenticated: true, role: "ADMIN" });
  if (method === "GET") {
    if (path.endsWith("/races"))
      return json({
        items: [
          {
            race_id: race,
            name: "Kiểm thử editor · dữ liệu cô lập",
            status: "DRAFT",
            start_at: null,
          },
          {
            race_id: "other",
            name: "Giải kiểm thử thứ hai",
            status: "DRAFT",
            start_at: null,
          },
        ],
      });
    if (path.endsWith("/dashboard")) return json(dashboard());
    if (path.endsWith("/route")) return json({ race_id: race, ...route() });
    if (path.endsWith("/live"))
      return json({
        race_id: race,
        server_time: new Date().toISOString(),
        runners: [],
        route: route(),
      });
    if (path.endsWith("/runners"))
      return json({ items: [], total: 0, page: 1, page_size: 10 });
  }
  if (method === "PATCH" || method === "PUT") {
    const body = req.postDataJSON();
    writes.push({ method, path, body });
    if (fail === "locked") {
      runs = true;
      return json(
        { detail: { code: "CHECKPOINT_LOCKED", message: "locked" } },
        409,
      );
    }
    if (fail === "validation")
      return json(
        { detail: { code: "ROUTE_LENGTH_OUT_OF_RANGE", message: "invalid" } },
        422,
      );
    if (method === "PATCH") {
      checkpoint = { ...checkpoint, ...body };
      points = points.map((p, i) =>
        p.checkpoint_id === cp || i === points.length - 1
          ? {
              ...p,
              latitude: checkpoint.latitude,
              longitude: checkpoint.longitude,
            }
          : p,
      );
    } else {
      points = body.points.map((p) => ({ ...p }));
      empty = false;
      const anchor = points.find((p) => p.checkpoint_id === cp);
      checkpoint = {
        ...checkpoint,
        latitude: anchor.latitude,
        longitude: anchor.longitude,
      };
    }
    version++;
    if (fail === "lost-response") return json({}, 500);
    return json({
      checkpoint_id: cp,
      race_id: race,
      route: route(),
      config_version: version,
    });
  }
  throw new Error("Unexpected isolated request " + method + " " + path);
});
await mkdir("test-results/ux", { recursive: true });
const login = async () => {
  await page.getByLabel("Admin key", { exact: true }).fill("isolated-test-key");
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
};
const save = () =>
  page.getByRole("button", { name: "Lưu thay đổi", exact: true });
const acceptNext = () => page.once("dialog", (d) => d.accept());
let dismissed;
const rejectNext = () => {
  dismissed = new Promise((resolve) =>
    page.once("dialog", async (d) => {
      await d.dismiss();
      resolve();
    }),
  );
};
try {
  await page.goto("http://localhost:5173/live");
  await login();
  await expect(
    page.getByRole("button", { name: "Chỉnh sửa bản đồ", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".leaflet-marker-draggable")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Chỉnh sửa bản đồ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Chỉnh vị trí checkpoint", exact: true })
    .click();
  await expect(page.getByLabel("Bán kính (m)", { exact: true })).toHaveValue(
    "10",
  );
  await expect(save()).toBeDisabled();
  const marker = page.locator(".leaflet-marker-draggable");
  await marker.scrollIntoViewIfNeeded();
  const bb = await marker.boundingBox();
  await page.mouse.move(bb.x + 15, bb.y + 15);
  await page.mouse.down();
  await page.mouse.move(bb.x + 35, bb.y + 20, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByLabel("Vĩ độ", { exact: true })).not.toHaveValue("21");
  expect(writes).toEqual([]);
  await page.getByLabel("Bán kính (m)", { exact: true }).fill("0");
  await expect(save()).toBeDisabled();
  await expect(page.locator(".editor-save-status")).toContainText(
    "Bán kính phải lớn hơn 0 m.",
  );
  acceptNext();
  await page.getByRole("button", { name: "Hủy thay đổi", exact: true }).click();
  await expect(page.getByLabel("Vĩ độ", { exact: true })).toHaveValue("21");
  expect(writes).toEqual([]);
  await page
    .getByRole("button", { name: "Chọn trên bản đồ", exact: true })
    .click();
  const map = page.locator(".leaflet-container");
  const box = await map.boundingBox();
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await expect(page.getByLabel("Vĩ độ", { exact: true })).not.toHaveValue("21");
  expect(writes).toEqual([]);
  acceptNext();
  await page.getByRole("button", { name: "Hủy thay đổi", exact: true }).click();
  await page.getByLabel("Vĩ độ", { exact: true }).fill("21.000001");
  await page.getByLabel("Bán kính (m)", { exact: true }).fill("12");
  rejectNext();
  await page.getByRole("link", { name: "Sinh viên", exact: true }).click();
  await dismissed;
  await expect(page.getByLabel("Vĩ độ", { exact: true })).toHaveValue(
    "21.000001",
  );
  rejectNext();
  await page.getByLabel("Chọn giải chạy").selectOption("other");
  await dismissed;
  await expect(page.getByLabel("Chọn giải chạy")).toHaveValue(race);
  fail = "validation";
  await save().click();
  await expect(page.getByRole("alert")).toContainText("giới hạn");
  await expect(page.getByLabel("Vĩ độ", { exact: true })).toHaveValue(
    "21.000001",
  );
  await expect(
    page.getByText("Đã cập nhật checkpoint", { exact: true }),
  ).toHaveCount(0);
  fail = "";
  await save().click();
  await expect(
    page.getByText("Đã cập nhật checkpoint", { exact: true }),
  ).toBeVisible();
  expect(writes.at(-1)).toMatchObject({
    method: "PATCH",
    body: { latitude: 21.000001, radius_m: 12 },
  });
  expect(Object.keys(writes.at(-1).body).sort()).toEqual([
    "latitude",
    "radius_m",
  ]);
  await expect(save()).toBeDisabled();
  checks.push(
    "view locked markers; drag/pick/input share draft, radius validation, cancel without write; navigation/race discard guard; PATCH writable fields only; 422 keeps draft; refetch success",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/ux/editor-checkpoint-isolated.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Đóng editor", exact: true }).click();
  await page
    .getByRole("button", { name: "Chỉnh sửa bản đồ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Chỉnh tuyến chạy", exact: true })
    .click();
  await expect(page.getByLabel("Điểm / đoạn đang chọn")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Xóa điểm thường", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Điểm / đoạn đang chọn").selectOption("1");
  await page.getByLabel("Vĩ độ điểm").fill("21.00096");
  await expect(save()).toBeEnabled();
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(save()).toBeDisabled();
  await page.getByLabel("Điểm / đoạn đang chọn").selectOption("1");
  await page.getByLabel("Vĩ độ điểm").fill("21.00096");
  await page
    .getByRole("button", { name: "Thêm điểm bằng tọa độ", exact: true })
    .click();
  await expect(save()).toBeDisabled();
  await page.getByLabel("Vĩ độ điểm").fill("21.00096");
  await page.getByLabel("Kinh độ điểm").fill("105.0005");
  await expect(save()).toBeEnabled();
  await page
    .getByRole("button", { name: "Xóa điểm thường", exact: true })
    .click();
  await expect(save()).toBeEnabled();
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [1920, 1080],
    [820, 1180],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const actions = await page.locator(".editor-actions").boundingBox();
    expect(actions.y).toBeGreaterThanOrEqual(0);
    expect(actions.y + actions.height).toBeLessThanOrEqual(height + 1);
    await page.screenshot({
      path: `test-results/ux/editor-route-${width}-isolated.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/ux/editor-route-isolated.png",
    fullPage: true,
  });
  fail = "lost-response";
  await save().click();
  await expect(
    page.getByText("Đã cập nhật tuyến chạy", { exact: true }),
  ).toBeVisible();
  expect(writes.at(-1).method).toBe("PUT");
  expect(writes.at(-1).body.points[0].checkpoint_id).toBe(cp);
  expect(writes.at(-1).body.points.at(-1).checkpoint_id).toBe(null);
  expect(writes.at(-1).body.points.every((p) => !("sequence_no" in p))).toBe(
    true,
  );
  fail = "";
  checks.push(
    "route selection/coordinate keyboard edits, required anchor deletion blocked, insertion/deletion/undo, PUT order+anchors; ambiguous 500 resolved by readback without duplicate PUT",
  );
  await page.getByLabel("Điểm / đoạn đang chọn").selectOption("1");
  await page.getByLabel("Vĩ độ điểm").fill("21.00097");
  version++;
  await page
    .getByRole("button", { name: "Làm mới dữ liệu", exact: true })
    .click();
  await expect(
    page.getByText(/Dữ liệu server đã thay đổi, draft vẫn được giữ/),
  ).toBeVisible();
  await expect(page.getByLabel("Vĩ độ điểm")).toHaveValue("21.00097");
  await expect(save()).toBeDisabled();
  acceptNext();
  await page
    .getByRole("button", { name: "Tải lại và bỏ draft", exact: true })
    .click();
  await expect(save()).toBeDisabled();
  await page.getByRole("button", { name: "Đóng editor", exact: true }).click();
  await page
    .getByRole("button", { name: "Chỉnh sửa bản đồ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Chỉnh vị trí checkpoint", exact: true })
    .click();
  await page.getByLabel("Bán kính (m)", { exact: true }).fill("13");
  fail = "locked";
  await save().click();
  await expect(page.getByRole("alert").first()).toContainText(
    "kể cả phiên đã hoàn thành",
  );
  await expect(save()).toBeDisabled();
  await expect(page.getByLabel("Bán kính (m)", { exact: true })).toHaveValue(
    "13",
  );
  checks.push(
    "background server change preserves draft and blocks overwrite; server 409 lock preserves copyable draft and prevents retry",
  );
  acceptNext();
  await page.getByRole("button", { name: "Đóng editor", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Chỉnh sửa bản đồ", exact: true }),
  ).toBeDisabled();
  runs = false;
  empty = true;
  version++;
  fail = "";
  await page
    .getByRole("button", { name: "Làm mới dữ liệu", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Chỉnh sửa bản đồ", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Chỉnh sửa bản đồ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Chỉnh tuyến chạy", exact: true })
    .click();
  await expect(page.getByText(/Chưa có tuyến. Bật thêm điểm/)).toBeVisible();
  await expect(page.locator(".vertex-marker")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Thêm điểm bằng tọa độ", exact: true })
    .click();
  await page.getByLabel("Vĩ độ điểm").fill("21");
  await page.getByLabel("Kinh độ điểm").fill("105");
  await page.getByLabel("Neo checkpoint").selectOption(cp);
  await expect(
    page.getByRole("button", { name: "Xóa điểm thường", exact: true }),
  ).toBeDisabled();
  await expect(save()).toBeDisabled();
  checks.push(
    "empty route starts empty; keyboard creation and real fixture checkpoint anchor assignment; no automatic default route or implicit closing segment",
  );

  expect(errors).toEqual([]);
  await writeFile(
    "test-results/ux/editor-isolated-report.json",
    JSON.stringify(
      { checks, errors, interceptedWrites: writes, realBusinessWrites: 0 },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        checks,
        errors,
        interceptedWrites: writes.length,
        realBusinessWrites: 0,
      },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot({
    path: "test-results/ux/editor-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
