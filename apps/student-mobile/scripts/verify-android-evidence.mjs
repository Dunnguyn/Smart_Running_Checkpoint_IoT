import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

// Assertions over captured native evidence, not a replacement for driving the UI.
const folder = "test-results/android";
const read = (name) =>
  JSON.parse(readFileSync(`${folder}/${name}-state.json`, "utf8"));
const record = (name, kind, student = "11223344") =>
  read(name).records.find((r) => r.key === `${kind}:mock:${student}`);
const tracking = (name) => record(name, "tracking");
const snapshot = (name) => record(name, "snapshot");
const run = (name) =>
  snapshot(name).runs.find((r) => r.id === tracking("active").runId);
const checks = [];
const check = (name, fn) => {
  fn();
  checks.push({ name, passed: true });
};
check("Registration assigns bib; check-in does not start a run", () => {
  const e = snapshot("checked-in").enrollments.find(
    (e) => e.raceId === "campus",
  );
  assert.equal(e.bib, "NR-0265");
  assert.ok(e.checkedInAt);
  assert.ok(!tracking("checked-in")?.runId);
  assert.equal(snapshot("checked-in").runs.length, 2);
});
check("OS GPS produced samples during active run", () => {
  assert.equal(tracking("active").capture, "RECORDING");
  assert.equal(tracking("active").sequence, 5);
  assert.equal(run("active").samples, 5);
});
for (const name of [
  "paused-after",
  "restored-paused",
  "restored-still-paused",
]) {
  check(`No new samples or distance: ${name}`, () => {
    assert.equal(tracking(name).capture, "PAUSED");
    for (const key of ["sequence", "distance", "segment", "lastTimestamp"])
      assert.equal(tracking(name)[key], tracking("paused-before")[key]);
    assert.equal(run(name).status, "PAUSED");
  });
}
check("Resume opens new segment without bridging pause", () => {
  assert.equal(tracking("resumed-first").segment, 2);
  assert.equal(tracking("resumed-first").sequence, 6);
  assert.equal(
    tracking("resumed-first").distance,
    tracking("paused-before").distance,
  );
  assert.ok(
    tracking("resumed-moving").distance > tracking("resumed-first").distance,
  );
  assert.deepEqual(run("resumed-moving").segments, [1, 2]);
});
check("Foreground-only configuration stops collecting on background", () => {
  assert.equal(tracking("background-stopped").capture, "ERROR");
  assert.equal(
    tracking("background-stopped").sequence,
    tracking("resumed-moving").sequence,
  );
  assert.equal(
    tracking("background-stopped").distance,
    tracking("resumed-moving").distance,
  );
});
check(
  "Early finish is ENDED; queue acknowledged; checkout preserves result",
  () => {
    assert.equal(run("finished").status, "ENDED");
    assert.equal(tracking("finished").capture, "STOPPED");
    assert.equal(tracking("finished").queued, 0);
    assert.deepEqual(run("finished"), run("checked-out"));
    assert.ok(
      snapshot("checked-out").enrollments.find((e) => e.raceId === "campus")
        .checkedOutAt,
    );
    assert.equal(run("finished").endedAt - run("finished").startedAt, 17832041);
  },
);
check(
  "Native SecureStore encrypted entry exists and is removed on logout",
  () => {
    assert.equal(read("logged-in").secureStore.authEntryPresent, true);
    assert.equal(read("logged-in").secureStore.ciphertextFieldPresent, true);
    assert.equal(
      read("logged-in").secureStore.plaintextMockTokenPresent,
      false,
    );
    assert.equal(read("logged-out").secureStore.authEntryPresent, false);
  },
);
check(
  "Second account has empty snapshot; first account result remains intact",
  () => {
    assert.deepEqual(record("account-two", "snapshot", "11223345").runs, []);
    assert.deepEqual(
      record("account-two", "snapshot", "11223345").enrollments,
      [],
    );
    assert.deepEqual(
      snapshot("account-two").runs,
      snapshot("checked-out").runs,
    );
    assert.equal(read("account-two").secureStore.authEntryPresent, true);
  },
);
const report = {
  verifiedAt: new Date().toISOString(),
  platform: "Android Emulator 17/API 37, Medium_Phone_API_37.0",
  backend: "mock",
  gps: "Expo Location / Android OS; route supplied through adb emu geo fix",
  backgroundEnabled: false,
  method:
    "ADB UI interactions + native screenshots + assertions over SQLite/SecureStore summaries",
  checks,
  notVerified: [
    "Real API",
    "Physical phone",
    "iOS",
    "Background-enabled GPS",
    "Google Maps SDK without key",
  ],
};
writeFileSync(`${folder}/report.json`, JSON.stringify(report, null, 2));
console.log(`${checks.length}/${checks.length} native evidence checks passed.`);
