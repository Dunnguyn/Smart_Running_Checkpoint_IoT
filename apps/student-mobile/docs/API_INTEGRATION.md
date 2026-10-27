# Kết nối frontend với backend sinh viên

Cập nhật: 28/10/2026. Hợp đồng đối chiếu: backend `67927c1` (nội dung student API tương ứng `f158a57`). Chỉ sửa frontend, không sửa hoặc chuyển nhánh backend.

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

## Cách xử lý các lỗi còn chờ backend

- Lỗi datetime ở participation/check-in: app giữ thông báo lỗi, không chuyển sang dữ liệu mẫu. Lỗi này vẫn có thể chặn tải danh sách/đăng ký/điểm danh.
- GPS cũ: lô được giữ nguyên khi mất phản hồi; mẫu bị server trả REJECTED được ghi lý do và không coi là đã chấp nhận. Chưa thể cam kết GPS offline được công nhận khi backend còn giới hạn 10 giây.
- Pause/resume/withdraw yêu cầu mạng; không áp thời điểm pause offline của mock lên API thật. Resume gửi baseline bước 0 vì app chưa thu cảm biến đếm bước; GPS không gửi số bước giả.
- Phiên thiết bị khác: app hiển thị thông báo và chặn khởi động thu GPS; backend tiếp tục là nơi kiểm tra quyền sở hữu.
- Dùng polling 5 giây; chưa nối WebSocket student. Mỗi lượt đồng bộ gửi GPS trước khi tải lại toàn bộ dữ liệu để giảm nguy cơ mẫu hết hạn. Tuyến cache tối đa 30 giây, track/laps cache theo revision. Danh sách lịch sử tải đủ các trang backend cung cấp; cần bổ sung tải theo màn hình nếu dữ liệu lớn.
- Chưa thêm UI chỉnh cửa sổ/vùng điểm danh do contract hiện tại thiếu luồng đọc cấu hình đầy đủ an toàn; chưa thêm lifecycle SCHEDULED → LIVE; không dùng admin finish để vượt qua lỗi backend.
- Thống kê hiện tính từ các phiên đã tải theo logic màn hình hiện có; chưa đổi sang `/student/dashboard` (định nghĩa check-in/participation khác nhau).

## Kiểm tra

Có kiểm thử adapter bằng phản hồi HTTP giả lập theo contract: login/installation, refresh đồng thời, mất phản hồi refresh, batch retry sau khởi động lại, ACK thiếu, GPS bị từ chối, chặn GPS giả/tài khoản khác, mutation đã commit nhưng tải lại lỗi, giữ expected_revision, cursor, mapping pause/track/laps. Các kiểm thử này không thay thế nghiệm thu với backend thật hoặc đo GPS trên thiết bị thật.

Nghiệm thu sau backend sửa: cấp tài khoản → đổi mật khẩu → công bố và mở đăng ký → đăng ký → check-in → LIVE → start → GPS → pause/resume → đủ vòng hoặc withdraw → check-out → lịch sử; thử mất mạng, khởi động lại và đăng nhập thiết bị khác. Không dùng tài khoản/mock GPS demo để kết luận đã nghiệm thu API thật.

Kết quả kiểm tra lần này:

- App: 47/47 tests; typecheck và lint đạt; xuất bundle Android, iOS và web thành công.
- Web quản trị: 47/47 tests; typecheck và lint đạt; build Vite thành công (còn cảnh báo kích thước bundle trên 500 kB).
- Tổng cộng 94/94 tests. Không thay đổi mã backend, không tạo tài khoản hoặc ghi dữ liệu trên backend thật trong lượt này.
- Bundle export không tương đương kiểm thử APK/IPA hay nghiệm thu API trên thiết bị. Chưa chạy trọn luồng với backend thật sau các bản sửa đang chờ.
