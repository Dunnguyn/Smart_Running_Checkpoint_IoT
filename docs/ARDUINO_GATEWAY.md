# Kết nối bộ kit Arduino với NEU Smart Running Backend

## Sketch hiện tại làm gì

Sketch dùng HC-SR04 (`TRIG=D2`, `ECHO=D3`) để phát hiện vật đi vào dưới 120 cm và chỉ cho phép lượt kế tiếp sau khi khoảng cách vượt 150 cm. Mỗi lần phát hiện, Arduino tăng bộ đếm local và in `LAP: <n>` ở 9600 baud. Nút START/STOP, còi và NeoPixel chỉ điều khiển trạng thái tại bộ kit.

Sketch không có GPS, Wi-Fi hoặc HTTP; nó không gửi danh tính sinh viên. Gateway trên máy tính đọc Serial và chuyển `LAP:` thành `POST /api/v1/checkpoint-events`. Backend dùng `device_id` để tìm checkpoint; danh tính chỉ có thể được ghép với GPS từ wearable của runner. Bộ đếm in trên Arduino là bộ đếm local, còn số vòng chính thức là số do backend xác nhận.

## Cấu hình một lần

1. Chạy backend, mở `/docs`, Authorize bằng Admin key.
2. Chọn race và checkpoint đích cần nhận event từ cảm biến. Dùng một checkpoint vật lý cho mỗi bộ kit; ví dụ `NEU-C04` là vị trí đích/vòng. Đặt checkpoint đó có `kind=LAP` nếu muốn event ở đây được xét cộng vòng. Race phải đặt `checkpoint_mode=GPS_AND_ARDUINO` trước khi tạo run.
3. Gọi `POST /api/v1/checkpoints/{checkpoint_id}/devices`:

   ```json
   {"device_id":"NEU-ARDUINO-C04","name":"HC-SR04 C04 finish gate"}
   ```

4. Cắm Arduino qua USB. Xem COM port trong Device Manager. Đóng Serial Monitor/Serial Plotter; hai chương trình không thể cùng mở một cổng.
5. Trong `services/backend/.env`, cấu hình cùng key cho API: `GATEWAY_API_KEY=...`. Cài dependencies sau khi cập nhật `requirements.txt`:

   ```powershell
   cd servicesackend
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   ```

## Tự kết nối khi backend khởi động (khuyến nghị)

Trong `services/backend/.env`, đặt các giá trị sau (không đưa `.env` lên Git):

```dotenv
ARDUINO_SERIAL_PORT=COM3
ARDUINO_SERIAL_BAUD=9600
ARDUINO_DEVICE_ID=NEU-ARDUINO-C04-COM03
ARDUINO_CHECKPOINT_ID=<CHECKPOINT_UUID_C04>
```

Đăng ký `device_id` với checkpoint một lần bằng API admin. Sau đó chỉ cần chạy backend như bình thường; backend tự mở gateway, chờ nếu chưa cắm kit và thử kết nối lại mỗi 2 giây nếu rút/cắm lại. Không mở Arduino IDE Serial Monitor/Serial Plotter cùng lúc vì mỗi cổng COM chỉ cho một chương trình sử dụng. Khi backend dừng, gateway con cũng dừng theo.

Nếu muốn chạy gateway riêng để debug, tại `services/backend` dùng:

```powershell
python -m app.arduino_gateway --port COM3 --baud 9600 --device-id NEU-ARDUINO-C04-COM03 --checkpoint-id <CHECKPOINT_UUID_C04>
```

Gateway tự chờ và kết nối lại cổng serial. Local mặc định gọi `http://127.0.0.1:8000`; nếu backend ở máy khác, truyền `--base-url http://<IP_MAY_CHAY_BACKEND>:8000` và chạy Uvicorn bind `0.0.0.0` trong mạng tin cậy.

Khi Arduino in `LAP: 1`, Gateway gửi event gần như ngay lập tức với `X-Gateway-Key`, `device_id`, `device_event_id` UUID, `occurred_at` UTC và `student_id: null`. Kiểm tra response 202 và xem event trong Admin API. Nếu có 401, kiểm tra key; 404, kiểm tra device mapping; 422 `DEVICE_CHECKPOINT_MISMATCH`, kiểm tra checkpoint ID.

## Để backend ghi nhận đúng runner/lap

- Phải có run `ACTIVE` và wearable/GPS của runner đã gửi passage tại đúng checkpoint trong cửa sổ thời gian backend cấu hình (mặc định ±3 giây). Nếu chỉ có Arduino mà không có GPS, event sẽ ở trạng thái chưa gán và không thể biết sinh viên nào đi qua.
- Một cảm biến không phân biệt được hai sinh viên đi sát nhau; backend giữ `AMBIGUOUS` khi có nhiều ứng viên và cần Admin xử lý.
- Sketch chỉ đo một vị trí. Muốn thu sự kiện ở bốn checkpoint vật lý cần một thiết bị/gateway mapping cho từng checkpoint; một thiết bị chỉ có thể đại diện vị trí nó đang lắp. Không gửi cả bốn checkpoint như thể đã phát hiện nếu chỉ có một HC-SR04.
- Nút STOP trong sketch hiện chỉ dừng đồng hồ local, không gọi API kết thúc run. Kết thúc backend phải qua luồng API của hệ thống.
- Gateway retry tối đa ba lần với cùng payload/event ID khi lỗi mạng tạm thời; nó tự mở lại COM nếu board bị rút/cắm. Nếu mất kết nối quá lâu, timestamp/sự kiện có thể bị backend đánh dấu late; kiểm tra mạng và giờ máy.

## Chân theo sketch

| Thiết bị | Arduino pin |
|---|---:|
| HC-SR04 TRIG / ECHO | D2 / D3 |
| Buzzer | D5 |
| NeoPixel data | D6 |
| Nút START / STOP | D10 / D11, mỗi nút nối xuống GND (`INPUT_PULLUP`) |

Kiểm tra điện áp và nguồn theo đúng board/LED strip trước khi cấp nguồn; không để chân ECHO 5V nối trực tiếp vào board chỉ chịu logic 3.3V.
