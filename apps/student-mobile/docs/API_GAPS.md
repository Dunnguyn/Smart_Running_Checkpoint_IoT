# Hợp đồng API sinh viên — chờ BE

## Ma trận bàn giao tích hợp — 17/10/2026

Các tên thao tác dưới đây là **interface FE đề xuất**, không phải URL/DTO đã được BE triển khai. Mã lỗi và sự kiện cũng cần BE xác nhận; không mở WebSocket admin từ app.

| Màn hình/luồng         | API cần dùng                          | Request → response cần thiết                                                               | Mã lỗi đề xuất                                            | Realtime liên quan                       | Contract                         | FE sẵn sàng / đang chờ BE                                                                |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| Đăng nhập/khôi phục    | login, refresh/revoke session         | mã SV + mật khẩu → student, access token, expiresAt; refresh rotation nếu có               | BAD_CREDENTIALS, UNAUTHORIZED, RATE_LIMITED               | session revoked nếu hỗ trợ               | Đề xuất                          | SecureStore, hết phiên, tách tài khoản sẵn; chờ auth scheme và refresh/revoke            |
| Khám phá/đã đăng ký    | search races, enrollments             | query/filter/cursor → items, nextCursor, serverTime                                        | INVALID_FILTER, UNAUTHORIZED                              | race changed/cancelled                   | Đề xuất; routes admin không dùng | Model/filters/UI sẵn; chờ pagination và scope sinh viên                                  |
| Đăng ký/bib            | self-register, operation status       | stable operation ID + raceId → enrollment/bib/revision                                     | REGISTRATION_CLOSED, FULL, CANCELLED, KEY_CONFLICT        | enrollment changed                       | Đề xuất                          | Queue/reconciliation/idempotent mock sẵn; chờ header, atomic capacity, conflict response |
| Check-in/out           | attendance                            | operation ID + fresh fix/time/accuracy → attendance; kết quả chạy riêng                    | LOCATION_REQUIRED, STALE_FIX, OUTSIDE, ACCURACY, NOT_OPEN | attendance changed                       | Đề xuất                          | GPS Android và luồng sẵn; chờ vùng/tuổi fix/accuracy chính thức                          |
| Bản đồ                 | race route/checkpoints                | raceId/version → geometry, checkpoint IDs/kinds, zones                                     | ROUTE_UNAVAILABLE                                         | route revision                           | Đề xuất; route admin không dùng  | MapProps/segments/native renderer sẵn; chờ DTO tọa độ/zone và Maps key local             |
| Bắt đầu                | start run                             | operation ID + raceId → runId/status/server timestamps/revision                            | ACTIVE_RUN_EXISTS, NOT_CHECKED_IN, START_FAILED           | run changed                              | Đề xuất                          | Chặn phiên trùng, không bật GPS khi lỗi sẵn; chờ validation BE                           |
| Pause/resume           | transition + operation status         | stable ID, runId, requestedAt, expected revision → effective timestamps/state              | INVALID_STATE, VERSION_CONFLICT, OFFLINE_NOT_ALLOWED      | run paused/resumed                       | Chờ BE chốt, đặc biệt offline    | Durable gate/segment/queue mock sẵn; không áp protocol mock vào API thật                 |
| Đồng bộ GPS            | batch upload                          | IDs/sequence/segment/timestamps/coords/accuracy → ACK từng ID, permanent rejects, revision | INVALID_SAMPLE, TERMINAL, RATE_LIMITED, UNAUTHORIZED      | confirmed checkpoint/lap                 | Đề xuất                          | Task nền + SQLite + retry IDs + giới hạn 3000; chờ batch size/order/ACK/retry semantics  |
| Kết thúc/kết quả       | finish, result snapshot               | stable ID + runId → VERIFYING/terminal, laps, distance, activeMs, endedAt                  | INVALID_STATE, PENDING_SAMPLES, TERMINAL                  | result confirmed                         | Đề xuất                          | UI không tự chốt kết quả; chờ quy tắc vòng, late samples và deadline xác nhận            |
| Lịch sử/thống kê/hồ sơ | own runs, aggregates, student profile | cursor/time filter → own results, GPS segments, laps, aggregates                           | UNAUTHORIZED, NOT_FOUND                                   | result/profile changed                   | Đề xuất                          | UI/model sẵn; chờ retention, aggregates, timezone và phân trang                          |
| Reconnect              | authenticated stream + snapshot       | token + lastEventId/revision → ordered events/snapshot                                     | UNAUTHORIZED, CURSOR_EXPIRED                              | event ID/revision bắt buộc nếu BE hỗ trợ | Chưa có                          | Chờ transport, auth, replay và polling fallback; hiện polling chỉ trong mock             |

`domain/model.ts` là model dùng cho UI/service, **không phải DTO backend**. `services/api.ts` là adapter tập trung fail-closed; khi có OpenAPI mới thêm DTO, validation và mapper tại lớp services, không ép UI đọc response thô. `runtime.ts` chọn một service theo môi trường; API không fallback mock, tổ hợp API + DemoGps bị chặn. Chưa tạo mapper dựa trên schema tưởng tượng.

Đối chiếu ngày 16/10/2026 với `services/backend/app/main.py`, `services/backend/README.md`, `docs/FEEDBACK_BACKEND_RESPONSE.md` và `docs/BAO_CAO_BACKEND_VA_CHUC_NANG_HE_THONG.md`. Không tìm thấy OpenAPI JSON/YAML được lưu trong workspace; chưa gọi server đang chạy. Bằng chứng dưới đây là source handler thực, không suy đoán theo tên endpoint.

## API đã có nhưng không dùng cho app sinh viên

| Handler hiện tại                                         | Bằng chứng và lý do chưa dùng                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/admin-key`                            | Xác thực khóa quản trị, không có mã sinh viên/mật khẩu.                                                                                                 |
| `GET /api/v1/races`, `GET /api/v1/races/{race_id}/route` | Có `Depends(admin)`; không được phân phối admin key trong app sinh viên.                                                                                |
| `POST /api/v1/races/{race_id}/participants`              | Admin đăng ký participant, BE cấp bib nếu bỏ trống; chưa có quyền self-registration, hạn/capacity theo nghiệp vụ sinh viên.                             |
| `POST /api/v1/runs`                                      | `RunIn` bắt buộc wearable_device_id, source và idempotency_key; quyền qua run_create_auth. Không phải start của sinh viên đăng nhập bằng mật khẩu.      |
| `POST /api/v1/telemetry/gps`                             | `GpsIn` dành wearable/simulator, có total_steps; chưa có segment, sequence và ACK batch theo sinh viên. Không gán khóa wearable giả để dùng điện thoại. |
| `POST /api/v1/runs/{run_id}/finish`                      | Chỉ admin.                                                                                                                                              |
| Chi tiết runs/events và `/ws/v1/races/{race_id}/live`    | Admin; socket dùng key query. Không dùng cơ chế này trong app sinh viên.                                                                                |
| Check-in/check-out, pause/resume                         | Không tìm thấy student handlers tương ứng.                                                                                                              |

Không sửa backend. `src/services/api.ts` cố ý trả `CONTRACT_PENDING` cho mọi phương thức; cấu hình base URL đã tách nhưng chưa có request HTTP khi contract chưa xác minh. Không claim API thật đã hoàn thành.

## Boundary đề xuất cho BE review (chưa phải giao thức đã triển khai)

Interface TypeScript nằm tại `src/services/contract.ts`, model tại `src/domain/model.ts`. Giữ UI dùng cùng interface khi thay mock bằng adapter thật. Chưa gán URL/method HTTP cho các phương thức đề xuất để tránh dùng nhầm endpoint chưa tồn tại.

| Phương thức                 | Payload/kết quả đề xuất                                                                | BE cần chốt                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `login(code, password)`     | Auth gồm student, token, expiresAt                                                     | Endpoint, schema lỗi, refresh/revoke token, khóa tài khoản, scope sinh viên.                                                               |
| `snapshot(auth)`            | Races, enrollments/bib theo giải, runs, revision                                       | Pagination/filter/search server; snapshot theo đúng chủ tài khoản; server time/offset; GET operation status khi kết quả chưa rõ.           |
| `execute(register)`         | ID thao tác ổn định, raceId, owner                                                     | Idempotency header/body, conflict payload, capacity atomic, hạn đăng ký và bib do BE cấp.                                                  |
| `execute(checkin/checkout)` | Fix mới: latitude, longitude, timestamp, accuracy                                      | Vùng, bán kính, maxAccuracy, tuổi fix, giờ mở/đóng; kết quả check-out độc lập run result.                                                  |
| `execute(start)`            | raceId, ID thao tác                                                                    | Chặn phiên chưa kết thúc trên mọi giải; timestamp và trạng thái trả về.                                                                    |
| `execute(pause/resume)`     | runId, ID thao tác, createdAt                                                          | Offline có được phép không, thời điểm hiệu lực, ordering/version conflict, replay/reconcile.                                               |
| `execute(finish)`           | runId, ID thao tác                                                                     | VERIFYING/terminal, deadline xác nhận, xử lý GPS chưa ACK trước/sau terminal.                                                              |
| `upload(samples)`           | Mỗi mẫu có id, owner, runId, sequence, segment, timestamp, coords, accuracy, simulated | Có batch không; giới hạn; ACK từng ID; retryable/permanent; chống duplicate với payload mismatch; mẫu out-of-order; không nối qua segment. |
| Kết quả/lịch sử/thống kê    | status, laps đã xác nhận, endedAt, activeMs, distance                                  | Quy tắc vòng/checkpoint order, interval nghỉ, dữ liệu aggregates, trang lịch sử và retention GPS.                                          |
| Realtime                    | Chưa tích hợp                                                                          | Auth sinh viên, event ID/revision, reconnect snapshot, polling fallback được phép hay không.                                               |

## Chính sách mock đã dùng để test, không áp lên API thật

- Mock account theo mã 11223344/11223345, mật khẩu demo. Lưu "mock server" trên máy, không phải bảo mật backend thực.
- Fixture tính thời gian tương đối để luôn có giải đang mở, chưa mở, đầy, hết hạn, hủy. Vùng check-in/out: 80 m, độ chính xác tối đa 50 m, fix không quá 30 giây. Vùng đếm vòng demo: 20 m quanh điểm đầu. Những số này chỉ nằm trong mock.
- Khi offline pause: thiết bị chặn thu ngay, queue giữ thao tác; mock nhận effective pause tại `createdAt` đã giới hạn vào interval hợp lệ. Resume chỉ ghi lại sau ACK, mở segment mới. Không sử dụng semantics đề xuất này trong API thật.
- Đồng bộ snapshot trước khi retry; cùng thao tác giữ nguyên ID/payload. Mẫu gửi batch tối đa 100; engine không xóa mẫu không có ACK. Rejection vĩnh viễn giữ lý do (tối đa 100 bản ghi); queue chưa ACK tối đa 3.000.
- Mock service đếm passage ngoài→trong; mẫu đầu mỗi segment không cộng vòng. Service mới chốt COMPLETED; UI không tự tăng vòng/hoàn thành. Đây là mô phỏng tối thiểu, **không phải thuật toán xác minh toàn tuyến chính thức**: BE cần xác định checkpoint order, chống gian lận và chính sách chất lượng GPS.
- FINISH chuyển VERIFYING và được mock xác nhận sau độ trễ. Check-out chỉ đổi attendance. Kết quả đạt/chưa đạt, history và stats dùng cùng snapshot.
- Không có socket sinh viên; polling 5 giây chỉ phục vụ mock. API thật không tự mở socket/poll endpoint được suy đoán.

## Cách mở khóa integration

BE cung cấp OpenAPI đúng version và môi trường test sinh viên, kèm quy tắc idempotency/offline/GPS/background. Thay các phương thức fail-closed trong `api.ts` bằng HTTP adapter, validate response và map error/401 vào `ServiceError`. Không đổi UI và không đưa khóa admin/wearable vào app. Chạy thêm contract tests, thử API staging và điện thoại trước khi xác nhận tích hợp thật.
