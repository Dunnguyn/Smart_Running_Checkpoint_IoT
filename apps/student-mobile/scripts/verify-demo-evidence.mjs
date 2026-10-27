import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const text = (path) => readFileSync(path, "utf8");
const json = (path) => JSON.parse(text(path));
const folder = "test-results/demo";
const build = json(`${folder}/build.json`);
const environment = json(`${folder}/acceptance-environment.json`);
const sha256 = createHash("sha256")
  .update(readFileSync(build.apk))
  .digest("hex");
assert.equal(sha256, build.sha256.toLowerCase());
assert.ok(text(`${folder}/installed-sha256.txt`).startsWith(sha256));
assert.ok(!text(`${folder}/installed-package.txt`).includes("DEBUGGABLE"));
assert.equal(environment.metro8087Listening, false);
assert.equal(environment.adbReverse, "");
const ui = (name) => text(`test-results/android/${name}.xml`);
assert.ok(
  ui("demo-wrong-password").includes(
    "Mã sinh viên hoặc mật khẩu chưa chính xác.",
  ),
);
assert.ok(ui("demo-profile").includes("11223345"));
assert.ok(
  ui("demo-history").includes("4/4") &&
    ui("demo-history").includes("Đạt mục tiêu"),
);
assert.ok(
  ui("demo-cold-start").includes("Hoàng Nam") &&
    ui("demo-cold-start").includes("Đã đăng ký"),
);
assert.ok(ui("demo-detail").includes("Chi tiết giải"));
const report = {
  verifiedAt: new Date().toISOString(),
  method:
    "Artifact/hash and captured native UI evidence assertions; not another E2E session",
  variant: build.variant,
  architectures: build.architectures,
  sha256,
  metroRequired: false,
  ...environment,
  observed: [
    "wrong mock password error",
    "mock login and races",
    "race detail",
    "persisted 4/4 history",
    "profile account",
    "cold launch restores authenticated UI",
  ],
  limits: [
    "OS GPS completion/background measured on matching-source development build",
    "release smoke acceptance only; full GPS route not repeated on release",
    "no physical phone, iOS or real API",
  ],
};
writeFileSync(`${folder}/acceptance.json`, JSON.stringify(report, null, 2));
console.log(
  "Release APK evidence matches installed artifact; standalone smoke acceptance verified.",
);
