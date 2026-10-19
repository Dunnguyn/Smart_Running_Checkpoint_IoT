"""USB Serial bridge for the NEU checkpoint Arduino sketch.

The Arduino sketch prints human-readable status lines. This Gateway forwards
only each `LAP: <number>` line as an anonymous checkpoint event. It does not
claim a runner identity; the backend matches the event to wearable GPS.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import serial
from dotenv import load_dotenv

LAP_LINE = re.compile(r"^LAP:\s*(\d+)\s*$", re.IGNORECASE)


def send_checkpoint_event(base_url: str, gateway_key: str, payload: dict) -> bool:
    """POST once with a stable event ID; retry transient errors idempotently."""
    url = base_url.rstrip("/") + "/api/v1/checkpoint-events"
    body = json.dumps(payload).encode("utf-8")
    request = Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json",
        "X-Gateway-Key": gateway_key,
    })
    for attempt in range(3):
        try:
            with urlopen(request, timeout=3) as response:
                response_body = response.read().decode("utf-8", errors="replace")
                if response.status in (200, 202):
                    print(f"API {response.status}: event={payload['device_event_id']} {response_body}")
                    return True
                print(f"API {response.status}: {response_body}", file=sys.stderr)
                return False
        except HTTPError as exc:
            response_body = exc.read().decode("utf-8", errors="replace")
            print(f"API HTTP {exc.code}: {response_body}", file=sys.stderr)
            # 4xx means configuration/payload needs fixing; retrying cannot help.
            if 400 <= exc.code < 500:
                return False
        except (URLError, TimeoutError, OSError) as exc:
            print(f"API/network attempt {attempt + 1}/3: {exc}", file=sys.stderr)
        if attempt < 2:
            time.sleep(0.4 * (attempt + 1))
    return False


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Forward Arduino LAP lines to NEU backend")
    parser.add_argument("--port", required=True, help="Arduino COM port, e.g. COM5")
    parser.add_argument("--baud", type=int, default=9600, help="Must match Serial.begin in the sketch")
    parser.add_argument("--device-id", required=True, help="Must match the device registered in Admin API")
    parser.add_argument("--checkpoint-id", help="Optional; backend verifies it against device mapping")
    parser.add_argument("--base-url", default=os.getenv("BACKEND_BASE_URL", "http://127.0.0.1:8000"))
    args = parser.parse_args()

    gateway_key = os.getenv("GATEWAY_API_KEY")
    if not gateway_key:
        parser.error("GATEWAY_API_KEY is missing; set it in services/backend/.env")

    print(f"Opening {args.port} at {args.baud} baud; backend={args.base_url}")
    print("Close Arduino IDE Serial Monitor first; only one program can own a COM port.")
    try:
        with serial.Serial(args.port, args.baud, timeout=1) as board:
            # Opening USB Serial may reset the Arduino; ignore boot/status output.
            while True:
                line = board.readline().decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                print(f"SERIAL: {line}")
                match = LAP_LINE.fullmatch(line)
                if not match:
                    continue

                lap_no = int(match.group(1))
                payload = {
                    "device_event_id": str(uuid.uuid4()),
                    "device_id": args.device_id,
                    "event_type": "PASSAGE_DETECTED",
                    "occurred_at": datetime.now(timezone.utc).isoformat(),
                    "student_id": None,
                    "raw_payload": line,
                }
                if args.checkpoint_id:
                    payload["checkpoint_id"] = args.checkpoint_id
                print(f"Detected local kit lap {lap_no}; forwarding anonymous passage event...")
                if not send_checkpoint_event(args.base_url, gateway_key, payload):
                    print("Event was not acknowledged. Check the API/key/device mapping before continuing.", file=sys.stderr)
    except serial.SerialException as exc:
        print(f"Cannot open/read serial port {args.port}: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("Gateway stopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
