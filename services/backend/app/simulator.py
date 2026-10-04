"""Send synthetic GPS, step snapshots and checkpoint messages to a running API.

Run with: python -m app.simulator --base-url http://127.0.0.1:8000
This is a simulator client, not a sensor driver. All generated values use
source=SIMULATOR and are safe to distinguish from real device measurements.
"""
from __future__ import annotations

import argparse
import json
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
    parser = argparse.ArgumentParser(description="Phát GPS/bước chân/lap giả lập vào backend NEU Smart Running.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Địa chỉ API backend")
    parser.add_argument("--interval", type=float, default=8.0, help="Khoảng nghỉ giữa các GPS point, giây")
    parser.add_argument("--laps", type=int, default=1, help="Số lap giả lập; mỗi lap đợi đủ thời gian tối thiểu")
    args = parser.parse_args()

    admin_key = os.getenv("ADMIN_API_KEY", "dev-admin-key-change-me")
    simulator_key = os.getenv("SIMULATOR_API_KEY", "dev-simulator-key-change-me")
    lap_wait = int(os.getenv("MIN_LAP_INTERVAL_SECONDS", "30"))
    if args.interval <= 0 or args.laps < 1:
        parser.error("interval phải > 0 và laps phải >= 1")
    if 4 * args.interval < lap_wait:
        parser.error(f"interval phải >= {lap_wait / 4:g} giây để GPS đi vào checkpoint sau thời gian lap tối thiểu")
    run_tag = uuid.uuid4().hex[:8]
    admin_header, sim_header = "X-Admin-Key", "X-Simulator-Key"

    # Provision an isolated demo race and synthetic student so the command works on a fresh database.
    race = request_json(args.base_url, "/api/v1/races", "POST", {
        "name": f"Demo mô phỏng {run_tag}", "status": "LIVE", "route_name": "Tuyến mô phỏng NEU", "total_laps": max(1, args.laps),
    }, admin_key, admin_header)
    race_id = race["race_id"]
    student = request_json(args.base_url, "/api/v1/students", "POST", {
        "student_code": f"SIM{run_tag}", "full_name": "Sinh viên mô phỏng", "faculty": "Demo",
    }, admin_key, admin_header)
    student_id = student["student_id"]
    device_id = f"sim-wearable-{run_tag}"
    request_json(args.base_url, "/api/v1/runner-devices", "POST", {
        "device_id": device_id, "student_id": student_id,
        "name": "GPS + step counter (simulated)",
    }, admin_key, admin_header)
    checkpoint = request_json(args.base_url, f"/api/v1/races/{race_id}/checkpoints", "POST", {
        "code": "SIM-LAP", "name": "Vùng checkpoint vòng chạy mô phỏng", "sequence_no": 1,
        "kind": "LAP", "latitude": 21.005, "longitude": 105.843, "radius_m": 25,
    }, admin_key, admin_header)
    checkpoint_id = checkpoint["checkpoint_id"]
    request_json(args.base_url, f"/api/v1/races/{race_id}/participants", "POST", {
        "student_id": student_id, "bib_number": f"SIM-{run_tag}",
    }, admin_key, admin_header)
    run = request_json(args.base_url, "/api/v1/runs", "POST", {
        "race_id": race_id, "student_id": student_id, "wearable_device_id": device_id, "source": "SIMULATOR",
        "idempotency_key": f"sim-run-{run_tag}",
    }, simulator_key, sim_header)
    run_id = run["run_id"]
    recorded_base = datetime.now(timezone.utc)

    print(f"Giải: {race_id} | Sinh viên: {student_id} | Phiên chạy: {run_id}")
    # Approach from outside the geofence, enter it to count lap 1, then exit/re-enter per lap.
    offsets_m = [-100, -80, -60, -40, -20]
    for _ in range(args.laps - 1):
        offsets_m.extend([30, 60, 30, -20])

    print("Đang gửi GPS và bước chân giả lập từ cùng một thiết bị đeo...")
    for index, offset_m in enumerate(offsets_m):
        # These route points approach/cross the checkpoint circle; snapshots rise by 80 steps.
        point_time = recorded_base + timedelta(seconds=index * args.interval)
        body = {
            "idempotency_key": f"sim-gps-{run_tag}-{index:04d}",
            "race_id": race_id, "run_id": run_id, "student_id": student_id,
            "wearable_device_id": device_id,
            "latitude": 21.005 + (offset_m / 111_320), "longitude": 105.843,
            "recorded_at": timestamp(point_time), "accuracy_m": 4.0 + (index % 3),
            "speed_mps": min(8.0, abs(offset_m - (offsets_m[index - 1] if index else offset_m)) / args.interval),
            "total_steps": 1000 + (index * 80), "source": "SIMULATOR",
        }
        accepted = request_json(args.base_url, "/api/v1/telemetry/gps", "POST", body, simulator_key, sim_header)
        passed = accepted["checkpoint_crossings"]
        pass_text = f", checkpoint={passed[0]['checkpoint_code']} lap={accepted['lap_count']}" if passed else ""
        print(f"GPS {index + 1}/{len(offsets_m)}: distance={accepted['distance_total_m']} m, steps={accepted['total_steps']}{pass_text}")
        if index < len(offsets_m) - 1:
            time.sleep(args.interval)

    print(f"Hoàn tất mô phỏng. GPS đã xác định {accepted['lap_count']} lap; run vẫn ACTIVE để Admin Web theo dõi.")
    print(f"Race ID: {race_id}\nStudent ID: {student_id}\nWearable ID: {device_id}\nRun ID: {run_id}")
    print("Dùng GET /api/v1/races/{race_id}/live và /runners để xem các số liệu vừa gửi.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc
