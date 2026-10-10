"""FastAPI backend for the NEU Smart Running checkpoint system.

The comments are intentionally instructional: each section explains its role so
the project can be used as both a working baseline and a learning reference.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, func, inspect, select, text, update
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker


# 1. Configuration: secrets and database settings come from .env, never source code.
class Settings(BaseSettings):
    database_url: str = "sqlite:///./running_demo.db"
    admin_api_key: str = "dev-admin-key-change-me"
    simulator_api_key: str = "dev-simulator-key-change-me"
    wearable_api_key: str = "dev-wearable-key-change-me"
    gateway_api_key: str = "dev-gateway-key-change-me"
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    min_lap_interval_seconds: int = 30
    max_gps_speed_mps: float = 12.0
    max_simulator_speed_mps: float = 18.0
    simulator_base_url: str = "http://127.0.0.1:8000"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
logger = logging.getLogger("uvicorn.error")


def resolve_database_url(database_url: str) -> str:
    """Resolve local SQLite files beside the backend, independent of shell cwd."""
    if not database_url.startswith("sqlite:") or ":memory:" in database_url:
        return database_url
    prefix = "sqlite:///"
    raw_path = database_url[len(prefix):] if database_url.startswith(prefix) else None
    if raw_path is None or raw_path.startswith("/") or (len(raw_path) > 1 and raw_path[1] == ":"):
        return database_url
    backend_root = Path(__file__).resolve().parent.parent
    absolute_path = (backend_root / raw_path).resolve()
    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{absolute_path.as_posix()}"


database_url = resolve_database_url(settings.database_url)
sqlite_options = {"check_same_thread": False} if database_url.startswith("sqlite:") else {}
engine = create_engine(database_url, pool_pre_ping=True, connect_args=sqlite_options)

if database_url.startswith("sqlite:"):
    from sqlalchemy import event

    @event.listens_for(engine, "connect")
    def configure_sqlite_connection(dbapi_connection, _connection_record) -> None:
        """Enforce foreign keys and durable, concurrent-friendly local writes."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def now_utc() -> datetime:
    """Return timezone-aware UTC server time; source timestamps stay separate."""
    return datetime.now(timezone.utc)


def new_id() -> str:
    """Generate public UUID string identifiers consistently."""
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


# 2. Persistence models: normalized tables preserve history and support queries.
class Race(Base):
    __tablename__ = "races"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(160))
    start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT")
    route_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    route_profile: Mapped[str] = mapped_column(String(30), default="CUSTOM")
    route_length_min_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    route_length_max_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_laps: Mapped[int] = mapped_column(Integer, default=4)
    min_lap_interval_seconds: Mapped[int] = mapped_column(Integer, default=30)
    checkpoint_mode: Mapped[str] = mapped_column(String(30), default="GPS_ONLY")
    inner_radius_m: Mapped[float] = mapped_column(Float, default=10)
    outer_radius_m: Mapped[float] = mapped_column(Float, default=15)
    match_window_seconds: Mapped[int] = mapped_column(Integer, default=3)
    late_grace_seconds: Mapped[int] = mapped_column(Integer, default=2)
    max_sample_gap_seconds: Mapped[int] = mapped_column(Integer, default=5)
    max_event_age_seconds: Mapped[int] = mapped_column(Integer, default=10)
    max_future_skew_seconds: Mapped[int] = mapped_column(Integer, default=2)
    config_version: Mapped[int] = mapped_column(Integer, default=1)
    matching_locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    participants: Mapped[list["RaceParticipant"]] = relationship(back_populates="race", cascade="all, delete-orphan")
    checkpoints: Mapped[list["Checkpoint"]] = relationship(back_populates="race", cascade="all, delete-orphan")
    route_points: Mapped[list["RaceRoutePoint"]] = relationship(back_populates="race", cascade="all, delete-orphan", order_by="RaceRoutePoint.sequence_no")


class Student(Base):
    __tablename__ = "students"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    student_code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    faculty: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")


class RaceParticipant(Base):
    __tablename__ = "race_participants"
    __table_args__ = (UniqueConstraint("race_id", "student_id", name="uq_race_student"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), index=True)
    bib_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    registration_status: Mapped[str] = mapped_column(String(20), default="REGISTERED")
    race: Mapped[Race] = relationship(back_populates="participants")


class Checkpoint(Base):
    __tablename__ = "checkpoints"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    code: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(120))
    sequence_no: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(20), default="LAP")
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    radius_m: Mapped[float] = mapped_column(Float, default=25)
    race: Mapped[Race] = relationship(back_populates="checkpoints")


class RaceRoutePoint(Base):
    """Ordered GPS polyline used by the map and the moving demo simulator."""
    __tablename__ = "race_route_points"
    __table_args__ = (UniqueConstraint("race_id", "sequence_no", name="uq_route_point_sequence"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id", ondelete="CASCADE"), index=True)
    sequence_no: Mapped[int] = mapped_column(Integer)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    checkpoint_id: Mapped[str | None] = mapped_column(ForeignKey("checkpoints.id"), nullable=True, index=True)
    race: Mapped[Race] = relationship(back_populates="route_points")


class RunSession(Base):
    __tablename__ = "run_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), index=True)
    wearable_device_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(30), default="SIMULATOR")
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    distance_total_m: Mapped[float] = mapped_column(Float, default=0)
    duration_total_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lap_count: Mapped[int] = mapped_column(Integer, default=0)
    last_lap_duration_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_steps: Mapped[int] = mapped_column(Integer, default=0)
    last_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_gps_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_lap_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class GpsPoint(Base):
    __tablename__ = "gps_points"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_gps_idempotency"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("run_sessions.id"), index=True)
    wearable_device_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed_mps: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_steps: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(30))
    idempotency_key: Mapped[str] = mapped_column(String(120))
    payload_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)


class GPSPassage(Base):
    """Durable outside-to-inside GPS evidence for route checkpoints."""
    __tablename__ = "gps_passages"
    __table_args__ = (UniqueConstraint("run_id", "checkpoint_id", "entry_at", name="uq_passage_run_checkpoint_entry"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), index=True)
    checkpoint_id: Mapped[str] = mapped_column(ForeignKey("checkpoints.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("run_sessions.id"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), index=True)
    wearable_device_id: Mapped[str] = mapped_column(String(80), index=True)
    previous_gps_point_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    entry_gps_point_id: Mapped[str] = mapped_column(String(36))
    entry_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    entry_distance_m: Mapped[float] = mapped_column(Float)
    telemetry_source: Mapped[str] = mapped_column(String(30), default="SIMULATED_GPS")
    config_version: Mapped[int] = mapped_column(Integer, default=1)
    consumed_by_event_id: Mapped[str | None] = mapped_column(String(36), nullable=True, unique=True)


class GeofenceState(Base):
    """Persistent hysteresis state per run/checkpoint."""
    __tablename__ = "geofence_states"
    __table_args__ = (UniqueConstraint("run_id", "checkpoint_id", name="uq_geofence_run_checkpoint"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("run_sessions.id"), index=True)
    checkpoint_id: Mapped[str] = mapped_column(ForeignKey("checkpoints.id"), index=True)
    region: Mapped[str] = mapped_column(String(20), default="UNKNOWN")
    last_gps_point_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    last_sample_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    config_version: Mapped[int] = mapped_column(Integer, default=1)


class LapEvent(Base):
    __tablename__ = "lap_events"
    __table_args__ = (UniqueConstraint("source_event_id", name="uq_lap_source_event"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("run_sessions.id"), index=True)
    checkpoint_id: Mapped[str] = mapped_column(ForeignKey("checkpoints.id"))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lap_no: Mapped[int] = mapped_column(Integer)
    duration_s: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(30))
    source_event_id: Mapped[str] = mapped_column(String(120))
    validation_status: Mapped[str] = mapped_column(String(20), default="VALID")


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    checkpoint_id: Mapped[str | None] = mapped_column(ForeignKey("checkpoints.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RunnerWearable(Base):
    """GPS + step-count device assigned to one runner; distinct from checkpoint Arduino."""
    __tablename__ = "runner_wearables"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DeviceEvent(Base):
    __tablename__ = "device_events"
    __table_args__ = (UniqueConstraint("source_event_id", name="uq_device_source_event"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), index=True)
    checkpoint_id: Mapped[str] = mapped_column(ForeignKey("checkpoints.id"), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    event_type: Mapped[str] = mapped_column(String(40))
    source_event_id: Mapped[str] = mapped_column(String(120))
    student_id: Mapped[str | None] = mapped_column(ForeignKey("students.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="UNASSIGNED")
    raw_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lap_status: Mapped[str] = mapped_column(String(20), default="NOT_EVALUATED")
    reason_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    match_deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    matched_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    passage_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    lap_event_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    lap_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lap_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    candidates_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    candidates_final: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    config_version: Mapped[int | None] = mapped_column(Integer, nullable=True)


class MatchAudit(Base):
    __tablename__ = "match_audits"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("device_events.id"), index=True)
    action: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(String(500))
    actor: Mapped[str] = mapped_column(String(40), default="ADMIN_KEY_DEMO")
    idempotency_key: Mapped[str] = mapped_column(String(120), unique=True)
    request_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    key: Mapped[str] = mapped_column(String(140), primary_key=True)
    resource_id: Mapped[str] = mapped_column(String(36))
    request_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


# 3. API contracts: explicit types document exactly what the web/IoT clients send.
class RaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    start_at: datetime | None = None
    end_at: datetime | None = None
    status: str = "DRAFT"
    route_name: str | None = None
    route_profile: str = "CUSTOM"
    route_length_min_m: float | None = Field(default=None, gt=0, le=100000)
    route_length_max_m: float | None = Field(default=None, gt=0, le=100000)
    total_laps: int = Field(default=4, ge=1, le=100)
    min_lap_interval_seconds: int | None = Field(default=None, ge=1, le=3600)
    checkpoint_mode: str = "GPS_ONLY"


class StudentIn(BaseModel):
    student_code: str
    full_name: str
    faculty: str | None = None


class RunnerWearableIn(BaseModel):
    """Admin registers the wearable that sends both a runner's GPS and steps."""
    device_id: str = Field(min_length=1, max_length=80)
    student_id: str
    name: str = "GPS + step wearable"


class CheckpointIn(BaseModel):
    code: str
    name: str
    sequence_no: int = Field(ge=1)
    kind: str = "LAP"
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    radius_m: float = Field(default=25, gt=0)


class CheckpointPatch(BaseModel):
    """Partial Admin edit for a checkpoint marker and its geofence radius."""
    name: str | None = Field(default=None, min_length=1, max_length=120)
    sequence_no: int | None = Field(default=None, ge=1)
    kind: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    radius_m: float | None = Field(default=None, gt=0)


class RoutePointIn(BaseModel):
    """A route vertex; checkpoint_id marks a vertex that must coincide with a checkpoint."""
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    checkpoint_id: str | None = None


class RouteReplaceIn(BaseModel):
    """Closed, ordered map polyline with every checkpoint represented as an anchor."""
    points: list[RoutePointIn] = Field(min_length=5, max_length=500)


class ParticipantIn(BaseModel):
    student_id: str
    bib_number: str | None = None


class RunIn(BaseModel):
    race_id: str
    student_id: str
    wearable_device_id: str
    source: str = "SIMULATOR"
    idempotency_key: str = Field(min_length=1, max_length=120)
    started_at: datetime | None = None


class SimulationStartIn(BaseModel):
    """Controls for the five-runner demo launched from the Admin Web."""
    checkpoint_mode: str = "GPS_ONLY"
    seed: int = 42
    interval_seconds: float = Field(default=0.5, ge=0.5, le=5)


class GpsIn(BaseModel):
    idempotency_key: str = Field(min_length=1, max_length=120)
    race_id: str
    run_id: str
    student_id: str
    wearable_device_id: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    recorded_at: datetime
    accuracy_m: float | None = Field(default=None, ge=0)
    speed_mps: float | None = Field(default=None, ge=0)
    total_steps: int = Field(ge=0)
    source: str = "SIMULATOR"


class DeviceEventIn(BaseModel):
    source_event_id: str = Field(validation_alias=AliasChoices("source_event_id", "device_event_id"))
    device_id: str
    checkpoint_id: str | None = None
    event_type: str = "PASSAGE_DETECTED"
    occurred_at: datetime
    student_id: str | None = None
    raw_payload: str | None = None


class CheckpointDeviceIn(BaseModel):
    device_id: str = Field(min_length=1, max_length=80)
    name: str = Field(default="Arduino checkpoint gateway", max_length=120)


class MatchingConfigPatch(BaseModel):
    checkpoint_mode: str | None = None
    inner_radius_m: float | None = Field(default=None, gt=0)
    outer_radius_m: float | None = Field(default=None, gt=0)
    match_window_seconds: int | None = Field(default=None, ge=0, le=60)
    late_grace_seconds: int | None = Field(default=None, ge=0, le=60)
    max_sample_gap_seconds: int | None = Field(default=None, gt=0, le=300)
    max_event_age_seconds: int | None = Field(default=None, gt=0, le=3600)
    max_future_skew_seconds: int | None = Field(default=None, ge=0, le=60)


class ResolveEventIn(BaseModel):
    action: str
    passage_id: str | None = None
    expected_version: int = Field(ge=1)
    idempotency_key: str = Field(min_length=1, max_length=120)
    reason: str = Field(min_length=1, max_length=500)


class LapIn(BaseModel):
    source_event_id: str
    run_id: str
    student_id: str
    checkpoint_id: str
    occurred_at: datetime
    source: str = "SIMULATOR"


class FinishIn(BaseModel):
    reason: str = "ADMIN"
    source_event_id: str | None = None


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class EventHub:
    """In-memory WebSocket fan-out for one process; use Redis pub/sub for replicas."""
    def __init__(self) -> None:
        self.clients: dict[str, set[WebSocket]] = {}

    async def connect(self, race_id: str, socket: WebSocket) -> None:
        await socket.accept()
        self.clients.setdefault(race_id, set()).add(socket)

    def disconnect(self, race_id: str, socket: WebSocket) -> None:
        self.clients.get(race_id, set()).discard(socket)

    async def publish(self, race_id: str, payload: dict[str, Any]) -> None:
        stale = []
        for socket in self.clients.get(race_id, set()):
            try:
                await socket.send_json(payload)
            except Exception:
                stale.append(socket)
        for socket in stale:
            self.disconnect(race_id, socket)


hub = EventHub()
app = FastAPI(title="NEU Smart Running Backend", version="1.0.0", description="Backend web cho giải chạy NEU: REST, SQLite và WebSocket.")
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# One process-local job registry powers the demo control API. The telemetry,
# laps, and race results themselves remain durable in the configured database.
_simulation_jobs: dict[str, dict[str, Any]] = {}
_simulation_jobs_lock = threading.Lock()


def _simulation_job_snapshot(job_id: str) -> dict[str, Any]:
    job = _simulation_jobs.get(job_id)
    if not job:
        raise HTTPException(404, detail={"code": "SIMULATION_NOT_FOUND", "message": "Không tìm thấy phiên mô phỏng trên backend này.", "details": [], "trace_id": new_id()})
    process: subprocess.Popen | None = job["process"]
    return_code = process.poll() if process else None
    if job.get("stop_requested"):
        status = "STOPPED" if return_code is not None else "STOPPING"
    elif return_code is None:
        status = "RUNNING"
    else:
        status = "COMPLETED" if return_code == 0 else "FAILED"
    if return_code is not None and not job.get("finished_at"):
        job["finished_at"] = now_utc()
    try:
        with open(job["log_path"], "r", encoding="utf-8", errors="replace") as log_file:
            lines = log_file.readlines()[-60:]
        log_text = "".join(lines)
    except OSError:
        log_text = ""
    match = re.search(r"Race ([0-9a-f-]{36})", log_text, re.IGNORECASE)
    race_id = match.group(1) if match else job.get("race_id")
    if race_id:
        job["race_id"] = race_id
    return {"simulation_id": job_id, "status": status, "race_id": race_id,
            "students": 5, "laps_required": 4, "checkpoint_mode": job["mode"],
            "started_at": job["started_at"], "finished_at": job.get("finished_at") if return_code is not None else None,
            "exit_code": return_code, "log_tail": log_text[-6000:]}


def _cancel_simulation_runs(race_id: str) -> None:
    """Stop clocks for a deliberately stopped demo before allowing race deletion."""
    with SessionLocal() as db:
        race = db.get(Race, race_id)
        if not race:
            return
        stopped_at = now_utc()
        active_runs = db.scalars(select(RunSession).where(RunSession.race_id == race_id, RunSession.status == "ACTIVE")).all()
        for run in active_runs:
            run.status = "CANCELLED"
            run.ended_at = stopped_at
            run.duration_total_s = max(0, int((stopped_at - aware(run.started_at)).total_seconds()))
        if active_runs:
            race.status = "CANCELLED"
            race.end_at = stopped_at
        db.commit()


# 4. Shared request helpers: one DB session per request and role-specific API keys.
def db_session():
    with SessionLocal() as db:
        yield db


def require_key(expected: str, supplied: str | None, role: str) -> None:
    if not supplied or supplied != expected:
        raise HTTPException(401, detail={"code": "UNAUTHORIZED", "message": f"Thiếu hoặc sai API key cho {role}.", "details": [], "trace_id": new_id()})


def admin(x_admin_key: str | None = Header(default=None)) -> None:
    require_key(settings.admin_api_key, x_admin_key, "admin")


def simulator(x_simulator_key: str | None = Header(default=None)) -> None:
    require_key(settings.simulator_api_key, x_simulator_key, "simulator")


def gps_ingest_auth(
    x_simulator_key: str | None = Header(default=None),
    x_wearable_key: str | None = Header(default=None),
) -> str:
    """Return the authenticated telemetry source so demo and hardware limits differ."""
    if x_simulator_key and x_wearable_key:
        raise HTTPException(400, detail={"code": "AMBIGUOUS_INGEST_CREDENTIALS", "message": "Chỉ gửi một trong X-Simulator-Key hoặc X-Wearable-Key.", "details": [], "trace_id": new_id()})
    if x_simulator_key and x_simulator_key == settings.simulator_api_key:
        return "SIMULATOR"
    if x_wearable_key and x_wearable_key == settings.wearable_api_key:
        return "WEARABLE"
    raise HTTPException(401, detail={"code": "UNAUTHORIZED", "message": "Thiếu hoặc sai simulator/wearable API key.", "details": [], "trace_id": new_id()})


def run_create_auth(
    x_admin_key: str | None = Header(default=None),
    x_simulator_key: str | None = Header(default=None),
) -> str:
    """Allow Admin Web or the demo simulator to start an already-registered run."""
    if x_admin_key == settings.admin_api_key:
        return "ADMIN"
    if x_simulator_key == settings.simulator_api_key:
        return "SIMULATOR"
    raise HTTPException(401, detail={"code": "UNAUTHORIZED", "message": "Cần Admin key hoặc Simulator key để tạo phiên chạy.", "details": [], "trace_id": new_id()})


def gateway(x_gateway_key: str | None = Header(default=None)) -> None:
    require_key(settings.gateway_api_key, x_gateway_key, "gateway")


def get_or_404(db: Session, model: Any, object_id: str, label: str):
    obj = db.get(model, object_id)
    if not obj:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": f"Không tìm thấy {label}.", "details": [], "trace_id": new_id()})
    return obj


def envelope_error(code: str, message: str, status: int = 409):
    raise HTTPException(status, detail={"code": code, "message": message, "details": [], "trace_id": new_id()})


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute surface distance in meters between consecutive accepted GPS fixes."""
    radius = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def route_length_m(points: list[Any]) -> float:
    """Measure every ordered leg, including the short closing leg to the start."""
    if len(points) < 2:
        return 0.0
    legs = sum(haversine_m(a.latitude, a.longitude, b.latitude, b.longitude)
               for a, b in zip(points, points[1:]))
    return legs + haversine_m(points[-1].latitude, points[-1].longitude,
                              points[0].latitude, points[0].longitude)


def race_route_dict(db: Session, race_id: str) -> dict[str, Any]:
    points = db.scalars(select(RaceRoutePoint).where(RaceRoutePoint.race_id == race_id).order_by(RaceRoutePoint.sequence_no)).all()
    return {
        "points": [{"sequence_no": p.sequence_no, "latitude": p.latitude, "longitude": p.longitude,
                    "checkpoint_id": p.checkpoint_id} for p in points],
        "distance_m": round(route_length_m(points), 2) if len(points) > 1 else 0,
    }


def lock_race_configuration(db: Session, race_id: str) -> Race:
    """Serialize route/config edits against run creation for the same race.

    SQL Server honors SELECT FOR UPDATE. SQLite has no row-level FOR UPDATE, so
    the no-op UPDATE obtains its write lock before either operation checks state.
    """
    race = db.scalar(select(Race).where(Race.id == race_id).with_for_update())
    if not race:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Không tìm thấy giải chạy.", "details": [], "trace_id": new_id()})
    if engine.dialect.name == "sqlite":
        db.execute(update(Race).where(Race.id == race_id).values(config_version=Race.config_version))
    return race


def route_lock_metadata(db: Session, race_id: str) -> dict[str, Any]:
    locked = db.scalar(select(RunSession.id).where(RunSession.race_id == race_id).limit(1)) is not None
    return {"editable": not locked, "locked": locked,
            "locked_reason": "Đã tạo ít nhất một phiên chạy cho giải này." if locked else None}


def aware(value: datetime) -> datetime:
    """Normalize naive client ISO timestamps to UTC; aware timestamps convert to UTC."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def race_matching_config(race: Race) -> dict[str, Any]:
    return {name: getattr(race, name) for name in (
        "checkpoint_mode", "min_lap_interval_seconds", "inner_radius_m", "outer_radius_m", "match_window_seconds",
        "late_grace_seconds", "max_sample_gap_seconds", "max_event_age_seconds",
        "max_future_skew_seconds", "config_version",
    )}


def maybe_complete_race(db: Session, race: Race, ended_at: datetime) -> None:
    participant_ids = db.scalars(select(RaceParticipant.student_id).where(RaceParticipant.race_id == race.id)).all()
    if not participant_ids:
        return
    for student_id in participant_ids:
        latest = db.scalar(select(RunSession).where(RunSession.race_id == race.id, RunSession.student_id == student_id).order_by(RunSession.started_at.desc()).limit(1))
        if not latest or latest.status != "COMPLETED":
            return
    race.status = "COMPLETED"
    race.end_at = aware(ended_at)


def maybe_complete_run(db: Session, run: RunSession, crossed_at: datetime) -> bool:
    """Stop the clock and mark the runner complete as soon as the race lap target is met."""
    race = db.get(Race, run.race_id)
    if run.status == "ACTIVE" and race and run.lap_count >= race.total_laps:
        run.status = "COMPLETED"
        run.ended_at = aware(crossed_at)
        run.duration_total_s = max(0, int((aware(crossed_at) - aware(run.started_at)).total_seconds()))
        maybe_complete_race(db, race, crossed_at)
        return True
    return False


def record_lap(db: Session, run: RunSession, checkpoint: Checkpoint, crossed_at: datetime, source: str, source_event_id: str) -> tuple[bool, int | None]:
    """Apply the shared minimum-time and total-lap rules; never count beyond the target."""
    if run.status != "ACTIVE":
        return False, None
    race = db.get(Race, run.race_id)
    occurred = aware(crossed_at)
    anchor = aware(run.last_lap_at or run.started_at)
    duration = int((occurred - anchor).total_seconds())
    minimum_lap_seconds = race.min_lap_interval_seconds if race else settings.min_lap_interval_seconds
    if occurred <= anchor or duration < minimum_lap_seconds:
        return False, duration
    if race and run.lap_count >= race.total_laps:
        return False, duration
    run.lap_count += 1
    run.last_lap_duration_s = duration
    run.last_lap_at = occurred
    lap = LapEvent(run_id=run.id, checkpoint_id=checkpoint.id, occurred_at=occurred, lap_no=run.lap_count, duration_s=duration, source=source, source_event_id=source_event_id)
    db.add(lap)
    db.flush()
    maybe_complete_run(db, run, occurred)
    return True, duration


def checkpoint_event_dict(db: Session, event: DeviceEvent, *, include_candidates: bool = True) -> dict[str, Any]:
    checkpoint = db.get(Checkpoint, event.checkpoint_id)
    run = db.get(RunSession, event.matched_run_id) if event.matched_run_id else None
    student = db.get(Student, run.student_id) if run else None
    participant = db.scalar(select(RaceParticipant).where(RaceParticipant.race_id == checkpoint.race_id, RaceParticipant.student_id == run.student_id)) if checkpoint and run else None
    result = {
        "event_id": event.id, "race_id": checkpoint.race_id if checkpoint else None,
        "checkpoint_id": event.checkpoint_id, "device_id": event.device_id,
        "device_event_id": event.source_event_id, "identity_status": event.status,
        "occurred_at": event.occurred_at, "received_at": event.received_at,
        "match_deadline_at": event.match_deadline_at, "match_status": event.status,
        "lap_status": event.lap_status, "reason_code": event.reason_code,
        "matched_runner": ({"student_id": run.student_id, "student_code": student.student_code if student else None,
            "full_name": student.full_name if student else None, "display_id": participant.bib_number if participant else None,
            "run_id": run.id, "wearable_device_id": run.wearable_device_id} if run else None),
        "method": event.method, "passage_id": event.passage_id, "lap_id": event.lap_event_id,
        "lap_number": event.lap_number, "lap_duration_ms": event.lap_duration_ms,
        "candidates": json.loads(event.candidates_json or "[]") if include_candidates else None,
        "candidates_final": bool(event.candidates_final), "version": event.version,
        "config_version": event.config_version,
        "checkpoint_source": "ARDUINO_GATEWAY",
        "telemetry_source": "SIMULATED_GPS" if event.method in {"AUTO_GPS_CORRELATION", "ADMIN_CONFIRMED_GPS_CORRELATION"} else None,
    }
    return result


def eligible_passages(db: Session, event: DeviceEvent, checkpoint: Checkpoint, race: Race) -> list[dict[str, Any]]:
    """Return only GPS entries inside the event's saved time window and before its deadline."""
    window = race.match_window_seconds
    low = aware(event.occurred_at).timestamp() - window
    high = aware(event.occurred_at).timestamp() + window
    rows = db.scalars(select(GPSPassage).where(
        GPSPassage.race_id == race.id,
        GPSPassage.checkpoint_id == checkpoint.id,
        GPSPassage.consumed_by_event_id.is_(None),
    )).all()
    candidates = []
    for passage in rows:
        entry_at = aware(passage.entry_at)
        if not low <= entry_at.timestamp() <= high:
            continue
        if event.match_deadline_at and aware(passage.received_at) > aware(event.match_deadline_at):
            continue
        if passage.entry_distance_m > race.inner_radius_m:
            continue
        if passage.config_version != race.config_version:
            continue
        run = db.get(RunSession, passage.run_id)
        participant = db.scalar(select(RaceParticipant.id).where(RaceParticipant.race_id == race.id, RaceParticipant.student_id == passage.student_id))
        wearable = db.get(RunnerWearable, passage.wearable_device_id)
        if not run or not participant or not wearable or wearable.student_id != passage.student_id:
            continue
        if aware(run.started_at) > entry_at or (run.ended_at and entry_at > aware(run.ended_at)):
            continue
        student = db.get(Student, passage.student_id)
        registration = db.scalar(select(RaceParticipant).where(RaceParticipant.race_id == race.id, RaceParticipant.student_id == passage.student_id))
        delta_ms = int((entry_at - aware(event.occurred_at)).total_seconds() * 1000)
        candidates.append({
            "passage_id": passage.id, "student_id": passage.student_id,
            "student_code": student.student_code if student else None,
            "display_id": registration.bib_number if registration else None,
            "run_id": passage.run_id, "wearable_device_id": passage.wearable_device_id,
            "entry_at": entry_at.isoformat(), "entry_distance_m": round(passage.entry_distance_m, 2),
            "time_delta_ms": delta_ms, "available": True,
        })
    return sorted(candidates, key=lambda x: (x["entry_distance_m"], abs(x["time_delta_ms"]), x["passage_id"]))


def finish_match(db: Session, event: DeviceEvent, candidate: dict[str, Any], passage: GPSPassage, *, method: str) -> dict[str, Any]:
    """Bind one verified passage and count the lap only when all run rules pass."""
    run = get_or_404(db, RunSession, candidate["run_id"], "phiên chạy")
    checkpoint = get_or_404(db, Checkpoint, event.checkpoint_id, "checkpoint")
    event.status = "MATCHED"
    event.student_id = run.student_id
    event.matched_run_id = run.id
    event.passage_id = passage.id
    event.method = method
    event.reason_code = None
    event.candidates_final = True
    passage.consumed_by_event_id = event.id
    event.lap_status = "NOT_COUNTED"
    if run.status != "ACTIVE":
        event.reason_code = "RUN_NOT_ACTIVE"
    elif checkpoint.kind != "LAP":
        event.reason_code = "CHECKPOINT_NOT_LAP"
    else:
        lap_source_id = f"device-event:{event.id}"
        counted, duration = record_lap(db, run, checkpoint, aware(event.occurred_at), "ARDUINO_GATEWAY", lap_source_id)
        if counted:
            lap = db.scalar(select(LapEvent).where(LapEvent.source_event_id == lap_source_id))
            event.lap_status = "COUNTED"
            event.lap_event_id = lap.id if lap else None
            event.lap_number = run.lap_count
            event.lap_duration_ms = (duration or 0) * 1000
        elif duration is None:
            event.reason_code = "RUN_NOT_ACTIVE"
        elif duration < 0:
            event.reason_code = "NON_MONOTONIC_CROSSING_TIME"
        else:
            event.reason_code = "MIN_LAP_INTERVAL_NOT_MET"
    return {"completed": run.status == "COMPLETED", "race_id": run.race_id, "student_id": run.student_id, "run_id": run.id}


def match_due_events(db: Session) -> list[dict[str, Any]]:
    """Durably settle due events; repeated worker scans are safe because terminal rows are skipped."""
    now = now_utc()
    due = db.scalars(select(DeviceEvent).where(DeviceEvent.status == "PENDING_MATCH", DeviceEvent.match_deadline_at <= now).order_by(DeviceEvent.match_deadline_at).with_for_update()).all()
    candidate_map: dict[str, list[dict[str, Any]]] = {}
    passage_events: dict[str, list[str]] = {}
    for event in due:
        checkpoint = db.get(Checkpoint, event.checkpoint_id)
        race = db.get(Race, checkpoint.race_id) if checkpoint else None
        if not checkpoint or not race:
            event.status = "UNASSIGNED"; event.reason_code = "CHECKPOINT_NOT_FOUND"; event.candidates_final = True; event.version += 1
            continue
        # Allow the whole overlapping event window to close before deciding ownership.
        possible_overlap = db.scalars(select(DeviceEvent).where(
            DeviceEvent.checkpoint_id == event.checkpoint_id,
            DeviceEvent.status == "PENDING_MATCH",
            DeviceEvent.id != event.id,
            DeviceEvent.occurred_at >= aware(event.occurred_at) - timedelta(seconds=2 * race.match_window_seconds),
            DeviceEvent.occurred_at <= aware(event.occurred_at) + timedelta(seconds=2 * race.match_window_seconds),
            DeviceEvent.match_deadline_at > now,
        )).all()
        if possible_overlap:
            continue
        candidates = eligible_passages(db, event, checkpoint, race)
        candidate_map[event.id] = candidates
        for candidate in candidates:
            passage_events.setdefault(candidate["passage_id"], []).append(event.id)
    changed = []
    for event in due:
        if event.id not in candidate_map:
            continue
        candidates = candidate_map[event.id]
        shared = any(len(set(passage_events.get(item["passage_id"], []))) > 1 for item in candidates)
        event.candidates_json = json.dumps(candidates, ensure_ascii=False)
        event.candidates_final = True
        if shared:
            event.status = "AMBIGUOUS"; event.reason_code = "COMPETING_EVENTS"; event.lap_status = "NOT_EVALUATED"
        elif len(candidates) > 1:
            event.status = "AMBIGUOUS"; event.reason_code = "MULTIPLE_CANDIDATES"; event.lap_status = "NOT_EVALUATED"
        elif len(candidates) == 1:
            passage = db.scalar(select(GPSPassage).where(GPSPassage.id == candidates[0]["passage_id"]).with_for_update())
            if not passage or passage.consumed_by_event_id:
                event.status = "UNASSIGNED"; event.reason_code = "PASSAGE_ALREADY_USED"; event.lap_status = "NOT_COUNTED"
            else:
                finish_match(db, event, candidates[0], passage, method="AUTO_GPS_CORRELATION")
        else:
            used = db.scalars(select(GPSPassage).where(
                GPSPassage.race_id == db.get(Checkpoint, event.checkpoint_id).race_id,
                GPSPassage.checkpoint_id == event.checkpoint_id,
                GPSPassage.consumed_by_event_id.is_not(None),
            )).all()
            around = [p for p in used if abs((aware(p.entry_at) - aware(event.occurred_at)).total_seconds()) <= db.get(Race, db.get(Checkpoint, event.checkpoint_id).race_id).match_window_seconds]
            event.status = "UNASSIGNED"
            event.reason_code = "PASSAGE_ALREADY_USED" if around else "NO_ELIGIBLE_PASSAGE"
            event.lap_status = "NOT_COUNTED"
        event.version += 1
        changed.append(event)
    db.commit()
    return [{"event": checkpoint_event_dict(db, event), "race_id": db.get(Checkpoint, event.checkpoint_id).race_id,
        "run_id": event.matched_run_id, "completed": bool(event.matched_run_id and db.get(RunSession, event.matched_run_id).status == "COMPLETED")} for event in changed]


@app.get("/health")
def health():
    """Health endpoint for local startup and deployment monitoring."""
    return {"status": "ok", "server_time": now_utc()}


@app.get("/", include_in_schema=False)
def home():
    """Open the API documentation when the user visits the site root."""
    return RedirectResponse(url="/docs")


@app.post("/api/v1/auth/admin-key", dependencies=[Depends(admin)])
def verify_admin_key():
    """Admin Web login check. Wrong keys always receive 401; demo has no lockout."""
    return {"authenticated": True, "role": "ADMIN", "message": "Admin key hợp lệ."}


# 5. Race setup APIs: Admin Web creates races, students, checkpoints and registrations.
@app.post("/api/v1/races", status_code=201, dependencies=[Depends(admin)])
def create_race(data: RaceIn, db: Session = Depends(db_session)):
    if data.checkpoint_mode not in {"GPS_ONLY", "GPS_AND_ARDUINO"}:
        envelope_error("INVALID_CHECKPOINT_MODE", "checkpoint_mode phải là GPS_ONLY hoặc GPS_AND_ARDUINO.", 422)
    race_values = data.model_dump(exclude={"min_lap_interval_seconds"})
    if data.route_profile not in {"CUSTOM", "NEU_DEMO"}:
        envelope_error("INVALID_ROUTE_PROFILE", "route_profile phải là CUSTOM hoặc NEU_DEMO.", 422)
    if data.route_profile == "NEU_DEMO":
        race_values["route_length_min_m"] = data.route_length_min_m or 400.0
        race_values["route_length_max_m"] = data.route_length_max_m or 450.0
    minimum = race_values["route_length_min_m"]
    maximum = race_values["route_length_max_m"]
    if minimum is not None and maximum is not None and minimum >= maximum:
        envelope_error("INVALID_ROUTE_LENGTH_BOUNDS", "route_length_min_m phải nhỏ hơn route_length_max_m.", 422)
    if data.route_profile == "NEU_DEMO" and (minimum is None or maximum is None):
        envelope_error("INVALID_ROUTE_LENGTH_BOUNDS", "NEU_DEMO cần cận chiều dài tối thiểu và tối đa.", 422)
    race_values["min_lap_interval_seconds"] = data.min_lap_interval_seconds or settings.min_lap_interval_seconds
    race = Race(**race_values)
    db.add(race); db.commit(); db.refresh(race)
    return {"race_id": race.id, "name": race.name, "status": race.status, "total_laps": race.total_laps, "min_lap_interval_seconds": race.min_lap_interval_seconds, "route_profile": race.route_profile, "route_length_min_m": race.route_length_min_m, "route_length_max_m": race.route_length_max_m, **race_matching_config(race)}


@app.get("/api/v1/races", dependencies=[Depends(admin)])
def list_races(db: Session = Depends(db_session)):
    return {"items": [{"race_id": r.id, "name": r.name, "status": r.status, "start_at": r.start_at} for r in db.scalars(select(Race)).all()]}


# [FE LINK: SIMULATOR CONTROL] Admin starts, polls, or stops the five-runner
# demonstration from the browser; it does not need a separate terminal window.
@app.post("/api/v1/simulations", status_code=202, dependencies=[Depends(admin)])
def start_demo_simulation(data: SimulationStartIn = SimulationStartIn()):
    if data.checkpoint_mode not in {"GPS_ONLY", "GPS_AND_ARDUINO"}:
        envelope_error("INVALID_CHECKPOINT_MODE", "checkpoint_mode phải là GPS_ONLY hoặc GPS_AND_ARDUINO.", 422)
    with _simulation_jobs_lock:
        for existing_id, existing in _simulation_jobs.items():
            process = existing.get("process")
            if process and process.poll() is None:
                return {**_simulation_job_snapshot(existing_id), "already_running": True}
        job_id = new_id()
        log_path = str(Path(tempfile.gettempdir()) / f"neu-smart-running-{job_id}.log")
        command = [sys.executable, "-u", "-m", "app.simulator",
                   "--base-url", settings.simulator_base_url,
                   "--students", "5", "--laps", "4",
                   "--mode", data.checkpoint_mode,
                   "--seed", str(data.seed),
                   "--interval", str(data.interval_seconds)]
        child_env = os.environ.copy()
        child_env["PYTHONUNBUFFERED"] = "1"
        try:
            with open(log_path, "w", encoding="utf-8") as log_file:
                process = subprocess.Popen(
                    command,
                    cwd=str(Path(__file__).resolve().parent.parent),
                    env=child_env,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
        except OSError as exc:
            envelope_error("SIMULATOR_START_FAILED", f"Không khởi chạy được simulator: {exc}", 500)
        _simulation_jobs[job_id] = {"process": process, "log_path": log_path,
                                    "started_at": now_utc(), "mode": data.checkpoint_mode,
                                    "stop_requested": False, "finished_at": None}
        return {**_simulation_job_snapshot(job_id), "already_running": False}


@app.get("/api/v1/simulations/{simulation_id}", dependencies=[Depends(admin)])
def get_demo_simulation(simulation_id: str):
    return _simulation_job_snapshot(simulation_id)


@app.post("/api/v1/simulations/{simulation_id}/stop", dependencies=[Depends(admin)])
def stop_demo_simulation(simulation_id: str):
    job = _simulation_jobs.get(simulation_id)
    if not job:
        envelope_error("SIMULATION_NOT_FOUND", "Không tìm thấy phiên mô phỏng trên backend này.", 404)
    process = job["process"]
    if process and process.poll() is None:
        job["stop_requested"] = True
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        job["finished_at"] = now_utc()
    snapshot = _simulation_job_snapshot(simulation_id)
    race_id = snapshot.get("race_id") or job.get("race_id")
    if race_id:
        _cancel_simulation_runs(race_id)
    return _simulation_job_snapshot(simulation_id)


@app.delete("/api/v1/races/{race_id}", dependencies=[Depends(admin)])
def delete_race(race_id: str, db: Session = Depends(db_session)):
    """Delete one race and its race-owned records while preserving student profiles."""
    get_or_404(db, Race, race_id, "giải chạy")
    for simulation_id, job in list(_simulation_jobs.items()):
        process = job.get("process")
        if not process or process.poll() is not None:
            continue
        snapshot = _simulation_job_snapshot(simulation_id)
        if snapshot.get("race_id") == race_id:
            stop_demo_simulation(simulation_id)
        elif not snapshot.get("race_id"):
            envelope_error("SIMULATOR_STARTING", "Mô phỏng đang tạo giải; hãy đợi lấy được race_id hoặc dừng mô phỏng rồi thử lại.", 409)
    active_runs = db.scalars(select(RunSession).where(RunSession.race_id == race_id, RunSession.status == "ACTIVE")).all()
    if active_runs:
        envelope_error("RACE_HAS_ACTIVE_RUNS", "Hãy hoàn thành hoặc dừng các phiên chạy ACTIVE trước khi xóa giải.", 409)

    checkpoint_ids = db.scalars(select(Checkpoint.id).where(Checkpoint.race_id == race_id)).all()
    run_ids = db.scalars(select(RunSession.id).where(RunSession.race_id == race_id)).all()
    event_ids = db.scalars(select(DeviceEvent.id).where(DeviceEvent.checkpoint_id.in_(checkpoint_ids))).all() if checkpoint_ids else []
    if event_ids:
        db.query(MatchAudit).filter(MatchAudit.event_id.in_(event_ids)).delete(synchronize_session=False)
    if run_ids:
        db.query(IdempotencyRecord).filter(IdempotencyRecord.resource_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(GPSPassage).filter(GPSPassage.run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(GeofenceState).filter(GeofenceState.run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(GpsPoint).filter(GpsPoint.run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(LapEvent).filter(LapEvent.run_id.in_(run_ids)).delete(synchronize_session=False)
    if checkpoint_ids:
        db.query(DeviceEvent).filter(DeviceEvent.checkpoint_id.in_(checkpoint_ids)).delete(synchronize_session=False)
        db.query(GPSPassage).filter(GPSPassage.checkpoint_id.in_(checkpoint_ids)).delete(synchronize_session=False)
        db.query(GeofenceState).filter(GeofenceState.checkpoint_id.in_(checkpoint_ids)).delete(synchronize_session=False)
        db.query(LapEvent).filter(LapEvent.checkpoint_id.in_(checkpoint_ids)).delete(synchronize_session=False)
        db.query(Device).filter(Device.checkpoint_id.in_(checkpoint_ids)).delete(synchronize_session=False)
    db.query(RaceRoutePoint).filter(RaceRoutePoint.race_id == race_id).delete(synchronize_session=False)
    db.query(RaceParticipant).filter(RaceParticipant.race_id == race_id).delete(synchronize_session=False)
    db.query(RunSession).filter(RunSession.race_id == race_id).delete(synchronize_session=False)
    db.query(Checkpoint).filter(Checkpoint.race_id == race_id).delete(synchronize_session=False)
    db.delete(db.get(Race, race_id))
    db.commit()
    return {"deleted": True, "race_id": race_id}


@app.post("/api/v1/students", status_code=201, dependencies=[Depends(admin)])
def create_student(data: StudentIn, db: Session = Depends(db_session)):
    if db.scalar(select(Student).where(Student.student_code == data.student_code)):
        envelope_error("STUDENT_CODE_EXISTS", "Mã sinh viên đã tồn tại.")
    student = Student(**data.model_dump()); db.add(student); db.commit(); db.refresh(student)
    return {"student_id": student.id, "student_code": student.student_code, "full_name": student.full_name}


# [DEVICE LINK: GPS + STEPS] Admin pairs a wearable ID with the runner before starting.
@app.post("/api/v1/runner-devices", status_code=201, dependencies=[Depends(admin)])
def register_runner_wearable(data: RunnerWearableIn, db: Session = Depends(db_session)):
    """Pair one GPS/step device with its runner before opening a run session."""
    get_or_404(db, Student, data.student_id, "sinh viên")
    if db.get(RunnerWearable, data.device_id):
        envelope_error("DEVICE_ID_EXISTS", "Mã thiết bị đeo đã được đăng ký.")
    wearable = RunnerWearable(id=data.device_id, student_id=data.student_id, name=data.name)
    db.add(wearable); db.commit(); db.refresh(wearable)
    return {"device_id": wearable.id, "student_id": wearable.student_id, "name": wearable.name, "status": wearable.status}


@app.post("/api/v1/races/{race_id}/checkpoints", status_code=201, dependencies=[Depends(admin)])
def create_checkpoint(race_id: str, data: CheckpointIn, db: Session = Depends(db_session)):
    lock_race_configuration(db, race_id)
    if db.scalar(select(RunSession.id).where(RunSession.race_id == race_id).limit(1)):
        envelope_error("CHECKPOINT_LOCKED", "Không thể thêm checkpoint sau khi đã tạo phiên chạy.")
    if db.scalar(select(Checkpoint.id).where(Checkpoint.race_id == race_id, Checkpoint.code == data.code).limit(1)):
        envelope_error("CHECKPOINT_CODE_EXISTS", "Mã checkpoint đã tồn tại trong giải.", 422)
    if db.scalar(select(Checkpoint.id).where(Checkpoint.race_id == race_id, Checkpoint.sequence_no == data.sequence_no).limit(1)):
        envelope_error("DUPLICATE_CHECKPOINT_SEQUENCE", "sequence_no đã được dùng bởi checkpoint khác.", 422)
    checkpoint = Checkpoint(race_id=race_id, **data.model_dump()); db.add(checkpoint); db.commit(); db.refresh(checkpoint)
    return {"checkpoint_id": checkpoint.id, **data.model_dump()}


# [FE LINK: ROUTE EDITOR] Store an ordered map polyline; checkpoint anchors must lie on it.
@app.get("/api/v1/races/{race_id}/route", dependencies=[Depends(admin)])
def get_race_route(race_id: str, db: Session = Depends(db_session)):
    race = get_or_404(db, Race, race_id, "giải chạy")
    route = race_route_dict(db, race_id)
    return {"race_id": race_id, **route,
            "route_status": "CONFIGURED" if len(route["points"]) >= 5 else "NOT_CONFIGURED",
            "route_profile": race.route_profile,
            "route_length_min_m": race.route_length_min_m,
            "route_length_max_m": race.route_length_max_m,
            **route_lock_metadata(db, race_id)}


@app.put("/api/v1/races/{race_id}/route", dependencies=[Depends(admin)])
def replace_race_route(race_id: str, data: RouteReplaceIn, db: Session = Depends(db_session)):
    """Replace a race's map route before runs start; supports map-service/editor coordinates."""
    race = lock_race_configuration(db, race_id)
    if db.scalar(select(RunSession.id).where(RunSession.race_id == race_id).limit(1)):
        envelope_error("ROUTE_LOCKED", "Không thể đổi tuyến sau khi đã tạo phiên chạy.")
    first, last = data.points[0], data.points[-1]
    if haversine_m(first.latitude, first.longitude, last.latitude, last.longitude) > 2.0:
        envelope_error("ROUTE_NOT_CLOSED", "Tuyến vòng phải kết thúc tại điểm xuất phát (sai lệch tối đa 2 m).", 422)
    checkpoints = db.scalars(select(Checkpoint).where(Checkpoint.race_id == race_id)).all()
    if not checkpoints:
        envelope_error("ROUTE_REQUIRES_CHECKPOINTS", "Cần tạo checkpoint trước khi lưu tuyến.", 422)
    checkpoint_map = {cp.id: cp for cp in checkpoints}
    anchors = [point.checkpoint_id for point in data.points if point.checkpoint_id]
    if len(anchors) != len(set(anchors)):
        envelope_error("DUPLICATE_ROUTE_CHECKPOINT", "Mỗi checkpoint chỉ được gắn một lần vào tuyến; điểm khép vòng cuối không gắn checkpoint_id.", 422)
    if any(checkpoint_id not in checkpoint_map for checkpoint_id in anchors):
        envelope_error("CHECKPOINT_RACE_MISMATCH", "Checkpoint neo không thuộc giải này.", 422)
    if set(anchors) != set(checkpoint_map):
        envelope_error("ROUTE_CHECKPOINT_MISMATCH", "Polyline phải có một điểm neo cho từng checkpoint của giải.", 422)
    sequence_values = [checkpoint_map[checkpoint_id].sequence_no for checkpoint_id in anchors]
    if len(set(sequence_values)) != len(sequence_values):
        envelope_error("DUPLICATE_CHECKPOINT_SEQUENCE", "Mỗi checkpoint trong giải phải có sequence_no duy nhất.", 422)
    sorted_sequences = sorted(sequence_values)
    valid_rotations = {tuple(sorted_sequences[index:] + sorted_sequences[:index]) for index in range(len(sorted_sequences))}
    if tuple(sequence_values) not in valid_rotations:
        envelope_error("ROUTE_CHECKPOINT_ORDER_MISMATCH", "Thứ tự các điểm neo phải theo sequence_no quanh vòng; điểm bắt đầu có thể là bất kỳ checkpoint nào.", 422)
    distance = route_length_m(data.points)
    if race.route_length_min_m is not None and distance < race.route_length_min_m:
        envelope_error("ROUTE_LENGTH_OUT_OF_RANGE", f"Tuyến phải dài ít nhất {race.route_length_min_m:g} m; tuyến gửi lên dài {distance:.1f} m.", 422)
    if race.route_length_max_m is not None and distance > race.route_length_max_m:
        envelope_error("ROUTE_LENGTH_OUT_OF_RANGE", f"Tuyến phải dài tối đa {race.route_length_max_m:g} m; tuyến gửi lên dài {distance:.1f} m.", 422)
    # Replace polyline, checkpoint anchors and config version in one transaction.
    db.query(RaceRoutePoint).filter(RaceRoutePoint.race_id == race_id).delete(synchronize_session=False)
    for sequence_no, point in enumerate(data.points, start=1):
        db.add(RaceRoutePoint(race_id=race_id, sequence_no=sequence_no, latitude=point.latitude,
                              longitude=point.longitude, checkpoint_id=point.checkpoint_id))
        if point.checkpoint_id:
            checkpoint = checkpoint_map[point.checkpoint_id]
            checkpoint.latitude, checkpoint.longitude = point.latitude, point.longitude
    race.config_version += 1
    db.commit()
    route = race_route_dict(db, race_id)
    return {"race_id": race_id, "route": route, "route_status": "CONFIGURED",
            "route_profile": race.route_profile,
            "route_length_min_m": race.route_length_min_m,
            "route_length_max_m": race.route_length_max_m,
            **route_lock_metadata(db, race_id), "config_version": race.config_version}


@app.patch("/api/v1/checkpoints/{checkpoint_id}", dependencies=[Depends(admin)])
def patch_checkpoint(checkpoint_id: str, data: CheckpointPatch, db: Session = Depends(db_session)):
    """Update a checkpoint marker and keep its route anchor synchronized."""
    checkpoint = get_or_404(db, Checkpoint, checkpoint_id, "checkpoint")
    lock_race_configuration(db, checkpoint.race_id)
    db.refresh(checkpoint)
    if db.scalar(select(RunSession.id).where(RunSession.race_id == checkpoint.race_id).limit(1)):
        envelope_error("CHECKPOINT_LOCKED", "Không thể sửa checkpoint sau khi đã tạo phiên chạy.")
    values = data.model_dump(exclude_unset=True, exclude_none=True)
    if "kind" in values and values["kind"] not in {"CHECKPOINT", "LAP"}:
        envelope_error("INVALID_CHECKPOINT_KIND", "kind phải là CHECKPOINT hoặc LAP.", 422)
    next_sequence = values.get("sequence_no", checkpoint.sequence_no)
    duplicate_sequence = db.scalar(select(Checkpoint.id).where(
        Checkpoint.race_id == checkpoint.race_id,
        Checkpoint.sequence_no == next_sequence,
        Checkpoint.id != checkpoint.id,
    ).limit(1))
    if duplicate_sequence:
        envelope_error("DUPLICATE_CHECKPOINT_SEQUENCE", "sequence_no đã được dùng bởi checkpoint khác.", 422)
    next_latitude = values.get("latitude", checkpoint.latitude)
    next_longitude = values.get("longitude", checkpoint.longitude)
    if (next_latitude is None) != (next_longitude is None):
        envelope_error("INCOMPLETE_CHECKPOINT_COORDINATE", "Cần cập nhật đồng thời latitude và longitude.", 422)
    if ("latitude" in values) != ("longitude" in values):
        envelope_error("INCOMPLETE_CHECKPOINT_COORDINATE", "Khi di chuyển checkpoint, gửi cả latitude và longitude.", 422)
    route_points = db.scalars(select(RaceRoutePoint).where(RaceRoutePoint.race_id == checkpoint.race_id).order_by(RaceRoutePoint.sequence_no)).all()
    if route_points and not any(p.checkpoint_id == checkpoint_id for p in route_points):
        envelope_error("CHECKPOINT_ANCHOR_MISSING", "Checkpoint chưa có điểm neo trong polyline; hãy cập nhật toàn bộ tuyến.", 409)
    was_closed = len(route_points) > 1 and haversine_m(route_points[0].latitude, route_points[0].longitude,
                                                        route_points[-1].latitude, route_points[-1].longitude) <= 2.0
    for name, value in values.items():
        setattr(checkpoint, name, value)
    point = next((p for p in route_points if p.checkpoint_id == checkpoint_id), None)
    if point:
        point.latitude, point.longitude = checkpoint.latitude, checkpoint.longitude
        if was_closed and point.sequence_no == route_points[0].sequence_no:
            route_points[-1].latitude, route_points[-1].longitude = checkpoint.latitude, checkpoint.longitude
        elif was_closed and point.sequence_no == route_points[-1].sequence_no:
            route_points[0].latitude, route_points[0].longitude = checkpoint.latitude, checkpoint.longitude
        distance = route_length_m(route_points)
        race = db.get(Race, checkpoint.race_id)
        if race.route_length_min_m is not None and distance < race.route_length_min_m:
            envelope_error("ROUTE_LENGTH_OUT_OF_RANGE", f"Vị trí này làm tuyến dài {distance:.1f} m; cần ít nhất {race.route_length_min_m:g} m.", 422)
        if race.route_length_max_m is not None and distance > race.route_length_max_m:
            envelope_error("ROUTE_LENGTH_OUT_OF_RANGE", f"Vị trí này làm tuyến dài {distance:.1f} m; tối đa {race.route_length_max_m:g} m.", 422)
        anchors = [p.checkpoint_id for p in route_points if p.checkpoint_id]
        anchor_sequences = [db.get(Checkpoint, anchor_id).sequence_no for anchor_id in anchors]
        sorted_sequences = sorted(anchor_sequences)
        rotations = {tuple(sorted_sequences[index:] + sorted_sequences[:index]) for index in range(len(sorted_sequences))}
        if len(set(anchor_sequences)) != len(anchor_sequences) or tuple(anchor_sequences) not in rotations:
            envelope_error("ROUTE_CHECKPOINT_ORDER_MISMATCH", "Thay đổi sequence_no làm thứ tự neo trên tuyến không hợp lệ.", 422)
    db.get(Race, checkpoint.race_id).config_version += 1
    db.commit()
    race = db.get(Race, checkpoint.race_id)
    return {"checkpoint_id": checkpoint.id, "race_id": checkpoint.race_id, "code": checkpoint.code,
            "name": checkpoint.name, "sequence_no": checkpoint.sequence_no, "kind": checkpoint.kind,
            "latitude": checkpoint.latitude, "longitude": checkpoint.longitude, "radius_m": checkpoint.radius_m,
            "route": race_route_dict(db, checkpoint.race_id) if point else None,
            "route_profile": race.route_profile, "route_length_min_m": race.route_length_min_m,
            "route_length_max_m": race.route_length_max_m,
            **route_lock_metadata(db, checkpoint.race_id)}


@app.post("/api/v1/checkpoints/{checkpoint_id}/devices", status_code=201, dependencies=[Depends(admin)])
def register_checkpoint_device(checkpoint_id: str, data: CheckpointDeviceIn, db: Session = Depends(db_session)):
    """Bind an Arduino/Gateway ID to a server-owned checkpoint mapping."""
    checkpoint = get_or_404(db, Checkpoint, checkpoint_id, "checkpoint")
    device = db.get(Device, data.device_id)
    if device and device.checkpoint_id != checkpoint.id:
        envelope_error("DEVICE_CHECKPOINT_MISMATCH", "Thiết bị đã được gán cho checkpoint khác.")
    if not device:
        device = Device(id=data.device_id, name=data.name, checkpoint_id=checkpoint.id)
        db.add(device)
    else:
        device.name = data.name
        device.status = "ACTIVE"
    db.commit()
    return {"device_id": device.id, "checkpoint_id": checkpoint.id, "race_id": checkpoint.race_id, "status": device.status}


@app.get("/api/v1/races/{race_id}/checkpoint-matching", dependencies=[Depends(admin)])
def get_checkpoint_matching(race_id: str, db: Session = Depends(db_session)):
    """Return the saved, effective Arduino/GPS matching config for Admin Web forms."""
    race = get_or_404(db, Race, race_id, "giải chạy")
    has_runs = db.scalar(select(RunSession.id).where(RunSession.race_id == race_id).limit(1)) is not None
    return {**race_matching_config(race), "locked": has_runs,
            "locked_at": race.matching_locked_at,
            "locked_reason": "Phiên chạy đầu tiên đã được tạo." if has_runs else None}


@app.patch("/api/v1/races/{race_id}/checkpoint-matching", dependencies=[Depends(admin)])
def patch_checkpoint_matching(race_id: str, data: MatchingConfigPatch, db: Session = Depends(db_session)):
    race = lock_race_configuration(db, race_id)
    if db.scalar(select(RunSession.id).where(RunSession.race_id == race_id).limit(1)):
        envelope_error("MATCHING_CONFIG_LOCKED", "Không thể đổi cấu hình sau khi giải đã có phiên chạy.")
    values = data.model_dump(exclude_unset=True, exclude_none=True)
    if "checkpoint_mode" in values and values["checkpoint_mode"] not in {"GPS_ONLY", "GPS_AND_ARDUINO"}:
        envelope_error("INVALID_CHECKPOINT_MODE", "checkpoint_mode phải là GPS_ONLY hoặc GPS_AND_ARDUINO.", 422)
    proposed = {**race_matching_config(race), **values}
    if proposed["inner_radius_m"] >= proposed["outer_radius_m"]:
        envelope_error("INVALID_GEOFENCE_RADII", "inner_radius_m phải nhỏ hơn outer_radius_m.", 422)
    for name, value in values.items():
        setattr(race, name, value)
    if values:
        race.config_version += 1
    db.commit()
    return {**race_matching_config(race),
            "locked": race.matching_locked_at is not None,
            "locked_at": race.matching_locked_at,
            "locked_reason": "Phiên chạy đầu tiên đã được tạo." if race.matching_locked_at else None}


@app.post("/api/v1/races/{race_id}/participants", status_code=201, dependencies=[Depends(admin)])
def add_participant(race_id: str, data: ParticipantIn, db: Session = Depends(db_session)):
    get_or_404(db, Race, race_id, "giải chạy"); get_or_404(db, Student, data.student_id, "sinh viên")
    existing = db.scalar(select(RaceParticipant).where(RaceParticipant.race_id == race_id, RaceParticipant.student_id == data.student_id))
    if existing: envelope_error("ALREADY_REGISTERED", "Sinh viên đã đăng ký giải chạy.")
    participant = RaceParticipant(race_id=race_id, **data.model_dump()); db.add(participant); db.commit()
    return {"race_id": race_id, "student_id": data.student_id, "registration_status": "REGISTERED", "display_id": participant.bib_number, "bib_number": participant.bib_number}


def run_dict(db: Session, run: RunSession) -> dict[str, Any]:
    student = db.get(Student, run.student_id)
    race = db.get(Race, run.race_id)
    participant = db.scalar(select(RaceParticipant).where(RaceParticipant.race_id == run.race_id, RaceParticipant.student_id == run.student_id))
    wearable = db.get(RunnerWearable, run.wearable_device_id) if run.wearable_device_id else None
    latest_telemetry = db.scalar(select(GpsPoint).where(GpsPoint.run_id == run.id).order_by(GpsPoint.recorded_at.desc()).limit(1))
    telemetry_source = latest_telemetry.source if latest_telemetry else None
    elapsed = run.duration_total_s if run.duration_total_s is not None else max(0, int((now_utc() - aware(run.started_at)).total_seconds()))
    return {"run_id": run.id, "race_id": run.race_id, "student_id": run.student_id, "display_id": participant.bib_number if participant else None, "bib_number": participant.bib_number if participant else None, "wearable_device_id": run.wearable_device_id, "wearable_status": wearable.status if wearable else "NOT_REGISTERED", "wearable_last_seen_at": wearable.last_seen_at if wearable else None, "student_code": student.student_code if student else None, "full_name": student.full_name if student else None, "status": run.status, "display_status": "DONE" if run.status == "COMPLETED" else run.status, "is_done": run.status == "COMPLETED", "total_laps": race.total_laps if race else None, "source": telemetry_source or run.source, "run_source": run.source, "telemetry_source": telemetry_source, "started_at": run.started_at, "ended_at": run.ended_at, "distance_total_m": round(run.distance_total_m, 2), "duration_total_s": elapsed, "lap_count": run.lap_count, "last_lap_duration_s": run.last_lap_duration_s, "total_steps": run.total_steps, "last_latitude": run.last_latitude, "last_longitude": run.last_longitude, "last_seen_at": run.last_seen_at}


# [DEVICE LINK: GPS + STEPS] A run is bound to the wearable already paired to this student.
@app.post("/api/v1/runs", status_code=201)
def create_run(data: RunIn, auth_role: str = Depends(run_create_auth), db: Session = Depends(db_session)):
    request_hash = hashlib.sha256(json.dumps(data.model_dump(mode="json"), sort_keys=True).encode("utf-8")).hexdigest()
    record = db.get(IdempotencyRecord, data.idempotency_key)
    if record:
        if record.request_hash and record.request_hash != request_hash:
            envelope_error("IDEMPOTENCY_CONFLICT", "idempotency_key đã được dùng với payload khác.")
        run = db.get(RunSession, record.resource_id)
        return run_dict(db, run)
    race = lock_race_configuration(db, data.race_id)
    get_or_404(db, Student, data.student_id, "sinh viên")
    if race.status == "COMPLETED":
        envelope_error("RACE_COMPLETED", "Không thể mở phiên mới trong giải đã hoàn thành.")
    started_at = now_utc()
    if data.started_at is not None:
        if auth_role != "SIMULATOR":
            envelope_error("SIMULATOR_START_TIME_ONLY", "Chỉ Simulator API key mới được đồng bộ thời điểm xuất phát.", 403)
        requested_start = aware(data.started_at)
        if requested_start < started_at or requested_start > started_at + timedelta(seconds=10):
            envelope_error("INVALID_SIMULATOR_START_TIME", "Thời điểm xuất phát đồng bộ phải nằm trong 10 giây tới.", 422)
        started_at = requested_start
    wearable = get_or_404(db, RunnerWearable, data.wearable_device_id, "thiết bị đeo")
    if wearable.student_id != data.student_id or wearable.status != "ACTIVE":
        envelope_error("WEARABLE_RUNNER_MISMATCH", "Thiết bị GPS/bước chân không được gán cho runner này.")
    participant = db.scalar(select(RaceParticipant).where(RaceParticipant.race_id == data.race_id, RaceParticipant.student_id == data.student_id))
    if not participant: envelope_error("NOT_REGISTERED", "Sinh viên chưa đăng ký giải chạy.")
    active = db.scalar(select(RunSession).where(RunSession.race_id == data.race_id, RunSession.student_id == data.student_id, RunSession.status == "ACTIVE"))
    if active: envelope_error("ACTIVE_RUN_EXISTS", "Sinh viên đã có phiên chạy ACTIVE trong giải này.")
    run = RunSession(race_id=data.race_id, student_id=data.student_id, wearable_device_id=wearable.id, source=data.source, started_at=started_at)
    if race.matching_locked_at is None:
        race.matching_locked_at = now_utc()
    if race.start_at is None or aware(race.start_at) > started_at:
        race.start_at = started_at
    db.add(run); db.flush(); db.add(IdempotencyRecord(key=data.idempotency_key, resource_id=run.id, request_hash=request_hash)); db.commit(); db.refresh(run)
    return run_dict(db, run)


# [DEVICE LINK: GPS + STEPS] One message carries position and step snapshot from the same wearable.
@app.post("/api/v1/telemetry/gps", status_code=202)
async def receive_gps(data: GpsIn, auth_source: str = Depends(gps_ingest_auth), db: Session = Depends(db_session)):
    """Accept telemetry from the runner's paired GPS/step wearable.

    An outside-to-inside transition across a LAP checkpoint geofence identifies
    this runner (through the registered wearable binding) and records a lap.
    """
    request_hash = hashlib.sha256(json.dumps(data.model_dump(mode="json"), sort_keys=True).encode("utf-8")).hexdigest()
    duplicate = db.scalar(select(GpsPoint).where(GpsPoint.idempotency_key == data.idempotency_key))
    if duplicate:
        if duplicate.payload_hash and duplicate.payload_hash != request_hash:
            envelope_error("IDEMPOTENCY_CONFLICT", "idempotency_key đã được dùng với payload GPS khác.")
        run = get_or_404(db, RunSession, duplicate.run_id, "phiên chạy")
        return {"accepted": True, "gps_point_id": duplicate.id, "source": duplicate.source, "distance_delta_m": 0, "distance_total_m": run.distance_total_m, "total_steps": run.total_steps, "lap_count": run.lap_count, "status": run.status, "display_status": "DONE" if run.status == "COMPLETED" else run.status, "is_done": run.status == "COMPLETED", "duration_total_s": run_dict(db, run)["duration_total_s"], "checkpoint_crossings": [], "duplicate": True, "received_at": duplicate.received_at}
    run = get_or_404(db, RunSession, data.run_id, "phiên chạy")
    if run.race_id != data.race_id or run.student_id != data.student_id: envelope_error("RUN_IDENTITY_MISMATCH", "Thông tin giải hoặc sinh viên không khớp phiên chạy.")
    if run.status != "ACTIVE": envelope_error("RUN_NOT_ACTIVE", "Phiên chạy không ở trạng thái đang chạy.")
    if run.wearable_device_id != data.wearable_device_id: envelope_error("WEARABLE_RUN_MISMATCH", "Thiết bị telemetry không được gán cho phiên chạy này.")
    wearable = get_or_404(db, RunnerWearable, data.wearable_device_id, "thiết bị đeo")
    if wearable.student_id != run.student_id or wearable.status != "ACTIVE": envelope_error("WEARABLE_RUNNER_MISMATCH", "Thiết bị GPS/bước chân không được gán cho runner này.")
    recorded = aware(data.recorded_at)
    race = get_or_404(db, Race, run.race_id, "giải chạy")
    validation_now = now_utc()
    if recorded < aware(run.started_at):
        envelope_error("GPS_BEFORE_RUN_START", "GPS recorded_at không được trước thời điểm bắt đầu phiên chạy.", 422)
    if recorded < validation_now - timedelta(seconds=race.max_event_age_seconds):
        envelope_error("GPS_TOO_OLD", f"GPS cũ hơn giới hạn {race.max_event_age_seconds} giây.", 422)
    if recorded > validation_now + timedelta(seconds=race.max_future_skew_seconds):
        envelope_error("GPS_IN_FUTURE", f"GPS vượt quá độ lệch tương lai {race.max_future_skew_seconds} giây.", 422)
    if run.last_gps_recorded_at and recorded <= aware(run.last_gps_recorded_at): envelope_error("GPS_OUT_OF_ORDER", "Thời điểm GPS phải tăng dần.", 422)
    if data.total_steps < run.total_steps: envelope_error("STEPS_DECREASED", "Snapshot bước chân không được nhỏ hơn giá trị đã lưu.", 422)
    previous_latitude, previous_longitude = run.last_latitude, run.last_longitude
    delta = 0.0
    if previous_latitude is not None and previous_longitude is not None:
        delta = haversine_m(previous_latitude, previous_longitude, data.latitude, data.longitude)
        if run.last_gps_recorded_at is not None:
            seconds = (recorded - aware(run.last_gps_recorded_at)).total_seconds()
            max_speed = settings.max_simulator_speed_mps if auth_source == "SIMULATOR" else settings.max_gps_speed_mps
            if delta / seconds > max_speed: envelope_error("GPS_JUMP_REJECTED", f"Điểm GPS vượt ngưỡng {max_speed:g} m/s của nguồn {auth_source}.", 422)
    received = validation_now
    telemetry_source = "SIMULATED_GPS" if auth_source == "SIMULATOR" else "WEARABLE_GPS"
    point = GpsPoint(run_id=run.id, wearable_device_id=wearable.id, latitude=data.latitude, longitude=data.longitude, recorded_at=recorded, received_at=received, accuracy_m=data.accuracy_m, speed_mps=data.speed_mps, total_steps=data.total_steps, source=telemetry_source, idempotency_key=data.idempotency_key, payload_hash=request_hash)
    db.add(point); run.distance_total_m += delta; run.total_steps = data.total_steps; run.last_latitude = data.latitude; run.last_longitude = data.longitude; run.last_seen_at = received; run.last_gps_recorded_at = recorded
    wearable.last_seen_at = received
    db.flush()

    # A checkpoint pass is inferred from an outside-to-inside GPS geofence transition.
    # The telemetry already belongs to a student through the registered wearable/run.
    crossings: list[dict[str, Any]] = []
    if race.checkpoint_mode == "GPS_ONLY" and previous_latitude is not None and previous_longitude is not None:
        route_checkpoints = db.scalars(
            select(Checkpoint)
            .where(
                Checkpoint.race_id == run.race_id,
                Checkpoint.latitude.is_not(None),
                Checkpoint.longitude.is_not(None),
            )
            .order_by(Checkpoint.sequence_no)
        ).all()
        for checkpoint in route_checkpoints:
            current_distance = haversine_m(data.latitude, data.longitude, checkpoint.latitude, checkpoint.longitude)
            previous_distance = haversine_m(previous_latitude, previous_longitude, checkpoint.latitude, checkpoint.longitude)
            if previous_distance <= checkpoint.radius_m or current_distance > checkpoint.radius_m:
                continue
            passage = GPSPassage(
                race_id=race.id, checkpoint_id=checkpoint.id, run_id=run.id, student_id=run.student_id,
                wearable_device_id=wearable.id, entry_gps_point_id=point.id, entry_at=recorded,
                received_at=received, entry_distance_m=current_distance,
                telemetry_source=telemetry_source, config_version=race.config_version,
            )
            db.add(passage)
            db.flush()
            crossing = {
                "checkpoint_id": checkpoint.id, "checkpoint_code": checkpoint.code,
                "sequence_no": checkpoint.sequence_no, "checkpoint_kind": checkpoint.kind,
                "student_id": run.student_id, "run_id": run.id, "identity_status": "ASSIGNED",
                "passage_id": passage.id, "lap_updated": False, "lap_no": None,
                "lap_duration_s": None,
            }
            if checkpoint.kind == "LAP":
                source_event_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{data.idempotency_key}:{checkpoint.id}"))
                counted, lap_duration = record_lap(db, run, checkpoint, recorded, telemetry_source, source_event_id)
                crossing.update({"lap_updated": counted, "lap_no": run.lap_count if counted else None, "lap_duration_s": lap_duration})
                if not counted:
                    crossing["rejection_reason"] = "MIN_LAP_INTERVAL_NOT_MET" if lap_duration is not None and lap_duration >= 0 else "NON_MONOTONIC_CROSSING_TIME"
                else:
                    crossing["is_done"] = run.status == "COMPLETED"
            crossings.append(crossing)

    elif race.checkpoint_mode == "GPS_AND_ARDUINO":
        checkpoints = db.scalars(select(Checkpoint).where(
            Checkpoint.race_id == run.race_id,
            Checkpoint.latitude.is_not(None), Checkpoint.longitude.is_not(None),
        ).order_by(Checkpoint.sequence_no)).all()
        for checkpoint in checkpoints:
            distance = haversine_m(data.latitude, data.longitude, checkpoint.latitude, checkpoint.longitude)
            state = db.scalar(select(GeofenceState).where(GeofenceState.run_id == run.id, GeofenceState.checkpoint_id == checkpoint.id))
            if state is None:
                state = GeofenceState(run_id=run.id, checkpoint_id=checkpoint.id, region="UNKNOWN", config_version=race.config_version)
                db.add(state); db.flush()
            if state.config_version != race.config_version or (state.last_sample_at and (recorded - aware(state.last_sample_at)).total_seconds() > race.max_sample_gap_seconds):
                state.region = "UNKNOWN"
            previous_point_id = state.last_gps_point_id
            previous_region = state.region
            passage = None
            if previous_region == "UNKNOWN":
                if distance >= race.outer_radius_m:
                    state.region = "OUTSIDE"
                elif distance <= race.inner_radius_m:
                    state.region = "INSIDE"
            elif previous_region == "OUTSIDE" and distance <= race.inner_radius_m:
                state.region = "INSIDE"
                passage = GPSPassage(race_id=race.id, checkpoint_id=checkpoint.id, run_id=run.id, student_id=run.student_id,
                    wearable_device_id=wearable.id, previous_gps_point_id=previous_point_id, entry_gps_point_id=point.id,
                    entry_at=recorded, received_at=received, entry_distance_m=distance,
                    telemetry_source=telemetry_source, config_version=race.config_version)
                db.add(passage); db.flush()
            elif previous_region == "INSIDE" and distance >= race.outer_radius_m:
                state.region = "OUTSIDE"
            state.last_gps_point_id = point.id
            state.last_sample_at = recorded
            state.last_distance_m = distance
            state.config_version = race.config_version
            if passage:
                crossings.append({"checkpoint_id": checkpoint.id, "checkpoint_code": checkpoint.code,
                    "student_id": run.student_id, "run_id": run.id, "identity_status": "GPS_PASSAGE_PENDING_ARDUINO",
                    "passage_id": passage.id, "entry_distance_m": round(distance, 2), "lap_updated": False})
                break

    db.commit(); db.refresh(point)
    runner_snapshot = run_dict(db, run)
    runner_snapshot.update({"latitude": run.last_latitude, "longitude": run.last_longitude, "source": telemetry_source})
    await hub.publish(run.race_id, {"type": "runner.updated", "race_id": run.race_id, "occurred_at": received.isoformat(), "data": runner_snapshot})
    for crossing in crossings:
        await hub.publish(run.race_id, {"type": "checkpoint.passed", "race_id": run.race_id, "occurred_at": recorded.isoformat(), "data": crossing})
    if run.status == "COMPLETED":
        await hub.publish(run.race_id, {"type": "runner.completed", "race_id": run.race_id, "occurred_at": received.isoformat(), "data": run_dict(db, run)})
    return {"accepted": True, "gps_point_id": point.id, "source": telemetry_source, "distance_delta_m": round(delta, 2), "distance_total_m": round(run.distance_total_m, 2), "total_steps": run.total_steps, "lap_count": run.lap_count, "status": run.status, "display_status": "DONE" if run.status == "COMPLETED" else run.status, "is_done": run.status == "COMPLETED", "duration_total_s": run_dict(db, run)["duration_total_s"], "ended_at": run.ended_at, "checkpoint_crossings": crossings, "received_at": received}


# [DEVICE LINK: ARDUINO GATEWAY] Physical passage-only sensors still arrive without runner identity.
@app.post("/api/v1/checkpoint-events", status_code=202, dependencies=[Depends(gateway)])
async def receive_device_event(data: DeviceEventIn, db: Session = Depends(db_session)):
    if data.student_id is not None:
        envelope_error("DEVICE_IDENTITY_NOT_SUPPORTED", "Gateway không được tự khai danh tính runner; hãy gửi student_id=null.", 422)
    device = db.get(Device, data.device_id)
    if not device or device.status != "ACTIVE" or not device.checkpoint_id:
        envelope_error("DEVICE_NOT_REGISTERED", "Thiết bị Gateway chưa được Admin gán cho checkpoint.", 404)
    if data.checkpoint_id and data.checkpoint_id != device.checkpoint_id:
        envelope_error("DEVICE_CHECKPOINT_MISMATCH", "checkpoint_id không khớp ánh xạ thiết bị đã lưu.", 422)
    checkpoint = get_or_404(db, Checkpoint, device.checkpoint_id, "checkpoint")
    race = get_or_404(db, Race, checkpoint.race_id, "giải chạy")
    occurred = aware(data.occurred_at)
    received = now_utc()
    if occurred > received + timedelta(seconds=race.max_future_skew_seconds):
        envelope_error("DEVICE_EVENT_IN_FUTURE", "occurred_at vượt quá độ lệch tương lai cho phép.", 422)
    normalized = {"device_id": data.device_id, "checkpoint_id": checkpoint.id, "event_type": data.event_type,
        "occurred_at": occurred.isoformat(), "student_id": None}
    payload_hash = hashlib.sha256(json.dumps(normalized, sort_keys=True).encode("utf-8")).hexdigest()
    duplicate = db.scalar(select(DeviceEvent).where(DeviceEvent.source_event_id == data.source_event_id))
    if duplicate:
        if duplicate.device_id != data.device_id or (duplicate.payload_hash and duplicate.payload_hash != payload_hash):
            envelope_error("IDEMPOTENCY_CONFLICT", "device_event_id đã được dùng với payload khác.")
        return {**checkpoint_event_dict(db, duplicate), "accepted": True, "duplicate": True}
    age_seconds = (received - occurred).total_seconds()
    if race.checkpoint_mode == "GPS_ONLY":
        match_status, reason, deadline, final, lap_status = "UNASSIGNED", "GPS_ONLY_MODE", None, True, "NOT_EVALUATED"
    elif age_seconds > race.max_event_age_seconds:
        match_status, reason, deadline, final, lap_status = "UNASSIGNED", "LATE_DEVICE_EVENT", None, True, "NOT_COUNTED"
    else:
        match_status, reason, final, lap_status = "PENDING_MATCH", None, False, "NOT_EVALUATED"
        closes_at = occurred + timedelta(seconds=race.match_window_seconds + race.late_grace_seconds)
        deadline = max(received, closes_at)
    event = DeviceEvent(device_id=data.device_id, checkpoint_id=checkpoint.id, occurred_at=occurred,
        received_at=received, event_type=data.event_type, source_event_id=data.source_event_id,
        student_id=None, status=match_status, raw_payload=data.raw_payload, payload_hash=payload_hash,
        lap_status=lap_status, reason_code=reason, match_deadline_at=deadline, candidates_final=final,
        config_version=race.config_version)
    db.add(event); device.last_seen_at = received; db.commit(); db.refresh(event)
    payload = checkpoint_event_dict(db, event)
    await hub.publish(race.id, {"type": "checkpoint.match.updated", "race_id": race.id, "data": payload})
    return {**payload, "accepted": True, "duplicate": False}


@app.get("/api/v1/checkpoint-events/{event_id}", dependencies=[Depends(admin)])
def get_checkpoint_event(event_id: str, db: Session = Depends(db_session)):
    return checkpoint_event_dict(db, get_or_404(db, DeviceEvent, event_id, "sự kiện checkpoint"))


@app.get("/api/v1/gateway/checkpoint-events/{event_id}", dependencies=[Depends(gateway)])
def gateway_get_checkpoint_event(event_id: str, db: Session = Depends(db_session)):
    event = get_or_404(db, DeviceEvent, event_id, "sự kiện checkpoint")
    return {"event_id": event.id, "device_id": event.device_id, "checkpoint_id": event.checkpoint_id,
        "match_status": event.status, "lap_status": event.lap_status, "reason_code": event.reason_code,
        "lap_number": event.lap_number, "version": event.version, "candidates_final": event.candidates_final}


@app.get("/api/v1/races/{race_id}/checkpoint-events", dependencies=[Depends(admin)])
def list_checkpoint_events(race_id: str, checkpoint_id: str | None = None, match_status: str | None = None,
        from_at: datetime | None = Query(default=None, alias="from"), to_at: datetime | None = Query(default=None, alias="to"),
        limit: int = Query(default=50, ge=1, le=200), cursor: str | None = None, db: Session = Depends(db_session)):
    get_or_404(db, Race, race_id, "giải chạy")
    stmt = select(DeviceEvent).join(Checkpoint).where(Checkpoint.race_id == race_id)
    if checkpoint_id: stmt = stmt.where(DeviceEvent.checkpoint_id == checkpoint_id)
    if match_status: stmt = stmt.where(DeviceEvent.status == match_status)
    if from_at: stmt = stmt.where(DeviceEvent.occurred_at >= aware(from_at))
    if to_at: stmt = stmt.where(DeviceEvent.occurred_at < aware(to_at))
    if cursor:
        try:
            decoded = base64.urlsafe_b64decode(cursor.encode()).decode("utf-8")
            stamp, event_id = decoded.split("|", 1)
            cursor_time = datetime.fromisoformat(stamp)
        except Exception:
            envelope_error("INVALID_CURSOR", "cursor không hợp lệ.", 422)
        stmt = stmt.where((DeviceEvent.occurred_at < cursor_time) | ((DeviceEvent.occurred_at == cursor_time) & (DeviceEvent.id < event_id)))
    rows = db.scalars(stmt.order_by(DeviceEvent.occurred_at.desc(), DeviceEvent.id.desc()).limit(limit + 1)).all()
    more = len(rows) > limit
    page = rows[:limit]
    next_cursor = None
    if more and page:
        last = page[-1]
        raw = f"{aware(last.occurred_at).isoformat()}|{last.id}".encode("utf-8")
        next_cursor = base64.urlsafe_b64encode(raw).decode("ascii")
    return {"items": [checkpoint_event_dict(db, event) for event in page], "next_cursor": next_cursor}


@app.post("/api/v1/checkpoint-events/{event_id}/resolve", dependencies=[Depends(admin)])
async def resolve_checkpoint_event(event_id: str, data: ResolveEventIn, db: Session = Depends(db_session)):
    action = data.action.upper()
    if action not in {"CONFIRM", "DISMISS"} or (action == "CONFIRM" and not data.passage_id) or (action == "DISMISS" and data.passage_id is not None):
        envelope_error("INVALID_RESOLUTION", "CONFIRM cần passage_id; DISMISS yêu cầu passage_id=null.", 422)
    request_payload = {**data.model_dump(), "event_id": event_id}; request_hash = hashlib.sha256(json.dumps(request_payload, sort_keys=True).encode()).hexdigest()
    previous = db.scalar(select(MatchAudit).where(MatchAudit.idempotency_key == data.idempotency_key))
    if previous:
        if previous.request_hash != request_hash: envelope_error("IDEMPOTENCY_CONFLICT", "idempotency_key đã được dùng với payload khác.")
        return checkpoint_event_dict(db, get_or_404(db, DeviceEvent, previous.event_id, "sự kiện checkpoint"))
    event = db.scalar(select(DeviceEvent).where(DeviceEvent.id == event_id).with_for_update())
    if not event: envelope_error("NOT_FOUND", "Không tìm thấy sự kiện checkpoint.", 404)
    if event.status != "AMBIGUOUS": envelope_error("EVENT_ALREADY_RESOLVED", "Chỉ sự kiện AMBIGUOUS mới xử lý được.")
    if not event.candidates_final: envelope_error("CANDIDATES_NOT_FINAL", "Cửa sổ thu thập ứng viên chưa kết thúc.")
    if event.version != data.expected_version: envelope_error("VERSION_CONFLICT", "Sự kiện đã thay đổi; hãy tải lại dữ liệu.")
    if action == "DISMISS":
        event.status = "REJECTED"; event.lap_status = "NOT_COUNTED"; event.reason_code = "ADMIN_DISMISSED"
    else:
        candidates = json.loads(event.candidates_json or "[]")
        candidate = next((c for c in candidates if c["passage_id"] == data.passage_id), None)
        if not candidate: envelope_error("CANDIDATE_NOT_FOUND", "passage_id không thuộc danh sách ứng viên của sự kiện.")
        passage = db.scalar(select(GPSPassage).where(GPSPassage.id == data.passage_id).with_for_update())
        if not passage: envelope_error("NOT_FOUND", "Không tìm thấy GPS passage.", 404)
        if passage.consumed_by_event_id: envelope_error("PASSAGE_ALREADY_USED", "GPS passage đã được dùng bởi sự kiện khác.")
        finish_match(db, event, candidate, passage, method="ADMIN_CONFIRMED_GPS_CORRELATION")
    event.version += 1
    db.add(MatchAudit(event_id=event.id, action=action, reason=data.reason, idempotency_key=data.idempotency_key, request_hash=request_hash))
    db.commit(); db.refresh(event)
    result = checkpoint_event_dict(db, event)
    checkpoint = get_or_404(db, Checkpoint, event.checkpoint_id, "checkpoint")
    await hub.publish(checkpoint.race_id, {"type": "checkpoint.match.updated", "race_id": checkpoint.race_id, "data": result})
    if event.lap_status == "COUNTED":
        await hub.publish(checkpoint.race_id, {"type": "runner.updated", "race_id": checkpoint.race_id, "data": run_dict(db, get_or_404(db, RunSession, event.matched_run_id, "phiên chạy"))})
    return result


@app.post("/api/v1/lap-events", status_code=201, dependencies=[Depends(simulator)])
async def create_lap(data: LapIn, db: Session = Depends(db_session)):
    previous = db.scalar(select(LapEvent).where(LapEvent.source_event_id == data.source_event_id))
    if previous:
        run = get_or_404(db, RunSession, previous.run_id, "phiên chạy")
        return {"accepted": True, "lap_no": previous.lap_no, "lap_duration_s": previous.duration_s, "lap_count": run.lap_count, "status": run.status, "duplicate": True}
    run = get_or_404(db, RunSession, data.run_id, "phiên chạy")
    checkpoint = get_or_404(db, Checkpoint, data.checkpoint_id, "checkpoint")
    if run.status != "ACTIVE": envelope_error("RUN_NOT_ACTIVE", "Phiên chạy không ở trạng thái đang chạy.")
    if run.student_id != data.student_id or checkpoint.race_id != run.race_id: envelope_error("LAP_IDENTITY_MISMATCH", "Runner hoặc checkpoint không thuộc phiên chạy này.")
    race = get_or_404(db, Race, run.race_id, "giải chạy")
    if race.checkpoint_mode == "GPS_AND_ARDUINO":
        envelope_error("PHYSICAL_CONFIRMATION_REQUIRED", "Ở chế độ GPS_AND_ARDUINO chỉ sự kiện Arduino đã ghép mới được tính vòng.")
    occurred = aware(data.occurred_at)
    counted, duration = record_lap(db, run, checkpoint, occurred, data.source, data.source_event_id)
    if not counted:
        envelope_error("LAP_TOO_SOON" if duration is not None and duration >= 0 else "NON_MONOTONIC_CROSSING_TIME", "Thời điểm vòng không hợp lệ hoặc chưa đủ thời gian tối thiểu.", 422)
    db.commit()
    event = db.scalar(select(LapEvent).where(LapEvent.source_event_id == data.source_event_id))
    await hub.publish(run.race_id, {"type": "runner.updated", "race_id": run.race_id, "occurred_at": now_utc().isoformat(), "data": run_dict(db, run)})
    if run.status == "COMPLETED":
        await hub.publish(run.race_id, {"type": "runner.completed", "race_id": run.race_id, "data": run_dict(db, run)})
    return {"accepted": True, "lap_no": event.lap_no, "lap_duration_s": duration, "lap_count": run.lap_count, "status": run.status, "is_done": run.status == "COMPLETED"}


@app.post("/api/v1/runs/{run_id}/finish", dependencies=[Depends(admin)])
async def finish_run(run_id: str, data: FinishIn, db: Session = Depends(db_session)):
    run = get_or_404(db, RunSession, run_id, "phiên chạy")
    if run.status == "COMPLETED": return {"run_id": run.id, "status": run.status, "display_status": "DONE", "is_done": True, "started_at": run.started_at, "ended_at": run.ended_at, "duration_total_s": run.duration_total_s, "distance_total_m": run.distance_total_m, "lap_count": run.lap_count, "total_steps": run.total_steps}
    if run.status != "ACTIVE": envelope_error("RUN_NOT_ACTIVE", "Chỉ phiên ACTIVE mới kết thúc được.")
    run.ended_at = now_utc(); run.duration_total_s = max(0, int((run.ended_at - aware(run.started_at)).total_seconds())); run.status = "COMPLETED"
    maybe_complete_race(db, db.get(Race, run.race_id), run.ended_at)
    db.commit()
    await hub.publish(run.race_id, {"type": "runner.completed", "data": {"student_id": run.student_id, "run_id": run.id, "duration_total_s": run.duration_total_s}})
    return {"run_id": run.id, "status": run.status, "display_status": "DONE", "is_done": True, "started_at": run.started_at, "ended_at": run.ended_at, "duration_total_s": run.duration_total_s, "distance_total_m": round(run.distance_total_m, 2), "lap_count": run.lap_count, "total_steps": run.total_steps}


# 6. [FE LINK] Read APIs: Admin Web uses these to render KPIs, tables, detail and map snapshot.
@app.get("/api/v1/races/{race_id}/overview", dependencies=[Depends(admin)])
def race_overview(race_id: str, db: Session = Depends(db_session)):
    race = get_or_404(db, Race, race_id, "giải chạy")
    runs = db.scalars(select(RunSession).where(RunSession.race_id == race_id)).all()
    participant_count = len(db.scalars(select(RaceParticipant).where(RaceParticipant.race_id == race_id)).all())
    event_count = len(db.scalars(select(DeviceEvent).join(Checkpoint).where(Checkpoint.race_id == race_id)).all())
    return {"race_id": race.id, "status": race.status, "participants": participant_count, "active_runners": sum(x.status == "ACTIVE" for x in runs), "completed_runners": sum(x.status == "COMPLETED" for x in runs), "checkpoint_events": event_count, "route": race_route_dict(db, race_id), **route_lock_metadata(db, race_id), "matching_locked_at": race.matching_locked_at, "matching_locked": race.matching_locked_at is not None, "matching_locked_reason": "Phiên chạy đầu tiên đã được tạo." if race.matching_locked_at else None, "server_time": now_utc()}


@app.get("/api/v1/races/{race_id}/dashboard", dependencies=[Depends(admin)])
def race_dashboard(race_id: str, db: Session = Depends(db_session)):
    """One dashboard snapshot aggregating runner, lap, telemetry and Arduino match metrics."""
    race = get_or_404(db, Race, race_id, "giải chạy")
    participant_rows = db.scalars(select(RaceParticipant).where(RaceParticipant.race_id == race_id)).all()
    runner_rows = []
    for participant in participant_rows:
        latest = db.scalar(select(RunSession).where(RunSession.race_id == race_id, RunSession.student_id == participant.student_id).order_by(RunSession.started_at.desc()).limit(1))
        student = db.get(Student, participant.student_id)
        item = run_dict(db, latest) if latest else {
            "student_id": participant.student_id, "display_id": participant.bib_number, "bib_number": participant.bib_number,
            "student_code": student.student_code if student else None, "full_name": student.full_name if student else None,
            "status": "REGISTERED", "is_done": False, "lap_count": 0, "duration_total_s": 0,
            "distance_total_m": 0, "total_steps": 0, "run_id": None,
        }
        item["display_id"] = participant.bib_number or f"{len(runner_rows) + 1:02d}"
        item["bib_number"] = participant.bib_number or item["display_id"]
        item["total_laps"] = race.total_laps
        runner_rows.append(item)
    event_rows = db.scalars(select(DeviceEvent).join(Checkpoint).where(Checkpoint.race_id == race_id)).all()
    status_counts: dict[str, int] = {}
    for event in event_rows:
        status_counts[event.status] = status_counts.get(event.status, 0) + 1
    completed = [r for r in runner_rows if r["status"] == "COMPLETED"]
    active = [r for r in runner_rows if r["status"] == "ACTIVE"]
    ranked = sorted(runner_rows, key=lambda r: (-r["lap_count"], -r["distance_total_m"], r["duration_total_s"], r["display_id"]))
    return {
        "race": {"race_id": race.id, "name": race.name, "status": race.status, "checkpoint_mode": race.checkpoint_mode,
            "route_profile": race.route_profile,
            "route_length_min_m": race.route_length_min_m,
            "route_length_max_m": race.route_length_max_m,
            "total_laps": race.total_laps, "min_lap_interval_seconds": race.min_lap_interval_seconds,
            "inner_radius_m": race.inner_radius_m, "outer_radius_m": race.outer_radius_m,
            "match_window_seconds": race.match_window_seconds, "late_grace_seconds": race.late_grace_seconds,
            "max_sample_gap_seconds": race.max_sample_gap_seconds,
            "max_event_age_seconds": race.max_event_age_seconds,
            "max_future_skew_seconds": race.max_future_skew_seconds,
            "config_version": race.config_version, "matching_locked_at": race.matching_locked_at,
            "matching_locked": race.matching_locked_at is not None,
            "matching_locked_reason": "Phiên chạy đầu tiên đã được tạo." if race.matching_locked_at else None,
            "route_status": "CONFIGURED" if len(race_route_dict(db, race_id)["points"]) >= 5 else "NOT_CONFIGURED",
            **route_lock_metadata(db, race_id)},
        "summary": {"participants": len(participant_rows), "started_runners": sum(r["run_id"] is not None for r in runner_rows),
            "active_runners": len(active), "completed_runners": len(completed),
            "not_started_runners": sum(r["run_id"] is None for r in runner_rows),
        "runners_at_lap_target": sum(r["lap_count"] >= race.total_laps for r in runner_rows),
            "laps_recorded": sum(r["lap_count"] for r in runner_rows),
            "distance_total_m": round(sum(r["distance_total_m"] for r in runner_rows), 2),
            "steps_total": sum(r["total_steps"] for r in runner_rows),
            "average_duration_s": round(sum(r["duration_total_s"] for r in completed) / len(completed), 1) if completed else 0,
            "checkpoint_events": len(event_rows), "checkpoint_events_by_status": status_counts,
            "pending_matches": status_counts.get("PENDING_MATCH", 0), "ambiguous_matches": status_counts.get("AMBIGUOUS", 0)},
        "checkpoints": [{"checkpoint_id": cp.id, "code": cp.code, "name": cp.name,
            "sequence_no": cp.sequence_no, "kind": cp.kind, "latitude": cp.latitude,
            "longitude": cp.longitude, "radius_m": cp.radius_m}
            for cp in db.scalars(select(Checkpoint).where(Checkpoint.race_id == race_id).order_by(Checkpoint.sequence_no)).all()],
        "route": race_route_dict(db, race_id),
        "checkpoint_progress": [{"checkpoint_id": cp.id, "code": cp.code, "sequence_no": cp.sequence_no,
            "kind": cp.kind, "passes": db.scalar(select(func.count(GPSPassage.id)).where(
                GPSPassage.race_id == race_id, GPSPassage.checkpoint_id == cp.id)) or 0}
            for cp in db.scalars(select(Checkpoint).where(Checkpoint.race_id == race_id).order_by(Checkpoint.sequence_no)).all()],
        "top_runners": ranked[:10], "runners": runner_rows,
        "recent_checkpoint_events": [checkpoint_event_dict(db, e) for e in sorted(event_rows, key=lambda x: aware(x.received_at), reverse=True)[:10]],
        "server_time": now_utc(),
    }


@app.get("/api/v1/races/{race_id}/runners", dependencies=[Depends(admin)])
def race_runners(race_id: str, status: str | None = None, keyword: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), sort_by: str = "student_code", sort_order: str = "asc", db: Session = Depends(db_session)):
    get_or_404(db, Race, race_id, "giải chạy")
    participants = db.scalars(select(RaceParticipant).where(RaceParticipant.race_id == race_id)).all()
    items = []
    for p in participants:
        student = db.get(Student, p.student_id)
        run = db.scalar(select(RunSession).where(RunSession.race_id == race_id, RunSession.student_id == p.student_id).order_by(RunSession.started_at.desc()))
        display_id = p.bib_number or f"{len(items) + 1:02d}"
        item = run_dict(db, run) if run else {"student_id": student.id, "display_id": display_id, "bib_number": display_id, "student_code": student.student_code, "full_name": student.full_name, "status": "REGISTERED", "is_done": False, "run_id": None, "lap_count": 0, "distance_total_m": 0, "total_steps": 0}
        item["display_id"] = item["bib_number"] = display_id
        item["total_laps"] = db.get(Race, race_id).total_laps
        if status and item["status"] != status: continue
        if keyword and keyword.lower() not in f"{student.student_code} {student.full_name}".lower(): continue
        items.append(item)
    key = sort_by if sort_by in {"student_code", "full_name", "lap_count", "distance_total_m", "status"} else "student_code"
    items.sort(key=lambda x: (x.get(key) is None, x.get(key)), reverse=sort_order.lower() == "desc")
    total = len(items); start = (page - 1) * page_size
    return {"items": items[start:start + page_size], "page": page, "page_size": page_size, "total": total}


@app.get("/api/v1/races/{race_id}/live", dependencies=[Depends(admin)])
def race_live(race_id: str, db: Session = Depends(db_session)):
    get_or_404(db, Race, race_id, "giải chạy")
    runs = db.scalars(select(RunSession).where(RunSession.race_id == race_id)).all()
    latest_by_student: dict[str, RunSession] = {}
    for run in runs:
        if run.student_id not in latest_by_student or aware(run.started_at) > aware(latest_by_student[run.student_id].started_at):
            latest_by_student[run.student_id] = run
    runners = []
    for student_id, run in latest_by_student.items():
        item = run_dict(db, run)
        item.update({"latitude": run.last_latitude, "longitude": run.last_longitude})
        runners.append(item)
    return {"race_id": race_id, "server_time": now_utc(), "route": race_route_dict(db, race_id), "runners": runners}


@app.get("/api/v1/runners/{student_id}/runs/{run_id}", dependencies=[Depends(admin)])
def run_detail(student_id: str, run_id: str, db: Session = Depends(db_session)):
    run = get_or_404(db, RunSession, run_id, "phiên chạy")
    if run.student_id != student_id: envelope_error("RUN_IDENTITY_MISMATCH", "Phiên chạy không thuộc sinh viên này.", 404)
    return run_dict(db, run)


@app.get("/api/v1/runners/{student_id}/runs/{run_id}/events", dependencies=[Depends(admin)])
def run_events(student_id: str, run_id: str, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200), db: Session = Depends(db_session)):
    run = get_or_404(db, RunSession, run_id, "phiên chạy")
    if run.student_id != student_id: envelope_error("RUN_IDENTITY_MISMATCH", "Phiên chạy không thuộc sinh viên này.", 404)
    points = db.scalars(select(GpsPoint).where(GpsPoint.run_id == run_id).order_by(GpsPoint.recorded_at)).all()
    laps = db.scalars(select(LapEvent).where(LapEvent.run_id == run_id).order_by(LapEvent.occurred_at)).all()
    all_events = [{"type": "GPS", "id": x.id, "occurred_at": x.recorded_at, "wearable_device_id": x.wearable_device_id, "latitude": x.latitude, "longitude": x.longitude, "total_steps": x.total_steps} for x in points] + [{"type": "LAP", "id": x.id, "occurred_at": x.occurred_at, "lap_no": x.lap_no, "duration_s": x.duration_s} for x in laps]
    all_events.sort(key=lambda x: x["occurred_at"]); start = (page - 1) * page_size
    return {"items": all_events[start:start + page_size], "page": page, "page_size": page_size, "total": len(all_events)}


@app.get("/api/v1/races/{race_id}/device-events", dependencies=[Depends(admin)])
def device_events(race_id: str, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200), db: Session = Depends(db_session)):
    get_or_404(db, Race, race_id, "giải chạy")
    rows = db.scalars(select(DeviceEvent).join(Checkpoint).where(Checkpoint.race_id == race_id).order_by(DeviceEvent.received_at.desc())).all()
    start = (page - 1) * page_size
    return {"items": [{"device_event_id": x.id, "device_id": x.device_id, "checkpoint_id": x.checkpoint_id, "occurred_at": x.occurred_at, "received_at": x.received_at, "event_type": x.event_type, "identity_status": x.status, "student_id": x.student_id} for x in rows[start:start + page_size]], "page": page, "page_size": page_size, "total": len(rows)}


# 7. [FE LINK] Live channel: clients load GET /live first, then apply these committed changes.
@app.websocket("/ws/v1/races/{race_id}/live")
async def live_socket(websocket: WebSocket, race_id: str, key: str | None = None):
    # WebSocket clients pass the admin key as ?key=... because browser WS APIs cannot set headers.
    if key != settings.admin_api_key:
        await websocket.close(code=4401); return
    await hub.connect(race_id, websocket)
    try:
        while True:
            await websocket.receive_text()  # client ping/keepalive; server publishes updates separately
    except WebSocketDisconnect:
        hub.disconnect(race_id, websocket)


# Create demo tables, then apply small forward-only migrations for existing local SQLite/SQL Server databases.
Base.metadata.create_all(bind=engine)


def migrate_demo_schema() -> None:
    """Keep existing demo DBs usable; production deployments should use Alembic revisions."""
    additions = {
        "run_sessions": {"wearable_device_id": "VARCHAR(80) NULL"},
        "gps_points": {"wearable_device_id": "VARCHAR(80) NULL", "payload_hash": "VARCHAR(64) NULL"},
        "idempotency_records": {"request_hash": "VARCHAR(64) NULL"},
        "races": {
            "route_profile": "VARCHAR(30) NOT NULL DEFAULT 'CUSTOM'",
            "route_length_min_m": "FLOAT NULL",
            "route_length_max_m": "FLOAT NULL",
            "checkpoint_mode": "VARCHAR(30) NOT NULL DEFAULT 'GPS_ONLY'",
            "min_lap_interval_seconds": "INTEGER NOT NULL DEFAULT 30",
            "inner_radius_m": "FLOAT NOT NULL DEFAULT 10",
            "outer_radius_m": "FLOAT NOT NULL DEFAULT 15",
            "match_window_seconds": "INTEGER NOT NULL DEFAULT 3",
            "late_grace_seconds": "INTEGER NOT NULL DEFAULT 2",
            "max_sample_gap_seconds": "INTEGER NOT NULL DEFAULT 5",
            "max_event_age_seconds": "INTEGER NOT NULL DEFAULT 10",
            "max_future_skew_seconds": "INTEGER NOT NULL DEFAULT 2",
            "config_version": "INTEGER NOT NULL DEFAULT 1",
            "matching_locked_at": "DATETIME NULL",
        },
        "device_events": {
            "payload_hash": "VARCHAR(64) NULL",
            "lap_status": "VARCHAR(20) NOT NULL DEFAULT 'NOT_EVALUATED'",
            "reason_code": "VARCHAR(80) NULL",
            "match_deadline_at": "DATETIME NULL",
            "matched_run_id": "VARCHAR(36) NULL",
            "passage_id": "VARCHAR(36) NULL",
            "method": "VARCHAR(40) NULL",
            "lap_event_id": "VARCHAR(36) NULL",
            "lap_number": "INTEGER NULL",
            "lap_duration_ms": "INTEGER NULL",
            "candidates_json": "TEXT NULL",
            "candidates_final": ("BIT" if engine.dialect.name == "mssql" else "BOOLEAN") + " NOT NULL DEFAULT 0",
            "version": "INTEGER NOT NULL DEFAULT 1",
            "config_version": "INTEGER NULL",
        },
    }
    with engine.begin() as connection:
        for table_name, columns in additions.items():
            existing = {column["name"] for column in inspect(engine).get_columns(table_name)}
            for column_name, sql_type in columns.items():
                if column_name not in existing:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD {column_name} {sql_type}"))


migrate_demo_schema()


async def matching_worker_loop() -> None:
    """Recover and settle due Arduino/GPS matches from durable rows after startup."""
    while True:
        try:
            with SessionLocal() as db:
                changed = match_due_events(db)
                for item in changed:
                    await hub.publish(item["race_id"], {"type": "checkpoint.match.updated", "race_id": item["race_id"], "data": item["event"]})
                    if item["event"].get("lap_status") == "COUNTED" and item["run_id"]:
                        with SessionLocal() as run_db:
                            run = run_db.get(RunSession, item["run_id"])
                            if run:
                                await hub.publish(item["race_id"], {"type": "runner.updated", "race_id": item["race_id"], "data": run_dict(run_db, run)})
                                if item["completed"]:
                                    await hub.publish(item["race_id"], {"type": "runner.completed", "race_id": item["race_id"], "data": run_dict(run_db, run)})
        except asyncio.CancelledError:
            raise
        except Exception:
            # Keep the worker alive; the database row remains pending and is retried next scan.
            logger.exception("Checkpoint matching worker iteration failed")
        await asyncio.sleep(1)


_matching_worker: asyncio.Task | None = None


@app.on_event("startup")
async def start_matching_worker() -> None:
    global _matching_worker
    _matching_worker = asyncio.create_task(matching_worker_loop())


@app.on_event("shutdown")
async def stop_matching_worker() -> None:
    if _matching_worker:
        _matching_worker.cancel()
        try:
            await _matching_worker
        except asyncio.CancelledError:
            pass


@app.on_event("shutdown")
async def stop_simulator_processes() -> None:
    """Do not leave a demo subprocess sending GPS after the API server exits."""
    for job_id, job in _simulation_jobs.items():
        try:
            _simulation_job_snapshot(job_id)
        except HTTPException:
            continue
        process = job.get("process")
        if process and process.poll() is None:
            job["stop_requested"] = True
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            job["finished_at"] = now_utc()
        if job.get("race_id"):
            _cancel_simulation_runs(job["race_id"])
