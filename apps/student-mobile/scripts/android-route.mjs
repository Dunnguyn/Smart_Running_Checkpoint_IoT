import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { demoRoute } from "../src/services/fixtures.ts";

// Sends positions through the Android Emulator's GNSS provider. Does not use DemoGps.
const sdk =
  process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA, "Android", "Sdk");
const adb = join(sdk, "platform-tools", "adb.exe");
const serial = process.env.ANDROID_SERIAL || "emulator-5554";
if (!serial.startsWith("emulator-")) throw new Error("Emulator required.");
const count = Number(process.argv[2] || 33);
const interval = Number(process.argv[3] || 4000);
const offset = Number(process.argv[4] || 0);
if (
  !Number.isInteger(count) ||
  count < 1 ||
  count > 160 ||
  interval < 1000 ||
  !Number.isInteger(offset) ||
  offset < 0
)
  throw new Error(
    "Usage: node scripts/android-route.mjs [count 1..160] [intervalMs >=1000] [startStep >=0]",
  );
for (let i = 0; i < count; i++) {
  const step = (offset + i) % 32;
  const edge = Math.floor(step / 8),
    t = (step % 8) / 8;
  const from = demoRoute[edge],
    to = demoRoute[edge + 1];
  const latitude = from.latitude + (to.latitude - from.latitude) * t;
  const longitude = from.longitude + (to.longitude - from.longitude) * t;
  execFileSync(
    adb,
    ["-s", serial, "emu", "geo", "fix", String(longitude), String(latitude)],
    {
      windowsHide: true,
      encoding: "utf8",
      timeout: 10000,
    },
  );
  console.log(`Android Emulator GPS: step ${offset + i}`);
  if (i + 1 < count)
    await new Promise((resolve) => setTimeout(resolve, interval));
}
