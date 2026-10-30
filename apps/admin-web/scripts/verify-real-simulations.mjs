// Authorized real E2E: maximum two new simulation submissions. Never seeds or deletes.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
const key = process.env.ADMIN_API_KEY;
if (!key) throw Error("Missing credential");
const base = "http://localhost:8000/api/v1",
  out = "test-results/real-e2e-20261012";
await mkdir(out, { recursive: true });
try {
  const prior = JSON.parse(await readFile(out + "/ledger.json", "utf8"));
  if (prior.jobs?.length)
    throw Error("Existing task jobs: do not resubmit; inspect ledger");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const clean = (v) =>
  JSON.parse(
    JSON.stringify(v, (k, x) =>
      /key|token|authorization|password/i.test(k)
        ? "[REDACTED]"
        : typeof x === "string"
          ? x.replaceAll(key, "[REDACTED]")
          : x,
    ),
  );
const save = async (name, v) =>
  writeFile(out + "/" + name + ".json", JSON.stringify(clean(v), null, 2));
const read = async (p) => {
  const r = await fetch(base + p, {
    headers: { "X-Admin-Key": key },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error("GET " + p + " " + r.status);
  return r.json();
};
const baseline = await read("/races");
await save("baseline", baseline);
const ledger = {
  createdAt: new Date().toISOString(),
  baselineRaceIds: baseline.items.map((r) => r.race_id),
  jobs: [],
};
await save("ledger", ledger);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.addInitScript(() => {
  const Native = window.WebSocket;
  window.__e2eSockets = [];
  window.WebSocket = class extends Native {
    constructor(...a) {
      super(...a);
      window.__e2eSockets.push(this);
    }
  };
});
const messages = [],
  errors = [],
  tiles = [],
  writes = [];
const isTileOpenStreetMapUrl = (url) => {
  try {
    return new URL(url).hostname === "tile.openstreetmap.org";
  } catch {
    return false;
  }
};
let paused = false,
  pausedReads = 0,
  current = null;
page.on("pageerror", (e) => errors.push(e.message));
page.on("requestfailed", (r) => {
  if (isTileOpenStreetMapUrl(r.url()) && tiles.length < 12)
    tiles.push({ url: r.url(), error: r.failure()?.errorText });
});
page.on("response", (r) => {
  if (isTileOpenStreetMapUrl(r.url()) && r.status() >= 400 && tiles.length < 12)
    tiles.push({ url: r.url(), status: r.status() });
});
page.on("websocket", (ws) => {
  if (new URL(ws.url()).pathname.startsWith("/ws/v1/"))
    ws.on("framereceived", (f) => {
      try {
        const data = JSON.parse(String(f.payload));
        messages.push({
          at: new Date().toISOString(),
          restPaused: paused,
          job: current?.simulation_id,
          data,
        });
      } catch {
        /* non-JSON not claimed as business */
      }
    });
});
await page.route("**/api/v1/**", (r) => {
  const req = r.request(),
    u = new URL(req.url());
  if (req.method() === "POST" && u.pathname.endsWith("/auth/admin-key"))
    return r.continue();
  if (req.method() === "POST" && u.pathname === "/api/v1/simulations") {
    if (writes.length >= 2) return r.abort();
    writes.push({
      at: new Date().toISOString(),
      path: u.pathname,
      body: req.postDataJSON(),
    });
    return r.continue();
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
    errors.push(
      "Blocked unauthorized mutation " + req.method() + " " + u.pathname,
    );
    return r.abort();
  }
  if (paused && /\/(live|dashboard|runners)$/.test(u.pathname)) {
    pausedReads++;
    return r.abort();
  }
  return r.continue();
});
const countSockets = () =>
  page.evaluate(
    () =>
      window.__e2eSockets.filter(
        (s) =>
          s.readyState === 1 && new URL(s.url).pathname.startsWith("/ws/v1/"),
      ).length,
  );
const shot = async (n) =>
  page.screenshot({ path: out + "/" + n + ".png", fullPage: true });
async function monitor(entry) {
  const prefix = entry.mode,
    started = Date.now();
  let job = entry.response;
  while (!job.race_id && Date.now() - started < 45000) {
    await page.waitForTimeout(1000);
    job = await read("/simulations/" + entry.simulation_id);
    entry.response = job;
    await save("ledger", ledger);
  }
  if (!job.race_id) throw Error("No race ID after 45s");
  entry.race_id = job.race_id;
  if (ledger.baselineRaceIds.includes(entry.race_id))
    throw Error("Refusing existing race");
  await save("ledger", ledger);
  console.log(
    prefix + " job=" + entry.simulation_id + " race=" + entry.race_id,
  );
  await page
    .getByRole("button", { name: "Mở bản đồ giải", exact: true })
    .click();
  await expect(page.getByLabel("Chọn giải chạy")).toHaveValue(entry.race_id);
  await expect(page.locator(".watch-row").first()).toBeVisible();
  await page.locator(".watch-row").first().click();
  await expect(
    page.getByRole("button", { name: "Chỉnh sửa bản đồ", exact: true }),
  ).toBeDisabled();
  const samples = [];
  const startMessage = messages.length;
  const collect = async () => {
    const d = await read("/races/" + entry.race_id + "/dashboard");
    samples.push({ at: new Date().toISOString(), dashboard: d });
    await save(prefix + "-samples", samples);
    return d;
  };
  let d = await collect();
  await save(
    prefix + "-participants",
    await read("/races/" + entry.race_id + "/participants"),
  );
  await save(
    prefix + "-route",
    await read("/races/" + entry.race_id + "/route"),
  );
  await shot(prefix + "-live-start");
  // Isolate real socket delivery from background REST without replacing responses.
  await page.waitForTimeout(2000);
  paused = true;
  await page.waitForTimeout(2000);
  const before = await page.locator(".selected-runner").innerText(),
    frameStart = messages.length;
  await page.waitForTimeout(7000);
  const after = await page.locator(".selected-runner").innerText();
  entry.wsIsolation = {
    before,
    after,
    changed: before !== after,
    frames: messages.slice(frameStart),
    blockedBackgroundReads: pausedReads,
  };
  paused = false;
  await save(prefix + "-ws-isolation", entry.wsIsolation);
  await page.waitForTimeout(1500);
  await expect.poll(countSockets).toBe(1);
  await page.evaluate(() =>
    window.__e2eSockets
      .filter(
        (s) =>
          s.readyState === 1 && new URL(s.url).pathname.startsWith("/ws/v1/"),
      )
      .forEach((s) => s.close(1000, "E2E reconnect")),
  );
  await expect.poll(countSockets, { timeout: 15000 }).toBe(1);
  entry.reconnect = "PASS";
  const map = page.locator(".leaflet-map");
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width * 0.7 - 75,
    box.y + box.height * 0.4 + 30,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(700);
  const transform = await map
    .locator(".leaflet-map-pane")
    .getAttribute("style");
  await page.waitForTimeout(2100);
  entry.panStable =
    transform ===
    (await map.locator(".leaflet-map-pane").getAttribute("style"));
  for (const [width, height] of [
    [1366, 768],
    [768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    entry["overflow" + width] = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    await shot(prefix + "-live-" + width);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  // Four laps at >=30s each plus 32s stagger, API overhead and matching grace: 360s bound.
  while (Date.now() - started < 360000) {
    d = await collect();
    job = await read("/simulations/" + entry.simulation_id);
    entry.response = job;
    await save("ledger", ledger);
    console.log(
      prefix +
        " " +
        job.status +
        " completed=" +
        d.summary.completed_runners +
        "/" +
        d.summary.participants +
        " laps=" +
        d.summary.laps_recorded,
    );
    if (!["RUNNING", "STOPPING"].includes(job.status)) break;
    await page.waitForTimeout(10000);
  }
  entry.timedOut = ["RUNNING", "STOPPING"].includes(job.status);
  entry.final = await collect();
  await save(prefix + "-job", job);
  const events = await read(
    "/races/" + entry.race_id + "/checkpoint-events?limit=100",
  );
  await save(prefix + "-events", events);
  const details = [];
  for (const r of entry.final.runners) {
    if (r.run_id)
      details.push({
        run: await read("/runners/" + r.student_id + "/runs/" + r.run_id),
        events: await read(
          "/runners/" + r.student_id + "/runs/" + r.run_id + "/events",
        ),
      });
  }
  await save(prefix + "-run-details", details);
  const rows = events.items ?? events.events ?? [];
  for (const e of rows.filter((e) => e.match_status === "AMBIGUOUS"))
    await save(
      prefix + "-ambiguous-" + e.event_id,
      await read("/checkpoint-events/" + e.event_id),
    );
  const durations = entry.final.runners.map((r) => ({
    run_id: r.run_id,
    status: r.status,
    duration: r.duration_total_s,
    lap_count: r.lap_count,
  }));
  await page.waitForTimeout(11000);
  await page
    .getByRole("button", { name: "Làm mới dữ liệu", exact: true })
    .click();
  const later = await collect();
  entry.durationCheck = {
    before: durations,
    after: later.runners.map((r) => ({
      run_id: r.run_id,
      status: r.status,
      duration: r.duration_total_s,
      lap_count: r.lap_count,
    })),
  };
  await page.getByRole("link", { name: "Tổng quan", exact: true }).click();
  await shot(prefix + "-overview-final");
  await page.getByRole("link", { name: "Sinh viên", exact: true }).click();
  await page.waitForTimeout(1500);
  await shot(prefix + "-runners-final");
  await page.getByRole("link", { name: "Trạm kiểm soát", exact: true }).click();
  await page.getByRole("button", { name: "Nhật ký", exact: true }).click();
  await page.waitForTimeout(1000);
  await shot(prefix + "-journal-final");
  entry.messageCount = messages.length - startMessage;
  entry.eventTypes = {};
  for (const f of messages.slice(startMessage)) {
    const t = f.data.type ?? "unknown";
    entry.eventTypes[t] = (entry.eventTypes[t] ?? 0) + 1;
  }
  await save(prefix + "-summary", entry);
  await save("messages", messages);
  await save("ledger", ledger);
}
try {
  await page.goto("http://localhost:5173/simulation");
  await page.getByLabel("Admin key", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  for (const mode of ["GPS_ONLY", "GPS_AND_ARDUINO"]) {
    await page.getByRole("link", { name: "Mô phỏng", exact: true }).click();
    await page
      .getByRole("button", { name: "Tạo mô phỏng", exact: true })
      .click();
    await page.getByRole("dialog").getByRole("combobox").selectOption(mode);
    if (mode === "GPS_AND_ARDUINO")
      await page
        .getByLabel("Khoảng cách xuất phát giữa hai người (giây)", {
          exact: true,
        })
        .fill("8");
    const response = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/v1/simulations" &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Bắt đầu mô phỏng", exact: true })
      .click();
    const res = await response;
    const job = await res.json();
    const entry = {
      mode,
      simulation_id: job.simulation_id,
      parameters: writes.at(-1)?.body,
      response: job,
    };
    ledger.jobs.push(entry);
    current = entry;
    await save("ledger", ledger);
    if (!res.ok() || job.already_running || !job.simulation_id)
      throw Error(
        "Submission failed or existing job returned: no further submissions",
      );
    await monitor(entry);
    if (entry.timedOut)
      throw Error(
        "Task job exceeded bound; retain evidence and review before stop",
      );
  }
} catch (e) {
  paused = false;
  ledger.error = String(e.message).replaceAll(key, "[REDACTED]");
  console.log(ledger.error);
  await shot("failure");
} finally {
  await save("ledger", ledger);
  await save("messages", messages);
  await save("browser", { errors, tiles, writes });
  await save("races-after", await read("/races"));
  await browser.close();
  console.log("Evidence saved " + out);
}
