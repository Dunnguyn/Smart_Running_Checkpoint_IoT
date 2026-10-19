import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const sdk =
  process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA, "Android", "Sdk");
const adb = join(sdk, "platform-tools", "adb.exe");
const serial = process.env.ANDROID_SERIAL || "emulator-5554";
if (!serial.startsWith("emulator-")) throw new Error("Emulator QA only.");
const name = process.argv[2] || "state";
if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid evidence name.");
const folder = `test-results/android/private-${name}`;
mkdirSync(folder, { recursive: true });
const run = (args, binary = false) =>
  execFileSync(adb, ["-s", serial, ...args], {
    encoding: binary ? undefined : "utf8",
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
const pkg = "vn.edu.neu.run.student";
const files = run(["shell", "run-as", pkg, "ls", "files/SQLite"]);
for (const suffix of ["", "-wal"]) {
  const filename = `neu-run-student.db${suffix}`;
  if (files.split(/\s+/).includes(filename))
    writeFileSync(
      join(folder, filename),
      run(["exec-out", "run-as", pkg, "cat", `files/SQLite/${filename}`], true),
    );
}
const db = new DatabaseSync(join(folder, "neu-run-student.db"));
const entries = db.prepare("SELECT key,value FROM kv").all();
const summary = {
  capturedAt: new Date().toISOString(),
  storage: "Android SQLite",
  records: [],
};
for (const { key, value } of entries) {
  const item = JSON.parse(value);
  if (key.startsWith("tracking:"))
    summary.records.push({
      key,
      runId: item.runId,
      capture: item.capture,
      sequence: item.sequence,
      segment: item.segment,
      distance: item.distance,
      queued: item.queue.length,
      queueIds: item.queue.map((sample) => sample.id),
      operationIds: item.operations.map((op) => op.id),
      operations: item.operations.map((o) => o.kind),
      rejected: item.rejected.length,
      lastTimestamp: item.lastFix?.timestamp,
      error: item.error,
    });
  if (key.startsWith("snapshot:"))
    summary.records.push({
      key,
      enrollments: item.enrollments.map((e) => ({
        raceId: e.raceId,
        bib: e.bib,
        checkedInAt: e.checkedInAt,
        checkedOutAt: e.checkedOutAt,
      })),
      runs: item.runs.map((r) => ({
        id: r.id,
        status: r.status,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        activeMs: r.activeMs,
        distance: r.distance,
        laps: r.laps.length,
        samples: r.samples.length,
        sampleIds: r.samples.map((s) => s.id),
        firstSampleAt: r.samples[0]?.timestamp,
        lastSampleAt: r.samples.at(-1)?.timestamp,
        segmentSummary: [...new Set(r.samples.map((s) => s.segment))].map(
          (segment) => {
            const samples = r.samples.filter((s) => s.segment === segment);
            return {
              segment,
              count: samples.length,
              first: samples[0]?.timestamp,
              last: samples.at(-1)?.timestamp,
            };
          },
        ),
        segments: [...new Set(r.samples.map((s) => s.segment))],
        samplesMarkedMocked: r.samples.filter((s) => s.simulated).length,
      })),
    });
}
db.close();
const prefs = run(["shell", "run-as", pkg, "ls", "shared_prefs"]);
if (prefs.split(/\s+/).includes("SecureStore.xml")) {
  const encrypted = run([
    "exec-out",
    "run-as",
    pkg,
    "cat",
    "shared_prefs/SecureStore.xml",
  ]);
  summary.secureStore = {
    exists: true,
    authEntryPresent: encrypted.includes("neu-run-auth"),
    plaintextMockTokenPresent: encrypted.includes("mock:"),
    ciphertextFieldPresent:
      encrypted.includes("ct&quot;") || encrypted.includes('"ct"'),
  };
}
// Keep raw mock database copies local/ignored; output only counts and states, no token/coordinates.
writeFileSync(
  `test-results/android/${name}-state.json`,
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
