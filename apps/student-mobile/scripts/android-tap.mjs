import { execFileSync } from "node:child_process";
import { join } from "node:path";
const adb = join(
  process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA, "Android/Sdk"),
  "platform-tools/adb.exe",
);
const serial = process.env.ANDROID_SERIAL || "emulator-5554";
if (!serial.startsWith("emulator-")) throw new Error("Emulator QA only");
const run = (...args) =>
  execFileSync(adb, ["-s", serial, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 20000,
  });
for (const label of process.argv.slice(2)) {
  const dump = run("shell", "uiautomator", "dump", "/sdcard/neu-run-tap.xml");
  if (!/UI hier(?:ar)?chary dumped|UI hierarchy dumped/.test(dump))
    throw new Error("No fresh idle hierarchy; inspect screenshot.");
  const xml = run("shell", "cat", "/sdcard/neu-run-tap.xml");
  const nodes = [...xml.matchAll(/<node\b[^>]+>/g)].map(([node]) => {
    const attr = (key) => new RegExp(`${key}="([^"]*)"`).exec(node)?.[1];
    return {
      text: attr("text"),
      label: attr("content-desc"),
      bounds: attr("bounds"),
      enabled: attr("enabled"),
      clickable: attr("clickable"),
    };
  });
  const node = nodes
    .sort(
      (a, b) => Number(b.clickable === "true") - Number(a.clickable === "true"),
    )
    .find(
      (n) =>
        (n.label === label || n.text === label) &&
        n.enabled !== "false" &&
        n.bounds,
    );
  if (!node) throw new Error(`Visible control not found: ${label}`);
  const [x1, y1, x2, y2] = node.bounds.match(/\d+/g).map(Number);
  if (x2 <= x1 || y2 <= y1) throw new Error(`Offscreen control: ${label}`);
  run(
    "shell",
    "input",
    "tap",
    String(Math.round((x1 + x2) / 2)),
    String(Math.round((y1 + y2) / 2)),
  );
  console.log(`Tapped ${label}`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
}
