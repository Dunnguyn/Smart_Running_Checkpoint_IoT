# Sơ đồ UML backend — PlantUML

Toàn bộ sơ đồ đã được chuyển sang cú pháp **PlantUML** tại [PLANTUML_DIAGRAMS.puml](PLANTUML_DIAGRAMS.puml). Mỗi sơ đồ có cặp `@startuml` / `@enduml`; sơ đồ tư duy dùng `@startmindmap` / `@endmindmap`. Tệp nguồn không còn khối Mermaid.

Tệp `.puml` chứa 15 sơ đồ theo thứ tự: Use Case, Activity, BPMN AS-IS, BPMN TO-BE, DFD, ERD, Sequence GPS, Sequence Arduino/GPS, Swimlane, State Machine, Class, Context, Mind Map, User Journey và Component. BPMN được biểu diễn bằng Activity Diagram có swimlane, event, gateway và task vì PlantUML không có cú pháp BPMN độc lập. Không tạo Timing Diagram theo yêu cầu.

## Cách xem

1. Mở `docs/PLANTUML_DIAGRAMS.puml` bằng VS Code.
2. Cài extension **PlantUML** và chọn **Preview Current Diagram** (thường là `Alt+D`). Hoặc sao chép nội dung từ một dòng `@startuml` đến `@enduml` tương ứng để dán vào PlantUML.
3. Với sơ đồ tư duy, sao chép riêng khối bắt đầu bằng `@startmindmap` đến `@endmindmap`.

Trong tệp nguồn có ghi chú tên, mục đích và dữ liệu chính của từng sơ đồ. Các nhánh về 4 vòng, GPS_ONLY, GPS_AND_ARDUINO, event không có danh tính, ghép duy nhất/AMBIGUOUS, xử lý Admin, commit và WebSocket đều được giữ lại.
