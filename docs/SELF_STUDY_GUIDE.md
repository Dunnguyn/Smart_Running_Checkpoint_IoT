# Hướng dẫn tự dựng backend trong VS Code

Tài liệu này hướng dẫn tạo một bản backend riêng trên Windows bằng VS Code. Đây là backend web FastAPI; không tạo app mobile hay frontend. Các đoạn code hoàn chỉnh đã có trong `app/main.py` và `app/simulator.py`, có thể đối chiếu theo từng mục. Số dòng trong phần cuối là số dòng hiện tại và đổi khi sửa file.

## 1. Tạo thư mục và mở VS Code

1. Tạo một thư mục dự án, ví dụ `D:\study\Mạnh kết nối vạn vật\backend-ban-tu-lam`.
2. VS Code → **File → Open Folder...** → chọn đúng thư mục này.
3. Mở Terminal → **New Terminal**. Những lệnh tiếp theo chạy trong terminal PowerShell tại thư mục dự án.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install fastapi "uvicorn[standard]" sqlalchemy pydantic-settings python-dotenv
```

Nếu PowerShell chặn script trong cửa sổ hiện tại, chạy `Set-ExecutionPolicy -Scope Process RemoteSigned`, rồi activate lại. Tạo `requirements.txt` để cài lại thư viện trên máy khác:

```powershell
python -m pip freeze > requirements.txt
```

## 2. Tạo cấu trúc file

Trong Explorer của VS Code, tạo cấu trúc:

```text
backend-ban-tu-lam/
  app/
    __init__.py
    main.py
    simulator.py
  docs/
  .env
  .env.example
  .gitignore
  requirements.txt
```

`app/__init__.py` để trống; nó giúp Python nhận `app` là package. `main.py` chứa web API, model và quy tắc nghiệp vụ. `simulator.py` là client độc lập gửi dữ liệu demo qua HTTP giống wearable/Gateway. `.env` chứa khóa bí mật cục bộ, không commit file này.

Trong `.gitignore`, bỏ qua `.env`, `.venv/`, `__pycache__/`, `*.py[cod]` và `*.db`. Có thể chép nội dung từ file `.gitignore` của bản mẫu.

## 3. Tạo cấu hình môi trường

Sao chép `.env.example` thành `.env` và đặt khóa local riêng. Chạy thử nhanh với SQLite; để dùng SQL Server thì thay `DATABASE_URL` bằng connection string phù hợp và cài ODBC Driver.

```dotenv
DATABASE_URL=sqlite:///./running_demo.db
ADMIN_API_KEY=local-admin-key-change-this
SIMULATOR_API_KEY=local-simulator-key-change-this
WEARABLE_API_KEY=local-wearable-key-change-this
GATEWAY_API_KEY=local-gateway-key-change-this
MAX_GPS_SPEED_MPS=12
MAX_SIMULATOR_SPEED_MPS=18
MIN_LAP_INTERVAL_SECONDS=30
```

Mục đích tách key: Admin cấu hình/đọc dashboard; Simulator gửi run và GPS giả lập; wearable thật gửi GPS bằng Wearable key; Gateway gửi event Arduino. Simulator có ngưỡng tốc độ demo riêng để hoàn thành bốn vòng trong thời gian trình chiếu; wearable thật vẫn dùng ngưỡng thấp hơn. Không đặt key thật vào mã nguồn hoặc frontend công khai.

## 4. Viết phần nền và model trong `app/main.py`

1. Import FastAPI, SQLAlchemy, Pydantic, `datetime`, `uuid`, `hashlib`, `json`, `asyncio` và các thư viện khoảng cách/thời gian.
2. Đọc `.env` bằng `pydantic-settings`; tạo `engine`, `SessionLocal`, `Base(DeclarativeBase)` và dependency tạo/đóng session database cho mỗi request.
3. Tạo hàm `new_id()` sinh UUID và hàm UTC dùng thống nhất. Chuẩn hóa thời gian có timezone trước khi so sánh.
4. Tạo các model `Race`, `Student`, `RaceParticipant`, `Checkpoint`, `RaceRoutePoint`, `RunnerWearable`, `RunSession`, `GpsPoint`, `LapEvent`, `Device`, `DeviceEvent`. `RaceRoutePoint` lưu polyline GPS có thứ tự, gắn tùy chọn với checkpoint để việc đổi vị trí marker cũng cập nhật tuyến. Quan hệ trung tâm là Race → Participant → Student → Run; GPS gắn với Run; Arduino event gắn với Device và Checkpoint. `DeviceEvent.student_id` được nullable: Arduino không biết danh tính.
5. Bổ sung `GPSPassage` để lưu một lần runner đi từ ngoài vào trong geofence; `GeofenceState` lưu vùng `UNKNOWN/OUTSIDE/INSIDE` theo từng run/checkpoint; `MatchAudit` lưu admin xử lý event mơ hồ. `DeviceEvent` lưu trạng thái ghép, trạng thái tính vòng, deadline, candidates, version và lý do.
6. Đặt `Race.checkpoint_mode` mặc định `GPS_ONLY`. Thông số demo là inner 10m, outer 15m, match window ±3s, late grace 2s, sample gap 5s, tuổi event tối đa 10s và future skew 2s.
7. Tạo Pydantic input model cho race, student, checkpoint, participant, run, GPS, Arduino event, cấu hình matching và thao tác resolve. Validate tọa độ, bước chân, timestamp, mode và yêu cầu `student_id` của Arduino phải null.

Đối chiếu các model, schema và phần database ở đầu `app/main.py`. Bản demo gọi `Base.metadata.create_all()` khi khởi động và có migration nhỏ cho database demo cũ; hệ thống thật nên dùng Alembic.

## 5. Thêm xác thực API key và API khởi tạo

1. Viết helper so sánh header `X-Admin-Key`, `X-Simulator-Key`, `X-Wearable-Key`, `X-Gateway-Key` với cấu hình môi trường; thiếu/sai trả HTTP 401.
2. Tạo `POST /api/v1/auth/admin-key`. Frontend gửi key trong header; chỉ mở dashboard khi nhận 200. Sai key trả 401 và có thể thử lại không giới hạn; không xây cơ chế khóa sau N lần.
3. Tạo API tạo race/student/checkpoint/participant và đăng ký wearable.
4. Gán `bib_number` theo race cho mỗi participant (`01`, `02`, ...). Đây là nhãn để hiển thị, không thay thế UUID `student_id` khi liên kết API.
5. Tạo `PUT /api/v1/races/{race_id}/route` để lưu polyline đóng 400–450 m, cùng một điểm anchor cho mỗi checkpoint; tạo `GET` để frontend tải tuyến và `PATCH /api/v1/checkpoints/{checkpoint_id}` để sửa marker/radius. Khóa thay đổi khi đã có run để tránh đổi tuyến giữa cuộc đua.
5. Tạo `POST /api/v1/runs`: xác nhận participant đã đăng ký, wearable thuộc đúng student, không có phiên ACTIVE khác; lưu `started_at` từ server.
6. Trong `GPS_AND_ARDUINO`, khóa cấu hình sau khi run đầu tiên được tạo. Nếu đã khóa mà sửa mode/tham số, trả 409; muốn thử cấu hình khác thì tạo race mới.

## 6. Nhận GPS và snapshot bước chân

Tạo `POST /api/v1/telemetry/gps`, chấp nhận `X-Simulator-Key` cho dữ liệu demo (tối đa 18 m/s) hoặc `X-Wearable-Key` cho thiết bị thật (mặc định tối đa 12 m/s), rồi xử lý theo thứ tự: idempotency → kiểm tra race/run/student/wearable khớp → run ACTIVE → tọa độ hợp lệ → timestamp không lùi → bước chân không giảm → vận tốc/độ nhảy tọa độ theo nguồn → tính khoảng cách Haversine → lưu point và cập nhật run. Khi key idempotency bị gửi lại với payload khác, trả 409. Không cập nhật geofence nếu GPS bị từ chối.

`GPS_ONLY`: chuyển trạng thái geofence và đếm lap từ GPS theo hành vi cũ. `GPS_AND_ARDUINO`: GPS chỉ tạo passage bằng `OUTSIDE → INSIDE`; GPS không tự cộng vòng. Mẫu đầu ở bên trong chỉ khởi tạo trạng thái, không tạo passage; nếu mất mẫu quá 5 giây thì reset `UNKNOWN` để tránh suy luận passage giả.

GPS và tổng bước chân là dữ liệu giả lập trong demo. `source=SIMULATOR` phải thể hiện rõ đây không phải số đo phần cứng.

## 7. Nhận và ghép Arduino event

1. Admin đăng ký `device_id → checkpoint_id` ở `POST /api/v1/checkpoints/{checkpoint_id}/devices`.
2. Gateway gửi `POST /api/v1/checkpoint-events` với `X-Gateway-Key`, event ID ổn định, device ID, thời điểm phát hiện, `student_id=null`. Backend suy ra race/checkpoint từ mapping server và từ chối mapping sai.
3. Thời điểm tương lai quá 2s bị từ chối; event cũ hơn 10s được lưu `UNASSIGNED/LATE_DEVICE_EVENT`. Event mới ở chế độ kết hợp thành `PENDING_MATCH` và có deadline.
4. Worker quét các event đến hạn từ database. Ứng viên phải cùng race/checkpoint, passage được server nhận trước deadline, entry cách event không quá 3s, thuộc runner đã đăng ký, đúng wearable, run đang hoạt động tại thời điểm entry và passage chưa dùng.
5. Một ứng viên: tự ghép. Không có ứng viên: `UNASSIGNED`. Nhiều ứng viên hoặc nhiều event cạnh tranh cùng passage: `AMBIGUOUS`; khoảng cách chỉ sắp thứ tự cho admin xem, không tự chọn người gần nhất.
6. Khi ghép, đánh dấu passage đã tiêu thụ. Tính lap theo `occurred_at` Arduino và kiểm tra run ACTIVE, checkpoint LAP, thời gian vòng tối thiểu 30s và thứ tự thời gian. Danh tính có thể `MATCHED` trong khi lap là `NOT_COUNTED` kèm reason.
7. Admin xem event và xác nhận/bỏ qua event `AMBIGUOUS`; ghi audit/version/idempotency. WebSocket chỉ publish sau commit database.

Các API tra cứu/chốt: `GET /api/v1/checkpoint-events/{event_id}`, `GET /api/v1/races/{race_id}/checkpoint-events`, `POST /api/v1/checkpoint-events/{event_id}/resolve`. Trong `GPS_AND_ARDUINO`, `POST /api/v1/lap-events` không được dùng để bỏ qua xác nhận vật lý.

## 8. Dừng đồng hồ và hoàn tất runner

Đặt quy tắc cộng lap duy nhất trong hàm dùng chung `record_lap`. Sau khi tăng lap, nếu `lap_count >= race.total_laps`, ngay trong cùng nghiệp vụ:

- đặt `RunSession.status = COMPLETED`;
- ghi `ended_at` tại thời điểm crossing hợp lệ;
- lưu `duration_total_s = ended_at - started_at`;
- không nhận GPS/lap mới vào phiên đã kết thúc;
- dashboard trả `display_status = DONE`, `is_done = true`.

Không tính thời lượng completed bằng đồng hồ hiện tại. Với race, chuyển sang `COMPLETED` khi participant nào cũng có latest run hoàn tất. Logic này nằm tại `maybe_complete_run`, `record_lap` và `run_dict` trong `app/main.py`.

## 9. Dashboard, REST snapshot và WebSocket

Tạo `GET /api/v1/races/{race_id}/dashboard` bảo vệ bằng Admin key. Trả về race/mode, số người đăng ký/đã chạy/đang chạy/đã hoàn tất, tổng vòng/quãng đường/bước chân, thời lượng hoàn tất trung bình, event Arduino theo trạng thái, top runners và event gần đây. Từng runner phải có `display_id`/`bib_number` và `student_id` UUID riêng.

Tạo hoặc giữ `GET /runners`, `GET /live` làm API danh sách/snapshot. Frontend tải dashboard/snapshot bằng REST trước, sau đó mở WebSocket; khi reconnect thì tải snapshot lại. WebSocket chỉ là cập nhật giao diện, database mới là nguồn dữ liệu chính.

## 10. Mô phỏng, chạy và xem trên trình duyệt

Terminal 1:

```powershell
cd "D:\study\Mạnh kết nối vạn vật\backend"
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

Mở `http://127.0.0.1:8000/docs`. Terminal 2 tạo 20 sinh viên có bib `01`–`20`, GPS/bước chân di chuyển liên tục trên tuyến quanh A1/A2. Mỗi vòng qua bốn checkpoint; checkpoint thứ tư mới tăng số vòng. Tọa độ checkpoint chuyển từ bảng README; polyline demo thêm điểm bẻ mô phỏng để đạt khoảng 425 m/vòng. Tốc độ giả lập tăng tốc 14.3–17.3 m/s, GPS gửi mỗi 0.5 giây để demo bốn vòng hoàn chỉnh trong khoảng 98–119 giây:

```powershell
cd "D:\study\Mạnh kết nối vạn vật\backend"
.\.venv\Scripts\Activate.ps1
python -m app.simulator
```

Để minh họa quy tắc ghép GPS + Arduino:

```powershell
python -m app.simulator --mode GPS_AND_ARDUINO --students 4 --laps 4
```

Simulator tạo race mới, bốn checkpoint, polyline tuyến, participant, wearable và run. Mặc định `GPS_ONLY` là chế độ phù hợp để demo đủ 20 runner hoàn thành nhanh. Chế độ `GPS_AND_ARDUINO` có thể trả `AMBIGUOUS` khi nhiều runner qua checkpoint gần nhau, đúng theo rule không tự gán danh tính trong đám đông. Các điểm bẻ của polyline demo chưa được đối chiếu với lối đi thực địa; thay bằng polyline lấy từ bản đồ qua API PUT trước khi nhận thiết bị thật. Lấy `race_id` simulator in ở cuối rồi gọi `GET /api/v1/races/{race_id}/dashboard` trong `/docs` với `X-Admin-Key`.

## 11. Tự nối frontend và thiết bị thật sau này

- FE: base URL `http://localhost:8000/api/v1`; Admin key ở header `X-Admin-Key`; gọi dashboard và render `display_id` làm số lớn, dùng UUID làm khóa.
- Wearable: gửi GPS và `total_steps` trong một request tới `/telemetry/gps`, cùng `run_id`, `student_id`, `wearable_device_id`, timestamp và idempotency key; xác thực bằng `X-Wearable-Key` và giữ giới hạn 12 m/s. Simulator dùng `X-Simulator-Key` riêng, giới hạn 18 m/s để tăng tốc demo.
- Route/map: Admin Web tải `GET /races/{race_id}/route`, gửi polyline có thứ tự bằng `PUT /races/{race_id}/route`, và cập nhật marker/radius bằng `PATCH /checkpoints/{checkpoint_id}`. Route cần khép kín, dài 400–450 m, chứa anchor cho mọi checkpoint và chỉ sửa được trước khi tạo run.
- Arduino: board nối Serial tới Gateway; Gateway gửi event lên backend với `X-Gateway-Key`, device/event ID và timestamp. Board không tự gửi danh tính runner.
- Chế độ tích hợp: tạo race `GPS_AND_ARDUINO`, đăng ký mapping thiết bị trước khi mở run. Cấu hình ghép đã khóa sau khi tạo run.

## 12. Lưu ý về mức độ hoàn thiện

Đây là bản MVP/demo một backend process, SQLite local hoặc SQL Server. GPS hiện mô phỏng nên ghép chỉ suy luận runner mô phỏng gần thời điểm event, không chứng minh danh tính người thật. Trước production cần migration Alembic, worker claim/lock đa tiến trình, WebSocket fan-out dùng broker chung, xác thực user thật, HTTPS/WSS và đồng bộ giờ Gateway.

## Điểm nối mã nguồn hiện tại

| Phần | Tệp và dòng | Mục đích |
|---|---|---|
| Cấu hình SQLite và an toàn kết nối | [`app/main.py`](../app/main.py:45), [`app/main.py`](../app/main.py:67) | Đặt database cạnh backend, bật khóa ngoại và WAL. |
| Model dữ liệu lưu trong SQLite | [`app/main.py`](../app/main.py:95), [`app/main.py`](../app/main.py:120), [`app/main.py`](../app/main.py:129), [`app/main.py`](../app/main.py:140), [`app/main.py`](../app/main.py:154), [`app/main.py`](../app/main.py:167), [`app/main.py`](../app/main.py:189), [`app/main.py`](../app/main.py:207), [`app/main.py`](../app/main.py:241), [`app/main.py`](../app/main.py:255), [`app/main.py`](../app/main.py:264), [`app/main.py`](../app/main.py:274) | Race, student, participant, checkpoint, route polyline, run, GPS, GPS passage, lap, device, wearable và Arduino event. |
| Xác thực Admin và endpoint kiểm tra key | [`app/main.py`](../app/main.py:494), [`app/main.py`](../app/main.py:805) | Sai key trả 401; không khóa sau số lần nhập sai. |
| Hoàn tất phiên và chốt đồng hồ | [`app/main.py`](../app/main.py:592), [`app/main.py`](../app/main.py:604), [`app/main.py`](../app/main.py:1287) | Đủ số vòng của race thì chuyển `COMPLETED` và chốt thời lượng. |
| Tạo sinh viên, wearable, checkpoint và registration | [`app/main.py`](../app/main.py:828), [`app/main.py`](../app/main.py:837), [`app/main.py`](../app/main.py:848), [`app/main.py`](../app/main.py:964) | API quản trị chuẩn bị giải và các điểm nối thiết bị. |
| Tạo run và nhận GPS + steps | [`app/main.py`](../app/main.py:982), [`app/main.py`](../app/main.py:1008) | Frontend/Admin tạo run; simulator hoặc wearable gửi telemetry. |
| Nhận checkpoint event và xử lý match | [`app/main.py`](../app/main.py:1141), [`app/main.py`](../app/main.py:1492), [`app/main.py`](../app/main.py:1226) | Gateway gửi event; worker đối chiếu; Admin xử lý ambiguity. |
| API dashboard / danh sách runner / polyline | [`app/main.py`](../app/main.py:1310), [`app/main.py`](../app/main.py:1365), [`app/main.py`](../app/main.py:1386), [`app/main.py`](../app/main.py:855) | Trả KPI, bib hiển thị, checkpoint, tuyến và vị trí runner. |
| WebSocket live | [`app/main.py`](../app/main.py:1429) | Phát dữ liệu đã commit cho Admin Web. |
| Tạo bảng và nâng schema demo | [`app/main.py`](../app/main.py:1442), [`app/main.py`](../app/main.py:1445) | Tạo bảng mới, gồm cả bảng `race_route_points`, trong SQLite. |
| Tạo 20 runner di chuyển và phát GPS/steps | [`app/simulator.py`](../app/simulator.py:25), [`app/simulator.py`](../app/simulator.py:113), [`app/simulator.py`](../app/simulator.py:163), [`app/simulator.py`](../app/simulator.py:186) | Mặc định 20 người; GPS chạy liên tục trên polyline ~425 m; checkpoint theo bốn tọa độ người dùng cung cấp. |
| Đọc/thay polyline tuyến và sửa checkpoint | [`app/main.py`](../app/main.py:855), [`app/main.py`](../app/main.py:861), [`app/main.py`](../app/main.py:895) | GET/PUT tuyến; PATCH checkpoint đồng bộ anchor tuyến; chỉ trước khi bắt đầu run. |
| Bộ sơ đồ hệ thống | [`UML_DIAGRAMS.md`](UML_DIAGRAMS.md) | Có Use Case, Activity, BPMN AS-IS/TO-BE, DFD, ERD, Sequence, Swimlane, State, Class, Context, Mind Map, Journey và Component. |

Số dòng tham chiếu áp dụng cho phiên bản hiện tại; VS Code có thể mở trực tiếp file theo các link tương đối trên.
