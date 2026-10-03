

## Điểm nối trong mã nguồn (số dòng)

| Phần cần liên kết | Tệp và dòng | Dùng để làm gì |
|---|---|---|
| FE: CORS và schemas REST | [`app/main.py`](../app/main.py:310), [`app/main.py`](../app/main.py:197), [`app/main.py`](../app/main.py:242) | CORS, hợp đồng payload và các endpoint cấu hình giải, runners, overview, snapshot live. |
| FE: WebSocket | [`app/main.py`](../app/main.py:640) | Client kết nối live và nhận `runner.updated`, `checkpoint.passed` hoặc `runner.completed`. |
| Gán GPS/step wearable cho runner | [`app/main.py`](../app/main.py:395) | Admin gọi `POST /api/v1/runner-devices`; thiết bị GPS và bước chân cùng một ID. |
| Simulator: tạo run | [`app/main.py`](../app/main.py:429) | `POST /api/v1/runs`, `wearable_device_id` phải thuộc student của run. |
| Simulator: GPS/steps và geofence | [`app/main.py`](../app/main.py:449) | `POST /api/v1/telemetry/gps`; xác thực wearable, phát hiện checkpoint và tự ghi lap. |
| Chạy mô phỏng không cần thiết bị | [`app/simulator.py`](../app/simulator.py:49), [`app/simulator.py`](../app/simulator.py:77), [`app/simulator.py`](../app/simulator.py:103) | Tạo wearable, tuyến GPS đi vào checkpoint và bước chân tổng hợp; chạy `python -m app.simulator`. |
| Phát hiện runner qua GPS | [`app/main.py`](../app/main.py:481) | Phát hiện outside-to-inside geofence và tự lưu `LapEvent` nếu đạt khoảng thời gian tối thiểu. |
| Gateway: HTTP auth | [`app/main.py`](../app/main.py:332) | API key riêng cho Gateway Arduino. |
| Gateway: nhận Arduino event | [`app/main.py`](../app/main.py:525) | `POST /api/v1/checkpoint-events`; chỉ chấp nhận `student_id=null` ở cấu hình hiện tại. |
| Arduino Gateway: event schema và an toàn định danh | [`app/main.py`](../app/main.py:257), [`app/main.py`](../app/main.py:527) | Arduino/Gateway chỉ gửi passage không danh tính; GPS wearable là luồng xác định runner. |
| SQL Server / SQLite cấu hình | [`.env.example`](../.env.example:2), [`app/main.py`](../app/main.py:23) | Điểm kết nối DB; `DATABASE_URL` phải khớp driver/instance trong máy bạn. |

Số dòng là theo bản giao dự án này; nếu tự thêm hoặc xóa code thì số dòng sẽ thay đổi.
