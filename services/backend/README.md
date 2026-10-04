# NEU Smart Running — Backend

**Phạm vi: chỉ backend web.** Dự án cung cấp REST API và WebSocket cho Admin Web, dùng **FastAPI**, **SQLAlchemy** và **SQL Server**; SQLite được chọn làm cấu hình mặc định để chạy thử nhanh nếu chưa cài SQL Server. Không xây frontend hoặc ứng dụng di động. Thư mục Python `app/` chỉ là tên package chứa mã backend và trình mô phỏng.

## Những gì đã có

- Quản lý giải chạy, sinh viên, đăng ký và checkpoint.
- Gán một wearable ID cho runner; một thiết bị đeo gửi GPS và snapshot bước chân trong cùng telemetry request.
- Hỗ trợ hai chế độ theo race: `GPS_ONLY` giữ hành vi geofence cũ; `GPS_AND_ARDUINO` ghép GPS passage với sự kiện Arduino theo thời gian.
- Chế độ kết hợp lưu `UNKNOWN/OUTSIDE/INSIDE` bền vững, chỉ tạo passage khi đi từ ngoài bán kính 15 m vào trong 10 m; mất mẫu quá 5 giây sẽ khởi tạo lại trạng thái.
- Arduino event được xác thực và ghép sau cửa sổ thời gian; một ứng viên có thể ghép tự động, nhiều ứng viên chuyển `AMBIGUOUS` để Admin xác nhận, không tự chọn người gần nhất.
- Khi runner đạt `total_laps`, phiên tự chuyển `COMPLETED`, chốt thời gian và dừng bộ đếm. Race chuyển `COMPLETED` khi mọi participant đã hoàn tất.
- Kiểm tra tọa độ/thời điểm/bước tăng dần, chống gửi lặp và cộng khoảng cách Haversine.
- CLI mặc định tạo 20 sinh viên mô phỏng, gán bib `01`–`20`, tạo wearable và phiên chạy, rồi phát GPS + bước chân giả lập.
- CLI cũng mô phỏng được Gateway Arduino ở chế độ ghép; dữ liệu giả được ghi rõ nguồn, không chứng minh danh tính người thật trước cảm biến.
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

5. Mở cửa sổ PowerShell thứ hai, kích hoạt `.venv`, chạy mô phỏng. Mặc định lệnh tạo 20 sinh viên có số hiển thị `01`–`20`, mỗi người có wearable và run, rồi phát GPS/bước chân giả lập:

   ```powershell
   .\.venv\Scripts\Activate.ps1
   python -m app.simulator
   ```

   Mặc định mô phỏng một lap và các run tự chuyển `COMPLETED` khi đạt đích; thời gian không tiếp tục tăng. Đổi số người/vòng với `--students 20 --laps 2`. Chế độ GPS-only cần khoảng 35 giây cho vòng đầu khi ngưỡng tối thiểu là 30 giây.

   Để chạy quy tắc Arduino + GPS trong tài liệu mới, dùng:

   ```powershell
   python -m app.simulator --mode GPS_AND_ARDUINO --students 20 --laps 1
   ```

   Chế độ kết hợp tạo các lượt qua checkpoint cách nhau để minh họa ghép GPS với Arduino; 20 lượt mất khoảng ba phút do thời gian vòng và cửa sổ ghép. Mở race dashboard sau khi chương trình báo hoàn tất.

Các bảng demo được tạo tự động khi ứng dụng khởi động. Với dữ liệu cần bảo toàn hoặc triển khai production, hãy chuyển sang Alembic migration và không dùng `create_all` làm quy trình nâng cấp schema.

## Liên kết frontend

- REST base URL khi chạy local: `http://localhost:8000/api/v1`.
- Admin gửi `X-Admin-Key: <ADMIN_API_KEY>` trong request; đây là cơ chế khóa API tương đương cho demo, cần thay bằng đăng nhập/JWT phù hợp trước production.
- Màn hình nhập khóa gọi `POST /api/v1/auth/admin-key` kèm `X-Admin-Key`; `200` cho phép mở Admin Web, `401` giữ người dùng ở màn hình nhập. API không khóa tài khoản/key sau số lần sai, theo yêu cầu demo.
- Số `01`–`20` là bib/display ID của participant; UUID `student_id` vẫn là khóa liên kết ổn định trong API.
- Dashboard tổng hợp dùng `GET /api/v1/races/{race_id}/dashboard`; trả summary, bảng runners, top runners và checkpoint events mới nhất.
- Tải snapshot lần đầu bằng `GET /races/{race_id}/live`, sau đó mở WebSocket `ws://localhost:8000/ws/v1/races/{race_id}/live?key=<ADMIN_API_KEY>`.
- URL WebSocket có query key để tương thích API WebSocket trình duyệt; chỉ dùng local/demo qua HTTPS/WSS ở môi trường thật và không ghi key vào mã frontend công khai.
- Ví dụ payload và các điểm nối trong mã được đánh dấu `[FE LINK]`, `[SIMULATOR LINK]`, `[GATEWAY LINK]` và `[DEVICE LINK]`.

## Liên kết Simulator / Arduino Gateway

Admin gán wearable cho runner qua `POST /api/v1/runner-devices`; wearable gửi cùng lúc GPS, `total_steps` và device ID tới `POST /api/v1/telemetry/gps`. Ở `GPS_ONLY`, GPS passage tính lap. Ở `GPS_AND_ARDUINO`, GPS chỉ tạo passage chờ đối chiếu.

Arduino không gọi HTTP trực tiếp: Gateway trên máy tính đọc USB Serial rồi gọi `POST /api/v1/checkpoint-events` với `X-Gateway-Key`, `device_event_id` ổn định và `student_id=null`. Admin đăng ký mapping thiết bị qua `POST /api/v1/checkpoints/{checkpoint_id}/devices`. Chỉ trong chế độ kết hợp, backend ghép event và passage; trường hợp mơ hồ cần `POST /api/v1/checkpoint-events/{event_id}/resolve`. Các API tra cứu là `GET /api/v1/checkpoint-events/{event_id}` và `GET /api/v1/races/{race_id}/checkpoint-events`.
## Tài liệu nhóm

- [Sơ đồ UML và ER](docs/UML_DIAGRAMS.md)
- [Quy tắc ghép Arduino/GPS và các điểm nối API](docs/ARDUINO_GPS_MATCHING.md)
- Đặc tả nghiệp vụ/API: `Dac_ta_nghiep_vu_va_API_Backend_IoT_NEU_RUN.docx`
- Hướng dẫn phần cứng: `Smart_Running_Checkpoint_Station_Huong_Dan_Chi_Tiet.docx`

## Lưu ý vận hành

- `Base.metadata.create_all()` ở cuối `app/main.py` tạo bảng cho bản demo. Production nên dùng Alembic.
- WebSocket fan-out hiện ở bộ nhớ một tiến trình; nhiều worker/máy chủ cần Redis pub/sub.
- Các khóa API mẫu chỉ dành cho local. Không commit `.env` hoặc dùng khóa mẫu trên mạng công khai.
- GPS là dữ liệu mô phỏng nếu không có thiết bị; kết quả ghép phản ánh runner mô phỏng ở gần thời điểm event và không xác minh người thật.
- Đăng nhập hiện tại chỉ là API key demo, không phải tài khoản cá nhân. Worker ghép dùng polling database trong tiến trình; triển khai nhiều worker cần scheduler/claim coordination dùng chung database. WebSocket fan-out cũng chỉ ở bộ nhớ một tiến trình.
- Google Sheets, phần cứng GPS thật, xác thực tài khoản cá nhân và audit có user identity chưa nằm trong MVP.
