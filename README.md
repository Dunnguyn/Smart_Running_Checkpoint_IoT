# NEU RUN — Hệ thống ghi nhận sinh viên tham gia giải chạy bộ

Dự án ứng dụng Internet of Things (IoT) trong việc ghi nhận và quản lý thông tin sinh viên tham gia giải chạy bộ tại Đại học Kinh tế Quốc dân. Hệ thống hướng tới kết nối các thiết bị tại checkpoint với nền tảng quản lý tập trung, giúp ban tổ chức theo dõi quá trình tham gia và tổng hợp kết quả chạy.

## Mục tiêu

- Ghi nhận thông tin sinh viên khi đi qua các checkpoint trên tuyến chạy.
- Quản lý giải chạy, người tham gia và các điểm ghi nhận.
- Theo dõi tiến độ, số vòng, quãng đường và thời gian chạy.
- Hiển thị thông tin trên giao diện quản trị với bảng dữ liệu và bản đồ.

## Kiến trúc hệ thống

Luồng dữ liệu dự kiến:

```text
Thiết bị checkpoint → Arduino Gateway → Backend & cơ sở dữ liệu → Web quản trị
```

| Thành phần | Vai trò | Công nghệ |
| --- | --- | --- |
| Web quản trị | Hiển thị tổng quan, quản lý giải chạy, sinh viên và checkpoint | React, Vite, TypeScript, Leaflet |
| Backend | Tiếp nhận dữ liệu, xử lý nghiệp vụ và cung cấp API | Dự kiến Python, FastAPI |
| Cơ sở dữ liệu | Lưu trữ thông tin giải chạy, sinh viên và các lần ghi nhận | Dự kiến Microsoft SQL Server |
| Arduino Gateway | Chuyển tiếp dữ liệu từ Arduino đến backend | Dự kiến Python, pySerial |
| Thiết bị checkpoint | Ghi nhận dữ liệu tại các điểm trên tuyến chạy | Dự kiến Arduino UNO, C/C++ |

## Phạm vi hiện tại

Web quản trị đã có giao diện và dữ liệu mô phỏng, có thể chạy độc lập để trải nghiệm các màn hình quản lý và theo dõi người tham gia.

Backend, gateway và chương trình Arduino hiện có cấu trúc thư mục ban đầu. Luồng kết nối thiết bị và xử lý dữ liệu thực tế thuộc giai đoạn phát triển tiếp theo.

## Cấu trúc dự án

```text
Smart_Running_Checkpoint_IoT/
├── apps/
│   └── admin-web/           # Ứng dụng web quản trị
├── services/
│   ├── backend/             # API và xử lý nghiệp vụ
│   └── arduino-gateway/     # Cầu nối Arduino và backend
├── arduino/
│   └── checkpoint/          # Chương trình thiết bị checkpoint
├── docs/
│   └── requirements/        # Tài liệu yêu cầu hệ thống
└── README.md
```

## Chạy web quản trị

**Yêu cầu:** Node.js 22.12+ hoặc Node.js 24, kèm npm.

Tại thư mục gốc dự án, chạy các lệnh sau trong PowerShell:

```powershell
Set-Location apps/admin-web
npm.cmd ci
npm.cmd run dev
```

Truy cập [http://127.0.0.1:5173](http://127.0.0.1:5173). Nếu cổng đang được sử dụng, dùng địa chỉ được hiển thị trong terminal. Nhấn `Ctrl+C` để dừng ứng dụng.

Ứng dụng mặc định sử dụng dữ liệu mô phỏng, không cần cấu hình `.env` hoặc khởi động các thành phần khác. Các lần chạy tiếp theo chỉ cần `npm.cmd run dev` nếu đã cài thư viện và không thay đổi dependency. Trên macOS/Linux, dùng `npm` thay cho `npm.cmd`.

## Các màn hình đã triển khai

| Màn hình | Đường dẫn | Chức năng |
| --- | --- | --- |
| Tổng quan | `/` | Thông tin giải, các chỉ số, bản đồ và bảng theo dõi sinh viên |
| Bản đồ trực tiếp | `/live` | Tuyến chạy, checkpoint, vị trí người chạy; chọn người chạy, zoom và bật/tắt lớp bản đồ |
| Sinh viên tham gia | `/runners` | Tìm theo tên/mã sinh viên, lọc trạng thái, sắp xếp và phân trang |
| Chi tiết phiên chạy | `/runners/:studentId/runs/:runId` | Thông số chạy, danh sách vòng và lịch sử checkpoint |
| Giải chạy | `/races`, `/races/:raceId` | Danh sách và thông tin chi tiết giải |
| Checkpoint | `/checkpoints`, `/checkpoints/:checkpointId` | Danh sách, thông tin thiết bị và sự kiện ghi nhận gần đây |

Các màn hình trên sử dụng dữ liệu mô phỏng. Nút tạo/sửa giải và checkpoint hiện bị vô hiệu hóa. `/reports` và `/settings` mới có trang thông báo, chưa triển khai chức năng báo cáo hoặc cấu hình.

## Cách dùng mô phỏng

1. Mở trang **Tổng quan**, **Bản đồ trực tiếp** hoặc **Sinh viên tham gia**.
2. Nhấn **Bắt đầu** để cập nhật vị trí và thông số của 8 người chạy trực tuyến mỗi 2 giây. Khi hoàn thành một vòng, lịch sử vòng và sự kiện checkpoint được bổ sung; đạt 5 vòng / 5 km thì người chạy chuyển sang trạng thái hoàn thành và ngừng tăng số liệu.
3. Chọn người chạy trong danh sách theo dõi để xem vị trí trên bản đồ; mở chi tiết phiên chạy để xem thông số và lịch sử.
4. Nhấn **Tạm dừng** để giữ nguyên số liệu hiện tại.
5. Nhấn **Đặt lại** để dừng mô phỏng và khôi phục dữ liệu ban đầu.

Dữ liệu ban đầu gồm 128 sinh viên: 80 đang chạy, 32 hoàn thành, 12 chưa bắt đầu và 4 bỏ cuộc. Những người đang chạy ngoài nhóm 8 người trực tuyến hiển thị **Mất cập nhật** và không tự chuyển sang bỏ cuộc. Điều hướng giữa các màn hình giữ trạng thái mô phỏng; tải lại trình duyệt khởi tạo lại dữ liệu.

Tuyến chạy là tuyến minh họa, cự ly 1 km/vòng là dữ liệu mô phỏng. Bản đồ nền OpenStreetMap cần kết nối Internet; nếu không tải được, tuyến, marker và bảng dữ liệu vẫn hoạt động.

## Vị trí service cần nối backend

Các đường dẫn dưới đây tính từ `apps/admin-web/`:

| File | Vai trò khi tích hợp |
| --- | --- |
| `src/services/interface.ts` | Định nghĩa `RaceService`, interface chung cho truy vấn dữ liệu và đăng ký cập nhật trực tiếp |
| `src/services/apiAdapter.ts` | Triển khai HTTP và WebSocket theo `RaceService`; hiện là khung hàm, trả lỗi `NOT_IMPLEMENTED` và chưa gọi backend |
| `src/services/index.ts` | Chọn adapter bằng `VITE_DATA_MODE`; mặc định là `mock` |
| `src/services/mockAdapter.ts` | Tham chiếu cách truy vấn, lọc, phân trang và đăng ký cập nhật trong chế độ mô phỏng |
| `src/types/domain.ts` | Các DTO hiện dùng cho giải, sinh viên, phiên chạy, vòng, checkpoint và sự kiện |
| `src/app/LiveProvider.tsx` | Nạp snapshot và đăng ký cập nhật dùng chung; cần thay điều khiển simulator khi nối dữ liệu thực, đồng thời bỏ mã giải cố định `neu-2026` |
| `.env.example` | Các biến cấu hình `VITE_DATA_MODE`, `VITE_API_BASE_URL`, `VITE_WS_BASE_URL`; hai URL chưa được adapter sử dụng |

Các endpoint đang được ghi chú trong API adapter là đề xuất tích hợp, chưa phải contract đã xác nhận với backend:

| Hàm service | Endpoint dự kiến |
| --- | --- |
| `listRaces` | `GET /api/v1/races` |
| `getRaceOverview` | `GET /api/v1/races/{race_id}/overview` |
| `listRunners` | `GET /api/v1/races/{race_id}/runners` |
| `getRaceLiveSnapshot` | `GET /api/v1/races/{race_id}/live` |
| `getRunDetail` | `GET /api/v1/runners/{student_id}/runs/{run_id}` |
| `getRunEvents` | `GET /api/v1/runners/{student_id}/runs/{run_id}/events` |
| `subscribeRaceLive` | `WebSocket /ws/v1/races/{race_id}/live` |

Sau khi triển khai adapter, có thể cấu hình `VITE_DATA_MODE=api` và các URL backend trong `.env`, rồi khởi động lại frontend. Đổi cấu hình trước khi triển khai adapter sẽ khiến ứng dụng báo dữ liệu không khả dụng.

## Contract còn thiếu hoặc cần nhóm xác nhận

| Nội dung | Cần thống nhất |
| --- | --- |
| HTTP API | Endpoint chính thức, cấu trúc response/envelope, mã HTTP và định dạng lỗi |
| Danh sách sinh viên | Tên query tìm kiếm/lọc/sắp xếp, chiều sắp xếp, quy tắc phân trang và tổng số bản ghi; mock hiện dùng `items`, `total`, `page`, `page_size` |
| Định danh và DTO | Quan hệ `student_id`, `run_id`, `race_id`; khoa/viện, bib, màu; trường bắt buộc, nullable và enum trạng thái |
| Đơn vị và thời gian | DTO hiện dùng snake_case, mét, giây và ISO UTC; giao diện đổi sang km và giờ Việt Nam, cần xác nhận backend cùng quy ước |
| Tuyến chạy và checkpoint | Endpoint hoặc cấu trúc snapshot chứa tuyến, thứ tự tọa độ, loại/thứ tự checkpoint và định danh thiết bị; chưa có service riêng cho tuyến/checkpoint |
| Vòng và sự kiện thiết bị | Cấu trúc lịch sử vòng, nguồn và trạng thái sự kiện, xử lý sự kiện chưa gắn sinh viên; kiểu `source` hiện chỉ có `SIMULATOR`, cần bổ sung nguồn thực tế |
| Nghiệp vụ kết quả | Quy tắc tính vòng, cự ly, thời gian, hoàn thành và bỏ cuộc; backend cung cấp kết quả chính thức |
| Kết nối người chạy | Ngưỡng chuyển sang mất cập nhật, ý nghĩa `ONLINE`, `STALE`, `UNAVAILABLE` và cách xử lý vị trí/thời gian thiếu |
| Dữ liệu trực tiếp | Snapshot ban đầu, cấu trúc delta/event, thứ tự cập nhật và `event_id` để chống trùng; mock hiện có `runner.updated`, `runner.completed`, `checkpoint.detected` |
| Xác thực và WebSocket | Cơ chế đăng nhập/phân quyền, truyền token, reconnect và đồng bộ lại dữ liệu sau mất kết nối |
| Tạo/sửa và chức năng mở rộng | API, payload, validation cho giải/checkpoint; yêu cầu nghiệp vụ báo cáo và cài đặt |

## Kiểm tra và build

Chạy các lệnh tại `apps/admin-web`:

| Lệnh | Chức năng |
| --- | --- |
| `npm.cmd run typecheck` | Kiểm tra TypeScript |
| `npm.cmd run lint` | Kiểm tra quy tắc mã nguồn |
| `npm.cmd run test` | Kiểm thử dữ liệu và mô phỏng |
| `npm.cmd run build` | Tạo bản production trong `dist/` |
| `npm.cmd run preview` | Xem bản production tại cổng 5174 |
| `npm.cmd run test:ui` | Kiểm tra giao diện bằng Microsoft Edge |

Để chạy kiểm tra giao diện, build ứng dụng và giữ `npm.cmd run preview` hoạt động, sau đó chạy `npm.cmd run test:ui` trong terminal khác. Ảnh chụp và báo cáo được lưu tại `apps/admin-web/test-results/`.
