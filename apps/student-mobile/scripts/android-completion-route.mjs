import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { demoRoute } from "../src/services/fixtures.ts";

// Prerequisite: use UI to register/check in/start/resume a mock run on Android.
// Only sends OS GNSS fixes and lifecycle inputs; never writes app/SQLite state.
const serial = process.env.ANDROID_SERIAL || "emulator-5554";
if (!serial.startsWith("emulator-")) throw new Error("Emulator only");
const adb = join(
  process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA, "Android/Sdk"),
  "platform-tools/adb.exe",
);
const run = (...args) =>
  execFileSync(adb, ["-s", serial, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
  });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeline = [];
const mark = (phase) => {
  timeline.push({ phase, at: Date.now() });
  writeFileSync(
    "test-results/android/completion-timeline.json",
    JSON.stringify(timeline, null, 2),
  );
  console.log(phase);
};
function state(name) {
  execFileSync(process.execPath, ["scripts/android-state.mjs", name], {
    windowsHide: true,
    stdio: "pipe",
  });
  return JSON.parse(
    readFileSync(`test-results/android/${name}-state.json`, "utf8"),
  );
}
const before = state("complete-before");
const active = before.records.find(
  (r) =>
    r.key.startsWith("tracking:") &&
    ["RECORDING", "ACQUIRING"].includes(r.capture),
);
if (!active)
  throw new Error("Start/resume through app UI before playing this route.");
mark("foreground-start");
for (let i = 0; i <= 128; i++) {
  if (i === 33) {
    state("complete-lap-one");
    run("shell", "input", "keyevent", "3");
    mark("home-start");
  }
  if (i === 65) {
    state("complete-home");
    run("shell", "input", "keyevent", "223");
    mark("locked-start");
  }
  if (i === 97) {
    state("complete-locked");
    run("shell", "input", "keyevent", "224");
    run("shell", "wm", "dismiss-keyguard");
    run("shell", "am", "start", "-n", "vn.edu.neu.run.student/.MainActivity");
    mark("foreground-return");
  }
  const step = i % 32,
    edge = Math.floor(step / 8),
    t = (step % 8) / 8;
  const from = demoRoute[edge],
    to = demoRoute[edge + 1];
  run(
    "emu",
    "geo",
    "fix",
    String(from.longitude + (to.longitude - from.longitude) * t),
    String(from.latitude + (to.latitude - from.latitude) * t),
  );
  if (i % 8 === 0) console.log(`OS route step ${i}/128`);
  await pause(4000);
}
await pause(6000);
const after = state("complete-terminal");
mark("route-end");
const result = after.records
  .flatMap((r) => r.runs || [])
  .find((r) => r.id === active.runId);
if (result?.status !== "COMPLETED" || result.laps !== 4)
  throw new Error(
    `Mock result not completed: ${result?.status}, laps=${result?.laps}. Inspect evidence; do not force status.`,
  );
console.log(
  JSON.stringify({
    status: result.status,
    laps: result.laps,
    samples: result.samples,
    segments: result.segments,
    distance: result.distance,
  }),
);
