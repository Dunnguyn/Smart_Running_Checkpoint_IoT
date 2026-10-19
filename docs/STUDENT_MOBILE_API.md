# API dành cho app sinh viên NEU RUN

Tài liệu này mô tả backend cho app điện thoại. Backend cung cấp REST và WebSocket; không có giao diện app trong repository. App sinh viên dùng token `Bearer` riêng, tuyệt đối không dùng `X-Admin-Key`, `X-Simulator-Key` hoặc `X-Wearable-Key`.

## Phạm vi MVP đang triển khai

- Admin tạo hồ sơ sinh viên gồm `student_code`, `full_name`, `faculty`; tạo tài khoản app và cấp mật khẩu tạm.
- Admin thêm sinh viên vào giải bằng API quản lý giải đang có. App chỉ xem các giải sinh viên đã được đăng ký.
- App đăng nhập, đổi mật khẩu, xem hồ sơ/giải/tuyến, check-in GPS, bắt đầu phiên, gửi batch GPS, xem lịch sử/thống kê, rút khỏi lượt chạy hoặc check-out.
- Điểm danh GPS được so với checkpoint và bán kính đã cấu hình ở backend. Backend xác định sinh viên từ Bearer token; client không gửi `student_id` để chọn người.
- SQLite và các bảng được dùng chung giữa Admin Web và app. Các trường hồ sơ sinh viên không bị sao chép sang một bảng hồ sơ khác.
- Theo đặc tả API app phiên bản 1.1, MVP hiện không có sinh viên tự tạo tài khoản, tự đăng ký giải, pause/resume hoặc QR/camera/Bluetooth. Không thêm các hành vi này qua giao diện app.

## Khởi chạy và kết nối điện thoại

1. Khởi chạy backend: từ `services/backend`, kích hoạt `.venv`, rồi chạy `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.
2. Trình giả lập trên cùng máy có thể gọi `http://10.0.2.2:8000/api/v1` (Android emulator) hoặc `http://127.0.0.1:8000/api/v1` khi chạy app trong cùng máy.
3. Điện thoại thật phải cùng mạng Wi-Fi với máy backend và gọi `http://<IPv4-LAN-của-máy-backend>:8000/api/v1`; cho phép cổng 8000 qua Windows Firewall. Không dùng `localhost` trên điện thoại vì khi đó nó trỏ vào chính điện thoại.
4. Trước khi chia sẻ trong mạng, đặt `STUDENT_JWT_SECRET` trong `.env` thành chuỗi ngẫu nhiên dài; đổi cả các API key demo. `.env` không được commit.
5. Xem hợp đồng request/response mới nhất tại `http://<host>:8000/docs`.

## Luồng cấp tài khoản ban đầu

1. Admin tạo hồ sơ sinh viên: `POST /api/v1/students` với `student_code`, `full_name`, `faculty`.
2. Admin thêm sinh viên vào giải: `POST /api/v1/races/{race_id}/participants` với `student_id` và `bib_number` tùy chọn.
3. Admin cấp tài khoản: `POST /api/v1/admin/student-accounts` với `X-Admin-Key` và `{"student_id":"..."}`. Response có `temporary_password`; chỉ hiển thị lúc cấp/reset, cần chuyển cho sinh viên an toàn.
4. Sinh viên đăng nhập bằng `student_code` và mật khẩu tạm. Đổi mật khẩu bắt buộc trước khi thao tác; gọi `POST /api/v1/student/auth/change-password`.
5. App lưu access token an toàn trên thiết bị, gửi `Authorization: Bearer <access_token>` cho API sinh viên. Refresh token được xoay vòng tại `POST /api/v1/student/auth/refresh`; logout thu hồi session.

Tài khoản tạo mới có `must_change_password=true`. Reset mật khẩu dùng `POST /api/v1/admin/student-accounts/{account_id}/reset-password`; thao tác này thu hồi session cũ và yêu cầu đổi mật khẩu mới. Tài khoản app là một bản ghi xác thực gắn với hồ sơ `Student` hiện có.

## Endpoint sinh viên

| Phương thức | Endpoint | Dùng để |
|---|---|---|
| POST | `/api/v1/student/auth/login` | Đăng nhập bằng mã sinh viên/mật khẩu và nhận cặp token |
| POST | `/api/v1/student/auth/refresh` | Xoay vòng refresh token |
| POST | `/api/v1/student/auth/logout` | Thu hồi session bằng refresh token |
| POST | `/api/v1/student/auth/change-password` | Đổi mật khẩu tạm/mật khẩu hiện tại |
| GET | `/api/v1/student/me` | Hồ sơ và capability của chính sinh viên |
| GET | `/api/v1/student/races` | Danh sách giải đã đăng ký, lọc từ khóa/trạng thái, phân trang |
| GET | `/api/v1/student/races/{race_id}` | Chi tiết giải và trạng thái tham gia |
| GET | `/api/v1/student/races/{race_id}/map` | Tuyến WGS84 và checkpoint |
| GET | `/api/v1/student/races/{race_id}/participation` | Bib, điểm danh, phiên và hành động được phép |
| POST | `/api/v1/student/races/{race_id}/check-in` | Xác minh GPS trong vùng check-in |
| POST | `/api/v1/student/races/{race_id}/runs` | Bắt đầu phiên sau check-in và chấp thuận GPS |
| GET | `/api/v1/student/current-run` | Khôi phục phiên hiện tại sau khi mở app lại |
| GET | `/api/v1/student/runs/{run_id}` | Chi tiết phiên thuộc chính sinh viên |
| POST | `/api/v1/student/runs/{run_id}/gps-batches` | Gửi batch mẫu GPS/bước, chống trùng theo batch/sample ID |
| POST | `/api/v1/student/runs/{run_id}/withdraw` | Kết thúc sớm; không biến thành kết quả hoàn thành |
| POST | `/api/v1/student/races/{race_id}/check-out` | Check-out GPS, không sửa kết quả chạy |
| GET | `/api/v1/student/runs` | Lịch sử phiên có lọc và phân trang |
| GET | `/api/v1/student/runs/{run_id}/laps` | Các vòng đã được backend xác nhận |
| GET | `/api/v1/student/runs/{run_id}/track` | Track GPS phân trang, có `segment_id` |
| GET | `/api/v1/student/dashboard` | Thống kê cá nhân, chuỗi ngày/tuần/tháng |
| POST | `/api/v1/student/realtime-tickets` | Cấp vé WebSocket ngắn hạn, dùng một lần |
| WS | `/ws/v1/student/live` | Nhận sự kiện riêng của sinh viên sau khi xác thực bằng ticket |

Admin hỗ trợ app: `POST /api/v1/admin/student-accounts`, `POST /api/v1/admin/student-accounts/{account_id}/reset-password`, `PUT /api/v1/admin/races/{race_id}/attendance-config`, `GET /api/v1/admin/races/{race_id}/attendance`. Các API này yêu cầu `X-Admin-Key`.

## Ví dụ dùng app

Đăng nhập:

```http
POST /api/v1/student/auth/login
Content-Type: application/json
```

```json
{
  "student_code": "11220006",
  "password": "<mat-khau-duoc-cap>",
  "installation_id": "ad4a2f9b-8e33-4a5d-8e9c-000000000001",
  "platform": "ANDROID",
  "app_version": "1.0.0"
}
```

Check-in và bắt đầu đều cần vị trí mới, độ chính xác GPS, `captured_at`; backend lấy checkpoint/radius và cửa sổ thời gian từ cấu hình admin. Mọi lệnh ghi nhận hỗ trợ `Idempotency-Key`.

```http
POST /api/v1/student/races/{race_id}/check-in
Authorization: Bearer <access_token>
Idempotency-Key: <uuid-moi-cho-thao-tac>
Content-Type: application/json
```

```json
{"position":{"latitude":20.99998,"longitude":105.841875,"accuracy_m":8,"captured_at":"2026-10-19T09:00:00+07:00"}}
```

```http
POST /api/v1/student/races/{race_id}/runs
Authorization: Bearer <access_token>
Idempotency-Key: <uuid-moi-cho-thao-tac>
Content-Type: application/json
```

```json
{
  "position":{"latitude":20.99998,"longitude":105.841875,"accuracy_m":8,"captured_at":"2026-10-19T09:01:00+07:00"},
  "consent_version":"gps-v1",
  "consent_granted":true
}
```

Gửi GPS theo batch:

```json
{
  "batch_id":"6b5ba4f2-9553-4c4d-b5a1-ec08f4150d10",
  "samples":[{
    "sample_id":"e45e8aab-59ee-45c2-9abc-2e8da6a5df45",
    "sequence":1,
    "recorded_at":"2026-10-19T09:01:05+07:00",
    "latitude":20.99998,
    "longitude":105.841875,
    "accuracy_m":8,
    "speed_mps":2.4,
    "steps_since_start":6
  }]
}
```

`sequence` tăng dần trong suốt phiên; `sample_id` và `batch_id` là UUID ổn định khi retry. Không gửi GPS khi chưa có phiên ACTIVE. Backend lọc dữ liệu, cập nhật bước/quãng đường và xác nhận lap theo engine hiện tại; app không tự đặt lap hoặc trạng thái hoàn thành.

## Thời gian, GPS muộn và giới hạn hiện tại

- MVP không hỗ trợ pause/resume. Khi người dùng cần dừng chạy sớm, gọi withdraw; phiên là `ABANDONED`, không phải `COMPLETED`.
- `duration_total_s` là thời gian từ bắt đầu tới hiện tại/kết thúc; không có thời gian tạm dừng trong mô hình MVP. Giá trị sau khi kết thúc lấy từ `ended_at` và không tiếp tục tăng.
- GPS samples được xác thực theo chủ phiên, thiết bị/cài đặt, thứ tự sequence, timestamp, tọa độ, tốc độ, bước chân và quy tắc checkpoint. Batch/sample retry cùng ID không cộng lại dữ liệu; cùng ID với payload khác bị từ chối.
- Nếu khoảng mất mẫu vượt `max_sample_gap_seconds`, backend bắt đầu `segment_id` mới, không nối quãng đường qua khoảng trống và không suy diễn đã qua checkpoint trong khoảng đó.
- Dashboard cá nhân chỉ tính lượt check-in, phiên hoàn thành chính thức và phiên kết thúc sớm; run ngoài luồng app được đếm riêng ở `excluded_non_mobile_runs`. Pace trung bình là tổng thời gian hoàn thành chia tổng quãng đường rồi quy đổi sang giây/km; khi không có quãng đường trả `null`.
- WebSocket dùng vé ngắn hạn một lần; event có `event_id`, aggregate/revision. Fan-out trong bộ nhớ một tiến trình, vì vậy app cần refetch snapshot sau reconnect. Nhiều worker cần pub/sub dùng chung trước triển khai thật.
- CORS của API REST không ảnh hưởng app native; với app chạy trong WebView/trình duyệt, thêm origin thật vào `CORS_ORIGINS`.

## Hồ sơ sinh viên

`GET /api/v1/student/me` trả `student_code`, `full_name`, `faculty`, `student_id`, `account_status` và cờ đổi mật khẩu. Các trường `student_code`, `full_name`, `faculty` lưu trên bảng `students`, được nhập lúc admin tạo/sửa hồ sơ và cũng được dùng bởi Admin Web. `class_name` không có trong schema hiện tại và trả `null`; không thu thập thêm trường lớp khi chưa có yêu cầu nghiệp vụ.

