import { existsSync, writeFileSync } from "node:fs";
const pairs = [
  ["run-paused", "recovery-paused", "Tạm dừng sau khôi phục"],
  ["run-active", "recovery-final-lap", "GPS Android / vòng cuối"],
  ["history", "complete-history", "Lịch sử có phiên đạt"],
  ["stats", "complete-stats", "Thống kê có kết quả mới"],
  ["profile", "demo-profile", "Hồ sơ trên APK độc lập"],
  ["login-390", "demo-login", "Đăng nhập trên APK độc lập"],
];
const solo = [
  "complete-result",
  "complete-checkout-ui",
  "small-stats",
  "small-history",
  "small-profile",
  "small-login-keyboard",
  "demo-cold-start",
  "demo-races",
];
const sections = pairs
  .filter(([, native]) => existsSync(`test-results/android/${native}.png`))
  .map(
    ([ref, native, label]) =>
      `<section><h2>${label}</h2><div class="pair"><figure><figcaption>Figma export · 390×844 CSS px</figcaption><img src="reference-ui/${ref}.png"></figure><figure><figcaption>Android native · kích thước gốc trong PNG</figcaption><img src="android/${native}.png"></figure></div></section>`,
  );
for (const name of solo)
  if (existsSync(`test-results/android/${name}.png`))
    sections.push(
      `<section><h2>${name}</h2><img class="single" src="android/${name}.png"></section>`,
    );
writeFileSync(
  "test-results/BACKGROUND_DEMO_UI.html",
  `<!doctype html><html lang="vi"><meta charset="utf-8"><title>NEU RUN GPS nền và APK demo</title><style>body{font:16px/1.5 system-ui;background:#f2f7fc;color:#081b3a;margin:24px}header,section{max-width:900px;margin:0 auto 40px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}img{width:100%;border:1px solid #d8deea}.single{max-width:420px}</style><header><h1>NEU RUN · Android native</h1><p>Ảnh ADB, backend mock và GPS hệ điều hành Emulator. Figma giữ nguyên. Khác kích thước/mật độ/font scale và dữ liệu có trạng thái nên không khẳng định pixel-perfect. Bản đồ là sơ đồ thay thế có nhãn do thiếu Maps key. Ảnh có bánh răng là development build; ảnh demo là release nhúng bundle.</p></header>${sections.join("")}</html>`,
);
console.log(
  `Gallery: ${sections.length} sections; only existing captures included.`,
);
