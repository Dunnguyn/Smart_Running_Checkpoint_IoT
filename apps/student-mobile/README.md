# NEU RUN — App sinh viên

Ứng dụng **React Native + Expo SDK 57**, triển khai theo source Figma `Enhance NEU RUN UI UX`. Đây là app sinh viên riêng; không sửa backend hoặc web admin. React Native Web chỉ dùng để kiểm tra giao diện trên máy dev, không thay thế bản native.

## Cài đặt và chạy

Đã kiểm thử bằng Node.js 24.13 và npm. App dùng `package-lock.json`, theo package manager của workspace chính.

```powershell
cd E:\Hocccc\Project\Smart_Running_Checkpoint_IoT\apps\student-mobile
npm ci
Copy-Item .env.example .env
npm run web
```

Mở URL Expo in ra, mặc định `http://localhost:8083`. Tài khoản **chỉ dùng trong mock**:

| Mã sinh viên | Mật khẩu      | Dữ liệu                            |
| ------------ | ------------- | ---------------------------------- |
| `11223344`   | `NeuRun@demo` | Minh Anh, có lịch sử minh họa      |
| `11223345`   | `NeuRun@demo` | Hoàng Nam, chưa có lịch sử/đăng ký |

Trong Hồ sơ → Công cụ demo có lỗi mạng, dữ liệu rỗng, start thất bại, phản hồi không rõ kết quả, hết phiên; GPS demo có từ chối quyền, ngoài vùng, độ chính xác thấp, timeout. `normal`/`none` khôi phục điều kiện bình thường. Đặt lại dữ liệu demo chỉ tác động tài khoản hiện tại, có xác nhận trước khi xóa dữ liệu demo/hàng đợi.

## Chạy trên Android/iOS

Android: cài Android Studio, Android SDK và cấu hình SDK/ADB, bật USB debugging hoặc mở emulator. Chạy:

```powershell
npm run android
npm start
```

`expo run:android` tạo và cài development build. `npm start` phục vụ bundle cho development client đã cài. Trên iOS cần máy macOS, Xcode và `npm run ios`. Thư mục native sinh ra bởi Expo không commit; cấu hình gốc nằm ở `app.config.ts`.

Đã biên dịch, cài và chạy **Android development APK** trên `Medium_Phone_API_37.0` (Android 17/API 37) ngày 17/10/2026. APK ở `android/app/build/outputs/apk/debug/app-debug.apk`; bản development cần Metro để tải JavaScript. Chưa tạo IPA, chưa chạy EAS/cloud build hoặc triển khai production.

Xem [lệnh build/chạy đã xác minh và kiểm thử GPS Emulator](docs/ANDROID_EMULATOR.md). Máy hiện tại dùng JDK 21.0.8, Metro cổng 8087 với `NODE_OPTIONS=--dns-result-order=ipv4first` và `adb reverse tcp:8087 tcp:8087`. Cần truyền tên AVD cho tùy chọn Expo `--device`, không truyền serial ADB.

### APK demo nội bộ không cần Metro

Đã build APK release nhúng JavaScript/assets: `test-results/demo/neu-run-demo-x86_64.apk`. Bản này dành Android Emulator x86_64, dùng backend mock + GPS Android + background=true, ký bằng debug key local hiện có. Không phải bản phát hành production hay APK ARM đã kiểm thử trên điện thoại. Xem [bằng chứng GPS 4/4 vòng, hash APK và nghiệm thu độc lập](docs/NATIVE_FOLLOWUP.md).

```powershell
$env:JAVA_HOME='C:/Program Files/Android/openjdk/jdk-21.0.8'
./scripts/build-demo.ps1
& "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" -s emulator-5554 install -r ./test-results/demo/neu-run-demo-x86_64.apk
& "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" -s emulator-5554 shell am start -n vn.edu.neu.run.student/.MainActivity
```

Script tái sử dụng native project đã sinh với quyền background. Nếu chưa có native project, đặt background=true trước `npx expo prebuild --platform android`, rồi kiểm tra cấu hình/key trước build. Không dùng `--clean` để giải quyết một lỗi nhỏ. Maps vẫn cần client key riêng; xem [MAPS_SETUP.md](docs/MAPS_SETUP.md).

## Chế độ dịch vụ và GPS

Hai cấu hình độc lập; thay `.env` rồi khởi động lại Metro (`npx expo start --clear`). Với thay đổi quyền native/background/map, phải build lại app.

Lượt Android bổ sung có `.env.local` đặt `mock` + `device` + background `true`; file này ưu tiên hơn `.env` và được bỏ qua bởi Git. Nếu chạy lại bộ UI web với GPS demo, đổi cấu hình cục bộ tương ứng trước khi xuất bundle; không nhầm dữ liệu kiểm thử hai nguồn GPS. Xem [báo cáo GPS nền và APK demo](docs/NATIVE_FOLLOWUP.md).

| Mục đích                                     | SERVICE_MODE | GPS_MODE |
| -------------------------------------------- | ------------ | -------- |
| Demo toàn bộ                                 | `mock`       | `demo`   |
| Kiểm tra GPS điện thoại với backend mô phỏng | `mock`       | `device` |
| Tích hợp backend thật khi có contract        | `api`        | `device` |
| Tổ hợp bị chặn                               | `api`        | `demo`   |

Biến đầy đủ: `EXPO_PUBLIC_SERVICE_MODE`, `EXPO_PUBLIC_GPS_MODE`, `EXPO_PUBLIC_API_BASE_URL`. Chế độ `api` đã nối API sinh viên của backend `a5665f4`, không dùng khóa admin/wearable và không tự chuyển sang mock. Xem [hướng dẫn tích hợp và các giới hạn còn chờ backend](docs/API_INTEGRATION.md).

Backend trên điện thoại không phải `localhost` của máy dev. Khi endpoint sinh viên được triển khai, cấu hình base URL HTTPS mà điện thoại truy cập được (IP LAN/hostname của máy BE), bind BE đúng interface và cấu hình firewall/CORS theo môi trường. Android emulator có địa chỉ host riêng như `10.0.2.2`; điện thoại thật dùng địa chỉ mạng của máy BE. Không nhúng khóa máy chủ vào biến `EXPO_PUBLIC_*`.

Token native lưu bằng SecureStore. Snapshot/hàng đợi lưu trong SQLite theo `mode + studentId`. Web preview lưu dữ liệu mock trong localStorage và phiên mock trong sessionStorage; không lưu token thật tại đó.

## Kiểm tra GPS

1. Đặt backend `mock`, GPS `device`, cài development build trên điện thoại.
2. Đăng nhập, chọn NEU Campus Run, đăng ký, đọc giải thích rồi check-in. App lấy một vị trí mới; mock service quyết định trong/ngoài vùng.
3. Fixture dùng vùng demo quanh điểm NEU trong `fixtures.ts`, bán kính 80 m, độ chính xác tối đa 50 m. **Đây chỉ là chính sách mock**, không phải ngưỡng chính thức. Nếu bạn ở ngoài NEU, check-in thật phải thất bại; không có tọa độ mặc định để vượt qua bước này.
4. Bấm Bắt đầu, kiểm tra trạng thái thu GPS riêng với trạng thái phiên. Pause phải ngừng lấy mẫu ngay; thời gian toàn phiên vẫn chạy. Resume mở đoạn mới, không cộng khoảng cách qua khoảng nghỉ.
5. Mất mạng: xem mẫu/thao tác chờ. Có mạng: gửi batch 100, chỉ loại mẫu có ACK tương ứng; mẫu bị từ chối được ghi riêng. Hàng đợi giới hạn 3.000 mẫu, tự ngừng thu khi đầy/không ghi được bộ nhớ.
6. Đổi tab không dừng phiên. Khôi phục phiên paused không tự bật GPS. Phiên active được mở lại ở giao diện yêu cầu Lấy lại GPS để bắt đầu đoạn mới.

Mặc định `EXPO_PUBLIC_BACKGROUND_GPS=false`: khi ra nền, app ngừng collector và yêu cầu lấy lại GPS khi quay lại; không giả vờ vẫn ghi được khi khóa màn hình. Muốn thử native background: đặt `true`, **build lại**, cấp foreground rồi background location khi bắt đầu; Android dùng foreground service có thông báo, iOS có background location mode. Mock GPS chỉ chạy khi foreground, dù bật cờ background. Force-kill, tiết kiệm pin, rút quyền, mất GPS và khóa màn hình phải được thử trên thiết bị. Đồng hồ vẫn chạy không chứng minh GPS nền đang chạy.

## Bản đồ

Native dùng `react-native-maps` phiên bản do Expo SDK 57 chọn. iOS mặc định Apple Maps. Android cần Maps SDK client key giới hạn đúng package `vn.edu.neu.run.student` và chứng chỉ ký; đặt `ANDROID_MAPS_API_KEY` rồi build lại. Không dùng server key. Khi chưa có key, Android hiển thị sơ đồ tuyến với thông báo thiếu cấu hình; web preview luôn là sơ đồ có nhãn. Tuyến, trạm, vùng điểm danh và GPS từng đoạn lấy từ model, không phải ảnh chụp màn hình.

## Kiểm tra và cấu trúc

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:ui
node scripts/build-reference.cjs
node scripts/capture-reference.mjs
node scripts/compare-ui.mjs
```

`build` xuất JavaScript/Hermes bundles cho Android/iOS/web; **không phải build APK/IPA**. UI test dùng Edge headless, tự mở/đóng HTTP server loopback 8085; reference dùng 8086. `build-reference` đọc đường dẫn Figma trong script, sửa bốn dấu phân cách kiểu bị thiếu trong bản sao tạm, giữ nguyên bản gốc. Ảnh nằm trong `test-results/`, được bỏ qua bởi Git.

| Thư mục          | Nội dung                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| `src/components` | Tokens, logo/icon gốc chuyển SVG native, thành phần dùng chung           |
| `src/screens`    | Mười màn hình/luồng, điều hướng theo `state/context.ts` và `App.tsx`     |
| `src/domain`     | Model, thời gian, khoảng cách, thống kê                                  |
| `src/services`   | Interface, backend mock có trạng thái, adapter API đang chờ contract     |
| `src/state`      | Auth/run controller, retry, reconciliation, hàng đợi, trạng thái mạng/UI |
| `src/gps`        | GPS thiết bị, GPS demo riêng, native background task                     |
| `src/storage`    | SQLite, SecureStore, adapter riêng cho preview/test                      |
| `src/map`        | Bản đồ native, sơ đồ preview, tách polyline theo segment                 |
| `tests`          | Kiểm thử nghiệp vụ và lỗi đồng bộ                                        |

Xem [kiểm kê và đối chiếu thiết kế](docs/DESIGN_AUDIT.md), [hợp đồng BE còn thiếu](docs/API_GAPS.md), [báo cáo kiểm thử](docs/TEST_REPORT.md).

Ảnh native và snapshot kiểm chứng nằm trong `test-results/android/`; bộ đối chiếu 14 màn hình là `test-results/ANDROID_UI_COMPARISON.html`. Tạo lại đối chiếu bằng `node scripts/compare-android-ui.mjs`; kiểm tra các bằng chứng đã chụp bằng `node scripts/verify-android-evidence.mjs`. Các script này không thay thế thao tác kiểm thử trực tiếp trên Emulator.
