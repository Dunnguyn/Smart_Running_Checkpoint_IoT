# Tích hợp Web, backend, app sinh viên và kit COM03

Tài liệu này mô tả hai luồng demo và hợp đồng app sinh viên đang được backend hỗ trợ. Dữ liệu API ghi vào SQLite dùng cùng các bảng `races`, `students`, `race_participants`, `checkpoints`, `run_sessions`, `gps_points`, `gps_passages`, `lap_events`, `devices` và các bảng app sinh viên. Riêng số liệu tháng nén được lưu có nhãn trong `scenario_demo_jobs` và `health_demo_days` để không trộn với thành tích GPS thật.

## Khởi động local

1. Khởi động backend từ `services/backend`:

   ```powershell
   .\.venv\Scripts\Activate.ps1
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. Tại `apps/admin-web`, tạo `.env` từ `.env.example`, rồi chạy:

   ```powershell
   Copy-Item .env.example .env
   npm ci
   npm run dev -- --host 0.0.0.0
   ```

3. Mở `http://localhost:5173`, nhập Admin key đang cấu hình trong backend. Trình duyệt xác thực bằng `POST /api/v1/auth/admin-key`; key chỉ ở `sessionStorage` và được gửi qua header `X-Admin-Key`. Không đặt key vào biến `VITE_*` hoặc commit `.env`.

Trên điện thoại, trình duyệt cần HTTPS để cấp quyền GPS. Dùng tunnel/reverse proxy HTTPS trỏ về máy chạy FE/BE; cập nhật `VITE_API_BASE_URL`, `VITE_WS_BASE_URL` và `CORS_ORIGINS` tương ứng. `127.0.0.1` trên điện thoại là chính điện thoại, không phải máy tính.

## Demo kit C04 · Lê Phương Linh

Trang quản trị có nút **Demo kit C04**. Nó gọi:

```http
POST /api/v1/demos/kit/sessions
X-Admin-Key: <admin-key>
Content-Type: application/json

{"serial_port":"COM03","student_code":"11235723","full_name":"Lê Phương Linh"}
```

Backend tạo một giải riêng, một sinh viên `11235723` / Lê Phương Linh / SBD `01`, một wearable GPS mô phỏng, đúng một checkpoint `NEU-C04` (`20.9999722222, 105.8418888889`) và thiết bị kit riêng của demo. Backend mở serial 9600 baud trong background; `COM03` được chuẩn hóa thành tên Windows `COM3` khi mở cổng. Không cần chạy simulator/gateway ở terminal khác. Đóng Arduino IDE Serial Monitor trước vì chỉ một tiến trình có thể giữ COM port.

Trình tự:

1. Chờ trạng thái `WAITING_START_BUTTON`, nhấn nút START trên kit. Sketch phải phát `START!`; backend chuyển sang `ARMED`.
2. Đi qua cảm biến. Sketch phát `LAP: 1`; sự kiện này gắn duy nhất với Lê Phương Linh và tạo phiên `ACTIVE`.
3. Backend sinh GPS di chuyển quanh C04 mỗi 0,5 giây trên polyline khoảng 31 m và ước tính bước từ quãng đường với sải bước 0,70 m. Sau khoảng 10 giây đi qua kit lần nữa; sketch phát `LAP: 2` và backend kết thúc phiên `COMPLETED`, race `COMPLETED`. Passage đầu được lưu làm mốc xuất phát và gắn với event Arduino; passage thứ hai mới có thể chốt vòng.

Trạng thái đọc bằng `GET /api/v1/demos/kit/sessions/{demo_id}`. Nút **Dừng demo kit** gọi `POST /api/v1/demos/kit/sessions/{demo_id}/stop`; nó đóng phiên đang chạy thành `ABANDONED`. Danh sách cổng serial đọc bằng `GET /api/v1/demos/kit/ports`. Backend không cung cấp API giả passage; nếu cổng không kết nối, kiểm tra trạng thái/lỗi Serial thay vì ghi nhận một lượt qua giả.

Kit chỉ báo người đi qua, không nhận dạng người. Việc gắn với Lê Phương Linh là do demo tạo đúng một người tham gia và đúng một run đang hoạt động; không dùng quy tắc này cho giải có nhiều runner. Sketch cần được nạp và kết nối đúng COM03 trước khi chạy demo. Chưa xác minh cổng COM vật lý trong môi trường này.

Polyline GPS của demo kit là một vòng ngắn minh họa quanh điểm C04, xấp xỉ 40 m để phù hợp thời gian demo 10 giây; đây không phải tuyến GPS 425 m của giải NEU chính thức. Bước chân và GPS được đánh dấu mô phỏng trong bản ghi.

## Demo ứng dụng sinh viên · thử thách 50 km / 30 ngày

Trong Admin Web, bấm **Tạo thử thách 50 km**. API `POST /api/v1/demos/health-month` tạo và tự chạy race `HEALTH_MONTH`, mục tiêu `50000 m`, thời hạn 30 ngày, mở self-registration, cấu hình checkpoint C04, thêm ba hồ sơ demo và tạo app account. Mỗi ngày ảo được ghi sau `duration_seconds / 30`; mặc định 60 giây cho cả tháng. Mật khẩu tạm chỉ trả trong response tạo demo; giao diện quản trị hiện chúng trong phần **Tài khoản app demo**.

Mở `/student-app` hoặc chọn **App sinh viên demo** từ sidebar. Sinh viên đăng nhập bằng mã sinh viên và mật khẩu, khám phá giải, tự đăng ký và nhận bib do backend cấp. Chọn GPS tại C04 để bắt đầu; trong buổi chạy app gửi batch GPS mỗi 5 giây, tạm dừng thì ngừng gửi, tiếp tục mở segment mới. Nút **Dừng tại checkpoint** gửi vị trí hiện tại; backend xác thực geofence, lưu mẫu GPS cuối, checkpoint passage nếu có, chốt phiên và lưu thời gian/quãng đường/bước. Lần sau cùng ngày hoặc ngày khác có thể mở một run mới. Một run đang hoạt động chặn run thứ hai.

API tạo demo tháng là `POST /api/v1/demos/health-month`; race chạy ngay sau khi tạo. Đọc tiến độ bằng `GET /api/v1/demos/health-month/{demo_id}` hoặc dashboard quản trị `GET /api/v1/races/{race_id}/challenge/dashboard`. Admin Web hiển thị bảng từng ngày với cự ly, thời gian, bước và tổng lũy kế của mỗi sinh viên. Ba hồ sơ demo, mỗi hồ sơ có 30 hàng ngày ảo:

| Sinh viên demo | Quãng đường/ngày | Tổng tháng | Nhịp demo | Kết quả |
| --- | ---: | ---: | ---: | --- |
| Nguyễn Minh Anh | 0,8–1,2 km | 30 km | 2,3 m/s | Chưa đạt 50 km khi hết tháng |
| Trần Đức Huy | 1,6–2,0 km | 50 km | 3,0 m/s | Đạt đúng mục tiêu ngày 30 |
| Phạm Thu Hà | 1,6–2,4 km | 64,8 km | 3,8 m/s | Vượt mục tiêu ngày 21, tiếp tục tới hết tháng |

Mỗi ngày ảo được ghi sau `duration_seconds / 30` giây; giá trị mặc định 60 giây nên tổng 30 ngày mất 60 giây. Quãng đường/ngày, thời gian chạy và bước chân được tính đồng bộ: thời gian = cự ly / tốc độ; bước = cự ly / 0,72 m. `health_challenge_demo_days` lưu từng ngày và tổng cự ly cộng dồn. Backend cũng ghi `RunSession`/`GpsPoint` với nguồn `HEALTH_DEMO`/`SIMULATED_GPS`; các bản ghi mang nhãn mô phỏng, không phải số đo thiết bị thật.

## Hợp đồng app sinh viên

| Nghiệp vụ | API |
| --- | --- |
| Đăng nhập / đổi mật khẩu | `POST /api/v1/student/auth/login`, `POST /api/v1/student/auth/change-password` |
| Tải hồ sơ, giải công khai, chi tiết, bản đồ | `GET /api/v1/student/me`, `/races`, `/races/{race_id}`, `/races/{race_id}/map` |
| Tự đăng ký và nhận số báo danh | `POST /api/v1/student/races/{race_id}/registrations` với `Idempotency-Key` |
| Lấy/bắt đầu phiên mỗi ngày | `GET /api/v1/student/current-run`, `POST /api/v1/student/races/{race_id}/runs` |
| GPS, pause/resume | `POST /api/v1/student/runs/{run_id}/gps-batches`, `/pause`, `/resume` |
| Dừng buổi ở checkpoint và tiến độ challenge | `POST /api/v1/student/runs/{run_id}/finish`, `GET /api/v1/student/races/{race_id}/progress` |
| Dashboard cá nhân / lịch sử / track | `GET /api/v1/student/dashboard`, `/runs`, `/runs/{run_id}/track` |

Tất cả API sinh viên lấy `student_id` từ Bearer token; client không được chọn danh tính. App không dùng QR, camera hoặc BLE. Giải challenge vẫn mở sau khi một sinh viên đạt 50 km; sinh viên được mở thêm các buổi chạy tới `end_at`. Kết thúc một buổi không đồng nghĩa hoàn tất race. Thời gian toàn phiên gồm khoảng pause; API progress trả thêm `active_total_seconds` và `paused_total_seconds`. Ngày thống kê dùng múi giờ `Asia/Ho_Chi_Minh`.

GPS app thật cần gửi snapshot bước theo phiên qua `steps_since_start`; nếu app không có cảm biến bước thì số bước được ước lượng từ GPS và phải gắn nhãn mô phỏng/ước lượng. Backend xác nhận GPS, chống trùng batch/sample, từ chối mẫu out-of-order và không nối quãng đường qua pause. Phiên challenge được bắt đầu tại checkpoint C04 và kết thúc bằng API `POST /api/v1/student/runs/{run_id}/finish` có vị trí GPS mới tại checkpoint kết thúc. Sau khi dừng, sinh viên có thể bắt đầu một buổi khác trong cùng giải cho tới ngày kết thúc; bản ghi ngày và tổng cộng được truy vấn tại `GET /api/v1/student/races/{race_id}/progress`.

## Thay đổi tọa độ checkpoint

Admin Web → **Checkpoint** → chọn điểm → **Chỉnh sửa vị trí**. Nhập riêng:

- `latitude` — vĩ độ WGS84.
- `longitude` — kinh độ WGS84.
- `radius_m` — bán kính nhận dạng mét.

FE gọi `PATCH /api/v1/checkpoints/{checkpoint_id}`. Backend yêu cầu gửi cả latitude và longitude. Thay đổi được cho phép trước khi có run; sau khi phiên đầu tiên được tạo, backend khóa tuyến để không làm sai lịch sử GPS và kết quả.

## Nhánh Git và giới hạn thiết bị

Trong lúc tích hợp, GitHub hiện chỉ công bố `be` và `main`; không có remote branch `fe` để checkout/merge. `apps/admin-web` đã nằm trong branch `be` nên được nối trực tiếp với API. Không có project mobile/native FE riêng trong repository; `/student-app` là web responsive dùng thử API sinh viên, mở được trên điện thoại qua HTTPS.
