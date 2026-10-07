# NEU Smart Running · Admin Web

Frontend React/TypeScript/Vite hiện dùng FastAPI thật qua REST và WebSocket; giữ chế độ mock độc lập. Backend quyết định danh tính liên kết, số vòng, bước chân, quãng đường, thứ tự top runner và hoàn thành. Frontend không gửi GPS/Gateway event và không chạy simulator trong luồng ứng dụng.

## Chạy local

Backend (PowerShell tại `services/backend`, cấu hình `.env` riêng theo README backend):

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host localhost --port 8000 --reload --no-access-log
```

Frontend (PowerShell tại `apps/admin-web`):

```powershell
npm.cmd ci
# Chỉ sao chép nếu chưa có .env, tránh ghi đè cấu hình đang dùng:
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm.cmd run dev
```

```env
VITE_DATA_MODE=api
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_WS_BASE_URL=ws://localhost:8000
```

Mở http://localhost:5173. Dùng nhất quán localhost; backend CORS cần cho phép đúng origin này. Preview port 5174 cần thêm origin tương ứng. HTTP frontend không dùng `no-cors`. Với HTTPS, cấu hình REST HTTPS; WebSocket được chuyển sang WSS. Tắt/redact access log chứa query key ở backend/proxy.

Nhập Admin key cấu hình tại backend. FE gọi `POST /auth/admin-key` bằng header `X-Admin-Key`, **không body**, và chỉ mở dữ liệu quản trị sau HTTP 200. 401 ở lại form; lỗi mạng/5xx thông báo kết nối, không coi là sai khóa. Không có lockout hay thời gian chờ. Key chỉ ở bộ nhớ, không nằm trong VITE env hoặc storage. Reload cần nhập lại. Đăng xuất/401 từ API bảo vệ xóa key, cache và đóng socket/request; không dùng Simulator/Gateway key trong bundle.

Đặt `VITE_DATA_MODE=mock` và khởi động lại Vite nếu cần mock frontend. API lỗi không fallback sang mock.

## Contract và các màn hình

Đã đối chiếu OpenAPI tại localhost:8000 với source `services/backend/app/main.py` trong ngày 04/10/2026. README backend giải thích nghiệp vụ; response và WebSocket được xác minh từ hàm xử lý/serializer/publish trong source (read endpoints chưa có response_model đầy đủ). Tài liệu `docs/ARDUINO_GPS_MATCHING.md` được README tham chiếu nhưng chưa có trong checkout này.

Các đường dẫn REST dưới đây tính từ `/api/v1`:

| Màn hình / luồng                  | API đã nối                                             | Hợp đồng                                                                                           |
| --------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Xác thực demo                     | `POST /auth/admin-key`                                 | X-Admin-Key, không body                                                                            |
| Chọn giải                         | `GET /races`                                           | `items`, `race_id`, `name`, `status`, `start_at`                                                   |
| Dashboard / giải                  | `GET /races/{race_id}/dashboard`                       | `race`, `summary`, `runners`, `top_runners`, `recent_checkpoint_events`, `server_time`             |
| Bản đồ                            | `GET /races/{race_id}/live`                            | `runners` gồm cả hoàn thành, `latitude/longitude`, identity/run data                               |
| Bảng runner                       | `GET /races/{race_id}/runners`                         | keyword/status/page/page_size/sort_by/sort_order; REGISTERED hiển thị Chưa bắt đầu                 |
| Chi tiết phiên                    | `GET /runners/{student_id}/runs/{run_id}` và `/events` | Kiểm tra student/run, lịch sử GPS/LAP phân trang                                                   |
| Nhật ký checkpoint                | `GET /races/{race_id}/checkpoint-events`               | checkpoint_id, match_status, from, to, limit, cursor; response items/next_cursor                   |
| Chi tiết sự kiện                  | `GET /checkpoint-events/{event_id}`                    | match_status/lap_status, candidates, candidates_final, version, reason_code, matched_runner, nguồn |
| Xác nhận / loại bỏ                | `POST /checkpoint-events/{event_id}/resolve`           | action, passage_id, expected_version, idempotency_key, reason                                      |
| Cấu hình ghép trong chi tiết giải | `PATCH /races/{race_id}/checkpoint-matching`           | Chỉ gửi trường admin thay đổi, ràng buộc theo OpenAPI                                              |
| Đăng ký Gateway trong checkpoint  | `POST /checkpoints/{checkpoint_id}/devices`            | device_id, name tùy chọn; không có nút liệt kê/sửa/xóa giả                                         |

Dashboard hiển thị mode, thống kê phiên/vòng/quãng đường/bước chân, các trạng thái ghép, top runner theo thứ tự backend, sự kiện gần nhất. Bib/display ID là chuỗi (giữ `01`), chỉ dùng UUID student/run cho API. Map không vẽ vị trí giả; COMPLETED có nhãn vị trí cuối phiên, không coi là mất kết nối. Chỉ số thời gian dùng backend; không có timer tự tăng kết quả.

Nhật ký phân biệt PENDING_MATCH/MATCHED/AMBIGUOUS/UNASSIGNED/REJECTED và NOT_EVALUATED/COUNTED/NOT_COUNTED. MATCHED không đồng nghĩa COUNTED. Mã lý do có giải thích tiếng Việt và giữ mã gốc trong chi tiết. GPS_ONLY + Arduino UNASSIGNED là hành vi dự kiến. GPS_AND_ARDUINO chỉ có passage chờ đối chiếu; notification GPS_PASSAGE_PENDING_ARDUINO không làm tăng vòng.

Chỉ AMBIGUOUS + candidates_final mới hiện form xử lý. Admin chọn **passage_id** trong candidates và nhập lý do. Không tự chọn ứng viên. Disable khi gửi; không optimistic update. Thao tác giữ cùng payload và idempotency key nếu mất response/5xx. FE đọc lại sự kiện trước khi cho thử lại đúng thao tác đó. 409 đọc lại trạng thái, bỏ lựa chọn cũ và yêu cầu admin chọn lại; không thay version rồi tự gửi lại. Sau thành công đọc lại event/dashboard/runner. Pending operation chỉ trong bộ nhớ; nếu đóng màn hình hoặc reload, phải kiểm tra trạng thái backend trước khi làm thao tác mới.

## WebSocket, thứ tự dữ liệu và cleanup

Dùng `/ws/v1/races/{race_id}/live?key=…` tạo bằng URL/URLSearchParams, không ghép `/api/v1/ws` và không ghi URL vào log. Luồng snapshot trước, mở socket rồi resync. Xử lý các event đã xác minh: `runner.updated`, `runner.completed`, `checkpoint.passed`, `checkpoint.match.updated`; vẫn chấp nhận checkpoint.detected cũ chỉ để invalidate.

- Buffer message trong lúc REST đang đọc; merge runner theo race/student/run. Tổng là snapshot thay thế, không cộng. Snapshot/delta cũ không mở lại COMPLETED hoặc làm lùi tổng đã nhận.
- Event checkpoint có version: bỏ frame cũ/trùng và không để chi tiết version thấp ghi đè cao. Message không đủ dữ liệu kích hoạt refetch.
- Gom refetch dashboard/live khoảng 5 giây khi có message; không reload theo từng GPS point. Initial/reconnect resync ngay. Khi socket mất, polling 15 giây; không poll dashboard khi socket connected, cleanup khi đổi giải/logout/unmount.
- Bounded reconnect 1–30 giây, tối đa 6 lần/subscription; auth rejection dừng phiên. Có nút Thử lại / Làm mới. Bảng/chi tiết runner có refresh giới hạn 5 giây khi đang mở và hủy request khi rời màn hình.
- Backend không có sequence/version tổng cho runner/dashboard và snapshot không cùng transaction. Buffer, timestamp, tổng đơn điệu và resync giúp hội tụ; không tuyên bố bảo đảm không mất event. Không suy ra trạng thái nghiệp vụ từ mất socket/GPS.

## Contract còn thiếu / giới hạn có chủ ý

- Dashboard chỉ trả checkpoint_mode/config_version, **không trả các giá trị bán kính/cửa sổ/grace hoặc matching_locked_at**. FE hiển thị thông số chưa biết là “—”, gửi PATCH các trường được nhập; hiển thị giá trị PATCH trả về sau khi lưu. Không dùng PATCH rỗng làm API đọc. Khi dashboard.started_runners > 0, khóa form; đây là suy ra từ quy tắc backend, luôn xử lý 409 MATCHING_CONFIG_LOCKED. Cần endpoint GET cấu hình/flag khóa để hiển thị đầy đủ sau reload.
- Chưa có GET danh sách/metadata/geometry checkpoint hoặc route. Không trộn mock; nhật ký hiển thị ID checkpoint và device ID. Form đăng ký cần checkpoint ID do backend cấp. Chưa có GET/sửa/xóa thiết bị.
- Candidate.available trong source là snapshot lưu trong candidates_json, có thể cũ khi passage đã bị event khác dùng. UI ghi rõ và backend kiểm tra lại khi resolve; 409 không tự chọn người khác.
- Response chỉ có checkpoint_source=ARDUINO_GATEWAY, không có cờ Gateway giả/thật hay online đáng tin cậy. Không ghi “Arduino online”. telemetry_source hiển thị đúng backend (ví dụ SIMULATED_GPS); kết quả ghép không xác minh danh tính người thật trước sensor.
- Không có GET passage đang chờ: thông báo passage mới từ WS là tạm thời, không được coi là toàn bộ backlog sau reload. Nhật ký event vẫn đọc từ backend.
- Read race không có location/route_name; runners không có faculty. Hiển thị “—” cho dữ liệu thiếu. Không tạo UI gán wearable hoặc form tạo giải lớn ngoài yêu cầu.

## Demo do người vận hành chạy tại backend

```powershell
# GPS_ONLY, mặc định 20 sinh viên; backend tự hoàn thành khi đạt mục tiêu
python -m app.simulator --base-url http://localhost:8000

# Mô phỏng cả GPS và Gateway, không chứng minh kit Arduino thật đã kết nối
python -m app.simulator --base-url http://localhost:8000 --mode GPS_AND_ARDUINO --students 20 --laps 1
```

Các giá trị demo (10/15 m, ±3 giây, grace 2 giây) thuộc backend, FE không tự ghi đè. Không thay ngưỡng để làm kiểm thử qua. Không chạy simulator từ frontend.

## Kiểm tra

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

Kiểm thử backend thật riêng (từ gốc repo, cần backend .venv và Microsoft Edge, ports 8001/5175 trống):

```powershell
.\services\backend\.venv\Scripts\python.exe apps/admin-web/scripts/integration_matching.py
```

Harness tạo SQLite tạm với fixture deterministic AMBIGUOUS/passage bằng model backend, khởi động FastAPI riêng, gửi một Gateway HTTP event từ Python harness và kiểm thử UI/REST/WS với Edge. Không sửa backend hoặc DB server local đang chạy, không gọi CLI simulator. Browser chỉ nhận Admin key ngẫu nhiên trong bộ nhớ; báo cáo/ảnh trong `test-results/` gitignored. Đây là kiểm thử tích hợp có fixture, không phải kiểm thử sensor/GPS vật lý.

`integration_api.py`/`integration-api.mjs` là harness cũ cho backend trước auto-completion (không dùng để xác nhận contract mới). `test:ui` kiểm tra mock: build với VITE_DATA_MODE=mock rồi mở preview port 5174. Không nhầm kết quả mock với backend thật.
