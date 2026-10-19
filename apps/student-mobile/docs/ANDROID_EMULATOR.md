# Kiểm tra Android native — 17/10/2026

> Cập nhật: đợt mới bật GPS nền và tạo APK release nội bộ. Xem [NATIVE_FOLLOWUP.md](NATIVE_FOLLOWUP.md) cho kết quả, bằng chứng và hash hiện tại. Cấu hình background=false/APK debug bên dưới mô tả lượt kiểm thử ban đầu.

Lệnh mới đã chạy: `./scripts/build-demo.ps1`, `adb install -r test-results/demo/neu-run-demo-x86_64.apk`, `adb shell am start -W -n vn.edu.neu.run.student/.MainActivity`. Đã dừng Metro student-mobile, xóa reverse 8087 và thử đăng nhập/mở lại trên release. Khi hệ điều hành Emulator bị ANR sau thời gian chờ, đã đóng AVD bằng console rồi mở `emulator -avd Medium_Phone_API_37.0 -no-snapshot-load`, không wipe dữ liệu.

GPS repeatable: `node scripts/android-completion-route.mjs` sau start/resume qua UI. Lượt thực tế bị ngắt console ở giữa; `node scripts/android-recovery-route.mjs` tiếp tục 2 vòng bằng OS fixes, chụp mốc Home/lock và kiểm tra mock xác nhận. Kiểm tra bằng chứng riêng bằng `node scripts/verify-background-evidence.mjs` và `node scripts/verify-demo-evidence.mjs`. Script đọc SQLite chỉ dùng cho development build debuggable; không dùng `run-as` để kết luận storage release bị lỗi.

## Môi trường đã xác minh

- SDK: `C:\Users\Admin\AppData\Local\Android\Sdk`.
- ADB: 1.0.41 / platform-tools 37.0.1-15733141.
- Emulator: 37.2.12.0, AVD `Medium_Phone_API_37.0`, serial `emulator-5554`.
- Android 17 / API 37, Google Play x86_64, 1080×2400, density 420.
- JDK dùng build: Microsoft OpenJDK 21.0.8 tại `C:\Program Files\Android\openjdk\jdk-21.0.8`.
- Android Studio có JBR 25.0.3; Java trong PATH hệ thống không được dùng để suy đoán JDK build.
- Gradle wrapper của project: 9.3.1. Build Tools có sẵn: 36.0.0. Ban đầu chỉ có platform 37.0, chưa có NDK/cmdline-tools.
- Gradle đã tải thành công NDK 27.1.12297006, Android platform 36 và Build Tools 35.0.0 theo dependency. App compile/target SDK 36, min SDK 24; Emulator chạy API 37.

## Cấu hình kiểm thử

`.env.local` (bỏ qua bởi Git) đặt backend `mock`, GPS `device`, background `false`. `DemoGps` không được chọn trong lượt native này. Vị trí được đưa vào Android Emulator bằng `adb emu geo fix`; app đọc qua Expo Location của Android.

```powershell
cd E:\Hocccc\Project\Smart_Running_Checkpoint_IoT\apps\student-mobile
$env:ANDROID_HOME = 'C:/Users/Admin/AppData/Local/Android/Sdk'
$env:JAVA_HOME = 'C:/Program Files/Android/openjdk/jdk-21.0.8'
$env:PATH = "$env:JAVA_HOME/bin;$env:ANDROID_HOME/platform-tools;$env:ANDROID_HOME/emulator;$env:PATH"
adb devices -l
emulator -list-avds
$env:EXPO_PUBLIC_SERVICE_MODE = 'mock'
$env:EXPO_PUBLIC_GPS_MODE = 'device'
$env:EXPO_PUBLIC_BACKGROUND_GPS = 'false'
npm run android -- --no-install --no-bundler --device Medium_Phone_API_37.0
# Terminal Metro riêng, cùng thư mục:
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'
npm start -- --port 8087 --localhost --clear
# Terminal ADB riêng khi Metro đã sẵn sàng:
adb -s emulator-5554 reverse tcp:8087 tcp:8087
adb -s emulator-5554 shell am start -a android.intent.action.VIEW -d 'exp+neu-run-student://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8087' vn.edu.neu.run.student
```

Expo phiên bản này nhận `--device` bằng tên AVD; truyền `emulator-5554` đã trả lỗi không tìm thấy tên thiết bị. ADB vẫn dùng serial `emulator-5554`. Ban đầu thiết bị offline trong lúc boot, sau đó `sys.boot_completed=1` và trạng thái `device`.

Metro ban đầu chỉ bind IPv6 `::1` gây lỗi kết nối qua ADB reverse. Đặt `NODE_OPTIONS` như trên để bind `127.0.0.1` đã giải quyết; app tải bundle native 964 modules và mở được. Lệnh build `--no-bundler` có thể tự mở URL cổng 8081; dùng deep link 8087 ở trên nếu cần.

Build thực tế: **BUILD SUCCESSFUL in 20m 19s**, 384 tasks (332 executed, 52 from cache), cài thành công lên Emulator. APK development: `E:\Hocccc\Project\Smart_Running_Checkpoint_IoT\apps\student-mobile\android\app\build\outputs\apk\debug\app-debug.apk`, 74.978.369 byte. SHA-256: `D43606C22D6D178E11165CF2C9C7557F5757FB2D7BC62669F3805A70998D20A4`. Chi tiết máy đọc được: `../test-results/android/build.json`. Đây là APK debug cần Metro, không phải bản release độc lập.

## GPS từ Emulator

Điểm bắt đầu của fixture NEU:

```powershell
adb -s emulator-5554 emu geo fix 105.842583 21.000389
node scripts/android-route.mjs 33 4000 0
```

Thứ tự `geo fix` là **kinh độ, vĩ độ**. Script phát 33 bước, mỗi bước cách 4 giây; hai tham số cuối là khoảng thời gian và bước bắt đầu. Chỉ chạy được với serial Emulator. Nó gửi lệnh GNSS vào Emulator, không gọi service GPS giả của app. Fixture chỉ là tuyến kiểm thử, chưa phải khảo sát tuyến chính thức.

Nếu muốn thao tác Extended Controls: mở dấu `…` cạnh Emulator → Location → Single points, nhập latitude `21.000389`, longitude `105.842583`, chọn Set location. Trong Routes có thể chọn/phát tuyến hoặc nhập GPX/KML phù hợp. Việc bấm phát tuyến phải được xác nhận bằng mẫu thực nhận trong app/SQLite; không chỉ nhìn marker của Extended Controls.

Chụp bằng ADB:

```powershell
node scripts/android-capture.mjs login
```

Ảnh PNG và UI hierarchy nằm tại `test-results/android/`. Không phải screenshot web. Script mặc định nhắm `emulator-5554`; đặt `ANDROID_SERIAL` nếu AVD dùng serial khác.

## Kết quả trực tiếp trên Android

| Luồng                         | Kết quả và bằng chứng trong `test-results/android/`                                                                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Đăng nhập, bàn phím           | Mở app native, đăng nhập mock; bàn phím không che đường truy cập nút gửi. `native-login`, `native-keyboard`. Sai mật khẩu hiện lỗi, có thể sửa và gửi lại.                                                                                                                 |
| Đăng ký                       | Xác nhận, nhận bib `NR-0265`, cập nhật enrollment. `native-registration-confirm`, `native-registration-success`, `registered-state.json`.                                                                                                                                  |
| Quyền/GPS check-in            | Android dialog đã từ chối rồi cấp Precise/While using; app hiển thị lỗi quyền. Lượt đầu chờ bật Google Location Accuracy bị timeout, thử lại nhận vị trí. Check-in thành công không tạo phiên chạy. `native-permission-denied`, `native-checkin`, `checked-in-state.json`. |
| Start và tuyến OS             | Sau start, phát 6 bước qua console Emulator: nhận 5 mẫu, đoạn 1, 47,7294 m. `active-state.json`, `native-run-active`.                                                                                                                                                      |
| Pause                         | Phát thêm bước 16–19: vẫn 5 mẫu và 47,7294 m, capture PAUSED. `paused-before/after-state.json`. Nhịp hiện “—”, đồng hồ toàn phiên tiếp tục.                                                                                                                                |
| Force-stop và mở lại          | SecureStore khôi phục đăng nhập, SQLite khôi phục PAUSED; phát thêm vị trí vẫn không tăng mẫu. `restored-paused`, `restored-still-paused` state và `native-restored`.                                                                                                      |
| Resume                        | Mẫu đầu thứ 6 mở đoạn 2, quãng đường vẫn 47,7294 m dù vị trí đã di chuyển xa. Các mẫu sau tăng lên 8 mẫu / 68,8691 m. `resumed-first/moving-state.json`. Không nối qua khoảng nghỉ.                                                                                        |
| Ra nền                        | Với background=false, Home ngừng collector; phát vị trí mới vẫn 8 mẫu. Foreground yêu cầu Lấy lại GPS. `background-stopped-state.json`, `native-foreground`. Đã sửa nhãn header từ “Đang lấy vị trí” thành “GPS đã ngừng” cho trạng thái ERROR/STOPPED.                    |
| Kết thúc sớm                  | Mock xác nhận ENDED, 0/4 vòng, không COMPLETED; GPS STOPPED, queue 0. Toàn phiên 04:57:12, hoạt động 00:03:20; khoảng nghỉ dài gồm thời gian gián đoạn kiểm thử. `finished-state.json`, `native-result`.                                                                   |
| Check-out                     | Lấy vị trí mới, có checkedOutAt; mọi trường kết quả phiên giữ nguyên. `checked-out-state.json`, `native-checkout`.                                                                                                                                                         |
| Lịch sử/thống kê              | Có 3 phiên (2 seed + 1 vừa chạy); tháng 2,62 km/3 giải/1 hoàn thành, tuần 0,92 km/2 giải/0 hoàn thành. Cuộn xem biểu đồ. `native-history`, `native-history-detail`, `native-stats`, `native-stats-week`, `native-stats-scroll`.                                            |
| Hồ sơ/đăng xuất/đổi tài khoản | Bib riêng từng giải; đăng xuất xóa authEntry SecureStore, giữ SQLite. Tài khoản 11223345 có snapshot riêng, lịch sử/thống kê rỗng. `logged-out-state.json`, `account-two-state.json`, `native-account-two-history/stats`.                                                  |
| UI native                     | Back Android từ bản đồ/chi tiết quay đúng màn; safe area có thanh OS thật, Inter và dấu tiếng Việt đọc được; nội dung dài cuộn được, tab/CTA cố định. Chưa thử font scale lớn, landscape, thiết bị nhỏ native.                                                             |

SecureStore kiểm tra entry có ciphertext, không có token mock dạng rõ; không in hoặc lưu raw token vào báo cáo. SQLite kiểm tra file trong sandbox bản debug qua `run-as`, snapshot/hàng đợi có namespace `mock:studentId`. Các bản sao DB chỉ chứa dữ liệu demo, nằm trong `test-results/android/private-*` bỏ qua bởi Git. Không dùng helper này để xuất dữ liệu tài khoản thật.

Kiểm tra lại bằng `node scripts/verify-android-evidence.mjs`: đối chiếu các snapshot đã chụp, ghi `test-results/android/report.json`. Ảnh được chụp trực tiếp với ADB. Với màn hình timer liên tục dùng `--image-only` vì UiAutomator có thể không đạt idle; helper không tái sử dụng cây UI cũ.

## Đối chiếu và giới hạn

`node scripts/compare-android-ui.mjs` tạo `test-results/ANDROID_UI_COMPARISON.html`: 14 cặp ảnh native/Figma. Native 1080×2400/density 420 (khoảng 411×914 dp) khác reference 390×844; kiểm tra bố cục, không khẳng định pixel-perfect. Nút bánh răng nổi là công cụ Expo development client. Banner môi trường và trạng thái backend/GPS là bổ sung nghiệp vụ. Logo, palette, card, nút và font giữ theo source; source Figma không sửa.

**Bản đồ hiện là sơ đồ thay thế có nhãn**, chưa chạy Google Maps SDK do chưa có key. Đặt `ANDROID_MAPS_API_KEY` (client key hạn chế package `vn.edu.neu.run.student` và SHA-1 chứng chỉ ký), bật Maps SDK for Android rồi build lại. Không log/commit key.

**GPS nền đang tắt**; đã kiểm thử việc dừng foreground collector khi ra nền, chưa kiểm chứng background=true, khóa màn hình, tiết kiệm pin hay force-kill khi đang thu. Manifest bản cài chỉ xin coarse/fine location, không có ACCESS_BACKGROUND_LOCATION. Muốn thử nền cần đổi cờ và build lại, sau đó cấp quyền/kiểm tra foreground service riêng.

Lượt này dùng **backend mock + GPS của hệ điều hành Emulator**, không dùng DemoGps. Vị trí vẫn là tuyến tổng hợp do console Emulator cung cấp, không phải đo ngoài thực địa. Các phiên lịch sử seed không được tính là kết quả GPS native vừa đo. Chưa kiểm tra API thật, điện thoại thật, iOS, GPS service tắt, độ chính xác thấp hoặc hoàn thành đủ vòng bằng tuyến OS. Các trường hợp nghiệp vụ khác vẫn chỉ có bằng chứng unit/web của lượt trước.

Tham khảo: [Emulator console và geo fix](https://developer.android.com/studio/run/emulator-console), [tương thích Gradle/JDK](https://docs.gradle.org/current/userguide/compatibility.html).
