# NEU RUN — Backend

Backend cung cấp dịch vụ dữ liệu và xử lý nghiệp vụ cho nền tảng quản lý giải chạy NEU RUN. Hệ thống tiếp nhận dữ liệu ứng dụng và thiết bị, ghi nhận tiến độ và đồng bộ kết quả tới các giao diện theo dõi.

## Chức năng

- Quản lý giải chạy, người tham gia, số báo danh, tuyến chạy và trạm kiểm soát.
- Quản lý thiết bị và phiên chạy.
- Tiếp nhận dữ liệu GPS, bước chân và sự kiện tại trạm.
- Kiểm tra dữ liệu, hạn chế ghi nhận trùng và tính quãng đường.
- Ghi nhận vòng hợp lệ theo điều kiện của giải.
- Cung cấp dữ liệu tổng quan, lịch sử, thống kê và cập nhật trực tiếp.
- Hỗ trợ xác thực và các thao tác dành cho ứng dụng sinh viên.
- Điều phối các kịch bản mô phỏng và demo phần cứng.

## Cơ chế ghi nhận

| Chế độ | Nguyên tắc |
| --- | --- |
| GPS | Phát hiện lượt qua dựa trên vị trí và vùng checkpoint |
| GPS kết hợp Arduino | Đối chiếu lượt qua từ GPS với tín hiệu cảm biến theo điều kiện thời gian |

Các trường hợp có nhiều ứng viên được chuyển sang trạng thái cần xác nhận. Việc khớp tín hiệu cảm biến với GPS không tự chứng minh danh tính người đi qua trạm.

Backend quyết định số vòng hợp lệ, trạng thái phiên và thời điểm chốt kết quả.

## Demo và mô phỏng

- Mô phỏng giải chạy: sinh dữ liệu thử nghiệm cho các luồng theo dõi và ghi nhận.
- Demo kit C04: sử dụng cảm biến thật để xác nhận lượt qua, kết hợp GPS và bước chân mô phỏng.
- Mô phỏng hoạt động tích lũy: minh họa tiến độ theo nhiều ngày.

Demo C04 yêu cầu hai vòng, mỗi vòng tối thiểu 60 giây. Lượt qua đầu mở phiên; hai lượt hợp lệ tiếp theo lần lượt chốt vòng thứ nhất và vòng thứ hai. Tuyến mô phỏng dài khoảng 400–450 m mỗi vòng.

Các chế độ demo có cơ chế điều phối riêng; cần phân biệt nguồn dữ liệu khi đánh giá kết quả.

## Công nghệ

Python, FastAPI, SQLAlchemy và Pydantic. SQLite là cơ sở dữ liệu mặc định; hệ thống có cấu hình kết nối SQL Server. Giao tiếp gồm REST API, WebSocket và Serial cho demo kit.

## Cấu hình

Thiết lập cơ sở dữ liệu, thông tin xác thực, nguồn truy cập được phép và kết nối thiết bị bằng biến môi trường. Sử dụng thông tin xác thực riêng cho từng vai trò và môi trường.

Tài liệu API được sinh từ ứng dụng để tra cứu mô hình dữ liệu, yêu cầu xác thực và các thao tác được hỗ trợ.

## Phạm vi vận hành

Dữ liệu nghiệp vụ được lưu trong cơ sở dữ liệu. Một số tác vụ điều phối demo và kết nối trực tiếp được quản lý trong bộ nhớ tiến trình; việc khởi động lại dịch vụ có thể làm mất trạng thái điều phối đang hoạt động.

Triển khai vận hành cần đánh giá cơ chế migration, sao lưu, giám sát, phân quyền và quản lý trạng thái khi mở rộng nhiều tiến trình.

## Bảo vệ dữ liệu

Không công bố khóa truy cập, mật khẩu, chuỗi kết nối riêng, bản sao cơ sở dữ liệu hoặc nhật ký chứa thông tin cá nhân. Dữ liệu minh họa phải được tổng hợp hoặc ẩn danh trước khi chia sẻ.
