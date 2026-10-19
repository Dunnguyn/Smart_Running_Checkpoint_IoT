# Cải thiện Giải chạy và bỏ Cột bổ sung — 15/10/2026

- `/races`: phân bố lại độ rộng cột; tên giải rõ hơn, metadata xuống dòng và không dùng dấu gạch cho số vòng thiếu; nhãn Đang xem + viền xanh; địa điểm chỉ hiển thị khi có dữ liệu; số kết quả theo danh sách đã tải; nút Xóa bộ lọc thực sự reset tìm kiếm/trạng thái. Bảng cuộn cục bộ trên màn hình nhỏ. Không đổi API, lựa chọn giải hay hành vi tạo/xóa.
- `/runners` (Sinh viên): bỏ control Cột bổ sung, state và các nhánh cột tùy chọn. Giữ bảy cột mặc định, search/status/sort/page-size/pagination và drawer chi tiết. Dữ liệu chi tiết vẫn dùng luồng cũ.
- File sửa: `src/features/races/Races.tsx`, `src/features/runners/RunnerTable.tsx`, `src/design.css`, `scripts/verify-race-toolbar.mjs` và báo cáo.
- Kiểm tra: lint, typecheck, build đạt; build còn cảnh báo bundle >500kB. Browser script đạt search/empty/reset, modal tạo giải mở/đóng Escape, link mô phỏng, đúng 7 cột và không còn Cột bổ sung, drawer mở/đóng, ảnh races desktop/tablet/mobile. Tất cả API test bằng interception/fixture; không gửi ghi thật. Không chạy lại toàn bộ unit suite cho thay đổi trình bày này.
- Ảnh: `test-results/design-audit-20261015/implementation/races-1440.png`, `races-768.png`, `races-390.png`, `students-no-column-picker.png`.
- Không sửa backend, env hay dữ liệu; không commit/push. Các thay đổi có sẵn được giữ nguyên.

---

# Rà soát toàn bộ với Figma — 15/10/2026 (mới nhất)

**Kết luận: chưa khớp hoàn toàn.** Đã đối chiếu tám màn hình chính của export và kiểm tra các trạng thái được liệt kê dưới đây. Không coi build/test đạt là bằng chứng pixel-match. Lượt này là audit toàn ứng dụng, kèm chỉnh toolbar Giải chạy; không tuyên bố đã hoàn thành tất cả phần tinh chỉnh còn lại.

Nguồn: `E:\Hocccc\Project\Admin Dashboard for NEU RUN`, chạy localhost:5180. SHA256 App.tsx/index.css vẫn trùng mục báo cáo trước; không có export mới khác. Frontend localhost:5173. Git status đã được kiểm tra; giữ các chỉnh sửa có sẵn, bao gồm README.md.

## Đối chiếu từng màn hình

| Màn hình | Phần đã theo mẫu | Còn khác / cần xử lý |
| --- | --- | --- |
| Shell | Sidebar 252px, header 72px, nhóm điều hướng, logo, màu và icon | Không dùng nhãn hệ thống/GPS online giả của prototype; header phản ánh ngữ cảnh từng trang. Khoảng cách nhóm menu chưa giống tuyệt đối |
| Tổng quan | Hero, banner, bốn KPI, map + attention, bảng tiến độ + sự kiện, thống kê mở rộng | Toolbar/legend/cảnh báo map làm khối cao hơn mẫu; icon KPI và cách trình bày bảng tiến độ còn khác. Khối attention co theo dữ liệu thay vì luôn cao bằng map |
| Phân tích | Hai tab, KPI, chart/donut, bảng; profile/metrics/lap chart | Xem audit riêng ở mục sau. Thiếu điểm ổn định/tổng hợp fastest: trạng thái thiếu dữ liệu có chủ ý |
| Bản đồ trực tiếp | Panel trái, map phải, toolbar nổi, chọn runner | Giữ Leaflet, tọa độ thật và cảnh báo tile; hàng runner cao hơn mẫu để hiện nguồn/độ mới GPS; filter GPS riêng. Không coi khác hình dạng route là lỗi visual |
| Giải chạy | Bảng, search/status, tạo giải/action menu | Đã bỏ header thẻ dư; chuyển lối vào mô phỏng lên action cạnh nút Tạo giải, nối /simulation thật; thêm icon. Giữ thiếu lịch, badge và dữ liệu thực; chưa đồng nhất mọi action/menu với prototype |
| Sinh viên | Bảng, search/filter/pagination, drawer, modal tạo | Mặc định hiện Phiên chạy; Figma là danh bạ. Danh bạ hiện qua tab Sinh viên toàn hệ thống. Đây là khác biệt điều hướng cần quyết định/refine; bảng phiên có nhiều trường và cao hơn mẫu. Không bịa trạng thái hồ sơ đầy đủ/cần bổ sung |
| Thiết lập giải | Tabs Người tham gia/Tuyến & trạm/Cấu hình ghi nhận | Thêm tab Thông tin giải và link quay lại để giữ chức năng; participant fixture rỗng nên chưa đối chiếu trạng thái có hàng tương đương. Editor và config còn nhiều field nghiệp vụ hơn prototype |
| Trạm kiểm soát | Tabs, queue trái/detail phải, ứng viên radio và reason/actions | Queue và detail cao hơn mẫu; thông báo nguồn, eligibility và technical làm khác mật độ. Cần tinh chỉnh hierarchy, khoảng cách và footer action; không bỏ validation/version/conflict |
| Mô phỏng | Form/tracking hai cột, mode cards, advanced fields | Form cao hơn mẫu; tóm tắt thông số hiện bằng câu thay vì strip ba ô, thiếu icon empty mẫu; mode/spacing phải theo state thật, không ép theo prototype |
| Dialog/drawer | Modal tạo sinh viên, conflict, focus Escape; editor khóa, detail liên kết | Chưa kiểm chứng từng modal/menu ở mọi viewport; không khẳng định toàn bộ interaction-state đã giống Figma |

## Kiểm tra thực tế và ảnh

- `node scripts/capture-audit-reference.mjs`: render/chụp 8 màn hình reference tại 1440×900, thêm create race, drawer, auth và overview 1366/768/390.
- `node scripts/audit-design.mjs`: 8 route chính × 4 viewport (1440×900, 1366×768, 768×1024, 390×844), 32 kết quả không tràn ngang toàn trang, không pageerror/request không biết/request ghi. Đã sửa script route Sinh viên thành `/runners` trước kết quả cuối; chờ dữ liệu và chọn checkpoint để xem chi tiết.
- `node scripts/verify-latest-design.mjs`: đạt validation/409/payload/success tạo sinh viên bằng interception; resolve 409 xóa lựa chọn; setup tabs/lock; resize map giữ chọn; frozen duration; simulation options; auth. 3 request ghi bị interception, **0 ghi thật**.
- `node scripts/verify-race-toolbar.mjs`: đạt search/empty/reset, modal tạo giải mở/đóng Escape, link Tạo mô phỏng, ảnh desktop/tablet/mobile; 0 ghi thật.
- `npm run lint`, `npm run typecheck`, `npm test` (10 files, 45 tests), `npm run build`: đạt. Build còn cảnh báo JS bundle trên 500 kB.
- [Gallery đối chiếu 8 màn hình](test-results/design-audit-20261015/index.html), các `compare-*.png` cùng thư mục; [ảnh mobile tổng hợp](test-results/design-audit-20261015/contact-390.png); [kết quả 32 viewport](test-results/design-audit-20261015/implementation/results.json).
- Các ảnh state mới từ verify-latest-design được lưu tại `test-results/design-20261014/states` theo đường dẫn script hiện có (lần chạy audit này ngày 15/10). Ảnh reference và frontend dùng dữ liệu/trạng thái khác nhau; không suy ra mức pixel-match từ chúng. Một số ảnh full-page có header fixed lặp vị trí do cuộn/chụp; không coi đó là lỗi layout.

## Phạm vi sửa và giới hạn

Sửa `src/features/races/Races.tsx`, `src/design.css` cho toolbar danh sách giải. Thêm scripts audit/capture/verify toolbar và mục báo cáo này. Không đổi auth, REST/WS, cache, polling, editor, contract hoặc dữ liệu. Tạo mô phỏng vẫn truy cập qua trang riêng và sidebar; điều hướng không tự tạo job.

Kiểm tra trên fixture cô lập, tile bị chặn có chủ ý trong script. Không dùng lỗi tile hoặc fixture làm bằng chứng lỗi backend. Lượt audit này chưa xác minh lại API thật, reconnect/race-switch E2E, các trạng thái simulation đang chạy hay tất cả dialog/empty/error variants. Không sửa backend, .env, schema hoặc dữ liệu lịch sử; không khởi động backend, không commit/push.

---

# Hiệu chỉnh riêng trang Phân tích — 15/10/2026 (mới nhất)

## Thiết kế và triển khai

Tham chiếu trực tiếp bản export tại `E:\Hocccc\Project\Admin Dashboard for NEU RUN` (App.tsx, index.css), render tại http://localhost:5180. Frontend: http://localhost:5173/analytics. Không đổi cấu hình kết nối backend.

| Màn hình tham chiếu | Triển khai | Trạng thái |
| --- | --- | --- |
| Analytics / Toàn giải | Analytics.tsx + analytics.css | Header, tabs, bốn KPI/icon, grid biểu đồ quãng đường/donut với legend bên cạnh, vạch mục tiêu từ tuyến, bảng bảy cột và tiến độ |
| Analytics / Theo sinh viên | StudentAnalytics.tsx | Bộ chọn phiên/pills, hồ sơ + bốn KPI, biểu đồ từng vòng từ API lịch sử, vòng nhanh nhất theo dữ liệu tải, panel ổn định và link chi tiết phiên |
| Responsive | CSS scoped analytics-ref | Hai tab kiểm tra tại 1440×900, 1366×768, 768×1024, 390×844; bảng cuộn cục bộ, không tràn ngang trang |

Các file của lượt sửa: `src/features/dashboard/Analytics.tsx`, `StudentAnalytics.tsx`, `analytics.css`, `analyticsMetrics.ts`, `analyticsMetrics.test.ts`, `scripts/verify-analytics-design.mjs`, báo cáo này. Các thay đổi từ nhiệm vụ trước và README có sẵn được giữ nguyên.

## Đối chiếu hình ảnh

- [Figma và triển khai — Toàn giải](test-results/analytics-20261015/comparison-race.png)
- [Figma và triển khai — Theo sinh viên](test-results/analytics-20261015/comparison-student.png)
- Trước lượt sửa: `test-results/design-20261014/implementation/1440--analytics.png`.
- Ảnh sau sửa cho cả hai tab ở bốn viewport: `test-results/analytics-20261015/{race,student}-{1440,1366,768,390}.png`.

Đã render/chụp cùng viewport 1440×900 và xem đối chiếu. Khác biệt có chủ ý: nội dung fixture khác bản mẫu nên số hàng/chiều cao biểu đồ thay đổi; dùng select chọn phiên để hỗ trợ nhiều người; giữ link lịch sử; nhãn pace là ước tính, bảng là tiến độ theo backend chứ không phải kết quả thi đấu. Không sao chép điểm ổn định 92, cadence, xu hướng cải thiện, nút xuất báo cáo giả hoặc vòng nhanh nhất toàn giải chưa có nguồn tổng hợp. Panel ổn định dùng vòng trung tính và dữ liệu chênh lệch các vòng đã tải. Thời lượng giữ định dạng HH:MM:SS và giá trị đã chốt. Nhãn phụ nâng nhẹ cỡ chữ so với mẫu. Header/sidebar dùng bản tích hợp hiện có, không sửa lại trong lượt này.

## Bảo toàn tích hợp và kiểm thử

- Chỉ đọc run detail/lap history qua service có sẵn; request có AbortController, timeout polling tuần tự được dọn khi đổi phiên/unmount. Detail được giữ khi refetch lỗi; không phát request ghi. Dữ liệu thiếu khác giá trị 0.
- Giữ auth, race context, REST/WS provider, UUID/bib và điều hướng chi tiết. Duration COMPLETED dùng giá trị backend chốt. Màu xanh biểu đồ vòng dựa trên vòng có thời lượng nhỏ nhất, không dựa vị trí cột mẫu.
- `npm run lint`: đạt.
- `npm run typecheck`: đạt.
- `npm test`: đạt 10 files / 45 tests, bao gồm ba test pace/scale/progress mới.
- `npm run build`: đạt; còn cảnh báo bundle JS trên 500 kB như trước.
- `node scripts/verify-analytics-design.mjs`: đạt cả hai tab ở bốn viewport; kiểm tra dữ liệu vòng, duration đã chốt, refresh, không tràn ngang, không lỗi JS/request ngoài fixture; không có request ghi. Kết quả: `test-results/analytics-20261015/results.json`.
- Browser dùng interception/fixture cô lập, không phải E2E backend thật. Lượt này chưa xác minh lại dữ liệu thật, reconnect/race-switch đầy đủ hoặc thao tác ghi; không khẳng định đã kiểm thử các phần đó. Không kết luận lỗi backend từ fixture.
- Giới hạn dữ liệu: chưa có nguồn xác minh điểm ổn định/tổng hợp vòng nhanh nhất toàn giải; không tự phát minh endpoint hay kết quả. Những blocker backend của các mục báo cáo trước chưa được kết luận đã giải quyết.
- Không sửa backend, env, schema, dữ liệu nghiệp vụ; không khởi động lại backend, không tạo simulation, không commit/push. File README có sẵn không được chỉnh trong lượt này.

---

# Áp dụng bản thiết kế NEU RUN mới — 14/10/2026 (mới nhất)

## Nguồn tham chiếu và phạm vi

- Bản xuất sử dụng: `E:\Hocccc\Project\Admin Dashboard for NEU RUN`, các file cập nhật ngày 14/10/2026. Đã đọc App.tsx, index.css, package.json, các icon SVG và các màn hình/modal trong bản xuất. Không sử dụng ảnh từ đợt trước làm chuẩn.
- SHA256 `src/App.tsx`: `C590650D1E6956866E528AC53659B4141C7235BF7F310D4DD0720064AAA83D19`; `src/index.css`: `75B97219C1B305A182EBCA8D42F33771F40048F1407B938D0FEAC34D299E881F`.
- Reference: cài bằng `pnpm install --frozen-lockfile`; chạy Vite riêng tại `http://localhost:5180`. Frontend thật chạy `http://localhost:5173`. Hai URL trả HTTP 200 ở lần kiểm tra cuối.
- HEAD local lúc bắt đầu: `56ca508`. Thay đổi README.md đã có trước nhiệm vụ, không sửa/ghi đè. Không pull, merge, commit hoặc push.
- Giữ nguyên package/lockfile/env frontend và REST `http://localhost:8000/api/v1`, WS `ws://localhost:8000`. Không sửa/khởi động backend.

## Mapping và trạng thái triển khai

| Reference | Frontend thực tế | Đã triển khai / giới hạn |
| --- | --- | --- |
| Shell / sidebar / topbar | Shell.tsx, design.css | Logo NR và SVG từ export; sidebar 252px, thu gọn 72px, header 72px, nhóm điều hướng và thẻ đếm sự kiện; padding/tokens/typography theo export; refresh icon, tài khoản, skip link |
| Access screen | LiveProvider.tsx | Bố cục đăng nhập mới; giữ xác thực Admin key thật và key chỉ trong bộ nhớ |
| Overview | Dashboard.tsx | Hero, status/thời điểm snapshot, dải ngữ cảnh, 4 KPI, map + việc cần xử lý, tiến độ + sự kiện; giá trị từ state/API |
| Analytics — whole race / student | Analytics.tsx, `/analytics` | Tabs, KPI, thanh quãng đường, donut trạng thái, bảng tiến độ theo thứ tự BE; chi tiết từng phiên dùng RunDetail thật. Pace là ước tính có nhãn từ thời lượng/quãng đường các phiên đã tải, không giả làm chỉ số chính thức |
| Race directory / create / delete | Races.tsx, CreateRace, DeleteRace, RaceActions | Bảng, tìm/lọc, icon/menu, modal dùng styles chung; theo dõi/tạo mô phỏng vẫn truy cập được qua vùng mở rộng và trang Mô phỏng |
| Live map / selected runner | LiveMap.tsx, WatchList, MapResize.tsx | Leaflet thật; panel trái 325px; toolbar nổi desktop; panel chọn, legend, marker/bib và trạng thái; ResizeObserver invalidateSize không fit lại khi đổi kích thước |
| Students / student create / run drawer | People.tsx, CreateStudent.tsx, RunnerTable, RunDetail | Tiêu đề/controls và styles chung, tabs giữ các luồng cũ; form tạo hồ sơ nối POST /students đúng student_code/full_name/faculty; lỗi giữ draft, kết quả không chắc chắn chặn gửi lặp |
| Setup / participants | Races.tsx, Roster | Tabs Người tham gia / Tuyến & trạm / Cấu hình ghi nhận; thêm tab phụ Thông tin giải để không mất chức năng cũ. Dùng roster, đăng ký và bib hiện có |
| Setup route / matching | LiveMap, MapEditor, MatchingSettings | Editor/validation/khóa/draft và API cũ giữ nguyên, styling dùng chung. Cấu hình matching ở tab riêng |
| Checkpoint review / journal / stations | CheckpointJournal.tsx, Checkpoints | Hàng đợi bên trái, chi tiết bên phải; thẻ ứng viên radio có khoảng cách/độ lệch/khả dụng; không chọn tự động. Nhật ký vẫn có modal, filters và phân trang; thiết bị vẫn có modal đăng ký |
| Simulation / stop | SimulationPanel.tsx | Form và tracking hai cột; lựa chọn mode dạng thẻ radio; seed/chu kỳ GPS trong Tùy chọn nâng cao; giữ giãn xuất phát, job tracking, xác nhận dừng, chống tạo lặp và trạng thái không chắc chắn |

## Tích hợp được bảo toàn

- Không thay API client/base URL, auth, reconcile REST/WS, cache, nhịp đồng bộ nền, cleanup socket/request/timer hoặc phép tính vòng.
- Matching vẫn sử dụng passage_id, expected_version, idempotency key; xung đột 409 tải lại và xóa lựa chọn cũ; match_status/lap_status riêng biệt.
- Route/checkpoint vẫn lấy tọa độ/anchor từ backend, không sao chép SVG hoặc oval; không kéo runner. Editor tách draft, giữ kiểm tra khóa, hủy không ghi, refetch/readback sau lỗi không chắc chắn.
- Run COMPLETED giữ duration đã chốt; GPS cũ/thiếu/tương lai/mô phỏng và vị trí cuối phiên không bị đồng nhất thành online.
- Các thao tác ghi chỉ xuất phát từ hành động chủ động. Không tạo ghi khi mở trang, đổi tab, refresh hoặc resize.

## Kiểm tra đã thực hiện

| Lệnh / kiểm tra | Kết quả |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` và `npm run build` | PASS; Vite cảnh báo bundle JS khoảng 631 kB (>500 kB), chưa tách chunk trong phạm vi thiết kế |
| `npm test` | 9 file / 42 test PASS |
| `node scripts/capture-latest-design.mjs` | Chụp 8 màn hình reference 1440×900, create race/drawer/auth; overview thêm 1366×768, 768×1024, 390×844 |
| `node scripts/verify-qa-pages.mjs` với QA_OUTPUT mới | PASS 13 đường dẫn × 4 viewport = 52 lượt bố cục; 0 overflow ngang/JS error/unexpected API. Chạy cả tương tác map, drawer, journal, auth, back/forward. Chụp lại desktop với QA_POPULATED cho bảng có dữ liệu |
| `node scripts/verify-latest-design.mjs` | PASS form sinh viên validation/409/payload/success, review inline 409, tabs setup/khóa, resize map giữ lựa chọn, thời gian COMPLETED ở Analytics, mode simulation/nâng cao/auth; 3 write mock, 0 thật |
| `node scripts/verify-admin-current.mjs` | PASS; tạo/poll/dừng/restart simulation, matching, delete/conflict/lost response/cleanup; 9 write mock, 0 thật |
| `node scripts/verify-map-editor.mjs` | PASS draft/pick/drag/input/cancel/navigation/anchors/422/409/readback; 4 write mock, 0 thật |
| `node scripts/verify-ui-polish.mjs` | PASS keyboard/menu/tên dài/scroll/loading/error/reconnect; không mutation |
| `node scripts/verify-enrollment.mjs` | PASS debounce, bib conflict, UUID, “01”, không lẫn race; 2 write mock, 0 thật |
| `node scripts/verify-race-create.mjs` | PASS validation/422/payload/busy/refetch/lost response/Escape; 3 write mock, 0 thật |

Các harness cũ đã được cập nhật locator khi tên/placement thay đổi và bổ sung response GET participants cho tab setup mới; giữ nguyên assertion nghiệp vụ. Lỗi fixture/locator gặp trong lượt đầu đã sửa và chạy lại đạt, không ghi thành lỗi backend.

## Ảnh và đối chiếu trực quan

Thư mục: `apps/admin-web/test-results/design-20261014/` (artifact local bị gitignore):

- `reference/`: ảnh bản xuất, cùng `metrics.json` ghi kích thước/style thực tế.
- `implementation/`: ảnh từng route ở 1440, 1366, 768 và 390; trạng thái empty/loading được kiểm tra riêng trước lượt fixture populated.
- `states/`: checkpoint-review, setup-route-locked, setup-matching, map-collapsed-selected, analytics-student, simulation-options, create-student-conflict, auth; `results.json`.
- `comparison/index.html`: gallery so sánh trái reference / phải implementation; PNG từng màn hình bên cạnh.
- Ảnh editor, đăng ký, menu và lỗi bổ sung từ harness hiện có nằm ở `test-results/current/` và thư mục mà script editor công bố.

Đã xem ảnh và sửa các lệch lớn ở sidebar/header, kiểu chữ heading, gap hero/KPI, toolbar live map, độ dày hàng runner, form lý do và bố cục simulation. Không công bố phần trăm pixel-match. Không có ảnh baseline trước sửa của lượt này; ảnh “trước” trong gallery là reference, không phải source cũ.

## Khác biệt có chủ đích và giới hạn còn lại

- Leaflet/tuyến/GPS thật thay SVG; tile bị chặn trong harness để kiểm tra lỗi nền nên ảnh không có tile, không phải bằng chứng lỗi backend. Không dịch GPS, thay provider hoặc giả chuyển động.
- Dữ liệu fixture/số người/tên/trạng thái khác sample reference; một số fixture cố ý mâu thuẫn summary/runner để kiểm tra hiển thị nguyên dữ liệu. Không tự sửa số tổng để làm khớp ảnh.
- Helper text quan trọng được giữ tối thiểu khoảng 11–12px, bảng hiện có 14px thay chữ 8–10px ở một số vùng reference; hàng có nhãn nghiệp vụ dài sẽ cao hơn prototype.
- Điện thoại giữ sidebar icon có đủ điểm đến thay vì ẩn bớt chức năng như prototype. Map trở về toolbar theo luồng trên màn hình hẹp, không ép overlay vào vùng quá nhỏ.
- Giữ filters GPS/status riêng và nguồn GPS, chi tiết khóa/tile error nên panel map cao hơn mẫu. Không hiển thị “Hệ thống ổn định / GPS + Arduino” hoặc “Dữ liệu trực tiếp” chỉ từ WS connected.
- Giữ tab Phiên chạy/Đăng ký/Danh bạ và tab Thông tin giải phụ, điều khiển refresh và kỹ thuật để không bỏ chức năng hiện có. Run drawer và Analytics từng sinh viên dùng dữ liệu/lịch sử phiên hiện có; chưa sao chép các biểu đồ cadence/xu hướng/split mẫu.
- Chưa có dữ liệu/hợp đồng đã xác minh cho cadence, xu hướng thành tích, trạng thái hồ sơ “đầy đủ/cần bổ sung”, thiết bị online, xuất báo cáo, bảng xếp hạng chính thức; không tạo các nút hoặc giá trị giả. Vòng nhanh nhất toàn giải không có dữ liệu tổng hợp đã xác minh nên hiển thị “— / Chưa có dữ liệu tổng hợp toàn giải”.
- Không kiểm thử ghi E2E trên dữ liệu thật. Không thể tuyên bố visual pixel-perfect; các khác biệt mật độ nội dung và chi tiết nghiệp vụ nêu trên còn tồn tại.

## Backend và an toàn dữ liệu

- Kiểm tra chỉ đọc `http://localhost:8000/health` timeout 3 giây; FE/reference HTTP 200. Không khởi động/restart backend theo yêu cầu. Vì vậy chưa xác minh lại dữ liệu thật, CORS/auth thật hoặc message WS nghiệp vụ trong lượt này.
- Các blocker simulator/WS đã ghi ở báo cáo cũ là thông tin lịch sử, không kết luận đã được sửa và cũng không coi fixture là bằng chứng lỗi BE mới.
- `git diff -- services/backend` rỗng. Không sửa backend code/.env/schema/dependency, không seed/simulator/migration, không sửa dữ liệu lịch sử, không thao tác ghi nghiệp vụ thật.

## File frontend chính

`src/design.css`, `src/components/ReferenceIcon.tsx`, `src/layouts/Shell.tsx`, `src/app/main.tsx`, `src/app/LiveProvider.tsx`, `src/features/dashboard/{Dashboard,Analytics}.tsx`, `src/features/live-map/{LiveMap,MapEditor,MapResize}.tsx`, `src/features/checkpoints/CheckpointJournal.tsx`, `src/features/races/{Races,SimulationPanel}.tsx`, `src/features/runners/{People,CreateStudent}.tsx`; scripts capture-latest-design, verify-latest-design, verify-qa-pages, verify-admin-current, verify-ui-polish, verify-enrollment và báo cáo này.

---

# Tinh chỉnh UI và QA các trang — 13/10/2026 (lịch sử)

## Phạm vi và kết luận

Đã sửa các lỗi frontend xác nhận được và kiểm tra giao diện bằng Playwright/Edge headless với API fixture cô lập. **Đây không phải E2E thao tác ghi với backend thật.** Giữ nguyên các thay đổi chưa commit có sẵn; không commit/push, không đổi dependency hoặc môi trường kết nối.

- HEAD local: `03f8ab2`. Frontend `http://localhost:5173` trả HTTP 200 khi kiểm tra ngoài sandbox; chỉ khởi động frontend.
- Kết nối production của FE vẫn là REST `http://localhost:8000/api/v1`, WS `ws://localhost:8000`, chế độ `api`.
- Backend `http://localhost:8000/health` không đáp ứng (lần kiểm tra ngoài sandbox cuối timeout 3 giây). Không khởi động/restart backend theo phạm vi được giao. **BLOCKED** việc xác minh lại hai race thật và WS nghiệp vụ.
- Mọi API trong harness mới đều bị interception trước điều hướng; request ghi không dự kiến nhận lỗi tại harness. WS được giữ trong fixture, không phát frame nghiệp vụ giả. Fixture chỉ nằm trong `scripts/fixtures`, không được import vào ứng dụng.
- **0 thao tác ghi nghiệp vụ thật; không chạy simulator, không sửa dữ liệu lịch sử. `git diff -- services/backend` rỗng.**

## Lỗi xác nhận và thay đổi

1. **Điều hướng giữa hai trang dài giữ vị trí cuộn cũ.** Từ map đã cuộn sang Tổng quan, tiêu đề có `y=-334.95`, header cao `68.05px`. Bổ sung `ScrollRestoration` theo pathname: trang mới bắt đầu đúng vị trí, truy vấn lọc/chọn runner không reset cuộn; lịch sử trình duyệt có phục hồi. Sau sửa tiêu đề ở `y=94.05`, dưới header. Không thêm margin bù cố định.
2. **GPS lặp timestamp dài và chưa tự biểu diễn tuổi mẫu.** `GpsTimestamp` dùng một timer chung, tự dọn khi không còn người dùng, hiển thị tuổi mẫu thực; tooltip/accessible label chứa ngày giờ theo múi giờ trình duyệt. Thiếu, không hợp lệ và tương lai không được gọi là GPS mới; phiên hoàn thành có “Vị trí cuối phiên”. Giữ nguyên timestamp chính xác trong lịch sử.
3. **Hai nhánh phân loại GPS khác nhau.** Hợp nhất phân loại khi normalize REST và khi cập nhật độ mới; mẫu tương lai không còn hiện ONLINE trước nhịp đồng bộ tiếp theo. Không thay tọa độ hay trạng thái run.
4. **Thông báo khóa tuyến thiếu ngữ cảnh.** Chỉ ánh xạ chính xác lý do “Đã tạo ít nhất một phiên chạy cho giải này.” sang “Tuyến đã khóa vì giải đã có phiên chạy.” Lý do khác giữ nguyên; thiếu/mâu thuẫn metadata vẫn khóa. Không suy ra mở khóa từ DRAFT/COMPLETED hoặc ACTIVE=0.
5. **Refetch chi tiết run lỗi xóa nội dung đang xem.** Giữ dữ liệu cùng run và hiển thị lỗi + Thử lại. Run khác không hiển thị dữ liệu run cũ. Bổ sung trạng thái lịch sử rỗng và nhãn “Độ mới GPS”, tránh gọi GPS mới là thiết bị trực tuyến.
6. **Toolbar bản đồ bị kéo cao khi mở Lớp bản đồ.** Căn giữa các điều khiển trong rule dùng chung; nhóm điều khiển khung nhìn riêng; nút fit dùng icon có tên/tooltip tiếng Việt. Bỏ link “Mở rộng bản đồ” trên chính `/live`; giữ link ở Tổng quan. Giữ route/marker, độ dài, chú giải, attribution và lỗi tile.
7. **Trang 404 dùng lời mô tả tính năng demo chưa triển khai.** Thay bằng đường dẫn không tồn tại và hướng dẫn trở về Tổng quan.

Đã kiểm tra z-index marker được chọn, cụm ba người trùng tọa độ, chọn từ popup → danh sách và bấm checkpoint không đổi runner. Không dịch marker và không cho kéo runner. UI thật vẫn dùng Leaflet; ảnh fixture cố tình chặn tile để kiểm tra lỗi nền, không thay bằng SVG.

## Inventory route và giao diện

Không tạo route giả theo prototype. Auth bảo vệ các route, key chỉ giữ trong bộ nhớ.

| Route thực tế | Nội dung / tương tác hiện có |
| --- | --- |
| `/` | Tổng quan, thẻ số liệu, tiến độ backend, map thu gọn, sự kiện gần nhất, thống kê mở rộng |
| `/live` | Map + danh sách GPS; tìm kiếm, trạng thái run/GPS, theo dõi, fit, lớp bản đồ, popup |
| `/races` | Danh sách, tìm/lọc, menu hàng, form tạo, xác nhận xóa; trạng thái mô phỏng gần nhất |
| `/races/:raceId` | Thiết lập giải; thông tin tuyến và cấu hình matching |
| `/runners?view=runs` (mặc định) | Phiên chạy; tìm/lọc, sắp xếp, số dòng, phân trang, cột phụ, drawer |
| `/runners?view=participants` | Đăng ký của giải; form đăng ký sinh viên và bib |
| `/runners?view=students` | Danh bạ toàn hệ thống, tìm và phân trang |
| `/runners/:studentId/runs/:runId` | Chi tiết độc lập; metrics, thông tin, vòng và lịch sử GPS/LAP |
| `/checkpoints?tab=attention` (mặc định) | Hàng đợi AMBIGUOUS, số đếm backend, modal chi tiết/CONFIRM/DISMISS |
| `/checkpoints?tab=journal` | Nhật ký, checkpoint/status/thời gian, áp dụng/xóa lọc, cursor trước/sau |
| `/checkpoints/:checkpointId` | Nhật ký theo checkpoint; dùng `?tab=journal` để mở đúng tab |
| `/checkpoints?tab=stations` | Trạm, tọa độ/bán kính, định danh mở rộng, modal đăng ký thiết bị |
| `/?edit=…` hoặc `/live?edit=route|checkpoint` | Editor tuyến/checkpoint, input/kéo/chọn điểm, undo/reset/save/cancel, cảnh báo draft |
| `/simulation` | Form tạo, tham số, theo dõi job, stop/retry, job lỗi/mất sau restart |
| `*` | Trang không tồn tại |

Các dialog hiện có: tạo giải, xóa giải, đăng ký sinh viên, đăng ký thiết bị, xác nhận checkpoint; drawer chi tiết run. Menu tài khoản/row actions, tabs, chọn cột và các khối chi tiết vẫn được giữ. Lịch sử run hiện **không có tab/phân trang UI riêng**; adapter tải các trang lịch sử API. Không thêm tính năng báo cáo, thiết bị online hay kết quả thi đấu chính thức theo dữ liệu prototype.

## Coverage matrix

Evidence `QA` = `test-results/qa-20261013/`; các ảnh đều là **FIXTURE**, không phải bằng chứng backend đang hoạt động. Kết quả các suite cũ dưới đây là các lần đã chạy lại trong lượt này.

| Page/flow | State tested | Real or fixture | Result | Evidence | Limitation |
| --- | --- | --- | --- | --- | --- |
| Auth | Key hợp lệ/401, inline error, route bảo vệ, logout xóa key, refresh yêu cầu đăng nhập | Fixture | PASS | QA `auth-invalid.png`, `interactions.json` | Không thử key thật |
| Các trang chính | 12 route/biến thể × 1440×900, 1366×768, 768×1024, 390×844; direct URL/auth, không tràn ngang trang | Fixture | PASS | QA `results.json`, ảnh tiền tố viewport | Bảng rộng cuộn cục bộ có chủ đích |
| Sidebar/history | Tất cả link chính, scope, active item, back/forward thiết lập↔checkpoint | Fixture | PASS | QA `interactions.json` | Không khẳng định mọi tổ hợp history của từng filter |
| Header/Tổng quan | Điều hướng từ map đã cuộn, tiêu đề/badge; không thêm khoảng trống bù | Fixture | PASS | QA `before-navigation-results.json`, `before-overview-navigation.png`, `overview-navigation-heading.png` | Trước sửa FAIL, sau sửa PASS |
| Header/menu | Trạng thái bình thường gọn, lỗi read/reconnect, tooltip/focus/Escape, menu không đổi chiều cao hàng | Fixture | PASS | `ui-after/report.json`, `verify-ui-polish.mjs` | Socket fixture chỉ kiểm tra vòng đời kết nối |
| Race directory | Tên dài, search rỗng, chọn giải, create validation/422/busy/unknown-result/cancel | Fixture | PASS | `verify-race-create.mjs`, `ui-after/long-name.png` | 3 POST được intercept, không tạo giải thật |
| Xóa giải | Xác nhận, ACTIVE vẫn cho gửi, 409, lost response/readback, cleanup cache/socket | Fixture | PASS | `current/admin-report.json`, `delete-confirm.png` | Không xóa dữ liệu thật |
| Tổng quan | Số liệu/order hiển thị từ snapshot, populated/empty và cảnh báo lỗi đọc | Fixture | PASS | QA `1440--.png`, `ui-after/report.json` | Không kiểm toán tính nhất quán số liệu backend hiện tại |
| Live map | GPS cuối phiên/thiếu/tương lai/tuổi tăng; cluster ×3, z-index, popup/list sync, checkpoint không chọn runner | Fixture | PASS | QA `map-selected-overlap.png`, `interactions.json` | Không phải GPS chuyển động thật |
| Live map controls | Fit route, theo dõi rồi pan dừng theo dõi, vị trí khung nhìn ổn định qua polling, tắt/bật layer | Fixture | PASS | QA `interactions.json` | Chờ Leaflet inertia xong trước so sánh; không kết luận WS delivery |
| Tile | Lỗi tile giữ tuyến/marker, cảnh báo gọn | Fixture | PASS | QA ảnh map | Tile thành công không kiểm tra lại lượt này; có bằng chứng ở E2E cũ |
| Sinh viên/đăng ký | Tìm debounce/stale cancellation, đổi race, conflict giữ form, UUID và bib 01/blank | Fixture | PASS | `current/enrollment-report.json`, `participants-768.png` | 2 POST intercept |
| Run drawer/detail | Đúng ID/metrics, duration COMPLETED 00:02:10 không tăng; empty history, background 503 giữ nội dung, Escape | Fixture | PASS | QA `drawer-background-error.png`, `session-direct.png` | Không có tab/phân trang lịch sử UI để kiểm tra |
| Setup/editor | CUSTOM/metadata; input/drag/pick/radius, cancel/undo, required anchors, PATCH/PUT, 422/409/ambiguous 500/readback, draft chống refetch | Fixture + unit | PASS | `verify-map-editor.mjs`, `mapEditorService.test.ts` | 4 write intercept; không E2E save thật |
| Matching config | Read-before-edit, PATCH lỗi giữ draft, thành công refetch; metadata khóa | Fixture + unit | PASS | `current/admin-report.json`, `matching.png` | Chưa mô phỏng mọi mã conflict cấu hình |
| Checkpoint review | Không tự chọn gần nhất, pending candidates bị khóa, reason bắt buộc, CONFIRM 409/version/passage/idempotency, DISMISS null passage | Fixture | PASS | QA `interactions.json`, `resolve-conflict-recovered.png` | Không xác nhận vòng thật |
| Checkpoint journal | Route checkpoint, select theo ID thực của fixture, cursor next/previous, empty, clear filter | Fixture | PASS | QA `interactions.json` | Không thử mọi khoảng ngày/múi giờ biên |
| Device dialog | Payload đăng ký, thông báo không chứng minh online, modal 390px | Fixture | PASS | QA `device-dialog.png`, `device-dialog-390.png` | Không đăng ký thiết bị thật; chưa thử mọi lỗi field |
| Simulation | Gap=0, một POST/start, job↔race, stop/readback, terminal cleanup, 404 restart và unknown-result không retry mù | Fixture | PASS | `current/admin-report.json` | Không tạo simulation thật; không chạy script E2E cũ |
| Not found | Direct URL, thông báo/đường về tổng quan, responsive | Fixture | PASS | QA `1440--not-a-page.png` | — |
| Zoom | Viewport CSS tương đương 125%, không overflow | Fixture | PASS | `ui-after/scale125.png` | **Xấp xỉ**, không phải browser zoom thật |
| Hai race đã ghi ở E2E trước | Xác minh tồn tại và dữ liệu đọc mới | Real | BLOCKED | Health 8000 không phản hồi | Không tái tạo race hoặc restart BE |
| WS nghiệp vụ / Arduino | Delivery, correlation và COUNTED thật | Real | BLOCKED | Kết quả E2E cũ và source hiện tại | Không dùng REST/fixture làm bằng chứng WS |
| Toàn bộ tích Descartes trạng thái × page × viewport | Mọi 401/403/404/409/422/5xx, latency và accessibility screen reader trên từng control | Fixture/real | NOT TESTED | Phạm vi từng dòng ở trên | Không tuyên bố “mọi chức năng đều hoạt động” |

## Lệnh đã thực thi

Trong `apps/admin-web`:

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm test`: **42/42 PASS**, 9 file. Test mẫu GPS tương lai ban đầu phát hiện nhánh normalize chưa dùng cùng logic; đã sửa và chạy lại đạt.
- `npm run build`: PASS; cảnh báo chunk JS khoảng **614 kB**, tách khỏi lỗi chức năng, không nâng dependency/đổi kiến trúc để che cảnh báo.
- `node scripts/verify-ui-polish.mjs`: PASS, 0 mutation.
- `node scripts/verify-map-editor.mjs`: PASS, 4 intercepted writes.
- `node scripts/verify-enrollment.mjs`: PASS, 2 intercepted writes.
- `node scripts/verify-race-create.mjs`: PASS, 3 intercepted writes. Đã sửa assertion lỗi thời tìm selector toàn cục trên trang danh sách; giờ kiểm tra hàng “Đang xem”.
- `node scripts/verify-admin-current.mjs`: PASS, 9 intercepted writes.
- `node scripts/verify-qa-pages.mjs`: bộ inventory/ảnh; `QA_INTERACTIONS_ONLY=1 node scripts/verify-qa-pages.mjs`: chạy riêng hồi quy tương tác sau sửa. `results.json` / `interactions.json` ghi từng check và body các write fixture (không có key).
- `git diff --check`: không lỗi whitespace. Có warning LF/CRLF của workspace, không phải lỗi test.

Không có `pageerror` trong các lần browser suite đạt. HTTP 401/409/503 và tile bị abort là lỗi được chủ động tạo trong fixture để kiểm tra UI, không báo thành lỗi backend. Những lần harness chưa đạt vì selector cũ, animation popup/inertia hoặc HMR mất auth đã được phân biệt với lỗi sản phẩm; chỉ dùng kết quả chạy lại thành công trong coverage.

## File frontend thay đổi trong lượt này

| File (tương đối với apps/admin-web) | Mục đích |
| --- | --- |
| `src/layouts/Shell.tsx` | Phục hồi vị trí cuộn theo route |
| `src/app/main.tsx` | Nội dung trang không tồn tại |
| `src/components/GpsTimestamp.tsx`, `src/utils/gpsTime.ts` | Đồng hồ GPS chung và định dạng tuổi mẫu |
| `src/features/live-map/WatchList.tsx`, `LiveMap.tsx` | Nhãn GPS, toolbar, bỏ mở rộng trùng lặp |
| `src/design.css` | Rule toolbar chung, nhóm view controls và kích thước nút |
| `src/features/runners/RunDetail.tsx` | Giữ dữ liệu khi refetch lỗi, empty history, nhãn độ mới GPS |
| `src/services/contract.ts`, `mapEditorService.ts` | Phân loại mẫu tương lai nhất quán, giải thích đúng lý do khóa |
| `src/utils/gpsTime.test.ts`, `src/services/apiAdapter.test.ts`, `mapEditorService.test.ts` | Hồi quy tuổi GPS, tương lai và lý do khóa |
| `scripts/verify-qa-pages.mjs`, `scripts/fixtures/qa-dashboard.json` | Harness đa trang với snapshot mô phỏng đã ghi từ trước, không truy cập DB |
| `scripts/verify-race-create.mjs` | Assertion phù hợp header/list hiện tại |
| `INTEGRATION_REPORT.md` | Bàn giao lượt này; giữ nguyên báo cáo cũ phía dưới |

Không nhận các thay đổi dirty có sẵn ở những file khác là công việc mới của lượt này. Không sửa URL, auth flow, REST/WS contract, cadence polling, schema, locking rule, simulator hoặc database.

## Ảnh đối chiếu và ảnh trang

- Header trước/sau: [trước](test-results/qa-20261013/before-overview-navigation.png) · [sau](test-results/qa-20261013/overview-navigation-heading.png). Số đo lỗi nằm trong `before-navigation-results.json`.
- [Tổng quan](test-results/qa-20261013/1440--.png) · [Bản đồ](test-results/qa-20261013/1440--live.png) · [Giải chạy](test-results/qa-20261013/1440--races.png) · [Sinh viên/phiên](test-results/qa-20261013/1440--runners.png).
- [Đăng ký](test-results/qa-20261013/1440--runners-view-participants.png) · [Danh bạ](test-results/qa-20261013/1440--runners-view-students.png) · [Checkpoint](test-results/qa-20261013/1440--checkpoints.png) · [Trạm](test-results/qa-20261013/1440--checkpoints-tab-stations.png) · [Mô phỏng](test-results/qa-20261013/1440--simulation.png).
- [Drawer lỗi nền](test-results/qa-20261013/drawer-background-error.png) · [Tablet map](test-results/qa-20261013/768--live.png) · [390px](test-results/qa-20261013/390--races.png) · [Modal 390px](test-results/qa-20261013/device-dialog-390.png).
- Reference đã đọc tại `E:\Hocccc\Project\Admin Dashboard for NEU RUN`; ảnh reference cũ ở `test-results/design-reference`. Giữ kích thước chữ dễ đọc lớn hơn prototype, Leaflet thật và sidebar icon ở điện thoại; không sao chép timer/demo/auth giả, không thêm tính năng thiếu contract.

Ảnh và kết quả test nằm trong `test-results` được Git ignore; có trên workspace hiện tại, không tự đưa tất cả artifact vào commit.

## Backend còn chặn và giới hạn

- Source `services/backend/app/simulator.py` vẫn gửi `gateway_device_ids[-1]` cùng checkpoint đầu ở nhánh Arduino (khoảng dòng 317–329). Đây vẫn là đoạn code gây mismatch đã ghi trong E2E trước; **không chạy lại simulator** để xác nhận runtime mới.
- `EventHub.publish` trong `app/main.py` vẫn `socket.send_json(payload)` rồi bỏ subscriber khi exception; đường payload run có datetime đã được chứng minh ở báo cáo E2E cũ. Không có bằng chứng sửa trong source được kiểm tra, không tuyên bố WS nghiệp vụ đã hoạt động.
- Chưa thể xác minh lại race `ee363ab4-632d-4fae-abb7-3887b1f8c587` và `4a650caa-7c34-4ed1-9d00-d1974a90f8c8` do backend không phản hồi. Snapshot cũ dùng làm seed fixture **không chứng minh hai race hiện còn tồn tại**.
- Lịch sử run hiện tải đầy đủ, chưa có phân trang/tab UI; thiết bị chưa có API danh sách/online được frontend xác minh. Không phát minh dữ liệu hay control giả để bù thiếu.

---

# Kiểm thử E2E thật sau redesign — 12–13/10/2026

## Kết luận

**GPS_ONLY: PASS luồng REST/nghiệp vụ và hoàn thành tự nhiên; FAIL phát message WebSocket. GPS_AND_ARDUINO: FAIL tại simulator/backend với HTTP 422 DEVICE_CHECKPOINT_MISMATCH; các bước correlation/COUNTED và hoàn thành bị BLOCKED.** Không diễn giải job terminal thành runner thành công.

Đã thực hiện đúng **2 POST tạo simulation** qua frontend, không tạo job thay thế. Không dùng response thành công giả hoặc frame WebSocket giả. Các kiểm thử sau khi tạo chỉ đọc. Dữ liệu test giữ lại; không dừng job nào vì cả hai đã tự kết thúc (một thành công, một lỗi).

## Preflight và phạm vi

- Source HEAD `03f8ab2`, giữ nguyên workspace dirty từ lượt trước. Đọc phần báo cáo mới nhất, hướng dẫn và scripts; scripts fixture cũ không dùng để kết luận E2E thật.
- FE `http://localhost:5173`; `VITE_DATA_MODE=api`, REST `http://localhost:8000/api/v1`, WS `ws://localhost:8000`. `/health` trả `status=ok`; OpenAPI `SimulationStartIn` đã đối chiếu runtime.
- Cấu hình backend hiện có là SQLite `running_demo.db`, simulator nhắm loopback. Tái sử dụng tiến trình; không start/restart backend. Không in/copy key vào report, screenshot, URL bằng chứng hoặc trace. Không mở tracing.
- Admin API hỗ trợ mode, seed, interval, departure gap; **không hỗ trợ tên job/race hoặc chọn số người/số vòng**. Source `main.py:945` cố định 5 người/4 vòng. Vì vậy không thêm tiền tố E2E bằng API khác; lưu ID ngay khi nhận được.
- Baseline 4 race, sau kiểm thử 6 race; mọi ID baseline còn nguyên. Chỉ baseline danh sách race, không khẳng định kiểm toán bất biến toàn bộ từng hàng database.
- Timeout mỗi job 360 giây: tuyến 425m, pace khoảng 13m/s, 4 vòng khoảng 130 giây, departure tối đa 32 giây và phần dư cho API/matching. Không phải giảm ngưỡng vòng để tăng tốc.

## Job và tài nguyên tạo mới

| Kịch bản | Simulation ID | Race ID | Tham số thực gửi | Kết quả job / race |
|---|---|---|---|---|
| GPS_ONLY | `3f8d99a4-5212-4194-bff9-149730a9ed78` | `ee363ab4-632d-4fae-abb7-3887b1f8c587` | seed=42, interval_seconds=0.5, runner_start_gap_seconds=0; 5 người/4 vòng mặc định BE | COMPLETED (exit 0) / COMPLETED |
| GPS_AND_ARDUINO | `9b354cad-6426-4f37-a4c5-9c4faf38a6ec` | `4a650caa-7c34-4ed1-9d00-d1974a90f8c8` | seed=42, interval_seconds=0.5, runner_start_gap_seconds=8; 5 người/4 vòng mặc định BE | FAILED (exit 1) / LIVE |

Mỗi giải: 5 student, 5 đăng ký/bib, 5 wearable ID, 5 run ID, 4 checkpoint, route 9 điểm. Job Arduino còn đăng ký 4 Gateway device; ID/mapping của chúng được ghi theo quy tắc đặt tên/đăng ký đã đọc trong simulator, không giả vờ đã GET danh sách device (không có endpoint đó trong contract đã kiểm tra). GPS/history phát sinh được lưu qua API phân trang đầy đủ.

Danh mục tài nguyên: [GPS resources](test-results/real-e2e-20261012/GPS_ONLY-resources.json), [Arduino resources](test-results/real-e2e-20261012/GPS_AND_ARDUINO-resources.json). [Ledger](test-results/real-e2e-20261012/ledger.json) chứa thời điểm, payload, job response, race ID, kết quả. Không có job nào do task yêu cầu stop.

## Ma trận nghiệm thu

| Kiểm tra | GPS_ONLY | GPS_AND_ARDUINO |
|---|---|---|
| Một lần bấm tạo → một POST/job, race xuất hiện/mở không reload trang | PASS | PASS |
| Người tham gia, bib 01, route/checkpoint từ backend | PASS | PASS |
| GPS di chuyển từ nhiều mẫu; tổng bước/quãng đường không giảm | PASS: 13 vị trí khác nhau/người | PASS cho 4 người đã nhận mẫu; người thứ 5 chưa có GPS khi job lỗi |
| Cập nhật không bấm refresh bằng REST nền | PASS | PASS trong thời gian job chạy |
| Message nghiệp vụ WS thật | FAIL: 0 | FAIL: 0 |
| Reconnect chỉ một business socket, REST resync; pan không bị kéo lại | PASS | PASS |
| Chọn người/list-marker; marker không draggable; editor khóa | PASS sau sửa z-index | PASS sau sửa z-index |
| Layout 1366×768 / tablet 768×1024 | PASS: không tràn ngang toàn trang | PASS: không tràn ngang toàn trang |
| Target vòng, COMPLETED tự nhiên, lịch sử tương ứng | PASS: 5/5 người, mỗi người 4 vòng, tổng 20 | FAIL: 0/5 hoàn thành, mỗi người 0 vòng |
| Duration frozen sau >=10s và refresh | PASS | NOT TESTED: không có run hoàn thành |
| MATCHED tách COUNTED, event correlation/lap accepted | Không áp dụng | BLOCKED: Gateway POST 422, không tạo event |
| AMBIGUOUS/candidates và review UI với dữ liệu thật | Không áp dụng | NOT TESTED: không có event AMBIGUOUS |

GPS đầu vòng tại checkpoint LAP NEU-C01 theo route/source. Mẫu của run `e16c0627-3b50-49c2-9ffd-6c0f723ffd72` (UTC):

| Thời điểm lấy mẫu | Vĩ độ | Kinh độ | Bước | Quãng đường m | Vòng |
|---|---:|---:|---:|---:|---:|
| 16:37:29.831 | 20.99959893337945 | 105.84249576576174 | 348 | 231.42 | 0 |
| 16:37:39.901 | 21.000308197513284 | 105.8420506874675 | 542 | 359.87 | 0 |
| 16:37:49.972 | 21.000322911809743 | 105.84318804062985 | 736 | 488.63 | 1 |

Tất cả 5 run GPS có 4 LAP trong lịch sử phân trang, khớp dashboard; đối soát bảng/drawer cho runner đầu mỗi giải cũng khớp API. Duration GPS theo bib 01–05: **130, 132, 131, 129, 133 giây**, giữ nguyên ở lần lấy lại sau 11 giây và refresh. Không phát hiện nhân đôi số vòng/bước/quãng đường trên các mẫu kiểm tra; không khẳng định audit từng phép tích phân GPS.

## WebSocket: kết quả riêng với REST

Hai kịch bản đều có socket business mở; bỏ socket Vite HMR khỏi đếm. Đóng socket browser đúng một lần mỗi kịch bản, tự reconnect và trở lại một socket. REST tiếp tục đồng bộ và vị trí thay đổi.

Trong cửa sổ cô lập: chặn GET nền `/live`, `/dashboard`, `/runners` ở browser (abort, không trả dữ liệu giả), giữ WS mở; chờ request đang chạy kết thúc rồi so sánh panel trong 7 giây. Panel không đổi, **0 frame nghiệp vụ** ở cả hai kịch bản. Sau đó trả lại REST bình thường ngay. Tổng WS message quan sát toàn kịch bản cũng **0**, nên danh sách event type và ví dụ thực là rỗng, không thể xác nhận cập nhật UI do WS.

Bằng chứng: [GPS isolation](test-results/real-e2e-20261012/GPS_ONLY-ws-isolation.json), [Arduino isolation](test-results/real-e2e-20261012/GPS_AND_ARDUINO-ws-isolation.json), [messages](test-results/real-e2e-20261012/messages.json). `blockedBackgroundReads` ở Arduino là bộ đếm tích lũy 22, gồm 12 của GPS; không phải 22 lần riêng Arduino.

## Backend feedback có thể tái hiện (không sửa BE)

### BE-01 — Simulator gửi sai thiết bị cho checkpoint LAP

**FAIL, backend/simulator defect.** Mở Mô phỏng → GPS kết hợp Arduino → gap=8, seed=42, interval=0.5 → chạy. Job ở trên lỗi tại lần gửi Gateway đầu tiên, khoảng 30 giây, log:

`POST /api/v1/checkpoint-events → 422 DEVICE_CHECKPOINT_MISMATCH`, trace ID `f92a76f3-d592-4342-98b7-016aa5f54750`.

Source `services/backend/app/simulator.py:157–167` đăng ký từng device theo thứ tự C01..C04; `:320–329` lọc crossing LAP C01 nhưng gửi `gateway_device_ids[-1]` (device C04) cùng `finish_cp["checkpoint_id"]` (C01). Runtime xác nhận checkpoint LAP C01=`23181325-5334-4c8d-b9e8-dabac4771f4b`, C04=`0e2ee36a-73a0-4fdb-a92f-ebba09518125`. `main.py:1534` từ chối mapping không khớp là đúng contract; lỗi nằm ở simulator tạo request.

Ảnh hưởng: job FAILED, race vẫn LIVE, 5 run ACTIVE/0 vòng, checkpoint-events rỗng. Đây là dữ liệu **mới do task tạo**, không gắn nhãn legacy. Không stop thêm, không hoàn thành thủ công, không sửa device mapping. GPS đi qua tuyến không tự làm tăng vòng trong kịch bản kết hợp; vì API chưa có dữ liệu passage độc lập trong các response đã thu, chưa kết luận đầy đủ vòng đời passage/matching chỉ từ 0 lap.

Bằng chứng: [job log](test-results/real-e2e-20261012/GPS_AND_ARDUINO-job.json), [events rỗng](test-results/real-e2e-20261012/GPS_AND_ARDUINO-events.json), [samples](test-results/real-e2e-20261012/GPS_AND_ARDUINO-samples.json).

### BE-02 — Socket kết nối nhưng subscriber bị loại khi serialize datetime

**FAIL delivery; backend source defect được tái hiện cô lập.** Runtime có nhiều cập nhật GPS thật nhưng nhận 0 frame; REST vẫn chạy. `main.py:1344` trả `started_at`, `last_seen_at`, wearable timestamp là datetime trong `run_dict`; `:1518` chuyển nguyên dict cho hub. `EventHub.publish` ở `:495–504` gọi `socket.send_json(payload)`, bắt mọi exception và loại socket khỏi tập subscribers nhưng không đóng socket.

Đã trích đúng class EventHub bằng AST và thử serialize payload chứa datetime (không import app/startup, không DB, không network/frame giả): `TypeError: Object of type datetime is not JSON serializable`; sau publish, số subscriber còn **0**. Điều này giải thích vì sao browser vẫn thấy connected nhưng không nhận cập nhật. Cần BE chuẩn hóa JSON-compatible payload và xem lại báo lỗi/xóa subscriber; FE không thể sửa việc server không phát message.

Bằng chứng: [source diagnostic](test-results/real-e2e-20261012/ws-source-diagnostic.json). Đây là kiểm tra source cô lập hỗ trợ chẩn đoán; không trình bày nó như một frame WS thật.

## Frontend fix và hồi quy

**FE-01:** khi nhiều marker đứng gần nhau, marker được chọn có viền highlight nhưng bị marker khác che số báo danh. Quan sát ở GPS real, chọn 01 nhưng 05 nằm phía trên. Sửa `src/features/live-map/LiveMap.tsx`: `zIndexOffset={chosen ? 1000 : 0}`. Không đổi tọa độ, icon group count hay dữ liệu GPS.

`verify-real-followup.mjs` dùng hai race thật để kiểm tra marker selected có z-index ưu tiên, không có class draggable, chọn marker giữ hàng selected, bảng/drawer hiển thị bib và vòng từ API. PASS. Thu đầy đủ GPS/LAP qua mọi trang API events để đối chiếu số vòng.

File mới: `scripts/verify-real-simulations.mjs`, `scripts/verify-real-followup.mjs`; cập nhật report này. Script simulation chặn mutation ngoài auth/tạo simulation, giới hạn 2 lần gửi, từ chối chạy lại khi ledger đã có job. **Không chạy lại script tạo job để kiểm tra lại UI; dùng script follow-up chỉ đọc.**

Sau fix: `npm run lint`, `npm run typecheck`, `npm test` **37/37**, `npm run build` PASS. Vẫn có cảnh báo bundle JS >500 kB (~609 kB). Không sửa backend để làm bài kiểm thử xanh.

## Tile và ảnh thực tế

Trong lượt E2E này tile tải được, không có tile request failure/HTTP error được ghi nhận. Follow-up thu HTTP **200**, ví dụ `https://a.tile.openstreetmap.org/18/208142/115426.png`; không console error. Cấu hình vẫn `{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`; không đổi provider/key. Lỗi tile của lượt trước không tái hiện, không có bằng chứng lỗi backend.

- [GPS đang chạy, dữ liệu/tile thật](test-results/real-e2e-20261012/GPS_ONLY-live-1366.png)
- [GPS tablet](test-results/real-e2e-20261012/GPS_ONLY-live-768.png)
- [GPS tổng quan hoàn thành](test-results/real-e2e-20261012/GPS_ONLY-overview-final.png)
- [Marker sau fix](test-results/real-e2e-20261012/GPS_ONLY-selection-fixed.png)
- [Drawer/lịch sử GPS](test-results/real-e2e-20261012/GPS_ONLY-detail-final.png)
- [Arduino đang chạy](test-results/real-e2e-20261012/GPS_AND_ARDUINO-live-1366.png)
- [Arduino sau lỗi](test-results/real-e2e-20261012/GPS_AND_ARDUINO-overview-final.png)
- [Kết quả máy đọc](test-results/real-e2e-20261012/results.json), [histories/UI/tile evidence](test-results/real-e2e-20261012/followup.json), [browser POST audit](test-results/real-e2e-20261012/browser.json).

**Gateway là mô phỏng, không phải kiểm thử Arduino vật lý. Manual resolve, xóa, stop job và các mutation khác không thực thi trong lượt này vẫn NOT TESTED. Backend source/.env/schema không thay đổi; không cố ý thay đổi dữ liệu nghiệp vụ có sẵn. Tất cả dữ liệu test mới được giữ lại; không commit/push.**

---

# Áp dụng thiết kế tham chiếu NEU RUN — 12/10/2026

## Phạm vi và nguồn thiết kế

Đã chuyển thiết kế từ `E:/Hocccc/Project/Admin Dashboard for NEU RUN` vào ứng dụng hiện có, không thay thế ứng dụng bằng prototype. Đọc cấu trúc, package, CSS, App.tsx và hướng dẫn của reference. Prototype có dữ liệu cứng, SVG minh họa, xác thực/state mô phỏng; các phần này chỉ dùng trong công cụ chụp reference dưới `test-results`, không import vào source vận hành.

Repo ở `03f8ab2`, workspace đã có thay đổi chưa commit khi bắt đầu lượt này. Giữ nguyên thay đổi có sẵn, bao gồm tài liệu `docs/BAO_CAO_BACKEND_VA_CHUC_NANG_HE_THONG.md`. Không pull/merge/commit/push. Không sửa package, lockfile, môi trường frontend hoặc backend.

Runtime kiểm tra: frontend `http://localhost:5173`, REST `http://localhost:8000/api/v1`, WS cổng 8000. Tái sử dụng tiến trình đang chạy, không khởi động/dừng backend. Commit trên là HEAD source, không khẳng định là revision tiến trình backend chỉ từ số cổng.

## Các màn hình đã áp dụng

- **Thiết kế chung:** Inter với font dự phòng, nền #f5f7fb, xanh #2563eb, viền #e2e8f0; card radius 12px, nút 40px, số tabular, trạng thái dạng pill, tiêu đề 24–28px. Một lớp `design.css` dùng chung cho bảng, form, tabs, menu, editor và trạng thái thiếu dữ liệu. Không dùng zoom/scale toàn trang.
- **Sidebar/header:** sidebar 236px, nhóm quản lý chung và nhóm chức năng của giải, icon hiện có; thu gọn 72px/tablet. Header 68px với race selector gọn, refresh có tooltip, tài khoản. Không hiển thị connected/timestamp thường trực. Mục Thiết lập giải mở trang chi tiết giải đang chọn; mục Mô phỏng mở `/simulation`, dùng lại SimulationPanel đã nối API.
- **Tổng quan:** bốn thẻ icon màu bên trái và số liệu thật bên phải, tỉ lệ map/việc cần chú ý 2:1, bảng tiến độ và sự kiện 1.55:1. Nhãn “Tiến độ nổi bật” nói rõ không phải kết quả thi đấu chính thức, giữ thứ tự backend.
- **Giải chạy:** bảng, tìm kiếm, selected row, status, Eye/menu ba chấm giữ chức năng. Form tạo giải là dialog giữa màn hình, các input theo grid hai cột, reflow một cột ở màn hẹp; payload/validation hiện có được giữ.
- **Bản đồ trực tiếp:** panel người chạy bên trái ở laptop, xuống dưới ở tablet. Giữ Leaflet, tọa độ, polyline, attribution, lỗi tile. Thanh công cụ và chú giải mới; checkpoint tròn hiển thị mã đã escape; marker đang chọn có vòng nét đứt. Thao tác fit cho phép zoom đến 19 để tuyến nhỏ có kích thước hữu ích; vẫn chỉ fit khi được yêu cầu/mở map. Thông tin người được chọn dùng số vòng, thời gian, quãng đường, GPS/source từ state và link chi tiết thật. Không kéo/sửa GPS người chạy.
- **Sinh viên/đăng ký:** tabs gạch chân, bảng/nhãn dễ đọc, nút Eye có tên truy cập theo sinh viên. Drawer chi tiết nằm bên phải, metrics hai cột, phần thông tin một cột đủ rộng. Escape, focus restoration và bộ lọc được giữ; bib “01” không bị đổi.
- **Thiết lập/editor/matching:** áp dụng controls, khoảng cách, fieldset, thanh thao tác chung; không thay schema, validation, draft, undo, khóa hay xử lý lỗi lưu.
- **Trạm kiểm soát/mô phỏng:** tabs, bảng sự kiện và trạng thái, form đăng ký/confirm và màn theo dõi mô phỏng dùng cùng hệ thiết kế. Luồng đối chiếu và tính vòng vẫn tách biệt. `/simulation` là lối truy cập thêm đến component nghiệp vụ hiện có, không tạo giả trạng thái/job.

## File thay đổi trong lượt áp dụng reference

- Mới: `src/design.css`, `scripts/capture-design-reference.mjs`, `scripts/verify-design-readonly.mjs`.
- Source: `src/app/main.tsx`, `src/layouts/Shell.tsx`, `src/components/Modal.tsx`, `src/features/dashboard/Dashboard.tsx`, `src/features/live-map/LiveMap.tsx`, `src/features/runners/People.tsx`, `src/features/runners/RunnerTable.tsx`, `src/features/races/CreateRace.tsx`, `src/features/checkpoints/Checkpoints.tsx`.
- Kiểm thử/tài liệu: cập nhật locator/viewport trong `scripts/verify-ui-polish.mjs`, locator trong `scripts/verify-ux-readonly.mjs`, report này.
- Các thay đổi khác trong Git status, gồm LiveProvider, liveService, styles.css và editor, đã có trước lượt này; không ghi đè hoặc hoàn tác chúng.

## Tích hợp và kiểm thử

Giữ nguyên admin-key trong bộ nhớ, URL/env, client, request cancellation, cache theo race, REST/WS reconciliation, đồng bộ nền 1 giây, simulation tracking, cleanup/restart, matching expected_version/idempotency/conflict, khóa editor, đăng ký, xóa và frozen duration. Không thêm dependency.

Đã chạy:

- `npm run lint`, `npm run typecheck`, `npm test`: đạt; **37 test / 8 file**.
- `npm run build`: đạt, còn cảnh báo bundle JS >500 kB (khoảng 609 kB); không đổi cấu trúc bundle trong nhiệm vụ thiết kế.
- `verify-ui-polish.mjs`: đạt empty/error/recovery/reconnect, tên dài, menu bàn phím/Escape/focus, không thay chiều cao hàng khi mở menu, 1440×900/1366×768/768×1024; không request ghi.
- `verify-map-editor.mjs`: đạt draft/drag/input/hủy, payload PATCH/PUT và neo, 422/409, reread sau mất response, thay đổi nền không xóa draft. **4 request ghi bị intercept**, không ghi thật.
- `verify-admin-current.mjs`: đạt matching, mô phỏng/restart/stop, xóa/conflict/cleanup. **9 request ghi bị intercept**, không chạy simulator thật.
- `verify-enrollment.mjs`: đạt tìm kiếm/cancel, bib, conflict, đổi race và reflow. **2 request ghi bị intercept**, không đăng ký thật.
- `verify-design-readonly.mjs`: đăng nhập backend thật, đọc dashboard/live/runners/chi tiết phiên/events/checkpoint-matching, xem các màn hình và ảnh ở ba viewport nêu trên. Chọn runner cập nhật panel; thời gian hàng COMPLETED giữ nguyên qua refresh nền; dialog/drawer Escape trả focus. Form dùng đủ chiều ngang, toàn trang không tràn ngang. Pan bản đồ giữ nguyên qua đồng bộ nền; đóng kết nối để kiểm tra reconnect trở lại đúng một socket, logout đóng socket. Request nghiệp vụ ghi bị chặn, **0 lần ghi**.

Bài cũ `verify-ux-readonly.mjs` dừng với `No existing completed race for readonly validation`: precondition yêu cầu vừa có runner hoàn thành vừa có sự kiện checkpoint. Runtime có một giải với 5 runner hoàn thành nhưng không có sự kiện checkpoint, nên đã dùng bài chỉ đọc mới để kiểm tra duration/drawer riêng. Đây là thiếu dữ liệu kiểm thử, không phải kết luận lỗi backend.

## Ảnh đối chiếu

Ảnh lưu local trong thư mục `test-results` đang được Git ignore; không đưa mock/reference bundle vào bản build vận hành.

- Trước: [Tổng quan 1366](test-results/design-before/dashboard-1366.png), [Giải chạy 1366](test-results/design-before/races-1366.png). Các ảnh trước là fixture của lượt UI trước đó, không dùng để so sánh số liệu nghiệp vụ.
- Mẫu: [Tổng quan](test-results/design-reference/overview-1440.png), [Bản đồ SVG mẫu](test-results/design-reference/map-1440.png).
- Sau, dữ liệu thật: [Tổng quan 1440](test-results/design-live/overview-1440.png), [Map 1366](test-results/design-live/map-1366.png), [Map tablet](test-results/design-live/map-768.png), [Giải chạy tablet](test-results/design-live/races-768.png), [Form tạo giải](test-results/design-live/create-dialog.png), [Drawer](test-results/design-live/runner-drawer.png), [Sinh viên](test-results/design-live/students.png), [Trạm](test-results/design-live/checkpoints.png), [Thiết lập](test-results/design-live/setup.png), [Mô phỏng](test-results/design-live/simulation.png).
- Editor cô lập: [Tuyến](test-results/ux/editor-route-1440-isolated.png), [Checkpoint](test-results/ux/editor-checkpoint-isolated.png).
- Kết quả có cấu trúc: [real reads](test-results/design-live/report.json), [UI fixture](test-results/ui-after/report.json), [editor fixture](test-results/ux/editor-isolated-report.json).

## Khác biệt còn lại / giới hạn

- Bản đồ thực dùng tuyến/GPS backend, không oval SVG mẫu; panel chi tiết nằm dưới map để không che route. Tile provider không tải được trong trình duyệt kiểm tra; thông báo lỗi nền hiện đúng, marker/tuyến vẫn hoạt động. Không quy lỗi này cho backend.
- Bảng, font/nhãn có kích thước lớn hơn một số chữ 9–11px của prototype để đảm bảo đọc được. Form giữ mọi field mà API hiện hỗ trợ, nên dài hơn mẫu. Drawer 570px để chứa lịch sử/định danh thật.
- Không sao chép các số liệu minh họa, biểu đồ/tiến độ giả, nhãn hồ sơ “đầy đủ”, thiết bị “online”, xác thực giả hoặc nút prototype chưa có luồng API được xác minh. Chưa bổ sung luồng tạo/sửa hồ sơ sinh viên hoặc thiết bị chỉ vì chúng có trong prototype; các tính năng hiện có vẫn hoạt động.
- Chỉ có **1 race thực** nên không kiểm thử đổi race thật trong lượt này; đổi race/cache/cancel đã kiểm tra bằng fixture. Không có checkpoint event thật để kiểm thử thao tác confirm thực. WebSocket kết nối nhưng **0 message nghiệp vụ** trong thời gian kiểm tra.
- Không E2E thao tác lưu/tạo/xóa thật; mọi kiểm thử mutation là intercept. Không tạo/stop/delete race/job, seed hay chạy simulator.
- Không phát hiện lỗi backend mới được xác nhận từ các API chỉ đọc đã kiểm tra.

**Không sửa file backend, .env backend, schema hoặc database; không sửa dữ liệu lịch sử; không commit/push.**

---

## Lịch sử báo cáo trước lượt áp dụng reference

# Hoàn thiện UI/UX NEU RUN — 12/10/2026

## Phạm vi và runtime

Source bắt đầu sạch ở nhánh fe, commit `03f8ab2`. Chỉ sửa frontend/tài liệu FE, không commit/push. Khi kiểm tra, Vite 5173 và backend 8000/8001 đều tắt. Đã khởi động lại Vite tại `http://localhost:5173`; giữ nguyên REST/WS cấu hình 8000, không khởi động/dừng hoặc đổi backend. Vì vậy **chưa kiểm tra API thật trong lượt này**. Giao diện trước/sau và kiểm thử trình duyệt dưới đây dùng fixture API cô lập; không đưa fixture vào ứng dụng vận hành.

## Giao diện và hành vi

- Header: bỏ trạng thái connected/timestamp thường trực; icon Refresh có accessible label và tooltip cả hover/focus, trạng thái đang tải/chặn bấm lặp. Trang toàn bộ giải ẩn selector theo race và ghi rõ phạm vi toàn cục. Menu quản trị vẫn giữ đăng xuất và thông tin kỹ thuật.
- Cảnh báo kết nối/tải: thông báo màu nhẹ theo tác động, nói rõ dữ liệu cũ, có Thử lại. Không toast liên tục. Chỉ xóa lỗi đọc khi REST đồng bộ thành công: trước đây tick render snapshot cũ có thể xóa lỗi quá sớm. Refresh chờ request đang chạy, không làm trắng trang; giữ đồng bộ nền 1 giây và cleanup/reconcile.
- Dashboard: layout grid với gap 24px giữa các khối, không ép card cùng chiều cao; số liệu nổi bật, bỏ bốn câu “Xem danh sách”. Thẻ Người tham gia đi đúng tab đăng ký; các thẻ trạng thái giữ query filter. Top 5 giữ nguyên thứ tự backend, bỏ câu triển khai; empty state ngắn. Mục cần chú ý chỉ hiển thị số dương; thiếu dữ liệu/lỗi không coi là không có vấn đề, chưa có tuyến vẫn cảnh báo. Thời gian sự kiện tương đối từ occurred_at, tooltip thời gian chính xác.
- Giải chạy: tên giải là liên kết giữ chọn race/điều hướng; icon Eye và menu ba chấm cùng hàng. Menu absolute không đổi chiều cao hàng, focus vào hành động, Escape đóng/trả focus, click ngoài đóng; xóa giữ dialog xác nhận hiện có. Tooltip icon có chữ/aria-label. Thanh tìm kiếm giới hạn chiều ngang, icon Search, tên dài wrap. Giảm nhiều nút primary lặp lại.
- Ngôn ngữ: navigation “Trạm kiểm soát”, “Số báo danh” trên các bảng/form/tìm kiếm đã chỉnh, “Theo dõi người chạy”; map bỏ câu “Vị trí GPS được giữ nguyên”, “Khung nhìn tự do”. Giữ field/enum/API, khóa editor, vị trí GPS, attribution và nhãn mô phỏng.
- Spacing/style: token section/card/control, padding 18–24px tùy viewport; tooltip/focus rõ, nút icon 40px desktop/44px tablet, cảnh báo tiết chế; thẻ mô phỏng bố trí gọn hơn. Không thêm dependency. Editor vẫn có input bàn phím/draft/undo/lưu/hủy.

## File

Mới `src/components/IconAction.tsx`, `src/features/races/RaceActions.tsx`, `scripts/verify-ui-polish.mjs`.
Sửa `layouts/Shell.tsx`, `features/dashboard/Dashboard.tsx`, `features/races/Races.tsx`, `features/runners/{People,RunnerTable}.tsx`, `features/live-map/{LiveMap,MapEditor,WatchList}.tsx`, `styles.css`, `app/LiveProvider.tsx`, `services/{interface,liveService}.ts`; cập nhật locator nhãn/menu trong scripts kiểm thử, và report này.

## Kiểm tra

- Lint/typecheck đạt; 37/37 unit test (8 file); build đạt, cảnh báo bundle JS >500kB vẫn còn (khoảng 605kB minified). Đây là cảnh báo tối ưu, không phải lỗi chức năng.
- Browser fixture UI: header yên lặng lúc connected; refresh/error vẫn giữ dữ liệu, tự bỏ cảnh báo khi phục hồi; reconnect; menu keyboard Escape/focus không đổi chiều cao row; link chọn giải/điều hướng; tìm kiếm rỗng; tên rất dài; 1366×768, 1920×1080, 768×1024 không tràn ngang toàn trang. Test không ghi nghiệp vụ (0 request mutation).
- Đã kiểm tra reflow **tương đương 125%** bằng viewport CSS 1093×614 / deviceScaleFactor 1.25, có ảnh; chưa xác minh thao tác zoom 125% của trình duyệt desktop bằng UI thật. Không dùng CSS zoom/scale trong sản phẩm.
- Hồi quy fixture quản trị: 9 request ghi bị intercept, 0 ghi thật (simulation, matching, DELETE); enrollment 2 POST intercepted, 0 ghi thật; editor 4 intercepted, 0 ghi thật. Editor test cần scroll marker vào viewport trước khi kéo do bố cục mới; kéo/input/click/lưu/hủy/khóa vẫn đạt. Kiểm tra menu cũ được đổi từ button thành menuitem theo semantics mới, không bỏ kiểm tra DELETE.
- Không có lỗi backend được kết luận: runtime hiện không chạy nên không có bằng chứng mới về API/GPS thật. Không mô phỏng chuyển động hoặc tạo dữ liệu để lấp thiếu hụt.

## Ảnh và giới hạn

Tất cả ảnh của lượt này là **fixture**, nền tile bị chặn trong test để kiểm tra thông báo tile, không phải ảnh chạy giải thật:
- Trước: `test-results/ui-before/dashboard.png`, `races-1366.png` (và kích thước khác).
- Sau: `test-results/ui-after/dashboard-1366.png`, `dashboard-1920.png`, `dashboard-768.png`, `races-1366.png`, `races-1920.png`, `races-768.png`, `read-error.png`, `long-name.png`, `scale125.png`.
- Báo cáo test: `test-results/ui-after/report.json`. Ảnh nằm trong thư mục ignored.

Không sửa backend/.env backend/database, không tạo/chạy/dừng simulation, không đăng ký/resolve/lưu/xóa dữ liệu thật. `git diff -- services/backend` rỗng. Cần backend được mở lại để nghiệm thu đọc thật; không tự thay runtime đang cấu hình.

---

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
