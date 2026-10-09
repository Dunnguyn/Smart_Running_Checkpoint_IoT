# Điều tra và kế hoạch E2E để duyệt — 07/10/2026, Asia/Saigon

**Trạng thái mới nhất:** backend do người dùng chuyển sang **localhost:8001**. FE `.env` đã đổi cả REST và WS sang 8001. Không sửa backend hoặc dữ liệu nghiệp vụ. Các kết luận/cổng và cách suy luận khóa trong các bản ghi lịch sử bên dưới không còn là trạng thái hiện tại.

## 1. Run ACTIVE đạt 2/2 — bằng chứng, giả thuyết và độ chắc chắn

API thật được gọi lại ở cổng 8001, header `X-Admin-Key: [REDACTED]`, không body:

- GET `/api/v1/races/c2a09d3e-5b4f-4c28-9baf-d06fe1a91296/dashboard`: **200**, race LIVE, GPS_ONLY, total_laps=2; participants=1, started=1, active=1, completed=0, laps_recorded=2, runners_at_lap_target=1.
- GET `/api/v1/runners/0c0b2cc1-590f-4b97-a9a6-a9baaabbfc8c/runs/6fc37ec3-293b-434f-917c-c1d30567a8a6`: **200**, ACTIVE, is_done=false, lap_count=2, total_laps=2, ended_at=null, source=SIMULATOR, last_lap_duration_s=32. duration_total_s=265760 tại một lần đọc; đây là thời gian đang tính, không phải thời gian đã chốt.
- GET cùng run `/events?page_size=200`: **200**, total=11; 9 GPS và 2 LAP, đủ trong một trang. LAP1 id `14496bff-5482-46c5-8c75-d9969b4c75ba`, occurred_at=2026-10-04T09:00:35 UTC, duration_s=31; LAP2 id `cdf690ac-c343-45c1-9145-bdd87cdd3c45`, occurred_at=2026-10-04T09:01:07 UTC, duration_s=32. Đây là vòng đã được backend ghi nhận, không suy từ GPS ở FE; không chứng minh cảm biến/người thật.

Các timestamp SQLite không ghi timezone trong JSON; source `aware()` coi là UTC. Quy đổi +07:00:

| Mốc | Giờ Việt Nam 04/10/2026 |
|---|---|
| Run started_at 09:00:03.584690 UTC | 16:00:03.584690 |
| LAP1 | 16:00:35 |
| LAP2 | 16:01:07 |
| last_seen_at 09:01:26.232343 UTC | 16:01:26.232343 |
| Commit `0968baa` thêm Arduino matching/dashboard/tự hoàn thành | 22:27:00 |

Đối chiếu Git/source:

- Commit trước `ec92a62` (04/10 00:49:04 +07): GPS_ONLY tăng lap_count và ghi LapEvent nhưng **không có maybe_complete_run**; chuyển COMPLETED chỉ có ở endpoint finish thủ công (source cũ khoảng dòng571).
- Source hiện tại app/main.py:484–514: `record_lap` kiểm tra ACTIVE, thời điểm sau anchor, khoảng cách thời gian tối thiểu, chưa vượt mục tiêu; ghi vòng rồi gọi `maybe_complete_run`, chốt ended_at/duration và `maybe_complete_race` nếu mọi participant hoàn tất.
- GPS_ONLY: telemetry crossing ngoài→trong gọi record_lap (881), commit rồi phát runner.updated/checkpoint.passed/runner.completed khi hoàn thành.
- GPS_AND_ARDUINO: GPS chỉ tạo passage (896–925). Worker ghép hoặc resolve CONFIRM gọi `finish_match` (586–618) → record_lap → tự hoàn thành. DISMISS không gọi record_lap.
- Đọc dashboard/live/history không sửa run. Startup worker chỉ xử lý DeviceEvent PENDING_MATCH đến hạn; không quét để chốt run GPS_ONLY cũ đủ vòng. `record_lap` hiện tại cũng trả sớm khi lap_count đã đạt target trước khi gọi maybe_complete_run, nên không nên thử gửi thêm telemetry để “sửa” bản ghi.

**Kết luận chắc chắn:** dữ liệu hiện tại không thỏa invariant nghiệp vụ mới (ACTIVE ở target); FE đang phản ánh đúng API, không phải lỗi tính vòng của FE.

**Giả thuyết mạnh:** run được tạo bởi logic trước khi thêm tự hoàn thành rồi tồn lại. Hai vòng xảy ra trước commit mới hơn 6 giờ và source cũ giải thích chính xác trạng thái này. **Chưa thể chứng minh tuyệt đối** vì thời điểm commit không chứng minh thời điểm deploy, dữ liệu mô phỏng có thể mang timestamp đặt trước, không có audit revision tạo run hay log tiến trình lúc đó. Không kết luận đường ghi hiện tại hỏng khi chưa tái hiện với race mới.

Chuyển BE: xác minh lịch sử deploy/DB và xác định chính sách xử lý legacy run; đề xuất audit version và cơ chế reconciliation được duyệt riêng. Không tự POST finish, không sửa DB, không dùng run này làm E2E.

## 2. Realtime — contract và điều kiện phát

| Producer trong app/main.py | Điều kiện sau commit | Message / payload | FE |
|---|---|---|---|
| telemetry 934–938 | GPS hợp lệ mới | runner.updated (full run + latitude/longitude); checkpoint.passed nếu crossing; runner.completed khi hoàn thành | Nhận cả latitude/longitude và last_latitude/longitude; cập nhật run đúng race/student/run |
| Gateway event 982 | Sự kiện mới được chấp nhận | checkpoint.match.updated, DTO event/version | Invalidate + merge version, không tự tăng lap |
| Matching worker 1284–1297 | PENDING_MATCH đến hạn được xử lý | checkpoint.match.updated; nếu COUNTED thì runner.updated; nếu completed thì runner.completed | Refresh snapshot/dashboard, xử lý full status |
| Resolve 1058–1060 | CONFIRM/DISMISS thành công | checkpoint.match.updated; nếu COUNTED thì runner.updated đầy đủ, **không phát riêng runner.completed ở đây** | Không lỗi contract: handler runner.updated cũng đọc data.status=COMPLETED và duration; không phụ thuộc riêng message completed |
| Lap API 1083–1085 | Lap hợp lệ mới | runner.updated, thêm runner.completed khi chốt | Chấp nhận full run |
| Finish 1097 | ACTIVE được finish thủ công | runner.completed dạng tối giản {student_id,run_id,duration_total_s}, không race_id ở envelope | Socket gắn race; match student/run trong race hiện tại, rồi resync |

- `EventHub.clients` theo race_id; publish chỉ gửi clients của race đó. Không global broadcast. FE kiểm tra envelope race_id và data.race_id khi có; run match theo ba ID; cleanup race cũ, resync sau open/reconnect.
- `checkpoint.passed` GPS_ONLY có ASSIGNED/lap_updated, FE chỉ invalidate; GPS_AND_ARDUINO có GPS_PASSAGE_PENDING_ARDUINO/passage_id/lap_updated=false, FE ghi thông báo bằng chứng GPS chưa tính vòng.
- GET/read và WS connect không phát dữ liệu; server WS chỉ receive_text, không tự phát heartbeat/update; duplicate request có nhánh return sớm. Không có dữ liệu mới thì không có message là bình thường.
- Đã đọc handlers FE và producer backend: **không phát hiện ánh xạ sai cần sửa** trong các message hiện có. Thiếu message runner.completed riêng ở resolve không gây bỏ sót trạng thái vì runner.updated đầy đủ.
- Kiểm thử chỉ đọc ở 8001: handshake/reconnect/đổi race/logout đạt; **0 message nghiệp vụ thực tế**. Không tạo message giả, không gọi producer. Chưa thể khẳng định delivery/end-to-end của producer cho tới kế hoạch ghi bên dưới.
- Giới hạn cần BE xem xét: không sequence chung hoặc durable replay; hub chỉ trong một process. Snapshot resync giúp hội tụ nhưng không bảo đảm nguyên tử mọi panel.

## 3. API cần bổ sung — ĐỀ XUẤT, chưa tồn tại

Đã kiểm tra inventory routes source và OpenAPI; các lần GET runtime trước ở cùng source trả 405 cho matching-config/checkpoints/devices và 404 cho checkpoint detail. Dữ liệu GET dashboard/overview/live/runners/history/checkpoint-events/device-events không thay thế các trường thiếu.

| Nhu cầu FE | Endpoint hiện có đã đối chiếu | Hợp đồng đề xuất cho BE (chưa triển khai) |
|---|---|---|
| Giá trị cấu hình thực và trạng thái khóa | GET dashboard chỉ mode/config_version; PATCH checkpoint-matching trả config nhưng không được dùng PATCH để đọc | **GET /api/v1/races/{race_id}/checkpoint-matching** → {race_id,checkpoint_mode,inner_radius_m,outer_radius_m,match_window_seconds,late_grace_seconds,max_sample_gap_seconds,max_event_age_seconds,max_future_skew_seconds,config_version,matching_locked:boolean,matching_locked_at:ISO8601|null,lock_reason:string|null,server_time}. Số đo m/giây, khóa do server tính bằng cùng quy tắc PATCH; unknown/null không bị coi là unlocked |
| Metadata checkpoint để chọn ID/vẽ đúng vị trí | POST tạo; event trả checkpoint_id; history có GPS runner, không geometry checkpoint | **GET /api/v1/races/{race_id}/checkpoints** → {items:[{checkpoint_id,race_id,code,name,kind,sequence_no,latitude:number|null,longitude:number|null,radius_m:number}],next_cursor:string|null}; tùy chọn GET /checkpoints/{id}. Không bịa tọa độ cho null |
| Danh sách mapping và evidence kết nối thiết bị | POST /checkpoints/{id}/devices trả status đăng ký; GET event chỉ có device_id/source | **GET /api/v1/checkpoints/{id}/devices** → {items:[{device_id,checkpoint_id,name,registration_status,last_event_at:ISO8601|null,last_heartbeat_at:ISO8601|null,connection_status:ONLINE|OFFLINE|UNKNOWN,connection_evidence:string|null,source_kind:SIMULATED|HARDWARE|UNKNOWN}],server_time}. Không có heartbeat thì UNKNOWN; event Gateway không đủ bằng chứng hardware identity |

Đề xuất dùng X-Admin-Key, 401/404 và envelope lỗi thống nhất, timestamp UTC rõ timezone, config_version đơn điệu. Khi BE duyệt schema mới mới thêm DTO/GET phía FE; **không gọi các endpoint đề xuất như thể đã tồn tại**.

FE đã sửa: không còn suy khóa từ started_runners; hiển thị “Chưa có dữ liệu trạng thái khóa: API đọc chưa hỗ trợ trường này”. Chỉ chuyển form sang khóa khi request lưu trong tương lai nhận **409 + code MATCHING_CONFIG_LOCKED**, không coi mọi409 là khóa. Không có thao tác PATCH nào trong lượt này. Mode là dữ liệu backend có thật; số đo chưa biết vẫn —. Thiết bị không gắn nhãn online; metadata thiếu vẫn báo chưa hỗ trợ.

## 4. Ô bản đồ — bằng chứng và phân loại

- Source LiveMap.tsx dùng `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`; không API key, không proxy, không đổi nhà cung cấp.
- Không gửi lại tọa độ runner để chẩn đoán: bộ duyệt tự động chặn việc đó vì có thể xuất vị trí ra ngoài. Chọn **tile công khai toàn thế giới 0/0/0** để kiểm tra mạng, không đọc GPS tạo URL.
- Edge headless gọi trực tiếp `https://a.tile.openstreetmap.org/0/0/0.png`, tương tự b và c: cả ba có **HTTP status=null**, requestfailed=`net::ERR_CONNECTION_REFUSED`. Không có HTTP response nên không gán 403/429/500, không kết luận lỗi key/CORS/rate limit.
- Chắc chắn: kết nối từ môi trường trình duyệt tới tile host bị từ chối trước HTTP. Chưa xác định phía từ chối là mạng local, proxy/firewall hay upstream. URL cấu trúc đúng và lỗi tái hiện độc lập với React/Leaflet, nên ít khả năng do dựng URL FE. Chưa đủ bằng chứng quy lỗi dịch vụ OSM.
- Marker Leaflet, popup, bảng runner dựa trên API độc lập với tile; không ẩn khi tileerror. UI giữ cảnh báo tải nền lỗi. Kiểm thử UI lại với **tile bên ngoài bị chặn chủ động trước tải trang** xác nhận luồng dữ liệu vẫn hoạt động; không đánh đồng fault injection này với phép đo network thật ở trên.
- Không thay provider, không thêm dịch vụ trả phí, không tắt kiểm tra TLS. Cần người vận hành mạng kiểm tra firewall/proxy/DNS và thử URL tile công khai trên trình duyệt thường. Artifact: test-results/tile-investigation.json; script scripts/investigate-tiles.mjs.

## 5. Kế hoạch E2E ghi dữ liệu để người dùng DUYỆT — CHƯA THỰC HIỆN

### Ranh giới và dữ liệu nền

- Không dùng run bất thường `6fc37ec3-293b-434f-917c-c1d30567a8a6` hoặc sửa 4 race hiện có.
- Race cũ `b033f984-24a8-45c8-84b7-52769ad0a15e`, checkpoint `2bfc8bb6-2a78-4b7b-9f0b-3b7edb7b9f09`, event `31a6ed14-cebc-4a03-b864-0cdb2fd38f8d` MATCHED/COUNTED version2 chỉ làm đối chiếu **GET**. Không resolve/tái đăng ký thiết bị cũ.
- Đề xuất tạo 3 race demo mới có tên/namespace ngày+run-token, ID lấy từ response chứ không đặt trước: **AUTO** (1 runner), **CONFIRM** (2 runner), **DISMISS** (2 runner), GPS_AND_ARDUINO, total_laps=1. Tùy chọn race **GPS-ONLY** riêng 1 runner để kiểm tra Arduino UNASSIGNED không cộng vòng.
- Tất cả student/device/idempotency ID có namespace duy nhất. Không reset/xóa DB/seed trực tiếp; nếu được duyệt, setup qua HTTP công bố. Giữ dữ liệu/audit sau test; cleanup/xóa cần quyền riêng.
- Trước khi viết xác minh host8001 là đúng DB local/demo và thống nhất danh sách record được phép. Key Simulator/Gateway chỉ nằm trong tiến trình test phía người vận hành, không đưa vào FE hoặc log. Giữ bản kê ID từ mỗi response để tái kiểm tra.

### Các bước và thay đổi dự kiến

| Bước | Request/hành động dự kiến | Dữ liệu thay đổi | Điều kiện/kết quả mong đợi |
|---|---|---|---|
| 1. Tạo race | Admin POST /races với tên namespace, mode, total_laps=1 | 3 Race mới | 201; lưu race_id và full config response. Các trạng thái chọn theo contract hiện có, không sửa race cũ |
| 2. Cấu hình trước khóa | Admin PATCH /races/{new_id}/checkpoint-matching trước khi có run | Mode/tham số/config_version race mới | Dùng giá trị demo được duyệt: inner10m/outer15m, window3s/grace2s, gap5s, age10s/skew2s; gửi rõ field cần thử; 200/config_version tăng. Không gọi PATCH rỗng để giả GET. Radius không hợp lệ 422 phải không đổi config |
| 3. Setup định danh | Admin POST /students, /runner-devices, /races/{id}/participants; bib01/02; POST /races/{id}/checkpoints kind=LAP | Student, wearable, participant, checkpoint mới | 201/UUID; checkpoint tọa độ thử được người dùng chọn và cho phép, không lấy vị trí run cũ. Không suy từ bib làm API key |
| 4. Đăng ký Gateway | Admin POST /checkpoints/{new_cp}/devices với device_id mới | Mapping Device mới | 201 đúng race/checkpoint; UI chỉ báo đăng ký, không online. Không dùng ID thiết bị đang vận hành |
| 5. Mở run và socket | Simulator POST /runs với wearable và idempotency key; Admin WS theo race | RunSession, trạng thái race/khóa theo backend | Socket raceA/B tách biệt. Thử PATCH race mới sau start →409 MATCHING_CONFIG_LOCKED; config không đổi, FE lúc đó mới xác nhận khóa |
| 6. GPS evidence | Test driver/Simulator gửi /telemetry/gps có thời điểm thực, unique idempotency, tốc độ/steps hợp lệ, mẫu cách nhau<=gap; đi OUTSIDE→INSIDE sau tối thiểu min_lap_interval | GpsPoint, GeofenceState, GPSPassage; distance/steps | Quan sát runner.updated và checkpoint.passed GPS_PASSAGE_PENDING_ARDUINO thật; lap vẫn0. Không dùng thời gian tương lai vượt skew hoặc backdate vượt age; không hạ ngưỡng để test qua |
| 7. AUTO Gateway | Driver Gateway POST /checkpoint-events cho AUTO, device_event_id ổn định, occurred_at gần entry trong window | DeviceEvent PENDING_MATCH rồi worker chuyển trạng thái; tiêu thụ passage; LapEvent/Run nếu hợp lệ | Chờ cửa sổ+grace đóng (không assume phản hồiPOST là COUNTED). Một candidate →MATCHED/COUNTED, runner.updated/completed thật; GET lap1/statusCOMPLETED/ended_at/duration chốt; raceCOMPLETED khi toàn participant xong |
| 8. CONFIRM mơ hồ | 2 runner hợp lệ vào trong cùng cửa sổ + một Gateway event cho CONFIRM | 2 passage, event AMBIGUOUS/candidates_final sau deadline | Dừng gửi producer; đọc event và version hiện tại. Admin tự chọn passage backend cung cấp; FE không tự chọn gần nhất. Chưa gửi CONFIRM nếu thiếu available candidate |
| 9. Admin CONFIRM | POST /checkpoint-events/{new_event}/resolve {action:CONFIRM,passage_id,expected_version,idempotency_key,reason} | MatchAudit, consume passage, event/version, có thể LapEvent/Run/race | 200 MATCHED, lap_status riêng COUNTED/NOT_COUNTED theo điều kiện. Với ca hợp lệ mong COUNTED, runnerCOMPLETED. Quan sát checkpoint.match.updated + runner.updated statusCOMPLETED; không bắt buộc runner.completed riêng vì source resolve không phát nó |
| 10. Retry và conflict | Thử lại đúng payload/key sau mô phỏng mất response; rồi request version cũ trên event test thích hợp | Retry phải không thêm audit/lap; conflict phải không mutate | Kiểm tra idempotency; event đã resolved trả EVENT_ALREADY_RESOLVED trước VERSION_CONFLICT theo thứ tự source. Muốn test VERSION_CONFLICT thực sự cần event vẫnAMBIGUOUS với version không khớp. FE refetch, không tự đổi version rồi gửi lại |
| 11. Hoàn thành race CONFIRM | Tạo crossing+Gateway hợp lệ tiếp theo cho runner còn ACTIVE sau điều kiện geofence/time; chỉ một candidate khả dụng | Lap/run còn lại và trạng thái race | Toàn participantCOMPLETED thì raceCOMPLETED; duration các run không tăng sau chờ/refresh/reconnect. Không gọi finish để che lỗi tự hoàn thành |
| 12. Admin DISMISS | Trên raceDISMISS, tạo2passage+eventAMBIGUOUS finalized riêng; POST resolve {action:DISMISS,passage_id:null,expected_version,idempotency_key,reason} | Event REJECTED/NOT_COUNTED, version và audit | Không cộng lap; không chốt run. Quan sát checkpoint.match.updated thật; cùng key/payload retry không lặp |
| 13. GPS_ONLY tùy chọn | GPS crossing hợp lệ và Gateway event ở raceGPS-ONLY mới | GPS có thể ghi lap; Gateway event UNASSIGNED | So sánh trước/sau Gateway tách với GPS: Gateway không tăng lap; completion do vòng GPS hợp lệ |

**Điều kiện duyệt:** cho phép các POST/PATCH/producer trên 3 race mới (và race GPS_ONLY nếu chọn), chọn tọa độ checkpoint thử, chấp thuận driver tạo GPS/Gateway mô phỏng và fault injection response. Cần quyền tạo student/wearable/checkpoint/participant/run tương ứng; không chỉ duyệt resolve riêng vì hiện chưa có AMBIGUOUS phù hợp.

### Tách Gateway mô phỏng và kit thật

- Nhánh **demo phần mềm**: driver test tạo GPS và HTTP Gateway theo thời gian thực, lưu nhãn SIMULATED. Chứng minh API/matching/FE/WS, **không chứng minh Arduino hoạt động**. CLI simulator hiện tại không tự bảo đảm kịch bản AMBIGUOUS; cần driver có lịch phát rõ hoặc thủ công có kiểm soát, chỉ chạy sau duyệt.
- Nhánh **kit Arduino thật**: dùng một race mới khác, checkpoint/device mapping riêng, người dùng xác nhận kit+cổng serial+Gateway chạy thực và nguồn GPS wearable (thật hay mô phỏng phải ghi riêng). Tạo passage GPS phù hợp và đi qua sensor thật; ghi thời gian serial, device_event_id, HTTP response và event/version để đối chiếu với message WS/GET. Không suy danh tính người thật chỉ từ phép ghép GPS. Không dùng HTTP giả rồi báo thử kit thật đạt.
- Cả hai nhánh cần observer WS ghi type/race_id/event_id/version/timestamp, không lưu query key. Đối chiếu với API sau mỗi bước, cùng-race nhận và race khác không nhận, reconnect resync. Chỉ kết luận “message thật đã nhận” khi có frame do producer/worker phát, không inject WS frame từ FE.

## 6. Thay đổi và kiểm tra cuối lượt điều tra

- FE `.env` local → REST/WS8001 theo người dùng; không đổi backend .env. Form matching bỏ giả định khóa, chỉ khóa sau mã lỗi xác nhận. Cập nhật script đọc UI theo trạng thái UNKNOWN và base URL từ env; thêm tùy chọn chặn tile ngoài khi kiểm thử. Script harness ghi cũ chỉ cập nhật assertion, **không chạy**.
- Dependency FE bị thiếu; npm ci lần đầu vướng esbuild cũ giữ file. Dừng đúng Vite do agent khởi động trước (37272) và esbuild con20356; npm ci theo lockfile thành công, không thay phiên bản khai báo. Frontend chạy lại PID **47736**, localhost5173. Không khởi động/dừng backend trong lượt này; cổng8000 trả401 do nhầm runtime, 8001 đúng.
- Lint/typecheck/build đạt; **23/23 unit test đạt**. UI read-only ở8001 đạt: auth/race/read/bib/identity/refresh/reconnect/logout, lockUNKNOWN, protected401 và500 fault injection. Không có request ghi nghiệp vụ. **0 WS message thật quan sát được**.
- Git diff/status backend kiểm tra cuối, không sửa code/.env/backend file. Không commit/push/deploy. Chỉ có API GET, POST xác thực không ghi nghiệp vụ và mở/đóng WS; không chạy seed/simulator/finish/resolve/PATCH/đăng ký.

---

# Lịch sử báo cáo (các mục mới phía trên có ưu tiên)

# Kiểm thử tích hợp backend thật — 07/10/2026

Phần này cập nhật và thay thế các kết luận ENV-01/START-01 và “chưa chạy backend” trong bản khảo sát lịch sử phía dưới. Người dùng đã cho phép startup backend trên DB local/demo, nhưng chưa cho phép ghi nghiệp vụ từ FE.

## Môi trường và phạm vi thực tế

- Xác minh Settings với đúng `.env` và ưu tiên biến môi trường, không import app: SQLite, file `services/backend/running_demo.db` hiện hữu bên trong workspace local; không in URL DB/key/password.
- Cổng 8000/5173 trống trước startup. Đã khởi động backend bằng venv Python (`-B -m uvicorn app.main:app --host localhost --port 8000 --no-access-log --log-level error`), PID khởi tạo **34404**. Frontend Vite localhost:5173 (`--strictPort`), PID **37272**. Không reload backend, không chạy nhiều bản backend, không seed/simulator/reset/migration riêng.
- Cho phép cơ chế create_all/migrate_demo_schema/worker có sẵn chạy trong startup; DB demo có thể được cập nhật bởi chính cơ chế này. Không sửa code/.env/dependency backend. Log lưu phía FE trong test-results, không access-log chứa WS query key.
- FE `.env` đúng API mode, REST `http://localhost:8000/api/v1`, WS `ws://localhost:8000`.
- Source backend commit gần nhất: `0968baa2ea91757c6d3a24b8816c087a9e5ee383`. Mọi method/path REST /api/v1 trong source có mặt ở OpenAPI runtime. 13 input model tương đương sau khi bỏ default:null mà FastAPI không xuất. Không thấy dấu hiệu chạy sai contract; backend không có endpoint trả Git SHA nên không tuyên bố runtime tự chứng thực commit.

## Luồng đã kiểm tra bằng dữ liệu thật

- GET /health 200, GET /openapi.json 200; POST /auth/admin-key không body: key ngẫu nhiên trả 401, key cấu hình local trả 200; kiểm tra cả từ API và form trình duyệt.
- GET /races: 4 giải có sẵn; dashboard của cả 4 đọc được, lần lượt 1/20/20/20 participants. GET runners/live/history/checkpoint events/detail của các bản ghi có sẵn thành công.
- UI: bib `01` giữ số 0, link và request dùng student_id/run_id UUID; bảng phân trang và top backend hoạt động; dữ liệu thiếu như faculty/route hiển thị —/thông báo thiếu.
- Snapshot/map hiển thị marker từ GPS thật trả qua API. Đổi giữa giải hoàn thành và giải ACTIVE loại bỏ runner cũ; chỉ 1 WS nghiệp vụ khi ổn định. Socket HMR của Vite được loại khỏi phép đếm.
- Refresh và chủ động đóng socket nghiệp vụ trong trình duyệt để kích hoạt reconnect: có socket mới, trạng thái connected và đọc lại snapshot. Đây là fault injection đóng kết nối thật, không giả lập message.
- Run COMPLETED giữ duration_total_s qua việc đọc lại/refresh/reconnect. Ví dụ run `03179377-d8c9-4b01-8d9c-9759af89b4c1` giữ 32 giây.
- UI hiển thị riêng MATCHED và COUNTED, đọc chi tiết event đã xử lý không hiện nút xác nhận. Form matching của các giải đã bắt đầu bị disable. Form đăng ký device hiện nhưng không submit.
- GPS quá hạn của giải ACTIVE hiện “Mất cập nhật”. Logout đóng socket và trở về form key.
- 500 ở dashboard và 401 ở protected race list được inject trong trình duyệt: UI hiển thị lỗi, refresh phục hồi; protected 401 xóa phiên. Đây là kiểm thử FE có fault injection, không phải lỗi 500/401 phát sinh từ backend thật. 401 key sai là phản hồi backend thật.
- Không quan sát được frame cập nhật nghiệp vụ từ server trong phiên kiểm thử (**0 message**); các phiên đã hoàn thành hoặc GPS cũ không phát sinh dữ liệu mới. Chỉ xác nhận handshake/reconnect, chưa xác nhận delivery runner.updated/checkpoint.match.updated với sự kiện mới.

## Lỗi frontend đã sửa trong lượt tích hợp này

`src/features/live-map/WatchList.tsx`: trước đây không có runner ONLINE thì ghi “Chưa có sinh viên đang chạy”, gây hiểu nhầm khi backend vẫn có ACTIVE nhưng GPS cũ. Đổi thành “Chưa có vị trí GPS mới để theo dõi”, giải thích thiếu/cũ GPS độc lập với trạng thái run. Đã kiểm tra với giải ACTIVE có sẵn.

Thêm `scripts/integration-local-readonly.mjs`: dùng API thật + Edge headless, chặn và ghi nhận mọi request ghi nghiệp vụ, không lưu Admin key vào file/trace. Script nhận key qua môi trường tiến trình, không tự đọc backend .env. Các thử đầu phát hiện selector test chưa tính phân trang, nhầm socket HMR và chuỗi disconnected chứa connected; đã sửa script, không coi là lỗi ứng dụng.

## Vấn đề backend / khả năng API đã xác minh

### DATA-01 — dữ liệu run ACTIVE đã đủ mục tiêu vòng (chưa xác định nguyên nhân)

- Request: GET `/api/v1/races/c2a09d3e-5b4f-4c28-9baf-d06fe1a91296/dashboard`, header `X-Admin-Key: [REDACTED]`, không body. HTTP 200.
- Bản ghi: student `0c0b2cc1-590f-4b97-a9a6-a9baaabbfc8c`, run `6fc37ec3-293b-434f-917c-c1d30567a8a6`; status ACTIVE, lap_count=2, total_laps=2, duration vẫn tăng; race LIVE, active_runners=1, runners_at_lap_target=1, completed_runners=0.
- Mong đợi theo nghiệp vụ hiện tại: backend chốt COMPLETED khi đạt total_laps. Thực tế bản ghi cũ chưa chốt. Không đủ bằng chứng đây là lỗi đường ghi của phiên bản hiện tại; có thể là dữ liệu tồn từ trước. Source `maybe_complete_run`/`record_lap` (app/main.py khoảng 488–515) xử lý khi ghi vòng, không tự sửa mọi dữ liệu cũ khi đọc.
- Ảnh hưởng: FE phải hiển thị ACTIVE và thời gian server trả, không tự hoàn thành. Đề xuất phía BE xác minh lịch sử bản ghi và quy trình xử lý dữ liệu cũ; không áp dụng sửa/finish từ FE.

### API-01..03 — thiếu khả năng API, không phải lỗi runtime

- GET `/api/v1/races/b033f984-24a8-45c8-84b7-52769ad0a15e/checkpoint-matching` -> **405**, `{"detail":"Method Not Allowed"}`. Chỉ PATCH trả full config. Dashboard race chỉ race_id/name/status/checkpoint_mode/total_laps/config_version; overview/live/runners không có matching_locked_at hoặc bán kính/cửa sổ/grace. FE chưa đọc được đầy đủ cấu hình sau reload; khóa vẫn suy ra từ started_runners và xử lý409.
- GET `/api/v1/races/b033f984-24a8-45c8-84b7-52769ad0a15e/checkpoints` -> **405**; GET `/api/v1/checkpoints/2bfc8bb6-2a78-4b7b-9f0b-3b7edb7b9f09` -> **404**, `{"detail":"Not Found"}`. Event/history chỉ cung cấp ID/checkpoint reference hoặc GPS runner, không phải geometry/name/radius checkpoint để vẽ đúng metadata.
- GET `/api/v1/checkpoints/2bfc8bb6-2a78-4b7b-9f0b-3b7edb7b9f09/devices` -> **405**. Event có device_id/checkpoint_source; POST đăng ký trả status đăng ký nhưng không có GET heartbeat/online hay cờ Gateway thật/giả. Không thể suy online từ event mô phỏng. GET legacy /device-events cũng chỉ có ID/time/event_type/identity_status/student_id.
- Đã kiểm tra inventory toàn bộ GET OpenAPI và source handlers liên quan; không thấy endpoint đọc khác đáp ứng các trường này. Đề xuất BE bổ sung GET cấu hình/lock, checkpoint metadata và device status/provenance; chưa sửa BE.
- Tile OpenStreetMap có một số request lỗi trong môi trường kiểm thử; FE hiện cảnh báo nền bản đồ, marker/số liệu vẫn hoạt động. Đây là dependency mạng/bản đồ ngoài, chưa xác định nguyên nhân, không quy lỗi backend.

## Bản ghi/kịch bản dành cho lần kiểm thử ghi tiếp theo — CHƯA thực hiện

- Giải demo `b033f984-24a8-45c8-84b7-52769ad0a15e` (Demo mô phỏng 42d57bcf), checkpoint `2bfc8bb6-2a78-4b7b-9f0b-3b7edb7b9f09`, device hiện có `sim-arduino-42d57bcf`.
- Event mẫu `31a6ed14-cebc-4a03-b864-0cdb2fd38f8d`, MATCHED/COUNTED/version2: chỉ dùng để kiểm tra UI không cho resolve hoặc kiểm tra server từ chối trạng thái khi được cho phép riêng. Không dùng làm ca CONFIRM thành công.
- Hiện 3 giải hoàn thành có tổng 60 event MATCHED, không có AMBIGUOUS trong summary; giải GPS_ONLY không có event. Muốn E2E CONFIRM/DISMISS/retry409 cần người dùng cung cấp/cho phép tạo event AMBIGUOUS+candidates_final với passage khả dụng; chưa có bản ghi phù hợp.
- PATCH cấu hình thành công cần race demo chưa có run; cả 4 giải hiện có đều started. Không tạo race mới trong lượt này. Các race hiện có phù hợp ca khóa/409 nhưng chưa gửi PATCH.
- Đăng ký device: có checkpoint demo ở trên; cần người dùng cho phép và chỉ định device ID thử mới (không tái đăng ký device hiện tại vì endpoint có thể đổi name/status). Chưa POST.
- Chưa có dữ liệu hiện tại để xác minh E2E MATCHED+NOT_COUNTED, GPS_ONLY Arduino UNASSIGNED, passage pending, run thiếu tọa độ, lỗi409/422 khi ghi hoặc thiết bị thật. Unit tests đã kiểm tra một phần, không thay thế E2E.

## Kiểm tra cuối và truy cập

- Typecheck, lint, build đạt; Vitest **23/23** đạt. Bộ đọc API backend thật đạt. Báo cáo UI: `test-results/local-readonly-report.json`, ảnh `local-readonly-ui.png`; OpenAPI/schema comparison trong test-results. Không có request ghi nghiệp vụ được gửi; chỉ POST xác thực và GET/WS.
- Frontend: http://localhost:5173/; backend health: http://localhost:8000/health; docs: http://localhost:8000/docs. Để lại tiến trình local phục vụ người dùng; chưa commit/push/deploy.
- Backend tracked diff/status được kiểm tra cuối; code và .env không sửa. Tác dụng phụ được phép: startup có thể nâng schema/worker ghi DB demo; không khẳng định DB bất biến.

---

# Bản khảo sát trước khi được phép startup (lịch sử)

# Báo cáo tích hợp NEU Smart Running — 07/10/2026

## Phạm vi và phiên bản

- Frontend: `apps/admin-web`; backend chỉ đọc: `services/backend`, cùng repository.
- HEAD khảo sát: `1eeeb6ddd0ef7c5af844ac77778345d998525582`.
- Commit gần nhất thay đổi backend: `0968baa2ea91757c6d3a24b8816c087a9e5ee383` (Implement Arduino GPS runner matching and dashboard).
- Git status đầu nhiệm vụ sạch; không pull/đổi nhánh. Chỉ sửa frontend.
- `.env` FE chọn API thật, REST `http://localhost:8000/api/v1`, WS `ws://localhost:8000`; script dev dùng localhost:5173 mặc định. Không đưa key vào FE env.
- GET health/OpenAPI ở localhost:8000 và frontend localhost:5173 không kết nối được trong lần khảo sát. Chưa xác minh runtime/source trùng phiên bản; không khẳng định backend hỏng.
- Backend có `.venv` và `.env`. Không import app, khởi động server, nâng dependency, migration, seed, simulator hoặc ghi DB. Đọc source bằng văn bản/AST.

## A. Thay đổi frontend lần này

1. Dùng chung reconcileRunner/reconcileSnapshot trong live service và provider: giữ version checkpoint mới hơn qua REST resync, kể cả event mới chưa có trong REST cũ; bảo vệ tổng và thời gian đã chốt trong cùng run. Đổi race/run không kế thừa trạng thái cũ.
2. Completion là trạng thái backend riêng với thời điểm GPS: nhận COMPLETED có GPS cũ nhưng giữ vị trí mới hơn; so sánh timestamp theo thời gian thực thay vì thứ tự chuỗi.
3. Timer phân loại lại GPS STALE/UNAVAILABLE mỗi 15 giây, không coi COMPLETED là mất kết nối; không thêm polling REST khi WS connected.
4. Form matching lấy mode mới từ backend khi admin chưa sửa; sau lưu dùng response PATCH; không hiển thị tham số đã lưu cục bộ như hiện tại khi config_version server đã mới hơn. Chặn form khi snapshot còn thuộc race khác.
5. Empty state hướng dẫn chuẩn bị dữ liệu được phép, không yêu cầu chạy simulator như một bước mặc định.
6. Thêm kiểm tra backend chỉ đọc và test hồi quy cho stale REST, completion, checkpoint version, reconnect/cleanup, GPS cũ, mạng/500.

## B. Bảng ánh xạ contract

REST dùng prefix `/api/v1`, header `X-Admin-Key` cho Admin. ID là chuỗi backend; bib/display_id chỉ hiển thị, giữ số 0. Nguồn: routes, Pydantic input models, run_dict/checkpoint_event_dict và các chỗ hub.publish trong app/main.py; README bổ trợ. Không import module để lấy OpenAPI vì import có tác dụng phụ DB.

| Màn hình/luồng | API | Schema và cách dùng FE |
|---|---|---|
| Đăng nhập | POST /auth/admin-key | Không body; 200 authenticated/role; 401 giữ form; key trong bộ nhớ |
| Giải | GET /races | items: race_id/name/status/start_at nullable; không suy ra tọa độ |
| Dashboard | GET /races/{race_id}/dashboard | race/summary/runners/top_runners/recent_checkpoint_events/server_time; giữ thứ tự xếp hạng server |
| Map | GET /races/{race_id}/live | race_id, runners có latitude/longitude nullable và dữ liệu run; không giả GPS |
| Runners | GET /races/{race_id}/runners | keyword/status/page/page_size<=100/sort_by/sort_order; REGISTERED -> PENDING, duration không có sort backend |
| Run/history | GET /runners/{student_id}/runs/{run_id}, /events | Backend kiểm tra identity; history page/page_size<=200, items GPS/LAP; duration giây, distance mét |
| Nhật ký | GET /races/{race_id}/checkpoint-events | checkpoint_id/match_status/from/to/limit<=200/cursor; items,next_cursor |
| Chi tiết | GET /checkpoint-events/{event_id} | match_status riêng lap_status; candidates_final/version/candidates; khoảng cách m, time_delta_ms/lap_duration_ms là ms |
| Resolve | POST /checkpoint-events/{event_id}/resolve | action,passage_id nullable,expected_version>=1,idempotency_key 1..120,reason 1..500; 409 refetch, retry giữ payload/key |
| Matching | PATCH /races/{race_id}/checkpoint-matching | Chỉ field thay đổi; radius>0 và inner<outer; window/grace/skew 0..60, gap 1..300, age 1..3600; response full config/config_version |
| Thiết bị checkpoint | POST /checkpoints/{checkpoint_id}/devices | device_id 1..80,name<=120; 201 device_id/checkpoint_id/race_id/status, không chứng minh online |
| Realtime | WS /ws/v1/races/{race_id}/live?key=… | runner.updated,runner.completed,checkpoint.passed,checkpoint.match.updated; phiên bản ở event, không có sequence toàn cục |

Source cũng có POST /races (RaceIn), /students (StudentIn), /runner-devices (RunnerWearableIn), /races/{race_id}/checkpoints (CheckpointIn), /races/{race_id}/participants (ParticipantIn), /runs/{run_id}/finish (FinishIn) cho Admin. FE hiện có chưa cung cấp các form quản trị này; nút chưa hỗ trợ vẫn vô hiệu hóa và có giải thích. Không tự gọi để tạo dữ liệu demo. POST /runs, /telemetry/gps, /lap-events thuộc Simulator; POST /checkpoint-events thuộc Gateway, không tích hợp gửi từ FE.

Lỗi chuẩn: HTTPException detail={code,message,details,trace_id}; lỗi validation FastAPI detail là mảng loc/msg. FE phân biệt 401/403/404/409/422/5xx và mạng; không log credential. WS xác thực qua query, server đóng 4401 khi sai key.

## C. Dependency và điểm bị chặn

| Mã | Bằng chứng / tái hiện | Mong đợi và thực tế | Ảnh hưởng / đề xuất |
|---|---|---|---|
| ENV-01 | GET http://localhost:8000/health và /openapi.json, không header/body | Mong 200; thực tế lỗi kết nối, không có HTTP status | Chưa xác định nguyên nhân tiến trình/cổng; người vận hành kiểm tra và chạy đúng backend. Không coi là lỗi contract |
| START-01 | Source app/main.py:1234 create_all, migrate_demo_schema() tại cuối file, startup:1310 | Import có thể tạo/nâng schema; worker ghép có thể ghi dữ liệu | Không tự khởi động theo phạm vi chỉ đọc. Cần người vận hành cho phép/chuẩn bị DB và runtime trước khi E2E |
| API-01 | GET dashboard app/main.py:1112 và race_matching_config:464 | Dashboard chỉ mode/config_version, không số đo hoặc flag khóa; chỉ PATCH trả đủ | UI hiển thị — cho chưa biết, khóa suy ra started_runners và bắt 409. Đề xuất GET cấu hình + flag khóa server |
| API-02 | Inventory routes app/main.py | Chưa có GET checkpoint geometry/metadata hoặc GET danh sách device | Không vẽ checkpoint giả; đăng ký yêu cầu ID thật. Đề xuất endpoint đọc; không áp dụng backend |
| API-03 | checkpoint_event_dict app/main.py:518 | checkpoint_source=ARDUINO_GATEWAY, không phân biệt Gateway giả/thật/online | Không ghi Arduino online; cần backend cung cấp provenance/heartbeat nếu muốn xác minh |
| API-04 | eligible_passages/candidates_json và resolve app/main.py:1029 | Candidate availability lưu theo snapshot, có thể đã bị tiêu thụ | Backend recheck + 409; FE refetch và không tự chọn lại. Đề xuất trả availability hiện tại nếu cần |

Các API-01..04 là giới hạn hợp đồng được đọc từ source, không phải lỗi runtime đã tái hiện. Không có thay đổi backend được áp dụng.

## D. Kiểm tra và giới hạn

Kết quả ngày 07/10/2026: npm run lint đạt; npm run typecheck đạt; npm run test đạt 23/23 test trong 4 file; npm run build đạt. npm run test:backend:read exit 1, báo backend chưa truy cập được. git diff --check đạt. Test dùng fixture trong bộ nhớ và giả lập transport, không là bằng chứng kết nối backend thật.

Lần này chưa kiểm tra thành công auth/dashboard/WS với backend thật vì runtime chưa truy cập được. Không chạy lại harness tích hợp cũ (có seed/DB/startup). Resolve/PATCH/đăng ký chưa E2E lần này vì chưa có môi trường/bản ghi kiểm thử được phép. Chưa kiểm tra sensor Arduino vật lý, message delivery thực, runtime OpenAPI tương đương source hoặc demo với dữ liệu mới. Kết quả E2E ngày trước không đại diện cho lần rà soát này.

## E. Cách chạy

Frontend từ apps/admin-web: `npm.cmd run dev`, mở localhost:5173. `.env`: VITE_DATA_MODE=api, VITE_API_BASE_URL=http://localhost:8000/api/v1, VITE_WS_BASE_URL=ws://localhost:8000. Admin nhập key tại giao diện, không VITE_ADMIN_API_KEY.

Backend cần được người vận hành chạy từ services/backend trên localhost:8000; lệnh theo README là `.\.venv\Scripts\python.exe -m uvicorn app.main:app --host localhost --port 8000`. Chỉ chạy sau khi cho phép tác dụng phụ schema/worker ở trên; agent chưa chạy lệnh này. CORS cần cho phép origin FE; chưa kiểm tra runtime, không thay backend hoặc proxy.

Khi backend sẵn sàng, đặt ADMIN_API_KEY trong môi trường tiến trình kiểm tra và chạy `npm.cmd run test:backend:read` tại frontend. Script không đọc .env tự động và không ghi nghiệp vụ. Các thao tác ghi E2E cần chỉ định bản ghi kiểm thử và cho phép riêng.

## F. File FE thay đổi

- src/services/reconcile.ts, reconcile.test.ts (mới).
- src/services/liveService.ts, contract.ts, apiAdapter.ts, apiAdapter.test.ts, matching.test.ts.
- src/app/LiveProvider.tsx.
- src/features/races/MatchingSettings.tsx.
- scripts/verify-backend-readonly.mjs (mới), package.json.
- README.md, INTEGRATION_REPORT.md (mới).

Kiểm tra cuối: git diff -- services/backend và git status --porcelain -- services/backend đều rỗng. Không có file tracked/untracked backend thay đổi; không khởi động/import backend hoặc thao tác DB. Không commit/push/deploy.
