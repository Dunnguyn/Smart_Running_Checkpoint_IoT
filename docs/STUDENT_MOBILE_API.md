# API dành cho app sinh viên NEU RUN

Tài liệu này mô tả backend cho app điện thoại. Backend cung cấp REST và WebSocket; không có giao diện app trong repository. App sinh viên dùng token `Bearer` riêng, tuyệt đối không dùng `X-Admin-Key`, `X-Simulator-Key` hoặc `X-Wearable-Key`.

## Phạm vi backend cho app sinh viên

- Admin tạo hồ sơ sinh viên gồm `student_code`, `full_name`, `faculty`; tạo tài khoản app và cấp mật khẩu tạm.
- Admin có thể thêm sinh viên vào giải bằng API quản lý hiện có. Theo yêu cầu bổ sung mới, sinh viên cũng có thể tự đăng ký giải đã công bố khi giải mở đăng ký, còn chỗ và trong thời hạn; backend cấp bib và không tự check-in.
- App đăng nhập, đổi mật khẩu, xem hồ sơ/giải/tuyến, check-in GPS, bắt đầu phiên, gửi batch GPS, xem lịch sử/thống kê, rút khỏi lượt chạy hoặc check-out.
- Điểm danh GPS được so với checkpoint và bán kính đã cấu hình ở backend. Backend xác định sinh viên từ Bearer token; client không gửi `student_id` để chọn người.
- SQLite và các bảng được dùng chung giữa Admin Web và app. Các trường hồ sơ sinh viên không bị sao chép sang một bảng hồ sơ khác.
- Tài khoản vẫn do Admin cấp; không có tự đăng ký tài khoản hoặc khôi phục mật khẩu qua email. Đặc tả API app 1.1 không có self-registration/pause-resume; các phần này được bổ sung theo yêu cầu mới của chủ dự án. Không có QR/camera/Bluetooth trong luồng app.
- Pause/resume được lưu thành các khoảng thời gian bền vững. `elapsed_seconds` gồm thời gian nghỉ; `active_seconds = elapsed_seconds - paused_seconds`. Resume tạo GPS segment mới và rebases bộ đếm bước để không cộng dữ liệu trong lúc nghỉ.

## Khởi chạy và kết nối điện thoại

1. Khởi chạy backend: từ `services/backend`, kích hoạt `.venv`, rồi chạy `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.
2. Trình giả lập trên cùng máy có thể gọi `http://10.0.2.2:8000/api/v1` (Android emulator) hoặc `http://127.0.0.1:8000/api/v1` khi chạy app trong cùng máy.
3. Điện thoại thật phải cùng mạng Wi-Fi với máy backend và gọi `http://<IPv4-LAN-của-máy-backend>:8000/api/v1`; cho phép cổng 8000 qua Windows Firewall. Không dùng `localhost` trên điện thoại vì khi đó nó trỏ vào chính điện thoại.
4. Trước khi chia sẻ trong mạng, đặt `STUDENT_JWT_SECRET` trong `.env` thành chuỗi ngẫu nhiên dài; đổi cả các API key demo. `.env` không được commit.
5. Xem hợp đồng request/response mới nhất tại `http://<host>:8000/docs`.

## Luồng cấp tài khoản ban đầu

1. Admin tạo hồ sơ sinh viên: `POST /api/v1/students` với `student_code`, `full_name`, `faculty`.
2. Admin cấp tài khoản: `POST /api/v1/admin/student-accounts` với `X-Admin-Key` và `{"student_id":"..."}`. Response có `temporary_password`; chỉ hiển thị lúc cấp/reset, cần chuyển cho sinh viên an toàn.
3. Sinh viên đăng nhập bằng `student_code` và mật khẩu tạm. Đổi mật khẩu bắt buộc trước khi thao tác; gọi `POST /api/v1/student/auth/change-password`.
4. Admin cấu hình chính sách giải qua `PUT /api/v1/admin/races/{race_id}/student-policy`: công bố, mở đăng ký, hạn đăng ký và sức chứa. Giải cũ mặc định không công bố/không mở; cần cấu hình rõ ràng.
5. Sinh viên khám phá giải bằng `GET /api/v1/student/races`, rồi đăng ký qua `POST /api/v1/student/races/{race_id}/registrations` với header `Idempotency-Key`. Backend tự cấp bib trong giao dịch đồng bộ với đăng ký Admin.
6. App lưu access token an toàn trên thiết bị, gửi `Authorization: Bearer <access_token>` cho API sinh viên. Refresh token được xoay vòng tại `POST /api/v1/student/auth/refresh`; logout thu hồi session.

Tài khoản tạo mới có `must_change_password=true`. Reset mật khẩu dùng `POST /api/v1/admin/student-accounts/{account_id}/reset-password`; thao tác này thu hồi session cũ và yêu cầu đổi mật khẩu mới. Tài khoản app là một bản ghi xác thực gắn với hồ sơ `Student` hiện có.

## Endpoint sinh viên

| Phương thức | Endpoint | Dùng để |
|---|---|---|
| POST | `/api/v1/student/auth/login` | Đăng nhập bằng mã sinh viên/mật khẩu và nhận cặp token |
| POST | `/api/v1/student/auth/refresh` | Xoay vòng refresh token |
| POST | `/api/v1/student/auth/logout` | Thu hồi session bằng refresh token |
| POST | `/api/v1/student/auth/change-password` | Đổi mật khẩu tạm/mật khẩu hiện tại |
| GET | `/api/v1/student/me` | Hồ sơ và capability của chính sinh viên |
| GET | `/api/v1/student/races` | Giải đã công bố và giải đã tham gia; hỗ trợ keyword, status, `registered_only`, cursor |
| GET | `/api/v1/student/races/{race_id}` | Chi tiết giải và trạng thái tham gia |
| GET | `/api/v1/student/races/{race_id}/map` | Tuyến WGS84 và checkpoint |
| GET | `/api/v1/student/races/{race_id}/participation` | Bib, điểm danh, phiên và hành động được phép |
| POST | `/api/v1/student/races/{race_id}/registrations` | Tự đăng ký; backend kiểm tra công bố, cửa sổ, sức chứa, trùng và tự cấp bib |
| POST | `/api/v1/student/races/{race_id}/check-in` | Xác minh GPS trong vùng check-in |
| POST | `/api/v1/student/races/{race_id}/runs` | Bắt đầu phiên sau check-in và chấp thuận GPS |
| GET | `/api/v1/student/current-run` | Khôi phục phiên hiện tại sau khi mở app lại |
| GET | `/api/v1/student/runs/{run_id}` | Chi tiết phiên thuộc chính sinh viên |
| POST | `/api/v1/student/runs/{run_id}/gps-batches` | Gửi batch mẫu GPS/bước, chống trùng theo batch/sample ID |
| POST | `/api/v1/student/runs/{run_id}/pause` | Tạm dừng ghi nhận; lưu thời điểm và tăng state revision |
| POST | `/api/v1/student/runs/{run_id}/resume` | Tiếp tục; tạo GPS segment mới và nhận snapshot bước làm mốc |
| POST | `/api/v1/student/runs/{run_id}/withdraw` | Kết thúc sớm; không biến thành kết quả hoàn thành |
| POST | `/api/v1/student/races/{race_id}/check-out` | Check-out GPS, không sửa kết quả chạy |
| GET | `/api/v1/student/runs` | Lịch sử phiên có lọc và phân trang |
| GET | `/api/v1/student/runs/{run_id}/laps` | Các vòng đã được backend xác nhận |
| GET | `/api/v1/student/runs/{run_id}/track` | Track GPS phân trang, có `segment_id` |
| GET | `/api/v1/student/dashboard` | Thống kê cá nhân, chuỗi ngày/tuần/tháng |
| POST | `/api/v1/student/realtime-tickets` | Cấp vé WebSocket ngắn hạn, dùng một lần |
| WS | `/ws/v1/student/live` | Nhận sự kiện riêng của sinh viên sau khi xác thực bằng ticket |

Admin hỗ trợ app: `POST /api/v1/admin/student-accounts`, `POST /api/v1/admin/student-accounts/{account_id}/reset-password`, `PUT /api/v1/admin/races/{race_id}/attendance-config`, `GET /api/v1/admin/races/{race_id}/attendance`, `GET/PUT /api/v1/admin/races/{race_id}/student-policy`. Các API này yêu cầu `X-Admin-Key`; policy update dùng `expected_version` chống ghi đè cấu hình đồng thời.

### Mở đăng ký và tự đăng ký

Admin gọi `GET /api/v1/admin/races/{race_id}/student-policy` để lấy `version`, sau đó `PUT` với version đó. Ví dụ cấu hình lần đầu (thời gian phải theo ISO-8601 và sức chứa có thể là `null`):

```json
{
  "expected_version": 0,
  "description": "Giải chạy NEU RUN",
  "published": true,
  "registration_enabled": true,
  "registration_opens_at": "2026-10-19T08:00:00+07:00",
  "registration_closes_at": "2026-10-30T23:59:00+07:00",
  "capacity": 300
}
```

Giải cần ở trạng thái `SCHEDULED`. Giải cũ không có policy sẽ không xuất hiện cho sinh viên; không tự mở khi backend nâng cấp. Khi app gửi đăng ký, backend khóa/tuần tự hóa cập nhật theo race, kiểm tra capacity và đăng ký trùng, cấp số bib tiếp theo, rồi lưu response theo `Idempotency-Key`. Đăng ký không tạo check-in hoặc run.

```http
POST /api/v1/student/races/{race_id}/registrations
Authorization: Bearer <access_token>
Idempotency-Key: <UUID ổn định khi retry>
Content-Type: application/json
```

Body là `{}`. Response gồm `registration_id`, `race_id`, `registration_status`, `bib_number`, `registered_at` và `server_time`. Cùng key/cùng body trả lại cùng kết quả; cùng key khác body trả `IDEMPOTENCY_CONFLICT`. Lỗi nghiệp vụ gồm `RACE_NOT_PUBLISHED`, `REGISTRATION_NOT_OPEN`, `REGISTRATION_CLOSED`, `RACE_FULL`, `RACE_CANCELLED`, `ALREADY_REGISTERED`.

### Tạm dừng và tiếp tục phiên

Lấy `revision` từ `GET /api/v1/student/current-run` hoặc chi tiết phiên. Dùng UUID mới cho mỗi lệnh; khi retry đúng cùng thao tác, giữ nguyên key và body.

```http
POST /api/v1/student/runs/{run_id}/pause
Authorization: Bearer <access_token>
Idempotency-Key: <UUID>
Content-Type: application/json
```

```json
{"expected_revision": 1}
```

Tiếp tục gửi snapshot bộ đếm bước hiện tại của thiết bị; giá trị này tạo baseline mới và không cộng bước lúc nghỉ:

```http
POST /api/v1/student/runs/{run_id}/resume
Authorization: Bearer <access_token>
Idempotency-Key: <UUID khác>
Content-Type: application/json
```

```json
{"expected_revision": 2, "steps_since_start": 0}
```

Response của cả hai là snapshot phiên, gồm status, `elapsed_seconds`, `paused_seconds`, `active_seconds`, `revision`, `segment_id`, `tracking_required`, GPS mới nhất và hành động kế tiếp. Check-in/check-out vẫn là thao tác riêng. Khi mất mạng, app phải hiển thị “chờ đồng bộ” và không báo backend/admin đã xác nhận pause; phiên bản hiện tại không nhận hàng đợi pause/resume offline theo thứ tự.

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

`sequence` tăng dần trong suốt phiên; `sample_id` và `batch_id` là UUID ổn định khi retry. Không gửi GPS khi chưa có phiên ACTIVE. Backend lọc dữ liệu, cập nhật bước/quãng đường và xác nhận lap theo engine; app không tự đặt lap hoặc trạng thái hoàn thành. Cùng một `sample_id` với nội dung giống hệt được ACK `DUPLICATE` kể cả khi gửi lại trong `batch_id` mới; cùng ID nhưng nội dung khác nhận `SAMPLE_ID_CONFLICT`.

## Thời gian, pause/resume, GPS muộn và giới hạn hiện tại

- Gọi pause/resume với `Idempotency-Key` và `expected_revision` lấy từ snapshot. Resume bắt buộc `steps_since_start` để backend thiết lập lại baseline bước chân của thiết bị.
- `elapsed_seconds`/`duration_total_s` là thời gian từ bắt đầu tới hiện tại/kết thúc, gồm thời gian nghỉ. `paused_seconds` là tổng thời gian nghỉ đã xác nhận; `active_seconds = elapsed_seconds - paused_seconds`. Sau khi phiên kết thúc, elapsed time đóng băng tại `ended_at`.
- GPS samples được xác thực theo chủ phiên, thiết bị/cài đặt, thứ tự sequence, timestamp, tọa độ, tốc độ, bước chân và quy tắc checkpoint. Batch/sample retry cùng ID không cộng lại dữ liệu; cùng ID với payload khác bị từ chối. Mỗi phần tử response có `status`, `accepted`, `retryable` và `reason_code` (nếu bị loại); lỗi xác thực nghiệp vụ là `retryable=false`, lỗi mạng/transport có thể gửi lại cùng batch.
- App được tải hàng đợi GPS ngoại tuyến tối đa **300 giây** tính từ `recorded_at` trong khi phiên vẫn `ACTIVE`; giới hạn này chỉ áp dụng nguồn MOBILE, không nới cửa sổ sự kiện Arduino/Gateway hoặc thiết bị đeo. Mẫu cũ hơn bị trả `GPS_TOO_OLD` và không nên retry. Mẫu phải sau lúc bắt đầu, không thuộc khoảng nghỉ, có timestamp/sequence tăng dần và không được sửa kết quả phiên đã kết thúc.
- Nếu khoảng mất mẫu vượt `max_sample_gap_seconds`, backend bắt đầu `segment_id` mới, không nối quãng đường qua khoảng trống và không suy diễn đã qua checkpoint trong khoảng đó. Điểm đầu ở segment mới chỉ làm mốc định vị; mẫu GPS muộn không được dùng để bù một passage bị thiếu.
- Dashboard cá nhân chỉ tính lượt check-in, phiên hoàn thành chính thức và phiên kết thúc sớm; run ngoài luồng app được đếm riêng ở `excluded_non_mobile_runs`. Pace trung bình là tổng thời gian hoàn thành chia tổng quãng đường rồi quy đổi sang giây/km; khi không có quãng đường trả `null`.
- WebSocket dùng vé ngắn hạn một lần; event có `event_id`, aggregate/revision. Fan-out trong bộ nhớ một tiến trình, vì vậy app cần refetch snapshot sau reconnect. Nhiều worker cần pub/sub dùng chung trước triển khai thật.
- CORS của API REST không ảnh hưởng app native; với app chạy trong WebView/trình duyệt, thêm origin thật vào `CORS_ORIGINS`.
- API policy, pause/resume và đăng ký dùng SQLite/SQLAlchemy. Chống cấp bib đồng thời được tuần tự hóa theo race cho backend một process/SQLite và SQL Server row-lock path; nhiều worker production nên dùng PostgreSQL/SQL Server hoặc khóa phân tán, đồng thời áp Alembic migration trước khi triển khai.

## Hồ sơ sinh viên

`GET /api/v1/student/me` trả `student_code`, `full_name`, `faculty`, `student_id`, `account_status` và cờ đổi mật khẩu. Các trường `student_code`, `full_name`, `faculty` lưu trên bảng `students`, được nhập lúc admin tạo/sửa hồ sơ và cũng được dùng bởi Admin Web. `class_name` không có trong schema hiện tại và trả `null`; không thu thập thêm trường lớp khi chưa có yêu cầu nghiệp vụ.

