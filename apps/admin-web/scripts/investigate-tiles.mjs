import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const results = [];
for (const sub of ["a", "b", "c"]) {
  const url = `https://${sub}.tile.openstreetmap.org/0/0/0.png`;
  const failures = [];
  const listener = (req) => failures.push(req.failure()?.errorText);
  page.on("requestfailed", listener);
  try {
    const response = await page.goto(url, {
      waitUntil: "load",
      timeout: 10000,
    });
    results.push({
      url,
      status: response?.status(),
      contentType: response?.headers()["content-type"],
      failures,
    });
  } catch {
    results.push({ url, status: null, failures });
  }
  page.off("requestfailed", listener);
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
await writeFile(
  "test-results/tile-investigation.json",
  JSON.stringify(results, null, 2),
);
