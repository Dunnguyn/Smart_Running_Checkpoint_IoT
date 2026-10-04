"""FastAPI backend for the NEU Smart Running checkpoint system.

The comments are intentionally instructional: each section explains its role so
the project can be used as both a working baseline and a learning reference.
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker


# 1. Configuration: secrets and database settings come from .env, never source code.
class Settings(BaseSettings):
    database_url: str = "sqlite:///./running_demo.db"
    admin_api_key: str = "dev-admin-key-change-me"
    simulator_api_key: str = "dev-simulator-key-change-me"
    gateway_api_key: str = "dev-gateway-key-change-me"
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    min_lap_interval_seconds: int = 30
    max_gps_speed_mps: float = 12.0
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
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
    total_laps: Mapped[int] = mapped_column(Integer, default=5)
    participants: Mapped[list["RaceParticipant"]] = relationship(back_populates="race", cascade="all, delete-orphan")
    checkpoints: Mapped[list["Checkpoint"]] = relationship(back_populates="race", cascade="all, delete-orphan")


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


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    key: Mapped[str] = mapped_column(String(140), primary_key=True)
    resource_id: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


# 3. API contracts: explicit types document exactly what the web/IoT clients send.
class RaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    start_at: datetime | None = None
    end_at: datetime | None = None
    status: str = "DRAFT"
    route_name: str | None = None
    total_laps: int = Field(default=5, ge=1, le=100)


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


class ParticipantIn(BaseModel):
    student_id: str
    bib_number: str | None = None


class RunIn(BaseModel):
    race_id: str
    student_id: str
    wearable_device_id: str
    source: str = "SIMULATOR"
    idempotency_key: str = Field(min_length=1, max_length=120)


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
    source_event_id: str
    device_id: str
    checkpoint_id: str
    event_type: str = "PASSAGE_DETECTED"
    occurred_at: datetime
    student_id: str | None = None
    raw_payload: str | None = None


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
app = FastAPI(title="NEU Smart Running Backend", version="1.0.0", description="Backend cho giải chạy IoT: REST, SQL Server và WebSocket.")
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


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


def aware(value: datetime) -> datetime:
    """Normalize naive client ISO timestamps to UTC; aware timestamps convert to UTC."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


@app.get("/health")
def health():
    """Health endpoint for local startup and deployment monitoring."""
    return {"status": "ok", "server_time": now_utc()}


@app.get("/", include_in_schema=False)
def home():
    """Open the API documentation when the user visits the site root."""
    return RedirectResponse(url="/docs")


# 5. Race setup APIs: Admin Web creates races, students, checkpoints and registrations.
@app.post("/api/v1/races", status_code=201, dependencies=[Depends(admin)])
def create_race(data: RaceIn, db: Session = Depends(db_session)):
    race = Race(**data.model_dump())
    db.add(race); db.commit(); db.refresh(race)
    return {"race_id": race.id, "name": race.name, "status": race.status, "total_laps": race.total_laps}


@app.get("/api/v1/races", dependencies=[Depends(admin)])
def list_races(db: Session = Depends(db_session)):
    return {"items": [{"race_id": r.id, "name": r.name, "status": r.status, "start_at": r.start_at} for r in db.scalars(select(Race)).all()]}


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
    get_or_404(db, Race, race_id, "giải chạy")
    checkpoint = Checkpoint(race_id=race_id, **data.model_dump()); db.add(checkpoint); db.commit(); db.refresh(checkpoint)
    return {"checkpoint_id": checkpoint.id, **data.model_dump()}


@app.post("/api/v1/races/{race_id}/participants", status_code=201, dependencies=[Depends(admin)])
def add_participant(race_id: str, data: ParticipantIn, db: Session = Depends(db_session)):
    get_or_404(db, Race, race_id, "giải chạy"); get_or_404(db, Student, data.student_id, "sinh viên")
    existing = db.scalar(select(RaceParticipant).where(RaceParticipant.race_id == race_id, RaceParticipant.student_id == data.student_id))
    if existing: envelope_error("ALREADY_REGISTERED", "Sinh viên đã đăng ký giải chạy.")
    participant = RaceParticipant(race_id=race_id, **data.model_dump()); db.add(participant); db.commit()
    return {"race_id": race_id, "student_id": data.student_id, "registration_status": "REGISTERED"}


def run_dict(db: Session, run: RunSession) -> dict[str, Any]:
    student = db.get(Student, run.student_id)
    elapsed = run.duration_total_s if run.duration_total_s is not None else max(0, int((now_utc() - aware(run.started_at)).total_seconds()))
    return {"run_id": run.id, "race_id": run.race_id, "student_id": run.student_id, "wearable_device_id": run.wearable_device_id, "student_code": student.student_code if student else None, "full_name": student.full_name if student else None, "status": run.status, "source": run.source, "started_at": run.started_at, "ended_at": run.ended_at, "distance_total_m": round(run.distance_total_m, 2), "duration_total_s": elapsed, "lap_count": run.lap_count, "last_lap_duration_s": run.last_lap_duration_s, "total_steps": run.total_steps, "last_latitude": run.last_latitude, "last_longitude": run.last_longitude, "last_seen_at": run.last_seen_at}


# [DEVICE LINK: GPS + STEPS] A run is bound to the wearable already paired to this student.
@app.post("/api/v1/runs", status_code=201, dependencies=[Depends(simulator)])
def create_run(data: RunIn, db: Session = Depends(db_session)):
    record = db.get(IdempotencyRecord, data.idempotency_key)
    if record:
        run = db.get(RunSession, record.resource_id)
        return {"run_id": run.id, "race_id": run.race_id, "student_id": run.student_id, "wearable_device_id": run.wearable_device_id, "status": run.status, "started_at": run.started_at}
    get_or_404(db, Race, data.race_id, "giải chạy"); get_or_404(db, Student, data.student_id, "sinh viên")
    wearable = get_or_404(db, RunnerWearable, data.wearable_device_id, "thiết bị đeo")
    if wearable.student_id != data.student_id or wearable.status != "ACTIVE":
        envelope_error("WEARABLE_RUNNER_MISMATCH", "Thiết bị GPS/bước chân không được gán cho runner này.")
    participant = db.scalar(select(RaceParticipant).where(RaceParticipant.race_id == data.race_id, RaceParticipant.student_id == data.student_id))
    if not participant: envelope_error("NOT_REGISTERED", "Sinh viên chưa đăng ký giải chạy.")
    active = db.scalar(select(RunSession).where(RunSession.race_id == data.race_id, RunSession.student_id == data.student_id, RunSession.status == "ACTIVE"))
    if active: envelope_error("ACTIVE_RUN_EXISTS", "Sinh viên đã có phiên chạy ACTIVE trong giải này.")
    run = RunSession(race_id=data.race_id, student_id=data.student_id, wearable_device_id=wearable.id, source=data.source, started_at=now_utc())
    db.add(run); db.flush(); db.add(IdempotencyRecord(key=data.idempotency_key, resource_id=run.id)); db.commit(); db.refresh(run)
    return {"run_id": run.id, "race_id": run.race_id, "student_id": run.student_id, "wearable_device_id": run.wearable_device_id, "status": run.status, "started_at": run.started_at}


# [DEVICE LINK: GPS + STEPS] One message carries position and step snapshot from the same wearable.
@app.post("/api/v1/telemetry/gps", status_code=202, dependencies=[Depends(simulator)])
async def receive_gps(data: GpsIn, db: Session = Depends(db_session)):
    """Accept telemetry from the runner's paired GPS/step wearable.

    An outside-to-inside transition across a LAP checkpoint geofence identifies
    this runner (through the registered wearable binding) and records a lap.
    """
    duplicate = db.scalar(select(GpsPoint).where(GpsPoint.idempotency_key == data.idempotency_key))
    if duplicate:
        run = get_or_404(db, RunSession, duplicate.run_id, "phiên chạy")
        return {"accepted": True, "gps_point_id": duplicate.id, "distance_delta_m": 0, "distance_total_m": run.distance_total_m, "total_steps": run.total_steps, "lap_count": run.lap_count, "checkpoint_crossings": [], "duplicate": True, "received_at": duplicate.received_at}
    run = get_or_404(db, RunSession, data.run_id, "phiên chạy")
    if run.race_id != data.race_id or run.student_id != data.student_id: envelope_error("RUN_IDENTITY_MISMATCH", "Thông tin giải hoặc sinh viên không khớp phiên chạy.")
    if run.status != "ACTIVE": envelope_error("RUN_NOT_ACTIVE", "Phiên chạy không ở trạng thái đang chạy.")
    if run.wearable_device_id != data.wearable_device_id: envelope_error("WEARABLE_RUN_MISMATCH", "Thiết bị telemetry không được gán cho phiên chạy này.")
    wearable = get_or_404(db, RunnerWearable, data.wearable_device_id, "thiết bị đeo")
    if wearable.student_id != run.student_id or wearable.status != "ACTIVE": envelope_error("WEARABLE_RUNNER_MISMATCH", "Thiết bị GPS/bước chân không được gán cho runner này.")
    recorded = aware(data.recorded_at)
    if run.last_gps_recorded_at and recorded <= aware(run.last_gps_recorded_at): envelope_error("GPS_OUT_OF_ORDER", "Thời điểm GPS phải tăng dần.", 422)
    if data.total_steps < run.total_steps: envelope_error("STEPS_DECREASED", "Snapshot bước chân không được nhỏ hơn giá trị đã lưu.", 422)
    previous_latitude, previous_longitude = run.last_latitude, run.last_longitude
    delta = 0.0
    if previous_latitude is not None and previous_longitude is not None:
        delta = haversine_m(previous_latitude, previous_longitude, data.latitude, data.longitude)
        if run.last_gps_recorded_at is not None:
            seconds = (recorded - aware(run.last_gps_recorded_at)).total_seconds()
            if delta / seconds > settings.max_gps_speed_mps: envelope_error("GPS_JUMP_REJECTED", "Điểm GPS vượt ngưỡng tốc độ hợp lệ.", 422)
    received = now_utc()
    point = GpsPoint(run_id=run.id, wearable_device_id=wearable.id, latitude=data.latitude, longitude=data.longitude, recorded_at=recorded, received_at=received, accuracy_m=data.accuracy_m, speed_mps=data.speed_mps, total_steps=data.total_steps, source=data.source, idempotency_key=data.idempotency_key)
    db.add(point); run.distance_total_m += delta; run.total_steps = data.total_steps; run.last_latitude = data.latitude; run.last_longitude = data.longitude; run.last_seen_at = received; run.last_gps_recorded_at = recorded
    wearable.last_seen_at = received

    # A checkpoint pass is inferred from an outside-to-inside GPS geofence transition.
    # The telemetry already belongs to a student through the registered wearable/run.
    crossings: list[dict[str, Any]] = []
    if previous_latitude is not None and previous_longitude is not None:
        lap_checkpoints = db.scalars(
            select(Checkpoint)
            .where(
                Checkpoint.race_id == run.race_id,
                Checkpoint.kind == "LAP",
                Checkpoint.latitude.is_not(None),
                Checkpoint.longitude.is_not(None),
            )
            .order_by(Checkpoint.sequence_no)
        ).all()
        for checkpoint in lap_checkpoints:
            previous_distance = haversine_m(previous_latitude, previous_longitude, checkpoint.latitude, checkpoint.longitude)
            current_distance = haversine_m(data.latitude, data.longitude, checkpoint.latitude, checkpoint.longitude)
            if previous_distance <= checkpoint.radius_m or current_distance > checkpoint.radius_m:
                continue

            anchor = aware(run.last_lap_at or run.started_at)
            lap_duration = int((recorded - anchor).total_seconds())
            crossing = {"checkpoint_id": checkpoint.id, "checkpoint_code": checkpoint.code, "student_id": run.student_id, "run_id": run.id, "identity_status": "ASSIGNED", "lap_updated": False}
            if lap_duration >= settings.min_lap_interval_seconds:
                source_event_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{data.idempotency_key}:{checkpoint.id}"))
                run.lap_count += 1
                run.last_lap_duration_s = lap_duration
                run.last_lap_at = recorded
                db.add(LapEvent(run_id=run.id, checkpoint_id=checkpoint.id, occurred_at=recorded, lap_no=run.lap_count, duration_s=lap_duration, source=data.source, source_event_id=source_event_id))
                crossing.update({"lap_updated": True, "lap_no": run.lap_count, "lap_duration_s": lap_duration})
            else:
                crossing["rejection_reason"] = "LAP_TOO_SOON"
            crossings.append(crossing)
            # A single GPS fix counts at most one checkpoint to avoid overlapping geofences.
            break

    db.commit(); db.refresh(point)
    await hub.publish(run.race_id, {"type": "runner.updated", "race_id": run.race_id, "occurred_at": received.isoformat(), "data": {"student_id": run.student_id, "run_id": run.id, "wearable_device_id": wearable.id, "latitude": run.last_latitude, "longitude": run.last_longitude, "distance_total_m": round(run.distance_total_m, 2), "total_steps": run.total_steps, "lap_count": run.lap_count, "status": run.status, "source": run.source, "last_seen_at": received.isoformat()}})
    for crossing in crossings:
        await hub.publish(run.race_id, {"type": "checkpoint.passed", "race_id": run.race_id, "occurred_at": recorded.isoformat(), "data": crossing})
    return {"accepted": True, "gps_point_id": point.id, "distance_delta_m": round(delta, 2), "distance_total_m": round(run.distance_total_m, 2), "total_steps": run.total_steps, "lap_count": run.lap_count, "checkpoint_crossings": crossings, "received_at": received}


# [DEVICE LINK: ARDUINO GATEWAY] Physical passage-only sensors still arrive without runner identity.
@app.post("/api/v1/checkpoint-events", status_code=202, dependencies=[Depends(gateway)])
async def receive_device_event(data: DeviceEventIn, db: Session = Depends(db_session)):
    # Do not trust an identity sent by the current UNO gateway: no identity hardware/flow is approved yet.
    if data.student_id is not None:
        envelope_error("DEVICE_IDENTITY_NOT_SUPPORTED", "Gateway hiện chưa có quy trình định danh runner; hãy gửi student_id=null.", 422)
    duplicate = db.scalar(select(DeviceEvent).where(DeviceEvent.source_event_id == data.source_event_id))
    if duplicate: return {"accepted": True, "device_event_id": duplicate.id, "identity_status": duplicate.status, "lap_updated": False, "duplicate": True, "received_at": duplicate.received_at}
    checkpoint = get_or_404(db, Checkpoint, data.checkpoint_id, "checkpoint")
    device = db.get(Device, data.device_id)
    if not device:
        device = Device(id=data.device_id, name=data.device_id, checkpoint_id=checkpoint.id, last_seen_at=now_utc()); db.add(device)
    elif device.checkpoint_id and device.checkpoint_id != checkpoint.id: envelope_error("DEVICE_CHECKPOINT_MISMATCH", "Thiết bị không được đăng ký tại checkpoint này.")
    # Arduino ultrasonic sensor does not identify the person; keep this event unassigned.
    identity = "UNASSIGNED"
    event = DeviceEvent(device_id=data.device_id, checkpoint_id=checkpoint.id, occurred_at=aware(data.occurred_at), received_at=now_utc(), event_type=data.event_type, source_event_id=data.source_event_id, student_id=data.student_id, status=identity, raw_payload=data.raw_payload)
    db.add(event); device.last_seen_at = now_utc(); db.commit(); db.refresh(event)
    await hub.publish(checkpoint.race_id, {"type": "checkpoint.detected", "data": {"device_event_id": event.id, "checkpoint_id": checkpoint.id, "identity_status": identity}})
    return {"accepted": True, "device_event_id": event.id, "identity_status": identity, "lap_updated": False, "received_at": event.received_at}


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
    occurred = aware(data.occurred_at)
    anchor = aware(run.last_lap_at or run.started_at)
    duration = int((occurred - anchor).total_seconds())
    if duration < settings.min_lap_interval_seconds: envelope_error("LAP_TOO_SOON", "Chưa đủ thời gian tối thiểu giữa hai vòng.", 422)
    run.lap_count += 1; run.last_lap_duration_s = duration; run.last_lap_at = occurred
    event = LapEvent(run_id=run.id, checkpoint_id=checkpoint.id, occurred_at=occurred, lap_no=run.lap_count, duration_s=duration, source=data.source, source_event_id=data.source_event_id)
    db.add(event); db.commit()
    await hub.publish(run.race_id, {"type": "runner.updated", "race_id": run.race_id, "occurred_at": now_utc().isoformat(), "data": {"student_id": run.student_id, "run_id": run.id, "lap_count": run.lap_count, "last_lap_duration_s": duration, "status": run.status}})
    return {"accepted": True, "lap_no": event.lap_no, "lap_duration_s": duration, "lap_count": run.lap_count, "status": run.status}


@app.post("/api/v1/runs/{run_id}/finish", dependencies=[Depends(admin)])
async def finish_run(run_id: str, data: FinishIn, db: Session = Depends(db_session)):
    run = get_or_404(db, RunSession, run_id, "phiên chạy")
    if run.status == "COMPLETED": return {"run_id": run.id, "status": run.status, "started_at": run.started_at, "ended_at": run.ended_at, "duration_total_s": run.duration_total_s, "distance_total_m": run.distance_total_m, "lap_count": run.lap_count, "total_steps": run.total_steps}
    if run.status != "ACTIVE": envelope_error("RUN_NOT_ACTIVE", "Chỉ phiên ACTIVE mới kết thúc được.")
    run.ended_at = now_utc(); run.duration_total_s = max(0, int((run.ended_at - aware(run.started_at)).total_seconds())); run.status = "COMPLETED"; db.commit()
    await hub.publish(run.race_id, {"type": "runner.completed", "data": {"student_id": run.student_id, "run_id": run.id, "duration_total_s": run.duration_total_s}})
    return {"run_id": run.id, "status": run.status, "started_at": run.started_at, "ended_at": run.ended_at, "duration_total_s": run.duration_total_s, "distance_total_m": round(run.distance_total_m, 2), "lap_count": run.lap_count, "total_steps": run.total_steps}


# 6. [FE LINK] Read APIs: Admin Web uses these to render KPIs, tables, detail and map snapshot.
@app.get("/api/v1/races/{race_id}/overview", dependencies=[Depends(admin)])
def race_overview(race_id: str, db: Session = Depends(db_session)):
    race = get_or_404(db, Race, race_id, "giải chạy")
    runs = db.scalars(select(RunSession).where(RunSession.race_id == race_id)).all()
    participant_count = len(db.scalars(select(RaceParticipant).where(RaceParticipant.race_id == race_id)).all())
    event_count = len(db.scalars(select(DeviceEvent).join(Checkpoint).where(Checkpoint.race_id == race_id)).all())
    return {"race_id": race.id, "status": race.status, "participants": participant_count, "active_runners": sum(x.status == "ACTIVE" for x in runs), "completed_runners": sum(x.status == "COMPLETED" for x in runs), "checkpoint_events": event_count, "server_time": now_utc()}


@app.get("/api/v1/races/{race_id}/runners", dependencies=[Depends(admin)])
def race_runners(race_id: str, status: str | None = None, keyword: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), sort_by: str = "student_code", sort_order: str = "asc", db: Session = Depends(db_session)):
    get_or_404(db, Race, race_id, "giải chạy")
    participants = db.scalars(select(RaceParticipant).where(RaceParticipant.race_id == race_id)).all()
    items = []
    for p in participants:
        student = db.get(Student, p.student_id)
        run = db.scalar(select(RunSession).where(RunSession.race_id == race_id, RunSession.student_id == p.student_id).order_by(RunSession.started_at.desc()))
        item = run_dict(db, run) if run else {"student_id": student.id, "student_code": student.student_code, "full_name": student.full_name, "status": "REGISTERED", "run_id": None, "lap_count": 0, "distance_total_m": 0, "total_steps": 0}
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
    runs = db.scalars(select(RunSession).where(RunSession.race_id == race_id, RunSession.status == "ACTIVE")).all()
    return {"race_id": race_id, "server_time": now_utc(), "runners": [{"student_id": r.student_id, "run_id": r.id, "wearable_device_id": r.wearable_device_id, "latitude": r.last_latitude, "longitude": r.last_longitude, "lap_count": r.lap_count, "distance_total_m": round(r.distance_total_m, 2), "total_steps": r.total_steps, "status": r.status, "last_seen_at": r.last_seen_at} for r in runs]}


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


# Create demo tables, then add the two nullable device columns for databases from the earlier MVP.
Base.metadata.create_all(bind=engine)


def migrate_wearable_columns() -> None:
    """Small forward-only compatibility migration; production should use Alembic."""
    for table_name, column_name in (("run_sessions", "wearable_device_id"), ("gps_points", "wearable_device_id")):
        existing = {column["name"] for column in inspect(engine).get_columns(table_name)}
        if column_name not in existing:
            with engine.begin() as connection:
                connection.execute(text(f"ALTER TABLE {table_name} ADD {column_name} VARCHAR(80) NULL"))


migrate_wearable_columns()
