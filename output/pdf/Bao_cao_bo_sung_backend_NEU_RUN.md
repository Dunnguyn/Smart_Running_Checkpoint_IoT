# Báo cáo yêu cầu bổ sung backend NEU RUN

Ngày rà soát: 27/10/2026 • Mốc mã nguồn: 81bf16b

Đối tượng tiếp nhận: Đội backend hệ thống Smart Running Checkpoint IoT

## 1 Phạm vi và yêu cầu ưu tiên

Backend đã có nền tảng quản trị giải, sinh viên, đăng ký, tuyến chạy, telemetry, ghép GPS với Arduino và dashboard trực tiếp. Tuy nhiên, app sinh viên chưa thể sử dụng dữ liệu thật vì chưa có xác thực và API theo quyền sinh viên. Web quản trị còn thiếu một số thao tác vận hành và dữ liệu tổng hợp.

Đề nghị đội backend ưu tiên hoàn thiện luồng sinh viên từ đăng nhập đến kết quả chạy, đồng thời thống nhất quy tắc kết thúc phiên, đồng bộ GPS offline và xác minh vòng chạy trước khi frontend tích hợp.

Báo cáo đối chiếu source backend, service/model của mobile và các lời gọi API trong web. Đây là rà soát mã nguồn, chưa phải kết quả kiểm thử runtime hoặc nghiệm thu triển khai. Các đường dẫn ghi “đề xuất” chưa tồn tại theo contract hiện tại; đội backend có thể thay tên nhưng cần giữ đủ chức năng và công bố OpenAPI thống nhất.

### Mức ưu tiên

| Mức | Ý nghĩa | Phạm vi chính |
| --- | --- | --- |
| P0 | Chặn tích hợp hoặc ảnh hưởng tính đúng của kết quả | Xác thực sinh viên, API mobile, vòng đời phiên, GPS offline, xác minh kết quả |
| P1 | Cần để vận hành giải thực tế | Quản trị giải, sinh viên, đăng ký, thiết bị; dữ liệu web đầy đủ |
| P2 | Hoàn thiện sau khi luồng chính ổn định | Thống kê nâng cao, quản trị mô phỏng, xuất báo cáo và thông báo nếu đưa vào phạm vi |

### Các điểm đã xác nhận

- Mobile: login, snapshot, execute và upload trong apps/student-mobile/src/services/api.ts đều trả CONTRACT_PENDING; cấu hình URL không đủ để mở tích hợp.
- Web: đã nối tạo sinh viên, đăng ký vào giải, tạo/xóa giải, sửa tuyến, cấu hình matching, dashboard, bản đồ và xử lý event mơ hồ.
- Backend: API đọc giải/tuyến, kết quả và socket hiện dành cho Admin; API GPS dành cho Wearable/Simulator. Không cấp các khóa này cho app sinh viên.
- Các tài liệu API_COVERAGE.md và README có nội dung lịch sử; source hiện tại được dùng làm căn cứ ưu tiên khi có khác biệt.

### Thứ tự bàn giao đề nghị

1. Chốt contract xác thực, model trạng thái và quy tắc kết quả; mở API đọc/đăng ký sinh viên.
2. Hoàn thiện check-in, start/pause/resume/finish, GPS offline và snapshot phục hồi.
3. Bổ sung quản trị giải/thiết bị, sửa dữ liệu thiếu trên web và kiểm thử luồng liên thông.
4. Bổ sung thống kê, xuất dữ liệu và thông báo theo phạm vi được thống nhất.

<!-- page -->

## 2 API sinh viên cần bổ sung

Các endpoint dưới đây là đề xuất, dùng prefix /api/v1. Việc phân quyền phải dựa trên danh tính đã xác thực, không tin student_id do client tự gửi.

### MOB01 Đăng nhập và quản lý phiên P0

Hiện trạng: backend chỉ có API key theo vai trò; Student chưa có dữ liệu tài khoản/mật khẩu hay phiên đăng nhập.

Đề xuất: POST /student/auth/login, POST /student/auth/refresh, POST /student/auth/logout và GET /student/me. Trả hồ sơ, thời hạn phiên và cơ chế xác thực được thống nhất. Hồ sơ cần mã sinh viên, tên, khoa và lớp nếu giữ trường className trong app. Chốt cách cấp tài khoản và đặt lại mật khẩu trước vận hành.

Nghiệm thu: đăng nhập sai trả lỗi xác định; phiên hết hạn/thu hồi bị từ chối; tài khoản A không đọc hoặc thao tác phiên của B; không cần Admin/Wearable key trong mobile.

### MOB02 Khám phá và xem chi tiết giải P0

Đề xuất: GET /student/races, GET /student/races/{race_id}, GET /student/races/{race_id}/route. Có tìm kiếm, lọc và phân trang; trả tên, địa điểm, lịch chạy, thời gian mở/đóng đăng ký, sức chứa, số đã đăng ký, trạng thái giải, số vòng, chiều dài tuyến, checkpoint và vùng điểm danh.

Nghiệm thu: frontend hiển thị được các trạng thái chưa mở, còn chỗ, đầy, hết hạn và đã hủy bằng dữ liệu server; tuyến có thứ tự tọa độ và phiên bản; trả server_time để hạn chế sai lệch đồng hồ thiết bị.

### MOB03 Tự đăng ký và nhận bib P0

Hiện trạng: POST /races/{race_id}/participants đã tạo đăng ký/cấp bib nhưng chỉ Admin sử dụng; chưa kiểm tra sức chứa và cửa sổ đăng ký cho sinh viên.

Đề xuất: POST /student/races/{race_id}/registration và GET /student/registrations. Dùng ID thao tác ổn định; server cấp bib và kiểm tra trạng thái giải, thời hạn, sức chứa trong cùng giao dịch. Bổ sung ràng buộc duy nhất bib trong giải; hiện model chỉ có unique theo race_id và student_id.

Nghiệm thu: retry cùng thao tác trả cùng kết quả; cùng key nhưng payload khác báo conflict; nhiều yêu cầu đồng thời không vượt sức chứa, không trùng bib. Hủy đăng ký chỉ bổ sung nếu nghiệp vụ cho phép và có quy tắc rõ ràng.

### MOB04 Check-in và check-out P0

Đề xuất: POST /student/races/{race_id}/check-in và /check-out. Lưu attendance độc lập với kết quả chạy; request gồm ID thao tác, tọa độ, thời điểm và accuracy. Backend công bố bán kính, độ chính xác tối đa, tuổi mẫu GPS và khung thời gian hợp lệ.

Nghiệm thu: thiếu vị trí, mẫu cũ, sai độ chính xác, ngoài vùng hoặc ngoài giờ đều có lỗi rõ ràng; retry không ghi trùng; check-out không tự đổi kết quả chạy. Các ngưỡng trong mock mobile chưa phải quy định chính thức.

<!-- page -->

## 3 Phiên chạy và đồng bộ mobile

### MOB05 Bắt đầu tạm dừng tiếp tục P0

Đề xuất: POST /student/runs, POST /student/runs/{run_id}/pause và /resume. Trả trạng thái, thời điểm hiệu lực, revision và thời gian chạy thực. Tách danh tính điện thoại khỏi wearable; chốt điện thoại có được cung cấp bước chân hay không, vì Sample của app hiện không có total_steps nhưng GpsIn bắt buộc trường này.

Nghiệm thu: kiểm tra đăng ký/check-in, lịch và trạng thái giải; không mở hai phiên chưa kết thúc của cùng tài khoản trên nhiều giải; chuyển trạng thái sai bị từ chối. Pause/resume phải lưu khoảng nghỉ và mở segment mới; không cộng khoảng cách nối qua đoạn tạm dừng. Chốt thao tác nào được phép xếp hàng offline.

### MOB06 Upload GPS và phục hồi sau mất mạng P0

Đề xuất: POST /student/runs/{run_id}/gps-batches. Mỗi mẫu có sample_id, sequence, segment, recorded_at, tọa độ và accuracy; server xác định chủ sở hữu và nguồn dữ liệu. Trả danh sách accepted/rejected theo từng ID, lý do và khả năng retry. Công bố giới hạn batch, thứ tự xử lý và thời hạn lưu hàng đợi.

Nghiệm thu: mất mạng rồi gửi lại không mất/nhân đôi mẫu; cùng ID khác payload báo conflict; chỉ xóa mẫu cục bộ khi có ACK. Xử lý rõ mẫu gửi muộn, đảo thứ tự và mẫu sau khi phiên kết thúc. Không nới cửa sổ ghép Arduino một cách mặc định để nhận toàn bộ GPS cũ: cần tách lưu lịch sử với điều kiện xác minh vòng.

### MOB07 Kết thúc và xác nhận kết quả P0

Đề xuất: POST /student/runs/{run_id}/finish và GET /student/runs/{run_id}. Backend phân biệt đang xác minh, đủ điều kiện hoàn thành và kết thúc sớm; trả laps, distance, active duration, ended_at, kết quả đạt/chưa đạt và lý do.

Nghiệm thu: frontend không tự chốt thành tích; kết thúc khi chưa đủ vòng không được coi là đạt mục tiêu; quy định thời hạn chờ GPS/event và xử lý mẫu còn tồn. Finish lặp phải trả kết quả nhất quán. Có thể đổi tên trạng thái nhưng phải ánh xạ rõ với ACTIVE, PAUSED, VERIFYING, COMPLETED, ENDED của app.

### MOB08 Lịch sử thống kê và đồng bộ trạng thái P0

Đề xuất: GET /student/runs, GET /student/runs/{run_id}/events, GET /student/statistics và GET /student/snapshot. Lịch sử có phân trang/lọc thời gian; chỉ trả dữ liệu của tài khoản; GPS giữ segment. Chốt múi giờ tổng hợp và thời gian lưu GPS.

Nghiệm thu: mở lại app hoặc chuyển thiết bị khôi phục được phiên và kết quả đã xác nhận; thống kê khớp lịch sử. Snapshot hoặc tài nguyên tương đương có revision/server_time. Có cách tra lại thao tác khi mất response, ví dụ GET /student/operations/{operation_id}. Giai đoạn đầu có thể polling có xác thực; stream có replay là bước nâng cấp, không bắt buộc để mở tích hợp đầu tiên.

<!-- page -->

## 4 API và dữ liệu cần cho web quản trị

Các đường dẫn ở cột yêu cầu là phương án đề xuất, không phải API đã triển khai. Các thao tác ghi cần xác định điều kiện khóa và ảnh hưởng tới dữ liệu đã có.

| Mã | Mức | Yêu cầu bổ sung và tiêu chí bàn giao |
| --- | --- | --- |
| WEB01 | P1 | Sửa và điều hành giải: PATCH /races/{id}; các thao tác mở đăng ký, bắt đầu, đóng/hủy giải. Có bảng chuyển trạng thái; hủy giữ lịch sử, khác DELETE. Tách lịch dự kiến khỏi thời điểm bắt đầu/kết thúc thực tế. |
| WEB02 | P1 | Dữ liệu giải: bổ sung detail và response danh sách có địa điểm, end_at, total_laps, participant_count, sức chứa/cửa sổ đăng ký. Có phân trang/lọc; frontend không phải tải từng dashboard để dựng danh sách. |
| WEB03 | P1 | Sinh viên: sửa hồ sơ và đổi trạng thái; phản hồi xung đột mã sinh viên. Bổ sung total/next_cursor phù hợp cho danh sách. Không xóa cứng hồ sơ đã gắn kết quả nếu chưa có chính sách. |
| WEB04 | P1 | Đăng ký: sửa bib, hủy/đổi trạng thái participant theo điều kiện; roster có phân trang/tìm kiếm. Không tạo bib trùng khi thao tác đồng thời; giữ dấu vết thay đổi ảnh hưởng kết quả. |
| WEB05 | P1 | Thiết bị: GET danh sách wearable và thiết bị trạm; đổi/gỡ gán, vô hiệu hóa. Trả assignment, status, last_seen_at; có heartbeat hoặc tiêu chí rõ để xác định online/offline. Chặn đổi gán khi làm sai liên kết phiên đang chạy. |
| WEB06 | P1 | Checkpoint: xóa checkpoint trước khi giải bị khóa; xử lý route anchor, thiết bị và lịch sử liên quan bằng transaction. Khi không thể xóa, trả lý do cụ thể; giữ luật khóa cấu hình sau khi có run. |
| WEB07 | P1 | Lịch sử: danh sách toàn bộ run của sinh viên qua nhiều giải; không chỉ chi tiết một run khi đã biết ID. Có lọc trạng thái/thời gian và phân trang. |
| WEB08 | P2 | Thống kê: vòng nhanh nhất toàn giải, thống kê nhiều giải, leaderboard có quy tắc xếp hạng thống nhất; dữ liệu khớp kết quả đã xác minh. Không cần viết lại các tổng hợp dashboard đã có. |
| WEB09 | P1 | Quản trị người dùng: tài khoản Admin/ban tổ chức, quyền theo nhiệm vụ, nhật ký có actor thật. Cần trước vận hành nhiều người; khóa chung vẫn chỉ phù hợp phạm vi demo. |

### Hoàn thiện contract dùng chung

- Chuẩn hóa schema response và lỗi trong OpenAPI: code, message, details và trace_id; công bố quy tắc null, đơn vị đo và UTC.
- Thêm idempotency cho thao tác tạo/đăng ký có thể retry; giải quyết conflict bằng revision hoặc cơ chế tương đương khi nhiều người sửa cùng tài nguyên.
- Các thao tác tạo/xóa giải, sửa tuyến, đăng ký và đổi trạng thái cần cơ chế frontend tải lại dữ liệu. Không bắt buộc phát mọi thay đổi qua WebSocket nếu đã có chiến lược refetch/polling rõ ràng.
- P2 tùy phạm vi: API liệt kê/khôi phục theo dõi job mô phỏng; xuất CSV/XLSX; thông báo thay đổi giải. Đây là đề xuất mở rộng, chưa phải blocker của các màn hình hiện tại.

<!-- page -->

## 5 Các quy tắc nghiệp vụ cần sửa hoặc chốt

### RULE01 Kết thúc sớm đang được ghi là hoàn thành P0

finish_run gán COMPLETED cho run ACTIVE mà không kiểm tra đủ vòng. Dashboard tính completed_runners theo trạng thái này. Cần tách kết thúc phiên và đạt yêu cầu; thêm outcome hoặc trạng thái tương đương. Kiểm thử: finish ở 0 vòng, thiếu vòng và đủ vòng cho kết quả đúng; không làm giải hoàn thành khi vẫn có người chưa đạt theo chính sách đã chốt. Căn cứ: main.py:1683, 1697, 1706.

### RULE02 GPS offline không tương thích giới hạn ingest P0

receive_gps từ chối mẫu quá max_event_age_seconds, mặc định 10 giây, và recorded_at không tăng dần. Không có batch/segment. Cần contract lưu và xác minh dữ liệu offline riêng; kiểm thử mất mạng vượt cửa sổ, gửi lặp và đảo thứ tự. Căn cứ: main.py:425, 1397, 1420; mobile domain/model.ts:7.

### RULE03 Điều kiện mở phiên chưa đủ P0

create_run chỉ chặn phiên ACTIVE trong cùng giải và từ chối giải COMPLETED; chưa có gate check-in hoặc lịch chạy đầy đủ. Cần giới hạn phiên chưa kết thúc trên toàn tài khoản và kiểm tra trạng thái giải bằng server. Việc thay đổi phải xử lý cả yêu cầu đồng thời. Căn cứ: main.py:1359.

### RULE04 Vòng chạy chưa xác minh toàn tuyến P0

record_lap kiểm tra trạng thái, thời gian tối thiểu và số vòng, chưa yêu cầu đi qua checkpoint trung gian theo thứ tự. Route có sequence_no nhưng kiểm tra thứ tự khi lưu tuyến không thay thế kiểm tra hành trình runner. Chốt checkpoint bắt buộc, điểm bắt đầu/đích và quy tắc khi thiếu bằng chứng. Kiểm thử quay quanh checkpoint LAP hoặc bỏ checkpoint không được ghi thành vòng hợp lệ nếu nghiệp vụ yêu cầu đủ tuyến. Căn cứ: main.py:718, 1443, 809.

### RULE05 Chất lượng GPS và khoảng nghỉ P0

accuracy_m hiện được nhận/lưu nhưng chưa dùng làm ngưỡng loại mẫu trong receive_gps. Khoảng cách nối từ vị trí trước đó; chưa có segment cho pause/resume. Cần chốt mẫu kém chính xác dùng để hiển thị, tính khoảng cách hay xác minh vòng; không nối khoảng cách qua đoạn nghỉ/mất dữ liệu trái chính sách. Căn cứ: main.py:425, 1397.

### RULE06 Xếp hạng chưa phải thành tích chính thức P1

top_runners đang ưu tiên số vòng, rồi quãng đường GPS lớn hơn, rồi mới thời gian. Cần chốt tiêu chí xếp hạng người đã hoàn thành, người đang chạy và trường hợp không đạt; tránh quãng đường dư do GPS làm tăng hạng. Kiểm thử hai người đủ vòng, người về nhanh hơn nhưng quãng đường GPS ngắn hơn vẫn xếp đúng theo thể lệ. Căn cứ: main.py:1731.

### RULE07 Trạng thái giải và thời gian cần nhất quán P1

Race.status là chuỗi tự do; tạo run chưa chuyển trạng thái giải sang đang chạy. create_run có thể cập nhật start_at; hoàn thành tự cập nhật end_at. Cần tách lịch dự kiến/thực tế và kiểm tra end >= start; không dựa vào frontend để bảo vệ quy tắc. Căn cứ: main.py:102, 334, 926, 694, 1359.

<!-- page -->

## 6 Phân công tích hợp và điều kiện bàn giao

### API đã có nhưng web chưa nối giao diện

Các mục sau thuộc backlog frontend; chỉ cần backend hỗ trợ xác minh contract và sửa nghiệp vụ được nêu riêng.

| API hiện có với prefix /api/v1 | Việc frontend cần làm |
| --- | --- |
| POST /runner-devices | Form gán wearable cho sinh viên |
| POST /races/{race_id}/checkpoints | Form tạo checkpoint mới |
| POST /runs | Thao tác mở phiên từ web |
| POST /runs/{run_id}/finish | Thao tác kết thúc thủ công sau khi chốt RULE01 |
| GET /races/{race_id}/device-events | Nhật ký riêng nếu cần; /checkpoint-events hiện đã phục vụ matching |

Tạo sinh viên và đăng ký vào giải đã có giao diện trong CreateStudent.tsx và People.tsx. Không yêu cầu backend làm lại các API đó. Route, dashboard, matching và WebSocket Admin cũng đã có; yêu cầu mới chủ yếu là scope sinh viên hoặc dữ liệu/thao tác còn thiếu.

### Bộ tài liệu backend cần bàn giao

1. OpenAPI đúng phiên bản và môi trường thử nghiệm, kèm tài khoản sinh viên/Admin có quyền tương ứng.
2. Bảng chuyển trạng thái giải, đăng ký, attendance và run; quy tắc đủ vòng, đạt/chưa đạt, kết thúc sớm và hủy.
3. Ví dụ request/response thành công và lỗi cho từng luồng; mapping lỗi validation, unauthorized, conflict, terminal và retryable.
4. Quy tắc idempotency, revision, ACK, GPS gửi muộn, pause/resume offline, giới hạn request và cách phục hồi khi mất response.
5. Schema/migration cho tài khoản, attendance, đoạn chạy, khoảng nghỉ và dữ liệu giải bổ sung; đảm bảo không làm mất lịch sử hiện có.

### Kịch bản nghiệm thu liên thông tối thiểu

- Sinh viên đăng nhập, xem giải, đăng ký và nhận bib; web thấy cùng participant/bib.
- Check-in hợp lệ rồi bắt đầu chạy; web thấy phiên, GPS và bước chân nếu nguồn hỗ trợ.
- Pause/resume không tính thời gian nghỉ và không nối GPS qua segment.
- Mất mạng rồi kết nối lại: ACK/retry không gây mất hoặc nhân đôi dữ liệu và vòng chạy.
- Đủ vòng được server xác nhận; dừng sớm hiển thị kết quả khác; lịch sử, thống kê và web nhất quán.
- Tài khoản khác không đọc/sửa run; đăng ký hoặc start đồng thời không phá ràng buộc.
- Mở lại app khôi phục đúng trạng thái; mất response thao tác ghi không tạo tài nguyên trùng.
- GPS_AND_ARDUINO giữ cơ chế xử lý mơ hồ; không tự suy luận danh tính khi thiếu bằng chứng.

<!-- page -->

## 7 Căn cứ mã nguồn và quyết định cần thống nhất

Đường dẫn dưới đây tính từ gốc repository Smart_Running_Checkpoint_IoT, tại mốc 81bf16b. Số dòng dùng để truy vết lần rà soát này và có thể thay đổi khi code được cập nhật.

### Nguồn backend

- services/backend/app/main.py:102 - Race, Student, RaceParticipant và RunSession; dữ liệu giải, hồ sơ, đăng ký và phiên.
- services/backend/app/main.py:334 - schema đầu vào RaceIn, RunIn, GpsIn và FinishIn.
- services/backend/app/main.py:584 - xác thực Admin/Simulator/Wearable/Gateway; chưa có danh tính sinh viên.
- services/backend/app/main.py:694 - hoàn thành giải/phiên và record_lap.
- services/backend/app/main.py:947 - danh sách giải trả tập trường rút gọn.
- services/backend/app/main.py:1073 - tạo/tìm sinh viên, gán wearable và tạo checkpoint.
- services/backend/app/main.py:1306 - roster và đăng ký/cấp bib.
- services/backend/app/main.py:1358 - tạo run và điều kiện mở phiên.
- services/backend/app/main.py:1396 - nhận GPS, validation, khoảng cách và geofence.
- services/backend/app/main.py:1683 - finish_run; 1705 - dashboard và xếp top runners.
- services/backend/app/main.py:1809 - chi tiết/events theo run; 1836 - WebSocket Admin.

### Nguồn frontend

- apps/student-mobile/src/services/api.ts - bốn phương thức API thật đang trả CONTRACT_PENDING.
- apps/student-mobile/src/services/contract.ts - interface StudentService.
- apps/student-mobile/src/domain/model.ts - Race, Enrollment, Run, Sample, Operation, Ack và Snapshot mà UI cần.
- apps/student-mobile/docs/API_GAPS.md - yêu cầu contract và các chính sách chỉ áp dụng trong mock.
- apps/admin-web/src/services/apiAdapter.ts:124 - danh sách giải hiện gán location là dấu gạch và các chỉ số thiếu là null.
- apps/admin-web/src/features/checkpoints/Checkpoints.tsx:67 - UI thiếu danh sách/trạng thái online thiết bị.
- apps/admin-web/src/features/dashboard/Analytics.tsx:74 - vòng nhanh nhất toàn giải chưa có tổng hợp.
- apps/admin-web/src/features/runners/CreateStudent.tsx và People.tsx - tạo sinh viên và đăng ký đã được nối.
- apps/admin-web/src/services/adminOperations.ts - tạo/theo dõi/dừng simulation và xóa giải đã được nối.

### Các quyết định cần backend và frontend chốt trước triển khai

1. Điện thoại là nguồn GPS chính, bổ sung hay thay wearable; có yêu cầu bước chân trên điện thoại không?
2. Check-in có bắt buộc trước start; check-out có bắt buộc để công nhận tham gia không?
3. Pause/resume offline có được phép; active duration và elapsed duration được dùng thế nào?
4. Dữ liệu GPS gửi muộn được lưu, tính quãng đường và xác minh vòng ở mức nào?
5. Một vòng hợp lệ cần đủ checkpoint theo thứ tự hay chỉ đi qua checkpoint LAP?
6. Điều kiện đạt giải, kết thúc sớm, thời hạn xác minh và cách xếp hạng chính thức là gì?

Đề nghị phản hồi theo mã MOB, WEB và RULE, kèm quyết định nghiệp vụ, endpoint/DTO cuối cùng, phần phụ thuộc và trạng thái dự kiến bàn giao. Mức ưu tiên trong báo cáo là đề xuất để lập kế hoạch, không phải cam kết tiến độ của đội backend.
