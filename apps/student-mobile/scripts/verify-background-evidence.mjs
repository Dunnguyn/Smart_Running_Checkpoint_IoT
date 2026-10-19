import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
const folder = "test-results/android";
const read = (name) =>
  JSON.parse(readFileSync(`${folder}/${name}-state.json`, "utf8"));
const rec = (name, kind) =>
  read(name).records.find((r) => r.key === `${kind}:mock:11223345`);
const track = (name) => rec(name, "tracking");
const runId = track("recovery-before").runId;
const run = (name) => rec(name, "snapshot").runs.find((r) => r.id === runId);
const checks = [];
const check = (name, fn) => {
  fn();
  checks.push({ name, passed: true });
};
check("Pause persists without samples during Home/GPS movement/reopen", () => {
  const before = track("bg-paused-before");
  for (const name of ["bg-paused-home", "bg-paused-restored"]) {
    assert.equal(track(name).capture, "PAUSED");
    for (const key of ["sequence", "distance", "segment"])
      assert.equal(track(name)[key], before[key]);
  }
});
check("Resume inside checkpoint opens new segment, no automatic lap", () => {
  assert.equal(
    track("bg-resume-inside").segment,
    track("bg-paused-before").segment + 1,
  );
  assert.equal(
    track("bg-resume-inside").distance,
    track("bg-paused-before").distance,
  );
  assert.equal(run("bg-standing").laps, 0);
  assert.equal(run("recovery-fg").laps, run("recovery-before").laps);
});
for (const [before, after, label] of [
  ["recovery-fg", "recovery-home", "Home"],
  ["recovery-home", "recovery-locked", "Locked"],
]) {
  check(
    `${label}: durable OS samples increase and receive mock ACK in background`,
    () => {
      assert.equal(track(after).capture, "RECORDING");
      assert.ok(track(after).sequence > track(before).sequence);
      assert.ok(run(after).samples > run(before).samples);
      assert.ok(run(after).lastSampleAt > run(before).lastSampleAt);
      assert.equal(track(after).queued, 0);
    },
  );
}
check("Mock confirms 4 laps; collector stopped and queue acknowledged", () => {
  assert.equal(run("recovery-terminal").status, "COMPLETED");
  assert.equal(run("recovery-terminal").laps, 4);
  assert.equal(track("recovery-terminal").capture, "STOPPED");
  assert.equal(track("recovery-terminal").queued, 0);
  const samples = run("recovery-terminal").sampleIds;
  assert.equal(new Set(samples).size, samples.length);
});
for (const name of [
  "complete-after-terminal",
  "complete-reopened",
  "complete-checkout",
]) {
  check(`${name}: immutable terminal samples/laps/time`, () => {
    assert.deepEqual(run(name), run("recovery-terminal"));
    assert.equal(track(name).sequence, track("recovery-terminal").sequence);
    assert.equal(track(name).capture, "STOPPED");
  });
}
check("Check-out recorded separately from running result", () => {
  assert.ok(
    rec("complete-checkout", "snapshot").enrollments.find(
      (e) => e.raceId === "campus",
    ).checkedOutAt,
  );
});
const timeline = JSON.parse(
  readFileSync(`${folder}/recovery-timeline.json`, "utf8"),
);
const at = (phase) => timeline.find((t) => t.phase === phase).at;
const report = {
  verifiedAt: new Date().toISOString(),
  method: "Assertions over captured SQLite evidence, not additional E2E runs",
  backend: "mock",
  gps: "Android OS via adb emu geo fix",
  backgroundEnabled: true,
  durationsMs: {
    home: at("lock-start") - at("home-start"),
    locked: at("foreground-return") - at("lock-start"),
    recoveryRoute: at("route-end") - at("foreground-start"),
  },
  result: run("recovery-terminal"),
  checks,
};
writeFileSync(
  `${folder}/background-report.json`,
  JSON.stringify(report, null, 2),
);
console.log(
  `${checks.length} snapshot assertions passed (separate from unit tests and E2E sessions).`,
);
