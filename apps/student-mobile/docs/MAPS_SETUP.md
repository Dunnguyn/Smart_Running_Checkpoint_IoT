# Google Maps Android — cấu hình còn thiếu

17/10/2026: không tìm thấy key trong cấu hình app hiện tại. UI giữ sơ đồ có nhãn; **chưa nghiệm thu Google Maps SDK**.

- Biến local: `ANDROID_MAPS_API_KEY` trong `.env.local` hoặc môi trường build. Không đưa key vào chat/log/Git.
- API restriction: chỉ Maps SDK for Android.
- Application restriction: Android apps, package `vn.edu.neu.run.student`.
- SHA-1 của chứng chỉ debug local hiện dùng: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`.
- APK demo nội bộ dùng cùng chứng chỉ debug. Khi dùng chứng chỉ phân phối khác phải đăng ký fingerprint tương ứng; không dùng fingerprint này cho mọi build.

Chỉ người quản lý dự án Google Cloud mới bổ sung key từ dự án đã được phép sử dụng. Công việc này không tự tạo tài khoản, bật billing hoặc đăng ký dịch vụ trả phí.

Sau khi đặt key, chạy prebuild Android theo hướng dẫn Expo và rebuild native. Sao lưu key ký local trước khi sinh lại thư mục Android; không thay thế key ký đang sử dụng. Không chỉ reload JavaScript. Kiểm thử tiles tải được, zoom/fit, marker/callout, vòng attendance, vị trí, polyline quy định và track đỏ/cam theo đoạn. `onMapReady` chỉ chứng minh view sẵn sàng; UI hiện dùng `onMapLoaded` để phân biệt tải nền. Timeout có thông báo/thử lại, nhưng SDK có thể không báo mọi lỗi authorization qua callback — cần kiểm tra log SDK đã che key khi nghiệm thu.

Provider: Google trên Android, `react-native-maps` 1.27.2 theo Expo SDK 57. Các đoạn track ngắt theo segment và khoảng mất tín hiệu trên 30 giây; đây là quy tắc hiển thị/thu của thiết bị, không phải quy tắc xác nhận kết quả BE.

Nguồn: [Expo SDK 57 MapView](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/).
