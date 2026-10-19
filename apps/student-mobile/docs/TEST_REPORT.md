# Báo cáo kiểm thử NEU RUN sinh viên

Ngày thực hiện: 16–17/10/2026. Máy Windows, Node 24.13, npm; Expo SDK 57.0.30, React Native 0.86.3. Phạm vi thay đổi là `apps/student-mobile`; các thay đổi README gốc/admin có sẵn được giữ nguyên.

## Đợt GPS nền và APK demo độc lập

Kết quả mới, snapshot và APK nằm trong [NATIVE_FOLLOWUP.md](NATIVE_FOLLOWUP.md). Đợt này bật background=true, bổ sung task bền vững, kiểm tra đủ vòng qua GPS Android và build release nhúng bundle. Logic hiện có **34/34 unit test** đạt, lint/typecheck đạt. Các số 28 test, background=false và development APK bên dưới là kết quả đợt trước, không phải cấu hình hiện tại. Snapshot assertions được báo riêng, không cộng vào số unit test hay số phiên E2E.

Nghiệm thu 17–18/10: **4/4 vòng, 146 mẫu OS GPS, 5 đoạn**, collector STOPPED/queue 0; Home 67,601 giây và khóa màn hình 68,099 giây có mẫu/ACK mới. **9/9 snapshot assertions** đạt. APK release x86_64 build/cài/đăng nhập/khôi phục đạt khi Metro tắt; hash khớp APK cài thực tế. Xem [gallery ảnh mới](../test-results/BACKGROUND_DEMO_UI.html), [bằng chứng GPS](../test-results/android/background-report.json), [bằng chứng APK](../test-results/demo/acceptance.json). Maps key, contract BE, điện thoại thật và iOS vẫn chưa được nghiệm thu.

## Đợt Android native trước đó — 17/10/2026

**Đã build APK, cài và mở app trên Android Emulator**, thay thế blocker thiếu SDK của lượt 16/10. AVD `Medium_Phone_API_37.0`, Android 17/API 37, x86_64, 1080×2400/density 420; JDK 21.0.8, Gradle 9.3.1. Build thành công trong 20m19s. APK: `android/app/build/outputs/apk/debug/app-debug.apk` (74.978.369 byte); development build cần Metro cổng 8087. [Hướng dẫn, lệnh thực tế, hash APK và ma trận từng luồng](ANDROID_EMULATOR.md).

| Kiểm tra native                            | Kết quả                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Đăng nhập → khám phá → đăng ký → bib       | Đạt trên Emulator, backend mock, bib NR-0265                                                      |
| Quyền bị từ chối → cấp quyền → check-in    | Đạt; lấy vị trí qua Expo Location/Android, không tự start                                         |
| Start → pause → force-stop/mở lại → resume | Đạt; paused giữ 5 mẫu/47,7294 m; resume đoạn 2, mẫu đầu không cộng khoảng cách                    |
| Tuyến Android OS                           | `adb emu geo fix`, tổng 8 mẫu/2 đoạn/68,8691 m; không dùng DemoGps                                |
| Kết thúc sớm → check-out                   | ENDED, chưa đạt 0/4; check-out không sửa kết quả; queue 0                                         |
| Lịch sử, thống kê, hồ sơ                   | Có phiên mới; bộ lọc tuần/tháng đổi số liệu; bib theo giải                                        |
| SQLite / SecureStore                       | Khôi phục paused và đăng nhập sau force-stop; token entry có ciphertext, xóa khi logout           |
| Chuyển tài khoản                           | Tài khoản thứ hai không thấy dữ liệu tài khoản trước; snapshot riêng trong SQLite                 |
| UI native                                  | Kiểm tra bàn phím, safe area, font tiếng Việt, cuộn, nút Back Android; 14 cặp ảnh đối chiếu Figma |
| Background=false                           | Home dừng collector, foreground yêu cầu lấy lại GPS; không coi là kiểm thử GPS chạy nền           |
| Kiểm tra source sau sửa nhãn GPS           | Lint/typecheck đạt, unit 28/28 chạy lại đạt                                                       |

Bằng chứng: `test-results/android/build.json`, các `*-state.json`, PNG/XML và `report.json` (assertions trên snapshot đã thu). Bộ đối chiếu: `test-results/ANDROID_UI_COMPARISON.html`. Chỉ có dữ liệu mock; 2 phiên seed được phân biệt với phiên native mới. Đã sửa lỗi nhãn header GPS ERROR/STOPPED và cách bind Metro IPv4 khi ADB reverse không kết nối được IPv6 localhost.

`node scripts/verify-android-evidence.mjs`: **10/10 điều kiện đạt**. Kiểm tra cú pháp 5 helper Android đạt. Có 42 ảnh native của các bước kiểm thử tại thời điểm tổng hợp. Logcat lọc riêng PID app cho AndroidRuntime:E và ReactNativeJS:E trả 0 dòng ở lần kiểm tra cuối (`runtime-check.json`); đây là snapshot log còn trong buffer, không phải chứng minh mọi thời điểm đều không có lỗi.

**Giới hạn:** chưa kiểm chứng API thật, điện thoại thật, iOS, background=true, Google Maps SDK (thiếu key), font scale lớn và native màn hình nhỏ. Các lỗi GPS service tắt/accuracy thấp, start lỗi, mẫu trùng, hết phiên và hoàn thành đủ vòng vẫn có bằng chứng unit/web, chưa chạy lại toàn bộ trên Emulator. Bản đồ trong ảnh native là sơ đồ có nhãn. Không kết luận pixel-perfect từ hai kích thước khác nhau.

## Kết quả web/controller và môi trường trước khi cài SDK — 16/10/2026

| Kiểm tra                                       | Kết quả                                   | Giới hạn bằng chứng                                               |
| ---------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `npm run lint`                                 | Đạt                                       | ESLint source app                                                 |
| `npm run typecheck`                            | Đạt                                       | TypeScript 6.0.3                                                  |
| `npm test`                                     | 28/28 đạt                                 | Controller, mock service, GPS/storage giả lập                     |
| `npx expo-doctor`                              | 21/21 đạt                                 | Tương thích dependency/config, không chứng minh runtime native    |
| `npm run build`                                | Đạt Android/iOS/web                       | Xuất bundle Hermes/JavaScript; chưa tạo APK/IPA                   |
| Android prebuild                               | Đạt                                       | Sinh project native và kiểm tra manifest                          |
| `npm run android -- --no-install --no-bundler` | Bị chặn ở lượt 16/10; đã giải quyết 17/10 | Lượt mới đã build/cài APK với tên AVD; xem phần Android phía trên |
| `npm run test:ui`                              | Đạt, 27 ảnh, không có page error          | Edge headless, React Native Web, backend/GPS mock                 |
| Reference capture                              | Đạt, 15 ảnh                               | Source Figma + CSS gốc biên dịch Tailwind 4.2.2, 390×844          |

Ảnh và kết quả máy đọc được nằm trong `test-results/ui/report.json`, `test-results/reference-ui/report.json`. Bộ đối chiếu độc lập: `test-results/UI_COMPARISON.html`; tạo lại bằng `node scripts/compare-ui.mjs` sau khi chạy hai script capture. Thư mục này được bỏ qua bởi Git để không commit bundle/screenshot lớn.

## Hành vi được kiểm thử

- Đăng nhập sai, khôi phục paused không bật GPS, hết phiên dừng collector; dữ liệu và hàng đợi tách theo tài khoản/chế độ.
- Đăng ký lặp giữ một enrollment/bib; từ chối hết chỗ/hết hạn/chưa mở/giải hủy. Request có kết quả chưa rõ đọc lại trạng thái và retry cùng ID.
- Check-in không tự start; từ chối mất quyền, ngoài vùng, độ chính xác thấp. Start lỗi không bật collector; không tạo hai phiên chưa kết thúc.
- Thao tác check-in chờ lượt đồng bộ đang chạy rồi đối soát lại; có kiểm thử hồi quy cho thao tác trùng thời điểm polling. Lượt UI cuối đã chạy qua sau bản sửa này.
- Pause dừng nhận mẫu ngay cả callback đến muộn hoặc request mất mạng. Resume tạo segment mới; không cộng khoảng cách qua khoảng nghỉ, không tính vòng từ điểm đầu segment.
- Đồng hồ toàn phiên tiếp tục lúc nghỉ, thời gian hoạt động tách riêng; terminal đóng băng thời gian.
- Mẫu gửi lặp không tính hai lần; chỉ xóa mẫu đã ACK, tách lỗi vĩnh viễn; giới hạn hàng đợi và lỗi lưu trữ dừng thu an toàn. Lệnh start collector đồng thời chỉ tạo một subscription.
- Service quyết định kết quả đạt và dừng GPS. Kết thúc sớm khác hoàn thành; check-out không sửa kết quả.
- UI: đăng nhập/ẩn hiện mật khẩu, đăng ký/bib/check-in/start/pause/khôi phục/resume/kết thúc, pending/chưa đạt, lịch sử đạt, thống kê và profile; trạng thái rỗng, màn hình rộng 320/390/430 và chuyển tài khoản.

Danh sách trong mục này là kiểm thử mock/controller và browser của lượt 16/10. Bằng chứng SQLite/SecureStore và hệ điều hành Emulator mới nằm ở mục Android; Maps SDK và điện thoại thật chưa được kiểm chứng.

## Đối chiếu thiết kế

Giữ assets gốc, icon SVG, palette, bố cục các tab, pill button/card và trạng thái paused. Đã sửa khoảng cách tìm kiếm, font title thẻ giải, dấu vị trí trang trí, segmented controls, shadow, nền paused, metric, CTA chi tiết và các card thống kê sau khi xem ảnh. Bản tham chiếu chỉ sửa bốn dấu phân cách type bị thiếu trong bản sao tạm để chạy được; không sửa source Figma.

Các khác biệt có chủ đích: dữ liệu/ngày/bib có trạng thái, banner GPS giả, trạng thái đồng bộ, hành vi back, map lấy tọa độ model thay hình oval minh họa, và Inter được bundle thay fallback font của source web. Xem `DESIGN_AUDIT.md` để biết ma trận màn hình. Chưa xác nhận pixel-perfect trên native.

## Chưa kiểm chứng và điều kiện để tiếp tục

| Hạng mục                                | Trạng thái / điều kiện                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| API sinh viên thật                      | Chưa có contract phù hợp trong backend. Adapter trả CONTRACT_PENDING, không fallback. Chi tiết ở `API_GAPS.md`.                         |
| Emulator Android / iOS                  | Android đã chạy 17/10; iOS chưa chạy, cần macOS/Xcode.                                                                                  |
| Điện thoại thật                         | Chưa có bằng chứng kiểm thử; cần development build và thiết bị.                                                                         |
| GPS foreground/background/khóa màn hình | Foreground đã nhận GPS OS Emulator; nền tắt đã xác nhận ngừng collector. Background=true/khóa màn hình/điện thoại thật chưa kiểm chứng. |
| Bản đồ native                           | Chưa chạy SDK trên thiết bị. Android cần client Maps key giới hạn package/chứng chỉ; thiếu key hiển thị sơ đồ có nhãn.                  |
| Bàn phím, safe area, font scaling       | Bàn phím/safe area/font mặc định đã thử Android Emulator; font scaling lớn/native màn hình nhỏ chưa thử.                                |
| Realtime thật/offline pause protocol    | Chờ BE; không tái sử dụng websocket admin hoặc tự tạo protocol thật.                                                                    |

Đã introspect config nền riêng: bật cờ background thêm Android BACKGROUND_LOCATION/FOREGROUND_SERVICE/FOREGROUND_SERVICE_LOCATION và iOS location background mode. Mặc định tắt, chỉ xin foreground; manifest tắt Android backup và chặn quyền storage/vibration thừa. Development client có quyền riêng của công cụ dev. Kiểm tra manifest không chứng minh GPS nền hoạt động.

## Dependency audit

`docs/dependency-audit.json` lưu kết quả npm audit: 23 findings (16 high, 7 moderate, 0 critical). Đã nâng Vitest để bỏ cảnh báo critical; các cảnh báo còn lại nằm trong cây dependency Expo/Metro/công cụ native (gồm node-forge, braces, uuid). `npm audit fix` không xử lý hết; đề xuất force làm đổi major Expo nên chưa áp dụng. Cần rà soát bản vá tương thích SDK trước phát hành; chưa xác nhận các findings đều khai thác được trong runtime app.

## Tài liệu nền tảng đã đối chiếu

- [Expo Location SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/location/): quyền, foreground/background và giới hạn development build.
- [Expo TaskManager SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/task-manager/): task định nghĩa ở module scope.
- [React Native Maps trong Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/): phiên bản tương thích và plugin/key native.
- [Expo SQLite SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/): lưu bền vững trên thiết bị.

Không triển khai production, không tạo cloud build và không thay backend để ép khớp FE.
