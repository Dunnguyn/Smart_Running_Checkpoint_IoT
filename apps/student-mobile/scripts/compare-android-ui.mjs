import { readFile, writeFile } from "node:fs/promises";
const pairs = [
  ["login-390", "login", "Đăng nhập"],
  ["races", "races", "Giải chạy"],
  ["detail", "detail", "Chi tiết giải"],
  ["map", "map", "Sơ đồ tuyến (chưa có Maps key)"],
  ["registration-confirm", "registration-confirm", "Xác nhận đăng ký"],
  ["registration-success", "registration-success", "Số báo danh"],
  ["checkin", "checkin", "Check-in"],
  ["run-active", "run-active", "Đang chạy"],
  ["run-paused", "run-paused", "Tạm dừng"],
  ["finish-confirm", "finish-confirm", "Kết thúc sớm"],
  ["result-under", "result", "Kết quả chưa đạt"],
  ["history", "history", "Lịch sử"],
  ["stats", "stats", "Thống kê"],
  ["profile", "profile", "Hồ sơ"],
];
const sections = [];
for (const [ref, native, title] of pairs) {
  const reference = await readFile(`test-results/reference-ui/${ref}.png`);
  const actual = await readFile(`test-results/android/native-${native}.png`);
  sections.push(
    `<section><h2>${title}</h2><div class="pair"><figure><figcaption>Figma export · 390×844 CSS px</figcaption><img alt="Figma ${title}" src="data:image/png;base64,${reference.toString("base64")}"></figure><figure><figcaption>Android native · 1080×2400 px / density 420</figcaption><img alt="Android ${title}" src="data:image/png;base64,${actual.toString("base64")}"></figure></div></section>`,
  );
}
await writeFile(
  "test-results/ANDROID_UI_COMPARISON.html",
  `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEU RUN — Android / Figma</title><style>body{font:15px/1.6 system-ui;background:#f2f7fc;color:#081b3a;margin:24px}header,section{max-width:850px;margin:0 auto 36px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}img{width:100%;border:1px solid #dde3eb;border-radius:14px}figcaption{font-size:12px;margin-bottom:8px}@media print{section{break-inside:avoid}}</style><header><h1>NEU RUN · Android native / Figma</h1><p>17/10/2026 · ${pairs.length} cặp ảnh. Backend mock, GPS Android Emulator. Ảnh native chụp bằng ADB; không phải web preview. Hai kích thước/tỷ lệ màn hình khác nhau nên đây là đối chiếu bố cục, không phải phép đo pixel-perfect.</p><p>Logo, Inter, palette xanh, card, nút pill và bố cục giữ theo thiết kế. Native dùng status bar và thanh điều hướng hệ điều hành. Nút bánh răng nổi là Expo development tools. Banner môi trường, ngày/bib/kết quả có trạng thái, sơ đồ tọa độ và thông báo đồng bộ là khác biệt có chủ đích. Nội dung dài cuộn bên dưới thanh tab cố định; ảnh chụp không chứa toàn bộ trang.</p></header>${sections.join("")}</html>`,
);
console.log(`Created Android/Figma comparison with ${pairs.length} pairs.`);
