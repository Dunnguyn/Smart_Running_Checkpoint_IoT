# NEU RUN — Smart Running Checkpoint IoT

NEU RUN là hệ thống hỗ trợ tổ chức và theo dõi giải chạy sinh viên, kết hợp ứng dụng di động, nền tảng quản trị và thiết bị IoT. Hệ thống tập trung dữ liệu đăng ký, phiên chạy, GPS, bước chân và sự kiện tại trạm kiểm soát để quản lý tiến độ và ghi nhận kết quả.

## Giao diện

### Web quản trị

Trang Tổng quan hiển thị tình hình giải chạy, các chỉ số tham gia, bản đồ tuyến chạy và tiến độ của người tham gia.

![Web quản trị — trang Tổng quan giải chạy với dữ liệu minh họa](docs/images/admin-overview.png)

### Ứng dụng sinh viên

<table>
  <tr>
    <td align="center" width="50%"><img src="docs/images/student-login.png" alt="Ứng dụng sinh viên — màn hình đăng nhập" width="280" /></td>
    <td align="center" width="50%"><img src="docs/images/student-race-detail.png" alt="Ứng dụng sinh viên — thông tin giải chạy và đăng ký tham gia" width="280" /></td>
  </tr>
  <tr>
    <td align="center">Đăng nhập</td>
    <td align="center">Chi tiết giải chạy</td>
  </tr>
</table>

Ảnh sử dụng dữ liệu minh họa. Giao diện ứng dụng sinh viên được chụp từ bản xem trước trên web; hình ảnh không đại diện cho kết quả đo GPS hoặc kiểm thử phần cứng thực tế.

## Mục tiêu

- Hỗ trợ ban tổ chức quản lý giải chạy và người tham gia trên một nền tảng thống nhất.
- Cung cấp trải nghiệm đăng ký, điểm danh, theo dõi hoạt động và xem kết quả cho sinh viên.
- Kết hợp dữ liệu vị trí với tín hiệu cảm biến để đối chiếu lượt đi qua trạm kiểm soát.
- Cung cấp các kịch bản mô phỏng và demo phần cứng phục vụ phát triển, kiểm thử và trình diễn.

## Các thành phần

| Thành phần | Vai trò |
| --- | --- |
| Web quản trị | Quản lý giải chạy, sinh viên, tuyến chạy, trạm kiểm soát và kết quả |
| Ứng dụng sinh viên | Đăng ký tham gia, điểm danh, ghi nhận hoạt động và tra cứu lịch sử |
| Backend | Cung cấp API, xử lý nghiệp vụ, lưu trữ dữ liệu và phát cập nhật trực tiếp |
| Bộ mô phỏng | Tạo dữ liệu thử nghiệm cho các kịch bản vận hành |
| Tích hợp IoT | Tiếp nhận tín hiệu thiết bị và hỗ trợ demo với bộ kit Arduino |

## Chức năng chính

### Quản trị giải chạy

- Tạo và quản lý giải chạy, danh sách tham gia và số báo danh.
- Cấu hình tuyến chạy, trạm kiểm soát và điều kiện ghi nhận vòng.
- Theo dõi người chạy, vị trí, quãng đường, bước chân và tiến độ.
- Tra cứu sự kiện tại trạm; xử lý các trường hợp cần xác nhận.
- Xem chi tiết phiên chạy, kết quả và thống kê tổng hợp.

### Trải nghiệm sinh viên

- Xác thực tài khoản và khám phá các giải chạy.
- Đăng ký, điểm danh và quản lý phiên chạy.
- Bắt đầu, tạm dừng, tiếp tục và kết thúc hoạt động.
- Gửi dữ liệu GPS, theo dõi tiến độ và xem lịch sử.
- Tham gia các hoạt động tích lũy quãng đường.

### Xử lý dữ liệu

- Kiểm tra tính hợp lệ của dữ liệu vị trí, thời gian và bước chân.
- Đối chiếu sự kiện GPS với tín hiệu tại trạm kiểm soát.
- Hạn chế ghi nhận trùng và áp dụng điều kiện thời gian tối thiểu giữa các vòng.
- Chốt kết quả theo trạng thái được backend xác nhận.
- Đồng bộ cập nhật qua REST API và WebSocket.

## Kiến trúc tổng quan

Web quản trị và ứng dụng sinh viên giao tiếp với backend để đọc dữ liệu và thực hiện các thao tác nghiệp vụ. Backend tiếp nhận dữ liệu từ ứng dụng, thiết bị hoặc bộ mô phỏng; kiểm tra, lưu trữ và phân phối kết quả tới các giao diện theo dõi.

Backend là nguồn xác nhận trạng thái phiên chạy và số vòng hợp lệ. Giao diện phân biệt dữ liệu mô phỏng với dữ liệu từ thiết bị để thể hiện đúng nguồn thông tin.

## Các chế độ trình diễn

| Chế độ | Đặc điểm |
| --- | --- |
| Mô phỏng giải chạy | Sinh dữ liệu người chạy, GPS, bước chân và sự kiện trạm để thử nghiệm luồng vận hành |
| Demo bộ kit C04 | Cảm biến ghi nhận lượt qua thực tế; GPS và bước chân được mô phỏng |
| Mô phỏng hoạt động tích lũy | Minh họa tiến độ và kết quả tích lũy quãng đường theo nhiều ngày |
| Dữ liệu mẫu trên giao diện | Hỗ trợ xem trước trải nghiệm mà không yêu cầu kết nối thiết bị |

### Demo bộ kit C04

Demo kit sử dụng một trạm xuất phát và về đích, với mục tiêu hoàn thành hai vòng:

1. Lượt qua đầu tiên mở phiên và bắt đầu ghi nhận thời gian.
2. Lượt qua hợp lệ tiếp theo xác nhận hoàn thành vòng thứ nhất.
3. Lượt qua hợp lệ cuối cùng xác nhận vòng thứ hai và chốt kết quả.

Mỗi vòng yêu cầu tối thiểu 60 giây. Tuyến GPS mô phỏng dài khoảng 400–450 m mỗi vòng, với tốc độ khoảng 3,2 m/s. Demo kit có luồng điều khiển riêng với các kịch bản mô phỏng giải chạy.

## Công nghệ

| Lớp hệ thống | Công nghệ |
| --- | --- |
| Web quản trị | React, TypeScript, Vite, React Router, Leaflet |
| Ứng dụng sinh viên | React Native, Expo, TypeScript |
| Vị trí và lưu trữ di động | Expo Location, Task Manager, SQLite, SecureStore |
| Backend | Python, FastAPI, SQLAlchemy, Pydantic |
| Cơ sở dữ liệu | SQLite mặc định; có cấu hình kết nối SQL Server |
| Giao tiếp | REST API, WebSocket, Serial |
| Kiểm tra chất lượng | TypeScript, ESLint, Vitest, Playwright |

## Thiết lập môi trường

Các thành phần được cấu hình độc lập bằng biến môi trường. Quy trình chuẩn bị gồm:

1. Cài đặt môi trường JavaScript và Python cùng các phụ thuộc của từng thành phần.
2. Thiết lập cơ sở dữ liệu, thông tin xác thực và cấu hình kết nối.
3. Khởi động backend trước khi sử dụng các tính năng cần API.
4. Chọn chế độ dữ liệu phù hợp trên giao diện.
5. Chuẩn bị thiết bị và quyền truy cập vị trí khi kiểm thử phần cứng hoặc ứng dụng di động.

Các giá trị cấu hình phụ thuộc môi trường triển khai. Thông tin xác thực phải được cấp riêng và quản lý ngoài mã nguồn.

## Kiểm thử và phạm vi sử dụng

Dự án có kiểm tra kiểu dữ liệu, quy tắc mã nguồn, kiểm thử tự động và các kịch bản kiểm thử giao diện. Kiểm thử bằng dữ liệu giả lập phục vụ xác minh hành vi phần mềm; kiểm thử thiết bị thật cần được thực hiện riêng.

Phiên bản hiện tại phục vụ phát triển, nghiên cứu và trình diễn. Việc triển khai vận hành cần đánh giá thêm về bảo mật, phân quyền, bảo vệ dữ liệu vị trí, độ ổn định GPS, sao lưu và khả năng mở rộng.

## Nguyên tắc dữ liệu

- Chỉ sử dụng dữ liệu tổng hợp hoặc đã được ẩn danh trong nội dung công khai.
- Không đưa thông tin cá nhân, tài khoản, mật khẩu, khóa truy cập hoặc dữ liệu vị trí cá nhân vào tài liệu và dữ liệu thử nghiệm được công bố.
- Không đưa cấu hình riêng, dữ liệu vận hành hoặc nhật ký chứa thông tin nhạy cảm vào kho mã nguồn.
- Phân biệt rõ dữ liệu minh họa, dữ liệu mô phỏng và kết quả đo thực tế.
