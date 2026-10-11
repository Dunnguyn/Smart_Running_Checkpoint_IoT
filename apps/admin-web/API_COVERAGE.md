# Đồng bộ runtime 8000 — ad6786c — 11/10/2026

- GET `/api/v1/students`: đã nối tab toàn hệ thống và picker đăng ký; q/limit/offset, không có total.
- GET `/api/v1/races/{race_id}/participants`: đã nối tab đăng ký của giải.
- POST `/api/v1/races/{race_id}/participants`: đã nối form; bib trống bỏ field, server tự cấp; BIB_NUMBER_EXISTS tại input.
- DELETE race: đã bỏ chặn ACTIVE theo contract mới; server hủy run rồi xóa. FE không tự gọi finish/stop trước DELETE.
- POST simulations: đã thêm runner_start_gap_seconds 0–12; default theo mode, giữ 0 và giá trị tự chỉnh.

Các luồng đọc đã kiểm tra thật ở 8000; mutation chỉ fixture cô lập. Phần dưới là lịch sử và đã được thay thế ở các mục trên. Xem [báo cáo mới nhất](INTEGRATION_REPORT.md).

---

# Bổ sung đối chiếu cba5339 — 11/10/2026

Runtime 8001 dùng worktree `backend-current-main`. Các API mới đã nối giao diện:

| API | Tích hợp |
| --- | --- |
| GET `/api/v1/races/{race_id}/checkpoint-matching` | Form đọc cấu hình/khóa thật trước sửa; PATCH hiện có tiếp tục được nối. |
| POST `/api/v1/simulations` | Modal tạo mô phỏng, Admin key, chống gửi lặp/mất response. |
| GET `/api/v1/simulations/{simulation_id}` | Poll job, terminal/404 dừng, log_tail. |
| POST `/api/v1/simulations/{simulation_id}/stop` | Xác nhận dừng và đọc lại trạng thái, không gọi finish run. |
| DELETE `/api/v1/races/{race_id}` | Xác nhận XÓA, kiểm tra run, readback khi không rõ kết quả, dọn cache/socket. |

Route/dashboard metadata và POST race đã cập nhật profile/giới hạn động/khóa. Matching `min_lap_interval_seconds` chỉ đọc; PATCH schema chưa nhận field này. Chưa có API danh sách simulation job hoặc WS job/route/delete; không tự phát minh. Các API tạo sinh viên, wearable, checkpoint, participant, run/finish và GET device-events dưới đây vẫn chưa có giao diện riêng; không mở rộng phạm vi lượt này. Các thao tác ghi mới chỉ test bằng fixture cô lập, chưa E2E ghi thật. Xem [báo cáo](INTEGRATION_REPORT.md).

Phần dưới là kiểm kê bản **42e5478** trước đây, không phải tổng số operation của runtime hiện tại.

---

# Đối chiếu API backend và Admin Web — 10/10/2026

Đối chiếu toàn bộ 29 operation HTTP trong OpenAPI runtime `http://127.0.0.1:8001/openapi.json`, source backend commit `42e547892e344e53a7dde89ba13597e6d6a47658` tại `C:\Users\Admin\.codex\worktrees\backend-route-integration\Smart_Running_Checkpoint_IoT\services\backend\app\main.py`, và các call site trong `src` của frontend. Không tính lời gọi trong test là tích hợp sản phẩm. Các path dưới đây có prefix `/api/v1`, trừ khi ghi rõ. Không gửi request ghi thật để kiểm kê.

## API quản trị chưa nối giao diện (7)

| Method/path | Chức năng và dữ liệu chính | Tình trạng FE / lưu ý |
| --- | --- | --- |
| POST `/students` | Tạo sinh viên: student_code, full_name, faculty tùy chọn; trả student_id. Trùng mã sinh viên bị từ chối. | Trang Sinh viên hiện xem người tham gia giải, chưa có form tạo hồ sơ. |
| POST `/runner-devices` | Gán wearable GPS/bước chân cho student_id bằng device_id, name. | Chưa có form gán wearable; khác API đăng ký Gateway tại checkpoint. Backend chưa có GET danh sách wearable trong OpenAPI này. |
| POST `/races/{race_id}/checkpoints` | Tạo checkpoint: code, name, sequence_no >=1, kind, latitude/longitude tùy chọn, radius_m >0. | Chưa có form tạo checkpoint. Editor hiện chỉ sửa checkpoint tồn tại. Giải mới không tự có checkpoint sau POST /races. |
| POST `/races/{race_id}/participants` | Đăng ký student_id vào giải, bib_number tùy chọn; trả REGISTERED, từ chối đăng ký trùng. | Chưa có form thêm người tham gia; bib chỉ hiển thị, UUID dùng liên kết. |
| POST `/runs` | Tạo phiên: race_id, student_id, wearable_device_id, source (default SIMULATOR), idempotency_key. Cần đăng ký giải, wearable ACTIVE đúng sinh viên, không có run ACTIVE cùng sinh viên/giải. | Chưa có nút bắt đầu phiên. API nhận Admin hoặc Simulator key; nếu tích hợp FE chỉ dùng Admin key. Tạo run làm khóa tuyến/checkpoint, kể cả khi run hoàn thành sau đó. |
| POST `/runs/{run_id}/finish` | Kết thúc run ACTIVE, backend chốt ended_at/duration, trả kết quả và phát runner.completed. COMPLETED trả lại kết quả đã chốt. | Chưa có nút kết thúc thủ công; không tự gọi để sửa run legacy. |
| GET `/races/{race_id}/device-events` | Nhật ký thiết bị dạng page/page_size, có device_event_id, device_id, checkpoint_id, thời điểm, event_type, identity_status, student_id. | Chưa được gọi. Trang Checkpoint dùng /checkpoint-events giàu thông tin matching/lap/candidates hơn; không nhầm hai loại nhật ký. |

## API dành cho thiết bị/simulator, không nên gọi từ Admin Web (4)

| Method/path | Chức năng / xác thực |
| --- | --- |
| POST `/telemetry/gps` | Nhận GPS và bước chân của wearable/simulator, cập nhật run và xử lý passage. Dùng Wearable hoặc Simulator key; không đưa các key này vào FE. |
| POST `/checkpoint-events` | Gateway gửi sự kiện checkpoint vật lý để backend matching. Dùng Gateway key; không tạo sự kiện giả từ FE. |
| GET `/gateway/checkpoint-events/{event_id}` | Gateway đọc kết quả xử lý event; dùng Gateway key. Admin dùng GET /checkpoint-events/{event_id} đã nối. |
| POST `/lap-events` | Simulator gửi sự kiện vòng; dùng Simulator key. Chế độ GPS_AND_ARDUINO từ chối lối tính vòng này, yêu cầu matching sự kiện Arduino. |

## Đã có adapter nhưng UI hiện không gọi (1)

- GET `/races/{race_id}/overview`: `apiAdapter.getRaceOverview()` đã viết, không có call site UI hiện hành. Tổng quan hiện lấy `/dashboard` cùng `/live`; không cần gọi thêm API trùng số liệu chỉ để đạt độ phủ.

## API vận hành (1)

- GET `/health` (không có prefix): dùng trong script kiểm tra local, chưa gọi trong UI sản phẩm. Kết nối UI hiện theo kết quả REST/WS; health không chứng minh GPS mới hoặc thiết bị online.

## Đã nối và có luồng UI (16)

| Method/path | Call site / giao diện |
| --- | --- |
| POST `/auth/admin-key` | LiveProvider: đăng nhập. |
| GET `/races` | apiAdapter.listRaces: header và trang Giải chạy. |
| POST `/races` | raceCreation/CreateRace: **mới thêm** form tại /races. |
| GET `/races/{race_id}/route` | mapEditorService.readMap: editor và đọc lại trước/sau lưu. |
| PUT `/races/{race_id}/route` | MapEditor: lưu toàn tuyến. |
| PATCH `/checkpoints/{checkpoint_id}` | MapEditor: tọa độ/bán kính; không gửi toàn model. |
| POST `/checkpoints/{checkpoint_id}/devices` | RegisterDevice: đăng ký Gateway/trạm. |
| PATCH `/races/{race_id}/checkpoint-matching` | MatchingSettings. |
| GET `/checkpoint-events/{event_id}` | Chi tiết event, đọc lại khi xung đột/resolve. |
| GET `/races/{race_id}/checkpoint-events` | Nhật ký và Cần xác nhận. |
| POST `/checkpoint-events/{event_id}/resolve` | Chọn passage/lý do, version/idempotency; không chọn sẵn ứng viên. |
| GET `/races/{race_id}/dashboard` | Tổng quan, thống kê, route/checkpoint metadata, snapshot. |
| GET `/races/{race_id}/runners` | Bảng Sinh viên, lọc/phân trang. |
| GET `/races/{race_id}/live` | GPS/snapshot live. |
| GET `/runners/{student_id}/runs/{run_id}` | Chi tiết phiên chạy. |
| GET `/runners/{student_id}/runs/{run_id}/events` | Lịch sử GPS/vòng của phiên. |

“Đã nối” chỉ xác nhận có luồng UI và lời gọi API, không đồng nghĩa đã kiểm thử ghi thật. Form tạo giải, editor, resolve/register không gửi ghi thật trong lượt này.

## WebSocket và đường dẫn ngoài OpenAPI

- WS `/ws/v1/races/{race_id}/live`: đã nối trong liveService/client; reconnect/resync/cleanup theo race. Không nằm trong OpenAPI HTTP.
- GET `/`: source redirect sang `/docs`, không phải nghiệp vụ FE.
- `/docs`, `/redoc`, `/openapi.json`, `/docs/oauth2-redirect`: hạ tầng tài liệu FastAPI, không cần màn hình quản trị riêng; OpenAPI dùng để đối chiếu contract.

## Form tạo giải mới

Tại `/races` → **Tạo giải chạy**. Gửi đúng RaceIn: tên 1–160 ký tự, số vòng nguyên 1–100, chế độ GPS/GPS kết hợp Arduino, tên tuyến tùy chọn, lịch bắt đầu/kết thúc tùy chọn chuyển từ múi giờ trình duyệt sang ISO, interval tùy chọn 1–3600 giây. Để trống interval gửi null cho BE áp cấu hình; không trình bày giá trị phỏng đoán như đã lưu. Status cố định DRAFT là lựa chọn sản phẩm của form (OpenAPI status là string, không phải enum). FE kiểm tra kết thúc không trước bắt đầu; đây là kiểm tra UX bổ sung, schema BE chưa có ràng buộc này.

Thành công tải lại danh sách/header, giữ giải đang xem nếu còn tồn tại, hiện link mở giải mới và xóa bộ lọc để không che kết quả. Có thể tạo giải đầu tiên khi danh sách trống. Không tự tạo checkpoint/run/participant, không tự chạy simulator. Giải mới cần cấu hình checkpoint qua API quản trị hiện có vì chưa có form tạo checkpoint; editor không tự sinh checkpoint.

POST /races chưa có idempotency key. Khóa submit khi đang gửi; 422 giữ input và hiện lỗi gần field; mạng/5xx báo kết quả chưa xác định và chặn gửi lại, cho đóng/tải lại danh sách để kiểm tra. Không tự suy ra thành công từ tên trùng, không tự retry POST.

## Kiểm tra

- Lint/typecheck, 32/32 unit test, build; build còn cảnh báo chunk >500 kB.
- `node scripts/verify-race-create.mjs`: browser fixture intercept toàn bộ API, 3 POST tạo được intercept (422, thành công, lỗi mạng), 0 ghi thật. Kiểm tra danh sách trống, validation không gửi, payload, busy guard, refetch list/header, lỗi giữ draft, mạng không retry, Escape/hủy không ghi; không có pageerror.
- Ảnh fixture: [create-race-isolated.png](test-results/ux/create-race-isolated.png).
- Chưa E2E tạo giải thật theo giới hạn không ghi dữ liệu hiện có. Không sửa backend, dependency, cấu hình kết nối hay dữ liệu lịch sử.
