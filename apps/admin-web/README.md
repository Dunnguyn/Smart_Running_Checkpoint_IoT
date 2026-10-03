# NEU RUN · Admin Web

Frontend độc lập dùng React 19, Vite 7, TypeScript strict, React Router 7, React Leaflet 5 / Leaflet 1.9 và Lucide. CSS thống nhất, font Be Vietnam Pro hỗ trợ tiếng Việt. Node 22.12+ hoặc Node 24 được khuyến nghị; môi trường triển khai đã dùng Node 24.13 và npm 11. Không cần backend, URL API hay đăng nhập để chạy demo.

## Chạy ứng dụng

Mở terminal tại thư mục gốc repository:

```terminal
cd apps/admin-web
npm ci
npm run dev
```

Nếu terminal đã ở `apps/admin-web`, bỏ qua lệnh `Set-Location`. `npm.cmd ci` cài dependency theo `package-lock.json`; chỉ cần cài lại khi dependency thay đổi hoặc chưa có `node_modules`. Những lần chạy sau dùng `npm.cmd run dev`.

Mở [http://127.0.0.1:5173](http://127.0.0.1:5173). Giữ terminal hoạt động; nhấn `Ctrl+C` để dừng. Nếu cổng bận, dùng địa chỉ Vite hiển thị trong terminal. Dùng `npm.cmd` trên Windows để tránh lỗi PowerShell chặn script `npm.ps1`; trên macOS/Linux thay bằng `npm`.

Không cần tạo `.env`; mặc định là `mock`. Không cần backend, Arduino, gateway hoặc URL API. `.env.example` liệt kê các biến chuẩn bị tích hợp. Chỉ khi chủ động đổi `VITE_DATA_MODE` sang giá trị khác mock, adapter chưa triển khai sẽ báo `NOT_IMPLEMENTED`, không gọi mạng và không trả dữ liệu thành công giả.

## Lệnh kiểm tra và xem bản production

Chạy tại `apps/admin-web`:

```terminal
npm run typecheck
npm run lint
npm run test
npm run build
npm run preview
```

`build` tạo thư mục `dist`; `preview` phục vụ bản build tại [http://127.0.0.1:5174](http://127.0.0.1:5174). Khi sửa mã nguồn, dùng `dev` để thấy thay đổi tự động; muốn xem thay đổi qua `preview`, cần build lại.

Kiểm tra trình duyệt tự động: giữ `npm.cmd run preview` hoạt động ở cổng 5174, rồi chạy `npm.cmd run test:ui` trong terminal khác tại `apps/admin-web`. Script hiện dùng Microsoft Edge cài sẵn; sửa `channel` nếu chạy trên môi trường khác. Screenshot và báo cáo được ghi vào `test-results/` (gitignored). Dùng bản build để kiểm tra không có WebSocket ứng dụng; Vite dev có WebSocket HMR phục vụ phát triển.

## Màn hình

- `/`: thông tin giải, 4 KPI, bản đồ và bảng theo dõi 128 sinh viên.
- `/live`: bản đồ lớn, chọn runner, popup, zoom, về toàn tuyến, bật/tắt lớp.
- `/runners`: tìm tên/mã sinh viên (không phân biệt dấu/hoa thường), lọc trạng thái, sắp xếp vòng/quãng đường/thời gian và phân trang.
- `/runners/:studentId/runs/:runId`: trang chi tiết có URL trực tiếp, thông số, vòng và lịch sử checkpoint. Giá trị chưa ghi nhận hiển thị `—`.
- `/races`, `/races/:raceId`: danh sách và chi tiết giải. Giải sắp diễn ra có 0 sinh viên đăng ký, chưa có tuyến/checkpoint.
- `/checkpoints`, `/checkpoints/:checkpointId`: thông tin thiết bị, loại, thứ tự và sự kiện gần nhất. CP-02 có sự kiện chưa xác định sinh viên.
- `/reports`, `/settings`: placeholder có giải thích và đường dẫn trở lại.

Các nút tạo/sửa giải và checkpoint bị vô hiệu hóa, kèm lý do chờ API contract. Header có tìm kiếm, thông báo và hồ sơ mẫu. Desktop dùng sidebar đầy đủ; tablet/mobile thu gọn và bảng cuộn ngang trong vùng riêng.

## Mô phỏng

Trạng thái ban đầu: 128 participant gồm 80 ACTIVE, 32 COMPLETED, 12 PENDING, 4 ABANDONED. Tất cả bản ghi nằm trong fixture; KPI tính từ cùng snapshot, số sự kiện checkpoint tính từ danh sách sự kiện, độc lập với 3 checkpoint trên tuyến.

Nhấn **Bắt đầu** để 8 runner ACTIVE trực tuyến di chuyển mỗi 2 giây; chọn runner trong danh sách để đưa bản đồ đến vị trí. Các ACTIVE còn lại có trạng thái kết nối **Mất cập nhật**, không đổi sang ABANDONED. Có thể chọn vị trí cuối của họ từ bảng. **Tạm dừng** giữ nguyên số liệu. **Đặt lại** dừng và trả về đúng dữ liệu, vị trí, tốc độ, mốc thời gian ban đầu. Mốc demo cố định 03/10/2026, timestamp UTC; UI hiển thị Asia/Ho_Chi_Minh. Refresh trình duyệt cũng khởi tạo lại demo; điều hướng trong ứng dụng giữ state.

`src/mocks/liveSimulator.ts` quản lý một timer cho các subscription; cleanup khi không còn listener, khi pause/reset, kể cả React StrictMode. Khi runner đạt 5 vòng / 5 km, simulator phát `runner.completed` và ngừng tăng số liệu. Vòng mô phỏng phát sự kiện đã gắn đúng student/run, nguồn SIMULATOR. Sự kiện `student_id=null` không tham gia cập nhật vòng của bất kỳ runner nào.

Tuyến là đa giác minh họa nội bộ, không phải đường chạy chính thức. Cự ly 1 km/vòng là số liệu response mô phỏng, không phải phép đo địa lý trên bản đồ. OpenStreetMap có attribution; font Google và tile bản đồ cần Internet. Nếu tile thất bại, cảnh báo hiện trên bản đồ; tuyến, marker, bảng và KPI vẫn hoạt động, font dùng system fallback.

## Tích hợp backend sau

- `src/types/domain.ts`: DTO giữ snake_case, mét, giây, ISO UTC; kiểu trạng thái và các sự kiện live.
- `src/services/interface.ts`: interface dùng chung cho mock/API.
- `src/services/mockAdapter.ts`: truy vấn dữ liệu, tìm kiếm, phân trang và subscription mô phỏng.
- `src/services/apiAdapter.ts`: đầy đủ chữ ký và TODO cho 6 GET `/api/v1/...` cùng WebSocket `/ws/v1/races/{race_id}/live`. Hiện trả lỗi có kiểm soát NOT_IMPLEMENTED, không dùng fetch/Axios/WebSocket.
- `src/app/LiveProvider.tsx`: nguồn state live chung cho toàn bộ màn hình; thay adapter và control mô phỏng tại đây khi tích hợp.
- `src/utils/format.ts`: đổi mét → km, giây → HH:mm:ss và UTC → giờ Việt Nam.

Các contract cần nhóm xác nhận: response/envelope API, query tìm kiếm/lọc/sort/phân trang, route và checkpoint (chưa có endpoint được chốt), thông tin khoa/viện và bib/màu, định danh thiết bị, danh sách vòng/sự kiện và trường nguồn/trạng thái, rule thời gian mất cập nhật, đồng bộ snapshot/delta, event ID để chống trùng, auth/reconnect WebSocket, trạng thái lỗi, và API tạo/sửa. Các endpoint được ghi chú theo yêu cầu người dùng, chưa được kiểm chứng bằng tài liệu backend trong repository. Backend sẽ là nguồn chuẩn của kết quả; không dùng thuật toán simulator để tính kết quả chính thức.

## Kiểm tra và giới hạn

Đã chạy thành công ngày 03/10/2026: build production, TypeScript, ESLint, 6 kiểm thử Vitest và kiểm tra UI Edge ở desktop 1440×1080, tablet 820×1180, mobile 390×844. Không có lỗi JavaScript hoặc request backend/WebSocket trên bản production. Bản đồ nền OpenStreetMap không tải được trong môi trường kiểm tra; đã kiểm tra cảnh báo và dữ liệu/marker vẫn hoạt động. Chưa xác minh giao diện tile tải thành công trong môi trường này.

Vitest kiểm tra 128 participant, tìm kiếm/lọc/phân trang, runner hoàn thành ngừng cập nhật, reset tái lập, sự kiện không gắn sinh viên, một timer/cleanup và API adapter không gọi mạng. Script UI kiểm tra các luồng chính, popup/lớp bản đồ, mô phỏng, trạng thái không tìm thấy, URL chi tiết, responsive và fallback khi tile thất bại. Xem `test-results/ui-report.json` sau khi chạy để xác nhận kết quả thực tế.

Ảnh mockup và tài liệu backend bổ sung chưa có trong attachment/repository; thiết kế bám mô tả trong yêu cầu. Chưa thể đối chiếu pixel với ảnh tham chiếu. Không thay đổi backend, gateway, Arduino hay xây Runner App.
