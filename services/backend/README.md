# NEU Smart Running — Backend

**Phạm vi: chỉ backend web.** Dự án cung cấp REST API và WebSocket cho Admin Web, dùng **FastAPI**, **SQLAlchemy** và **SQL Server**; SQLite được chọn làm cấu hình mặc định để chạy thử nhanh nếu chưa cài SQL Server. Không xây frontend hoặc ứng dụng di động. Thư mục Python `app/` chỉ là tên package chứa mã backend và trình mô phỏng.

## Những gì đã có

- Quản lý giải chạy, sinh viên, đăng ký và checkpoint.
- Gán một wearable ID cho runner; một thiết bị đeo gửi GPS và snapshot bước chân trong cùng telemetry request.
- Dùng GPS outside-to-inside geofence tại checkpoint loại `LAP` để nhận diện runner đã đi qua và tự ghi lap hợp lệ.
- Kiểm tra tọa độ/thời điểm/bước tăng dần, chống gửi lặp và cộng khoảng cách Haversine.
- Có CLI mô phỏng tự tạo race/student/wearable/checkpoint/run, gửi GPS + bước chân theo tuyến mô phỏng đi qua geofence mà không cần sensor thật.
- Nhận sự kiện Arduino Gateway. Arduino không định danh người chạy, nên checkpoint event mặc định là `UNASSIGNED` và không cộng vòng.
- Nhận lap event chỉ từ nguồn có runner ID, kiểm tra giải, thời gian tối thiểu và sự kiện trùng.
- Kết thúc phiên, tra cứu overview/runners/live/history và phát cập nhật WebSocket sau khi lưu thành công.
- Phân quyền demo bằng ba API key riêng: Admin, Simulator, Gateway. Khóa cấu hình bằng biến môi trường.

> Đây là nền tảng MVP phục vụ liên kết FE/IoT và báo cáo tiến độ. Các quyết định nhóm còn phải chốt (cách xác thực tài khoản thật, quy tắc checkpoint/lap, SQL Server edition, chính sách GPS) được ghi trong tài liệu nguồn.

## Chạy nhanh trên Windows

1. Cài Python 3.11+ và tạo môi trường ảo trong thư mục dự án:

   ```powershell
   py -3.11 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   ```

2. Tạo cấu hình cục bộ từ mẫu và thay các khóa mặc định:

   ```powershell
   Copy-Item .env.example .env
   ```

   Để chạy thử không cần SQL Server, đặt `DATABASE_URL=sqlite:///./running_demo.db` trong `.env`. Để dùng SQL Server, tạo database `iot_running`, cài Microsoft ODBC Driver 18, rồi cấu hình chuỗi kết nối mẫu trong `.env`.

3. Khởi động web API:

   ```powershell
   uvicorn app.main:app --reload
   ```

4. Mở `http://127.0.0.1:8000/docs` để xem và gọi API, hoặc `http://127.0.0.1:8000/health` để xem trạng thái.

5. Mở cửa sổ PowerShell thứ hai, kích hoạt `.venv`, chạy mô phỏng. Lệnh này tự tạo race, student, wearable, checkpoint và run; sau đó đi qua vùng GPS geofence bằng các tọa độ giả lập và gửi bước chân từ cùng wearable:

   ```powershell
   .\.venv\Scripts\Activate.ps1
   python -m app.simulator
   ```

   Mặc định, mỗi lap cần khoảng 32 giây với `MIN_LAP_INTERVAL_SECONDS=30`. Để mô phỏng hai vòng, dùng `python -m app.simulator --laps 2`; dữ liệu GPS sẽ đi ra khỏi rồi quay vào vùng checkpoint lần nữa. Lap được tính từ GPS geofence, không cần gọi riêng API lap.

Các bảng demo được tạo tự động khi ứng dụng khởi động. Với dữ liệu cần bảo toàn hoặc triển khai production, hãy chuyển sang Alembic migration và không dùng `create_all` làm quy trình nâng cấp schema.

## Liên kết frontend

- REST base URL khi chạy local: `http://localhost:8000/api/v1`.
- Admin gửi `X-Admin-Key: <ADMIN_API_KEY>` trong request; đây là cơ chế khóa API tương đương cho demo, cần thay bằng đăng nhập/JWT phù hợp trước production.
- Tải snapshot lần đầu bằng `GET /races/{race_id}/live`, sau đó mở WebSocket `ws://localhost:8000/ws/v1/races/{race_id}/live?key=<ADMIN_API_KEY>`.
- URL WebSocket có query key để tương thích API WebSocket trình duyệt; chỉ dùng local/demo qua HTTPS/WSS ở môi trường thật và không ghi key vào mã frontend công khai.
- Ví dụ payload và các điểm nối trong mã được đánh dấu `[FE LINK]`, `[SIMULATOR LINK]`, `[GATEWAY LINK]` và `[DEVICE LINK]`.

## Liên kết Simulator / Arduino Gateway

Admin gán wearable cho runner qua `POST /api/v1/runner-devices`; Simulator tạo run kèm `wearable_device_id`, rồi wearable gửi cùng lúc GPS, `total_steps` và device ID tới `POST /api/v1/telemetry/gps`. Backend xác thực thiết bị được gán cho sinh viên, rồi dùng geofence checkpoint loại `LAP` để nhận diện runner đi qua.

Arduino không gọi HTTP trực tiếp: Gateway trên máy tính đọc USB Serial rồi gọi `POST /api/v1/checkpoint-events` với `X-Gateway-Key` và `student_id=null`. Sự kiện Arduino không được gán cho wearable runner và không tự tăng lap. 
## Tài liệu nhóm

- [Bảy sơ đồ UML yêu cầu](docs/UML_DIAGRAMS.md)
- Đặc tả nghiệp vụ/API: `Dac_ta_nghiep_vu_va_API_Backend_IoT_NEU_RUN.docx`
- Hướng dẫn phần cứng: `Smart_Running_Checkpoint_Station_Huong_Dan_Chi_Tiet.docx`

## Lưu ý vận hành

- `Base.metadata.create_all()` ở cuối `app/main.py` tạo bảng cho bản demo. Production nên dùng Alembic.
- WebSocket fan-out hiện ở bộ nhớ một tiến trình; nhiều worker/máy chủ cần Redis pub/sub.
- Các khóa API mẫu chỉ dành cho local. Không commit `.env` hoặc dùng khóa mẫu trên mạng công khai.
- Các chức năng chưa triển khai gồm Google Sheets, GPS phần cứng, nhận dạng runner tại Arduino và đăng nhập người dùng hoàn chỉnh; chúng nằm ngoài phạm vi backend MVP hoặc cần nhóm chốt thêm.
