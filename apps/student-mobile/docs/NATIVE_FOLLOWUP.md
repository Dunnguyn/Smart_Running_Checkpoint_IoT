# Đợt kiểm thử bổ sung Android — 17–18/10/2026

## Thay đổi source

- Task GPS nền kiểm tra gate PAUSED/STOPPED bền vững trong SQLite trước khi nhận batch; dùng cùng ID, sequence, segment và queue với foreground. Task lỗi lưu trữ dừng collector và báo lỗi. Module task vẫn được đăng ký ngoài React lifecycle.
- Khoảng mất fix trên 30 giây hoặc mất độ chính xác mở đoạn mới, không nối quãng đường/track qua khoảng thiếu dữ liệu. 30 giây là chính sách continuity tại thiết bị, không phải ngưỡng xác nhận vòng/kết quả chính thức.
- Giải thích quyền nền trước khi mở cài đặt Android; từ chối không báo đang ghi GPS. Chỉ dùng một nguồn `startLocationUpdatesAsync` khi bật background, không chạy đồng thời `watchPositionAsync`.
- Mock thêm `ack-lost`: nhận/lưu batch rồi làm mất phản hồi một lần; retry giữ ID và không thêm mẫu lần hai. Injection chỉ ở MockService, không có endpoint giả trong API adapter.
- Sửa lỗi phát hiện trên Emulator: artificial latency 450 ms của mock chờ JS timer khi app ở nền khiến ACK bị hoãn. Cấu hình mock + device GPS + background bỏ độ trễ nhân tạo (0 ms), vẫn thực hiện toàn bộ validation/idempotency/vòng; chế độ demo GPS giữ latency. Đây không phải bằng chứng API mạng thật chạy nền.
- Native map phân biệt view ready với tiles loaded, có provider Google Android, legend tuyến quy định/track theo đoạn. Thiếu Maps key vẫn hiện sơ đồ, không coi là nghiệm thu Google Maps.
- Plugin `with-short-cmake.cjs` rút ngắn staging CMake vào `.cxx` trong app để tránh Ninja vượt đường dẫn 260 ký tự trên Windows. Không đổi Expo/RN hoặc key ký.

## Kiểm tra logic

Lint/typecheck đạt; **34/34 unit test** đạt. Sáu test mới bao gồm cold background task, durable pause gate, retry offline, mất ACK, mất GPS và mất accuracy. Đây là test controller/storage/GPS giả lập trong process test, không phải E2E Android.

## Môi trường E2E

AVD `Medium_Phone_API_37.0`, serial `emulator-5554`, Android 17/API 37, x86_64, 1080×2400/density 420. Backend `mock`, GPS `device`, background `true`. Development build mới build/cài thành công trong 3m22s; quyền fine/coarse/background và foreground service location được sinh vào manifest. Tài khoản demo 11223345, bib NR-0265, phiên mới bắt đầu qua UI (không sửa SQLite để ép kết quả).

Các ảnh/snapshot bổ sung dùng tiền tố `bg-` và `complete-` trong `test-results/android`. Dữ liệu tài khoản cũ được giữ riêng. Session ID, sample IDs và timestamp trong báo cáo là dữ liệu demo; không ghi token hay tọa độ nhạy cảm vào log.

## Kịch bản phát tuyến có thể lặp lại

1. Chạy build có background=true và GPS=device. Đăng nhập mock, dùng công cụ reset demo chỉ khi muốn lặp lại trên cùng tài khoản (có xác nhận), đăng ký, check-in với fix mới rồi bấm Bắt đầu.
2. Cấp quyền precise/Always sau khi đọc giải thích. Đặt điểm xuất phát bằng `node scripts/android-route.mjs 1 4000 0`. Đợi giao diện báo đang ghi GPS.
3. Có thể pause, bấm Home và phát điểm 16–19; snapshot trước/sau phải không tăng mẫu/quãng đường. Mở lại paused không tự thu; đưa vị trí về điểm 0, Resume rồi xác nhận đoạn mới và chưa cộng vòng.
4. Chạy `node scripts/android-completion-route.mjs`. Script gửi 129 fix qua `adb emu geo fix`, 32 bước/vòng, khoảng 4 giây/điểm (~2–3 m/s theo fixture), không gọi DemoGps. Vòng đầu foreground, vòng hai Home, vòng ba khóa màn hình bằng KEYCODE_SLEEP, vòng bốn quay lại app.
5. Script chỉ đọc snapshot để kiểm tra kết quả từ mock, không ghi số vòng/COMPLETED. Lưu `completion-timeline.json`, `complete-before/lap-one/home/locked/terminal-state.json`. Nếu không đủ 4 vòng, script báo lỗi để điều tra, không tự gán kết quả.
6. Sau terminal, phát thêm vị trí, refresh/mở lại, check-out bằng fix mới rồi kiểm tra lịch sử/thống kê. Mẫu và thời gian kết thúc phải giữ nguyên.

Quy tắc mock hiện là passage ngoài→trong vùng 20 m quanh điểm đầu; điểm đầu mỗi segment không tính vòng. Tuyến được phát qua cả các điểm kiểm soát nhưng mock chưa xác minh thứ tự toàn tuyến chính thức. Đây không phải nghiệm thu engine backend thật.

## Bằng chứng E2E GPS Android đã thu

Phiên `run-mvc31xzo-2-d6uais27`, tài khoản 11223345, bib NR-0265 đạt **COMPLETED, 4/4 vòng**, **146 mẫu**, **5 đoạn có mẫu (2,3,4,5,6)**, **1.580,6209 m**, queue 0, collector STOPPED. Kết quả đọc từ mock snapshot trong SQLite; không gán vòng/kết quả và không dùng timer cộng vòng.

Lượt phát 4 vòng đầu bị gián đoạn tại bước khoảng 74 do cổng console Emulator 5554 mất kết nối. Dữ liệu đã lưu được bảo toàn; sau khôi phục, mock xác nhận 2 vòng. Chạy tiếp bằng `node scripts/android-recovery-route.mjs` (65 fix OS, 4 giây/bước) xác nhận hai vòng còn lại. Tuyến tiếp tục kéo dài **274,802 giây**. Không mô tả đây là một lần chạy liên tục không gián đoạn.

| Mốc bằng chứng sau sửa latency mock               | Mẫu thiết bị / mock đã nhận | Vòng | Queue |
| ------------------------------------------------- | --------------------------- | ---- | ----- |
| Foreground trước Home (`recovery-fg`)             | 83 / 83                     | 2    | 0     |
| Home **67,601 giây** (`recovery-home`)            | 99 / 99                     | 2    | 0     |
| Khóa màn hình **68,099 giây** (`recovery-locked`) | 115 / 115                   | 3    | 0     |
| Hoàn thành (`recovery-terminal`)                  | 146 / 146                   | 4    | 0     |

`recovery-locked-power.txt` ghi `mWakefulness=Asleep`; `recovery-locked-service.txt` ghi foreground service type location/notification đang hoạt động. Không dùng việc đồng hồ vẫn chạy làm bằng chứng. Các mẫu trong giai đoạn Home/khóa có timestamp mới và ACK mock trong nền sau bản sửa.

Pause trước đó: `bg-paused-before/home/restored` đều sequence 2, segment 2, 11,5776 m, PAUSED dù phát vị trí khi Home và force-stop/mở lại. Resume trong checkpoint mở segment 3, không cộng cầu nối; các điểm đầu trong vùng vẫn 0 vòng. Lần khôi phục sau gián đoạn mở segment 6, vẫn 2 vòng khi nhận điểm đầu.

Thời gian toàn phiên là **05:05:15** (18.315.363 ms), hoạt động theo trạng thái mock là **04:58:06** (17.886.021 ms). Có khoảng chờ/mất kết nối Emulator nhiều giờ khi nghiệp vụ vẫn ACTIVE; đây **không phải bằng chứng thu GPS liên tục 5 giờ**, và nhịp trung bình của phiên gián đoạn không đại diện tốc độ tuyến phát. Các khoảng thiếu fix >30 giây tách đoạn, không cộng khoảng cách qua khoảng trống.

Phát thêm vị trí sau terminal, force-stop/mở lại và check-out bằng fix mới đều giữ nguyên số mẫu, vòng, quãng đường và endedAt. `terminal-services.txt` ghi `startRequested=false`, không còn foreground location notification; binding dịch vụ native còn tồn tại không đồng nghĩa đang thu GPS. Lịch sử/Thống kê hiển thị 1 phiên, 1 giải hoàn thành, 1,58 km. `node scripts/verify-background-evidence.mjs` đạt **9/9 điều kiện trên snapshot**, lưu `background-report.json`; đây không phải 9 lượt E2E hay 9 unit test mới.

## UI và lỗi trên native

| Nội dung                                        | Kết quả / bằng chứng                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tắt dịch vụ vị trí → check-in                   | Đạt: thông báo GPS đang tắt; bật lại và lấy fix mới mới check-in được (`bg-location-disabled`, `bg-checkin-result`)                                                                                |
| Từ chối giải thích quyền nền                    | Đạt: ACTIVE nghiệp vụ nhưng capture ERROR, 0 mẫu; không báo đang thu (`bg-background-denied`)                                                                                                      |
| Cấp Always/precise                              | Đạt qua cài đặt Android, foreground service type location có thông báo                                                                                                                             |
| Pause/Home/force-stop/mở lại                    | Đạt: không thêm mẫu, không tự resume; chi tiết ở bảng snapshot                                                                                                                                     |
| Mất ACK / offline / start lỗi / kết quả chưa rõ | Có unit test controller/service; chưa coi là E2E native các fault này trong đợt bổ sung. Tắt mạng OS không tạo lỗi mock trong bộ nhớ                                                               |
| Màn hình nhỏ, font lớn                          | Đã dùng 720×1280 px/density 320 (360×640 dp), font_scale 1.4. Ảnh `small-stats/history/profile`: tên giải xuống dòng, tab không chồng nhau, nội dung cuộn. Modal logout đóng đúng với Back Android |
| Bàn phím nhỏ/font lớn                           | Đã mở IME hệ thống tại ô mật khẩu (`small-password-keyboard`), ô nhập còn nhìn thấy. Bàn phím có thể che nút dưới; cần cuộn. Chưa coi là kiểm tra đầy đủ mọi IME/chế độ xoay                       |
| Khôi phục cấu hình Emulator                     | Đã reset wm size/density, font_scale 1.0, show_ime_with_hard_keyboard 0 sau thử nghiệm                                                                                                             |

Ảnh mới được gom bằng `node scripts/background-gallery.mjs` vào `test-results/BACKGROUND_DEMO_UI.html`; đối chiếu Figma ở kích thước khác nhau nên không khẳng định pixel-perfect. Không sửa nguồn Figma. Lỗi host/Emulator gồm console ngắt giữa tuyến, ADB server treo và Android system ANR sau thời gian chờ dài; ghi riêng với lỗi ứng dụng. Cold boot AVD ngày 18/10 giữ dữ liệu, không wipe.

## APK demo

Script `scripts/build-demo.ps1` dùng variant release, `export:embed` đóng gói Hermes/JS và assets, backend mock/GPS Android/background=true. Ký bằng debug key local hiện có; không tạo/ghi đè key, không phù hợp phát hành production. Mặc định chỉ ABI x86_64 dành Emulator; dùng `-Architectures 'x86_64,arm64-v8a'` nếu cần build thêm ARM64 (phải kiểm thử riêng trên điện thoại).

```powershell
$env:JAVA_HOME='C:/Program Files/Android/openjdk/jdk-21.0.8'
./scripts/build-demo.ps1
```

Build đầu thất bại ở CMake do đường dẫn Windows >260 ký tự; plugin staging ngắn sửa nguyên nhân. Release build thành công 6m43s; sau sửa latency mock, build incremental cuối **2m56s, 10 task chạy / 641 up-to-date**.

- Artifact: `test-results/demo/neu-run-demo-x86_64.apk`, **33.861.473 byte**, release, ABI **x86_64** (Emulator; không phải APK ARM cho điện thoại).
- SHA-256: `CD005AF28594FF53B2832A56DE2FE4E1C9C553F358B6A6E8E0025EA6B565C186`.
- `apksigner verify --print-certs` đạt; SHA-1 chứng chỉ khớp key debug local hiện có. Package `vn.edu.neu.run.student`, min SDK 24, target/compile 36; không có cờ DEBUGGABLE.
- `assets/index.android.bundle` đã nhúng, 1.647.952 byte. `installed-sha256.txt` xác nhận hash `/data/app/.../base.apk` cài thực tế trùng artifact.
- Đã dừng đúng Metro student-mobile, kiểm tra cổng 8087 không còn listener, xóa reverse; không bật Expo Go/cloud build. ADB server bị treo được khởi động lại; lần cài cuối trả `Success`. Không xóa dữ liệu app/keystore.

```powershell
& "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" -s emulator-5554 install -r ./test-results/demo/neu-run-demo-x86_64.apk
& "$env:LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" -s emulator-5554 shell am start -n vn.edu.neu.run.student/.MainActivity
```

Không cần Metro không đồng nghĩa mọi dịch vụ đều không cần Internet: Maps tiles/BE thật sau này vẫn có yêu cầu mạng riêng. APK này dùng mock, không gọi BE thật.

### Nghiệm thu APK độc lập — 18/10/2026

Đạt trên cùng AVD sau cold boot: mở màn đăng nhập, báo sai mật khẩu mock, đăng nhập đúng tài khoản 11223345, xem giải/chi tiết, lịch sử 4/4 và hồ sơ. Force-stop rồi mở lạnh khôi phục đăng nhập (SecureStore) và dữ liệu đã có (SQLite); không cần Expo Go/Metro. Ảnh `demo-login`, `demo-wrong-password`, `demo-cold-start`, `demo-history`, `demo-profile`, `demo-detail` nằm trong `test-results/android`.

`test-results/demo/acceptance-environment.json` ghi cổng 8087 không có listener và ADB reverse trống. `node scripts/verify-demo-evidence.mjs` đối chiếu hash artifact/cài đặt, cờ release và nội dung UI đã chụp, xuất `acceptance.json`. Đây là kiểm tra bằng chứng của lượt smoke trên release, không được cộng thành unit test hay một lượt GPS E2E khác. Tuyến GPS đầy đủ và kiểm thử nền được thực hiện bằng development build cùng source; **chưa lặp lại toàn tuyến trên release**.

Log buffer riêng PID release cuối: 0 dòng AndroidRuntime:E/ReactNativeJS:E, lệnh exit 0 (`runtime-check.json`). Chỉ phản ánh buffer của PID tại thời điểm chụp; không khẳng định toàn hệ thống chưa từng lỗi. Màn hình trắng ở ảnh khởi động quá sớm đã được chụp lại khi app sẵn sàng; `demo-cold-start` cuối thể hiện tài khoản đã khôi phục.

## Tổng hợp trạng thái bàn giao

| Hạng mục                                                                | Trạng thái                                                                                                  |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Task GPS nền + SQLite, pause gate, segment qua mất fix                  | Đã triển khai; unit và E2E Emulator có bằng chứng                                                           |
| Home / khóa màn hình                                                    | Đạt trong khoảng đo 67,601 s / 68,099 s; không suy rộng thành thử nghiệm dài hạn                            |
| Đủ vòng qua Android GNSS → mock xác nhận → check-out                    | Đạt 4/4, 146 mẫu, 5 đoạn; không ép kết quả                                                                  |
| APK release không Metro                                                 | Build/cài/hash/đăng nhập/mở lại đạt; x86_64, debug signing nội bộ                                           |
| Lint / typecheck / logic                                                | Đạt; 34/34 unit test (tách khỏi 9/9 snapshot assertions)                                                    |
| Native map                                                              | Renderer/config/loading/segments đã chuẩn bị; Maps SDK bị chặn bởi thiếu key, chỉ nghiệm thu sơ đồ thay thế |
| Backend sinh viên / realtime / offline contract thật                    | Bị chặn bởi contract; API adapter fail-closed, không fallback mock                                          |
| Các fault native chưa có bằng chứng, Recent Apps, dài hạn/tiết kiệm pin | Chưa kiểm chứng đầy đủ; xem ma trận ở trên                                                                  |
| API thật / điện thoại thật / iOS                                        | Chưa kiểm thử                                                                                               |

Audit mới vẫn 23 findings (16 high, 7 moderate). Không có bản vá tương thích trong dry-run; không đổi major hoặc `audit fix --force`. Phân loại đường dẫn/phạm vi và lý do hoãn nằm trong `DEPENDENCY_REVIEW.md`. Không diễn giải số cảnh báo còn lại thành đã an toàn để phát hành.

## Giới hạn

Không suy rộng Home/khóa màn hình thành chạy sau force-stop. Android force-stop chặn task; mở lại paused giữ paused. Vuốt khỏi Recent Apps phụ thuộc thiết bị và chưa được thay thế bằng phép thử Home. Chưa kiểm chứng điện thoại thật, iOS, API thật. Maps đang chờ key; xem `MAPS_SETUP.md`. API vẫn fail-closed; xem `API_GAPS.md`. Audit và lý do chưa đổi dependency nằm ở `DEPENDENCY_REVIEW.md`.

Nguồn đã đối chiếu: [Expo Location SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/location/), [TaskManager SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/task-manager/), [local release builds](https://docs.expo.dev/guides/local-app-production/).
