"""Server-managed kit and monthly health challenge demos.

The records are written to the same database tables the Admin Web and student
API use. GPS, steps and month playback are labeled as simulated.
"""
from __future__ import annotations

import asyncio
import math
import re
import secrets
import threading
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from . import main as core
from . import student_api as mobile

router = APIRouter()


class StudentRaceChallenge(core.Base):
    """Policy for a registered student to open repeated daily app sessions."""
    __tablename__ = "student_race_challenges"
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), primary_key=True)
    target_distance_m: Mapped[float] = mapped_column(Float, default=50_000)
    duration_days: Mapped[int] = mapped_column(Integer, default=30)
    start_checkpoint_id: Mapped[str] = mapped_column(ForeignKey("checkpoints.id"))
    end_checkpoint_id: Mapped[str] = mapped_column(ForeignKey("checkpoints.id"))
    max_position_age_seconds: Mapped[int] = mapped_column(Integer, default=30)
    max_accuracy_m: Mapped[float] = mapped_column(Float, default=30)


class ChallengeAppSession(core.Base):
    __tablename__ = "student_challenge_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=core.new_id)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("run_sessions.id"), unique=True, index=True)
    start_checkpoint_id: Mapped[str] = mapped_column(ForeignKey("checkpoints.id"))
    end_checkpoint_id: Mapped[str] = mapped_column(ForeignKey("checkpoints.id"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finish_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    finish_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")


class KitDemoSession(core.Base):
    __tablename__ = "kit_demo_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=core.new_id)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), index=True)
    checkpoint_id: Mapped[str] = mapped_column(ForeignKey("checkpoints.id"))
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"))
    wearable_id: Mapped[str] = mapped_column(ForeignKey("runner_wearables.id"))
    run_id: Mapped[str | None] = mapped_column(ForeignKey("run_sessions.id"), nullable=True)
    serial_port: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(32), default="CONNECTING", index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_lap_number: Mapped[int] = mapped_column(Integer, default=0)
    last_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=core.now_utc)


class HealthChallengeDemo(core.Base):
    __tablename__ = "health_challenge_demos"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=core.new_id)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="RUNNING", index=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=60)
    current_day: Mapped[int] = mapped_column(Integer, default=0)
    duration_days: Mapped[int] = mapped_column(Integer, default=30)
    virtual_start_date: Mapped[date] = mapped_column(Date)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=core.now_utc)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class HealthChallengeDemoDay(core.Base):
    __tablename__ = "health_challenge_demo_days"
    __table_args__ = (UniqueConstraint("demo_id", "student_id", "day_number", name="uq_health_demo_runner_day"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=core.new_id)
    demo_id: Mapped[str] = mapped_column(ForeignKey("health_challenge_demos.id"), index=True)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("run_sessions.id"), unique=True)
    day_number: Mapped[int] = mapped_column(Integer)
    virtual_date: Mapped[date] = mapped_column(Date)
    distance_m: Mapped[float] = mapped_column(Float)
    duration_s: Mapped[int] = mapped_column(Integer)
    steps: Mapped[int] = mapped_column(Integer)
    cumulative_distance_m: Mapped[float] = mapped_column(Float)
    outcome: Mapped[str] = mapped_column(String(24), default="IN_PROGRESS")


class KitDemoStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    serial_port: str = Field(default="COM03", min_length=3, max_length=8, pattern=r"^COM\d{1,3}$")
    student_code: str = "11235723"
    full_name: str = "Lê Phương Linh"
    faculty: str = "Đại học Kinh tế Quốc dân"


class HealthDemoStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    duration_seconds: int = Field(default=60, ge=30, le=180)
    seed: int = Field(default=42, ge=0, le=2_147_483_647)


class ChallengePosition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    accuracy_m: float = Field(gt=0, le=10000, allow_inf_nan=False)
    captured_at: datetime
    consent_version: str | None = Field(default=None, max_length=40)
    consent_granted: bool = True


_kit_threads: dict[str, threading.Thread] = {}
_kit_stop: dict[str, threading.Event] = {}
_kit_gps_tasks: dict[str, asyncio.Task] = {}
_health_tasks: dict[str, asyncio.Task] = {}


def _c04() -> tuple[float, float]:
    return 20 + 59 / 60 + 59.9 / 3600, 105 + 50 / 60 + 30.8 / 3600


def _checkpoints() -> list[tuple[str, str, float, float]]:
    return [
        ("NEU-C01", "Phía Bắc", 21 + 1.4 / 3600, 105 + 50 / 60 + 33.3 / 3600),
        ("NEU-C02", "Phía Đông", 21.0, 105 + 50 / 60 + 36.3 / 3600),
        ("NEU-C03", "Phía Nam", 20 + 59 / 60 + 58.6 / 3600, 105 + 50 / 60 + 33.5 / 3600),
        ("NEU-C04", "Phía Tây · Xuất phát / về đích", *_c04()),
    ]


def _port_name(value: str) -> str:
    match = re.fullmatch(r"COM0*(\d+)", value.strip().upper())
    return f"COM{int(match.group(1))}" if match else value.strip().upper()


def _ensure_student(db: Session, code: str, name: str, faculty: str) -> core.Student:
    student = db.scalar(select(core.Student).where(core.Student.student_code == code))
    if student:
        return student
    student = core.Student(student_code=code, full_name=name, faculty=faculty, status="ACTIVE")
    db.add(student)
    db.flush()
    return student


def _kit_circle(lat: float, lon: float, radius_m: float = 5.0, count: int = 20):
    cos_lat = max(0.1, math.cos(math.radians(lat)))
    points = [(lat + radius_m * math.sin(-math.pi / 2 + 2 * math.pi * i / count) / 111_320,
               lon + radius_m * math.cos(-math.pi / 2 + 2 * math.pi * i / count) / (111_320 * cos_lat))
              for i in range(count + 1)]
    points[-1] = (lat, lon)
    return points


def _kit_snapshot(db: Session, demo: KitDemoSession) -> dict[str, Any]:
    race, student = db.get(core.Race, demo.race_id), db.get(core.Student, demo.student_id)
    cp = db.get(core.Checkpoint, demo.checkpoint_id)
    run = db.get(core.RunSession, demo.run_id) if demo.run_id else None
    participant = db.scalar(select(core.RaceParticipant).where(
        core.RaceParticipant.race_id == demo.race_id, core.RaceParticipant.student_id == demo.student_id))
    return {"demo_id": demo.id, "status": demo.status, "serial_port": demo.serial_port,
        "race_id": demo.race_id, "race_name": race.name if race else None,
        "student_id": demo.student_id, "student_code": student.student_code if student else None,
        "full_name": student.full_name if student else None,
        "display_id": participant.bib_number if participant else "01",
        "checkpoint": {"checkpoint_id": cp.id, "code": cp.code, "latitude": cp.latitude,
            "longitude": cp.longitude, "radius_m": cp.radius_m} if cp else None,
        "run": core.run_dict(db, run) if run else None,
        "started_at": demo.started_at, "ended_at": demo.ended_at,
        "last_lap_number": demo.last_lap_number, "message": demo.last_message,
        "error": demo.error_message, "server_time": core.now_utc()}


def _set_kit(demo_id: str, status: str, message: str | None = None, error: str | None = None) -> None:
    with core.SessionLocal() as db:
        row = db.get(KitDemoSession, demo_id)
        if row:
            row.status = status
            if message is not None:
                row.last_message = message
            if error is not None:
                row.error_message = error
            if status in {"COMPLETED", "STOPPED", "FAILED"}:
                row.ended_at = core.now_utc()
            db.commit()


def _serial_reader(demo_id: str, port: str, loop: asyncio.AbstractEventLoop) -> None:
    stop = _kit_stop[demo_id]
    try:
        import serial
        with serial.Serial(port=port, baudrate=9600, timeout=0.5) as connection:
            connection.reset_input_buffer()
            _set_kit(demo_id, "WAITING_FOR_START",
                f"Đã mở {port} ở 9600 baud. Nhấn START trên kit, sau đó đi qua cảm biến.")
            while not stop.is_set():
                raw = connection.readline()
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="ignore").strip()
                if line == "START!":
                    _set_kit(demo_id, "ARMED", "Kit đã sẵn sàng; lần đi qua đầu tiên sẽ bắt đầu phiên chạy.")
                elif line.startswith("LAP:"):
                    try:
                        number = int(line.split(":", 1)[1].strip())
                    except ValueError:
                        continue
                    future = asyncio.run_coroutine_threadsafe(_process_kit_passage(demo_id, number), loop)
                    try:
                        future.result(timeout=20)
                    except Exception as exc:
                        _set_kit(demo_id, "FAILED", error=f"Không xử lý được Serial: {exc}")
                        stop.set()
    except Exception as exc:
        _set_kit(demo_id, "FAILED", error=f"Không mở được {port}: {exc}. Đóng Serial Monitor và kiểm tra cổng kit.")
    finally:
        stop.set()


async def _emit_kit_gps(demo_id: str) -> None:
    with core.SessionLocal() as db:
        demo = db.get(KitDemoSession, demo_id)
        if not demo or not demo.run_id:
            return
        cp = db.get(core.Checkpoint, demo.checkpoint_id)
        run_id, race_id = demo.run_id, demo.race_id
        lat0, lon0 = cp.latitude, cp.longitude
    route = _kit_circle(lat0, lon0)
    last_lat, last_lon, steps = lat0, lon0, 0
    for sequence, (lat, lon) in enumerate(route[1:], start=2):
        await asyncio.sleep(0.5)
        now = core.now_utc()
        delta = core.haversine_m(last_lat, last_lon, lat, lon)
        steps += max(1, round(delta / 0.70))
        with core.SessionLocal() as db:
            demo = db.get(KitDemoSession, demo_id)
            run = db.get(core.RunSession, run_id)
            if not demo or not run or demo.status not in {"RUNNING", "FINISH_REQUESTED"} or run.status != "ACTIVE":
                return
            db.add(core.GpsPoint(run_id=run.id, wearable_device_id=demo.wearable_id,
                latitude=lat, longitude=lon, recorded_at=now, received_at=now,
                accuracy_m=4.0, speed_mps=delta / 0.5, total_steps=steps,
                source="SIMULATED_GPS", idempotency_key=f"kit-demo:{demo_id}:{sequence}",
                sample_id=core.new_id(), sequence=sequence, segment_id=1))
            run.distance_total_m += delta
            run.total_steps = steps
            run.last_latitude, run.last_longitude = lat, lon
            run.last_seen_at = run.last_gps_recorded_at = now
            run.revision += 1
            wearable = db.get(core.RunnerWearable, demo.wearable_id)
            if wearable:
                wearable.last_seen_at = now
            db.commit()
            snapshot = core.run_dict(db, run)
        await core.hub.publish(race_id, {"event_id": core.new_id(), "type": "runner.updated",
            "race_id": race_id, "occurred_at": now.isoformat(), "data": snapshot})
        last_lat, last_lon = lat, lon


async def _process_kit_passage(demo_id: str, lap_number: int) -> None:
    now = core.now_utc()
    with core.SessionLocal() as db:
        demo = db.get(KitDemoSession, demo_id)
        if not demo or demo.status in {"COMPLETED", "STOPPED", "FAILED"}:
            return
        demo.last_lap_number = max(demo.last_lap_number, lap_number)
        if demo.status in {"CONNECTING", "WAITING_FOR_START", "ARMED"} or not demo.run_id:
            run = core.RunSession(race_id=demo.race_id, student_id=demo.student_id,
                wearable_device_id=demo.wearable_id, source="KIT_DEMO", status="ACTIVE", started_at=now)
            db.add(run)
            db.flush()
            demo.run_id, demo.started_at, demo.status = run.id, now, "RUNNING"
            demo.last_message = "Kit xác nhận lần đi qua đầu tiên; GPS, bước chân và đồng hồ demo đã bắt đầu."
            cp = db.get(core.Checkpoint, demo.checkpoint_id)
            point = core.GpsPoint(run_id=run.id, wearable_device_id=demo.wearable_id,
                latitude=cp.latitude, longitude=cp.longitude, recorded_at=now, received_at=now,
                accuracy_m=4.0, speed_mps=0.0, total_steps=0, source="SIMULATED_GPS",
                idempotency_key=f"kit-demo:{demo_id}:1", sample_id=core.new_id(), sequence=1, segment_id=1)
            db.add(point)
            db.flush()
            # The first Arduino hit is the start marker at the single C04
            # checkpoint. Persist it as a GPS passage so the second, separate
            # hit can satisfy the one-checkpoint start/finish lap rule.
            passage = core.GPSPassage(race_id=demo.race_id,
                checkpoint_id=demo.checkpoint_id, run_id=run.id,
                student_id=run.student_id, wearable_device_id=demo.wearable_id,
                entry_gps_point_id=point.id, entry_at=now, received_at=now,
                entry_distance_m=0.0, telemetry_source="SIMULATED_GPS")
            db.add(passage)
            db.flush()
            run.last_latitude, run.last_longitude = cp.latitude, cp.longitude
            run.last_seen_at = run.last_gps_recorded_at = now
            event = core.DeviceEvent(device_id=demo.device_id, checkpoint_id=demo.checkpoint_id,
                occurred_at=now, received_at=now, event_type="PASSAGE_DETECTED",
                source_event_id=f"kit-demo:{demo_id}:start", status="MATCHED",
                raw_payload=f"LAP: {lap_number}", lap_status="NOT_COUNTED",
                reason_code="KIT_DEMO_START_TRIGGER", matched_run_id=run.id,
                passage_id=passage.id, candidates_final=True)
            db.add(event)
            db.flush()
            passage.consumed_by_event_id = event.id
            db.commit()
            snapshot = core.run_dict(db, run)
            race_id = demo.race_id
            _kit_gps_tasks[demo_id] = asyncio.create_task(_emit_kit_gps(demo_id))
            await core.hub.publish(race_id, {"event_id": core.new_id(), "type": "runner.updated",
                "race_id": race_id, "occurred_at": now.isoformat(), "data": snapshot})
            await core.hub.publish(race_id, {"event_id": core.new_id(), "type": "checkpoint.detected",
                "race_id": race_id, "occurred_at": now.isoformat(), "data": core.checkpoint_event_dict(db, event)})
            return
        if demo.status != "RUNNING" or not demo.run_id:
            return
        run = db.get(core.RunSession, demo.run_id)
        if not run or run.status != "ACTIVE":
            return
        elapsed = (now - core.aware(demo.started_at)).total_seconds()
        if elapsed < 8:
            demo.last_message = f"Lần qua thứ hai đến sau {elapsed:.1f} giây; chờ khoảng 10 giây rồi đi qua lại."
            db.commit()
            return
        demo.status = "FINISH_REQUESTED"
        demo.last_message = "Kit nhận lần qua về đích; đợi GPS mô phỏng quay lại C04 rồi chốt."
        db.commit()
        gps_task = _kit_gps_tasks.get(demo_id)
        race_id = demo.race_id
    if gps_task:
        try:
            await asyncio.wait_for(gps_task, timeout=4)
        except asyncio.TimeoutError:
            pass
    with core.SessionLocal() as db:
        demo = db.get(KitDemoSession, demo_id)
        run = db.get(core.RunSession, demo.run_id) if demo else None
        cp = db.get(core.Checkpoint, demo.checkpoint_id) if demo else None
        if not demo or not run or not cp:
            return
        now = core.now_utc()
        latest = db.scalar(select(core.GpsPoint).where(core.GpsPoint.run_id == run.id)
            .order_by(core.GpsPoint.recorded_at.desc()).limit(1))
        if not latest or core.haversine_m(latest.latitude, latest.longitude, cp.latitude, cp.longitude) > cp.radius_m:
            demo.status = "RUNNING"
            demo.last_message = "GPS chưa trở về vùng C04; cần xác nhận lại khi thiết bị ở checkpoint."
            db.commit()
            return
        event = core.DeviceEvent(device_id=demo.device_id, checkpoint_id=cp.id,
            occurred_at=now, received_at=now, event_type="PASSAGE_DETECTED",
            source_event_id=f"kit-demo:{demo_id}:finish", status="MATCHED",
            raw_payload=f"LAP: {lap_number}", lap_status="NOT_EVALUATED",
            matched_run_id=run.id, candidates_final=True)
        passage = core.GPSPassage(race_id=demo.race_id, checkpoint_id=cp.id,
            run_id=run.id, student_id=run.student_id, wearable_device_id=demo.wearable_id,
            entry_gps_point_id=latest.id, entry_at=now, received_at=now,
            entry_distance_m=core.haversine_m(latest.latitude, latest.longitude, cp.latitude, cp.longitude),
            telemetry_source="SIMULATED_GPS")
        db.add_all([event, passage])
        db.flush()
        event.passage_id = passage.id
        counted, duration = core.record_lap(db, run, cp, now, "ARDUINO_KIT_DEMO", f"kit-demo:{demo_id}:finish")
        lap = db.scalar(select(core.LapEvent).where(core.LapEvent.source_event_id == f"kit-demo:{demo_id}:finish"))
        if counted:
            event.lap_status, event.lap_event_id = "COUNTED", lap.id if lap else None
            event.lap_number = run.lap_count
            event.lap_duration_ms = duration * 1000 if duration is not None else None
            event.reason_code = "KIT_DEMO_FINISH"
            demo.status, demo.ended_at = "COMPLETED", now
            demo.last_message = "Kit xác nhận lần qua thứ hai tại C04; phiên và đồng hồ đã kết thúc."
        else:
            demo.status, demo.error_message = "FAILED", f"Không xác nhận được vòng; thời lượng={duration}."
            event.lap_status, event.reason_code = "NOT_COUNTED", "LAP_VALIDATION_FAILED"
        db.commit()
        run_data, event_data, race_id = core.run_dict(db, run), core.checkpoint_event_dict(db, event), demo.race_id
    await core.hub.publish(race_id, {"event_id": core.new_id(),
        "type": "runner.completed" if run_data["status"] == "COMPLETED" else "runner.updated",
        "race_id": race_id, "occurred_at": now.isoformat(), "data": run_data})
    await core.hub.publish(race_id, {"event_id": core.new_id(), "type": "checkpoint.detected",
        "race_id": race_id, "occurred_at": now.isoformat(), "data": event_data})


@router.get("/api/v1/demos/kit/ports", dependencies=[Depends(core.admin)])
def kit_ports() -> dict[str, Any]:
    try:
        from serial.tools import list_ports
        return {"items": [{"device": p.device, "description": p.description} for p in list_ports.comports()]}
    except Exception as exc:
        return {"items": [], "error": str(exc)}


@router.post("/api/v1/demos/kit/sessions", status_code=202, dependencies=[Depends(core.admin)])
async def start_kit_demo(data: KitDemoStart, db: Session = Depends(core.db_session)) -> dict[str, Any]:
    active = db.scalar(select(KitDemoSession).where(KitDemoSession.status.in_(
        ["CONNECTING", "WAITING_FOR_START", "ARMED", "RUNNING", "FINISH_REQUESTED"])))
    if active:
        core.envelope_error("KIT_DEMO_ALREADY_ACTIVE", "Đã có phiên kit demo đang hoạt động.")
    student = _ensure_student(db, data.student_code, data.full_name, data.faculty)
    now = core.now_utc()
    race = core.Race(name=f"Demo kit C04 · {data.full_name} · {now:%Y%m%d-%H%M%S}",
        start_at=now, status="LIVE", route_name="Vòng mô phỏng 31 m quanh NEU-C04",
        route_profile="CUSTOM", total_laps=1, min_lap_interval_seconds=8,
        checkpoint_mode="GPS_AND_ARDUINO", inner_radius_m=8, outer_radius_m=14,
        match_window_seconds=1, late_grace_seconds=1, max_sample_gap_seconds=3)
    db.add(race)
    db.flush()
    lat, lon = _c04()
    cp = core.Checkpoint(race_id=race.id, code="NEU-C04", name="Phía Tây · demo kit",
        sequence_no=1, kind="LAP", latitude=lat, longitude=lon, radius_m=12)
    db.add(cp)
    db.flush()
    db.add(core.RaceParticipant(race_id=race.id, student_id=student.id, bib_number="01",
        registration_status="REGISTERED", registered_at=now))
    device_id, wearable_id = f"KIT-COM03-{uuid.uuid4().hex[:8]}", f"SIM-WEARABLE-{uuid.uuid4().hex[:8]}"
    db.add(core.Device(id=device_id, name="Arduino HC-SR04 trên COM03", checkpoint_id=cp.id))
    db.add(core.RunnerWearable(id=wearable_id, student_id=student.id, name="GPS + bước chân mô phỏng"))
    for seq, (lat_i, lon_i) in enumerate(_kit_circle(lat, lon), start=1):
        db.add(core.RaceRoutePoint(race_id=race.id, sequence_no=seq, latitude=lat_i,
            longitude=lon_i, checkpoint_id=cp.id if seq == 1 else None))
    demo = KitDemoSession(race_id=race.id, student_id=student.id, checkpoint_id=cp.id,
        device_id=device_id, wearable_id=wearable_id, serial_port=_port_name(data.serial_port))
    db.add(demo)
    db.commit()
    db.refresh(demo)
    try:
        import serial  # noqa: F401
    except ImportError:
        demo.status, demo.error_message = "FAILED", "Thiếu pyserial; cài requirements.txt trong services/backend."
        db.commit()
        raise HTTPException(503, detail={"code": "PYSERIAL_NOT_INSTALLED", "message": demo.error_message})
    stop = threading.Event()
    _kit_stop[demo.id] = stop
    loop = asyncio.get_running_loop()
    thread = threading.Thread(target=_serial_reader, args=(demo.id, demo.serial_port, loop),
        name=f"neu-kit-{demo.id[:8]}", daemon=True)
    _kit_threads[demo.id] = thread
    thread.start()
    return _kit_snapshot(db, demo)


@router.get("/api/v1/demos/kit/sessions/{demo_id}", dependencies=[Depends(core.admin)])
def get_kit_demo(demo_id: str, db: Session = Depends(core.db_session)):
    return _kit_snapshot(db, core.get_or_404(db, KitDemoSession, demo_id, "phiên kit demo"))


@router.post("/api/v1/demos/kit/sessions/{demo_id}/stop", dependencies=[Depends(core.admin)])
def stop_kit_demo(demo_id: str, db: Session = Depends(core.db_session)):
    demo = core.get_or_404(db, KitDemoSession, demo_id, "phiên kit demo")
    run = db.get(core.RunSession, demo.run_id) if demo.run_id else None
    if run and run.status == "ACTIVE":
        now = core.now_utc()
        run.status, run.ended_at, run.finalized_at = "ABANDONED", now, now
        run.duration_total_s = max(0, int((now - core.aware(run.started_at)).total_seconds()))
        run.revision += 1
    demo.status, demo.ended_at = "STOPPED", core.now_utc()
    demo.last_message = "Phiên demo dừng bởi Admin."
    db.commit()
    if demo.id in _kit_stop:
        _kit_stop[demo.id].set()
    return _kit_snapshot(db, demo)


def _validate_position(db: Session, challenge: StudentRaceChallenge, data: ChallengePosition,
                       checkpoint_id: str) -> None:
    cp = core.get_or_404(db, core.Checkpoint, checkpoint_id, "checkpoint")
    captured, now = core.aware(data.captured_at), core.now_utc()
    age = (now - captured).total_seconds()
    if age < -2 or age > challenge.max_position_age_seconds:
        mobile._fail(422, "POSITION_STALE", "Mẫu GPS quá cũ hoặc sai giờ.")
    if data.accuracy_m > challenge.max_accuracy_m:
        mobile._fail(422, "POSITION_INACCURATE", "Độ chính xác GPS không đạt yêu cầu.")
    distance = core.haversine_m(data.latitude, data.longitude, cp.latitude, cp.longitude)
    if distance > cp.radius_m:
        mobile._fail(422, "OUTSIDE_CHECKPOINT", f"Vị trí cách {cp.code} {distance:.1f} m; cần vào vùng {cp.radius_m:g} m.")


def _app_checkpoint_device(db: Session, race_id: str, checkpoint_id: str) -> core.Device:
    device_id = f"APP-GPS-{race_id[:8]}"
    device = db.get(core.Device, device_id)
    if not device:
        device = core.Device(id=device_id, name="Student app GPS geofence", checkpoint_id=checkpoint_id)
        db.add(device)
        db.flush()
    return device


def _challenge_progress(db: Session, race_id: str, student_id: str) -> dict[str, Any]:
    config = db.get(StudentRaceChallenge, race_id)
    if not config:
        mobile._fail(404, "CHALLENGE_NOT_FOUND", "Giải chưa cấu hình mục tiêu sức khỏe.")
    app_sessions = db.scalars(select(ChallengeAppSession).where(
        ChallengeAppSession.race_id == race_id, ChallengeAppSession.student_id == student_id)).all()
    days = db.scalars(select(HealthChallengeDemoDay).where(
        HealthChallengeDemoDay.race_id == race_id, HealthChallengeDemoDay.student_id == student_id)).all()
    run_ids = {row.run_id for row in app_sessions} | {row.run_id for row in days}
    # The standard Student API creates MOBILE_GPS runs directly instead of
    # creating ChallengeAppSession rows. Include those sessions so the Admin
    # challenge dashboard stays in sync with app check-ins and finishes.
    run_ids.update(db.scalars(select(core.RunSession.id).where(
        core.RunSession.race_id == race_id,
        core.RunSession.student_id == student_id,
        core.RunSession.source == "MOBILE_GPS")).all())
    runs = [db.get(core.RunSession, ident) for ident in run_ids]
    runs = [row for row in runs if row]
    completed = [row for row in runs if row.status == "COMPLETED"]
    distance = sum(row.distance_total_m for row in completed)
    paused = sum(mobile._pause_totals(db, row, core.now_utc())[0] for row in completed)
    elapsed = sum(row.duration_total_s or 0 for row in completed)
    ordered = sorted(completed, key=lambda row: core.aware(row.ended_at or row.started_at))
    cumulative, target_at = 0.0, None
    for row in ordered:
        cumulative += row.distance_total_m
        if target_at is None and cumulative >= config.target_distance_m:
            target_at = row.ended_at
    active = next((row for row in runs if row.status == "ACTIVE"), None)
    race = db.get(core.Race, race_id)
    return {"race_id": race_id, "target_distance_m": config.target_distance_m,
        "duration_days": config.duration_days, "total_distance_m": round(distance, 2),
        "remaining_distance_m": round(max(0, config.target_distance_m - distance), 2),
        "progress_percent": round(min(100, distance / config.target_distance_m * 100), 2),
        "distance_over_target_m": round(max(0, distance - config.target_distance_m), 2),
        "total_duration_s": elapsed, "active_duration_s": max(0, elapsed - paused),
        "paused_duration_s": paused,
        "total_steps": sum(row.total_steps for row in completed), "completed_sessions": len(completed),
        "target_reached": distance >= config.target_distance_m, "target_reached_at": target_at,
        "continue_allowed": race.status == "LIVE",
        "active_run": mobile._run_snapshot(db, active) if active else None,
        "sessions": [{"run_id": row.id, "started_at": row.started_at, "ended_at": row.ended_at,
            "status": row.status, "distance_m": round(row.distance_total_m, 2),
            "duration_s": row.duration_total_s, "steps": row.total_steps}
            for row in sorted(runs, key=lambda item: core.aware(item.started_at), reverse=True)],
        "server_time": core.now_utc()}


@router.get("/api/v1/student/races/{race_id}/challenge")
def student_challenge_progress(race_id: str,
    principal: mobile.StudentPrincipal = Depends(mobile.require_student),
    db: Session = Depends(core.db_session)):
    mobile._race_for_registered(db, race_id, principal.student.id)
    return _challenge_progress(db, race_id, principal.student.id)


@router.post("/api/v1/student/races/{race_id}/challenge/sessions", status_code=201)
async def student_challenge_start(race_id: str, data: ChallengePosition,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    principal: mobile.StudentPrincipal = Depends(mobile.require_student),
    db: Session = Depends(core.db_session)):
    key = mobile._idempotency_key(idempotency_key)
    path = f"POST:/api/v1/student/races/{race_id}/challenge/sessions"
    payload = data.model_dump(mode="json")
    replay = mobile._receipt_replay(db, principal, key, path, payload)
    if replay:
        return replay
    race, participant = mobile._race_for_registered(db, race_id, principal.student.id)
    config = db.get(StudentRaceChallenge, race_id)
    if not config:
        mobile._fail(409, "CHALLENGE_NOT_CONFIGURED", "Giải chưa cấu hình challenge sức khỏe.")
    if race.status != "LIVE":
        mobile._fail(409, "RACE_CLOSED", "Giải không nhận lượt chạy mới.")
    if not data.consent_granted or not data.consent_version:
        mobile._fail(422, "CONSENT_REQUIRED", "Cần xác nhận đồng ý ghi nhận GPS trước khi bắt đầu.")
    if participant.registration_status != "REGISTERED":
        mobile._fail(409, "REGISTRATION_CANCELLED", "Đăng ký không còn hiệu lực.")
    _validate_position(db, config, data, config.start_checkpoint_id)
    active = db.scalar(select(core.RunSession).where(
        core.RunSession.student_id == principal.student.id, core.RunSession.status == "ACTIVE").limit(1))
    if active:
        mobile._fail(409, "ACTIVE_RUN_EXISTS", "Bạn đang có phiên chạy chưa kết thúc.")
    now = core.now_utc()
    run = core.RunSession(race_id=race_id, student_id=principal.student.id,
        wearable_device_id=f"MOBILE:{principal.session.installation_id}",
        source="MOBILE_GPS", status="ACTIVE", started_at=now, revision=1)
    db.add(run)
    db.flush()
    db.add(ChallengeAppSession(race_id=race_id, student_id=principal.student.id,
        run_id=run.id, start_checkpoint_id=config.start_checkpoint_id,
        end_checkpoint_id=config.end_checkpoint_id, started_at=now))
    point = core.GpsPoint(run_id=run.id, wearable_device_id=run.wearable_device_id,
        latitude=data.latitude, longitude=data.longitude, recorded_at=core.aware(data.captured_at),
        received_at=now, accuracy_m=data.accuracy_m, speed_mps=0, total_steps=0,
        source="MOBILE_GPS", idempotency_key=f"challenge-start:{key}",
        payload_hash=core.hashlib.sha256(str(payload).encode()).hexdigest(),
        sample_id=core.new_id(), sequence=1, segment_id=1)
    db.add(point)
    db.flush()
    run.last_latitude, run.last_longitude = data.latitude, data.longitude
    run.last_seen_at, run.last_gps_recorded_at = now, core.aware(data.captured_at)
    checkpoint = db.get(core.Checkpoint, config.start_checkpoint_id)
    device = _app_checkpoint_device(db, race_id, checkpoint.id)
    passage = core.GPSPassage(race_id=race_id, checkpoint_id=checkpoint.id,
        run_id=run.id, student_id=run.student_id,
        wearable_device_id=run.wearable_device_id, entry_gps_point_id=point.id,
        entry_at=core.aware(data.captured_at), received_at=now,
        entry_distance_m=core.haversine_m(data.latitude, data.longitude,
            checkpoint.latitude, checkpoint.longitude), telemetry_source="MOBILE_GPS")
    db.add(passage)
    db.flush()
    event = core.DeviceEvent(device_id=device.id, checkpoint_id=checkpoint.id,
        occurred_at=core.aware(data.captured_at), received_at=now,
        event_type="STUDENT_APP_START", source_event_id=f"student-challenge:{run.id}:start",
        student_id=run.student_id, status="MATCHED", raw_payload="Student app GPS xác nhận checkpoint bắt đầu.",
        lap_status="NOT_COUNTED", reason_code="APP_GPS_START", matched_run_id=run.id,
        passage_id=passage.id, candidates_final=True)
    db.add(event)
    db.flush()
    passage.consumed_by_event_id = event.id
    result = mobile._run_snapshot(db, run, principal.session.installation_id)
    response = mobile._save_receipt(db, principal, key, path, payload, result, 201)
    db.commit()
    await core.hub.publish(race_id, {"event_id": core.new_id(), "type": "runner.updated",
        "race_id": race_id, "occurred_at": now.isoformat(), "data": core.run_dict(db, run)})
    await core.hub.publish(race_id, {"event_id": core.new_id(), "type": "checkpoint.detected",
        "race_id": race_id, "occurred_at": now.isoformat(), "data": core.checkpoint_event_dict(db, event)})
    return response


@router.post("/api/v1/student/challenge-runs/{run_id}/finish")
async def student_challenge_finish(run_id: str, data: ChallengePosition,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    principal: mobile.StudentPrincipal = Depends(mobile.require_student),
    db: Session = Depends(core.db_session)):
    key = mobile._idempotency_key(idempotency_key)
    path = f"POST:/api/v1/student/challenge-runs/{run_id}/finish"
    payload = data.model_dump(mode="json")
    replay = mobile._receipt_replay(db, principal, key, path, payload)
    if replay:
        return replay
    run = mobile._owned_run(db, run_id, principal.student.id)
    if run.status != "ACTIVE":
        mobile._fail(409, "RUN_NOT_ACTIVE", "Phiên chạy đã kết thúc.")
    session = db.scalar(select(ChallengeAppSession).where(ChallengeAppSession.run_id == run_id))
    if not session:
        mobile._fail(404, "CHALLENGE_SESSION_NOT_FOUND", "Phiên chạy không thuộc challenge.")
    config = db.get(StudentRaceChallenge, run.race_id)
    _validate_position(db, config, data, session.end_checkpoint_id)
    latest = db.scalar(select(core.GpsPoint).where(core.GpsPoint.run_id == run.id)
        .order_by(core.GpsPoint.recorded_at.desc()).limit(1))
    if not latest or core.aware(latest.received_at) < core.now_utc() - timedelta(seconds=30):
        mobile._fail(409, "GPS_REQUIRED_AT_FINISH", "Đồng bộ một mẫu GPS mới nhất trước khi dừng.")
    if run.distance_total_m < 20:
        mobile._fail(409, "RUN_DISTANCE_REQUIRED", "Cần có ít nhất 20 m GPS đã được backend xác nhận trước khi kết thúc phiên.")
    if core.haversine_m(latest.latitude, latest.longitude, data.latitude, data.longitude) > max(20, data.accuracy_m + 10):
        mobile._fail(422, "FINISH_GPS_MISMATCH", "GPS tại điểm dừng không khớp track đã nhận.")
    now = core.now_utc()
    run.status, run.ended_at, run.finalized_at = "COMPLETED", now, now
    run.duration_total_s = max(0, int((now - core.aware(run.started_at)).total_seconds()))
    run.revision += 1
    session.ended_at, session.finish_latitude, session.finish_longitude = now, data.latitude, data.longitude
    session.status = "COMPLETED"
    checkpoint = db.get(core.Checkpoint, session.end_checkpoint_id)
    device = _app_checkpoint_device(db, run.race_id, checkpoint.id)
    passage = core.GPSPassage(race_id=run.race_id, checkpoint_id=checkpoint.id,
        run_id=run.id, student_id=run.student_id, wearable_device_id=run.wearable_device_id,
        entry_gps_point_id=latest.id, entry_at=core.aware(data.captured_at), received_at=now,
        entry_distance_m=core.haversine_m(data.latitude, data.longitude,
            checkpoint.latitude, checkpoint.longitude), telemetry_source="MOBILE_GPS")
    db.add(passage)
    db.flush()
    event = core.DeviceEvent(device_id=device.id, checkpoint_id=checkpoint.id,
        occurred_at=core.aware(data.captured_at), received_at=now,
        event_type="STUDENT_APP_FINISH", source_event_id=f"student-challenge:{run.id}:finish",
        student_id=run.student_id, status="MATCHED", raw_payload="Student app GPS xác nhận checkpoint kết thúc.",
        lap_status="NOT_COUNTED", reason_code="APP_GPS_FINISH", matched_run_id=run.id,
        passage_id=passage.id, candidates_final=True)
    db.add(event)
    db.flush()
    passage.consumed_by_event_id = event.id
    result = mobile._run_snapshot(db, run, principal.session.installation_id)
    response = mobile._save_receipt(db, principal, key, path, payload, result)
    db.commit()
    await core.hub.publish(run.race_id, {"event_id": core.new_id(), "type": "runner.completed",
        "race_id": run.race_id, "occurred_at": now.isoformat(), "data": core.run_dict(db, run)})
    await core.hub.publish(run.race_id, {"event_id": core.new_id(), "type": "checkpoint.detected",
        "race_id": run.race_id, "occurred_at": now.isoformat(), "data": core.checkpoint_event_dict(db, event)})
    await mobile.publish_student_event(principal.student.id, "run.completed", "RUN", run.id, run.revision, result)
    return response


def _route(offset: float = 0.0) -> list[tuple[float, float, str | None]]:
    cps = _checkpoints()
    center_lat, center_lon = sum(c[2] for c in cps) / 4, sum(c[3] for c in cps) / 4
    cos_lat = max(0.1, math.cos(math.radians(center_lat)))
    points: list[tuple[float, float, str | None]] = []
    for i, (code, _name, lat, lon) in enumerate(cps):
        points.append((lat, lon, code))
        next_lat, next_lon = cps[(i + 1) % 4][2:]
        mid_lat, mid_lon = (lat + next_lat) / 2, (lon + next_lon) / 2
        east, north = (mid_lon - center_lon) * 111_320 * cos_lat, (mid_lat - center_lat) * 111_320
        length = max(1, math.hypot(east, north))
        points.append((mid_lat + offset * north / length / 111_320,
            mid_lon + offset * east / length / (111_320 * cos_lat), None))
    points.append((cps[0][2], cps[0][3], None))
    return points


def _scaled_route() -> list[tuple[float, float, str | None]]:
    low, high = 0.0, 40.0
    for _ in range(32):
        mid = (low + high) / 2
        points = _route(mid)
        length = sum(core.haversine_m(a[0], a[1], b[0], b[1]) for a, b in zip(points, points[1:]))
        if length < 400:
            low = mid
        else:
            high = mid
    raw = _route((low + high) / 2)
    # Start/end at C04, then pass the four supplied campus checkpoints.
    c04_index = next(index for index, point in enumerate(raw) if point[2] == "NEU-C04")
    return (raw[c04_index:c04_index + 2]
        + [(raw[0][0], raw[0][1], "NEU-C01")]
        + raw[1:c04_index]
        + [(raw[c04_index][0], raw[c04_index][1], None)])


def _point_at(points: list[tuple[float, float, str | None]], distance: float) -> tuple[float, float]:
    legs = [core.haversine_m(a[0], a[1], b[0], b[1]) for a, b in zip(points, points[1:])]
    remaining = distance % sum(legs)
    for index, length in enumerate(legs):
        if remaining <= length or index == len(legs) - 1:
            ratio = min(1, remaining / length) if length else 0
            return (points[index][0] + (points[index + 1][0] - points[index][0]) * ratio,
                points[index][1] + (points[index + 1][1] - points[index][1]) * ratio)
        remaining -= length
    return points[0][0], points[0][1]


def _create_month_demo(db: Session, duration_seconds: int):
    now, route = core.now_utc(), _scaled_route()
    route_length = sum(core.haversine_m(a[0], a[1], b[0], b[1]) for a, b in zip(route, route[1:]))
    virtual_start = core.now_utc().astimezone(timezone(timedelta(hours=7))).date()
    virtual_start_at = datetime.combine(virtual_start, time.min,
        tzinfo=timezone(timedelta(hours=7))).astimezone(timezone.utc)
    virtual_end_at = virtual_start_at + timedelta(days=30)
    race = core.Race(name="NEU Health Month · 50 km challenge demo", start_at=virtual_start_at,
        end_at=virtual_end_at, status="LIVE", route_name="Quanh giảng đường A1/A2",
        route_profile="NEU_DEMO", route_length_min_m=400, route_length_max_m=450,
        target_distance_m=50_000, total_laps=125, min_lap_interval_seconds=60,
        checkpoint_mode="GPS_ONLY")
    db.add(race)
    db.flush()
    by_code = {}
    for seq, (code, name, lat, lon) in enumerate(_checkpoints(), 1):
        cp = core.Checkpoint(race_id=race.id, code=code, name=name, sequence_no=seq,
            kind="LAP", latitude=lat, longitude=lon, radius_m=18)
        db.add(cp)
        db.flush()
        by_code[code] = cp
    cp_ids = {code: cp.id for code, cp in by_code.items()}
    for seq, (lat, lon, code) in enumerate(route, 1):
        db.add(core.RaceRoutePoint(race_id=race.id, sequence_no=seq, latitude=lat,
            longitude=lon, checkpoint_id=cp_ids.get(code) if code else None))
    db.add(mobile.StudentRacePolicy(race_id=race.id,
        description="Chạy tổng cộng 50 km trong 30 ngày; chia thành nhiều phiên.",
        published=True, registration_enabled=True, registration_opens_at=now - timedelta(minutes=1),
        registration_closes_at=now + timedelta(days=30), capacity=1000, version=1))
    db.add(StudentRaceChallenge(race_id=race.id, target_distance_m=50_000,
        duration_days=30, start_checkpoint_id=cp_ids["NEU-C04"],
        end_checkpoint_id=cp_ids["NEU-C04"]))
    # The student app's standard run start/finish APIs use this shared
    # geofence policy. Keep it aligned with the challenge-specific C04 policy
    # so the mobile demo can start and finish through the same contract.
    db.add(mobile.StudentAttendanceConfig(race_id=race.id,
        check_in_checkpoint_id=cp_ids["NEU-C04"],
        check_out_checkpoint_id=cp_ids["NEU-C04"],
        check_in_open_at=virtual_start_at, check_in_close_at=virtual_end_at,
        check_out_open_at=virtual_start_at, check_out_close_at=virtual_end_at,
        max_position_age_seconds=30, max_accuracy_m=30))
    db.add(core.Device(id=f"HEALTH-DEMO-{race.id[:8]}",
        name="Challenge GPS checkpoint demo", checkpoint_id=cp_ids["NEU-C04"], status="ACTIVE"))
    demo = HealthChallengeDemo(race_id=race.id, status="RUNNING", duration_seconds=duration_seconds,
        current_day=0, duration_days=30, virtual_start_date=virtual_start, started_at=now)
    db.add(demo)
    profiles = [
        ("HEALTH-DEMO-01", "Sinh viên Mô phỏng Chậm", "Khoa Quản trị kinh doanh", 2.3),
        ("HEALTH-DEMO-02", "Sinh viên Mô phỏng Đạt 50 km", "Khoa Kinh tế", 3.0),
        ("HEALTH-DEMO-03", "Sinh viên Mô phỏng Vượt 50 km", "Viện Công nghệ thông tin", 3.8),
    ]
    runners, accounts = [], []
    for index, (code, name, faculty, speed) in enumerate(profiles, 1):
        student = _ensure_student(db, code, name, faculty)
        db.add(core.RaceParticipant(race_id=race.id, student_id=student.id,
            bib_number=f"{index:02d}", registration_status="REGISTERED", registered_at=now))
        account = db.scalar(select(mobile.StudentAccount).where(mobile.StudentAccount.student_id == student.id))
        password = secrets.token_urlsafe(12)
        if not account:
            account = mobile.StudentAccount(student_id=student.id,
                password_hash=mobile._password_hash(password), status="ACTIVE", must_change_password=False)
            db.add(account)
        else:
            account.password_hash, account.status, account.must_change_password = mobile._password_hash(password), "ACTIVE", False
            for session in db.scalars(select(mobile.StudentAuthSession).where(
                    mobile.StudentAuthSession.account_id == account.id,
                    mobile.StudentAuthSession.revoked_at.is_(None))).all():
                session.revoked_at = now
        runners.append({"student_code": code, "full_name": name, "pace_mps": speed,
                        "display_id": f"{index:02d}"})
        accounts.append({"student_code": code, "password": password,
            "full_name": name, "display_id": f"{index:02d}",
            "login_endpoint": "/api/v1/student/auth/login"})
    db.commit()
    db.refresh(demo)
    return demo, runners, accounts, route_length


def _laps_for(index: int, day: int) -> int:
    if index == 1:
        return 3 if day % 2 == 0 else 2  # 30 km total; under target at race end.
    if index == 2:
        return 5 if day <= 5 else 4  # 50 km exactly.
    return 6 if day <= 21 else 4  # reaches 50 km on day 21, then continues.


def _month_snapshot(db: Session, demo: HealthChallengeDemo) -> dict[str, Any]:
    rows = db.scalars(select(HealthChallengeDemoDay).where(
        HealthChallengeDemoDay.demo_id == demo.id).order_by(
            HealthChallengeDemoDay.day_number, HealthChallengeDemoDay.student_id)).all()
    runners: dict[str, dict[str, Any]] = {}
    for row in rows:
        item = runners.setdefault(row.student_id, {"student_id": row.student_id,
            "days_recorded": 0, "distance_total_m": 0.0, "duration_total_s": 0,
            "steps_total": 0, "target_reached_at_day": None})
        item["days_recorded"] += 1
        item["distance_total_m"] += row.distance_m
        item["duration_total_s"] += row.duration_s
        item["steps_total"] += row.steps
        if item["target_reached_at_day"] is None and row.cumulative_distance_m >= 50_000:
            item["target_reached_at_day"] = row.day_number
    for item in runners.values():
        distance = item["distance_total_m"]
        item["distance_total_m"] = round(distance, 2)
        item["progress_percent"] = round(min(100, distance / 50_000 * 100), 2)
        item["distance_over_target_m"] = round(max(0, distance - 50_000), 2)
        item["status"] = "TARGET_REACHED" if distance >= 50_000 else "IN_PROGRESS"
        if demo.status == "COMPLETED" and distance < 50_000:
            item["status"] = "RACE_ENDED_BELOW_TARGET"
        student = db.get(core.Student, item["student_id"])
        item["student_code"] = student.student_code if student else None
        item["full_name"] = student.full_name if student else None
        participant = db.scalar(select(core.RaceParticipant).where(
            core.RaceParticipant.race_id == demo.race_id, core.RaceParticipant.student_id == item["student_id"]))
        item["display_id"] = participant.bib_number if participant else None
    route = core.race_route_dict(db, demo.race_id)
    return {"demo_id": demo.id, "race_id": demo.race_id, "status": demo.status,
        "current_day": demo.current_day, "duration_days": demo.duration_days,
        "duration_seconds": demo.duration_seconds, "target_distance_m": 50_000,
        "route_distance_m": route.get("distance_m"),
        "virtual_start_date": demo.virtual_start_date.isoformat(),
        "started_at": demo.started_at, "completed_at": demo.completed_at,
        "runners": list(runners.values()), "server_time": core.now_utc()}


async def _simulate_month(demo_id: str, runner_rows: list[dict[str, Any]]) -> None:
    try:
        for day in range(1, 31):
            with core.SessionLocal() as db:
                current = db.get(HealthChallengeDemo, demo_id)
                if not current or current.status != "RUNNING":
                    return
                wait_s = current.duration_seconds / current.duration_days
            await asyncio.sleep(wait_s)
            with core.SessionLocal() as db:
                demo = db.get(HealthChallengeDemo, demo_id)
                race = db.get(core.Race, demo.race_id)
                route = _scaled_route()
                route_length = sum(core.haversine_m(a[0], a[1], b[0], b[1]) for a, b in zip(route, route[1:]))
                virtual_date = demo.virtual_start_date + timedelta(days=day - 1)
                cp_finish = db.scalar(select(core.Checkpoint).where(
                    core.Checkpoint.race_id == race.id, core.Checkpoint.code == "NEU-C04"))
                for index, profile in enumerate(runner_rows, 1):
                    student = db.scalar(select(core.Student).where(core.Student.student_code == profile["student_code"]))
                    laps = _laps_for(index, day)
                    distance = route_length * laps
                    speed = profile["pace_mps"]
                    duration = max(1, round(distance / speed))
                    local_start = datetime.combine(virtual_date, time(hour=6, minute=30),
                        tzinfo=timezone(timedelta(hours=7)))
                    started = local_start.astimezone(timezone.utc)
                    ended = started + timedelta(seconds=duration)
                    run = core.RunSession(race_id=race.id, student_id=student.id,
                        source="HEALTH_DEMO", status="COMPLETED", started_at=started,
                        ended_at=ended, finalized_at=ended, distance_total_m=0,
                        duration_total_s=duration, lap_count=laps, last_lap_at=ended,
                        last_lap_duration_s=max(1, duration // laps), total_steps=round(distance / 0.72))
                    db.add(run)
                    db.flush()
                    prior = db.scalars(select(HealthChallengeDemoDay).where(
                        HealthChallengeDemoDay.demo_id == demo.id,
                        HealthChallengeDemoDay.student_id == student.id)).all()
                    cumulative = sum(row.distance_m for row in prior) + distance
                    lap_marks = [round(route_length * lap, 6) for lap in range(1, laps + 1)]
                    distances = sorted({0.0, *[float(x) for x in range(100, int(distance), 100)],
                                        *lap_marks, distance})
                    previous = None
                    last_point = None
                    point_by_distance = {}
                    for sequence, along in enumerate(distances, 1):
                        lat, lon = _point_at(route, along)
                        recorded = started + timedelta(seconds=round(duration * along / distance))
                        point = core.GpsPoint(run_id=run.id, latitude=lat, longitude=lon,
                            recorded_at=recorded, received_at=core.now_utc(), accuracy_m=5,
                            speed_mps=speed, total_steps=round(along / 0.72), source="SIMULATED_GPS",
                            idempotency_key=f"health-demo:{demo.id}:{day}:{student.id}:{sequence}",
                            sample_id=core.new_id(), sequence=sequence, segment_id=1)
                        if previous:
                            run.distance_total_m += core.haversine_m(previous[0], previous[1], lat, lon)
                        db.add(point)
                        db.flush()
                        previous, last_point = (lat, lon), point
                        point_by_distance[along] = point
                    run.total_steps = round(distance / 0.72)
                    # The course is calibrated to 400 m per lap; the samples follow
                    # that same polyline and the persisted total uses its measured length.
                    run.distance_total_m = distance
                    run.last_latitude, run.last_longitude = last_point.latitude, last_point.longitude
                    run.last_seen_at, run.last_gps_recorded_at = core.now_utc(), last_point.recorded_at
                    device = db.get(core.Device, f"HEALTH-DEMO-{race.id[:8]}")
                    first_point = point_by_distance[0.0]
                    start_passage = core.GPSPassage(race_id=race.id,
                        checkpoint_id=cp_finish.id, run_id=run.id, student_id=student.id,
                        wearable_device_id=f"SIM-HEALTH:{student.id}",
                        entry_gps_point_id=first_point.id, entry_at=started,
                        received_at=core.now_utc(), entry_distance_m=0,
                        telemetry_source="SIMULATED_GPS")
                    start_passage.id = core.new_id()
                    start_event = core.DeviceEvent(device_id=device.id, checkpoint_id=cp_finish.id,
                        occurred_at=started, received_at=core.now_utc(),
                        event_type="STUDENT_APP_START", source_event_id=f"health-demo:{demo.id}:{day}:{student.id}:start",
                        status="MATCHED", raw_payload="App GPS xác nhận điểm bắt đầu; dữ liệu mô phỏng.",
                        lap_status="NOT_COUNTED", reason_code="APP_GPS_START",
                        matched_run_id=run.id, passage_id=start_passage.id, candidates_final=True)
                    start_event.id = core.new_id()
                    db.add_all([start_passage, start_event])
                    for lap in range(1, laps + 1):
                        occurred = started + timedelta(seconds=max(1, duration // laps) * lap)
                        lap_event = core.LapEvent(run_id=run.id, checkpoint_id=cp_finish.id,
                            occurred_at=occurred,
                            lap_no=lap, duration_s=max(1, duration // laps), source="HEALTH_DEMO",
                            source_event_id=f"health-demo:{demo.id}:{day}:{student.id}:lap:{lap}")
                        db.add(lap_event)
                        db.flush()
                        finish_point = point_by_distance[round(route_length * lap, 6)]
                        passage = core.GPSPassage(race_id=race.id,
                            checkpoint_id=cp_finish.id, run_id=run.id, student_id=student.id,
                            wearable_device_id=f"SIM-HEALTH:{student.id}",
                            entry_gps_point_id=finish_point.id, entry_at=occurred,
                            received_at=core.now_utc(),
                            entry_distance_m=core.haversine_m(finish_point.latitude, finish_point.longitude,
                                cp_finish.latitude, cp_finish.longitude),
                            telemetry_source="SIMULATED_GPS")
                        passage.id = core.new_id()
                        event = core.DeviceEvent(device_id=device.id, checkpoint_id=cp_finish.id,
                            occurred_at=occurred, received_at=core.now_utc(),
                            event_type="SIMULATED_CHECKPOINT_PASSAGE",
                            source_event_id=f"health-demo:{demo.id}:{day}:{student.id}:passage:{lap}",
                            status="MATCHED", raw_payload="GPS + bước chân challenge mô phỏng.",
                            lap_status="COUNTED", reason_code="HEALTH_DEMO_SIMULATED",
                            matched_run_id=run.id, passage_id=passage.id, method="HEALTH_DEMO_SIMULATED",
                            lap_event_id=lap_event.id, lap_number=lap, candidates_final=True)
                        event.id = core.new_id()
                        passage.consumed_by_event_id = event.id
                        db.add_all([passage, event])
                    db.add(HealthChallengeDemoDay(demo_id=demo.id, race_id=race.id,
                        student_id=student.id, run_id=run.id, day_number=day,
                        virtual_date=virtual_date, distance_m=distance, duration_s=duration,
                        steps=run.total_steps, cumulative_distance_m=cumulative,
                        outcome="TARGET_REACHED" if cumulative >= 50_000 else "IN_PROGRESS"))
                demo.current_day = day
                if day == 30:
                    demo.status, demo.completed_at = "COMPLETED", core.now_utc()
                    race.status = "COMPLETED"
                    race.end_at = datetime.combine(virtual_date, time(23, 59), tzinfo=timezone.utc)
                db.commit()
                snapshot = _month_snapshot(db, demo)
                await core.hub.publish(race.id, {"event_id": core.new_id(),
                    "type": "challenge.day.updated", "race_id": race.id,
                    "occurred_at": core.now_utc().isoformat(), "data": snapshot})
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        with core.SessionLocal() as db:
            demo = db.get(HealthChallengeDemo, demo_id)
            if demo:
                demo.status, demo.error_message = "FAILED", str(exc)
                db.commit()


@router.post("/api/v1/demos/health-month", status_code=202, dependencies=[Depends(core.admin)])
async def start_health_month(data: HealthDemoStart = HealthDemoStart(), db: Session = Depends(core.db_session)):
    active = db.scalar(select(HealthChallengeDemo).where(HealthChallengeDemo.status == "RUNNING"))
    if active:
        return _month_snapshot(db, active)
    demo, runners, accounts, route_length = _create_month_demo(db, data.duration_seconds)
    _health_tasks[demo.id] = asyncio.create_task(_simulate_month(demo.id, runners))
    return {**_month_snapshot(db, demo), "route_distance_m": round(route_length, 2),
        "student_demo_accounts": accounts,
        "account_note": "Tài khoản demo và mật khẩu tạm chỉ được trả khi tạo; đổi thông tin nếu dùng ngoài môi trường demo."}


@router.get("/api/v1/demos/health-month/{demo_id}", dependencies=[Depends(core.admin)])
def get_health_month(demo_id: str, db: Session = Depends(core.db_session)):
    return _month_snapshot(db, core.get_or_404(db, HealthChallengeDemo, demo_id, "demo giải sức khỏe"))


@router.get("/api/v1/races/{race_id}/challenge/dashboard", dependencies=[Depends(core.admin)])
def challenge_dashboard(race_id: str, db: Session = Depends(core.db_session)):
    config = db.get(StudentRaceChallenge, race_id)
    if not config:
        core.envelope_error("CHALLENGE_NOT_FOUND", "Giải chưa cấu hình challenge sức khỏe.", 404)
    runners = []
    for participant in db.scalars(select(core.RaceParticipant).where(
            core.RaceParticipant.race_id == race_id).order_by(core.RaceParticipant.bib_number)).all():
        student = db.get(core.Student, participant.student_id)
        progress = _challenge_progress(db, race_id, student.id)
        runners.append({"display_id": participant.bib_number, "student_id": student.id,
            "student_code": student.student_code, "full_name": student.full_name,
            **{key: progress[key] for key in ("total_distance_m", "remaining_distance_m",
                "progress_percent", "distance_over_target_m", "total_duration_s", "total_steps",
                "completed_sessions", "target_reached", "target_reached_at", "continue_allowed")}})
    race = db.get(core.Race, race_id)
    return {"race_id": race_id, "race_name": race.name, "race_status": race.status,
        "target_distance_m": config.target_distance_m, "duration_days": config.duration_days,
        "start_checkpoint_id": config.start_checkpoint_id, "end_checkpoint_id": config.end_checkpoint_id,
        "runners": runners, "server_time": core.now_utc()}


@router.delete("/api/v1/demos/health-month/{demo_id}", dependencies=[Depends(core.admin)])
def delete_health_month(demo_id: str, db: Session = Depends(core.db_session)):
    demo = core.get_or_404(db, HealthChallengeDemo, demo_id, "demo giải sức khỏe")
    task = _health_tasks.get(demo_id)
    if task and not task.done():
        task.cancel()
    race_id = demo.race_id
    run_ids = set(db.scalars(select(HealthChallengeDemoDay.run_id).where(
        HealthChallengeDemoDay.demo_id == demo_id)).all())
    run_ids.update(db.scalars(select(ChallengeAppSession.run_id).where(
        ChallengeAppSession.race_id == race_id)).all())
    checkpoint_ids = db.scalars(select(core.Checkpoint.id).where(core.Checkpoint.race_id == race_id)).all()
    event_filter = core.DeviceEvent.checkpoint_id.in_(checkpoint_ids) if checkpoint_ids else core.DeviceEvent.id == ""
    if run_ids:
        event_filter = core.or_(event_filter, core.DeviceEvent.matched_run_id.in_(run_ids))
    event_ids = db.scalars(select(core.DeviceEvent.id).where(event_filter)).all()
    passage_filter = core.GPSPassage.checkpoint_id.in_(checkpoint_ids) if checkpoint_ids else core.GPSPassage.id == ""
    if run_ids:
        passage_filter = core.or_(passage_filter, core.GPSPassage.run_id.in_(run_ids))
    passage_ids = db.scalars(select(core.GPSPassage.id).where(passage_filter)).all()
    if event_ids:
        db.query(core.MatchAudit).filter(core.MatchAudit.event_id.in_(event_ids)).delete(synchronize_session=False)
        db.query(core.GPSPassage).filter(core.GPSPassage.consumed_by_event_id.in_(event_ids)).update(
            {core.GPSPassage.consumed_by_event_id: None}, synchronize_session=False)
        db.query(core.DeviceEvent).filter(core.DeviceEvent.id.in_(event_ids)).update(
            {core.DeviceEvent.passage_id: None}, synchronize_session=False)
        db.query(core.DeviceEvent).filter(core.DeviceEvent.id.in_(event_ids)).delete(synchronize_session=False)
    if passage_ids:
        db.query(core.GPSPassage).filter(core.GPSPassage.id.in_(passage_ids)).delete(synchronize_session=False)
    db.query(HealthChallengeDemoDay).filter(HealthChallengeDemoDay.demo_id == demo_id).delete(synchronize_session=False)
    db.query(HealthChallengeDemo).filter(HealthChallengeDemo.id == demo_id).delete(synchronize_session=False)
    db.query(ChallengeAppSession).filter(ChallengeAppSession.race_id == race_id).delete(synchronize_session=False)
    db.query(StudentRaceChallenge).filter(StudentRaceChallenge.race_id == race_id).delete(synchronize_session=False)
    db.query(mobile.StudentRacePolicy).filter(mobile.StudentRacePolicy.race_id == race_id).delete(synchronize_session=False)
    db.query(core.RaceParticipant).filter(core.RaceParticipant.race_id == race_id).delete(synchronize_session=False)
    db.query(core.RaceRoutePoint).filter(core.RaceRoutePoint.race_id == race_id).delete(synchronize_session=False)
    db.query(core.Device).filter(core.Device.id == f"HEALTH-DEMO-{race_id[:8]}").delete(synchronize_session=False)
    if run_ids:
        db.query(mobile.StudentRunPause).filter(mobile.StudentRunPause.run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(mobile.MobileGpsBatchReceipt).filter(mobile.MobileGpsBatchReceipt.run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(core.IdempotencyRecord).filter(core.IdempotencyRecord.resource_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(core.GeofenceState).filter(core.GeofenceState.run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(core.GpsPoint).filter(core.GpsPoint.run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(core.LapEvent).filter(core.LapEvent.run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(core.RunSession).filter(core.RunSession.id.in_(run_ids)).delete(synchronize_session=False)
    db.query(core.Checkpoint).filter(core.Checkpoint.race_id == race_id).delete(synchronize_session=False)
    db.query(core.Race).filter(core.Race.id == race_id).delete(synchronize_session=False)
    db.commit()
    return {"deleted": True, "demo_id": demo_id, "race_id": race_id}
