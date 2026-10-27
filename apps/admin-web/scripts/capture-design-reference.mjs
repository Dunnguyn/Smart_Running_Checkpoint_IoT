import { createServer } from "node:http";
import { build } from "esbuild";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { normalize } from "node:path";
const ref = "E:/Hocccc/Project/Admin Dashboard for NEU RUN";
const out = "test-results/design-reference";
await mkdir(out, { recursive: true });
await build({
  stdin: {
    contents:
      (await readFile(ref + "/src/App.tsx", "utf8")) +
      '\nimport {createRoot} from "react-dom/client"; createRoot(document.getElementById("root")).render(<App/>);',
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  define: { "process.env.NODE_ENV": '"production"' },
  bundle: true,
  jsx: "automatic",
  outfile: out + "/app.js",
});
await writeFile(
  out + "/style.css",
  (await readFile(ref + "/src/index.css", "utf8")).replace(
    /@import\s+['"]tailwindcss['"];?/g,
    "",
  ),
);
await writeFile(
  out + "/index.html",
  '<!doctype html><html lang="vi"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="./style.css"><div id="root"></div><script src="./app.js"></script></html>',
);
const server = createServer(async (req, res) => {
  try {
    const requestPath = req.url === "/" ? "index.html" : req.url.slice(1);
    const path = normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "");
    if (path.startsWith("/") || path.startsWith("\\")) {
      res.statusCode = 400;
      res.end();
      return;
    }
    res.setHeader(
      "Content-Type",
      path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(await readFile(out + "/" + path));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on("pageerror", (e) => console.log(e.message));
  await page.goto("http://127.0.0.1:" + server.address().port + "/");
  await page.locator(".sidebar").waitFor();
  await page.screenshot({ path: out + "/overview-1440.png", fullPage: true });
  await page
    .getByRole("button", { name: "Bản đồ trực tiếp", exact: true })
    .click();
  await page.screenshot({ path: out + "/map-1440.png", fullPage: true });
} finally {
  await browser.close();
  server.close();
}
