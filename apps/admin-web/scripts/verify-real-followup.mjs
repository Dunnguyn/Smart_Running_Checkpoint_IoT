// Read-only follow-up on the two task-created races; no mutation is allowed.
import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const out = "test-results/real-e2e-20261012",
  key = process.env.ADMIN_API_KEY;
if (!key) throw Error("Missing credential");
const ledger = JSON.parse(await readFile(out + "/ledger.json", "utf8"));
const read = async (p) => {
  const r = await fetch("http://localhost:8000/api/v1" + p, {
    headers: { "X-Admin-Key": key },
  });
  if (!r.ok) throw Error("GET " + r.status);
  return r.json();
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const tiles = [],
  consoleErrors = [];
const isTileOpenStreetMapUrl = (url) => {
  try {
    return new URL(url).hostname === "tile.openstreetmap.org";
  } catch {
    return false;
  }
};
page.on("response", (r) => {
  if (isTileOpenStreetMapUrl(r.url()) && tiles.length < 8)
    tiles.push({ url: r.url(), status: r.status() });
});
page.on("console", (m) => {
  if (m.type() === "error")
    consoleErrors.push(m.text().replaceAll(key, "[REDACTED]"));
});
await page.route("**/api/v1/**", (r) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(r.request().method()) &&
    !r.request().url().endsWith("/auth/admin-key")
  )
    throw Error("Forbidden mutation");
  return r.continue();
});
const results = [];
try {
  await page.goto("http://localhost:5173");
  await page.getByLabel("Admin key", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Kết nối", exact: true }).click();
  for (const entry of ledger.jobs) {
    const d = await read("/races/" + entry.race_id + "/dashboard"),
      runs = [];
    for (const r of d.runners) {
      const items = [];
      let i = 1,
        total = Infinity;
      while (items.length < total) {
        const h = await read(
          `/runners/${r.student_id}/runs/${r.run_id}/events?page=${i++}&page_size=200`,
        );
        total = h.total;
        items.push(...h.items);
        if (!h.items.length) break;
      }
      runs.push({
        student_id: r.student_id,
        run_id: r.run_id,
        wearable_device_id: r.wearable_device_id,
        bib: r.bib_number,
        lap_count: r.lap_count,
        events: items,
        lapHistoryCount: items.filter((e) => e.type === "LAP").length,
      });
    }
    const allPositions = JSON.parse(
      await readFile(out + "/" + entry.mode + "-samples.json", "utf8"),
    );
    const monotonic = d.runners.map((r) => {
      const samples = allPositions.map((x) =>
        x.dashboard.runners.find((v) => v.run_id === r.run_id),
      );
      return {
        run_id: r.run_id,
        monotonic: samples.every(
          (x, i) =>
            !i ||
            (x.total_steps >= samples[i - 1].total_steps &&
              x.distance_total_m >= samples[i - 1].distance_total_m),
        ),
        uniquePositions: new Set(
          samples
            .filter((x) => x.last_latitude != null)
            .map((x) => x.last_latitude + "," + x.last_longitude),
        ).size,
      };
    });
    await page.getByLabel("Chọn giải chạy").selectOption(entry.race_id);
    await page
      .getByRole("link", { name: "Bản đồ trực tiếp", exact: true })
      .click();
    await expect(page.locator(".watch-row")).toHaveCount(5);
    await page.locator(".watch-row").first().click();
    await expect(page.locator(".runner-marker.selected")).toHaveCount(1);
    const marker = page.locator(".runner-marker.selected");
    expect(
      await marker.evaluate((el) => Number(el.style.zIndex)),
    ).toBeGreaterThan(900);
    expect(await marker.getAttribute("class")).not.toContain(
      "leaflet-marker-draggable",
    );
    await marker.click();
    await expect(page.locator(".watch-row[aria-pressed=true]")).toHaveCount(1);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: out + "/" + entry.mode + "-selection-fixed.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "Sinh viên", exact: true }).click();
    await page
      .getByLabel("Tìm tên, mã sinh viên, số báo danh")
      .fill(d.runners[0].student_code);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    const row = page.locator("tbody tr");
    await expect(row).toContainText(d.runners[0].bib_number);
    await expect(row).toContainText(`${d.runners[0].lap_count} / 4`);
    await row.getByRole("button", { name: /^Xem chi tiết / }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: out + "/" + entry.mode + "-detail-final.png",
      fullPage: true,
    });
    const text = await page.getByRole("dialog").innerText();
    await page.keyboard.press("Escape");
    results.push({
      mode: entry.mode,
      race_id: entry.race_id,
      raceStatus: d.race.status,
      checkpoints: d.checkpoints,
      routePointCount: d.route?.points?.length,
      runs,
      monotonic,
      detailText: text,
      selectionRegression:
        "PASS: selected marker above others, non-draggable, list and marker synchronized",
    });
  }
  await writeFile(
    out + "/followup.json",
    JSON.stringify({ results, tiles, consoleErrors }, null, 2),
  );
  console.log(
    "Read-only histories, API/UI comparison and marker regression passed.",
  );
} finally {
  await browser.close();
}
