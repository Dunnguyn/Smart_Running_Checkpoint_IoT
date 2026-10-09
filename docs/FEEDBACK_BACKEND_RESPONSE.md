# Phản hồi feedback backend

Tài liệu này ghi kết quả đối chiếu các mục BE-01 đến BE-12. Thay đổi được thực hiện trong backend hiện mở tại workspace; chưa tạo commit Git. Phần kiểm tra dùng SQLite tạm và gọi handler trực tiếp, không dùng dữ liệu demo hiện có.

| Mã | Trạng thái | Kết quả và bằng chứng |
|---|---|---|
| BE-01 | Đã xử lý | Simulator dùng `--seed` để tạo lịch pace lặp lại được; lịch có các mức khác nhau, không còn công thức modulo luôn bằng 0. Nguồn: `app/simulator.py`. |
| BE-02 | Đã xử lý | Đã bỏ mức tối thiểu 15 giây riêng của simulator. Race demo nhận cấu hình tối thiểu từ backend (mặc định 30 giây); pace được giới hạn theo chiều dài tuyến và có dự phòng. Kiểm tra trực tiếp GPS-only đủ 4 vòng, kết thúc `COMPLETED` sau 130 giây trên tuyến 425 m. Bốn vòng không thể hoàn thành dưới 120 giây khi giữ 30 giây/vòng; pace mô phỏng nhanh hơn chạy thực tế. |
| BE-03 | Đã xử lý | Chỉ checkpoint `kind=LAP` tăng vòng; simulator đặt C04 là điểm LAP. Kiểm tra GPS_AND_ARDUINO xác nhận mẫu đầu nằm trong vùng không tạo passage, còn lượt ngoài-vào tại C04 chỉ được tính sau Arduino event được ghép. |
| BE-04 | Đã xử lý, kiểm tra rule chính | Một passage/Arduino event được ghép duy nhất thì cộng vòng; hai runner cùng ứng viên trả `AMBIGUOUS` và không cộng vòng. Gửi lặp event không tạo lap trùng. Chưa chạy kiểm thử tải đồng thời hoặc hai event cạnh tranh cùng passage. |
| BE-05 | Đã xử lý | Thay route, sửa checkpoint và tạo run cùng khóa theo race; SQLite lấy write lock bằng cập nhật phiên bản không đổi, SQL Server dùng khóa hàng theo dialect. Polyline, tọa độ neo và config version được commit trong cùng transaction. Kiểm tra route lỗi giữ nguyên tuyến 425 m đã lưu. |
| BE-06 | Đã xử lý | Route yêu cầu 5–500 điểm, đầu-cuối cách nhau không quá 2 m, mỗi checkpoint có đúng một anchor và anchor đi theo thứ tự vòng. Chiều dài cộng cả đoạn đóng về điểm đầu. `GET route` trả cận cấu hình và trạng thái thiếu tuyến/khóa. Chưa chạy riêng từng test biên đúng 400 m, 450 m, 2 m và vượt biên. |
| BE-07 | Đã xử lý theo phạm vi demo | `NEU_DEMO` áp cận 400–450 m; `CUSTOM` không chịu cận demo nếu không khai báo cận riêng. Khóa route sau khi tạo bất kỳ run nào; khóa matching được trả rõ thời điểm/lý do từ lần tạo run đầu. |
| BE-08 | Đã xử lý cho SQLite | Migration thêm route profile/cận chiều dài cho database cũ với profile `CUSTOM`; race cũ không có polyline vẫn đọc được và trả `NOT_CONFIGURED`, không tự dựng route hay đổi dữ liệu lịch sử. Kiểm tra migration SQLite cũ thành công. Chưa xác minh SQL Server thực tế. |
| BE-09 | Đã xử lý phần hợp đồng REST | Thêm `GET /api/v1/races/{race_id}/checkpoint-matching`; route/dashboard trả cấu hình route, trạng thái khóa và lý do; runner trả nguồn telemetry và trạng thái/last-seen wearable. Sau PUT/PATCH route hoặc checkpoint, FE cần refetch route/dashboard vì endpoint cập nhật không phát WebSocket event. WebSocket thật chưa kiểm tra trong sandbox bị giới hạn socket local. |
| BE-10 | Đã xử lý trong simulator | Sau khi lưu route, simulator gọi GET route và phát GPS theo polyline đã lưu; không tiếp tục dùng danh sách tọa độ riêng. Tuyến demo vẫn có các điểm bẻ hình học chưa khảo sát theo lối đi thực tế. Chưa chạy trọn CLI qua HTTP vì sandbox không cho mở socket local. |
| BE-11 | Đã xử lý phần xác thực/đối chiếu | Nguồn GPS lấy từ key xác thực, gửi đồng thời simulator và wearable key bị từ chối; backend kiểm tra wearable ID thuộc đúng run/student. REST trả cùng nguồn `WEARABLE_GPS`/`SIMULATED_GPS` như dữ liệu đã lưu. Kiểm tra key sai nhiều lần, key hợp lệ, khóa kép và wearable thuộc runner khác. Wearable key vẫn là khóa dùng chung theo vai trò, chưa phải khóa mật mã riêng từng thiết bị. |
| BE-12 | Đã xử lý | README và hướng dẫn dùng đường dẫn tương đối; README thêm link `docs/PLANTUML_DIAGRAMS.puml`. `.env`, SQLite và dữ liệu test vẫn nằm ngoài Git theo `.gitignore`. Chưa tạo commit vì thư mục backend workspace này không có `.git`. |

## Các API FE dùng sau thay đổi

- `GET /api/v1/races/{race_id}/route`: polyline, chiều dài, profile, giới hạn chiều dài, `route_status`, `editable`, `locked` và `locked_reason`.
- `GET /api/v1/races/{race_id}/checkpoint-matching`: cấu hình đang lưu, trạng thái khóa và lý do.
- `GET /api/v1/races/{race_id}/dashboard`: thông tin cấu hình hiệu lực, tuyến/checkpoint, trạng thái thiết bị và KPI.
- Sau `PUT /api/v1/races/{race_id}/route` hoặc `PATCH /api/v1/checkpoints/{checkpoint_id}`, gọi lại GET route/dashboard để đồng bộ form và bản đồ.

## Kết quả kiểm tra

- `python -m compileall -q app`: thành công.
- `python -m app.simulator --help`: thành công trên Windows.
- SQLite handler-level: GPS-only hoàn thành 4 vòng và chốt đồng hồ; GPS_AND_ARDUINO hoàn thành 2 vòng sau match; mẫu khởi tạo bên trong không tạo passage; retry không cộng trùng; hai candidate thành `AMBIGUOUS`; lỗi route không làm đổi polyline đã lưu; race cũ migration được.
- HTTP/WebSocket qua Uvicorn và SQL Server chưa được xác minh trong môi trường lần này. Sandbox không cho bind socket local; SQL Server cần máy/ODBC phù hợp.
