# NEU Smart Running · Admin Web

React / TypeScript / Vite, kết nối FastAPI bằng REST và WebSocket. API là chế độ mặc định; mock frontend vẫn chạy độc lập. Không kết nối database từ trình duyệt.

## Chạy cùng backend

Tại `services/backend`, tạo `.venv`, cài `requirements.txt`, sao chép `.env.example` thành `.env` và cấu hình khóa riêng theo README backend. Không commit `.env` hoặc khóa.

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --no-access-log
```

Dùng `--no-access-log` để tránh access log chứa query key WebSocket. Khi triển khai qua reverse proxy cần bỏ/redact query key trong log tại proxy. Backend mặc định cho phép origin `http://localhost:5173`; dùng nhất quán `localhost`, không mở trang bằng `127.0.0.1`.

Tại `apps/admin-web`:

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

Mở [http://localhost:5173](http://localhost:5173). Nếu cổng này bận, giải phóng cổng hoặc thêm đúng origin Vite thực tế vào `CORS_ORIGINS` của backend rồi khởi động lại backend. Không dùng `no-cors` hoặc tắt bảo mật trình duyệt. Dev/preview dùng hostname localhost; preview port 5174 cần được thêm vào CORS nếu dùng để kết nối API.

```env
VITE_DATA_MODE=api
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_WS_BASE_URL=ws://localhost:8000
```

Nhập **Admin key** của backend vào form đầu tiên. Khóa chỉ ở bộ nhớ; tải lại trang phải nhập lại. Nút **Nhập lại Admin key** hủy request/socket cũ. Không có key trong `VITE_*`, localStorage, sessionStorage, source hoặc log frontend. Chỉ race ID đang chọn được lưu trong sessionStorage. Đây là kết nối demo, chưa phải đăng nhập tài khoản/JWT. Khi trang chạy HTTPS, dùng HTTPS cho REST và WSS cho WebSocket.

Mở terminal khác tại backend, chạy một lần:

```powershell
python -m app.simulator --base-url http://localhost:8000 --laps 2
```

Nhấn **Thử lại / Làm mới**, chọn giải simulator tạo. Mặc định simulator gửi 9 GPS point trong khoảng 64 giây, min lap interval 30 giây; không thay ngưỡng. Simulator giữ run ACTIVE khi chạy xong, không tự hoàn thành. Kết thúc phiên qua API Admin `/runs/{run_id}/finish` khi cần; FE chưa có form kết thúc.

Để chạy độc lập: đặt `VITE_DATA_MODE=mock` rồi khởi động lại Vite. Chỉ mock mode có nút Bắt đầu/Tạm dừng/Đặt lại. API lỗi không chuyển sang mock, không tạo giải hoặc gửi telemetry khi mở trang.

## Màn hình và endpoint đã nối

Contract đối chiếu với `services/backend/app/main.py`, OpenAPI local và kiểm thử FastAPI thật. Read endpoints không khai báo response_model nên source/response thực tế là bằng chứng cho các trường response.

| Màn hình / tác vụ                  | Endpoint                                                | Chi tiết                                                                                                 |
| ---------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Chọn giải, danh sách/chi tiết giải | `GET /api/v1/races`                                     | Envelope `items`; `start_at` → `started_at`                                                              |
| Dashboard KPI                      | `GET /api/v1/races/{race_id}/overview`                  | `participants`, `active_runners`, `completed_runners`, `checkpoint_events`                               |
| Bảng runner                        | `GET /api/v1/races/{race_id}/runners`                   | `keyword`, `status`, `page`, `page_size`, `sort_by`, `sort_order`; envelope `items/total/page/page_size` |
| Bản đồ và state chung              | `GET /api/v1/races/{race_id}/live`                      | Chỉ ACTIVE, `latitude/longitude`; kết hợp toàn bộ trang runners để giữ COMPLETED/REGISTERED              |
| Chi tiết phiên                     | `GET /api/v1/runners/{student_id}/runs/{run_id}`        | Backend và adapter kiểm tra student/run identity                                                         |
| Lịch sử phiên                      | `GET /api/v1/runners/{student_id}/runs/{run_id}/events` | Phân trang GPS/LAP, `id`, `lap_no`, `duration_s`; không coi là DeviceEvent                               |
| Sự kiện checkpoint                 | `GET /api/v1/races/{race_id}/device-events`             | `device_event_id`, `identity_status`; không tự gán UNASSIGNED                                            |
| Live                               | `/ws/v1/races/{race_id}/live?key=…`                     | `type`, `data`, đôi khi có `race_id/occurred_at`; URL tạo bằng URLSearchParams                           |

Tìm kiếm debounce 300 ms; bỏ qua response của bộ lọc/giải cũ, đưa trang về đầu khi đổi filter. Backend không hỗ trợ sort duration, nên nút này vô hiệu hóa ở API mode. Bảng làm mới query tối đa mỗi 5 giây; tọa độ và chỉ số live dùng cache chung. Giới hạn page_size backend là 100, lịch sử 200; adapter đi hết các trang cần tải.

`REGISTERED` hiển thị Chưa bắt đầu, không tạo run_id giả và không mở chi tiết khi chưa có run. Mét → km, giây → HH:mm:ss, UTC → Asia/Ho_Chi_Minh. Timestamp SQLite thiếu timezone được hiểu là UTC theo cách backend lưu. Các dữ liệu thiếu hiển thị “—”. Màu ổn định theo student ID; không tự bịa BIB.

## Đồng bộ và giới hạn contract

- Live service tải snapshot trước socket, tải lại khi open/reconnect, buffer event khi REST đang tải. Deltas merge theo race/student/run ID; tổng lap/distance/steps được thay giá trị, không cộng. Tổng cũ không làm lùi số đã nhận; COMPLETED không bị event ACTIVE mở lại.
- `runner.updated` cập nhật từng runner; `runner.completed`, `checkpoint.detected`, `checkpoint.passed` và runner chưa biết kích hoạt tải lại có gom 1,5 giây. Không reload dashboard với mỗi GPS point. Reconcile 15 giây/lần bù dữ liệu thiếu, runner mới và trạng thái GPS cũ. Bản demo tải toàn bộ roster/device events, cần endpoint delta/cache phía server cho quy mô lớn.
- Backend chưa có sequence/version chung, một số event không có timestamp, các REST read không cùng transaction. Buffer và reconcile giúp hội tụ nhưng không bảo đảm thứ tự tuyệt đối hoặc giao nhận không mất sự kiện. Lịch sử được đọc lại mỗi 5 giây khi đang mở chi tiết.
- Socket có connecting/connected/reconnecting/disconnected; backoff 1–30 giây, tối đa 6 retry trong một subscription, lỗi auth 4401/4403/1008 dừng. HTTP 401/403 yêu cầu nhập lại khóa. Browser có thể che handshake auth thành 1006; retry vẫn bị giới hạn. Nút Thử lại khởi tạo lại subscription.
- Chưa có GET checkpoint, geometry tuyến, thông tin thiết bị checkpoint: trang checkpoint chỉ có device events theo ID, bản đồ không vẽ tuyến/checkpoint mock. KPI sự kiện không được dùng làm số checkpoint.
- GET race thiếu route_name, total_laps, participant_count; chỉ giải được chọn có participant count từ overview và total_laps từ runners (nếu có). BIB/faculty chưa có trong runners; run detail cũng không có total_laps, lấy bổ sung từ cache giải khi có.
- Backend không cung cấp ngưỡng stale; frontend dùng nhãn 30 giây, không đổi trạng thái nghiệp vụ. Nguồn runner hiển thị đúng `source` backend; kết nối API thật có thể nhận GPS SIMULATOR.
- Backend có POST tạo race/checkpoint nhưng UI hiện chỉ có nút disabled, chưa có form. Không tạo thêm module. Chưa có UI gán wearable; đã xác minh `POST /api/v1/runner-devices` nhận `device_id`, `student_id`, `name` tùy chọn và báo 409 `DEVICE_ID_EXISTS`, nhưng chưa gọi từ FE. Không có Simulator/Gateway key, telemetry hoặc lap-write trong bundle FE.

## Kiểm tra

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

Tests cover mapping, query contract, totals/partial events, completion, UNASSIGNED, auth/validation, request cancellation, snapshot buffer and StrictMode cleanup; mock simulator tests vẫn giữ.

Kiểm thử backend thật + Edge, chạy từ gốc repo (cần backend .venv và Edge; port 8000/5173 trống; build API mode trước):

```powershell
.\services\backend\.venv\Scripts\python.exe apps/admin-web/scripts/integration_api.py
```

Harness dùng SQLite tạm, khóa ngẫu nhiên trong bộ nhớ, tự chạy backend + preview ở localhost:5173, chạy simulator một lần mỗi lượt test và dừng các tiến trình do nó tạo. Không dùng database/.env hiện có. Báo cáo `test-results/api-integration.json`, ảnh `test-results/api-dashboard.png` đều gitignored. Không ghi header hoặc URL socket vào báo cáo. Chưa kiểm thử phần cứng Arduino/Gateway.

Script `npm.cmd run test:ui` là regression mock cũ: build với `VITE_DATA_MODE=mock`, giữ preview port 5174 rồi chạy. Không dùng script này để xác nhận tích hợp API.

### Kết quả kiểm thử ngày 04/10/2026

- TypeScript, production build, lint và 12 Vitest tests đều qua.
- Kiểm thử Edge với backend thật/SQLite tạm: khóa sai và nhập lại; database rỗng; tải/chọn đúng giải; một socket live; marker GPS di chuyển; đổi giải không nhận dữ liệu cũ; phục hồi mạng và resnapshot; 9 GPS point, 2 vòng/1.640 bước với ngưỡng mặc định; lịch sử GPS/LAP; kết thúc phiên giữ kết quả; reload yêu cầu key và student/run sai bị từ chối. Không có page error.
- Lượt dev đầu bị HMR reload khi đang sửa code, đã chạy lại bằng production preview và qua. Mỗi lượt test dùng DB tạm riêng, không nhân dữ liệu trong DB người dùng.
- Phục hồi mạng trong E2E có thao tác Làm mới; chưa xác minh đầy đủ chuỗi backoff tự động với backend thật. Buffer/cleanup/auth-stop có unit tests.
- Không có gateway vật lý nên chưa kiểm thử Arduino ngoài đời; UNASSIGNED không tăng lap được kiểm tra ở unit test. Tile OpenStreetMap không tải được trong môi trường thử; marker và chỉ số vẫn hoạt động, có cảnh báo fallback.

- Regression mock UI Edge qua ở desktop 1440×1080, tablet 820×1180, mobile 390×844; không tràn ngang, không request backend/WebSocket, giữ search/filter/sort/pagination, popup/layers, start/pause/reset và fallback tile. Sau tích hợp E2E, đã sửa vị trí thanh chọn giải và giữ bảng khi làm mới nền; build/lint/unit tests và regression mock được chạy lại thành công.
