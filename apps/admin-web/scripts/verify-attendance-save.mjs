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
  errors = [];
let version = 1,
  runs = false,
  empty = false;
let checkpoint = {
  checkpoint_id: cp,
  code: "001",
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

let attendanceVersion = 0;
let failure = "";
await page.routeWebSocket("**/ws/v1/**", (ws) => ws.close());
await page.route("**/api/v1/**", async (r) => {
  const req = r.request(),
    path = new URL(req.url()).pathname;
  const json = (body, status = 200) =>
    r.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  if (path.endsWith("/auth/admin-key"))
    return json({ authenticated: true, role: "ADMIN" });
  if (path.endsWith("/attendance-config")) {
    writes.push(req.postDataJSON());
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (failure)
      return json(
        { detail: { code: failure, message: failure } },
        failure === "SERVER_ERROR" ? 500 : 409,
      );
    expect(writes.at(-1).expected_version).toBe(attendanceVersion);
    return json({
      config: { race_id: race, version: ++attendanceVersion, locked_at: null },
    });
  }
  if (req.method() !== "GET") throw Error("Unexpected write " + path);
  if (path.endsWith("/races"))
    return json({
      items: [{ race_id: race, name: "Attendance isolated", status: "DRAFT" }],
    });
  if (path.endsWith("/dashboard")) return json(dashboard());
  if (path.endsWith("/student-policy")) return json({});
  if (path.endsWith("/route")) return json({ race_id: race, ...route() });
  if (path.endsWith("/live"))
    return json({ race_id: race, runners: [], route: route() });
  return json({ items: [], total: 0 });
});
page.on("pageerror", (e) => errors.push(e.message));
async function open() {
  await page.goto(`${UI_BASE}/races/${race}?setup=student`);
  await page.getByLabel("Admin key", { exact: true }).fill("isolated-test-key");
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  await page.getByLabel("Trạm check-in", { exact: true }).selectOption(cp);
  await page.getByLabel("Trạm check-out", { exact: true }).selectOption(cp);
  for (const [key, value] of Object.entries({
    check_in_open_at: "2026-11-01T08:00",
    check_in_close_at: "2026-11-01T09:00",
    check_out_open_at: "2026-11-01T08:30",
    check_out_close_at: "2026-11-01T10:00",
    max_position_age_seconds: "30",
    max_accuracy_m: "50",
  }))
    await page.locator(`#attendance-${key}`).fill(value);
}
try {
  await open();
  await page
    .getByRole("button", { name: "Tạo cấu hình điểm danh mới", exact: true })
    .dblclick();
  await expect(
    page.getByText("Đã lưu phiên bản 1", { exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    expected_version: 0,
    check_in_checkpoint_id: cp,
    check_out_checkpoint_id: cp,
    check_in_open_at: "2026-11-01T01:00:00.000Z",
  });
  await page.locator("#attendance-max_accuracy_m").fill("40");
  await page
    .getByRole("button", { name: "Lưu cấu hình điểm danh", exact: true })
    .click();
  await expect(
    page.getByText("Đã lưu phiên bản 2", { exact: true }),
  ).toBeVisible();
  expect(writes[1].expected_version).toBe(1);
  await mkdir("test-results/ux", { recursive: true });
  await page.screenshot({
    path: "test-results/ux/attendance-saved.png",
    fullPage: true,
  });
  for (const code of ["VERSION_CONFLICT", "CONFIG_LOCKED", "SERVER_ERROR"]) {
    failure = code;
    await open();
    await page
      .getByRole("button", { name: "Tạo cấu hình điểm danh mới", exact: true })
      .click();
    await expect(page.locator("#attendance-max_accuracy_m")).toBeDisabled();
    await expect(page.locator("#attendance-max_accuracy_m")).toHaveValue("50");
    await expect(
      page.getByRole("button", {
        name: "Tạo cấu hình điểm danh mới",
        exact: true,
      }),
    ).toBeDisabled();
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS: create, same checkpoint, UTC+7 payload, duplicate submit, versioned update, conflict, lock, uncertain response; draft preserved; all APIs mocked",
  );
} finally {
  await browser.close();
}
