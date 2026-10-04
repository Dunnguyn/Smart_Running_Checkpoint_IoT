"""Send synthetic GPS, step snapshots and checkpoint messages to a running API.

Run with: python -m app.simulator --base-url http://127.0.0.1:8000
This is a simulator client, not a sensor driver. All generated values use
source=SIMULATOR and are safe to distinguish from real device measurements.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv


# Read the same local secrets as the API process; never put keys in code.
load_dotenv()


def request_json(base_url: str, path: str, method: str, payload: dict | None, api_key: str, header: str) -> dict:
    """Make one JSON REST request and include the role-specific API key."""
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=body,
        method=method,
        headers={"Content-Type": "application/json", header: api_key},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API {method} {path} trả HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Không kết nối được backend tại {base_url}: {exc.reason}") from exc


def timestamp(value: datetime) -> str:
    """Serialize a UTC timestamp using ISO 8601 with a Z suffix."""
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def main() -> None:
    """Create a paired mock wearable and follow GPS coordinates through a LAP geofence."""
    parser = argparse.ArgumentParser(description="Tạo 20 runner mô phỏng và phát GPS/bước chân; có thể mô phỏng cả Gateway Arduino.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Địa chỉ API backend")
    parser.add_argument("--interval", type=float, default=None, help="Khoảng nghỉ GPS, mặc định 5s GPS_ONLY hoặc 3.5s GPS_AND_ARDUINO")
    parser.add_argument("--laps", type=int, default=1, help="Số lap giả lập; mỗi lap đợi đủ thời gian tối thiểu")
    parser.add_argument("--students", type=int, default=20, help="Số sinh viên giả lập, tối đa 100")
    parser.add_argument("--mode", choices=("GPS_ONLY", "GPS_AND_ARDUINO"), default="GPS_ONLY", help="Chế độ tính vòng của race demo")
    args = parser.parse_args()

    admin_key = os.getenv("ADMIN_API_KEY", "dev-admin-key-change-me")
    simulator_key = os.getenv("SIMULATOR_API_KEY", "dev-simulator-key-change-me")
    lap_wait = int(os.getenv("MIN_LAP_INTERVAL_SECONDS", "30"))
    args.interval = args.interval or (3.5 if args.mode == "GPS_AND_ARDUINO" else 5.0)
    if args.interval <= 0 or args.laps < 1 or not 1 <= args.students <= 100:
        parser.error("interval phải > 0, laps phải >= 1 và students phải nằm trong 1..100")
    if args.mode == "GPS_AND_ARDUINO" and args.interval >= 4.5:
        parser.error("GPS_AND_ARDUINO cần interval < 4.5 giây để chừa khoảng cho độ trễ API trong max_sample_gap_seconds=5")
    run_tag = uuid.uuid4().hex[:8]
    admin_header, sim_header = "X-Admin-Key", "X-Simulator-Key"

    # Provision a dedicated demo race; each participant gets a stable 01..N bib for UI display.
    race = request_json(args.base_url, "/api/v1/races", "POST", {
        "name": f"Demo mô phỏng {run_tag}", "status": "LIVE", "route_name": "Tuyến mô phỏng NEU",
        "total_laps": args.laps, "checkpoint_mode": args.mode,
    }, admin_key, admin_header)
    race_id = race["race_id"]
    mock_checkpoint_lat, mock_checkpoint_lon = 21.005, 105.843
    checkpoint = request_json(args.base_url, f"/api/v1/races/{race_id}/checkpoints", "POST", {
        "code": "SIM-LAP", "name": "Vùng checkpoint vòng chạy mô phỏng", "sequence_no": 1,
        "kind": "LAP", "latitude": mock_checkpoint_lat, "longitude": mock_checkpoint_lon,
        "radius_m": 25 if args.mode == "GPS_ONLY" else 10,
    }, admin_key, admin_header)
    checkpoint_id = checkpoint["checkpoint_id"]
    checkpoint_device_id = f"sim-arduino-{run_tag}"
    gateway_key = os.getenv("GATEWAY_API_KEY", "dev-gateway-key-change-me")
    if args.mode == "GPS_AND_ARDUINO":
        request_json(args.base_url, f"/api/v1/checkpoints/{checkpoint_id}/devices", "POST",
            {"device_id": checkpoint_device_id, "name": "Arduino gateway (simulated)"}, admin_key, admin_header)

    runners = []
    for number in range(1, args.students + 1):
        display_id = f"{number:02d}"
        student = request_json(args.base_url, "/api/v1/students", "POST", {
            "student_code": f"SIM{run_tag}{display_id}", "full_name": f"Sinh viên mô phỏng {display_id}", "faculty": "Demo",
        }, admin_key, admin_header)
        student_id = student["student_id"]
        wearable_id = f"sim-wearable-{run_tag}-{display_id}"
        request_json(args.base_url, "/api/v1/runner-devices", "POST", {
            "device_id": wearable_id, "student_id": student_id, "name": f"Wearable mô phỏng {display_id}",
        }, admin_key, admin_header)
        request_json(args.base_url, f"/api/v1/races/{race_id}/participants", "POST", {
            "student_id": student_id, "bib_number": display_id,
        }, admin_key, admin_header)
        run = request_json(args.base_url, "/api/v1/runs", "POST", {
            "race_id": race_id, "student_id": student_id, "wearable_device_id": wearable_id,
            "source": "SIMULATOR", "idempotency_key": f"sim-run-{run_tag}-{display_id}",
        }, simulator_key, sim_header)
        runners.append({"display_id": display_id, "student_id": student_id, "wearable_id": wearable_id, "run_id": run["run_id"], "last_steps": 0})

    min_cross_tick = max(1, int((lap_wait + args.interval) // args.interval))
    # In combined mode stagger crossings beyond the ±3s match window so demo tracks do not collide.
    crossing_stride = max(2, math.ceil(7 / args.interval)) if args.mode == "GPS_AND_ARDUINO" else 1
    lap_stride = max(1, int((lap_wait + args.interval) // args.interval))
    if args.mode == "GPS_AND_ARDUINO":
        last_cross_tick = min_cross_tick + crossing_stride * (args.students * args.laps - 1)
    else:
        last_cross_tick = min_cross_tick + lap_stride * (args.laps - 1)
    print(f"Giải: {race_id} | Chế độ: {args.mode} | Tạo {args.students} sinh viên, số hiển thị 01..{args.students:02d}")
    print("Đang phát GPS và snapshot bước chân giả lập...")
    gateway_events = []
    for tick in range(last_cross_tick + 1):
        cycle_started = time.monotonic()
        for runner_index, runner in enumerate(runners):
            # GPS_ONLY can process all runners together; combined mode assigns a unique time slot to every event.
            crossings_for_runner = [min_cross_tick + crossing_stride * (lap_index * args.students + runner_index) for lap_index in range(args.laps)] if args.mode == "GPS_AND_ARDUINO" else [min_cross_tick + lap_index * max(1, int((lap_wait + args.interval) // args.interval)) for lap_index in range(args.laps)]
            if tick > crossings_for_runner[-1]:
                continue
            entering = tick in crossings_for_runner
            exiting = tick > 0 and (tick - 1) in crossings_for_runner
            offset_m = 0.0 if entering else (20.0 if args.mode == "GPS_AND_ARDUINO" else 30.0)
            point_time = datetime.now(timezone.utc)
            runner["last_steps"] = 1000 + tick * 80
            gps_body = {
                "idempotency_key": f"sim-gps-{run_tag}-{runner['display_id']}-{tick:04d}",
                "race_id": race_id, "run_id": runner["run_id"], "student_id": runner["student_id"],
                "wearable_device_id": runner["wearable_id"],
                "latitude": mock_checkpoint_lat + (offset_m / 111_320), "longitude": mock_checkpoint_lon,
                "recorded_at": timestamp(point_time), "accuracy_m": 4.0,
                "speed_mps": min(8.0, ((20.0 if args.mode == "GPS_AND_ARDUINO" else 30.0) if exiting or entering else 0.0) / args.interval),
                "total_steps": runner["last_steps"], "source": "SIMULATOR",
            }
            accepted = request_json(args.base_url, "/api/v1/telemetry/gps", "POST", gps_body, simulator_key, sim_header)
            crossings = accepted.get("checkpoint_crossings", [])
            if args.mode == "GPS_AND_ARDUINO" and entering and crossings:
                event_body = {"device_id": checkpoint_device_id, "device_event_id": f"sim-event-{run_tag}-{runner['display_id']}-{crossings_for_runner.index(tick) + 1:02d}",
                    "checkpoint_id": checkpoint_id, "occurred_at": timestamp(point_time), "student_id": None}
                gateway_event = request_json(args.base_url, "/api/v1/checkpoint-events", "POST", event_body, gateway_key, "X-Gateway-Key")
                gateway_events.append(gateway_event["event_id"])
                print(f"Runner {runner['display_id']} gửi passage GPS + Arduino event {gateway_event['event_id']}")
            elif args.mode == "GPS_ONLY" and entering and crossings:
                print(f"Runner {runner['display_id']} qua GPS checkpoint: lap={accepted['lap_count']} status={accepted.get('status', 'ACTIVE')}")
        if tick < last_cross_tick:
            time.sleep(max(0, args.interval - (time.monotonic() - cycle_started)))

    if gateway_events:
        time.sleep(race.get("match_window_seconds", 3) + race.get("late_grace_seconds", 2) + 1)
    dashboard = request_json(args.base_url, f"/api/v1/races/{race_id}/dashboard", "GET", None, admin_key, admin_header)
    summary = dashboard["summary"]
    print(f"Hoàn tất mô phỏng: {summary['completed_runners']}/{summary['participants']} phiên đã DONE; tổng lap={summary['laps_recorded']}.")
    print(f"Race ID: {race_id}\nCheckpoint ID: {checkpoint_id}\nChế độ: {args.mode}")
    print(f"Dashboard: GET /api/v1/races/{race_id}/dashboard")
    if args.mode == "GPS_AND_ARDUINO":
        print(f"Sự kiện chờ/mơ hồ: GET /api/v1/races/{race_id}/checkpoint-events")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc
