# Các sơ đồ UML của backend


## 1. Class Diagram — Sơ đồ lớp

```mermaid
classDiagram
  class Race { +UUID race_id; +string name; +datetime start_at; +datetime end_at; +string status; +int total_laps }
  class Student { +UUID student_id; +string student_code; +string full_name; +string faculty; +string status }
  class RunnerWearable { +string device_id; +UUID student_id; +string name; +string status; +datetime last_seen_at }
  class RaceParticipant { +UUID id; +string bib_number; +string registration_status }
  class Checkpoint { +UUID checkpoint_id; +string code; +int sequence_no; +string kind; +float latitude; +float longitude; +float radius_m }
  class RunSession { +UUID run_id; +UUID wearable_device_id; +datetime started_at; +datetime ended_at; +string status; +float distance_total_m; +int duration_total_s; +int lap_count; +int total_steps; +float last_latitude; +float last_longitude }
  class GpsPoint { +UUID gps_point_id; +UUID wearable_device_id; +float latitude; +float longitude; +datetime recorded_at; +datetime received_at; +int total_steps; +string source; +string idempotency_key }
  class LapEvent { +UUID lap_event_id; +datetime occurred_at; +int lap_no; +int duration_s; +string source; +string source_event_id; +string validation_status }
  class Device { +string device_id; +string name; +string status; +datetime last_seen_at }
  class DeviceEvent { +UUID device_event_id; +datetime occurred_at; +datetime received_at; +string event_type; +string source_event_id; +UUID student_id_nullable; +string identity_status; +string raw_payload }
  class RaceService { +create_race(); +overview(); +runners(); +live_snapshot() }
  class RunService { +start_run(); +accept_gps(); +record_lap(); +finish_run() }
  class DeviceService { +accept_passage(); +mark_unassigned() }
  class GeofenceDetector { +detect_entry(previous_gps, current_gps, checkpoint); +validate_lap_time() }
  class EventHub { +connect(); +disconnect(); +publish() }
  Race "1" --> "0..*" Checkpoint
  Race "1" --> "0..*" RaceParticipant
  Student "1" --> "0..*" RaceParticipant
  Race "1" --> "0..*" RunSession
  Student "1" --> "0..*" RunSession
  Student "1" --> "0..*" RunnerWearable : assigned
  RunnerWearable "1" --> "0..*" RunSession : bound device
  RunSession "1" --> "0..*" GpsPoint
  RunnerWearable "1" --> "0..*" GpsPoint : provides GPS and steps
  RunSession "1" --> "0..*" LapEvent
  Checkpoint "1" --> "0..*" LapEvent
  Device "1" --> "0..*" DeviceEvent
  Checkpoint "1" --> "0..*" DeviceEvent
  Student "0..1" --> "0..*" DeviceEvent : optional identity
  RaceService ..> Race
  RunService ..> RunSession
  DeviceService ..> DeviceEvent
  GeofenceDetector ..> Checkpoint : checks radius
  GeofenceDetector ..> LapEvent : creates assigned GPS lap
  EventHub ..> RunService : publishes committed events
```

## 2. Object Diagram — Sơ đồ đối tượng

Snapshot minh họa một thời điểm giữa giải: GPS/steps wearable đã gán cho runner, vị trí vừa đi vào checkpoint geofence và backend ghi lap.

```mermaid
classDiagram
  class race_NEURUN { race_id="race-01"; name="NEU Run"; status="LIVE"; total_laps=5 }
  class student_11223344 { student_id="stu-01"; student_code="11223344"; full_name="Nguyen Minh Anh" }
  class wearable_01 { device_id="wearable-01"; status="ACTIVE"; sensors="GPS + steps" }
  class checkpoint_LAP { checkpoint_id="cp-01"; code="LAP-01"; kind="LAP"; radius_m=25 }
  class run_1024 { run_id="run-01"; wearable_device_id="wearable-01"; status="ACTIVE"; lap_count=2; distance_total_m=812.5; total_steps=1240 }
  class gps_0002 { gps_point_id="gps-02"; latitude=21.005; longitude=105.843; total_steps=1240; source="SIMULATOR" }
  class lap_02 { lap_no=2; duration_s=320; source="SIMULATOR" }
  race_NEURUN --> checkpoint_LAP
  race_NEURUN --> run_1024
  student_11223344 --> run_1024
  student_11223344 --> wearable_01
  wearable_01 --> run_1024
  wearable_01 --> gps_0002
  run_1024 --> gps_0002
  checkpoint_LAP --> lap_02
  run_1024 --> lap_02
```

## 3. Component Diagram — Sơ đồ thành phần

```mermaid
flowchart LR
  FE[Admin Web] -->|REST + WebSocket| API[FastAPI REST / WS]
  SIM[Wearable Simulator: GPS + step counter] -->|REST + X-Simulator-Key| API
  UNO[Arduino UNO + HC-SR04] -->|USB Serial| GW[Gateway chạy trên laptop]
  GW -->|REST + X-Gateway-Key| API
  API --> AUTH[API key / role checks]
  API --> DOMAIN[Race, Run, GPS geofence, Steps, Lap, Device logic]
  DOMAIN --> DB[(SQL Server)]
  DOMAIN --> HUB[WebSocket Event Hub]
  HUB --> FE
```

## 4. Composite Structure Diagram — Sơ đồ cấu trúc kết hợp

Nội bộ thành phần Run/Telemetry: phần tiếp nhận kiểm tra hợp đồng và quyền trước; logic chỉ cập nhật tổng khi dữ liệu hợp lệ; lưu DB xong mới phát event.

```mermaid
flowchart LR
  subgraph TelemetryComponent[Telemetry API Component]
    IN[GpsIn request port] --> AUTH[Simulator key port]
    AUTH --> VALID[Run ACTIVE + paired wearable + identity + timestamp + steps validation]
    VALID --> IDEM[Idempotency check]
    IDEM --> DIST[Haversine distance calculator]
    DIST --> GEO[Outside-to-inside LAP checkpoint geofence]
    GEO --> LAP[Create LapEvent and update lap_count]
    LAP --> REPO[RunSession + GpsPoint + LapEvent repository]
    REPO --> COMMIT[Database transaction commit]
    COMMIT --> OUT[Accepted response port]
    COMMIT --> PUB[EventHub publish port]
  end
  SIM[GPS and steps from paired wearable] --> IN
  AUTH --> KEY[(SIMULATOR_API_KEY)]
  REPO --> SQL[(SQL Server)]
  PUB --> WS[Admin WebSocket clients]
```

## 5. Deployment Diagram — Sơ đồ triển khai

```mermaid
flowchart TB
  subgraph Browser[Máy người quản trị]
    WEB[Admin Web browser]
  end
  subgraph Laptop[Máy chạy demo / backend host]
    FASTAPI[Python 3.11 + Uvicorn + FastAPI]
    GATEWAY[USB Serial Gateway process]
    SIMCLIENT[Mock Data Simulator CLI]
    ENV[.env secrets and connection settings]
  end
  subgraph Hardware[Checkpoint vật lý]
    UNO[Arduino UNO]
    SENSOR[HC-SR04 sensor]
    UNO --- SENSOR
  end
  subgraph RunnerWearable[Runner GPS and step device]
    GPS[GPS sensor or simulated coordinates]
    STEP[Step counter or simulated snapshots]
    SENDER[Wearable data source]
    GPS --> SENDER
    STEP --> SENDER
  end
  subgraph DatabaseHost[SQL Server host]
    SQL[(SQL Server database iot_running)]
  end
  WEB -->|HTTP REST + WS over LAN| FASTAPI
  UNO -->|USB Serial| GATEWAY
  GATEWAY -->|HTTP REST over LAN| FASTAPI
  SIMCLIENT -->|HTTP REST + wearable ID + GPS + steps| FASTAPI
  SENDER -. real wearable later sends same contract .-> FASTAPI
  FASTAPI -->|ODBC Driver 18 / TCP 1433| SQL
  ENV -. configures .-> FASTAPI
```

## 6. Package Diagram — Sơ đồ gói

```mermaid
flowchart TB
  subgraph api[package api]
    routes[REST routes]
    websocket[WebSocket endpoint]
    contracts[Pydantic request contracts]
  end
  subgraph domain[package domain]
    race[Race and registration]
    run[Run lifecycle]
    telemetry[GPS and steps]
    geofence[GPS checkpoint geofence detection]
    laps[Lap validation]
    devices[Runner wearable binding and checkpoint device events]
  end
  subgraph persistence[package persistence]
    models[SQLAlchemy models]
    sessions[DB session and engine]
  end
  subgraph infrastructure[package infrastructure]
    config[Environment settings]
    auth[API key dependencies]
    hub[EventHub]
  end
  api --> domain
  domain --> persistence
  api --> infrastructure
  persistence --> infrastructure
```

## 7. Profile Diagram — Sơ đồ cấu hình / hồ sơ

Các stereotype mở rộng UML dùng để giải thích miền IoT trong hệ thống. Áp dụng profile này lên lớp/endpoint tương ứng khi vẽ lại bằng công cụ UML hỗ trợ Profile.

```mermaid
classDiagram
  class IoTBackendProfile {
    <<profile>>
    +UML stereotypes for running event domain
  }
  class Entity {
    <<stereotype>>
    persistent business record
  }
  class TelemetrySource {
    <<stereotype>>
    source: SIMULATOR or ARDUINO_GATEWAY
  }
  class IdempotentMessage {
    <<stereotype>>
    unique message key prevents duplicate effects
  }
  class IdentityUnassigned {
    <<stereotype>>
    Arduino detects passage but has no runner identity
  }
  class RunnerBoundTelemetry {
    <<stereotype>>
    wearable ID resolves to the assigned student/run
  }
  class GeofenceCrossing {
    <<stereotype>>
    outside-to-inside GPS transition at a LAP checkpoint
  }
  class LiveEvent {
    <<stereotype>>
    published after persistence commit
  }
  IoTBackendProfile ..> Entity : extends UML Class
  IoTBackendProfile ..> TelemetrySource : extends UML Class
  IoTBackendProfile ..> IdempotentMessage : extends UML Class
  IoTBackendProfile ..> IdentityUnassigned : extends UML Class
  IoTBackendProfile ..> RunnerBoundTelemetry : extends UML Class
  IoTBackendProfile ..> GeofenceCrossing : extends UML Class
  IoTBackendProfile ..> LiveEvent : extends UML Class
```

## Quan hệ cốt lõi dạng ER

```mermaid
erDiagram
  RACE ||--o{ CHECKPOINT : defines
  RACE ||--o{ RACE_PARTICIPANT : enrolls
  STUDENT ||--o{ RACE_PARTICIPANT : joins
  RACE ||--o{ RUN_SESSION : hosts
  STUDENT ||--o{ RUN_SESSION : performs
  STUDENT ||--o{ RUNNER_WEARABLE : assigned
  RUNNER_WEARABLE ||--o{ RUN_SESSION : bound_to
  RUN_SESSION ||--o{ GPS_POINT : records
  RUNNER_WEARABLE ||--o{ GPS_POINT : sends_GPS_and_steps
  RUN_SESSION ||--o{ LAP_EVENT : counts
  CHECKPOINT ||--o{ LAP_EVENT : validates
  DEVICE ||--o{ DEVICE_EVENT : emits
  CHECKPOINT ||--o{ DEVICE_EVENT : detects_at
STUDENT o|--o{ DEVICE_EVENT : optional_identity
```

## 8. Use Case Diagram — Sơ đồ ca sử dụng

Mô tả các tác nhân và chức năng chính. Người chạy và thiết bị đeo gửi dữ liệu; quản trị viên theo dõi giải qua web; gateway checkpoint gửi sự kiện phát hiện người qua nhưng không nhận diện được sinh viên.

```mermaid
flowchart LR
  Admin[Quản trị viên] --> UC1((Tạo giải và checkpoint))
  Admin --> UC2((Đăng ký sinh viên và wearable))
  Admin --> UC3((Theo dõi live và danh sách runner))
  Admin --> UC4((Xem lịch sử phiên chạy))
  Wearable[Thiết bị đeo hoặc Simulator] --> UC5((Gửi GPS và tổng bước))
  UC5 --> UC6((Xác định runner từ wearable ID))
  UC6 --> UC7((Phát hiện vào vùng checkpoint bằng GPS))
  UC7 --> UC8((Ghi lap hợp lệ))
  Gateway[Arduino Gateway] --> UC9((Gửi sự kiện phát hiện người qua))
  UC9 --> UC10((Lưu sự kiện UNASSIGNED))
  UC3 --> Backend[Backend FastAPI]
  UC4 --> Backend
  UC5 --> Backend
  UC9 --> Backend
```

## 9. Sequence Diagram — GPS, bước chân và phát hiện lap

Luồng dưới đây cho thấy backend ràng buộc wearable với runner, xác thực mẫu GPS/bước chân, phát hiện chuyển từ ngoài vào trong vùng LAP, commit dữ liệu rồi mới gửi WebSocket.

```mermaid
sequenceDiagram
  actor Wearable as Wearable / Simulator
  participant API as FastAPI GPS API
  participant DB as SQLAlchemy Database
  participant Geo as Geofence Detector
  participant Hub as WebSocket EventHub
  participant Web as Admin Web
  Wearable->>API: POST /api/v1/telemetry/gps (device_id, run_id, GPS, steps)
  API->>API: Kiểm tra API key, run ACTIVE, wearable thuộc runner
  API->>DB: Đọc GPS trước, checkpoint và khóa idempotency
  API->>API: Kiểm tra timestamp, tọa độ, bước chân, tốc độ
  alt Mẫu hợp lệ và không trùng
    API->>Geo: Kiểm tra previous outside -> current inside
    Geo-->>API: Kết quả crossing và checkpoint LAP (nếu có)
    API->>DB: Lưu GPS; cập nhật tổng quãng đường/bước
    opt Có crossing hợp lệ và đủ thời gian lap tối thiểu
      API->>DB: Tạo LapEvent, tăng lap_count
    end
    API->>DB: COMMIT transaction
    API->>Hub: Publish gps.updated và checkpoint.passed sau commit
    Hub-->>Web: WebSocket event cho race
    API-->>Wearable: 202 Accepted
  else Dữ liệu sai hoặc trùng
    API-->>Wearable: Từ chối hoặc trả kết quả idempotent
  end
```

## 10. Activity Diagram — Quy trình xử lý telemetry GPS

```mermaid
flowchart TD
  Start((Bắt đầu)) --> Req[Nhận GPS + tổng bước + wearable ID]
  Req --> Auth{API key hợp lệ?}
  Auth -- Không --> Reject401[Trả 401]
  Auth -- Có --> Bound{Run ACTIVE và wearable đúng runner?}
  Bound -- Không --> Reject422[Trả lỗi nghiệp vụ]
  Bound -- Có --> Valid{Tọa độ, thời gian, bước và tốc độ hợp lệ?}
  Valid -- Không --> Reject422
  Valid -- Có --> Duplicate{Idempotency key đã nhận?}
  Duplicate -- Có --> Ignore[Không áp dụng lại dữ liệu]
  Duplicate -- Không --> Save[ Tính quãng đường và lưu GPS snapshot ]
  Save --> Cross{Đi từ ngoài vào trong geofence LAP?}
  Cross -- Không --> Commit[Commit dữ liệu]
  Cross -- Có --> LapTime{Đủ thời gian lap tối thiểu?}
  LapTime -- Không --> Commit
  LapTime -- Có --> RecordLap[Tạo LapEvent và tăng lap_count]
  RecordLap --> Commit
  Commit --> Push[Phát WebSocket sau commit]
  Push --> Accepted[Trả 202 Accepted]
  Reject401 --> End((Kết thúc))
  Reject422 --> End
  Ignore --> End
  Accepted --> End
```

## 11. State Machine Diagram — Trạng thái phiên chạy

```mermaid
stateDiagram-v2
  [*] --> ACTIVE: Tạo phiên chạy hợp lệ
  ACTIVE --> ACTIVE: Nhận GPS/bước hợp lệ
  ACTIVE --> ACTIVE: Ghi lap GPS geofence hợp lệ
  ACTIVE --> FINISHED: POST /runs/{run_id}/finish
  FINISHED --> [*]
  note right of ACTIVE
    Chỉ phiên ACTIVE mới nhận telemetry.
    Sự kiện Arduino không định danh vẫn là
    UNASSIGNED và không tự tăng lap.
  end note
```

## 12. Sequence Diagram — Sự kiện checkpoint Arduino không định danh

```mermaid
sequenceDiagram
  participant Sensor as HC-SR04
  participant Arduino as Arduino UNO
  participant Gateway as Laptop Gateway
  participant API as FastAPI Device Event API
  participant DB as Database
  participant Web as Admin Web
  Sensor->>Arduino: Phát hiện vật thể qua vùng đo
  Arduino->>Gateway: Gửi event ID, device ID, thời điểm
  Gateway->>API: POST /api/v1/checkpoint-events
  API->>API: Xác thực gateway key và payload
  API->>API: Đặt identity_status=UNASSIGNED, student_id=null
  API->>DB: Lưu DeviceEvent
  API->>DB: COMMIT
  API-->>Gateway: 202 Accepted
  API-->>Web: Thông báo sự kiện thiết bị (nếu có kết nối live)
```

## 13. Communication Diagram — Sơ đồ giao tiếp

Sơ đồ nhấn mạnh các liên kết giữa đối tượng và đánh số thông điệp theo thứ tự. Mermaid chưa có cú pháp UML Communication riêng, vì vậy sơ đồ dưới đây dùng `flowchart` để mô phỏng các đối tượng và nhãn thông điệp.

```mermaid
flowchart LR
  Wearable[Wearable / Simulator]
  API[FastAPI GPS API]
  Geo[Geofence Detector]
  DB[(Database)]
  Hub[WebSocket EventHub]
  Admin[Admin Web]
  Wearable -->|1: POST GPS + steps + device_id| API
  API -->|2: load run, wearable, prior GPS, checkpoints| DB
  API -->|3: validate payload and ownership| API
  API -->|4: detect outside-to-inside crossing| Geo
  Geo -->|5: crossing result| API
  API -->|6: save GPS and optional LapEvent| DB
  DB -->|7: commit success| API
  API -->|8: publish gps.updated / checkpoint.passed| Hub
  Hub -->|9: push live event| Admin
  API -->|10: 202 Accepted| Wearable
```

## 14. Interaction Overview Diagram — Tổng quan tương tác

Sơ đồ này ghép luồng điều khiển nghiệp vụ với các tương tác chính. Các nhãn `I1` và `I2` tham chiếu lần lượt đến luồng GPS/lap ở sơ đồ tuần tự mục 9 và luồng Arduino ở mục 12.

```mermaid
flowchart TD
  Start((Bắt đầu)) --> Choose{Nguồn dữ liệu?}
  Choose -->|Wearable GPS + steps| I1[[I1: GPS telemetry interaction<br/>Sequence Diagram mục 9]]
  Choose -->|Arduino checkpoint| I2[[I2: Unassigned device event interaction<br/>Sequence Diagram mục 12]]
  I1 --> Accepted{Telemetry được chấp nhận?}
  Accepted -->|Không| Error[Trả lỗi hoặc bỏ qua bản tin trùng]
  Accepted -->|Có| Cross{Có crossing geofence đủ điều kiện?}
  Cross -->|Có| Lap[Đã lưu LapEvent và tăng lap_count]
  Cross -->|Không| GpsOnly[Chỉ cập nhật GPS, quãng đường, bước chân]
  Lap --> Live[Commit rồi gửi WebSocket]
  GpsOnly --> Live
  I2 --> Unassigned[ Lưu DeviceEvent với identity UNASSIGNED ]
  Unassigned --> DeviceLive[Commit rồi thông báo sự kiện thiết bị]
  Live --> End((Kết thúc))
  DeviceLive --> End
  Error --> End
```
