# Ứng dụng Internet of Things tại Đại học Kinh tế Quốc dân: Hệ thống ghi nhận thông tin sinh viên tham gia giải chạy bộ

Dự án nhằm ghi nhận và quản lý thông tin sinh viên tham gia giải chạy bộ thông qua công nghệ IoT.

## Các thư mục

- **apps/admin-web/**: Web quản trị, dự kiến dùng React + Vite + TypeScript.
  - **public/**: Tài nguyên tĩnh công khai.
  - **src/app/**: Tổ chức ứng dụng.
  - **src/assets/**: Tài nguyên của ứng dụng.
  - **src/components/**: Thành phần giao diện dùng chung.
  - **src/features/**: Các mô-đun dashboard (tổng quan), live-map (bản đồ trực tiếp), runners (người chạy), races (giải chạy), checkpoints (điểm ghi nhận).
  - **src/hooks/**: Các hook dùng chung.
  - **src/layouts/**: Bố cục giao diện.
  - **src/services/**: Kết nối và tương tác với dịch vụ.
  - **src/types/**: Kiểu dữ liệu TypeScript.
  - **src/utils/**: Tiện ích dùng chung.
- **services/backend/app/**: Backend dự kiến dùng Python + FastAPI, kết nối Microsoft SQL Server.
  - **api/**: Các điểm truy cập API.
  - **core/**: Thành phần nền tảng của backend.
  - **models/**: Mô hình dữ liệu.
  - **schemas/**: Cấu trúc dữ liệu đầu vào và đầu ra.
  - **services/**: Xử lý nghiệp vụ.
  - **repositories/**: Truy cập dữ liệu.
- **services/arduino-gateway/**: Cầu nối Arduino và backend, dự kiến dùng Python + pySerial.
  - **src/**: Mã nguồn gateway.
  - **tests/**: Kiểm thử gateway.
- **arduino/checkpoint/**: Chương trình C/C++ cho Arduino UNO tại điểm ghi nhận.
- **docs/requirements/**: Tài liệu yêu cầu.
