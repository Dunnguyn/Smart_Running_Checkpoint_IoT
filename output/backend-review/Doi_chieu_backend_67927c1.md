# Đối chiếu backend cập nhật với yêu cầu NEU RUN

Ngày kiểm tra: 27/10/2026.

## Kết luận

Backend đã bổ sung đáng kể API sinh viên nhưng chưa đạt điều kiện nghiệm thu luồng app từ đăng nhập đến kết quả. API và nghiệp vụ web quản trị còn nhiều mục chưa triển khai. Cần sửa các lỗi chặn luồng trước khi frontend chuyển toàn bộ sang API thật.

- Mốc kiểm tra: `origin/main` tại `67927c1d628105597c1a75c317f31160a2e7ee05`, đã fetch origin trước rà soát. Backend trên `origin/be` tại `f158a5759cd927f3a936794a37b91885eeef3eb7` giống bản main được kiểm tra.
- Thư mục làm việc của người dùng vẫn ở `fe` tại `6b23ff1`. Backend mới chưa nằm trong checkout này. Không chuyển nhánh, merge hoặc thay đổi code ứng dụng.
- Đối chiếu báo cáo `output/pdf/Bao_cao_bo_sung_backend_NEU_RUN.md`: 24 mã yêu cầu gồm 8 MOB, 9 WEB và 7 RULE.
- Phân loại: **1 mục cơ bản đạt trong phạm vi kiểm tra, 13 mục có một phần, 10 mục chưa đáp ứng yêu cầu**. Các mục có mức độ lớn nhỏ khác nhau; không quy đổi con số này thành phần trăm tiến độ.
- Kiểm tra 73 điều kiện: **64 đạt, 9 không đạt**. Chín điều kiện không đạt thuộc sáu nhóm lỗi/thiếu sót; không phải chín lỗi độc lập. Tỷ lệ kiểm tra đạt không phải tỷ lệ hoàn thành sản phẩm.

## Phương pháp và giới hạn

Đọc source, tài liệu STUDENT_MOBILE_API.md và OpenAPI sinh từ ứng dụng mới. Chạy request qua ASGI của FastAPI với database SQLite mới, tách khỏi `running_demo.db` của người dùng. Kiểm tra thời gian dùng đồng hồ được điều khiển trong tiến trình thử nghiệm; không sửa đồng hồ máy.

Kiểm tra đi qua routing, schema, dependency xác thực, SQLAlchemy và SQLite. Một kiểm tra gọi trực tiếp engine tính vòng; một kiểm tra dùng đối tượng WebSocket của Starlette để kiểm tra tuần tự hóa JSON/broadcast. Chưa thử điện thoại, UI đầu cuối, phần cứng Arduino, SQL Server, nhiều worker, tải lớn hoặc cạnh tranh ghi đồng thời. Không khởi chạy worker matching trong bộ kiểm tra này.

Check-in hợp lệ đang lỗi. Để kiểm tra độc lập start, GPS, pause/resume và withdraw, bộ kiểm tra tạo attendance hợp lệ và đặt giải LIVE trực tiếp trong database thử nghiệm. **Các bước sau đó đạt không chứng minh luồng E2E check-in → chạy đã hoạt động.**

## Ma trận MOB

| Mã | Đánh giá | Đã có và được xác minh | Phần còn thiếu hoặc chưa đạt |
| --- | --- | --- | --- |
| MOB01 | Cơ bản đạt | Cấp/reset tài khoản, mật khẩu tạm bắt buộc đổi, login, access token, refresh rotation, logout, hồ sơ. Đã kiểm tra sai mật khẩu, hết hạn, thu hồi, reset và chặn tài khoản khác đọc/rút phiên. | class_name vẫn null; nếu giữ trường lớp trong app cần bổ sung hoặc điều chỉnh UI. Chưa nghiệm thu cạnh tranh refresh hoặc toàn bộ an toàn vận hành. |
| MOB02 | Một phần | Danh sách/chi tiết/map sinh viên, filter/cursor, policy đăng ký, capacity, số chỗ, version tuyến và server_time. | Lỗi 500 khi giải đã đăng ký có attendance config; map gọi lại race view cũng bị ảnh hưởng. Danh sách chỉ truy vấn tối đa 500 giải; chưa trả đầy đủ cửa sổ/ngưỡng điểm danh cho app. |
| MOB03 | Một phần | Tự đăng ký, bib, policy, thời hạn/capacity, idempotency và khóa race. Retry đúng key và từ chối đầy chỗ đã đạt. | Model chưa có unique(race_id, bib_number); chưa kiểm chứng yêu cầu đăng ký đồng thời/nhiều worker. Broadcast đăng ký làm subscriber Admin bị loại do datetime chưa mã hóa JSON. |
| MOB04 | Một phần | Model attendance/config; validate vị trí cũ, sai accuracy, ngoài vùng đều đạt. Check-out sau phiên fixture đã rút hoạt động và không đổi kết quả chạy. | Check-in hợp lệ trả 500 trên SQLite; không thể nghiệm thu luồng điểm danh bình thường. Cần kiểm tra lại các action và trạng thái giải đã hủy. |
| MOB05 | Một phần | Start bằng token, consent/check-in, kiểm tra ACTIVE toàn tài khoản; pause/resume có revision, thời gian nghỉ và segment. Các handler chính đã đạt trên fixture. | Chưa có lifecycle API đưa giải SCHEDULED thành LIVE; start chưa khóa theo sinh viên/ràng buộc database nên chưa bảo đảm chống mở đồng thời. Pause/resume offline không được hỗ trợ theo tài liệu mới; cần thống nhất với hàng đợi hiện tại của frontend. |
| MOB06 | Một phần | Batch tối đa 100 mẫu/65536 byte, ACK từng mẫu, sequence, filter accuracy, segment khi mất mẫu; retry nguyên batch đạt. | Mẫu offline 20 giây bị GPS_TOO_OLD; cùng sample trong batch khác bị SAMPLE_ID_CONFLICT; chưa có chính sách đầy đủ cho late samples và retryable/permanent rejects. |
| MOB07 | Một phần | Mobile withdraw trả ABANDONED, retry đúng thao tác đạt; đủ vòng được engine tự hoàn thành. Có snapshot và finalized_at. | Chưa có VERIFYING/thời hạn chờ GPS và matching. Admin finish vẫn gán COMPLETED ở 0 vòng. Finish của challenge mới là nghiệp vụ riêng, không thay thế kết thúc/xác minh run thông thường. |
| MOB08 | Một phần | current-run, chi tiết, history, laps, track có segment, dashboard theo ngày/tuần/tháng, múi giờ Việt Nam và ticket WebSocket sinh viên. | Chưa có endpoint tra operation; có thể replay cùng key nhưng cần FE giữ nguyên payload. History bị chặn ở 501 bản ghi. Chưa chốt retention GPS; snapshot tổng hợp/phục hồi phải ghép từ nhiều API. Chưa kiểm thử stream/reconnect đầu cuối. |

## Ma trận WEB

| Mã | Đánh giá | Kết quả đối chiếu |
| --- | --- | --- |
| WEB01 | Một phần | Có GET/PUT student-policy để công bố/mở đăng ký; chưa có PATCH thông tin giải, start/close/cancel giữ lịch sử, bảng chuyển trạng thái hoặc tách lịch dự kiến/thực tế. |
| WEB02 | Một phần | GET /races đã có end_at, location, total_laps, participant_count; đã kiểm tra response. Chưa có phân trang/filter và bộ detail quản trị đầy đủ; capacity/cửa sổ đăng ký cần gọi API policy riêng. |
| WEB03 | Chưa đáp ứng | Chưa có sửa hồ sơ/đổi trạng thái sinh viên hoặc total/next_cursor cho danh sách. Cấp/reset tài khoản app là phần mới nhưng không thay cho yêu cầu quản lý hồ sơ. |
| WEB04 | Chưa đáp ứng | Chưa có sửa bib, hủy/đổi trạng thái participant, pagination/search roster hoặc audit thay đổi. Capacity/khóa khi đăng ký mới đã cải thiện ở MOB03. |
| WEB05 | Chưa đáp ứng | Chưa có danh sách thiết bị tổng quát, đổi/gỡ gán, disable và heartbeat. Liệt kê cổng Serial cho demo kit không thay thế API quản lý thiết bị. |
| WEB06 | Chưa đáp ứng | Chưa có DELETE checkpoint với xử lý route anchor/thiết bị/lịch sử và điều kiện khóa. |
| WEB07 | Chưa đáp ứng | API history mới là scope sinh viên; chưa có danh sách mọi phiên của một sinh viên dành cho Admin qua nhiều giải. |
| WEB08 | Chưa đáp ứng | Dashboard cá nhân/challenge có thêm thống kê nhưng chưa có vòng nhanh nhất toàn giải và leaderboard chính thức theo yêu cầu web; top_runners hiện giữ thuật toán cũ. |
| WEB09 | Chưa đáp ứng | Admin vẫn dùng khóa chung; chưa có tài khoản ban tổ chức, RBAC theo nhiệm vụ hoặc audit actor cá nhân. StudentAccount không đáp ứng yêu cầu này. |

## Ma trận RULE

| Mã | Đánh giá | Kết quả đối chiếu |
| --- | --- | --- |
| RULE01 | Một phần | Withdraw mobile sửa được kết thúc sớm; Admin finish chưa sửa, kiểm tra 0/4 vòng vẫn COMPLETED. |
| RULE02 | Một phần | Có batch và ngắt segment khi mất mẫu; chưa nhận lịch sử offline. Mẫu trễ 20 giây bị từ chối với cấu hình mặc định 10 giây. |
| RULE03 | Một phần | Start mobile chặn ACTIVE toàn tài khoản theo kiểm tra tuần tự, yêu cầu LIVE/check-in/consent. Start Admin cũ vẫn chỉ chặn trong cùng giải; chưa có bảo đảm chống cạnh tranh ghi theo sinh viên. |
| RULE04 | Chưa đáp ứng | Engine vẫn tính vòng tại LAP mà không bắt buộc CONTROL trước đó. Kiểm tra fixture có CONTROL nhưng không passage vẫn nhận lap_count=1. Cần chốt thể lệ nếu quyết định không yêu cầu đủ tuyến. |
| RULE05 | Một phần | Mobile từ chối accuracy >100 m; pause/gap tách đoạn và không nối khoảng cách trong các ca đã chạy. Wearable/GPS ingest chung vẫn chưa áp accuracy threshold tương đương; cần chốt chính sách cho các nguồn. |
| RULE06 | Chưa đáp ứng | top_runners vẫn sort theo -lap_count, -distance_total_m, duration_total_s, display_id. Chưa có quy tắc xếp thành tích chính thức. |
| RULE07 | Chưa đáp ứng | Race.status vẫn chuỗi tự do; chưa có lifecycle, kiểm tra lịch và tách scheduled/actual. Main start chưa chuyển giải sang LIVE. |

## Các lỗi đã tái hiện cần sửa trước

### F01 Lỗi thời gian làm hỏng danh sách giải map và check-in

Mức đề nghị: P0 vì chặn đường đi chính của mobile. Liên quan MOB02/MOB04.

Điều kiện: SQLite, sinh viên đã đăng ký, Admin cấu hình attendance với thời gian ISO có múi giờ. Sau khi đọc lại từ SQLite, các trường DateTime không giữ tzinfo; `_participation` so sánh trực tiếp với `now_utc()`.

Kết quả: GET /student/races, GET /student/races/{id}, GET /student/races/{id}/map và POST check-in với vị trí hợp lệ đều trả HTTP 500, `TypeError: can't compare offset-naive and offset-aware datetimes`.

Cần sửa: chuẩn hóa thời gian bằng `_utc`/`aware` ở mọi phép so sánh trong projection; thêm test request riêng sau khi commit/load từ SQLite. Không chỉ test object còn giữ timezone trong cùng session.

Căn cứ: `services/backend/app/student_api.py:538`, đặc biệt điều kiện actions tại 560–574; map gọi `_race_view` tại 984.

### F02 Retry sample trong batch mới bị coi là thay payload

Mức đề nghị: P1, chặn nghiệm thu MOB06.

Tái hiện: gửi batch A với sample S thành công; giữ nguyên ID, sequence, timestamp, tọa độ và bước của S, gửi trong batch B. Kết quả HTTP 409 `SAMPLE_ID_CONFLICT`. Retry nguyên batch A thành công.

Nguyên nhân: sample hash tính từ GpsIn gồm cả batch_id. Ngoài ra hash đối chiếu trước khi hiệu chỉnh total_steps sau resume, trong khi hash lưu do core.receive_gps tính sau hiệu chỉnh. Nhánh sau resume cần thêm kiểm tra riêng khi sửa.

Cần sửa: định nghĩa payload canonical theo sample, không đưa batch envelope vào danh tính nội dung; đồng nhất bước raw/normalized khi so sánh. Có test retry sau mất response và gom lại hàng đợi.

Căn cứ: `student_api.py:1180–1196`, `1215–1220`; `main.py:1495`.

### F03 GPS offline chưa được tiếp nhận

Mức đề nghị: P1, yêu cầu P0 MOB06/RULE02 chưa đạt.

Tái hiện: mẫu được ghi trong phiên, sequence mới, độ chính xác hợp lệ nhưng trễ 20 giây; batch trả HTTP 200 với item REJECTED/GPS_TOO_OLD. Đây là thất bại về tiêu chí dữ liệu, không phải lỗi HTTP của cả batch.

Nguyên nhân: mobile gọi lại receive_gps và vẫn chịu max_event_age_seconds mặc định 10 giây. Cần chốt lưu lịch sử, tính quãng đường và xác minh vòng riêng; không chỉ tăng cửa sổ matching Arduino.

Căn cứ: `student_api.py:1218–1220`; `main.py:1521`.

### F04 Admin vẫn công nhận hoàn thành khi thiếu vòng

Mức đề nghị: P1, yêu cầu P0 RULE01 chưa đạt.

Tái hiện: run ACTIVE của giải 4 vòng có lap_count=0; gọi POST /runs/{id}/finish bằng Admin. Response trả status=COMPLETED, is_done=true, lap_count=0. Chức năng withdraw mới không bảo vệ đường đi Admin này.

Cần sửa: tách đóng phiên khỏi đạt thể lệ; thống nhất outcome/trạng thái trong mobile, dashboard và thống kê. Nếu muốn override kết quả bằng Admin, cần API/quyền/lý do và audit riêng, không ngầm coi mọi finish là đạt.

Căn cứ: `main.py:1804–1817`.

### F05 Event mới không gửi được đến Admin WebSocket

Mức đề nghị: P1 vì UI đang theo dõi có thể ngừng nhận cập nhật mà socket chưa đóng rõ ràng.

Tái hiện: đăng ký một subscriber WebSocket cho giải; gọi self-registration. REST trả 201 nhưng không có websocket.send, subscriber bị loại khỏi hub. Event chứa datetime `occurred_at`/`registered_at`; `WebSocket.send_json` không tự mã hóa datetime.

Cần sửa: dùng jsonable_encoder trước send_json hoặc chuẩn hóa envelope ở hub; không nuốt lỗi serialization thành disconnect im lặng. Kiểm tra cả runner.updated với các timestamp lồng trong run_dict.

Căn cứ: `main.py:525–533`; `student_api.py:926–930`. Bộ kiểm tra dùng WebSocket Starlette thực để serialize, không mock send_json nhận mọi kiểu object.

### F06 Engine chưa kiểm tra checkpoint trung gian

Mức đề nghị: P1 nếu thể lệ yêu cầu hoàn thành toàn tuyến; RULE04 vẫn cần quyết định rõ.

Fixture có CONTROL và LAP, không có passage CONTROL. Gọi engine record_lap sau thời gian tối thiểu vẫn được counted=true và lap_count=1. Đây là kiểm tra engine, không phải mô phỏng phần cứng.

Cần sửa: lưu tiến độ checkpoint theo vòng và kiểm tra thứ tự/bằng chứng; hoặc xác nhận thể lệ chỉ cần LAP và điều chỉnh yêu cầu/UI để không tuyên bố đã xác minh toàn tuyến.

Căn cứ: `main.py:747–766`.

## Các thiếu sót cần ưu tiên tiếp theo

1. **Vòng đời giải chưa khép kín:** self-registration yêu cầu SCHEDULED, mobile start yêu cầu LIVE, nhưng chưa có API quản trị chung chuyển giải giữa hai trạng thái. Tạo giải LIVE ngay không giải quyết bước tự đăng ký. Demo đặc thù không thay cho luồng quản trị này.
2. **Contract trạng thái khác UI hiện tại:** pause trả status=ACTIVE cùng tracking_state=PAUSED; kết thúc sớm dùng ABANDONED; result_state là PENDING/FINAL/VOID, chưa có VERIFYING. Frontend cần mapper rõ ràng và xử lý change-password bắt buộc.
3. **OpenAPI mới có endpoint nhưng schema response chưa đủ:** response 200 của gps-batches có schema `{}`; cần response models cho run, batch ACK, participation và lỗi. Không thể coi chỉ có /openapi.json là đã bàn giao typed contract đầy đủ.
4. **Frontend hiện tại chưa tích hợp:** apps/student-mobile/src/services/api.ts trên nhánh fe vẫn trả CONTRACT_PENDING; kể cả backend được sửa xong còn phải triển khai adapter và test liên thông.
5. **Kiểm chứng vận hành còn thiếu:** chưa thấy bộ test backend được lưu trong cây source main đã kiểm kê; migration vẫn là create_all và ALTER bổ sung trong main, chưa phải quy trình migration production. Không suy luận rằng SQL Server hay chạy đồng thời đã đạt.

## Phần đã làm tốt và có thể dùng để tiếp tục tích hợp

- Tách Bearer token sinh viên khỏi Admin/Wearable; kiểm tra ownership và session thu hồi hoạt động trong các ca đã chạy.
- Tài khoản tạm, đổi mật khẩu bắt buộc, refresh xoay vòng, reset mật khẩu đã có.
- Tự đăng ký có policy, sức chứa và replay; danh sách giải Admin đã bổ sung các trường frontend trước đây phải để trống.
- Batch ACK theo mẫu, filter GPS sai accuracy, ngắt đoạn khi mất mẫu, pause/resume và số giây nghỉ có triển khai thực.
- Withdraw, history, current-run, track segments và dashboard cá nhân hoạt động trên fixture độc lập.
- Có tài liệu STUDENT_MOBILE_API.md mới, nêu rõ giới hạn pause/resume offline và class_name.

## Thứ tự sửa và điều kiện kiểm tra lại

1. Sửa F01 và bổ sung lifecycle SCHEDULED → LIVE để chạy được luồng tự đăng ký → check-in → start hoàn toàn qua API.
2. Sửa F02/F03, thống nhất ACK và chính sách GPS offline; kiểm thử mất response, gom batch lại và resume với step offset.
3. Sửa F04, chốt RULE04/RULE06, tách kết quả chính thức và hành động dừng/override.
4. Sửa F05 và kiểm tra Admin Web + mobile cùng nhận kết quả sau reconnect.
5. Bàn giao response models, error contract, state mapping; sau đó mới thay adapter CONTRACT_PENDING.
6. Bổ sung các mục WEB03–WEB09 theo nhu cầu vận hành, kèm kiểm tra concurrency/migration trước triển khai thật.

## Bằng chứng kiểm tra

- `audit_results_67927c1.json`: 73 kết quả, không chứa mật khẩu hoặc token.
- Snapshot source và bộ kiểm tra nằm trong thư mục audit tách biệt của phiên làm việc; không thay code ứng dụng và không tác động dữ liệu demo.
- Nguồn chính: `services/backend/app/main.py`, `services/backend/app/student_api.py`, `services/backend/app/demos.py`, `docs/STUDENT_MOBILE_API.md` tại mốc 67927c1.

Đề nghị đội backend phản hồi theo mã MOB/WEB/RULE và F01–F06, phân biệt rõ đã sửa trong source, đã có test và đã kiểm thử liên thông.
