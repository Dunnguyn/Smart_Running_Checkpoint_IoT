# NEU RUN — Hệ thống ghi nhận sinh viên tham gia giải chạy bộ

Dự án ứng dụng Internet of Things (IoT) trong việc ghi nhận và quản lý thông tin sinh viên tham gia giải chạy bộ tại Đại học Kinh tế Quốc dân. Hệ thống hướng tới kết nối các thiết bị tại checkpoint với nền tảng quản lý tập trung, giúp ban tổ chức theo dõi quá trình tham gia và tổng hợp kết quả chạy.

## Mục tiêu

- Ghi nhận thông tin sinh viên khi đi qua các checkpoint trên tuyến chạy.
- Quản lý giải chạy, người tham gia và các điểm ghi nhận.
- Theo dõi tiến độ, số vòng, quãng đường và thời gian chạy.
- Hiển thị thông tin trên giao diện quản trị với bảng dữ liệu và bản đồ.

## Kiến trúc hệ thống

Luồng dữ liệu dự kiến:

```text
Thiết bị checkpoint → Arduino Gateway → Backend & cơ sở dữ liệu → Web quản trị
```

| Thành phần | Vai trò | Công nghệ |
| --- | --- | --- |
| Web quản trị | Hiển thị tổng quan, quản lý giải chạy, sinh viên và checkpoint | React, Vite, TypeScript, Leaflet |
| Backend | Tiếp nhận dữ liệu, xử lý nghiệp vụ và cung cấp API | Dự kiến Python, FastAPI |
| Cơ sở dữ liệu | Lưu trữ thông tin giải chạy, sinh viên và các lần ghi nhận | Dự kiến Microsoft SQL Server |
| Arduino Gateway | Chuyển tiếp dữ liệu từ Arduino đến backend | Dự kiến Python, pySerial |
| Thiết bị checkpoint | Ghi nhận dữ liệu tại các điểm trên tuyến chạy | Dự kiến Arduino UNO, C/C++ |

## Phạm vi hiện tại

Web quản trị đã có giao diện và dữ liệu mô phỏng, có thể chạy độc lập để trải nghiệm các chức năng:

- **Tổng quan:** thông tin giải chạy, các chỉ số và danh sách theo dõi.
- **Bản đồ trực tiếp:** hiển thị tuyến chạy, checkpoint và vị trí mô phỏng của người tham gia.
- **Sinh viên:** tìm kiếm, lọc danh sách và xem chi tiết phiên chạy.
- **Giải chạy:** danh sách và thông tin từng giải.
- **Checkpoint:** thông tin điểm ghi nhận và các sự kiện liên quan.
- **Mô phỏng:** bắt đầu, tạm dừng và đặt lại quá trình chạy.

Backend, gateway và chương trình Arduino hiện có cấu trúc thư mục ban đầu. Luồng kết nối thiết bị và xử lý dữ liệu thực tế thuộc giai đoạn phát triển tiếp theo.

## Cấu trúc dự án

```text
Smart_Running_Checkpoint_IoT/
├── apps/
│   └── admin-web/           # Ứng dụng web quản trị
├── services/
│   ├── backend/             # API và xử lý nghiệp vụ
│   └── arduino-gateway/     # Cầu nối Arduino và backend
├── arduino/
│   └── checkpoint/          # Chương trình thiết bị checkpoint
├── docs/
│   └── requirements/        # Tài liệu yêu cầu hệ thống
└── README.md
```

