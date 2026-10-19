# Kiểm kê thiết kế và phạm vi

## Workspace trước khi code

- Workspace chính: `Smart_Running_Checkpoint_IoT`; app sẵn có duy nhất là `apps/admin-web` (React/Vite/Leaflet, npm lockfile). Backend Python/FastAPI tại `services/backend`. Không có Expo, React Native, Flutter, Capacitor hay app sinh viên trước lượt triển khai này.
- README gốc và nhiều file admin có thay đổi chưa commit từ trước. Giữ nguyên toàn bộ. Không thay backend, admin hoặc README gốc.
- Reference chính xác: `E:\Hocccc\Project\Enhance NEU RUN UI UX`. Đã đọc `AGENTS.md`, `package.json`, `pnpm-lock.yaml`, `src/App.tsx`, CSS, assets, `.figma` và cấu hình Vite. Thư mục `Admin Dashboard for NEU RUN` là reference quản trị, không dùng để thiết kế app sinh viên.
- Figma export: React 19, React DOM, TypeScript 5.7, Vite 8, Tailwind 4, pnpm; không phải app native và không có dịch vụ GPS. Giao diện/demo state nằm trong App.tsx khoảng 1.880 dòng. Có 4 lỗi thiếu dấu phân cách type member; chỉ sửa bản sao capture tạm.
- Người dùng đã chọn **React Native + Expo** trước khi tạo app mới tại `apps/student-mobile`. Dùng npm theo workspace chính; không sao chép Figma nguyên xi rồi gọi là mobile native.

## Tài sản thiết kế

- Chép nguyên `neu-run-logo.png` và `neu-run-brand.jpg` từ public/assets; hash nguồn ghi trong `reference/manifest.json`.
- SVG icon lấy đúng paths từ App.tsx, chuyển sang react-native-svg tại `src/components/Icon.tsx`; không thay bằng emoji/icon set khác.
- Palette: navy `#081b3a/#0b2f62/#12467f`, đỏ `#c52233`, xanh lá `#16794b`, cam `#c85819`, nền `#f5f7fa`; radius 12/16/24; nút pill cao tối thiểu 54; gutter 18–20; tab bar 4 tab giữ nguyên.
- Source khai báo Inter nhưng không kèm file font hay @font-face; bản Figma browser thực tế dùng fallback hệ thống. App native bundle Inter Regular/Bold qua expo-font, tải nội bộ không phụ thuộc Google Fonts CDN. Đây là khác biệt font rendering giữa reference và native, đã ghi nhận khi đối chiếu.
- Bản sao CSS đầy đủ và hash tại `docs/reference/`; ảnh screen trong `test-results/reference-ui` và `test-results/ui`.

## Màn hình

| Màn hình/luồng   | Triển khai                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Đăng nhập        | Mã sinh viên + mật khẩu, ẩn/hiện, validation, busy, lỗi, khôi phục, hết hạn                                            |
| Giải chạy        | Khám phá/Đã đăng ký, tìm kiếm, filter, tải thêm, dữ liệu rỗng, trạng thái hạn/capacity/cancel                          |
| Chi tiết/đăng ký | Thông tin từng giải, xác nhận, bib theo giải, check-in riêng start, CTA cố định                                        |
| Bản đồ           | Native map adapter, trạm/zone/route, chọn marker, fit/recenter, loading/thiếu key/location; web là sơ đồ được ghi nhãn |
| Phiên chạy       | Active/paused/acquiring/error, full-session clock, tạm tính vs confirmed, pause/resume, xác nhận finish, trạm/laps     |
| Kết quả          | VERIFYING, đạt/chưa đạt, GPS theo đoạn, attendance/check-out không đổi result                                          |
| Thống kê         | 7 ngày/30 ngày/toàn bộ; số giải tham gia/hoàn thành, distance/time/pace, chart theo dữ liệu, empty                     |
| Lịch sử          | Nhiều giải, lọc đạt/chưa đạt, tải thêm, chi tiết từng phiên                                                            |
| Hồ sơ            | Student identity, lớp/khoa, bib theo giải, logout và dữ liệu pending được giữ theo account                             |
| Điều hướng       | Back, Android back handler, bốn tab, banner trở lại phiên unfinished; controller không sống theo screen mount          |

## Điều chỉnh từ prototype do nghiệp vụ

- Thẻ giải mở đúng raceId, không dùng một chi tiết cố định; danh sách đăng ký, history và stats cập nhật cùng snapshot.
- Bỏ bộ đếm/giá trị hardcode, nút tự đặt completed và biểu đồ nhân hệ số tùy tab. Kết quả chỉ từ service; fixture tự dịch lịch theo lúc seed để test được tại thời điểm hiện tại.
- Giữ đầy đủ trạng thái mới; bổ sung banner DEMO/GPS GIẢ, pending sync, lỗi lưu trữ/quyền và xác nhận trước logout/reset. Vì vậy không kỳ vọng pixel-diff bằng 0 so với prototype.
- Không hiển thị bib `01` như định danh cố định trong hồ sơ. Không có QR/camera/BLE/face/payment/leaderboard.
- Bản đồ hình minh họa oval trong Figma được thay bằng route projection/native map từ dữ liệu tọa độ; không ngụ ý hình oval là tuyến thật. Mock route là hình học demo quanh NEU, chưa khảo sát thực địa.
- Khi tạm dừng: nền ấm `#fbf7f2`, notice cam, nhịp hiện tại “—”; timer dựa timestamp vẫn tăng, collector ngừng. Mở lại không tự resume GPS.
- Native dùng SafeAreaView và status bar của OS; không vẽ status bar/home indicator giả.

## Đối chiếu UI

Reference capture 390×844: 15 ảnh từ source Figma, bao gồm auth, các tab, detail/map, registration/check-in, active/paused, finish/pending/under result. App capture thêm các trạng thái rỗng/lỗi và chiều rộng 320, 430. Script không chỉnh reference layout để giả tạo mức khớp.

Đã quan sát trực tiếp ảnh và sửa: khoảng cách tìm kiếm, font/header/run metric, shadow/radius của card, segmented controls, nền paused và notice, CTA cố định detail, card thống kê và trang đăng nhập. Cần tiếp tục kiểm tra font scaling, bàn phím thật, safe area Android/iOS và Maps SDK trên thiết bị; browser không xác nhận những phần đó.
