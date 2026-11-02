// Isolated browser contract tests. Every /api/v1 request is intercepted;
// no business write reaches the real backend and no runtime fallback is added.
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const UI_BASE = process.env.UI_BASE_URL || "http://localhost:5173";
let extraCheckpoints = [];
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(15000);
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
  checkpoints: [checkpoint, ...extraCheckpoints],
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
  if (method === "POST" && path.endsWith("/checkpoints")) {
    const body = req.postDataJSON();
    writes.push({ method, path, body });
    const created = { checkpoint_id: "new-checkpoint", ...body };
    extraCheckpoints.push(created);
    return json(created, 201);
  }
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
try {
  await page.goto(`${UI_BASE}/live`);
  await login();
  await page
    .getByRole("button", { name: "Chỉnh sửa bản đồ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Chỉnh tuyến chạy", exact: true })
    .click();
  await page.getByLabel("Điểm / đoạn đang chọn").selectOption("1");
  await page
    .getByRole("button", { name: "Thêm điểm bằng tọa độ", exact: true })
    .click();
  await page.getByLabel("Vĩ độ điểm").fill("21.0005");
  await page.getByLabel("Kinh độ điểm").fill("105");
  const retainedLatitude = await page.getByLabel("Vĩ độ điểm").inputValue();
  await page
    .getByRole("button", {
      name: "Tạo checkpoint tại điểm đang chọn",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Tạo và gắn checkpoint", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Mã checkpoint", { exact: true }).fill("CP02");
  await page.getByLabel("Tên checkpoint", { exact: true }).fill("Trạm mới");
  await page
    .getByLabel("Loại checkpoint")
    .selectOption("CHECKPOINT");
  const beforeCreate = writes.length;
  await page
    .getByRole("button", { name: "Tạo và gắn checkpoint", exact: true })
    .click();
  await expect(page.getByLabel("Checkpoint gắn tại điểm tuyến")).toHaveValue(
    "new-checkpoint",
  );
  await expect(page.getByLabel("Vĩ độ điểm")).toHaveValue(retainedLatitude);
  expect(writes.length).toBe(beforeCreate + 1);
  expect(writes.at(-1).method).toBe("POST");
  expect(writes.at(-1).body).toMatchObject({
    code: "CP02",
    kind: "CHECKPOINT",
    sequence_no: 2,
  });
  await expect(
    page.getByText("Đã tạo checkpoint và gắn vào điểm tuyến.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/ux/editor-create-checkpoint.png",
    fullPage: true,
  });
  checks.push(
    "create checkpoint at selected vertex, single POST, auto anchor, retain unsaved draft, no implicit route save",
  );

  expect(errors).toEqual([]);
  console.log(
    JSON.stringify({
      checks,
      realBusinessWrites: 0,
      interceptedWrites: writes.length,
    }),
  );
} catch (e) { console.log((await page.locator("body").innerText()).slice(-5000)); await page.screenshot({path:"test-results/ux/create-failure.png",fullPage:true}); throw e; } finally {
  await browser.close();
}
