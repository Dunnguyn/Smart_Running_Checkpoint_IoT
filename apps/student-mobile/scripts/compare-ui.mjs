import { readFile, writeFile } from "node:fs/promises";
const labels = {
  "login-390": "Đăng nhập",
  races: "Giải chạy",
  detail: "Chi tiết giải",
  map: "Bản đồ",
  "registration-confirm": "Xác nhận đăng ký",
  "registration-success": "Đăng ký thành công",
  checkin: "Check-in",
  "run-active": "Đang chạy",
  "run-paused": "Tạm dừng",
  "finish-confirm": "Kết thúc sớm",
  "result-pending": "Chờ xác nhận",
  "result-under": "Chưa đạt",
  stats: "Thống kê",
  history: "Lịch sử",
  profile: "Hồ sơ",
};
const pairs = [];
for (const [name, label] of Object.entries(labels)) {
  const reference = await readFile(`test-results/reference-ui/${name}.png`);
  const app = await readFile(`test-results/ui/${name}.png`);
  pairs.push(
    `<section id="${name}"><h2>${label}</h2><div class="pair"><figure><figcaption>Figma export · 390 × 844</figcaption><img alt="Thiết kế ${label}" src="data:image/png;base64,${reference.toString("base64")}"></figure><figure><figcaption>React Native Web · 390 × 844</figcaption><img alt="Triển khai ${label}" src="data:image/png;base64,${app.toString("base64")}"></figure></div></section>`,
  );
}
const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NEU RUN — Đối chiếu UI</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f2f7fc;color:#081b3a;font:15px/1.5 system-ui}header,section{max-width:850px;margin:0 auto 32px}h1{font-size:28px;margin:0}h2{margin-bottom:12px}.note{color:#4b5870}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}figcaption{margin-bottom:8px;font-size:12px;font-weight:700}img{display:block;width:100%;max-width:390px;border:1px solid #d8deea;border-radius:16px}nav{display:flex;gap:8px;flex-wrap:wrap}a{color:#12467f;background:white;padding:6px 10px;border-radius:99px;text-decoration:none}@media(max-width:600px){body{padding:12px}.pair{gap:10px}h1{font-size:22px}}@media print{section{break-inside:avoid}}</style><header><h1>NEU RUN · Đối chiếu giao diện</h1><p class="note">15 màn hình cùng kích thước tham chiếu. Bên phải là bản render React Native Web phục vụ QA; chưa phải ảnh từ Android/iOS thật. Dữ liệu, ngày, bib và số vòng là mock có trạng thái, nên khác giá trị hardcode của thiết kế. Banner GPS giả và thông báo đồng bộ là phần bổ sung nghiệp vụ. Bản đồ preview là sơ đồ tọa độ, không dùng hình minh họa làm tuyến thật.</p><nav>${Object.entries(
  labels,
)
  .map(([name, label]) => `<a href="#${name}">${label}</a>`)
  .join("")}</nav></header>${pairs.join("")}</html>`;
await writeFile("test-results/UI_COMPARISON.html", html);
console.log("Created test-results/UI_COMPARISON.html");
