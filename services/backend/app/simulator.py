"""Stream moving GPS and step snapshots around the NEU Centennial Building demo loop.

Run with: python -m app.simulator
Coordinates and step counts are simulated; no real wearable or Arduino is needed.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv


for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

# GPS coordinates supplied for the four demo checkpoints around the NEU
# Centennial Building. The DMS coordinates are converted to decimal degrees.
ROUTE_CHECKPOINTS = [
    {"code": "NEU-C01", "name": "Checkpoint 1 - phía Bắc tòa Thế Kỷ", "sequence_no": 1,
     "kind": "LAP", "latitude": 21.0003888889, "longitude": 105.8425833333},
    {"code": "NEU-C02", "name": "Checkpoint 2 - phía Đông tòa Thế Kỷ", "sequence_no": 2,
     "kind": "CHECKPOINT", "latitude": 21.0000000000, "longitude": 105.8434166667},
    {"code": "NEU-C03", "name": "Checkpoint 3 - phía Nam tòa Thế Kỷ", "sequence_no": 3,
     "kind": "CHECKPOINT", "latitude": 20.9996111111, "longitude": 105.8426388889},
    {"code": "NEU-C04", "name": "Checkpoint 4 - phía Tây tòa Thế Kỷ", "sequence_no": 4,
     "kind": "CHECKPOINT", "latitude": 20.9999722222, "longitude": 105.8418888889},
]

# Provisional map polyline passing through each checkpoint anchor. The four
# added bends make a ~425m closed loop for the 400–450m demo requirement; replace
# these unverified bend coordinates with a real map routing polyline when ready.
ROUTE_WAYPOINTS = [
    {"latitude": 21.0003888889, "longitude": 105.8425833333, "checkpoint_code": "NEU-C01"},
    {"latitude": 21.0004188190, "longitude": 105.8431201370},
    {"latitude": 21.0000000000, "longitude": 105.8434166667, "checkpoint_code": "NEU-C02"},
    {"latitude": 20.9995844276, "longitude": 105.8431546335},
    {"latitude": 20.9996111111, "longitude": 105.8426388889, "checkpoint_code": "NEU-C03"},
    {"latitude": 20.9995687249, "longitude": 105.8421407295},
    {"latitude": 20.9999722222, "longitude": 105.8418888889, "checkpoint_code": "NEU-C04"},
    {"latitude": 21.0003915773, "longitude": 105.8420908414},
    {"latitude": 21.0003888889, "longitude": 105.8425833333},
]


def request_json(base_url: str, path: str, method: str, payload: dict | None, api_key: str, header: str) -> dict:
    """Send one authenticated JSON request to the backend API."""
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}", data=body, method=method,
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
    """Keep millisecond precision so successive GPS samples have increasing time."""
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def distance_m(a: dict, b: dict) -> float:
    """Approximate ground distance between two nearby latitude/longitude points."""
    earth = 6_371_000.0
    lat1, lat2 = math.radians(a["latitude"]), math.radians(b["latitude"])
    dlat = lat2 - lat1
    dlon = math.radians(b["longitude"] - a["longitude"])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return earth * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def make_route(points: list[dict] | None = None) -> tuple[list[dict], list[float], float]:
    """Measure and traverse the backend's route, including its closing leg."""
    points = [dict(point) for point in (points or ROUTE_WAYPOINTS)]
    if len(points) > 1 and distance_m(points[-1], points[0]) > 0.001:
        points.append({"latitude": points[0]["latitude"], "longitude": points[0]["longitude"]})
    lengths = [distance_m(points[index], points[index + 1]) for index in range(len(points) - 1)]
    return points, lengths, sum(lengths)


def position_at(points: list[dict], lengths: list[float], along_m: float) -> tuple[float, float]:
    """Interpolate a moving GPS coordinate along the closed route by distance."""
    route_length = sum(lengths)
    remaining = along_m % route_length
    for index, segment_length in enumerate(lengths):
        if remaining <= segment_length or index == len(lengths) - 1:
            fraction = min(1.0, remaining / segment_length)
            start, finish = points[index], points[index + 1]
            return (
                start["latitude"] + (finish["latitude"] - start["latitude"]) * fraction,
                start["longitude"] + (finish["longitude"] - start["longitude"]) * fraction,
            )
        remaining -= segment_length
    return points[0]["latitude"], points[0]["longitude"]


def main() -> None:
    """Create five simultaneous demo runners and move GPS/steps over four laps."""
    parser = argparse.ArgumentParser(description="Mô phỏng sinh viên chạy quanh tòa Thế Kỷ NEU với 4 checkpoint/vòng.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Địa chỉ API backend")
    parser.add_argument("--interval", type=float, default=0.5, help="Chu kỳ gửi GPS, mặc định 0.5 giây")
    parser.add_argument("--laps", type=int, default=4, help="Số vòng hoàn thành giải, mặc định 4")
    parser.add_argument("--students", type=int, default=5, help="Số sinh viên giả lập, mặc định 5")
    parser.add_argument("--seed", type=int, default=42, help="Seed để tái lập cùng tốc độ từng runner")
    parser.add_argument("--mode", choices=("GPS_ONLY", "GPS_AND_ARDUINO"), default="GPS_ONLY",
                        help="GPS_ONLY mô phỏng GPS/bước chân; combined kiểm tra ghép event Arduino")
    args = parser.parse_args()
    if args.interval < 0.5 or args.laps < 1 or not 1 <= args.students <= 100:
        parser.error("interval phải >= 0.5 giây, laps >= 1 và students nằm trong 1..100")

    admin_key = os.getenv("ADMIN_API_KEY", "dev-admin-key-change-me")
    simulator_key = os.getenv("SIMULATOR_API_KEY", "dev-simulator-key-change-me")
    gateway_key = os.getenv("GATEWAY_API_KEY", "dev-gateway-key-change-me")
    run_tag = uuid.uuid4().hex[:8]
    admin_header, sim_header = "X-Admin-Key", "X-Simulator-Key"
    points, segment_lengths, route_length = make_route()
    start_offset_m = 0.0  # All five runners start together at C01 and finish each lap at C01.

    race = request_json(args.base_url, "/api/v1/races", "POST", {
        "name": f"NEU - Vòng quanh tòa Thế Kỷ ({run_tag})", "status": "LIVE",
        "route_name": "Vòng mô phỏng quanh tòa nhà Thế Kỷ NEU",
        "route_profile": "NEU_DEMO",
        "total_laps": args.laps,
        "checkpoint_mode": args.mode,
    }, admin_key, admin_header)
    race_id = race["race_id"]
    print(f"Race {race_id} đang được khởi tạo.", flush=True)

    created_checkpoints = []
    gateway_device_ids = []
    for point in ROUTE_CHECKPOINTS:
        checkpoint = request_json(args.base_url, f"/api/v1/races/{race_id}/checkpoints", "POST", {
            **point, "radius_m": 8.0,
        }, admin_key, admin_header)
        created_checkpoints.append(checkpoint)
        if args.mode == "GPS_AND_ARDUINO":
            device_id = f"sim-arduino-{run_tag}-c{point['sequence_no']}"
            request_json(args.base_url, f"/api/v1/checkpoints/{checkpoint['checkpoint_id']}/devices", "POST",
                         {"device_id": device_id, "name": f"Gateway mô phỏng {point['code']}"}, admin_key, admin_header)
            gateway_device_ids.append(device_id)

    # Save the ordered route geometry so the map/dashboard use the same path
    # as the simulator. The route API synchronizes all checkpoint anchor points.
    checkpoint_ids = {point["code"]: created["checkpoint_id"]
                      for point, created in zip(ROUTE_CHECKPOINTS, created_checkpoints)}
    route_payload = {"points": [
        {"latitude": point["latitude"], "longitude": point["longitude"],
         "checkpoint_id": checkpoint_ids.get(point.get("checkpoint_code"))}
        for point in ROUTE_WAYPOINTS
    ]}
    request_json(args.base_url, f"/api/v1/races/{race_id}/route", "PUT", route_payload, admin_key, admin_header)

    # Re-read the committed route and use those exact ordered points for GPS.
    saved_route = request_json(args.base_url, f"/api/v1/races/{race_id}/route", "GET", None, admin_key, admin_header)
    code_by_id = {created["checkpoint_id"]: point["code"]
                  for point, created in zip(ROUTE_CHECKPOINTS, created_checkpoints)}
    points = [{"latitude": point["latitude"], "longitude": point["longitude"],
               "checkpoint_code": code_by_id.get(point["checkpoint_id"])}
              for point in saved_route.get("points", [])]
    if len(points) < 5:
        raise RuntimeError("Backend chưa trả tuyến đã lưu hợp lệ; không thể chạy mô phỏng.")
    points, segment_lengths, route_length = make_route(points)

    runners = []
    speed_rng = random.Random(args.seed)
    min_lap_seconds = int(race.get("min_lap_interval_seconds", 30))
    server_speed_limit = float(os.getenv("MAX_SIMULATOR_SPEED_MPS", "18"))
    safe_max_speed = min(13.35, server_speed_limit, route_length / (min_lap_seconds + 1.5))
    if safe_max_speed <= 0.5:
        raise RuntimeError("Cấu hình MIN_LAP_INTERVAL_SECONDS hoặc MAX_SIMULATOR_SPEED_MPS không phù hợp để mô phỏng.")
    safe_min_speed = min(12.7, safe_max_speed - min(0.6, safe_max_speed / 2))
    pace_levels = [round(safe_min_speed + index * (safe_max_speed - safe_min_speed) / 7, 2)
                   for index in range(8)]
    speed_schedule = [pace_levels[index % len(pace_levels)] for index in range(args.students)]
    speed_rng.shuffle(speed_schedule)
    stride_rng = random.Random(args.seed + 1)
    stride_schedule = [0.62 + index * (0.82 - 0.62) / max(1, args.students - 1)
                       for index in range(args.students)]
    stride_rng.shuffle(stride_schedule)
    for number in range(1, args.students + 1):
        display_id = f"{number:02d}"
        student = request_json(args.base_url, "/api/v1/students", "POST", {
            "student_code": f"SIM{run_tag}{display_id}",
            "full_name": f"Sinh viên mô phỏng {display_id}", "faculty": "Demo",
        }, admin_key, admin_header)
        student_id = student["student_id"]
        wearable_id = f"sim-wearable-{run_tag}-{display_id}"
        request_json(args.base_url, "/api/v1/runner-devices", "POST", {
            "device_id": wearable_id, "student_id": student_id,
            "name": f"GPS + bước chân mô phỏng {display_id}",
        }, admin_key, admin_header)
        request_json(args.base_url, f"/api/v1/races/{race_id}/participants", "POST", {
            "student_id": student_id, "bib_number": display_id,
        }, admin_key, admin_header)
        speed_mps = speed_schedule[number - 1]
        lap_seconds = route_length / speed_mps
        finish_elapsed = (route_length * args.laps) / speed_mps
        runners.append({
            "display_id": display_id, "student_id": student_id,
            "wearable_id": wearable_id, "run_id": None,
            "lap_seconds": lap_seconds, "speed_mps": speed_mps,
            "stride_length_m": stride_schedule[number - 1],
            "finish_elapsed": finish_elapsed, "last_steps": 0,
            "done": False, "last_checkpoint_keys": set(),
        })

    # Run rows share one future timestamp so the API start is simultaneous,
    # even though registrations and database inserts happen one after another.
    simulator_started_at = datetime.now(timezone.utc) + timedelta(seconds=2)
    for runner in runners:
        run = request_json(args.base_url, "/api/v1/runs", "POST", {
            "race_id": race_id, "student_id": runner["student_id"],
            "wearable_device_id": runner["wearable_id"], "source": "SIMULATOR",
            "started_at": timestamp(simulator_started_at),
            "idempotency_key": f"sim-run-{run_tag}-{runner['display_id']}",
        }, simulator_key, sim_header)
        runner["run_id"] = run["run_id"]

    print(f"Race {race_id}: {args.students} sinh viên, {args.laps} vòng, 4 checkpoint/vòng.")
    print(f"Tuyến polyline mô phỏng: khoảng {route_length:.1f}m/vòng, xuất phát/đích vòng tại NEU-C01.")
    print(f"GPS + bước chân chuyển động liên tục; pace mô phỏng tăng tốc {min(r['speed_mps'] for r in runners):.2f}–{max(r['speed_mps'] for r in runners):.2f} m/s.")
    print("Bib / pace / độ dài bước: " + ", ".join(
        f"{r['display_id']}={r['speed_mps']:.2f}m/s,{r['stride_length_m']:.2f}m"
        for r in runners) + ".")
    print(f"Giữ MIN_LAP_INTERVAL_SECONDS={race.get('min_lap_interval_seconds', 30)}; 4 vòng dự kiến khoảng {min(r['finish_elapsed'] for r in runners):.0f}–{max(r['finish_elapsed'] for r in runners):.0f} giây cộng độ trễ API.")
    while datetime.now(timezone.utc) < simulator_started_at:
        time.sleep(0.02)
    simulator_started = time.monotonic()
    expected_finish = max(runner["finish_elapsed"] for runner in runners)
    last_progress_print = -1
    event_ids: list[str] = []
    rejected_gps_points = 0
    while not all(runner["done"] for runner in runners):
        elapsed = time.monotonic() - simulator_started
        cycle_started = time.monotonic()
        for runner in runners:
            if runner["done"]:
                continue
            point_time = datetime.now(timezone.utc)
            # Tie each synthetic coordinate to its exact source timestamp.
            # This avoids inflating speed because runners are posted sequentially.
            point_elapsed = max(0.0, (point_time - simulator_started_at).total_seconds())
            travelled_m = start_offset_m + runner["speed_mps"] * point_elapsed
            latitude, longitude = position_at(points, segment_lengths, travelled_m)
            runner["last_steps"] = int(travelled_m / runner["stride_length_m"])
            gps_body = {
                "idempotency_key": f"sim-gps-{run_tag}-{runner['display_id']}-{int(elapsed * 1000):012d}",
                "race_id": race_id, "run_id": runner["run_id"], "student_id": runner["student_id"],
                "wearable_device_id": runner["wearable_id"], "latitude": latitude, "longitude": longitude,
                "recorded_at": timestamp(point_time), "accuracy_m": 4.0,
                "speed_mps": runner["speed_mps"], "total_steps": runner["last_steps"], "source": "SIMULATOR",
            }
            try:
                accepted = request_json(args.base_url, "/api/v1/telemetry/gps", "POST", gps_body, simulator_key, sim_header)
            except RuntimeError as exc:
                message = str(exc)
                if "GPS_JUMP_REJECTED" in message:
                    # Ignore only an outlier; the next fix can recover from the
                    # last accepted point because position/time share one clock.
                    rejected_gps_points += 1
                    continue
                if args.mode == "GPS_AND_ARDUINO" and "RUN_NOT_ACTIVE" in message:
                    # The matching worker may complete the run after the last
                    # GPS request. Read its committed state instead of stopping.
                    details = request_json(
                        args.base_url,
                        f"/api/v1/runners/{runner['student_id']}/runs/{runner['run_id']}",
                        "GET", None, admin_key, admin_header,
                    )
                    runner["done"] = bool(details.get("is_done"))
                    continue
                raise
            runner["done"] = bool(accepted.get("is_done"))

            # In Arduino mode, send a gateway event when a lap-finish passage is
            # detected. Closely packed runners may correctly become AMBIGUOUS.
            if args.mode == "GPS_AND_ARDUINO":
                finish_cp = created_checkpoints[0]
                for crossing in accepted.get("checkpoint_crossings", []):
                    if crossing["checkpoint_id"] != finish_cp["checkpoint_id"]:
                        continue
                    lap_key = f"{runner['display_id']}:{crossing.get('passage_id')}"
                    if lap_key in runner["last_checkpoint_keys"]:
                        continue
                    runner["last_checkpoint_keys"].add(lap_key)
                    event = request_json(args.base_url, "/api/v1/checkpoint-events", "POST", {
                        "device_id": gateway_device_ids[-1],
                        "device_event_id": f"sim-event-{run_tag}-{runner['display_id']}-{len(runner['last_checkpoint_keys']):02d}",
                        "checkpoint_id": finish_cp["checkpoint_id"],
                        "occurred_at": timestamp(point_time), "student_id": None,
                    }, gateway_key, "X-Gateway-Key")
                    event_ids.append(event["event_id"])
        if all(runner["done"] for runner in runners):
            break
        if elapsed > expected_finish + 8:
            unfinished = [runner["display_id"] for runner in runners if not runner["done"]]
            print(f"Quá thời gian dự kiến; các runner chưa đủ vòng: {', '.join(unfinished)}")
            break
        if int(elapsed // 10) > last_progress_print:
            last_progress_print = int(elapsed // 10)
            print(f"Đã chạy {int(elapsed)} giây: {sum(r['done'] for r in runners)}/{len(runners)} runner DONE.")
        time.sleep(max(0.0, args.interval - (time.monotonic() - cycle_started)))

    if event_ids:
        time.sleep(race.get("match_window_seconds", 3) + race.get("late_grace_seconds", 2) + 1)
    dashboard = request_json(args.base_url, f"/api/v1/races/{race_id}/dashboard", "GET", None, admin_key, admin_header)
    summary = dashboard["summary"]
    print(f"Kết quả: {summary['completed_runners']}/{summary['participants']} runner DONE; "
          f"{summary['laps_recorded']} lap đã ghi nhận trong {time.monotonic() - simulator_started:.1f} giây.")
    print(f"Điểm GPS bị backend từ chối và bỏ qua: {rejected_gps_points}.")
    print(f"Race ID: {race_id}")
    print(f"Dashboard: GET /api/v1/races/{race_id}/dashboard")
    print("Checkpoint ID theo thứ tự: " + ", ".join(cp["checkpoint_id"] for cp in created_checkpoints))


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc
