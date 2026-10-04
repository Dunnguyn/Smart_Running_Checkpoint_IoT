# NEU Smart Running

Hệ thống quản lý giải chạy và theo dõi sinh viên NEU bằng GPS, wearable và checkpoint.

| Thành phần | Công nghệ / tài liệu |
| --- | --- |
| Admin Web | React, TypeScript, Vite, Leaflet — [hướng dẫn chạy và tích hợp](apps/admin-web/README.md) |
| Backend | FastAPI, SQLAlchemy, SQL Server hoặc SQLite demo — [hướng dẫn backend](services/backend/README.md) |
| Simulator | `python -m app.simulator --base-url http://localhost:8000 --laps 2` tại backend |
| Arduino / Gateway | Mã nguồn trong `arduino/` và `services/arduino-gateway/` |

Frontend mặc định kết nối API thật bằng Admin key nhập trong bộ nhớ phiên. Có thể đổi sang mock frontend để thử độc lập. Tổng quan, chọn giải, bảng runner, chi tiết GPS/LAP, bản đồ live và sự kiện checkpoint đã dùng REST/WebSocket; backend là nguồn kết quả vòng, cự ly và bước chân.

Chạy backend tại localhost:8000, frontend tại localhost:5173. Xem [README frontend](apps/admin-web/README.md) để cấu hình môi trường, CORS, khóa demo, chạy kiểm thử và biết contract/UI còn thiếu. Chưa có API đọc geometry tuyến/checkpoint; bản đồ API không trộn tuyến mock. Chưa có form tạo/sửa hoặc gán wearable. Không tự tạo dữ liệu khi mở dashboard.

Không commit `.env`, API key; không kết nối database trực tiếp từ frontend.
