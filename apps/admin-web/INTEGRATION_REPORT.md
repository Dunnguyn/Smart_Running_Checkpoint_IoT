# Chu kỳ đồng bộ nền 1 giây — 11/10/2026

Theo yêu cầu, giảm chu kỳ REST nền khi trang đang mở từ 5 giây xuống 1 giây. Tab ẩn vẫn 15 giây; request đang tải không bị chồng thêm. WebSocket tiếp tục cập nhật ngay, không đổi khung nhìn hoặc dữ liệu backend. Test fake timer kiểm tra chưa gọi ở 999 ms và gọi ở 1000 ms, cùng cleanup sau unmount.

---

# Bản đồ tự cập nhật khi có phiên chạy mới — 11/10/2026

Giữ GPS cập nhật tức thời qua WebSocket; bổ sung REST resync nền mỗi 5 giây kể cả socket đang connected nhưng im lặng, 15 giây khi tab ẩn. Trước đây chỉ resync khi có message hoặc mất socket, nên có thể chưa thấy run mới nếu không nhận được sự kiện. Không tự đổi race, không phát request ghi, không fitBounds lại, không ghi đè draft. Không chồng request đang tải; hủy timer refresh đã lên lịch khi sync bắt đầu, giữ reconcile chống REST cũ ghi đè GPS mới và cleanup khi đổi race/logout.

Sửa `src/services/liveService.ts`, bổ sung regression trong `reconcile.test.ts`: socket mở nhưng không có message vẫn tự nhận run mới, dừng subscription thì không còn request/timer. Không chạy simulator hoặc sửa backend để kiểm thử. GPS không phát sinh mẫu mới vẫn hiển thị cũ theo thời điểm thật, không tạo chuyển động giả.

---

# Đồng bộ runtime 8000 và contract ad6786c — 11/10/2026

Mục này là trạng thái mới nhất; thông tin runtime 8001 và quy tắc chặn xóa ACTIVE bên dưới là lịch sử.

## Runtime và đối chiếu

- Source FE/BE đối chiếu: workspace `E:\Hocccc\Project\Smart_Running_Checkpoint_IoT`, nhánh fe, HEAD `ad6786c` (backend upstream `c4b8988`, frontend upstream `f972587`). Workspace sạch trước lượt này. Không checkout/reset/commit/push trong lượt này.
- Runtime 8000: OpenAPI có GET `/api/v1/students`, GET `/api/v1/races/{race_id}/participants` và `SimulationStartIn.runner_start_gap_seconds` nullable, 0–12. Runtime 8001 thiếu cả ba. Không suy ra commit tiến trình chỉ từ health; contract runtime 8000 được đối chiếu với source ad6786c.
- CORS health với Origin `http://localhost:5173` trả Access-Control-Allow-Origin đúng origin. FE `.env.local` đã đổi REST sang `http://localhost:8000/api/v1`, WS `ws://localhost:8000`, mode api. Vite nhận env mới; browser xác nhận socket nghiệp vụ cổng 8000 (không đếm socket HMR Vite 5173).
- URL: `http://localhost:5173/races` và `/runners`. Không dừng/thay thế backend nào; 8000 và 8001 đều giữ nguyên. FE chỉ dùng 8000. Không chạy simulator. `.env.local` bị ignore, không chứa key được thêm vào source.
- Namespace race selection theo API base; chỉ khôi phục ID có trong GET danh sách giải. Simulation ID đã có namespace theo API base. Sửa thêm lỗi phiên mô phỏng mới chưa trả race_id có thể kế thừa race_id của phiên cũ: chỉ giữ ID race khi đúng cùng simulation_id.

## Thay đổi FE

- **Xóa giải:** bỏ chặn ACTIVE; giữ đọc số run để cảnh báo. Thông báo rõ mọi run ACTIVE tại thời điểm xóa bị hủy và dữ liệu thuộc giải bị xóa; hồ sơ sinh viên/wearable toàn hệ thống được giữ. Nhập XÓA, focus mặc định nút Đóng an toàn trong dialog native, chống gửi lặp. Chỉ gửi DELETE, không gọi stop/finish từng tài nguyên. Đọc lại danh sách khi mất response; 401/403/500 không tự chứng minh xóa thành công. Sau xác nhận, dọn đúng cache/socket/selection và thông báo thành công.
- **Mô phỏng:** thêm khoảng cách xuất phát 0–12 giây. Mặc định GPS_ONLY 0, GPS_AND_ARDUINO 8 theo simulator; đổi chế độ chỉ áp default nếu người dùng chưa chỉnh. Giá trị 0 được gửi nguyên. Nhãn thân thiện, tên giải mô phỏng và trạng thái giải tách trạng thái phiên mô phỏng; ID/log nằm trong details. Nút tạo nằm cùng heading, thông tin kết thúc gọn. 404 chỉ báo có thể máy chủ đã khởi động lại, không khẳng định race còn tồn tại. Mở giải vẫn đọc kiểm chứng trước điều hướng. Giữ backoff/cleanup/không tự retry POST chưa rõ kết quả.
- **Sinh viên:** giữ trang `/runners`, thêm lựa chọn Phiên chạy / Đăng ký của giải / Sinh viên toàn hệ thống. GET students tìm trên server với q, limit=20, offset; debounce 300 ms và AbortController, không cho response cũ ghi đè. Không giả tổng số vì API không trả total. Có trang trước/tiếp, loading/error/retry/empty, giữ focus search.
- **Đăng ký:** GET participants riêng từng race; ID liên kết không dùng bib; giữ `01`, phân biệt đăng ký với bằng chứng có run trong snapshot. Nếu không thấy run trong dữ liệu đã tải, không kết luận đang chạy hay chưa từng có run. Form dùng sinh viên thật từ GET students; POST participant chỉ student_id và bib_number nếu nhập. Bib trống bỏ field để backend cấp; BIB_NUMBER_EXISTS hiện gần input, giữ draft. Không tạo run. Sau lưu refetch roster/snapshot; đóng form cũng cho đọc lại để đối chiếu kết quả chưa rõ. Timeout POST không tự gửi lại.
- **UX:** loading ban đầu có skeleton, nền giữ bảng khi refetch; bảng scroll trong vùng, thao tác rõ; spacing/readability, reduced-motion. Giữ editor/route/matching/map; không thay thư viện, không fake GPS/data.

## File thay đổi

`src/app/LiveProvider.tsx` (namespace), `src/app/main.tsx` (trang People), `src/features/races/{DeleteRace,Races,SimulationPanel}.tsx`, `src/services/adminOperations.ts`, mới `src/features/runners/People.tsx`, `src/services/enrollment.ts`, `enrollment.test.ts`, `src/styles.css`; scripts `verify-admin-current.mjs`, `verify-ux-readonly.mjs`, mới `verify-enrollment.mjs`, `verify-people-readonly.mjs`; `.env.local` (ignored), README/API_COVERAGE/report.

## Kiểm thử

- Typecheck/build đạt; 37/37 unit test, 8 file. Bao gồm CUSTOM/null limits, đóng vòng, khóa, reconcile và payload bib. Lint đạt sau loại biến không dùng trong test.
- Fixture browser quản trị: 9 request ghi bị intercept, 0 ghi thật. ACTIVE được xác nhận xóa; nhập XÓA, 409 tương thích backend cũ, lost-response readback, dọn socket/cache; gap default 8 và 0 giữ qua đổi mode; polling dừng terminal/unmount; mất job không tạo mới. Viewport 1366, 1920, 768 không tràn ngang toàn trang.
- Fixture enrollment: 2 POST bị intercept, 0 ghi thật. Bib trùng giữ input; bib trống bỏ field; hiển thị 01; response search/race cũ bị bỏ qua, search giữ focus; 3 viewport.
- Browser đọc thật 8000: GET students/participants/dashboard/live thành công, WS nghiệp vụ chỉ 8000, 0 request ghi nghiệp vụ, 0 page error. POST xác thực Admin là kiểm tra key, không tính là ghi nghiệp vụ; secret chỉ trong bộ nhớ tiến trình kiểm thử.
- Hồi quy đọc thật: overview/reflow, drawer Escape/focus, đúng runner COMPLETED, khóa editor, marker/list/pan, checkpoint tabs, đổi race/reconnect một socket, logout; 0 request ghi nghiệp vụ. 0 WS message nghiệp vụ trong phiên test; chưa chứng minh GPS streaming thật.
- Test cũ giả định bib 01 đã COMPLETED không đúng dữ liệu hiện tại; đã chọn runner theo trạng thái backend, không sửa dữ liệu. Test kết nối mới ban đầu đếm cả HMR; đã chỉ đếm `/ws/v1/`. Đây là sửa test, không báo lỗi backend.
- Build còn cảnh báo JS khoảng 600 kB minified / 185 kB gzip. Không phải lỗi chức năng; chưa tách module bản đồ để tránh mở rộng phạm vi. Không thêm dependency.

## Ảnh và giới hạn

Ảnh **API thật**: `test-results/new-runtime/students-1366.png`, `students-1920.png`, `students-768.png`, `participants.png`; hồi quy `test-results/ux/`.
Ảnh **fixture**: `test-results/current/races-1366.png`, `races-1920.png`, `races-768.png`, `participants-1366.png`, `participants-1920.png`, `participants-768.png`, `delete-confirm.png`. Không chứa Admin key. Test-results bị ignore.

Chưa E2E ghi thật DELETE ACTIVE, tạo/dừng mô phỏng, đăng ký, route/checkpoint/matching/resolve. Không phát hiện lỗi backend có bằng chứng trong luồng đọc lần này. API students không có total nên trang tiếp có thể rỗng khi tổng là bội số 20; không bịa tổng. API job không có danh sách toàn hệ thống và có thể mất sau restart. Giữ giới hạn chưa có ETag chống ghi route giữa nhiều admin.

Xác nhận: chỉ sửa FE/cấu hình/tài liệu FE. `git diff -- services/backend` rỗng. Không sửa backend .env/database/migration, không tạo/xóa dữ liệu lịch sử, không chạy/dừng mô phỏng hay backend, không commit/push.

---

# Tích hợp backend main cba5339 — 11/10/2026

Phần này thay thế thông tin runtime và contract trong các mục lịch sử bên dưới.

## Phiên bản và runtime thực tế

- FE: `E:\Hocccc\Project\Smart_Running_Checkpoint_IoT\apps\admin-web`, nhánh `fe`, HEAD `1891dcc`. Đã fast-forward an toàn từ `2046a2a` tới local `origin/fe`; không pull/fetch, không merge main vào fe, không commit/push. Giữ thay đổi `.gitignore` của người dùng.
- BE: detached `cba5339` tại `C:\Users\Admin\.codex\worktrees\backend-current-main\Smart_Running_Checkpoint_IoT\services\backend`. Worktree sạch. Checkout FE không chứa toàn bộ backend mới nên không chạy backend từ đó.
- Đã dừng các tiến trình backend cũ đã xác minh trước khi chạy bản mới. Backend hiện lắng nghe `127.0.0.1:8001`, PID `53192`; launcher Python PID `52536`. Frontend Vite `http://localhost:5173`, PID `49212`. Không có listener 8000 trong lần kiểm tra cuối.
- Giữ `VITE_DATA_MODE=api`, `VITE_API_BASE_URL=http://localhost:8001/api/v1`, `VITE_WS_BASE_URL=ws://localhost:8001`. Không đổi port frontend/backend.
- Dùng venv và cấu hình local hiện có; SQLite demo `services/backend/running_demo.db` được chỉ định bằng đường dẫn tuyệt đối. Secret truyền trong bộ nhớ môi trường tiến trình, không in hoặc sao chép ra file. Startup schema/worker là tác dụng phụ được cho phép. Không khởi động simulator.
- `/health` trả 200/status ok; OpenAPI runtime xác nhận các API mới. Giữ hai dịch vụ chạy để người dùng sử dụng. Không chạy thêm uvicorn ở workspace FE hoặc cổng 8000 song song.

## API và UX đã nối

1. Route: GET/PUT `/api/v1/races/{race_id}/route`, PATCH `/api/v1/checkpoints/{checkpoint_id}` tiếp tục dùng đúng payload. Đọc `route_profile`, min/max nullable, `route_status`, `editable`, `locked`, `locked_reason`; đối chiếu metadata route/dashboard. CUSTOM không còn bị ép 400–450 m. NEU_DEMO dùng giới hạn API thực trả; chỉ form tạo giải mô tả mặc định backend 400–450 m khi bỏ trống. Giới hạn null khác 0/thiếu field. Chiều dài ước tính cộng đoạn cuối–đầu đúng một lần, vẫn kiểm tra 5–500 điểm, đầu/cuối <=2 m, đủ neo đúng một lần và thứ tự neo theo chu kỳ sequence_no. Không đoán tuyến từ checkpoint.
2. Khóa: ưu tiên flag backend; thiếu/mâu thuẫn thì chặn lưu. Có run, kể cả COMPLETED, vẫn khóa. Đọc lại trước lưu và xử lý khóa/xung đột server. Draft riêng, không bị refetch ghi đè; runner không trở thành đối tượng chỉnh sửa.
3. Matching: GET và PATCH `/api/v1/races/{race_id}/checkpoint-matching`. Form chỉ mở sau GET hợp lệ, hiện cấu hình/khóa/version thật. `min_lap_interval_seconds` chỉ đọc, không gửi PATCH vì schema PATCH không hỗ trợ. Đọc lại trước/sau lưu; giữ draft khi lỗi, yêu cầu tải lại khi version thay đổi. Không dùng giá trị mặc định như dữ liệu đã lưu.
4. Mô phỏng tại `/races`: POST `/api/v1/simulations`, GET `/api/v1/simulations/{simulation_id}`, POST `/api/v1/simulations/{simulation_id}/stop`. Modal nêu rõ 5 sinh viên/4 vòng, mode, seed, interval 0.5–5 giây. Admin chủ động bắt đầu/dừng; không tự ghi khi mở trang. GPS kết hợp Arduino mô phỏng không chứng minh kit thật online. Stop không tự gọi finish run; trạng thái do backend quyết định.
5. Polling job: một chuỗi request, backoff lỗi tối đa 30 giây và dừng sau 5 lỗi; giảm tần suất khi tab ẩn, dừng ở terminal/404/unmount. Lưu ID job/race theo API base trong sessionStorage, không lưu key. Mất response POST không tự retry; 404 sau restart không đồng nghĩa race đã xóa. Mở race là thao tác riêng và kiểm tra race còn tồn tại.
6. DELETE `/api/v1/races/{race_id}` trong “Thao tác khác”. Xác nhận chính xác `XÓA`, hiện tên/ID/phạm vi dữ liệu bị xóa; hồ sơ sinh viên/wearable toàn hệ thống được giữ. Chặn nếu biết còn run ACTIVE; đọc lại trước gửi và xử lý 409. Backend có thể dừng simulator thuộc quyền quản lý trong DELETE; frontend không gọi stop/finish để vượt điều kiện. Mất response phải GET danh sách kiểm chứng trước kết luận/retry. Sau xác nhận xóa, dọn cache, selection, snapshot và socket đúng race, về danh sách.
7. Form tạo giải bổ sung profile và giới hạn min/max tùy chọn đúng schema mới. Không tự tạo checkpoint/run.

REST chống dữ liệu cũ ghi đè realtime và các trạng thái match/lap giữ nguyên. Không có WebSocket job/route/delete mới được phát minh. Đã làm unsubscribe idempotent để đóng socket an toàn cả khi xóa race và effect cleanup.

## Kiểm tra thực tế

- Lint: đạt, không warning. Typecheck: đạt (tsc trong build). Unit: 35/35, 7 file. Build: đạt; cảnh báo bundle JS khoảng 592 kB minified (>500 kB), chưa tách bundle trong phạm vi này.
- Browser editor cô lập: validation/payload/khóa/draft/lỗi, 4 request ghi bị intercept, 0 ghi thật.
- Browser quản trị mới cô lập: tạo job một POST, polling dừng terminal/unmount, stop đọc lại GET, job404 sau restart, matching GET/PATCH lỗi và readback, xóa typed confirmation/409/mất response, dọn socket/cache, chặn run ACTIVE và chặn retry POST chưa rõ kết quả. 8 request ghi bị intercept, 0 ghi thật; không có page error.
- Browser tạo giải cô lập: empty state, validation/422, payload/busy/refetch, mất mạng không retry, Escape/hủy. 3 request ghi bị intercept, 0 ghi thật.
- Backend thật: đọc 8 race; route và dashboard thống nhất metadata. 7 race khóa/chưa có điểm tuyến; 1 race chưa khóa/có 5 điểm. Các race đọc được có CUSTOM và min/max null. GET matching thành công, trạng thái khóa nhất quán. Không chỉnh dữ liệu để làm số liệu khớp nhau.
- Browser chỉ đọc backend thật: đăng nhập, dashboard 4 viewport (1366×768, 1440×900, 1920×1080, tablet), tìm bib/drawer/focus, COMPLETED, bản đồ chọn/pan, checkpoint tabs, đổi race/reconnect một socket/logout; 0 request ghi, 0 page error. WS kết nối/resync được kiểm tra; chưa có message nghiệp vụ trong phiên test (0), không khẳng định đã kiểm chứng GPS streaming thật.
- Ảnh fixture mới: `test-results/current/races-1366.png`, `races-1920.png`, `matching.png`, `delete-confirm.png`. Ảnh backend thật: `test-results/ux/`. Các thư mục test-results bị ignore, không chứa secret; fixture chỉ trong test, không fallback ở ứng dụng.

## Giới hạn và xác nhận

Chưa E2E ghi route/checkpoint/matching, tạo/dừng simulator hoặc DELETE trên dữ liệu thật. Chưa có dữ liệu kiểm thử được cho phép cho các thao tác đó. Không phát hiện lỗi backend được chứng minh qua các lần đọc; lỗi fixture không được ghi thành lỗi backend. Job registry backend nằm trong RAM, không có API danh sách job; giao diện chỉ khôi phục job gần nhất của trình duyệt. Route chưa có ETag/version chống ghi đồng thời; đọc lại giảm rủi ro nhưng không bảo đảm loại bỏ race condition giữa nhiều admin.

Nếu sau này cần nghiệm thu ghi thật: chỉ sau khi người dùng cho phép, tạo một job GPS_ONLY seed 42 interval 0.5, ghi lại race_id/job_id mới; kiểm tra trạng thái, dừng đúng job (run có thể bị hủy, không hoàn thành), xác nhận xóa chỉ race mới đó. Route/matching cần race thử riêng chưa có run. Chưa thực hiện các bước này.

Không chỉnh source/.env/dependency/schema/tài liệu backend thủ công; phần backend trong checkout FE chỉ thay đổi do fast-forward upstream được cho phép. Không xóa/sửa dữ liệu lịch sử, không seed/migration riêng, không simulator, không commit/push/deploy. `git diff -- services/backend` rỗng; worktree backend sạch.

File FE sửa: LiveProvider; LiveMap/MapEditor; Checkpoints; Races/CreateRace/MatchingSettings; mới SimulationPanel/DeleteRace; contract/matchingContract/matchingService/mapEditorService/raceCreation/apiAdapter/liveService và mới adminOperations; styles; unit mapEditorService; script verify-map-editor và mới verify-admin-current; README/API_COVERAGE/report. Thay đổi `.gitignore` của người dùng được giữ nguyên.

---

# Sửa điểm tuyến thiếu tọa độ — 11/10/2026

Editor trước đây cho thêm điểm nhập tay có tọa độ trống rồi tiếp tục thêm điểm khác; điểm trống bị ẩn khỏi bản đồ khiến người dùng khó nhận biết. Nay validation chỉ rõ thứ tự điểm lỗi và thanh lưu có nút Sửa tọa độ điểm N (chọn/focus input). Khi còn điểm không hợp lệ, thao tác thêm điểm đưa về điểm đó; thêm điểm nhập tay tắt công cụ click bản đồ. Không tự xóa điểm, thay GPS hoặc đoán tọa độ. Không báo sai chiều dài/khép vòng khi chưa tính được do thiếu tọa độ. Unit test kiểm tra chỉ số điểm lỗi và không phát sinh lỗi hình học dây chuyền.

---

# Bổ sung phản hồi nút lưu bản đồ — 11/10/2026

Thanh Lưu/Hủy nay hiển thị lý do vô hiệu hóa và số đo tuyến ngay trong vùng nhìn: số điểm, chiều dài ước tính, khoảng cách đầu-cuối; hiển thị lỗi neo/khóa/xung đột/không có thay đổi. Có nút cuộn và focus tới Kiểm tra tuyến. Không nới validation hoặc thay tọa độ draft. Screenshot người dùng không đủ dữ liệu để kết luận ràng buộc cụ thể bị vi phạm; không coi nút disabled là lỗi API lưu.

Browser fixture editor đã đạt, 4 request ghi bị intercept và 0 ghi thật; kiểm tra trực tiếp thông báo radius trên thanh lưu. Giữ nguyên backend và dữ liệu lịch sử.

---

# Bổ sung form tạo giải và kiểm kê API — 10/10/2026

Kiểm tra lại ngày 11/10/2026: lint, typecheck và 32/32 unit test đạt; giữ nguyên giới hạn chưa gửi request tạo giải thật.

Đã thêm form **Tạo giải chạy** tại `/races`, nối POST `/api/v1/races` đúng RaceIn runtime 8001. Có validation, khóa gửi lặp, lỗi theo field, xử lý kết quả chưa xác định khi mất response; tải lại danh sách/header sau thành công. Cho phép tạo giải đầu tiên khi backend chưa có race. Giải mới là DRAFT; không tự tạo checkpoint hoặc phiên chạy.

[Kiểm kê đầy đủ 29 HTTP operation, WebSocket, API chưa nối và giới hạn](API_COVERAGE.md). Thay thế nhận xét lịch sử “chưa có form tạo giải” bên dưới; các form tạo checkpoint/sinh viên/wearable/participant/run vẫn chưa được thêm trong lượt này.

File bổ sung/sửa: `src/features/races/CreateRace.tsx`, `src/features/races/Races.tsx`, `src/services/raceCreation.ts`, `src/services/raceCreation.test.ts`, `src/app/LiveProvider.tsx`, `scripts/verify-race-create.mjs`, `API_COVERAGE.md`, README/report. Giữ nguyên các thay đổi chưa commit khác.

Kiểm tra: lint, typecheck, 32/32 test và build; browser fixture tạo giải đầu tiên/422/mất mạng/hủy/refetch đạt, 0 ghi thật. Không sửa backend hoặc dữ liệu lịch sử. Ảnh fixture ở `test-results/ux/create-race-isolated.png`.

---

# Bàn giao UX/UI và editor bản đồ — 10/10/2026

Phần này là trạng thái hiện hành, thay thế các nhận xét “chưa có editor” trong lịch sử bên dưới. Giữ nguyên thay đổi tích hợp chưa commit có sẵn khi bắt đầu lượt UX/UI.

## Runtime và phạm vi

- FE: http://localhost:5173, workspace `E:\Hocccc\Project\Smart_Running_Checkpoint_IoT\apps\admin-web`.
- Backend: `42e547892e344e53a7dde89ba13597e6d6a47658`, source `C:\Users\Admin\.codex\worktrees\backend-route-integration\Smart_Running_Checkpoint_IoT\services\backend`, listener `127.0.0.1:8001`. Đã đối chiếu command line, health và OpenAPI runtime.
- Giữ cấu hình FE: `VITE_DATA_MODE=api`, `VITE_API_BASE_URL=http://localhost:8001/api/v1`, `VITE_WS_BASE_URL=ws://localhost:8001`.
- Không sửa backend, backend .env, schema, dependency hoặc tài liệu backend. Không seed, simulator, migration riêng, ghi nghiệp vụ thử nghiệm, sửa dữ liệu lịch sử, commit/push/pull/merge. WAL/SHM đã có trong baseline được giữ nguyên; startup/worker backend có tác dụng phụ sẵn có như đã được cho phép.

## Giao diện đã triển khai

- **Chung:** header duy nhất chọn giải, kết nối, cập nhật, làm mới và tài khoản; sidebar thu gọn; logo/trắng-xanh giữ nguyên. Chữ và bảng lớn hơn, nội dung tận dụng chiều ngang, số tabular, focus rõ, nhãn tiếng Việt và mã kỹ thuật trong chi tiết. Không gán nguồn GPS chung cho race hỗn hợp.
- **Tổng quan:** bốn thẻ điều hướng, bản đồ thu gọn, việc cần xử lý, top 5 theo backend, sự kiện gần nhất và thống kê mở rộng.
- **Bản đồ:** tuyến/checkpoint/GPS thật, không dịch vị trí; toàn tuyến/tất cả vị trí, bật tắt lớp, chọn runner hai chiều, follow và dừng khi pan. Nhóm marker trùng điểm có ×N và danh sách chọn, phân biệt bib. Panel tìm tên/mã/bib, lọc trạng thái chạy và độ mới GPS độc lập; không loại runner chưa có GPS khỏi danh sách.
- **Sinh viên:** tìm kiếm gồm bib giữ số 0, phân trang 10/20/50, sắp xếp rõ, cột phụ bật/tắt; chi tiết trong dialog có focus trap/Escape/trả focus; giữ bộ lọc và trang. COMPLETED dùng duration backend.
- **Giải chạy:** bảng gọn, tìm/lọc trạng thái, giải đang chọn rõ, Mở giải chọn và điều hướng; thiếu lịch/địa điểm có thông báo có nghĩa.
- **Checkpoint:** ba tab Cần xác nhận/Nhật ký/Trạm và thiết bị. Badge từ summary; select checkpoint thực, áp dụng/xóa bộ lọc, match/lap tách riêng, UUID trong chi tiết. Đăng ký thiết bị trong modal chọn sẵn checkpoint. Resolve giữ passage_id/version/idempotency/reason, không chọn trước ứng viên, không cập nhật vòng lạc quan.
- **Realtime:** giữ cache theo race và chống REST cũ; cleanup/auth/reconnect/resync. Làm mới có thể kết nối lại socket đã đóng sau khi hết retry. Chỉ thay đổi giao diện không tạo request ghi.

## Editor checkpoint và tuyến

- Mặc định chỉ xem. Một editor tại một thời điểm; draft độc lập; cảnh báo rời trang/đổi race/đóng tab; hủy không ghi. Thanh Lưu/Hủy cố định, luôn nhìn thấy ở bốn viewport đã kiểm tra.
- Checkpoint: kéo marker, nhập tọa độ/bán kính, công cụ chọn điểm rõ ràng; vòng bán kính xem trước. PATCH `/api/v1/checkpoints/{checkpoint_id}` chỉ gửi latitude/longitude/radius_m đã đổi. Tọa độ hữu hạn trong giới hạn; radius_m > 0 theo schema, không áp giới hạn trên tự đặt hoặc thay inner/outer matching.
- Tuyến: GET/PUT `/api/v1/races/{race_id}/route`; kéo/nhập điểm, thêm sau điểm chọn, xóa điểm thường, bảo vệ neo, undo, khôi phục, fit. Điểm đầu/cuối đánh dấu Đ/C; neo có cờ và tên trong popup/select. Tuyến rỗng bắt đầu draft rỗng, cho click/nhập điểm và gán checkpoint thật; không tự nối checkpoint. Giữ thứ tự và checkpoint_id, không gửi sequence_no chỉ đọc.
- Validation khớp source: 5–500 điểm; Haversine bán kính Trái Đất 6371000 m, tổng đoạn liên tiếp, không cộng đoạn khép ngầm; 400–450 m; đầu-cuối <= 2 m; mỗi checkpoint đúng một neo. Số FE ghi “ước tính”; so sánh trước làm tròn. Backend quyết định cuối cùng.
- Khóa khi summary.started_runners > 0 hoặc có run_id. Không dùng ACTIVE=0 để kết luận mở khóa. Đọc lại trước lưu; xử lý ROUTE_LOCKED/CHECKPOINT_LOCKED/409 và giữ draft để sao chép. Sau lưu đọc lại route/dashboard/checkpoint; lỗi giữ draft. Mất response/5xx đọc lại trước khi cho gửi tiếp; có thay đổi server thì chặn ghi đè và cho tải lại/bỏ draft.
- Backend chưa có ETag/version điều kiện cho PUT/PATCH: so fingerprint trước lưu giúp phát hiện thay đổi đã xảy ra, **không bảo đảm chống hai admin ghi đồng thời trong khoảng giữa đọc và ghi**.

## Kiểm tra và bằng chứng

- `npm run lint`, `npm run typecheck`, `npm run test`: đạt, 29/29 test. `npm run build`: đạt; cảnh báo bundle JS >500 kB, không phải lỗi build. `git diff --check`: đạt.
- Browser đọc API thật: đăng nhập, chọn/đổi race, overview/runners, tìm bib 01, dialog và trả focus, COMPLETED, map chọn marker/follow/pan, tab nhật ký/chi tiết/đăng ký thiết bị, reconnect và logout. Không gửi ghi nghiệp vụ. Report: [readonly-report.json](test-results/ux/readonly-report.json).
- Browser editor **fixture cô lập**, chặn toàn bộ API: kéo/chọn/nhập/hủy, radius lỗi, cảnh báo rời/đổi race, PATCH đúng field, PUT giữ neo/thứ tự, undo, 422/409, mất response đọc lại không gửi lặp, server đổi giữ draft, tạo tuyến rỗng bằng bàn phím. 4 request ghi được intercept, 0 request ghi thật. Report: [editor-isolated-report.json](test-results/ux/editor-isolated-report.json).
- Kiểm tra overflow/ảnh ở 1366×768, 1440×900, 1920×1080 và tablet 820×1180, zoom mặc định 100%. Editor có assertion thanh lưu nằm trong viewport. Tiles được cố tình chặn trong script để kiểm tra thiếu nền; ảnh có cảnh báo nền **không phải bằng chứng lỗi nhà cung cấp hoặc backend**.
- WS đã kiểm tra kết nối/đóng/reconnect, không nhận message nghiệp vụ trong cửa sổ quan sát (0 frame nghiệp vụ); không khẳng định đã E2E luồng GPS mới.
- Sáu race thật quan sát đều đã có run và tuyến rỗng. Vì không có race thử nghiệm được phép ghi, chưa E2E lưu route/checkpoint/resolve/register trên backend thật, chưa chụp tuyến có sẵn thật. Hình editor dùng fixture được ghi rõ.

Ảnh: [Tổng quan](test-results/ux/overview-1440.png), [tablet](test-results/ux/overview-820.png), [bản đồ](test-results/ux/live-map.png), [sinh viên](test-results/ux/runner-drawer.png), [nhật ký](test-results/ux/checkpoint-journal.png), [giải chạy](test-results/ux/races.png), [editor checkpoint cô lập](test-results/ux/editor-checkpoint-isolated.png), [editor tuyến cô lập](test-results/ux/editor-route-isolated.png). Ảnh/report nằm trong test-results được gitignore, không chứa key.

## Giới hạn backend và phần chờ

- Keyword runners hiện tìm tên/mã sinh viên, chưa tìm bib. Khi có chuỗi tìm, FE tải đủ các trang theo filter rồi lọc tên/mã/bib và phân trang local; không giả tìm toàn server từ một trang. Đổi lại chi phí request cao hơn với giải lớn.
- Chưa có API danh sách/sửa/xóa thiết bị, trạng thái online đáng tin cậy, flag khóa map rõ ràng hay điều kiện version khi ghi map. Không dựng control hoặc giá trị lưu giả.
- Các đề xuất simulator/ngưỡng vòng/khóa cấu hình/metadata tương lai vẫn chờ BE. Không sửa run legacy ACTIVE hoặc coi MATCHED là COUNTED. Không phát hiện lỗi backend mới từ kiểm thử đọc lượt này; lỗi fixture không được ghi thành lỗi backend.

## File frontend liên quan

- `src/app/{main,LiveProvider}.tsx`, `src/layouts/Shell.tsx`, `src/components/{Modal,ui}.tsx`, `src/utils/labels.ts`, `src/styles.css`.
- `src/features/dashboard/Dashboard.tsx`; `src/features/live-map/{LiveMap,WatchList,MapEditor}.tsx`.
- `src/features/runners/{RunnerTable,RunDetail}.tsx`; `src/features/races/{Races,MatchingSettings}.tsx`.
- `src/features/checkpoints/{Checkpoints,CheckpointJournal,RegisterDevice}.tsx`.
- `src/services/{apiAdapter,matchingContract,liveService,mapEditorService}.ts`, `src/services/mapEditorService.test.ts`.
- `scripts/verify-ux-readonly.mjs`, `scripts/verify-map-editor.mjs`, `package.json`, `README.md`, `INTEGRATION_REPORT.md`.
- Giữ các thay đổi tích hợp có sẵn ở contract/domain/routeAdapter/tests và script đọc backend; không ghi đè để làm sạch Git.

Chạy lại: `npm run test:ui:editor` dùng fixture độc lập; `npm run test:ui:readonly` cần ADMIN_API_KEY trong môi trường tiến trình và hai server local. Script không ghi key ra report/storage. `npm run test:ui` trỏ editor cô lập; script verify-ui cũ là lịch sử, không dùng làm bằng chứng bản UX hiện tại.

---

# Lịch sử tích hợp trước lượt UX/UI

# Tích hợp backend hiện tại — 10/10/2026, Asia/Saigon

**Trạng thái hiện hành:** FE tương thích backend local `42e5478`, hai server đang chạy. Các mục bên dưới đường phân cách là lịch sử; kế hoạch ghi E2E và đề xuất API trong lịch sử **không được thực hiện trong lượt này**.

## 1. Phiên bản và môi trường đang dùng

- Workspace FE: `E:\Hocccc\Project\Smart_Running_Checkpoint_IoT`, nhánh `fe`, HEAD `00dfd59`. Git status đầu lượt sạch. `main` local ở `42e547892e344e53a7dde89ba13597e6d6a47658`, đã gồm PR #7; FE chưa chứa backend mới.
- Backend source: `C:\Users\Admin\.codex\worktrees\backend-route-integration\Smart_Running_Checkpoint_IoT\services\backend`, worktree riêng từ **42e547892e344e53a7dde89ba13597e6d6a47658**. Không merge, pull, copy thư mục backend hay đổi nhánh FE.
- Backend: `http://localhost:8001`, listener IPv4 `127.0.0.1:8001`. Command line đã xác minh trỏ đúng `--app-dir` worktree trên. Sau khi người dùng yêu cầu tiếp tục, hai listener cũ đã dừng; khởi động lại cùng cấu hình và xác minh lúc 15:30 ngày 10/10: backend PID `33152`, FE PID `32816`, FE HTTP 200 và health OK. Không có listener 8000 ở lần xác minh host.
- Dùng Python `.venv` và cwd `.env` hiện có tại workspace gốc `services/backend`. Database đã xác minh là SQLite demo `services/backend/running_demo.db`. Truyền `DATABASE_URL` tuyệt đối trong môi trường tiến trình để backend worktree dùng đúng DB hiện có; không đổi `.env`, không sao chép secret. Python chạy `-B`, không ghi bytecode vào worktree.
- Frontend: **http://localhost:5173/**. Dev server chạy `npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort` tại `apps/admin-web`. Cần IPv4 loopback trong môi trường này: listener `localhost` ban đầu bind `::1`, browser timeout; sau đổi listener, UI truy cập được.
- `.env` FE hiện có đã đúng và được giữ nguyên: `VITE_DATA_MODE=api`, `VITE_API_BASE_URL=http://localhost:8001/api/v1`, `VITE_WS_BASE_URL=ws://localhost:8001`. REST client nối path sau `/api/v1`; WS dựng `/ws/v1/races/{race_id}/live?key=…`, không thêm prefix REST. Admin key chỉ vào bộ nhớ phiên/test; không có key Gateway/Simulator/Wearable trong cấu hình FE.
- Các lệnh trong sandbox không thấy listener host; kiểm tra HTTP/process và browser integration cuối cùng chạy trên host bằng quyền công cụ được duyệt. Không suy phiên bản từ riêng `/health`.

## 2. Contract đã đối chiếu và thay đổi FE

- Đọc README, report lịch sử, source backend mới và OpenAPI runtime. `/health` 200; xác minh GET/PUT `/races/{race_id}/route`, PATCH `/checkpoints/{checkpoint_id}`, các API auth/dashboard/live/runners/history/events/resolve/matching/devices. WS source vẫn phân luồng theo race, dùng Admin key query và các message `runner.updated`, `runner.completed`, `checkpoint.passed`, `checkpoint.match.updated`.
- `routeAdapter.ts`: map `route.points` theo `sequence_no`, giữ `[latitude, longitude]` đúng Leaflet, dùng `distance_m` backend; checkpoint lấy `checkpoint_id/code/name/sequence_no/kind/latitude/longitude/radius_m`. Không dùng bib làm ID, không nối checkpoint thay tuyến, không dịch GPS. Nếu có vertex không hợp lệ thì báo lỗi tuyến, không bỏ vertex rồi nối tắt qua khoảng trống.
- `loadSnapshot` dùng route + checkpoint từ **cùng dashboard response**; không cần gọi GET route thêm ở mỗi resync. Kiểm tra race_id của dashboard/live trước khi nhận. GET route được kiểm tra đọc độc lập và so sánh với dashboard/live trong script kiểm tra backend.
- Bản đồ vẽ polyline khi route có điểm, marker checkpoint/runner theo API; race chưa lưu tuyến có thông báo riêng. Fit một lần khi có tọa độ hoặc khi nhấn “Về toàn tuyến”, không fit lại vì số runner/điểm GPS thay đổi. Đổi race remount map; không giữ khung nhìn của race trước. Không có route thì fit marker hiện có, không dựng polyline thay thế. Tile lỗi chỉ báo nền bản đồ, marker/số liệu vẫn hoạt động.
- Trang checkpoint thêm bảng metadata thật, tọa độ/bán kính/kind; link nhật ký/đăng ký dùng checkpoint UUID và lọc nhật ký theo ID trong URL. URL checkpoint không thuộc race đang xem không mở form đăng ký nhầm race.
- Dashboard và trang race bỏ thông báo cũ “backend chưa có geometry/checkpoint”, dùng số checkpoint thật, route thật/trạng thái thiếu tuyến. Hiển thị `min_lap_interval_seconds` hiện backend đã trả, chỉ đọc, không tự gán mặc định.
- Không có editor route/checkpoint hoạt động trước lượt này; ưu tiên map đọc theo yêu cầu. **Chưa thêm form PUT route/PATCH checkpoint**, chưa gửi hai API này. Contract ghi hiện tại vẫn là 5–500 điểm, 400–450 m, đầu/cuối tối đa 2 m, một anchor cho mỗi checkpoint, không lặp anchor ở điểm đóng vòng; backend quyết định hợp lệ/khóa (`ROUTE_LOCKED`, `CHECKPOINT_LOCKED`). Không áp dụng đề xuất nới giới hạn.
- Giữ các luồng Admin key, runners/history, matching, đăng ký Gateway, resolve passage_id + expected_version + idempotency key hiện có. Không tự chọn AMBIGUOUS, không tự hoàn tất run legacy ACTIVE đạt target; giữ COMPLETED duration backend. Không thay cơ chế buffer/reconcile chống REST cũ, hủy request/socket và backoff/resync.

## 3. Kiểm thử và dữ liệu thực tế

- Lint, typecheck, build đạt. Vitest **25/25** đạt, gồm 2 test geometry mới: thứ tự lat/lon + sequence, ID, tuyến rỗng, tọa độ không hợp lệ không bị nối tắt; các test reconcile/realtime/matching cũ vẫn đạt.
- Script `verify-backend-readonly.mjs`: health/OpenAPI, sai key 401/key đúng 200, đọc **5 race** hiện có; dashboard/live/runners/event detail/run detail/history và WS handshake đạt. GET route đồng nhất dashboard/live trong lần đọc. **Cả 5 race đều route.points=[]**, mỗi race có 1 checkpoint. Không tạo route/seed/simulator để lấp dữ liệu.
- Browser Edge + backend thật (`integration-local-readonly.mjs`): đăng nhập sai/đúng, chọn race, bib `01`/UUID run, dashboard/runner, checkpoint marker + runner marker, empty route (không có polyline), fitBounds, chi tiết/history, COMPLETED duration trước/sau refresh giữ nguyên, MATCHED và COUNTED riêng, form matching khóa chưa biết, đổi race/GPS cũ, reconnect socket thật, reload phải nhập key lại, logout đóng socket đạt. Chặn mọi request ghi nghiệp vụ ngoài POST auth; `writes=[]`, `errors=[]`.
- Browser fault injection chỉ dùng lỗi 500/401 để kiểm tra hiển thị và phục hồi, không thay response thành dữ liệu nghiệp vụ giả. Tile được **chủ động chặn** trong test để kiểm tra marker/cảnh báo; không coi đó là bằng chứng nhà cung cấp tile đang lỗi. Chưa kiểm tra khả năng tải tile ngoài ở mạng hiện tại.
- Artifacts local (gitignored): `test-results/local-readonly-report.json`, `test-results/local-readonly-ui.png`. Browser đã mở tổng 8 socket qua nhiều phiên/đổi race/reconnect, một socket race ở trạng thái ổn định. Reload kiểm tra socket ở document mới vì Playwright có thể không phát close event cho handle thuộc document đã hủy.
- **0 message WS nghiệp vụ thực tế** trong đợt kiểm tra. Handshake/reconnect/resync được xác minh, producer-to-UI khi có dữ liệu mới chưa E2E. Polyline có điểm mới được kiểm tra mapping frontend, chưa E2E trên API vì dữ liệu thật chưa có tuyến. Không kiểm thử ghi resolve/config/device hoặc route/checkpoint; không kiểm thử Arduino vật lý. Không kiểm thử empty race list bằng cách tạo/xóa hoặc thay dữ liệu API.

## 4. Phần chờ backend / giới hạn còn lại

- Runtime chưa có GET matching config/flag khóa, chưa trả các bán kính/window/grace trên dashboard; form hiện rõ chưa biết và chỉ xác nhận khóa khi backend trả lỗi đúng code. `min_lap_interval_seconds` đã có, không còn coi field này thiếu.
- Metadata checkpoint và route **đã có**, không còn chờ hai dữ liệu này. Danh sách mapping thiết bị, heartbeat/provenance/hardware online vẫn chưa có endpoint đọc; không suy Arduino thật online từ event Gateway. Nguồn GPS/event hiển thị theo backend.
- Đề xuất simulator speed, quy tắc ngưỡng vòng, khóa cấu hình và metadata bổ sung trong feedback chưa triển khai. Backend đã có cấu hình speed ở server và min interval đọc được; FE không cung cấp control giả cho cấu hình chưa có API quản trị.
- Dữ liệu legacy ACTIVE đạt số vòng mục tiêu vẫn giữ nguyên. Chưa xác minh sửa chữa lịch sử hoặc producer mới; không coi hiện trạng legacy là lỗi mới của bản backend này.

## 5. Ranh giới thực hiện

Không sửa code, dependency, schema source, `.env` hoặc tài liệu backend; không commit/push/deploy/pull/stash/reset. Backend source diff ở workspace gốc rỗng; worktree backend giữ đúng commit. Không gửi thao tác ghi nghiệp vụ, không chỉnh sửa dữ liệu lịch sử, không migration riêng/seed/simulator. **Startup được người dùng cho phép có tác dụng phụ schema/worker/SQLite WAL**: workspace có `running_demo.db-wal` và `running_demo.db-shm` do backend đang chạy; không xóa, không khẳng định DB byte-for-byte bất biến. Giữ server và worktree để sử dụng local.

---

# Điều tra và kế hoạch E2E để duyệt — 07/10/2026, Asia/Saigon

**Trạng thái mới nhất:** backend do người dùng chuyển sang **localhost:8001**. FE `.env` đã đổi cả REST và WS sang 8001. Không sửa backend hoặc dữ liệu nghiệp vụ. Các kết luận/cổng và cách suy luận khóa trong các bản ghi lịch sử bên dưới không còn là trạng thái hiện tại.

## 1. Run ACTIVE đạt 2/2 — bằng chứng, giả thuyết và độ chắc chắn

API thật được gọi lại ở cổng 8001, header `X-Admin-Key: [REDACTED]`, không body:

- GET `/api/v1/races/c2a09d3e-5b4f-4c28-9baf-d06fe1a91296/dashboard`: **200**, race LIVE, GPS_ONLY, total_laps=2; participants=1, started=1, active=1, completed=0, laps_recorded=2, runners_at_lap_target=1.
- GET `/api/v1/runners/0c0b2cc1-590f-4b97-a9a6-a9baaabbfc8c/runs/6fc37ec3-293b-434f-917c-c1d30567a8a6`: **200**, ACTIVE, is_done=false, lap_count=2, total_laps=2, ended_at=null, source=SIMULATOR, last_lap_duration_s=32. duration_total_s=265760 tại một lần đọc; đây là thời gian đang tính, không phải thời gian đã chốt.
- GET cùng run `/events?page_size=200`: **200**, total=11; 9 GPS và 2 LAP, đủ trong một trang. LAP1 id `14496bff-5482-46c5-8c75-d9969b4c75ba`, occurred_at=2026-10-04T09:00:35 UTC, duration_s=31; LAP2 id `cdf690ac-c343-45c1-9145-bdd87cdd3c45`, occurred_at=2026-10-04T09:01:07 UTC, duration_s=32. Đây là vòng đã được backend ghi nhận, không suy từ GPS ở FE; không chứng minh cảm biến/người thật.

Các timestamp SQLite không ghi timezone trong JSON; source `aware()` coi là UTC. Quy đổi +07:00:

| Mốc | Giờ Việt Nam 04/10/2026 |
|---|---|
| Run started_at 09:00:03.584690 UTC | 16:00:03.584690 |
| LAP1 | 16:00:35 |
| LAP2 | 16:01:07 |
| last_seen_at 09:01:26.232343 UTC | 16:01:26.232343 |
| Commit `0968baa` thêm Arduino matching/dashboard/tự hoàn thành | 22:27:00 |

Đối chiếu Git/source:

- Commit trước `ec92a62` (04/10 00:49:04 +07): GPS_ONLY tăng lap_count và ghi LapEvent nhưng **không có maybe_complete_run**; chuyển COMPLETED chỉ có ở endpoint finish thủ công (source cũ khoảng dòng571).
- Source hiện tại app/main.py:484–514: `record_lap` kiểm tra ACTIVE, thời điểm sau anchor, khoảng cách thời gian tối thiểu, chưa vượt mục tiêu; ghi vòng rồi gọi `maybe_complete_run`, chốt ended_at/duration và `maybe_complete_race` nếu mọi participant hoàn tất.
- GPS_ONLY: telemetry crossing ngoài→trong gọi record_lap (881), commit rồi phát runner.updated/checkpoint.passed/runner.completed khi hoàn thành.
- GPS_AND_ARDUINO: GPS chỉ tạo passage (896–925). Worker ghép hoặc resolve CONFIRM gọi `finish_match` (586–618) → record_lap → tự hoàn thành. DISMISS không gọi record_lap.
- Đọc dashboard/live/history không sửa run. Startup worker chỉ xử lý DeviceEvent PENDING_MATCH đến hạn; không quét để chốt run GPS_ONLY cũ đủ vòng. `record_lap` hiện tại cũng trả sớm khi lap_count đã đạt target trước khi gọi maybe_complete_run, nên không nên thử gửi thêm telemetry để “sửa” bản ghi.

**Kết luận chắc chắn:** dữ liệu hiện tại không thỏa invariant nghiệp vụ mới (ACTIVE ở target); FE đang phản ánh đúng API, không phải lỗi tính vòng của FE.

**Giả thuyết mạnh:** run được tạo bởi logic trước khi thêm tự hoàn thành rồi tồn lại. Hai vòng xảy ra trước commit mới hơn 6 giờ và source cũ giải thích chính xác trạng thái này. **Chưa thể chứng minh tuyệt đối** vì thời điểm commit không chứng minh thời điểm deploy, dữ liệu mô phỏng có thể mang timestamp đặt trước, không có audit revision tạo run hay log tiến trình lúc đó. Không kết luận đường ghi hiện tại hỏng khi chưa tái hiện với race mới.

Chuyển BE: xác minh lịch sử deploy/DB và xác định chính sách xử lý legacy run; đề xuất audit version và cơ chế reconciliation được duyệt riêng. Không tự POST finish, không sửa DB, không dùng run này làm E2E.

## 2. Realtime — contract và điều kiện phát

| Producer trong app/main.py | Điều kiện sau commit | Message / payload | FE |
|---|---|---|---|
| telemetry 934–938 | GPS hợp lệ mới | runner.updated (full run + latitude/longitude); checkpoint.passed nếu crossing; runner.completed khi hoàn thành | Nhận cả latitude/longitude và last_latitude/longitude; cập nhật run đúng race/student/run |
| Gateway event 982 | Sự kiện mới được chấp nhận | checkpoint.match.updated, DTO event/version | Invalidate + merge version, không tự tăng lap |
| Matching worker 1284–1297 | PENDING_MATCH đến hạn được xử lý | checkpoint.match.updated; nếu COUNTED thì runner.updated; nếu completed thì runner.completed | Refresh snapshot/dashboard, xử lý full status |
| Resolve 1058–1060 | CONFIRM/DISMISS thành công | checkpoint.match.updated; nếu COUNTED thì runner.updated đầy đủ, **không phát riêng runner.completed ở đây** | Không lỗi contract: handler runner.updated cũng đọc data.status=COMPLETED và duration; không phụ thuộc riêng message completed |
| Lap API 1083–1085 | Lap hợp lệ mới | runner.updated, thêm runner.completed khi chốt | Chấp nhận full run |
| Finish 1097 | ACTIVE được finish thủ công | runner.completed dạng tối giản {student_id,run_id,duration_total_s}, không race_id ở envelope | Socket gắn race; match student/run trong race hiện tại, rồi resync |

- `EventHub.clients` theo race_id; publish chỉ gửi clients của race đó. Không global broadcast. FE kiểm tra envelope race_id và data.race_id khi có; run match theo ba ID; cleanup race cũ, resync sau open/reconnect.
- `checkpoint.passed` GPS_ONLY có ASSIGNED/lap_updated, FE chỉ invalidate; GPS_AND_ARDUINO có GPS_PASSAGE_PENDING_ARDUINO/passage_id/lap_updated=false, FE ghi thông báo bằng chứng GPS chưa tính vòng.
- GET/read và WS connect không phát dữ liệu; server WS chỉ receive_text, không tự phát heartbeat/update; duplicate request có nhánh return sớm. Không có dữ liệu mới thì không có message là bình thường.
- Đã đọc handlers FE và producer backend: **không phát hiện ánh xạ sai cần sửa** trong các message hiện có. Thiếu message runner.completed riêng ở resolve không gây bỏ sót trạng thái vì runner.updated đầy đủ.
- Kiểm thử chỉ đọc ở 8001: handshake/reconnect/đổi race/logout đạt; **0 message nghiệp vụ thực tế**. Không tạo message giả, không gọi producer. Chưa thể khẳng định delivery/end-to-end của producer cho tới kế hoạch ghi bên dưới.
- Giới hạn cần BE xem xét: không sequence chung hoặc durable replay; hub chỉ trong một process. Snapshot resync giúp hội tụ nhưng không bảo đảm nguyên tử mọi panel.

## 3. API cần bổ sung — ĐỀ XUẤT, chưa tồn tại

Đã kiểm tra inventory routes source và OpenAPI; các lần GET runtime trước ở cùng source trả 405 cho matching-config/checkpoints/devices và 404 cho checkpoint detail. Dữ liệu GET dashboard/overview/live/runners/history/checkpoint-events/device-events không thay thế các trường thiếu.

| Nhu cầu FE | Endpoint hiện có đã đối chiếu | Hợp đồng đề xuất cho BE (chưa triển khai) |
|---|---|---|
| Giá trị cấu hình thực và trạng thái khóa | GET dashboard chỉ mode/config_version; PATCH checkpoint-matching trả config nhưng không được dùng PATCH để đọc | **GET /api/v1/races/{race_id}/checkpoint-matching** → {race_id,checkpoint_mode,inner_radius_m,outer_radius_m,match_window_seconds,late_grace_seconds,max_sample_gap_seconds,max_event_age_seconds,max_future_skew_seconds,config_version,matching_locked:boolean,matching_locked_at:ISO8601|null,lock_reason:string|null,server_time}. Số đo m/giây, khóa do server tính bằng cùng quy tắc PATCH; unknown/null không bị coi là unlocked |
| Metadata checkpoint để chọn ID/vẽ đúng vị trí | POST tạo; event trả checkpoint_id; history có GPS runner, không geometry checkpoint | **GET /api/v1/races/{race_id}/checkpoints** → {items:[{checkpoint_id,race_id,code,name,kind,sequence_no,latitude:number|null,longitude:number|null,radius_m:number}],next_cursor:string|null}; tùy chọn GET /checkpoints/{id}. Không bịa tọa độ cho null |
| Danh sách mapping và evidence kết nối thiết bị | POST /checkpoints/{id}/devices trả status đăng ký; GET event chỉ có device_id/source | **GET /api/v1/checkpoints/{id}/devices** → {items:[{device_id,checkpoint_id,name,registration_status,last_event_at:ISO8601|null,last_heartbeat_at:ISO8601|null,connection_status:ONLINE|OFFLINE|UNKNOWN,connection_evidence:string|null,source_kind:SIMULATED|HARDWARE|UNKNOWN}],server_time}. Không có heartbeat thì UNKNOWN; event Gateway không đủ bằng chứng hardware identity |

Đề xuất dùng X-Admin-Key, 401/404 và envelope lỗi thống nhất, timestamp UTC rõ timezone, config_version đơn điệu. Khi BE duyệt schema mới mới thêm DTO/GET phía FE; **không gọi các endpoint đề xuất như thể đã tồn tại**.

FE đã sửa: không còn suy khóa từ started_runners; hiển thị “Chưa có dữ liệu trạng thái khóa: API đọc chưa hỗ trợ trường này”. Chỉ chuyển form sang khóa khi request lưu trong tương lai nhận **409 + code MATCHING_CONFIG_LOCKED**, không coi mọi409 là khóa. Không có thao tác PATCH nào trong lượt này. Mode là dữ liệu backend có thật; số đo chưa biết vẫn —. Thiết bị không gắn nhãn online; metadata thiếu vẫn báo chưa hỗ trợ.

## 4. Ô bản đồ — bằng chứng và phân loại

- Source LiveMap.tsx dùng `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`; không API key, không proxy, không đổi nhà cung cấp.
- Không gửi lại tọa độ runner để chẩn đoán: bộ duyệt tự động chặn việc đó vì có thể xuất vị trí ra ngoài. Chọn **tile công khai toàn thế giới 0/0/0** để kiểm tra mạng, không đọc GPS tạo URL.
- Edge headless gọi trực tiếp `https://a.tile.openstreetmap.org/0/0/0.png`, tương tự b và c: cả ba có **HTTP status=null**, requestfailed=`net::ERR_CONNECTION_REFUSED`. Không có HTTP response nên không gán 403/429/500, không kết luận lỗi key/CORS/rate limit.
- Chắc chắn: kết nối từ môi trường trình duyệt tới tile host bị từ chối trước HTTP. Chưa xác định phía từ chối là mạng local, proxy/firewall hay upstream. URL cấu trúc đúng và lỗi tái hiện độc lập với React/Leaflet, nên ít khả năng do dựng URL FE. Chưa đủ bằng chứng quy lỗi dịch vụ OSM.
- Marker Leaflet, popup, bảng runner dựa trên API độc lập với tile; không ẩn khi tileerror. UI giữ cảnh báo tải nền lỗi. Kiểm thử UI lại với **tile bên ngoài bị chặn chủ động trước tải trang** xác nhận luồng dữ liệu vẫn hoạt động; không đánh đồng fault injection này với phép đo network thật ở trên.
- Không thay provider, không thêm dịch vụ trả phí, không tắt kiểm tra TLS. Cần người vận hành mạng kiểm tra firewall/proxy/DNS và thử URL tile công khai trên trình duyệt thường. Artifact: test-results/tile-investigation.json; script scripts/investigate-tiles.mjs.

## 5. Kế hoạch E2E ghi dữ liệu để người dùng DUYỆT — CHƯA THỰC HIỆN

### Ranh giới và dữ liệu nền

- Không dùng run bất thường `6fc37ec3-293b-434f-917c-c1d30567a8a6` hoặc sửa 4 race hiện có.
- Race cũ `b033f984-24a8-45c8-84b7-52769ad0a15e`, checkpoint `2bfc8bb6-2a78-4b7b-9f0b-3b7edb7b9f09`, event `31a6ed14-cebc-4a03-b864-0cdb2fd38f8d` MATCHED/COUNTED version2 chỉ làm đối chiếu **GET**. Không resolve/tái đăng ký thiết bị cũ.
- Đề xuất tạo 3 race demo mới có tên/namespace ngày+run-token, ID lấy từ response chứ không đặt trước: **AUTO** (1 runner), **CONFIRM** (2 runner), **DISMISS** (2 runner), GPS_AND_ARDUINO, total_laps=1. Tùy chọn race **GPS-ONLY** riêng 1 runner để kiểm tra Arduino UNASSIGNED không cộng vòng.
- Tất cả student/device/idempotency ID có namespace duy nhất. Không reset/xóa DB/seed trực tiếp; nếu được duyệt, setup qua HTTP công bố. Giữ dữ liệu/audit sau test; cleanup/xóa cần quyền riêng.
- Trước khi viết xác minh host8001 là đúng DB local/demo và thống nhất danh sách record được phép. Key Simulator/Gateway chỉ nằm trong tiến trình test phía người vận hành, không đưa vào FE hoặc log. Giữ bản kê ID từ mỗi response để tái kiểm tra.

### Các bước và thay đổi dự kiến

| Bước | Request/hành động dự kiến | Dữ liệu thay đổi | Điều kiện/kết quả mong đợi |
|---|---|---|---|
| 1. Tạo race | Admin POST /races với tên namespace, mode, total_laps=1 | 3 Race mới | 201; lưu race_id và full config response. Các trạng thái chọn theo contract hiện có, không sửa race cũ |
| 2. Cấu hình trước khóa | Admin PATCH /races/{new_id}/checkpoint-matching trước khi có run | Mode/tham số/config_version race mới | Dùng giá trị demo được duyệt: inner10m/outer15m, window3s/grace2s, gap5s, age10s/skew2s; gửi rõ field cần thử; 200/config_version tăng. Không gọi PATCH rỗng để giả GET. Radius không hợp lệ 422 phải không đổi config |
| 3. Setup định danh | Admin POST /students, /runner-devices, /races/{id}/participants; bib01/02; POST /races/{id}/checkpoints kind=LAP | Student, wearable, participant, checkpoint mới | 201/UUID; checkpoint tọa độ thử được người dùng chọn và cho phép, không lấy vị trí run cũ. Không suy từ bib làm API key |
| 4. Đăng ký Gateway | Admin POST /checkpoints/{new_cp}/devices với device_id mới | Mapping Device mới | 201 đúng race/checkpoint; UI chỉ báo đăng ký, không online. Không dùng ID thiết bị đang vận hành |
| 5. Mở run và socket | Simulator POST /runs với wearable và idempotency key; Admin WS theo race | RunSession, trạng thái race/khóa theo backend | Socket raceA/B tách biệt. Thử PATCH race mới sau start →409 MATCHING_CONFIG_LOCKED; config không đổi, FE lúc đó mới xác nhận khóa |
| 6. GPS evidence | Test driver/Simulator gửi /telemetry/gps có thời điểm thực, unique idempotency, tốc độ/steps hợp lệ, mẫu cách nhau<=gap; đi OUTSIDE→INSIDE sau tối thiểu min_lap_interval | GpsPoint, GeofenceState, GPSPassage; distance/steps | Quan sát runner.updated và checkpoint.passed GPS_PASSAGE_PENDING_ARDUINO thật; lap vẫn0. Không dùng thời gian tương lai vượt skew hoặc backdate vượt age; không hạ ngưỡng để test qua |
| 7. AUTO Gateway | Driver Gateway POST /checkpoint-events cho AUTO, device_event_id ổn định, occurred_at gần entry trong window | DeviceEvent PENDING_MATCH rồi worker chuyển trạng thái; tiêu thụ passage; LapEvent/Run nếu hợp lệ | Chờ cửa sổ+grace đóng (không assume phản hồiPOST là COUNTED). Một candidate →MATCHED/COUNTED, runner.updated/completed thật; GET lap1/statusCOMPLETED/ended_at/duration chốt; raceCOMPLETED khi toàn participant xong |
| 8. CONFIRM mơ hồ | 2 runner hợp lệ vào trong cùng cửa sổ + một Gateway event cho CONFIRM | 2 passage, event AMBIGUOUS/candidates_final sau deadline | Dừng gửi producer; đọc event và version hiện tại. Admin tự chọn passage backend cung cấp; FE không tự chọn gần nhất. Chưa gửi CONFIRM nếu thiếu available candidate |
| 9. Admin CONFIRM | POST /checkpoint-events/{new_event}/resolve {action:CONFIRM,passage_id,expected_version,idempotency_key,reason} | MatchAudit, consume passage, event/version, có thể LapEvent/Run/race | 200 MATCHED, lap_status riêng COUNTED/NOT_COUNTED theo điều kiện. Với ca hợp lệ mong COUNTED, runnerCOMPLETED. Quan sát checkpoint.match.updated + runner.updated statusCOMPLETED; không bắt buộc runner.completed riêng vì source resolve không phát nó |
| 10. Retry và conflict | Thử lại đúng payload/key sau mô phỏng mất response; rồi request version cũ trên event test thích hợp | Retry phải không thêm audit/lap; conflict phải không mutate | Kiểm tra idempotency; event đã resolved trả EVENT_ALREADY_RESOLVED trước VERSION_CONFLICT theo thứ tự source. Muốn test VERSION_CONFLICT thực sự cần event vẫnAMBIGUOUS với version không khớp. FE refetch, không tự đổi version rồi gửi lại |
| 11. Hoàn thành race CONFIRM | Tạo crossing+Gateway hợp lệ tiếp theo cho runner còn ACTIVE sau điều kiện geofence/time; chỉ một candidate khả dụng | Lap/run còn lại và trạng thái race | Toàn participantCOMPLETED thì raceCOMPLETED; duration các run không tăng sau chờ/refresh/reconnect. Không gọi finish để che lỗi tự hoàn thành |
| 12. Admin DISMISS | Trên raceDISMISS, tạo2passage+eventAMBIGUOUS finalized riêng; POST resolve {action:DISMISS,passage_id:null,expected_version,idempotency_key,reason} | Event REJECTED/NOT_COUNTED, version và audit | Không cộng lap; không chốt run. Quan sát checkpoint.match.updated thật; cùng key/payload retry không lặp |
| 13. GPS_ONLY tùy chọn | GPS crossing hợp lệ và Gateway event ở raceGPS-ONLY mới | GPS có thể ghi lap; Gateway event UNASSIGNED | So sánh trước/sau Gateway tách với GPS: Gateway không tăng lap; completion do vòng GPS hợp lệ |

**Điều kiện duyệt:** cho phép các POST/PATCH/producer trên 3 race mới (và race GPS_ONLY nếu chọn), chọn tọa độ checkpoint thử, chấp thuận driver tạo GPS/Gateway mô phỏng và fault injection response. Cần quyền tạo student/wearable/checkpoint/participant/run tương ứng; không chỉ duyệt resolve riêng vì hiện chưa có AMBIGUOUS phù hợp.

### Tách Gateway mô phỏng và kit thật

- Nhánh **demo phần mềm**: driver test tạo GPS và HTTP Gateway theo thời gian thực, lưu nhãn SIMULATED. Chứng minh API/matching/FE/WS, **không chứng minh Arduino hoạt động**. CLI simulator hiện tại không tự bảo đảm kịch bản AMBIGUOUS; cần driver có lịch phát rõ hoặc thủ công có kiểm soát, chỉ chạy sau duyệt.
- Nhánh **kit Arduino thật**: dùng một race mới khác, checkpoint/device mapping riêng, người dùng xác nhận kit+cổng serial+Gateway chạy thực và nguồn GPS wearable (thật hay mô phỏng phải ghi riêng). Tạo passage GPS phù hợp và đi qua sensor thật; ghi thời gian serial, device_event_id, HTTP response và event/version để đối chiếu với message WS/GET. Không suy danh tính người thật chỉ từ phép ghép GPS. Không dùng HTTP giả rồi báo thử kit thật đạt.
- Cả hai nhánh cần observer WS ghi type/race_id/event_id/version/timestamp, không lưu query key. Đối chiếu với API sau mỗi bước, cùng-race nhận và race khác không nhận, reconnect resync. Chỉ kết luận “message thật đã nhận” khi có frame do producer/worker phát, không inject WS frame từ FE.

## 6. Thay đổi và kiểm tra cuối lượt điều tra

- FE `.env` local → REST/WS8001 theo người dùng; không đổi backend .env. Form matching bỏ giả định khóa, chỉ khóa sau mã lỗi xác nhận. Cập nhật script đọc UI theo trạng thái UNKNOWN và base URL từ env; thêm tùy chọn chặn tile ngoài khi kiểm thử. Script harness ghi cũ chỉ cập nhật assertion, **không chạy**.
- Dependency FE bị thiếu; npm ci lần đầu vướng esbuild cũ giữ file. Dừng đúng Vite do agent khởi động trước (37272) và esbuild con20356; npm ci theo lockfile thành công, không thay phiên bản khai báo. Frontend chạy lại PID **47736**, localhost5173. Không khởi động/dừng backend trong lượt này; cổng8000 trả401 do nhầm runtime, 8001 đúng.
- Lint/typecheck/build đạt; **23/23 unit test đạt**. UI read-only ở8001 đạt: auth/race/read/bib/identity/refresh/reconnect/logout, lockUNKNOWN, protected401 và500 fault injection. Không có request ghi nghiệp vụ. **0 WS message thật quan sát được**.
- Git diff/status backend kiểm tra cuối, không sửa code/.env/backend file. Không commit/push/deploy. Chỉ có API GET, POST xác thực không ghi nghiệp vụ và mở/đóng WS; không chạy seed/simulator/finish/resolve/PATCH/đăng ký.

---

# Lịch sử báo cáo (các mục mới phía trên có ưu tiên)

# Kiểm thử tích hợp backend thật — 07/10/2026

Phần này cập nhật và thay thế các kết luận ENV-01/START-01 và “chưa chạy backend” trong bản khảo sát lịch sử phía dưới. Người dùng đã cho phép startup backend trên DB local/demo, nhưng chưa cho phép ghi nghiệp vụ từ FE.

## Môi trường và phạm vi thực tế

- Xác minh Settings với đúng `.env` và ưu tiên biến môi trường, không import app: SQLite, file `services/backend/running_demo.db` hiện hữu bên trong workspace local; không in URL DB/key/password.
- Cổng 8000/5173 trống trước startup. Đã khởi động backend bằng venv Python (`-B -m uvicorn app.main:app --host localhost --port 8000 --no-access-log --log-level error`), PID khởi tạo **34404**. Frontend Vite localhost:5173 (`--strictPort`), PID **37272**. Không reload backend, không chạy nhiều bản backend, không seed/simulator/reset/migration riêng.
- Cho phép cơ chế create_all/migrate_demo_schema/worker có sẵn chạy trong startup; DB demo có thể được cập nhật bởi chính cơ chế này. Không sửa code/.env/dependency backend. Log lưu phía FE trong test-results, không access-log chứa WS query key.
- FE `.env` đúng API mode, REST `http://localhost:8000/api/v1`, WS `ws://localhost:8000`.
- Source backend commit gần nhất: `0968baa2ea91757c6d3a24b8816c087a9e5ee383`. Mọi method/path REST /api/v1 trong source có mặt ở OpenAPI runtime. 13 input model tương đương sau khi bỏ default:null mà FastAPI không xuất. Không thấy dấu hiệu chạy sai contract; backend không có endpoint trả Git SHA nên không tuyên bố runtime tự chứng thực commit.

## Luồng đã kiểm tra bằng dữ liệu thật

- GET /health 200, GET /openapi.json 200; POST /auth/admin-key không body: key ngẫu nhiên trả 401, key cấu hình local trả 200; kiểm tra cả từ API và form trình duyệt.
- GET /races: 4 giải có sẵn; dashboard của cả 4 đọc được, lần lượt 1/20/20/20 participants. GET runners/live/history/checkpoint events/detail của các bản ghi có sẵn thành công.
- UI: bib `01` giữ số 0, link và request dùng student_id/run_id UUID; bảng phân trang và top backend hoạt động; dữ liệu thiếu như faculty/route hiển thị —/thông báo thiếu.
- Snapshot/map hiển thị marker từ GPS thật trả qua API. Đổi giữa giải hoàn thành và giải ACTIVE loại bỏ runner cũ; chỉ 1 WS nghiệp vụ khi ổn định. Socket HMR của Vite được loại khỏi phép đếm.
- Refresh và chủ động đóng socket nghiệp vụ trong trình duyệt để kích hoạt reconnect: có socket mới, trạng thái connected và đọc lại snapshot. Đây là fault injection đóng kết nối thật, không giả lập message.
- Run COMPLETED giữ duration_total_s qua việc đọc lại/refresh/reconnect. Ví dụ run `03179377-d8c9-4b01-8d9c-9759af89b4c1` giữ 32 giây.
- UI hiển thị riêng MATCHED và COUNTED, đọc chi tiết event đã xử lý không hiện nút xác nhận. Form matching của các giải đã bắt đầu bị disable. Form đăng ký device hiện nhưng không submit.
- GPS quá hạn của giải ACTIVE hiện “Mất cập nhật”. Logout đóng socket và trở về form key.
- 500 ở dashboard và 401 ở protected race list được inject trong trình duyệt: UI hiển thị lỗi, refresh phục hồi; protected 401 xóa phiên. Đây là kiểm thử FE có fault injection, không phải lỗi 500/401 phát sinh từ backend thật. 401 key sai là phản hồi backend thật.
- Không quan sát được frame cập nhật nghiệp vụ từ server trong phiên kiểm thử (**0 message**); các phiên đã hoàn thành hoặc GPS cũ không phát sinh dữ liệu mới. Chỉ xác nhận handshake/reconnect, chưa xác nhận delivery runner.updated/checkpoint.match.updated với sự kiện mới.

## Lỗi frontend đã sửa trong lượt tích hợp này

`src/features/live-map/WatchList.tsx`: trước đây không có runner ONLINE thì ghi “Chưa có sinh viên đang chạy”, gây hiểu nhầm khi backend vẫn có ACTIVE nhưng GPS cũ. Đổi thành “Chưa có vị trí GPS mới để theo dõi”, giải thích thiếu/cũ GPS độc lập với trạng thái run. Đã kiểm tra với giải ACTIVE có sẵn.

Thêm `scripts/integration-local-readonly.mjs`: dùng API thật + Edge headless, chặn và ghi nhận mọi request ghi nghiệp vụ, không lưu Admin key vào file/trace. Script nhận key qua môi trường tiến trình, không tự đọc backend .env. Các thử đầu phát hiện selector test chưa tính phân trang, nhầm socket HMR và chuỗi disconnected chứa connected; đã sửa script, không coi là lỗi ứng dụng.

## Vấn đề backend / khả năng API đã xác minh

### DATA-01 — dữ liệu run ACTIVE đã đủ mục tiêu vòng (chưa xác định nguyên nhân)

- Request: GET `/api/v1/races/c2a09d3e-5b4f-4c28-9baf-d06fe1a91296/dashboard`, header `X-Admin-Key: [REDACTED]`, không body. HTTP 200.
- Bản ghi: student `0c0b2cc1-590f-4b97-a9a6-a9baaabbfc8c`, run `6fc37ec3-293b-434f-917c-c1d30567a8a6`; status ACTIVE, lap_count=2, total_laps=2, duration vẫn tăng; race LIVE, active_runners=1, runners_at_lap_target=1, completed_runners=0.
- Mong đợi theo nghiệp vụ hiện tại: backend chốt COMPLETED khi đạt total_laps. Thực tế bản ghi cũ chưa chốt. Không đủ bằng chứng đây là lỗi đường ghi của phiên bản hiện tại; có thể là dữ liệu tồn từ trước. Source `maybe_complete_run`/`record_lap` (app/main.py khoảng 488–515) xử lý khi ghi vòng, không tự sửa mọi dữ liệu cũ khi đọc.
- Ảnh hưởng: FE phải hiển thị ACTIVE và thời gian server trả, không tự hoàn thành. Đề xuất phía BE xác minh lịch sử bản ghi và quy trình xử lý dữ liệu cũ; không áp dụng sửa/finish từ FE.

### API-01..03 — thiếu khả năng API, không phải lỗi runtime

- GET `/api/v1/races/b033f984-24a8-45c8-84b7-52769ad0a15e/checkpoint-matching` -> **405**, `{"detail":"Method Not Allowed"}`. Chỉ PATCH trả full config. Dashboard race chỉ race_id/name/status/checkpoint_mode/total_laps/config_version; overview/live/runners không có matching_locked_at hoặc bán kính/cửa sổ/grace. FE chưa đọc được đầy đủ cấu hình sau reload; khóa vẫn suy ra từ started_runners và xử lý409.
- GET `/api/v1/races/b033f984-24a8-45c8-84b7-52769ad0a15e/checkpoints` -> **405**; GET `/api/v1/checkpoints/2bfc8bb6-2a78-4b7b-9f0b-3b7edb7b9f09` -> **404**, `{"detail":"Not Found"}`. Event/history chỉ cung cấp ID/checkpoint reference hoặc GPS runner, không phải geometry/name/radius checkpoint để vẽ đúng metadata.
- GET `/api/v1/checkpoints/2bfc8bb6-2a78-4b7b-9f0b-3b7edb7b9f09/devices` -> **405**. Event có device_id/checkpoint_source; POST đăng ký trả status đăng ký nhưng không có GET heartbeat/online hay cờ Gateway thật/giả. Không thể suy online từ event mô phỏng. GET legacy /device-events cũng chỉ có ID/time/event_type/identity_status/student_id.
- Đã kiểm tra inventory toàn bộ GET OpenAPI và source handlers liên quan; không thấy endpoint đọc khác đáp ứng các trường này. Đề xuất BE bổ sung GET cấu hình/lock, checkpoint metadata và device status/provenance; chưa sửa BE.
- Tile OpenStreetMap có một số request lỗi trong môi trường kiểm thử; FE hiện cảnh báo nền bản đồ, marker/số liệu vẫn hoạt động. Đây là dependency mạng/bản đồ ngoài, chưa xác định nguyên nhân, không quy lỗi backend.

## Bản ghi/kịch bản dành cho lần kiểm thử ghi tiếp theo — CHƯA thực hiện

- Giải demo `b033f984-24a8-45c8-84b7-52769ad0a15e` (Demo mô phỏng 42d57bcf), checkpoint `2bfc8bb6-2a78-4b7b-9f0b-3b7edb7b9f09`, device hiện có `sim-arduino-42d57bcf`.
- Event mẫu `31a6ed14-cebc-4a03-b864-0cdb2fd38f8d`, MATCHED/COUNTED/version2: chỉ dùng để kiểm tra UI không cho resolve hoặc kiểm tra server từ chối trạng thái khi được cho phép riêng. Không dùng làm ca CONFIRM thành công.
- Hiện 3 giải hoàn thành có tổng 60 event MATCHED, không có AMBIGUOUS trong summary; giải GPS_ONLY không có event. Muốn E2E CONFIRM/DISMISS/retry409 cần người dùng cung cấp/cho phép tạo event AMBIGUOUS+candidates_final với passage khả dụng; chưa có bản ghi phù hợp.
- PATCH cấu hình thành công cần race demo chưa có run; cả 4 giải hiện có đều started. Không tạo race mới trong lượt này. Các race hiện có phù hợp ca khóa/409 nhưng chưa gửi PATCH.
- Đăng ký device: có checkpoint demo ở trên; cần người dùng cho phép và chỉ định device ID thử mới (không tái đăng ký device hiện tại vì endpoint có thể đổi name/status). Chưa POST.
- Chưa có dữ liệu hiện tại để xác minh E2E MATCHED+NOT_COUNTED, GPS_ONLY Arduino UNASSIGNED, passage pending, run thiếu tọa độ, lỗi409/422 khi ghi hoặc thiết bị thật. Unit tests đã kiểm tra một phần, không thay thế E2E.

## Kiểm tra cuối và truy cập

- Typecheck, lint, build đạt; Vitest **23/23** đạt. Bộ đọc API backend thật đạt. Báo cáo UI: `test-results/local-readonly-report.json`, ảnh `local-readonly-ui.png`; OpenAPI/schema comparison trong test-results. Không có request ghi nghiệp vụ được gửi; chỉ POST xác thực và GET/WS.
- Frontend: http://localhost:5173/; backend health: http://localhost:8000/health; docs: http://localhost:8000/docs. Để lại tiến trình local phục vụ người dùng; chưa commit/push/deploy.
- Backend tracked diff/status được kiểm tra cuối; code và .env không sửa. Tác dụng phụ được phép: startup có thể nâng schema/worker ghi DB demo; không khẳng định DB bất biến.

---

# Bản khảo sát trước khi được phép startup (lịch sử)

# Báo cáo tích hợp NEU Smart Running — 07/10/2026

## Phạm vi và phiên bản

- Frontend: `apps/admin-web`; backend chỉ đọc: `services/backend`, cùng repository.
- HEAD khảo sát: `1eeeb6ddd0ef7c5af844ac77778345d998525582`.
- Commit gần nhất thay đổi backend: `0968baa2ea91757c6d3a24b8816c087a9e5ee383` (Implement Arduino GPS runner matching and dashboard).
- Git status đầu nhiệm vụ sạch; không pull/đổi nhánh. Chỉ sửa frontend.
- `.env` FE chọn API thật, REST `http://localhost:8000/api/v1`, WS `ws://localhost:8000`; script dev dùng localhost:5173 mặc định. Không đưa key vào FE env.
- GET health/OpenAPI ở localhost:8000 và frontend localhost:5173 không kết nối được trong lần khảo sát. Chưa xác minh runtime/source trùng phiên bản; không khẳng định backend hỏng.
- Backend có `.venv` và `.env`. Không import app, khởi động server, nâng dependency, migration, seed, simulator hoặc ghi DB. Đọc source bằng văn bản/AST.

## A. Thay đổi frontend lần này

1. Dùng chung reconcileRunner/reconcileSnapshot trong live service và provider: giữ version checkpoint mới hơn qua REST resync, kể cả event mới chưa có trong REST cũ; bảo vệ tổng và thời gian đã chốt trong cùng run. Đổi race/run không kế thừa trạng thái cũ.
2. Completion là trạng thái backend riêng với thời điểm GPS: nhận COMPLETED có GPS cũ nhưng giữ vị trí mới hơn; so sánh timestamp theo thời gian thực thay vì thứ tự chuỗi.
3. Timer phân loại lại GPS STALE/UNAVAILABLE mỗi 15 giây, không coi COMPLETED là mất kết nối; không thêm polling REST khi WS connected.
4. Form matching lấy mode mới từ backend khi admin chưa sửa; sau lưu dùng response PATCH; không hiển thị tham số đã lưu cục bộ như hiện tại khi config_version server đã mới hơn. Chặn form khi snapshot còn thuộc race khác.
5. Empty state hướng dẫn chuẩn bị dữ liệu được phép, không yêu cầu chạy simulator như một bước mặc định.
6. Thêm kiểm tra backend chỉ đọc và test hồi quy cho stale REST, completion, checkpoint version, reconnect/cleanup, GPS cũ, mạng/500.

## B. Bảng ánh xạ contract

REST dùng prefix `/api/v1`, header `X-Admin-Key` cho Admin. ID là chuỗi backend; bib/display_id chỉ hiển thị, giữ số 0. Nguồn: routes, Pydantic input models, run_dict/checkpoint_event_dict và các chỗ hub.publish trong app/main.py; README bổ trợ. Không import module để lấy OpenAPI vì import có tác dụng phụ DB.

| Màn hình/luồng | API | Schema và cách dùng FE |
|---|---|---|
| Đăng nhập | POST /auth/admin-key | Không body; 200 authenticated/role; 401 giữ form; key trong bộ nhớ |
| Giải | GET /races | items: race_id/name/status/start_at nullable; không suy ra tọa độ |
| Dashboard | GET /races/{race_id}/dashboard | race/summary/runners/top_runners/recent_checkpoint_events/server_time; giữ thứ tự xếp hạng server |
| Map | GET /races/{race_id}/live | race_id, runners có latitude/longitude nullable và dữ liệu run; không giả GPS |
| Runners | GET /races/{race_id}/runners | keyword/status/page/page_size<=100/sort_by/sort_order; REGISTERED -> PENDING, duration không có sort backend |
| Run/history | GET /runners/{student_id}/runs/{run_id}, /events | Backend kiểm tra identity; history page/page_size<=200, items GPS/LAP; duration giây, distance mét |
| Nhật ký | GET /races/{race_id}/checkpoint-events | checkpoint_id/match_status/from/to/limit<=200/cursor; items,next_cursor |
| Chi tiết | GET /checkpoint-events/{event_id} | match_status riêng lap_status; candidates_final/version/candidates; khoảng cách m, time_delta_ms/lap_duration_ms là ms |
| Resolve | POST /checkpoint-events/{event_id}/resolve | action,passage_id nullable,expected_version>=1,idempotency_key 1..120,reason 1..500; 409 refetch, retry giữ payload/key |
| Matching | PATCH /races/{race_id}/checkpoint-matching | Chỉ field thay đổi; radius>0 và inner<outer; window/grace/skew 0..60, gap 1..300, age 1..3600; response full config/config_version |
| Thiết bị checkpoint | POST /checkpoints/{checkpoint_id}/devices | device_id 1..80,name<=120; 201 device_id/checkpoint_id/race_id/status, không chứng minh online |
| Realtime | WS /ws/v1/races/{race_id}/live?key=… | runner.updated,runner.completed,checkpoint.passed,checkpoint.match.updated; phiên bản ở event, không có sequence toàn cục |

Source cũng có POST /races (RaceIn), /students (StudentIn), /runner-devices (RunnerWearableIn), /races/{race_id}/checkpoints (CheckpointIn), /races/{race_id}/participants (ParticipantIn), /runs/{run_id}/finish (FinishIn) cho Admin. FE hiện có chưa cung cấp các form quản trị này; nút chưa hỗ trợ vẫn vô hiệu hóa và có giải thích. Không tự gọi để tạo dữ liệu demo. POST /runs, /telemetry/gps, /lap-events thuộc Simulator; POST /checkpoint-events thuộc Gateway, không tích hợp gửi từ FE.

Lỗi chuẩn: HTTPException detail={code,message,details,trace_id}; lỗi validation FastAPI detail là mảng loc/msg. FE phân biệt 401/403/404/409/422/5xx và mạng; không log credential. WS xác thực qua query, server đóng 4401 khi sai key.

## C. Dependency và điểm bị chặn

| Mã | Bằng chứng / tái hiện | Mong đợi và thực tế | Ảnh hưởng / đề xuất |
|---|---|---|---|
| ENV-01 | GET http://localhost:8000/health và /openapi.json, không header/body | Mong 200; thực tế lỗi kết nối, không có HTTP status | Chưa xác định nguyên nhân tiến trình/cổng; người vận hành kiểm tra và chạy đúng backend. Không coi là lỗi contract |
| START-01 | Source app/main.py:1234 create_all, migrate_demo_schema() tại cuối file, startup:1310 | Import có thể tạo/nâng schema; worker ghép có thể ghi dữ liệu | Không tự khởi động theo phạm vi chỉ đọc. Cần người vận hành cho phép/chuẩn bị DB và runtime trước khi E2E |
| API-01 | GET dashboard app/main.py:1112 và race_matching_config:464 | Dashboard chỉ mode/config_version, không số đo hoặc flag khóa; chỉ PATCH trả đủ | UI hiển thị — cho chưa biết, khóa suy ra started_runners và bắt 409. Đề xuất GET cấu hình + flag khóa server |
| API-02 | Inventory routes app/main.py | Chưa có GET checkpoint geometry/metadata hoặc GET danh sách device | Không vẽ checkpoint giả; đăng ký yêu cầu ID thật. Đề xuất endpoint đọc; không áp dụng backend |
| API-03 | checkpoint_event_dict app/main.py:518 | checkpoint_source=ARDUINO_GATEWAY, không phân biệt Gateway giả/thật/online | Không ghi Arduino online; cần backend cung cấp provenance/heartbeat nếu muốn xác minh |
| API-04 | eligible_passages/candidates_json và resolve app/main.py:1029 | Candidate availability lưu theo snapshot, có thể đã bị tiêu thụ | Backend recheck + 409; FE refetch và không tự chọn lại. Đề xuất trả availability hiện tại nếu cần |

Các API-01..04 là giới hạn hợp đồng được đọc từ source, không phải lỗi runtime đã tái hiện. Không có thay đổi backend được áp dụng.

## D. Kiểm tra và giới hạn

Kết quả ngày 07/10/2026: npm run lint đạt; npm run typecheck đạt; npm run test đạt 23/23 test trong 4 file; npm run build đạt. npm run test:backend:read exit 1, báo backend chưa truy cập được. git diff --check đạt. Test dùng fixture trong bộ nhớ và giả lập transport, không là bằng chứng kết nối backend thật.

Lần này chưa kiểm tra thành công auth/dashboard/WS với backend thật vì runtime chưa truy cập được. Không chạy lại harness tích hợp cũ (có seed/DB/startup). Resolve/PATCH/đăng ký chưa E2E lần này vì chưa có môi trường/bản ghi kiểm thử được phép. Chưa kiểm tra sensor Arduino vật lý, message delivery thực, runtime OpenAPI tương đương source hoặc demo với dữ liệu mới. Kết quả E2E ngày trước không đại diện cho lần rà soát này.

## E. Cách chạy

Frontend từ apps/admin-web: `npm.cmd run dev`, mở localhost:5173. `.env`: VITE_DATA_MODE=api, VITE_API_BASE_URL=http://localhost:8000/api/v1, VITE_WS_BASE_URL=ws://localhost:8000. Admin nhập key tại giao diện, không VITE_ADMIN_API_KEY.

Backend cần được người vận hành chạy từ services/backend trên localhost:8000; lệnh theo README là `.\.venv\Scripts\python.exe -m uvicorn app.main:app --host localhost --port 8000`. Chỉ chạy sau khi cho phép tác dụng phụ schema/worker ở trên; agent chưa chạy lệnh này. CORS cần cho phép origin FE; chưa kiểm tra runtime, không thay backend hoặc proxy.

Khi backend sẵn sàng, đặt ADMIN_API_KEY trong môi trường tiến trình kiểm tra và chạy `npm.cmd run test:backend:read` tại frontend. Script không đọc .env tự động và không ghi nghiệp vụ. Các thao tác ghi E2E cần chỉ định bản ghi kiểm thử và cho phép riêng.

## F. File FE thay đổi

- src/services/reconcile.ts, reconcile.test.ts (mới).
- src/services/liveService.ts, contract.ts, apiAdapter.ts, apiAdapter.test.ts, matching.test.ts.
- src/app/LiveProvider.tsx.
- src/features/races/MatchingSettings.tsx.
- scripts/verify-backend-readonly.mjs (mới), package.json.
- README.md, INTEGRATION_REPORT.md (mới).

Kiểm tra cuối: git diff -- services/backend và git status --porcelain -- services/backend đều rỗng. Không có file tracked/untracked backend thay đổi; không khởi động/import backend hoặc thao tác DB. Không commit/push/deploy.
