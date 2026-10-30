# API cho app sinh viên NEU RUN

## Base URL và tài liệu API

- Root local: `http://127.0.0.1:8000`
- OpenAPI / Swagger: `http://127.0.0.1:8000/docs`
- API sinh viên: `/api/v1/student/...`
- API quản trị cấu hình: `/api/v1/admin/...` (chỉ dùng `X-Admin-Key` trong Admin Web)
- App sinh viên dùng `Authorization: Bearer <access_token>`; không gửi Admin key, student ID do client tự chọn, QR, camera hoặc Bluetooth.

Điện thoại thật không dùng `127.0.0.1` để gọi máy tính. Đặt `EXPO_PUBLIC_API_BASE_URL` thành IPv4 LAN của máy backend, chạy Uvicorn với `--host 0.0.0.0`, cho phép port 8000 qua firewall. Android emulator dùng `http://10.0.2.2:8000`; iOS simulator dùng `http://127.0.0.1:8000`.

## API theo hành trình sinh viên

| Nghiệp vụ | Method và path | Auth | Tác dụng |
|---|---|---|---|
| Đăng nhập | `POST /api/v1/student/auth/login` | Không | Mã SV + mật khẩu + installation UUID; trả Bearer access/refresh token |
| Refresh token | `POST /api/v1/student/auth/refresh` | Refresh token trong body | Đổi access token; refresh token cũ chỉ dùng một lần |
| Đăng xuất | `POST /api/v1/student/auth/logout` | Không | Thu hồi refresh session |
| Đổi mật khẩu | `POST /api/v1/student/auth/change-password` | Bearer | Mật khẩu mới tối thiểu 12 ký tự |
| Hồ sơ | `GET /api/v1/student/me` | Bearer | Hồ sơ theo token và capabilities |
| Khám phá giải | `GET /api/v1/student/races` | Bearer | Giải công bố, tìm kiếm, lọc, phân trang; gồm cờ hành động và lý do chặn |
| Chi tiết giải | `GET /api/v1/student/races/{race_id}` | Bearer | Chính sách, đăng ký, bib, điểm danh, phiên hiện tại và hành động được phép |
| Tuyến trên bản đồ | `GET /api/v1/student/races/{race_id}/map` | Bearer | Polyline WGS84 và checkpoint có latitude/longitude/radius |
| Tự đăng ký | `POST /api/v1/student/races/{race_id}/registrations` | Bearer + `Idempotency-Key` UUID | Backend kiểm tra công bố, thời hạn, chỗ trống và cấp bib nguyên tử |
| Trạng thái tham gia | `GET /api/v1/student/races/{race_id}/participation` | Bearer | Bib, điểm danh, run hiện tại và các hành động |
| Check-in GPS | `POST /api/v1/student/races/{race_id}/check-in` | Bearer + `Idempotency-Key` | Xác nhận vị trí trong vùng/timing đã cấu hình; không tạo run |
| Bắt đầu buổi | `POST /api/v1/student/races/{race_id}/runs` | Bearer + `Idempotency-Key` | Tạo run nếu check-in/điều kiện challenge hợp lệ |
| Run hiện tại | `GET /api/v1/student/current-run` | Bearer | Khôi phục run ACTIVE, bao gồm tracking PAUSED |
| Chi tiết run | `GET /api/v1/student/runs/{run_id}` | Bearer | Snapshot chỉ thuộc sinh viên đăng nhập |
| Gửi GPS theo lô | `POST /api/v1/student/runs/{run_id}/gps-batches` | Bearer | Chống trùng `batch_id`/`sample_id`, sequence và segment; trả từng mẫu accepted/rejected |
| Tạm dừng | `POST /api/v1/student/runs/{run_id}/pause` | Bearer + `Idempotency-Key` | Ghi khoảng nghỉ, đóng đoạn GPS và tăng revision |
| Tiếp tục | `POST /api/v1/student/runs/{run_id}/resume` | Bearer + `Idempotency-Key` | Đóng khoảng nghỉ, mở segment mới, không nối GPS qua pause |
| Kết thúc sớm | `POST /api/v1/student/runs/{run_id}/withdraw` | Bearer + `Idempotency-Key` | Kết thúc sớm, không chuyển thành hoàn thành giải |
| Dừng buổi challenge tại checkpoint | `POST /api/v1/student/runs/{run_id}/finish` | Bearer + `Idempotency-Key` | Kiểm tra GPS tại checkout checkpoint, lưu GPS cuối và chốt một buổi |
| Check-out sau buổi | `POST /api/v1/student/races/{race_id}/check-out` | Bearer + `Idempotency-Key` | Đóng lượt điểm danh; bị chặn nếu còn run ACTIVE hoặc PAUSED |
| Tiến độ thử thách | `GET /api/v1/student/races/{race_id}/progress` | Bearer | Cộng quãng đường, elapsed/active/paused time và bước theo ngày |
| Lịch sử run | `GET /api/v1/student/runs` | Bearer | Phân trang/lọc theo race, trạng thái và khoảng ngày |
| Vòng của run | `GET /api/v1/student/runs/{run_id}/laps` | Bearer | Các lap đã được backend xác nhận |
| Track GPS | `GET /api/v1/student/runs/{run_id}/track` | Bearer | Các điểm GPS được trả thành segment riêng |
| Dashboard cá nhân | `GET /api/v1/student/dashboard` | Bearer | Tổng quãng đường/thời gian/thành tích theo khoảng ngày |
| Ticket realtime | `POST /api/v1/student/realtime-tickets` | Bearer | Ticket ngắn hạn để vào WebSocket sinh viên |
| WebSocket | `WS /ws/v1/student/live` | Ticket | Event riêng tư của sinh viên đã xác thực |

## Payload tối thiểu

Đăng nhập:

```json
{
  "student_code": "11235723",
  "password": "<mật khẩu đã được cấp>",
  "installation_id": "b7fb6e44-80a5-4db7-9ed4-03fd40248b14",
  "platform": "ANDROID",
  "app_version": "1.0.0"
}
```

Check-in và check-out nhận `position` với `latitude`, `longitude`, `accuracy_m`, `captured_at`. Backend lấy vùng và bán kính từ cấu hình giải; client không thể tự khai báo geofence.

Bắt đầu challenge:

```json
{
  "position": {"latitude": 20.9999722, "longitude": 105.8418889, "accuracy_m": 8, "captured_at": "2026-10-27T08:00:00Z"},
  "consent_version": "NEU-RUN-GPS-1",
  "consent_granted": true
}
```

GPS batch:

```json
{
  "batch_id": "705fab4f-d40d-4758-88f8-b82245c61e9b",
  "samples": [{
    "sample_id": "5d832c7d-5c5a-4050-b879-bf8e27f11c84",
    "sequence": 1,
    "recorded_at": "2026-10-27T08:00:05Z",
    "latitude": 20.99998,
    "longitude": 105.84190,
    "accuracy_m": 8,
    "speed_mps": 2.8,
    "steps_since_start": 42
  }]
}
```

`elapsed_seconds` gồm cả lúc nghỉ; `active_seconds = elapsed_seconds - paused_seconds`. `steps_since_start` là bộ đếm phiên đang chạy; app tích hợp hiện ước lượng từ khoảng cách GPS 0,7 m/bước vì chưa có cảm biến bước native. Mọi sample pause/resume phân segment; sample gửi trùng không làm tăng số liệu lần hai.

## API Admin cho app

- `PUT /api/v1/admin/races/{race_id}/student-policy`: bật/tắt công bố, tự đăng ký, hạn đăng ký và sức chứa.
- `PUT /api/v1/admin/races/{race_id}/attendance-config`: tâm vùng được lấy từ ID checkpoint; xác định cửa sổ check-in/check-out.
- `POST /api/v1/admin/student-accounts`: cấp account cho hồ sơ sinh viên đã có.
- `POST /api/v1/admin/student-accounts/{account_id}/reset-password`: reset mật khẩu tạm.
- `GET /api/v1/admin/races/{race_id}/attendance`: xem danh sách check-in/check-out.

## Demo kit và challenge

- Tạo demo kit: `GET /api/v1/demos/kit/ports`, `POST /api/v1/demos/kit/sessions` với `{"serial_port":"COM03","student_code":"11235723","full_name":"Lê Phương Linh"}`. Backend mở listener Serial; sketch in `START!`, rồi `LAP: n` khi HC-SR04 phát hiện người. Lần qua đầu lưu run và passage xuất phát tại checkpoint duy nhất C04; lần qua thứ hai sau ít nhất 8 giây lưu passage đích và hoàn tất run. GPS và bước chân là dữ liệu mô phỏng (~31 m, sải bước 0,70 m), cảm biến không nhận dạng danh tính.
- Đọc trạng thái: `GET /api/v1/demos/kit/sessions/{demo_id}`; dừng thủ công: `POST /api/v1/demos/kit/sessions/{demo_id}/stop`. Không có endpoint giả passage. Chỉ một tiến trình có thể chiếm COM03; đóng Arduino Serial Monitor trước khi tạo demo.
- Demo sức khỏe 50 km/30 ngày: `POST /api/v1/demos/health-month` với `{"duration_seconds":60}`. Backend tự chạy 30 ngày virtual trong khoảng 60 giây, tạo ba tài khoản demo và trả mật khẩu tạm trong response tạo demo. Đọc theo ngày bằng `GET /api/v1/demos/health-month/{demo_id}`; admin xem tổng hợp tại `GET /api/v1/races/{race_id}/challenge/dashboard`; xóa dữ liệu demo bằng `DELETE /api/v1/demos/health-month/{demo_id}`. Kết quả được lưu có nhãn mô phỏng, không phải GPS phần cứng.
- Các route riêng cho luồng challenge app: `GET /api/v1/student/races/{race_id}/challenge`, `POST /api/v1/student/races/{race_id}/challenge/sessions`, `POST /api/v1/student/challenge-runs/{run_id}/finish`. Chúng dùng Bearer token và vị trí GPS C04; GPS batches dùng API run tiêu chuẩn trong bảng trên. Ba runner demo lần lượt đạt khoảng 30 km, 50 km và 64,8 km; runner thứ ba đạt mục tiêu vào ngày 21 nhưng tiếp tục chạy đến hết ngày 30.

API docs tại `/docs` dùng OpenAPI sinh trực tiếp từ backend; các endpoint app ở mục trên được đăng ký trong cùng schema và không cần Admin key.

## Cấu hình FE

Adapter mobile nên gọi API bằng Bearer token và base URL backend trong cấu hình môi trường riêng. Điện thoại thật cần IPv4 LAN hoặc HTTPS tunnel; không dùng `127.0.0.1` trỏ về máy backend. Không đặt Admin/Gateway key trong biến môi trường công khai của app.
