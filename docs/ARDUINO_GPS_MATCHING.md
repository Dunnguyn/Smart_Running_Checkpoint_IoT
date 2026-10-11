# Arduino and GPS Runner Matching

This note records the demo behavior implemented from `Dac_ta_Backend_Dinh_danh_Runner_Arduino_GPS.docx`. GPS values are simulated when no wearable is connected. A match is therefore an inference from demo tracks and event time; it does not prove which real person crossed an ultrasonic sensor.

## Race modes

- `GPS_ONLY` is the default for existing races. Valid GPS geofence entries may count laps; Arduino events are stored as `UNASSIGNED` and never add a lap.
- `GPS_AND_ARDUINO` records GPS passage evidence but does not count a lap from GPS alone. A registered Arduino/Gateway event is matched with an eligible GPS passage after its saved time window closes.
- A race's matching configuration becomes locked when its first run starts. Create a new demo race to try different matching settings.

## Geofence and matching rules

The combined mode tracks a persistent region for each `(run_id, checkpoint_id)`: `UNKNOWN`, `OUTSIDE`, or `INSIDE`. A first sample inside only initializes state. A passage is recorded only on `OUTSIDE -> INSIDE`, with inner radius 10 m and outer radius 15 m. Samples in between preserve the last state. A sample gap greater than 5 seconds resets the state; rejected GPS samples never change it.

The default Arduino correlation window is ±3 seconds around `occurred_at`, plus 2 seconds of late grace. Events more than 10 seconds old are recorded as `UNASSIGNED/LATE_DEVICE_EVENT`; timestamps more than 2 seconds in the future are rejected. Events and GPS evidence are stored before WebSocket notification. One eligible candidate may be matched automatically. Multiple candidates or competing events stay `AMBIGUOUS`; distance ranks candidates for review but never chooses a runner. A consumed GPS passage cannot be reused.

The lap timestamp is Arduino `occurred_at`. The lap is counted only if the run is still active, the event is at a `LAP` checkpoint, the time is after the previous lap/start and at least `MIN_LAP_INTERVAL_SECONDS`. A matched identity can still have `lap_status=NOT_COUNTED`, with a reason such as `MIN_LAP_INTERVAL_NOT_MET` or `RUN_NOT_ACTIVE`.

## Device registration and API links

Admin registers the checkpoint sensor mapping using `POST /api/v1/checkpoints/{checkpoint_id}/devices`. The Gateway sends `POST /api/v1/checkpoint-events` with `X-Gateway-Key`, a stable `device_event_id`, the registered `device_id`, `occurred_at`, and `student_id: null`. If it sends `checkpoint_id`, that ID must match the server mapping. The backend derives race/checkpoint from the registered device; it never trusts an Arduino-supplied student identity.

The Gateway can poll `GET /api/v1/gateway/checkpoint-events/{event_id}`. Admin Web can read `GET /api/v1/checkpoint-events/{event_id}`, list with `GET /api/v1/races/{race_id}/checkpoint-events`, and resolve a finalized ambiguous match with `POST /api/v1/checkpoint-events/{event_id}/resolve`. Resolution uses `CONFIRM` plus an offered `passage_id`, or `DISMISS`; it requires `expected_version`, a unique `idempotency_key`, and an audit reason.

Wearable telemetry remains `POST /api/v1/telemetry/gps` with `race_id`, `run_id`, `student_id`, `wearable_device_id`, coordinates, `recorded_at`, `total_steps`, and an idempotency key. A real wearable authenticates with `X-Wearable-Key` and uses the 12 m/s GPS-jump limit; the demo simulator uses `X-Simulator-Key` and its configurable 18 m/s ceiling to fit the presentation window. In combined mode the response may contain `checkpoint_crossings` with `identity_status=GPS_PASSAGE_PENDING_ARDUINO`; this does not mean a lap was counted.

Admin configures a race before creating runs with `PATCH /api/v1/races/{race_id}/checkpoint-matching`. Existing races are backfilled to `GPS_ONLY`. API contract details are visible at `/docs`.

## Admin key and dashboard

The Admin Web key entry should call `POST /api/v1/auth/admin-key` with the candidate in `X-Admin-Key`. A valid key returns 200. An absent or invalid key returns 401, and this demo does not lock the key after repeated failures. Keep the user on the key entry page after 401. Protected Admin endpoints use the same check.

One dashboard snapshot is available at `GET /api/v1/races/{race_id}/dashboard` with `X-Admin-Key`. It returns race/mode details, participant and run counts, laps, distance, steps, event state counts, ranked runners, and recent checkpoint events. The five-runner demo uses bibs `01`–`05`; UUID student IDs remain the API relationship keys.

## Simulator

Admin Web launches the simulator with `POST /api/v1/simulations`; the backend manages the simulator process, so no second terminal is needed. It creates five participants (`01`–`05`) with wearable/run bindings. All five run rows share one start timestamp, then synthetic GPS and step snapshots move them continuously at different speeds. Steps are derived from distance with simulated stride lengths of 0.62–0.82 m. The route is about 425 m and follows `NEU-C01 → C02 → C03 → C04 → C01`; C01 is both start and lap/finish anchor. Four laps complete the run, and the 30-second minimum lap rule keeps the expected finish near two minutes plus request overhead. GPS and steps are simulated values, not hardware measurements. In GPS_ONLY, every checkpoint passage is saved, but only the checkpoint whose kind is `LAP` increments the lap counter.

Poll `GET /api/v1/simulations/{simulation_id}` for status, log tail, and `race_id`; stop with `POST /api/v1/simulations/{simulation_id}/stop`. `DELETE /api/v1/races/{race_id}` stops a currently running API-managed simulator for that race and removes race-owned telemetry. Other ACTIVE runs cause HTTP 409 until they are stopped or completed. Student profiles and wearable IDs are preserved because they are reusable identities.

Admin Web can read the stored line with `GET /api/v1/races/{race_id}/route`, replace it with map-derived ordered coordinates using `PUT /api/v1/races/{race_id}/route`, and move/resize a checkpoint using `PATCH /api/v1/checkpoints/{checkpoint_id}`. The PUT payload requires a closed route and one `checkpoint_id` anchor for every race checkpoint. The `NEU_DEMO` route profile applies the 400–450 m bounds; `CUSTOM` races have no global distance bound unless their creator supplies one. Route GET reports missing configuration and edit-lock status. Route and checkpoint changes are locked after a run exists; after a successful update, the frontend must refetch route/dashboard because these REST updates do not publish a WebSocket event. The simulator's extra bends are placeholders, not verified footpaths; replace them with a polyline exported from the real map before claiming the path follows a surveyed route.

For a combined GPS + Arduino illustration, start `POST /api/v1/simulations` with `{"checkpoint_mode":"GPS_AND_ARDUINO","seed":42,"interval_seconds":0.5}`. A crowded checkpoint can produce `AMBIGUOUS` by design. The loop coordinates are approximate demo points near the building, not a survey of a safe real running route. Each run freezes its duration when it reaches `total_laps`; the race becomes `COMPLETED` after every registered participant's latest run is complete.

The matching worker scans durable pending events on startup and every second. The demo supports a single backend process; multi-worker deployments need shared worker claiming/locking and Redis or equivalent WebSocket fan-out before production use.
