import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sdk =
  process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA, "Android", "Sdk");
const adb = join(sdk, "platform-tools", "adb.exe");
const serial = process.env.ANDROID_SERIAL || "emulator-5554";
if (!serial.startsWith("emulator-"))
  throw new Error("This QA helper targets an Emulator only.");
const name = process.argv[2] || "screen";
if (!/^[a-z0-9-]+$/.test(name))
  throw new Error("Use a simple screenshot name.");
const output = "test-results/android";
mkdirSync(output, { recursive: true });
await new Promise((resolve) => setTimeout(resolve, 1000));
const run = (args, binary = false) =>
  execFileSync(adb, ["-s", serial, ...args], {
    encoding: binary ? undefined : "utf8",
    windowsHide: true,
    timeout: 20000,
    maxBuffer: 32 * 1024 * 1024,
  });
const dump = process.argv.includes("--image-only")
  ? ""
  : run(["shell", "uiautomator", "dump", "/sdcard/neu-run-ui.xml"]);
// A live timer may prevent UiAutomator reaching idle. Never reuse an old tree.
const xml =
  dump.includes("UI hierchary dumped") || dump.includes("UI hierarchy dumped")
    ? run(["shell", "cat", "/sdcard/neu-run-ui.xml"])
    : "";
if (!xml)
  console.log("No fresh UI hierarchy; inspect the current screenshot instead.");
writeFileSync(`${output}/${name}.xml`, xml);
writeFileSync(
  `${output}/${name}.png`,
  run(["exec-out", "screencap", "-p"], true),
);
// Accessibility text and bounds only; never dump app private storage or tokens.
for (const match of xml.matchAll(/<node\b[^>]+>/g)) {
  const attr = (key) =>
    new RegExp(`${key}="([^"]*)"`).exec(match[0])?.[1] || "";
  if (attr("text") || attr("content-desc"))
    console.log(
      JSON.stringify({
        text: attr("password") === "true" ? "[password field]" : attr("text"),
        label: attr("content-desc"),
        bounds: attr("bounds"),
        clickable: attr("clickable"),
      }),
    );
}
console.log(`Saved ${output}/${name}.png`);
