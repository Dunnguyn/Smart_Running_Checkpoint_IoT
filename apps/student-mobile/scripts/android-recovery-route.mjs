import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { demoRoute } from "../src/services/fixtures.ts";

// Continue an interrupted run using only Android GNSS inputs, never mutate results.
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
    timeout: 20000,
  });
const timeline = [];
function mark(phase) {
  timeline.push({ phase, at: Date.now() });
  writeFileSync(
    "test-results/android/recovery-timeline.json",
    JSON.stringify(timeline, null, 2),
  );
  console.log(phase);
}
function state(name) {
  execFileSync(process.execPath, ["scripts/android-state.mjs", name], {
    windowsHide: true,
    stdio: "pipe",
  });
  return JSON.parse(
    readFileSync(`test-results/android/${name}-state.json`, "utf8"),
  );
}
const before = state("recovery-before");
const active = before.records.find(
  (r) =>
    r.key.startsWith("tracking:") &&
    ["RECORDING", "ACQUIRING"].includes(r.capture),
);
if (!active) throw new Error("Resume through UI first");
mark("foreground-start");
for (let i = 0; i <= 64; i++) {
  if (i === 1) {
    state("recovery-fg");
    run("shell", "input", "keyevent", "3");
    mark("home-start");
  }
  if (i === 17) {
    state("recovery-home");
    run("shell", "input", "keyevent", "223");
    mark("lock-start");
  }
  if (i === 33) {
    state("recovery-locked");
    run("shell", "input", "keyevent", "224");
    run("shell", "wm", "dismiss-keyguard");
    run("shell", "am", "start", "-n", "vn.edu.neu.run.student/.MainActivity");
    mark("foreground-return");
  }
  const step = i % 32,
    edge = Math.floor(step / 8),
    t = (step % 8) / 8;
  const a = demoRoute[edge],
    b = demoRoute[edge + 1];
  run(
    "emu",
    "geo",
    "fix",
    String(a.longitude + (b.longitude - a.longitude) * t),
    String(a.latitude + (b.latitude - a.latitude) * t),
  );
  if (i % 8 === 0) console.log(`OS GPS step ${i}/64`);
  await new Promise((resolve) => setTimeout(resolve, 4000));
}
const after = state("recovery-terminal");
mark("route-end");
const result = after.records
  .flatMap((r) => r.runs || [])
  .find((r) => r.id === active.runId);
if (result?.status !== "COMPLETED" || result.laps !== 4)
  throw new Error(`Not completed: ${result?.status}/${result?.laps}`);
console.log(
  JSON.stringify({
    status: result.status,
    laps: result.laps,
    samples: result.samples,
    segments: result.segments,
  }),
);
