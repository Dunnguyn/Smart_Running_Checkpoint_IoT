# Báo cáo lỗi nghiêm trọng cần sửa backend NEU RUN

Gửi đội backend • Ngày 27/10/2026 • Phiên bản kiểm tra 67927c1

## 1 Kết luận và thứ tự xử lý

Đề nghị sửa các vấn đề dưới đây trước khi nghiệm thu tích hợp app sinh viên và web quản trị. Hiện luồng đăng ký, điểm danh và bắt đầu chạy chưa đi xuyên suốt bằng API; đồng bộ GPS và công nhận hoàn thành còn có trường hợp sai.

Báo cáo tập trung 7 vấn đề: 6 nhóm đã có kiểm tra tái hiện và 1 khoảng trống xác nhận từ source/OpenAPI. Không bao gồm các tính năng tiện ích hoặc backlog quản trị ít cấp thiết.

| Mã | Mức | Vấn đề và tác động |
| --- | --- | --- |
| F01 | P0 | Lỗi múi giờ gây HTTP 500 ở danh sách giải, chi tiết, map và check-in hợp lệ trên SQLite. |
| F07 | P0 | Thiếu API chuyển giải SCHEDULED sang LIVE; luồng tự đăng ký rồi bắt đầu chạy bị đứt. |
| F02 | P1 | Retry cùng GPS sample trong batch mới bị báo xung đột; ảnh hưởng phục hồi hàng đợi. |
| F03 | P1 | GPS offline 20 giây bị từ chối với cấu hình mặc định; chưa đáp ứng đồng bộ sau mất mạng. |
| F04 | P1 | Admin finish ở 0/4 vòng vẫn ghi COMPLETED; làm sai kết quả và thống kê hoàn thành. |
| F05 | P1 | Event chứa datetime không gửi được qua Admin WebSocket; subscriber bị loại khỏi hub. |
| F06 | P1* | Chưa kiểm tra checkpoint trung gian; có thể nhận vòng khi chưa có bằng chứng đủ tuyến. |

P0: chặn luồng sử dụng chính. P1: ảnh hưởng tính đúng của dữ liệu hoặc vận hành, cần sửa trước nghiệm thu. P1* của F06 áp dụng nếu thể lệ yêu cầu chạy đủ checkpoint; cần chốt rõ thay vì mặc định coi đã xác minh toàn tuyến. Mức ưu tiên lỗi khác với mức ưu tiên hạng mục trong báo cáo yêu cầu ban đầu.

### Bằng chứng và phạm vi

- Mốc source: origin/main tại 67927c1d628105597c1a75c317f31160a2e7ee05. Backend trên origin/be tại f158a57 giống bản được kiểm tra.
- Bộ kiểm tra trước đó có 73 điều kiện: 64 đạt, 9 không đạt; 9 điều kiện không đạt thuộc 6 nhóm F01–F06. Đây không phải tỷ lệ hoàn thành sản phẩm.
- Request đi qua ASGI/FastAPI và SQLite riêng. F05 kiểm tra bộ mã hóa WebSocket Starlette; F06 kiểm tra trực tiếp engine tính vòng. F07 xác nhận bằng source và OpenAPI.
- Không sử dụng database demo của người dùng. Chưa nghiệm thu UI, điện thoại, Arduino, SQL Server, nhiều worker hoặc cạnh tranh ghi đồng thời.
- Do check-in lỗi, các kiểm tra độc lập phía sau dùng attendance và trạng thái LIVE được chuẩn bị trong database thử nghiệm. Chưa có kết quả E2E thành công từ đầu đến cuối.

<!-- page -->

## 2 Các vấn đề chặn luồng sử dụng

### F01 P0 Chuẩn hóa thời gian trong participation

Tác động: sinh viên đã đăng ký có thể không tải được giải và không check-in được dù vị trí hợp lệ. Cùng một nguyên nhân ảnh hưởng nhiều màn hình mobile.

Cách tái hiện trên SQLite:

1. Tạo giải, tài khoản sinh viên và đăng ký sinh viên vào giải.
2. Cấu hình attendance qua API Admin với giờ mở/đóng ISO có múi giờ, rồi để request kết thúc và dữ liệu được đọc lại từ database.
3. Gọi GET /api/v1/student/races, GET /api/v1/student/races/{id}, GET /api/v1/student/races/{id}/map hoặc POST /api/v1/student/races/{id}/check-in với vị trí mới, đúng vùng và accuracy hợp lệ.

Thực tế: bốn kiểm tra đều trả HTTP 500 với TypeError: can't compare offset-naive and offset-aware datetimes.

Nguyên nhân: SQLite đọc DateTime không giữ tzinfo, trong khi _participation so sánh trực tiếp config.check_in_open_at/check_in_close_at và check_out với now_utc(). Một số hàm validate đã chuẩn hóa, nhưng projection trả về chưa chuẩn hóa.

Yêu cầu sửa: thống nhất mọi thời gian so sánh về UTC qua _utc/aware hoặc cơ chế tương đương. Kiểm tra cả actions trả về, không chỉ validation đầu vào. Không che lỗi bằng cách bỏ điều kiện cửa sổ điểm danh.

Nghiệm thu: các API đọc trả 200; check-in hợp lệ trả thành công và lưu đúng một attendance. Test sau commit/load trong request mới, trước giờ mở, đúng biên giờ, sau giờ đóng và với thời gian đầu vào có offset khác nhau. Các ca sai vị trí/accuracy vẫn bị từ chối đúng lỗi.

Vị trí: services/backend/app/student_api.py, hàm _participation từ dòng 538, các điều kiện actions khoảng 560–574; student_race_map gọi lại _race_view khoảng dòng 984. Đối chiếu MOB02, MOB04.

### F07 P0 Bổ sung chuyển trạng thái giải qua API quản trị

Bằng chứng source: _registration_gate chỉ cho tự đăng ký khi giải SCHEDULED; student_start_run chỉ cho mở phiên khi giải LIVE. OpenAPI hiện không có thao tác quản trị chung chuyển giải đã tạo từ SCHEDULED sang LIVE.

Tác động: dù sửa F01, luồng tạo giải → công bố → tự đăng ký → bắt đầu chạy vẫn không khép kín bằng các API sản phẩm. Tạo giải LIVE từ đầu không thay thế được bước tự đăng ký yêu cầu SCHEDULED. API demo đặc thù không thay thế thao tác quản trị giải thông thường.

Yêu cầu sửa: bổ sung API chuyển trạng thái với phân quyền Admin, điều kiện chuyển, chống ghi đè và phản hồi rõ. Tên endpoint do backend chốt; cần giữ nguyên đăng ký/bib, không yêu cầu chỉnh database thủ công. Đồng bộ lịch dự kiến và thời điểm bắt đầu thực tế theo quy tắc đã thống nhất.

Nghiệm thu: tạo giải SCHEDULED, công bố và cho sinh viên đăng ký; Admin mở giải thành LIVE; sinh viên check-in/start thành công hoàn toàn qua API. Sinh viên không được tự đổi trạng thái; trạng thái đã đóng/hủy không được mở run mới.

Vị trí: student_api.py:447 (_registration_gate), 1051 (student_start_run); routes main.py và OpenAPI tại mốc kiểm tra. Đối chiếu WEB01, RULE07. Đây là khoảng trống xác nhận từ code, chưa phải một request lifecycle thất bại vì endpoint chưa tồn tại.

<!-- page -->

## 3 Các vấn đề đồng bộ GPS

### F02 P1 Tách danh tính sample khỏi batch khi chống gửi lặp

Cách tái hiện:

1. Có run mobile ACTIVE hợp lệ. Gửi batch A chứa sample S với sample_id, sequence, recorded_at, tọa độ, accuracy và steps hợp lệ.
2. Server xác nhận sample được chấp nhận.
3. Gửi lại đúng sample S, giữ nguyên mọi trường của sample nhưng dùng batch_id B mới.

Thực tế: HTTP 409 SAMPLE_ID_CONFLICT. Gửi lại nguyên batch A thì thành công. Trường hợp này xảy ra khi app gom lại hàng đợi hoặc gửi lại sau khi mất phản hồi.

Nguyên nhân đã đối chiếu: sample_hash được tính từ GpsIn có cả batch_id. Việc thay envelope lô gửi làm hash thay đổi dù mẫu GPS không đổi.

Yêu cầu sửa: định nghĩa canonical sample payload chỉ chứa danh tính/nội dung mẫu phù hợp; batch_id không làm thay đổi nội dung sample. Batch vẫn có kiểm tra idempotency riêng. Đồng thời kiểm tra cách chuẩn hóa bước chân: hash được so trước bước hiệu chỉnh total_steps sau resume, còn core.receive_gps lưu hash sau hiệu chỉnh. Nhánh này là điểm cần kiểm tra bổ sung, chưa được coi là lỗi đã tái hiện độc lập.

Nghiệm thu:

- Cùng sample, cùng batch hoặc batch khác đều nhận ACK hợp lệ; không nhân đôi quãng đường, bước chân hay vòng.
- Cùng sample_id nhưng đổi tọa độ/timestamp/nội dung thật phải bị conflict.
- Retry sau mất response và sau pause/resume vẫn đúng; mẫu không có steps_since_start không bị suy diễn khác nội dung theo trạng thái run hiện tại.
- ACK phân biệt rõ ACCEPTED, DUPLICATE và REJECTED để frontend xử lý hàng đợi.

Vị trí: services/backend/app/student_api.py:1180–1196 và 1215–1220; main.py:1495. Đối chiếu MOB06.

### F03 P1 Chốt và triển khai chính sách GPS gửi muộn

Cách tái hiện: tạo mẫu trong thời gian phiên đang chạy, sequence mới, tọa độ/accuracy hợp lệ; gửi sau 20 giây. Cấu hình mặc định max_event_age_seconds là 10 giây.

Thực tế: HTTP 200 cho batch nhưng item trả accepted=false, status=REJECTED và reason_code=GPS_TOO_OLD. Không được coi HTTP 200 là đã đồng bộ thành công mọi mẫu.

Nguyên nhân: student_gps_batch gọi core.receive_gps và kế thừa giới hạn thời gian realtime của wearable/matching. Batch API mới chưa tạo được luồng lưu lịch sử offline theo yêu cầu app.

Yêu cầu sửa: tách rõ nhận/lưu lịch sử, tính quãng đường và xác minh checkpoint. Công bố giới hạn tuổi mẫu offline, thứ tự xử lý, thời hạn sau kết thúc và lý do từ chối vĩnh viễn/có thể retry. Không chỉ tăng cửa sổ ghép Arduino để nhận mọi GPS cũ.

Nghiệm thu: mất mạng 20 giây, 60 giây và tới ngưỡng chính sách đã chốt có kết quả xác định; không mất mẫu được phép lưu, không đếm vòng trùng, không nối quãng đường qua đoạn nghỉ/mất mẫu trái quy định. Mẫu quá hạn có ACK từ chối rõ ràng; frontend không retry vô hạn.

Vị trí: student_api.py:1218–1220; main.py:1521 và cấu hình max_event_age_seconds. Đối chiếu MOB06, RULE02. Nếu quyết định không hỗ trợ offline, cần thay đổi yêu cầu và hành vi frontend được thống nhất; không đánh dấu yêu cầu hiện tại đã hoàn thành.

<!-- page -->

## 4 Các vấn đề tính đúng của kết quả

### F04 P1 Không gán hoàn thành cho mọi thao tác finish

Cách tái hiện: tạo run ACTIVE thuộc giải yêu cầu 4 vòng, lap_count=0; gọi POST /api/v1/runs/{run_id}/finish với quyền Admin.

Thực tế: response trả status=COMPLETED, is_done=true, lap_count=0. finish_run gán trạng thái hoàn thành mà không kiểm tra điều kiện đủ vòng. Mobile withdraw đã trả ABANDONED nhưng không sửa đường đi Admin này.

Tác động: dashboard và thống kê dựa trên COMPLETED có thể công nhận sai người đạt yêu cầu. Đóng phiên thủ công không đồng nghĩa đạt thể lệ. Điều kiện hoàn thành giải cũng có thể bị ảnh hưởng nếu dựa trên trạng thái các run.

Yêu cầu sửa:

- Tách trạng thái phiên đã đóng khỏi kết quả đạt/chưa đạt bằng trạng thái hoặc outcome thống nhất.
- Khi thiếu vòng, finish thường phải kết thúc sớm hoặc trả lỗi nghiệp vụ phù hợp; không ngầm công nhận đạt.
- Nếu cần Admin override kết quả, định nghĩa riêng quyền, lý do và nhật ký thay đổi; không dùng chung hành vi finish mặc định.
- Thống nhất response với mobile, dashboard, lịch sử và thống kê. Chốt cách xử lý GPS/matching chưa xác minh lúc kết thúc.

Nghiệm thu: thử 0 vòng, thiếu vòng, đủ vòng và finish lặp; dữ liệu terminal không bị thay đổi trái quy tắc. Người kết thúc sớm không làm tăng số hoàn thành chính thức. Hủy/rút phiên không bị đổi ngược thành hoàn thành khi retry.

Vị trí: services/backend/app/main.py:1804–1817, finish_run. Đối chiếu MOB07, RULE01.

### F06 P1 có điều kiện Xác minh checkpoint trung gian

Bằng chứng kiểm tra engine: fixture có checkpoint CONTROL và LAP, không có passage CONTROL. Sau khoảng thời gian tối thiểu, gọi record_lap tại LAP vẫn nhận counted=true, lap_count=1. Đây là kiểm tra trực tiếp engine, chưa phải bằng chứng thử gian lận trên thiết bị thật.

Nguyên nhân: record_lap kiểm tra trạng thái run, thời gian và số vòng nhưng chưa yêu cầu bằng chứng đi đủ checkpoint theo thứ tự. Kiểm tra thứ tự route anchor lúc cấu hình không chứng minh runner đã đi đủ tuyến.

Tác động: nếu thể lệ yêu cầu đủ tuyến, kết quả có thể được công nhận khi thiếu checkpoint. Bản đồ có nhiều checkpoint không tự làm thuật toán xác minh đầy đủ hơn.

Yêu cầu xử lý:

1. Backend và frontend xác nhận thể lệ chính thức: chỉ LAP hay phải đủ các checkpoint bắt buộc theo thứ tự.
2. Nếu yêu cầu đủ tuyến, lưu tiến độ checkpoint theo run/vòng; chỉ chốt vòng khi đủ bằng chứng hợp lệ. Quy định rõ trường hợp mất GPS hoặc Arduino mơ hồ.
3. Nếu thể lệ chỉ cần LAP, cập nhật tài liệu/UI và phạm vi nghiệm thu; không mô tả kết quả là đã xác minh toàn tuyến.

Nghiệm thu khi yêu cầu đủ tuyến: đi đúng thứ tự được ghi vòng; bỏ checkpoint, đảo thứ tự, lặp checkpoint hoặc quay lại LAP sớm không tạo vòng hợp lệ; sự kiện lặp không được dùng cho nhiều vòng.

Vị trí: services/backend/app/main.py:747–766, record_lap và các nơi gọi hàm. Đối chiếu RULE04.

<!-- page -->

## 5 Cập nhật realtime và điều kiện bàn giao lại

### F05 P1 Chuẩn hóa payload WebSocket trước khi phát

Cách tái hiện: đăng ký một subscriber WebSocket cho giải bằng đối tượng Starlette thực; gọi self-registration của sinh viên. REST trả 201 nhưng không có websocket.send; subscriber không còn trong hub sau request.

Nguyên nhân: event có datetime ở occurred_at/registered_at; WebSocket.send_json dùng JSON encoder không tự chuyển datetime. EventHub.publish bắt mọi exception rồi loại subscriber, làm lỗi nội dung bị xử lý như lỗi kết nối.

Tác động: web có thể giữ kết nối nhưng không còn nhận cập nhật mới, khiến danh sách hoặc bản đồ trông như vẫn đang theo dõi trong khi dữ liệu đã cũ. Không có bằng chứng rằng mọi loại event đều hỏng; ca đã tái hiện là event đăng ký.

Yêu cầu sửa: chuẩn hóa payload bằng jsonable_encoder hoặc cơ chế tương đương tại ranh giới phát event. Phân biệt lỗi serialize với client ngắt kết nối và ghi log đủ truy vết. Kiểm tra cả datetime lồng trong run_dict của runner.updated; không chỉ sửa occurred_at ngoài cùng.

Nghiệm thu: subscriber nhận được JSON hợp lệ khi đăng ký, cập nhật runner và kết thúc; vẫn nhận event tiếp theo; một client hỏng không làm client khác mất cập nhật. Kiểm tra lại reconnect và refetch dữ liệu sau kết nối lại.

Vị trí: services/backend/app/main.py:525–533, EventHub.publish; student_api.py:926–930, phát sự kiện đăng ký. Liên quan MOB03 và đồng bộ web.

### Trình tự sửa đề nghị

1. F01 và F07: mở đường chạy xuyên suốt bằng API, không phải chỉnh database để tiếp tục.
2. F02 và F03: hoàn thiện retry, ACK và chính sách dữ liệu offline.
3. F04 và quyết định F06: bảo đảm kết quả được công nhận đúng thể lệ.
4. F05: xác minh web nhận được các thay đổi đã commit.

### Bộ kiểm tra cần có khi bàn giao lại

- Luồng đầy đủ: tạo giải → công bố → tự đăng ký → chuyển LIVE → check-in → start → GPS → pause/resume → đủ vòng hoặc rút sớm → check-out → lịch sử/thống kê.
- Dùng request riêng sau commit để bắt lỗi thời gian và dữ liệu đọc lại từ SQLite.
- Mất response, mất mạng và gom batch lại; kiểm tra ACK từng mẫu cùng các tổng quãng đường/vòng.
- Đối chiếu cùng một kết quả trên mobile, REST Admin và event WebSocket.
- Bổ sung regression tests cho từng mã F; báo rõ commit sửa và kết quả chạy. Không coi chỉ thêm endpoint hoặc tài liệu là đã nghiệm thu lỗi.

### Căn cứ và cách phản hồi

Số dòng trong báo cáo tham chiếu source tại 67927c1, có thể thay đổi sau khi sửa. Bằng chứng chi tiết nằm trong output/backend-review/audit_results_67927c1.json; báo cáo đối chiếu đầy đủ nằm trong output/backend-review/Doi_chieu_backend_67927c1.md.

Đề nghị phản hồi theo F01–F07: nguyên nhân xác nhận, hướng xử lý, commit sửa, test đã chạy và quyết định nghiệp vụ còn cần chốt. Bản báo cáo này tổng hợp kết quả lần kiểm tra đã nêu, không khẳng định các commit sau 67927c1 vẫn còn lỗi.
