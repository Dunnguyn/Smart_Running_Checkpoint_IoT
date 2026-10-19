import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const out = "test-results/design-audit-20261015/reference";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:5180");
  await page.locator(".sidebar").waitFor();
  const screens = [["overview", "Tổng quan"], ["analytics", "Phân tích"], ["live", "Bản đồ trực tiếp"], ["races", "Giải chạy"], ["students", "Sinh viên"], ["checkpoints", "Trạm kiểm soát"], ["setup", "Thiết lập giải"], ["simulation", "Mô phỏng"]];
  const metrics = {};
  for (const [name, label] of screens) {
    await page.locator(".sidebar").getByRole("button", { name: new RegExp("^" + label) }).click();
    await page.screenshot({ path: `${out}/${name}-1440.png`, fullPage: true });
    metrics[name] = await page.locator(".sidebar,.topbar,.content,.card,.page-heading,.tabs,.button,table,.overview-hero").evaluateAll(nodes => nodes.slice(0, 35).map(n => {
      const s = getComputedStyle(n), r = n.getBoundingClientRect();
      return { selector: n.className, x:r.x,y:r.y,width:r.width,height:r.height,font:s.font,padding:s.padding,gap:s.gap,borderRadius:s.borderRadius,background:s.backgroundColor };
    }));
    if (name === "races") {
      await page.getByRole("button", { name: "Tạo giải", exact: true }).click();
      await page.screenshot({ path: `${out}/create-race-1440.png`, fullPage: true });
      await page.getByRole("button", { name: "Đóng", exact: true }).click();
    }
    if (name === "students") {
      await page.getByRole("button", { name: "Xem hồ sơ", exact: true }).first().click();
      await page.screenshot({ path: `${out}/drawer-1440.png`, fullPage: true });
      await page.getByRole("button", { name: "Đóng", exact: true }).click();
    }
  }
  for (const [width,height] of [[1366,768],[768,1024],[390,844]]) {
    await page.setViewportSize({width:1440,height:900});
    await page.locator(".sidebar").getByRole("button", {name:"Tổng quan",exact:true}).click();
    await page.setViewportSize({width,height});
    await page.screenshot({path:`${out}/overview-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole("button", {name:"Quản trị",exact:true}).click();
  await page.getByRole("button", {name:"Khóa phiên quản trị",exact:true}).click();
  await page.screenshot({path:`${out}/auth-1440.png`,fullPage:true});
  await writeFile(`${out}/metrics.json`, JSON.stringify(metrics,null,2));
} finally { await browser.close(); }
