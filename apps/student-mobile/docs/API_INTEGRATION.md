# Kết nối frontend với backend sinh viên

Cập nhật: 28/10/2026. Hợp đồng đối chiếu: backend `a5665f4` (bản sửa backend `5ff5e49`). Chỉ sửa frontend, không sửa hoặc chuyển nhánh backend.

## Đã nối

| Phần          | Thực hiện                                                                                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tài khoản app | Login bằng mã sinh viên/mật khẩu, installation UUID cố định, access/refresh token, gia hạn có tuần tự hóa, logout và đổi mật khẩu tạm thời bắt buộc                     |
| Giải chạy     | Danh sách phân trang cursor, chi tiết, tuyến và checkpoint, mô tả, số chỗ và quyền thao tác do server trả                                                               |
| Tham gia      | Đăng ký nhận bib, check-in/check-out bằng GPS thật, start kèm bằng chứng vị trí và đồng ý thu GPS                                                                       |
| Phiên chạy    | Current run, lịch sử, vòng và track phân trang, trạng thái pause/resume, kết thúc sớm gọi withdraw (không tự công nhận hoàn thành)                                      |
| Đồng bộ       | UUID cho thao tác/mẫu/lô; lưu nguyên payload và expected_revision để retry; lưu ACK trước khi xóa queue; không gửi lại mutation đã thành công chỉ vì tải snapshot lỗi   |
| Web quản trị  | Đọc location/total_laps/participant_count từ backend; tab App sinh viên để đọc/lưu chính sách công bố/đăng ký có expected_version; cấp tài khoản từ danh sách sinh viên |

Token native lưu trong SecureStore. Không đưa admin key vào app. Web preview không lưu token API. Mật khẩu tạm trên web chỉ giữ trong state của hộp thoại và mất khi đóng; không ghi vào localStorage hay log. Nếu phản hồi cấp tài khoản bị mất, cần backend kiểm tra/reset mật khẩu, không giả định cấp thất bại.

## Chạy API thật

Trong cấu hình môi trường của `apps/student-mobile`:

```dotenv
EXPO_PUBLIC_SERVICE_MODE=api
EXPO_PUBLIC_GPS_MODE=device
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8000
EXPO_PUBLIC_BACKGROUND_GPS=false
```

Base URL chấp nhận cả host gốc và hậu tố `/api/v1`. Android Emulator dùng `10.0.2.2` để tới máy host; điện thoại dùng địa chỉ backend truy cập được từ mạng của thiết bị. Dùng HTTPS cho môi trường triển khai. Kiểm tra `.env.local` vì có thể ghi đè `.env`; khởi động lại Metro sau thay đổi. Không tự thay cấu hình local đang chạy demo của người dùng.

Backend cần bản có student API, migrations tương ứng, tài khoản đã cấp và giải/cửa sổ điểm danh hợp lệ. Web dùng `VITE_DATA_MODE=api` theo cấu hình hiện có và `VITE_API_BASE_URL` kết thúc bằng `/api/v1` (kiểm tra tên biến mode trong README web). Đăng nhập web bằng admin key riêng. Trong Sinh viên toàn hệ thống chọn Cấp tài khoản app; trong Thiết lập giải chọn App sinh viên để công bố/cấu hình đăng ký. Công bố không tự đổi lifecycle của giải.

App native gửi platform IOS/ANDROID. React Native Web chỉ là preview; dùng platform ANDROID cho hợp đồng hiện tại, không phải một nền tảng WEB được backend hỗ trợ riêng.

## Đồng bộ và giới hạn còn lại

- Backend đã sửa datetime, hash sample khi đổi batch, finish thiếu vòng và WebSocket datetime. Các lỗi HTTP vẫn hiển thị rõ, không chuyển sang dữ liệu mẫu.
- GPS cũ: lô được giữ nguyên khi mất phản hồi; mẫu bị server trả REJECTED được ghi lý do và không coi là đã chấp nhận. Backend mặc định nhận GPS mobile trễ tối đa 300 giây khi run còn ACTIVE; thời hạn có thể cấu hình ở máy chủ. App không tự xóa mẫu chỉ dựa trên tuổi mẫu mà chờ ACK. Giới hạn 10 giây của nguồn khác không áp cho mobile.
- Pause/resume/withdraw yêu cầu mạng; không áp thời điểm pause offline của mock lên API thật. Resume gửi baseline bước 0 vì app chưa thu cảm biến đếm bước; GPS không gửi số bước giả.
- Phiên thiết bị khác: app hiển thị thông báo và chặn khởi động thu GPS; backend tiếp tục là nơi kiểm tra quyền sở hữu.
- Dùng polling 5 giây; chưa nối WebSocket student. Mỗi lượt đồng bộ gửi GPS trước khi tải lại toàn bộ dữ liệu để giảm nguy cơ mẫu hết hạn. Tuyến cache tối đa 30 giây, track/laps cache theo revision. Danh sách lịch sử tải đủ các trang backend cung cấp; cần bổ sung tải theo màn hình nếu dữ liệu lớn.
- Chưa thêm UI chỉnh cửa sổ/vùng điểm danh do contract hiện tại thiếu luồng đọc cấu hình đầy đủ an toàn; web đã nối DRAFT → SCHEDULED → LIVE. Không dùng admin finish để thay thế việc chạy đủ vòng.
- Thống kê hiện tính từ các phiên đã tải theo logic màn hình hiện có; chưa đổi sang `/student/dashboard` (định nghĩa check-in/participation khác nhau).

## Kiểm tra

Có kiểm thử adapter bằng phản hồi HTTP giả lập theo contract: login/installation, refresh đồng thời, mất phản hồi refresh, batch retry sau khởi động lại, ACK thiếu, GPS bị từ chối, chặn GPS giả/tài khoản khác, mutation đã commit nhưng tải lại lỗi, giữ expected_revision, cursor, mapping pause/track/laps. Các kiểm thử này không thay thế nghiệm thu với backend thật hoặc đo GPS trên thiết bị thật.

Nghiệm thu sau backend sửa: cấp tài khoản → đổi mật khẩu → công bố và mở đăng ký → đăng ký → check-in → LIVE → start → GPS → pause/resume → đủ vòng hoặc withdraw → check-out → lịch sử; thử mất mạng, khởi động lại và đăng nhập thiết bị khác. Không dùng tài khoản/mock GPS demo để kết luận đã nghiệm thu API thật.

Kết quả kiểm tra của lượt tích hợp API trước (trước bổ sung lifecycle UI):

- App: 47/47 tests; typecheck và lint đạt; xuất bundle Android, iOS và web thành công.
- Web quản trị: 47/47 tests; typecheck và lint đạt; build Vite thành công (còn cảnh báo kích thước bundle trên 500 kB).
- Tổng cộng 94/94 tests. Không thay đổi mã backend, không tạo tài khoản hoặc ghi dữ liệu trên backend thật trong lượt này.
- Bundle export không tương đương kiểm thử APK/IPA hay nghiệm thu API trên thiết bị. Chưa chạy trọn luồng với backend thật sau các bản sửa đang chờ.

## Lifecycle trên web và bảo vệ tạm thời (28/10/2026)

Vào Giải chạy → chọn giải. Bản nháp có nút **Chuyển sang Sắp diễn ra**; giải SCHEDULED có nút **Mở giải sang LIVE**. Gửi PATCH `/api/v1/races/{id}/status` với `expected_status` đã đọc và trạng thái đích. Sinh viên cần đăng ký trước khi mở LIVE vì backend chỉ cho tự đăng ký lúc SCHEDULED. Thời điểm mở thực tế (`actual_start_at`) hiển thị riêng với lịch dự kiến.

Web chỉ báo xác nhận sau phản hồi backend hoặc sau khi đọc lại đúng trạng thái đích. Khi mất phản hồi/xung đột, nút gửi bị khóa cho đến khi kiểm tra lại trạng thái. Sau PATCH đã thành công nhưng tải lại lỗi, chỉ thử tải lại, không gửi lại PATCH. Nút không xuất hiện cho LIVE/CANCELLED/COMPLETED; chưa thêm thao tác hủy/đóng LIVE vì backend chưa cung cấp.

App ghi đè quyền check-in sai của giải CANCELLED, chặn đăng ký/check-in/start theo trạng thái đã tải, và đọc lại trạng thái trước khi POST check-in/start. Đây chỉ là bảo vệ phía client: không giải quyết được trường hợp backend hủy giải giữa GET và POST hoặc client khác gọi trực tiếp API. Hai lỗi R01/R02 trong báo cáo audit vẫn cần backend sửa; web không thêm thao tác tạo run qua API quản trị cũ. Check-out của lượt đã tham gia giữ nguyên quy tắc server.

Web nhận sự kiện `runner.ended` mới, hiển thị ABANDONED thay vì hoàn thành; cập nhật cũ không được làm phiên kết thúc sớm quay về ACTIVE. App giải thích các mã từ chối GPS và hiển thị chính sách mặc định 5 phút khi mất mạng.

Kiểm tra bổ sung cho lifecycle và backend mới: **51/51 test app + 52/52 test web** đạt; typecheck/lint đạt. Kiểm thử giao diện Playwright với API giả lập đã qua chuyển DRAFT→SCHEDULED, mở LIVE mất phản hồi, xung đột 409 và ghi thành công nhưng tải lại lỗi; không có PATCH trùng hay lỗi trang. Đây không phải nghiệm thu UI với backend thật. Không tạo hoặc mở giải thật trong lượt cập nhật này.

Build sau cập nhật: web Vite thành công (còn cảnh báo bundle trên 500 kB); Expo xuất bundle Android, iOS và web thành công. Chưa kiểm thử APK/IPA trên thiết bị thật.
