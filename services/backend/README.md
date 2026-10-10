# NEU Smart Running — Backend

**Phạm vi: chỉ backend web.** Dự án cung cấp REST API và WebSocket cho Admin Web, dùng **FastAPI**, **SQLAlchemy** và **SQLite** làm cơ sở dữ liệu mặc định. Có thể cấu hình SQL Server sau nếu triển khai cần thiết. Không xây frontend hoặc ứng dụng di động. Thư mục Python `app/` chỉ là tên package chứa mã backend và trình mô phỏng.

## Những gì đã có

- Quản lý giải chạy, sinh viên, đăng ký và checkpoint.
- Gán một wearable ID cho runner; một thiết bị đeo gửi GPS và snapshot bước chân trong cùng telemetry request.
- Hỗ trợ hai chế độ theo race: `GPS_ONLY` giữ hành vi geofence cũ; `GPS_AND_ARDUINO` ghép GPS passage với sự kiện Arduino theo thời gian.
- Chế độ kết hợp lưu `UNKNOWN/OUTSIDE/INSIDE` bền vững, chỉ tạo passage khi đi từ ngoài bán kính 15 m vào trong 10 m; mất mẫu quá 5 giây sẽ khởi tạo lại trạng thái.
- Arduino event được xác thực và ghép sau cửa sổ thời gian; một ứng viên có thể ghép tự động, nhiều ứng viên chuyển `AMBIGUOUS` để Admin xác nhận, không tự chọn người gần nhất.
- Khi runner đạt `total_laps`, phiên tự chuyển `COMPLETED`, chốt thời gian và dừng bộ đếm. Race chuyển `COMPLETED` khi mọi participant đã hoàn tất.
- Kiểm tra tọa độ/thời điểm/bước tăng dần, chống gửi lặp và cộng khoảng cách Haversine.
- API Admin khởi động mặc định 5 sinh viên mô phỏng, gán bib `01`–`05`, tạo wearable/run đồng bộ thời điểm, rồi phát GPS/bước chân chuyển động quanh tòa Thế Kỷ.
- Simulator chạy liên tục theo polyline khép kín khoảng 425 m/vòng, đi qua bốn tọa độ checkpoint bạn cung cấp; có thêm các điểm bẻ tuyến mô phỏng để đạt 400–450 m. Các điểm bẻ hiện chưa được xác minh là đường chạy thực địa và có thể thay bằng điểm lấy từ bản đồ.
- API khởi chạy simulator ở chế độ `GPS_ONLY` hoặc `GPS_AND_ARDUINO`; dữ liệu giả được ghi rõ nguồn, không chứng minh danh tính người thật trước cảm biến.
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

   Để chạy thử không cần SQL Server, đặt `DATABASE_URL=sqlite:///./running_demo.db` trong `.env`. File database được đặt trong thư mục backend kể cả khi khởi chạy từ thư mục làm việc khác. Các bảng được tạo tự động và dữ liệu tồn tại sau khi tắt/mở lại server. `SIMULATOR_BASE_URL` mặc định là `http://127.0.0.1:8000`; cập nhật nếu API chạy ở port khác. Để dùng SQL Server, tạo database `iot_running`, cài Microsoft ODBC Driver 18, rồi cấu hình chuỗi kết nối mẫu trong `.env`; tùy chọn SQL Server chưa được kiểm thử trong lần rà soát này.

3. Khởi động web API:

   ```powershell
   # Nếu terminal đang ở repo root; nếu mở thẳng services/backend thì bỏ dòng cd.
   cd services\backend
   .\.venv\Scripts\Activate.ps1
   uvicorn app.main:app --reload
   ```

4. Mở `http://127.0.0.1:8000/docs` để xem và gọi API, hoặc `http://127.0.0.1:8000/health` để xem trạng thái.

5. Chạy mô phỏng trực tiếp qua API, không cần mở cửa sổ terminal thứ hai:

   - Trong `/docs`, bấm **Authorize** và nhập giá trị `ADMIN_API_KEY` vào header `X-Admin-Key`.
   - Gọi `POST /api/v1/simulations` với `{"checkpoint_mode":"GPS_ONLY","seed":42,"interval_seconds":0.5}`. Backend tự tạo giải demo, 5 runner `01`–`05`, 4 checkpoint, route, wearable và phiên chạy; 5 phiên có cùng thời điểm xuất phát.
   - Gọi `GET /api/v1/simulations/{simulation_id}` để xem log, trạng thái và `race_id`; dùng `GET /api/v1/races/{race_id}/dashboard` để theo dõi.
   - Nếu muốn dừng sớm, gọi `POST /api/v1/simulations/{simulation_id}/stop`. Sau đó có thể xóa giải bằng `DELETE /api/v1/races/{race_id}`.

   Mỗi runner liên tục di chuyển theo polyline đã lưu. Snapshot bước chân tăng theo quãng đường với sải bước mô phỏng 0.62–0.82 m, tương đương khoảng 6–9 bước trên 5 m. Các tốc độ được tạo khác nhau để thể hiện nhóm chạy trước/sau; dữ liệu là mô phỏng, không phải số đo thực. 4 vòng cần ít nhất 120 giây theo luật 30 giây/vòng; route khoảng 425 m dự kiến xấp xỉ 2 phút cộng độ trễ API. `GPS_AND_ARDUINO` có thể chọn trong body để demo ghép sự kiện; nhiều runner đến sát nhau có thể chuyển `AMBIGUOUS` theo quy tắc an toàn.

   Job simulator được theo dõi trong bộ nhớ của một backend process; race, run, GPS, bước chân và lap được lưu bền trong SQLite. Nếu server khởi động lại, gọi GET job cũ sẽ trả 404; các dữ liệu race đã ghi vẫn còn. Chế độ demo hiện dành cho một backend process.

SQLite lưu tại `running_demo.db` trong thư mục backend. Các bảng lưu giải chạy, sinh viên, đăng ký/bib, wearable và thiết bị checkpoint, checkpoint/tọa độ/thứ tự, phiên chạy, điểm GPS/bước chân, GPS passage, sự kiện Arduino và vòng chạy hợp lệ. SQLite bật khóa ngoại và WAL; tắt backend trước khi sao lưu database. File `.db`, WAL/SHM và `.env` bị loại khỏi Git.

### Tọa độ tuyến mô phỏng

Tuyến tạo theo thứ tự `C01 → C02 → C03 → C04 → C01`, có các điểm bẻ mô phỏng giữa checkpoint; C01 là điểm xuất phát và đích mỗi vòng. Sau vòng thứ tư, runner được ghi nhận hoàn thành giải. Các số thập phân dưới đây được chuyển đổi từ tọa độ độ–phút–giây bạn cung cấp:

| Checkpoint | Vĩ độ | Kinh độ | Tọa độ nguồn |
|---|---:|---:|---|
| NEU-C01 — Bắc / xuất phát + đích vòng | 21.0003888889 | 105.8425833333 | 21°00′01.4″N, 105°50′33.3″E |
| NEU-C02 — Đông | 21.0000000000 | 105.8434166667 | 21°00′00.0″N, 105°50′36.3″E |
| NEU-C03 — Nam | 20.9996111111 | 105.8426388889 | 20°59′58.6″N, 105°50′33.5″E |
| NEU-C04 — Tây | 20.9999722222 | 105.8418888889 | 20°59′59.9″N, 105°50′30.8″E |

Admin Web có thể đọc tuyến bằng `GET /api/v1/races/{race_id}/route`, thay toàn bộ polyline bằng `PUT /api/v1/races/{race_id}/route` (gửi danh sách điểm GPS có thứ tự và checkpoint anchor), hoặc sửa một checkpoint bằng `PATCH /api/v1/checkpoints/{checkpoint_id}`. Cận 400–450 m chỉ áp dụng cho profile `NEU_DEMO`; route `CUSTOM` không bị áp cận demo nếu không khai báo `route_length_min_m`/`route_length_max_m`. Các API trả trạng thái khóa và lý do; sau khi lưu, FE refetch route/dashboard để đọc cấu hình đã commit. Thay route/checkpoint chỉ được phép trước khi tạo run. Điểm bẻ trong simulator là đường hình học demo; để khớp vỉa hè/lối đi thật, lấy polyline từ bản đồ và gửi qua API PUT.

Admin/Gateway/Simulator keys chỉ đọc từ `.env` hoặc biến môi trường; không lưu các key này vào bảng và không commit `.env`. Dùng khóa riêng của bạn thay giá trị mẫu. Các bảng demo được tạo tự động khi ứng dụng khởi động. Với dữ liệu cần bảo toàn hoặc triển khai production, hãy chuyển sang Alembic migration và không dùng `create_all` làm quy trình nâng cấp schema.

## Liên kết frontend

- REST base URL khi chạy local: `http://localhost:8000/api/v1`.
- Admin gửi `X-Admin-Key: <ADMIN_API_KEY>` trong request; đây là cơ chế khóa API tương đương cho demo, cần thay bằng đăng nhập/JWT phù hợp trước production.
- Màn hình nhập khóa gọi `POST /api/v1/auth/admin-key` kèm `X-Admin-Key`; `200` cho phép mở Admin Web, `401` giữ người dùng ở màn hình nhập. API không khóa tài khoản/key sau số lần sai, theo yêu cầu demo.
- Số `01`–`05` là bib/display ID của participant trong demo; UUID `student_id` vẫn là khóa liên kết ổn định trong API.
- Dashboard tổng hợp dùng `GET /api/v1/races/{race_id}/dashboard`; trả summary, bảng runners, top runners và checkpoint events mới nhất.
- Admin bắt đầu demo bằng `POST /api/v1/simulations`; poll `GET /api/v1/simulations/{simulation_id}`, dừng bằng `POST /api/v1/simulations/{simulation_id}/stop`. `DELETE /api/v1/races/{race_id}` dừng simulator được quản lý thuộc giải đó rồi xóa dữ liệu race; các phiên ACTIVE không thuộc simulator được quản lý trả HTTP 409 và cần dừng/hoàn tất trước.
- Dashboard/live trả cả polyline route có thứ tự, tọa độ checkpoint và vị trí GPS mới nhất để frontend vẽ bản đồ/tiến độ.
- Dashboard trả danh sách 4 checkpoint đã sắp theo `sequence_no`; frontend có thể nối các tọa độ để vẽ tuyến và vẽ vị trí GPS mới nhất của từng runner.
- Admin Web đọc tuyến bằng `GET /api/v1/races/{race_id}/route`, thay tuyến bằng `PUT /api/v1/races/{race_id}/route` (polyline đóng, có checkpoint anchor), sửa vị trí/bán kính bằng `PATCH /api/v1/checkpoints/{checkpoint_id}`. Profile `NEU_DEMO` áp cận 400–450 m; profile `CUSTOM` dùng cận tùy chọn. Sau khi lưu route/checkpoint, FE tải lại route/dashboard để đồng bộ trạng thái đã commit. Chỉ sửa trước khi tạo run.
- Tải snapshot lần đầu bằng `GET /races/{race_id}/live`, sau đó mở WebSocket `ws://localhost:8000/ws/v1/races/{race_id}/live?key=<ADMIN_API_KEY>`.
- URL WebSocket có query key để tương thích API WebSocket trình duyệt; chỉ dùng local/demo qua HTTPS/WSS ở môi trường thật và không ghi key vào mã frontend công khai.
- Ví dụ payload và các điểm nối trong mã được đánh dấu `[FE LINK]`, `[SIMULATOR LINK]`, `[GATEWAY LINK]` và `[DEVICE LINK]`.

## Liên kết Simulator / Arduino Gateway

Admin gán wearable cho runner qua `POST /api/v1/runner-devices`; thiết bị thật gửi `X-Wearable-Key`, cùng GPS, `total_steps` và device ID tới `POST /api/v1/telemetry/gps` (giới hạn 12 m/s). Wearable key hiện dùng chung theo vai trò, không phải khóa riêng/crypto identity của từng thiết bị; backend vẫn đối chiếu device ID đã ghép với student và run. Simulator dùng `X-Simulator-Key` với ngưỡng tốc độ riêng cho demo; source GPS được xác định theo key xác thực, không theo trường `source` client gửi. Ở `GPS_ONLY`, GPS passage tại checkpoint loại `LAP` tính lap. Ở `GPS_AND_ARDUINO`, GPS chỉ tạo passage chờ đối chiếu.

Arduino không gọi HTTP trực tiếp: Gateway trên máy tính đọc USB Serial rồi gọi `POST /api/v1/checkpoint-events` với `X-Gateway-Key`, `device_event_id` ổn định và `student_id=null`. Admin đăng ký mapping thiết bị qua `POST /api/v1/checkpoints/{checkpoint_id}/devices`. Chỉ trong chế độ kết hợp, backend ghép event và passage; trường hợp mơ hồ cần `POST /api/v1/checkpoint-events/{event_id}/resolve`. Các API tra cứu là `GET /api/v1/checkpoint-events/{event_id}` và `GET /api/v1/races/{race_id}/checkpoint-events`.
## Tài liệu nhóm

- [Mã sơ đồ PlantUML](docs/PLANTUML_DIAGRAMS.puml)
- [Sơ đồ UML và ER](docs/UML_DIAGRAMS.md)
- [Quy tắc ghép Arduino/GPS và các điểm nối API](docs/ARDUINO_GPS_MATCHING.md)
- Đặc tả nghiệp vụ/API: `Dac_ta_nghiep_vu_va_API_Backend_IoT_NEU_RUN.docx`
- Hướng dẫn phần cứng: `Smart_Running_Checkpoint_Station_Huong_Dan_Chi_Tiet.docx`

## Lưu ý vận hành

- `Base.metadata.create_all()` ở cuối `app/main.py` tạo bảng cho bản demo. Production nên dùng Alembic.
- SQLite là cấu hình đã dùng để chạy demo. SQL Server connection string có hướng dẫn nhưng chưa được xác minh trong lần rà soát feedback này.
- WebSocket fan-out hiện ở bộ nhớ một tiến trình; nhiều worker/máy chủ cần Redis pub/sub.
- Các khóa API mẫu chỉ dành cho local. Không commit `.env` hoặc dùng khóa mẫu trên mạng công khai.
- GPS là dữ liệu mô phỏng nếu không có thiết bị; kết quả ghép phản ánh runner mô phỏng ở gần thời điểm event và không xác minh người thật.
- Đăng nhập hiện tại chỉ là API key demo, không phải tài khoản cá nhân. Worker ghép dùng polling database trong tiến trình; triển khai nhiều worker cần scheduler/claim coordination dùng chung database. WebSocket fan-out cũng chỉ ở bộ nhớ một tiến trình.
- Google Sheets, phần cứng GPS thật, xác thực tài khoản cá nhân và audit có user identity chưa nằm trong MVP.
