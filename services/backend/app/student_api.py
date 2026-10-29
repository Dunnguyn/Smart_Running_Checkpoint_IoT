"""Student mobile API. Admin endpoints stay in main.py and keep X-Admin-Key auth.

The app uses student-scoped bearer tokens. It never receives an admin/device key,
and every read/write derives the student identity from the authenticated session.
"""
from __future__ import annotations

import hashlib
import base64
import hmac
import json
import secrets
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func, or_, select, update
from sqlalchemy.orm import Mapped, Session, mapped_column

from . import main as core

router = APIRouter()
Base = core.Base


# Student account credentials are separate from the Student profile so the
# public app profile never exposes password material.
class StudentAccount(Base):
    __tablename__ = "student_accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=core.new_id)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=core.now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=core.now_utc)


class StudentAuthSession(Base):
    __tablename__ = "student_auth_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=core.new_id)
    account_id: Mapped[str] = mapped_column(ForeignKey("student_accounts.id"), index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("students.id"), index=True)
    installation_id: Mapped[str] = mapped_column(String(36))
    platform: Mapped[str] = mapped_column(String(10))
    access_hash: Mapped[str] = mapped_column(String(64), unique=True)
    access_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=core.now_utc)


class StudentRefreshToken(Base):
    __tablename__ = "student_refresh_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=core.new_id)
    session_id: Mapped[str] = mapped_column(ForeignKey("student_auth_sessions.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replaced_by_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=core.now_utc)


class StudentAttendanceConfig(Base):
    __tablename__ = "student_attendance_configs"
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), primary_key=True)
    check_in_checkpoint_id: Mapped[str] = mapped_column(ForeignKey("checkpoints.id"))
    check_out_checkpoint_id: Mapped[str] = mapped_column(ForeignKey("checkpoints.id"))
    check_in_open_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    check_in_close_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    check_out_open_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    check_out_close_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    max_position_age_seconds: Mapped[int] = mapped_column(Integer, default=30)
    max_accuracy_m: Mapped[float] = mapped_column(Float, default=30)
    version: Mapped[int] = mapped_column(Integer, default=1)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class StudentRacePolicy(Base):
    """Opt-in publication and self-registration settings; old races stay hidden/closed."""
    __tablename__ = "student_race_policies"
    race_id: Mapped[str] = mapped_column(ForeignKey("races.id"), primary_key=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    registration_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    registration_opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    registration_closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)


class StudentRunPause(Base):
    """Durable pause interval. The RunSession remains ACTIVE to block checkout/new runs."""
    __tablename__ = "student_run_pauses"
    __table_args__ = (UniqueConstraint("run_id", "paused_at", name="uq_student_run_pause_start"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=core.new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("run_sessions.id"), index=True)
    paused_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    steps_at_pause: Mapped[int] = mapped_column(Integer, default=0)
    steps_offset_after: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=core.now_utc)


class StudentAttendance(Base):
    __tablename__ = "student_attendance"
    __table_args__ = (UniqueConstraint("registration_id", name="uq_student_attendance_registration"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=core.new_id)
    registration_id: Mapped[str] = mapped_column(ForeignKey("race_participants.id"), index=True)
    status: Mapped[str] = mapped_column(String(24), default="CHECKED_IN")
    checked_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    check_in_latitude: Mapped[float] = mapped_column(Float)
    check_in_longitude: Mapped[float] = mapped_column(Float)
    check_in_accuracy_m: Mapped[float] = mapped_column(Float)
    check_in_captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    check_out_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_out_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_out_accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_out_captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(24), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)


class StudentMutationReceipt(Base):
    __tablename__ = "student_mutation_receipts"
    __table_args__ = (UniqueConstraint("account_id", "idempotency_key", name="uq_student_mutation_key"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=core.new_id)
    account_id: Mapped[str] = mapped_column(ForeignKey("student_accounts.id"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(80))
    method_path: Mapped[str] = mapped_column(String(220))
    payload_hash: Mapped[str] = mapped_column(String(64))
    status_code: Mapped[int] = mapped_column(Integer)
    response_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=core.now_utc)


class MobileGpsBatchReceipt(Base):
    __tablename__ = "mobile_gps_batch_receipts"
    __table_args__ = (UniqueConstraint("run_id", "batch_id", name="uq_mobile_gps_batch"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=core.new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("run_sessions.id"), index=True)
    batch_id: Mapped[str] = mapped_column(String(36))
    payload_hash: Mapped[str] = mapped_column(String(64))
    response_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=core.now_utc)


class StudentRealtimeTicket(Base):
    __tablename__ = "student_realtime_tickets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=core.new_id)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("student_auth_sessions.id"), index=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("student_accounts.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# Request schemas are intentionally strict: the app cannot mass-assign backend
# identity, source, status, lap count, or race configuration fields.
class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginIn(StrictInput):
    student_code: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=128)
    installation_id: str
    platform: str
    app_version: str = Field(min_length=1, max_length=32)


class RefreshIn(StrictInput):
    refresh_token: str = Field(min_length=20, max_length=200)
    installation_id: str


class LogoutIn(StrictInput):
    refresh_token: str = Field(min_length=20, max_length=200)


class ChangePasswordIn(StrictInput):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class PositionEvidence(StrictInput):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    accuracy_m: float = Field(gt=0, le=10000, allow_inf_nan=False)
    captured_at: datetime


class CheckInIn(StrictInput):
    position: PositionEvidence


class StartRunIn(StrictInput):
    position: PositionEvidence
    consent_version: str = Field(min_length=1, max_length=40)
    consent_granted: bool


class WithdrawIn(StrictInput):
    expected_revision: int = Field(ge=1)


class CheckOutIn(StrictInput):
    position: PositionEvidence


class GpsSampleIn(StrictInput):
    sample_id: str
    sequence: int = Field(ge=1)
    recorded_at: datetime
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    accuracy_m: float = Field(gt=0, le=10000, allow_inf_nan=False)
    speed_mps: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    steps_since_start: int | None = Field(default=None, ge=0)


class GpsBatchIn(StrictInput):
    batch_id: str
    samples: list[GpsSampleIn] = Field(min_length=1, max_length=100)


class RunControlIn(StrictInput):
    expected_revision: int = Field(ge=1)


class ResumeRunIn(RunControlIn):
    # Current app step snapshot resets the cumulative counter baseline, excluding pause steps.
    steps_since_start: int = Field(ge=0)


class StudentRacePolicyIn(StrictInput):
    expected_version: int = Field(ge=0)
    description: str | None = Field(default=None, max_length=2000)
    published: bool
    registration_enabled: bool
    registration_opens_at: datetime | None = None
    registration_closes_at: datetime | None = None
    capacity: int | None = Field(default=None, ge=1, le=100000)


class EmptyStudentRequest(StrictInput):
    pass


class AttendanceConfigIn(StrictInput):
    expected_version: int = Field(ge=0)
    check_in_open_at: datetime
    check_in_close_at: datetime
    check_out_open_at: datetime
    check_out_close_at: datetime
    check_in_checkpoint_id: str
    check_out_checkpoint_id: str
    max_position_age_seconds: int = Field(ge=5, le=60)
    max_accuracy_m: float = Field(ge=5, le=100, allow_inf_nan=False)


class AdminAccountIn(StrictInput):
    student_id: str


class AdminResetPasswordIn(StrictInput):
    reason: str = Field(min_length=1, max_length=500)


@dataclass
class StudentPrincipal:
    account: StudentAccount
    session: StudentAuthSession
    student: core.Student


_student_sockets: dict[str, set[WebSocket]] = {}


def _utc(value: datetime) -> datetime:
    return core.aware(value)


def _hash_token(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _make_access_token(account: StudentAccount, session: StudentAuthSession, expires: datetime) -> str:
    issued = core.now_utc()
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    claims = {"sub": account.id, "student_id": session.student_id, "role": "STUDENT",
              "sid": session.id, "installation_id": session.installation_id,
              "iat": int(issued.timestamp()), "exp": int(expires.timestamp()),
              "iss": "neu-run-backend", "aud": "neu-run-student-app"}
    body = _b64url(json.dumps(claims, separators=(",", ":")).encode())
    signing_input = f"{header}.{body}"
    signature = hmac.new(core.settings.student_jwt_secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url(signature)}"


def _valid_access_claims(token: str) -> dict[str, Any] | None:
    try:
        header, body, signature = token.split(".")
        signing_input = f"{header}.{body}"
        expected = _b64url(hmac.new(core.settings.student_jwt_secret.encode(), signing_input.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        claims = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if claims.get("iss") != "neu-run-backend" or claims.get("aud") != "neu-run-student-app" or claims.get("role") != "STUDENT":
            return None
        if int(claims.get("exp", 0)) <= int(core.now_utc().timestamp()):
            return None
        return claims
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def _password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return "pbkdf2_sha256$310000$" + salt.hex() + "$" + digest.hex()


def _verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, rounds, salt_hex, expected = encoded.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(rounds)).hex()
        return secrets.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def _fail(status: int, code: str, message: str, *, details: list[dict[str, Any]] | None = None):
    trace_id = core.new_id()
    raise HTTPException(status, detail={"error": {"code": code, "message": message,
                           "details": details or [], "trace_id": trace_id}, "server_time": core.now_utc().isoformat()})


def _require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    core.require_key(core.settings.admin_api_key, x_admin_key, "admin")


def _profile(student: core.Student, account: StudentAccount) -> dict[str, Any]:
    return {"student_id": student.id, "student_code": student.student_code,
            "full_name": student.full_name, "faculty": student.faculty,
            "class_name": None, "account_status": account.status,
            "must_change_password": account.must_change_password}


def _token_pair(db: Session, account: StudentAccount, session: StudentAuthSession,
                student: core.Student, *, refresh_row: StudentRefreshToken | None = None) -> dict[str, Any]:
    now = core.now_utc()
    session.access_expires_at = now + timedelta(minutes=15)
    access = _make_access_token(account, session, session.access_expires_at)
    refresh = secrets.token_urlsafe(48)
    session.access_hash = _hash_token(access)
    refresh_row = StudentRefreshToken(session_id=session.id, token_hash=_hash_token(refresh),
                                      expires_at=now + timedelta(days=30))
    db.add(refresh_row)
    db.flush()
    return {"access_token": access, "token_type": "Bearer", "expires_in": 900,
            "refresh_token": refresh, "refresh_expires_in": 2_592_000,
            "profile": _profile(student, account), "server_time": now}


def _principal(authorization: str | None, db: Session, *, allow_password_change: bool = False) -> StudentPrincipal:
    if not authorization or not authorization.startswith("Bearer "):
        _fail(401, "UNAUTHENTICATED", "Đăng nhập để tiếp tục.")
    raw_token = authorization[7:].strip()
    claims = _valid_access_claims(raw_token)
    if not claims:
        _fail(401, "UNAUTHENTICATED", "Access token không hợp lệ hoặc đã hết hạn.")
    token_hash = _hash_token(raw_token)
    session = db.scalar(select(StudentAuthSession).where(StudentAuthSession.access_hash == token_hash))
    if not session or session.revoked_at or _utc(session.access_expires_at) <= core.now_utc():
        _fail(401, "UNAUTHENTICATED", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.")
    if claims.get("sid") != session.id or claims.get("sub") != session.account_id or claims.get("student_id") != session.student_id or claims.get("installation_id") != session.installation_id:
        _fail(401, "UNAUTHENTICATED", "Access token không khớp phiên đăng nhập.")
    account = db.get(StudentAccount, session.account_id)
    student = db.get(core.Student, session.student_id)
    if not account or not student or account.status != "ACTIVE" or student.status != "ACTIVE":
        _fail(403, "ACCOUNT_DISABLED", "Tài khoản sinh viên đã bị vô hiệu hóa.")
    if account.must_change_password and not allow_password_change:
        _fail(403, "PASSWORD_CHANGE_REQUIRED", "Hãy đổi mật khẩu tạm trước khi tiếp tục.")
    return StudentPrincipal(account=account, session=session, student=student)


def require_student(authorization: str | None = Header(default=None),
                    db: Session = Depends(core.db_session)) -> StudentPrincipal:
    return _principal(authorization, db)


def _enrollment(db: Session, race_id: str, student_id: str) -> tuple[core.Race, core.RaceParticipant]:
    race = db.get(core.Race, race_id)
    participant = db.scalar(select(core.RaceParticipant).where(
        core.RaceParticipant.race_id == race_id,
        core.RaceParticipant.student_id == student_id))
    if not race or not participant:
        _fail(404, "RESOURCE_NOT_FOUND", "Không tìm thấy giải chạy.")
    return race, participant


def _attendance(db: Session, registration_id: str) -> StudentAttendance | None:
    return db.scalar(select(StudentAttendance).where(StudentAttendance.registration_id == registration_id))


def _latest_run(db: Session, race_id: str, student_id: str) -> core.RunSession | None:
    return db.scalar(select(core.RunSession).where(
        core.RunSession.race_id == race_id, core.RunSession.student_id == student_id
    ).order_by(core.RunSession.started_at.desc()).limit(1))


def _open_pause(db: Session, run_id: str) -> StudentRunPause | None:
    return db.scalar(select(StudentRunPause).where(
        StudentRunPause.run_id == run_id, StudentRunPause.resumed_at.is_(None)
    ).order_by(StudentRunPause.paused_at.desc()).limit(1))


def _pause_totals(db: Session, run: core.RunSession, now: datetime) -> tuple[int, StudentRunPause | None]:
    intervals = db.scalars(select(StudentRunPause).where(
        StudentRunPause.run_id == run.id).order_by(StudentRunPause.paused_at)).all()
    limit_at = _utc(run.ended_at) if run.ended_at else now
    total = 0
    for interval in intervals:
        start = _utc(interval.paused_at)
        end = min(_utc(interval.resumed_at) if interval.resumed_at else now, limit_at)
        if end > start:
            total += int((end - start).total_seconds())
    return total, _open_pause(db, run.id)


def _race_policy(db: Session, race_id: str) -> StudentRacePolicy | None:
    return db.get(StudentRacePolicy, race_id)


def _registration_gate(db: Session, race: core.Race, student_id: str) -> tuple[bool, str | None, int, int | None]:
    policy = _race_policy(db, race.id)
    registration = db.scalar(select(core.RaceParticipant).where(
        core.RaceParticipant.race_id == race.id,
        core.RaceParticipant.student_id == student_id))
    registered_count = db.scalar(select(func.count(core.RaceParticipant.id)).where(
        core.RaceParticipant.race_id == race.id,
        core.RaceParticipant.registration_status == "REGISTERED")) or 0
    if registration:
        return False, "ALREADY_REGISTERED", registered_count, policy.capacity if policy else None
    if not policy or not policy.published:
        return False, "RACE_NOT_PUBLISHED", registered_count, policy.capacity if policy else None
    if race.status == "CANCELLED":
        return False, "RACE_CANCELLED", registered_count, policy.capacity
    challenge_registration_live = bool(race.target_distance_m and race.status == "LIVE")
    if (race.status != "SCHEDULED" and not challenge_registration_live) or not policy.registration_enabled:
        return False, "REGISTRATION_NOT_OPEN", registered_count, policy.capacity
    now = core.now_utc()
    if not policy.registration_opens_at or not policy.registration_closes_at:
        return False, "REGISTRATION_NOT_OPEN", registered_count, policy.capacity
    if now < _utc(policy.registration_opens_at):
        return False, "REGISTRATION_NOT_OPEN", registered_count, policy.capacity
    if now > _utc(policy.registration_closes_at):
        return False, "REGISTRATION_CLOSED", registered_count, policy.capacity
    if policy.capacity is not None and registered_count >= policy.capacity:
        return False, "RACE_FULL", registered_count, policy.capacity
    return True, None, registered_count, policy.capacity


def run_is_paused_at(db: Session, run_id: str, at: datetime) -> bool:
    moment = _utc(at)
    intervals = db.scalars(select(StudentRunPause).where(
        StudentRunPause.run_id == run_id).order_by(StudentRunPause.paused_at)).all()
    return any(_utc(item.paused_at) <= moment and
               (item.resumed_at is None or moment < _utc(item.resumed_at)) for item in intervals)


def close_open_pause(db: Session, run_id: str, at: datetime) -> None:
    interval = _open_pause(db, run_id)
    if interval and _utc(at) > _utc(interval.paused_at):
        interval.resumed_at = _utc(at)


def _run_snapshot(db: Session, run: core.RunSession, installation_id: str | None = None) -> dict[str, Any]:
    race = db.get(core.Race, run.race_id)
    participant = db.scalar(select(core.RaceParticipant).where(
        core.RaceParticipant.race_id == run.race_id,
        core.RaceParticipant.student_id == run.student_id))
    latest = db.scalar(select(core.GpsPoint).where(core.GpsPoint.run_id == run.id)
                       .order_by(core.GpsPoint.recorded_at.desc()).limit(1))
    now = core.now_utc()
    elapsed = run.duration_total_s if run.duration_total_s is not None else max(0, int((now - _utc(run.started_at)).total_seconds()))
    paused_seconds, open_pause = _pause_totals(db, run, now)
    last_resume = db.scalar(select(StudentRunPause).where(
        StudentRunPause.run_id == run.id, StudentRunPause.resumed_at.is_not(None),
        StudentRunPause.resumed_at <= now
    ).order_by(StudentRunPause.resumed_at.desc()).limit(1))
    segment_steps_offset = last_resume.steps_offset_after if last_resume else 0
    tracking_state = "PAUSED" if open_pause and run.status == "ACTIVE" else "RUNNING" if run.status == "ACTIVE" else "TERMINAL"
    return {"run_id": run.id, "race_id": run.race_id,
            "registration_id": participant.id if participant else None,
            "bib_number": _bib(db, run.race_id, run.student_id), "status": run.status,
            "source": run.source, "started_at": run.started_at, "ended_at": run.ended_at,
            "finalized_at": getattr(run, "finalized_at", None) if run.status in {"COMPLETED", "ABANDONED", "CANCELLED"} else None,
            "duration_total_s": elapsed, "elapsed_seconds": elapsed,
            "active_seconds": max(0, elapsed - paused_seconds),
            "paused_seconds": paused_seconds, "tracking_state": tracking_state,
            "paused_at": open_pause.paused_at if open_pause else None,
            "segment_id": getattr(run, "segment_id", 1), "distance_total_m": round(run.distance_total_m, 2),
            "lap_count": run.lap_count, "target_laps": race.total_laps if race else 0,
            "last_lap_duration_s": run.last_lap_duration_s, "total_steps": run.total_steps,
            "last_position": ({"latitude": latest.latitude, "longitude": latest.longitude,
                               "accuracy_m": latest.accuracy_m, "recorded_at": latest.recorded_at,
                               "received_at": latest.received_at} if latest else None),
            "gps_freshness": ("FINAL" if run.status != "ACTIVE" else
                              "MISSING" if not latest else
                              "FRESH" if (now - _utc(latest.received_at)).total_seconds() <= 15 else "STALE"),
            "tracking_required": run.status == "ACTIVE" and open_pause is None, "revision": getattr(run, "revision", 1),
            "result_state": ("PENDING" if run.status == "ACTIVE" else
                             "VOID" if run.status == "CANCELLED" else "FINAL"),
            "last_processed_sequence": getattr(run, "last_sequence", 0),
            "segment_steps_current": max(0, run.total_steps - segment_steps_offset),
            "actions": {"can_pause": run.status == "ACTIVE" and open_pause is None,
                        "can_resume": run.status == "ACTIVE" and open_pause is not None,
                        "can_withdraw": run.status == "ACTIVE"},
            "bound_to_current_installation": (installation_id is None or run.wearable_device_id == f"MOBILE:{installation_id}"),
            "pending_matching_count": db.scalar(select(func.count(core.DeviceEvent.id)).where(
                core.DeviceEvent.matched_run_id == run.id,
                core.DeviceEvent.status.in_(["PENDING_MATCH", "AMBIGUOUS"]))) or 0,
            "server_time": now}


def _bib(db: Session, race_id: str, student_id: str) -> str | None:
    p = db.scalar(select(core.RaceParticipant).where(
        core.RaceParticipant.race_id == race_id, core.RaceParticipant.student_id == student_id))
    return p.bib_number if p else None


def _participation(db: Session, race: core.Race, participant: core.RaceParticipant,
                   student_id: str, installation_id: str | None = None) -> dict[str, Any]:
    attendance = _attendance(db, participant.id)
    run = _latest_run(db, race.id, student_id)
    config = db.get(StudentAttendanceConfig, race.id)
    # SQLite drops timezone metadata on DateTime reads; normalize both sides
    # before building UI action projections to avoid naive/aware TypeErrors.
    now = _utc(core.now_utc())
    check_in_open = _utc(config.check_in_open_at) if config else None
    check_in_close = _utc(config.check_in_close_at) if config else None
    check_out_open = _utc(config.check_out_open_at) if config else None
    check_out_close = _utc(config.check_out_close_at) if config else None
    active = run is not None and run.status == "ACTIVE"
    checked_in = attendance is not None and attendance.status == "CHECKED_IN"
    run_view = _run_snapshot(db, run, installation_id) if run else None
    check_in_allowed = bool(config and attendance is None and check_in_open <= now <= check_in_close)
    check_out_allowed = bool(config and checked_in and not active and check_out_open <= now <= check_out_close)
    return {"race_id": race.id, "registration_id": participant.id,
            "registration_status": participant.registration_status,
            "bib_number": participant.bib_number,
            "attendance": ({"attendance_id": attendance.id, "status": attendance.status,
                            "checked_in_at": attendance.checked_in_at, "checked_out_at": attendance.checked_out_at,
                            "outcome": attendance.outcome, "version": attendance.version}
                           if attendance else {"attendance_id": None, "status": "NOT_CHECKED_IN",
                                              "checked_in_at": None, "checked_out_at": None,
                                              "outcome": None, "version": 0}),
            "run": run_view,
            "actions": [
                {"action": "CHECK_IN", "allowed": check_in_allowed,
                 "reason_code": None if check_in_allowed else "CHECK_IN_NOT_OPEN"},
                {"action": "START", "allowed": checked_in and not active and race.status == "LIVE",
                 "reason_code": None if checked_in and not active and race.status == "LIVE" else "CHECK_IN_REQUIRED"},
                {"action": "WITHDRAW", "allowed": active,
                 "reason_code": None if active else "RUN_NOT_ACTIVE"},
                {"action": "PAUSE", "allowed": bool(run_view and run_view["actions"]["can_pause"]),
                 "reason_code": None if run_view and run_view["actions"]["can_pause"] else "RUN_NOT_ACTIVE"},
                {"action": "RESUME", "allowed": bool(run_view and run_view["actions"]["can_resume"]),
                 "reason_code": None if run_view and run_view["actions"]["can_resume"] else "RUN_NOT_PAUSED"},
                {"action": "CHECK_OUT", "allowed": check_out_allowed,
                 "reason_code": None if check_out_allowed else "CHECK_OUT_NOT_OPEN"},
            ], "server_time": now}


def _participation_for_run(db: Session, run: core.RunSession) -> dict[str, Any]:
    participant = db.scalar(select(core.RaceParticipant).where(
        core.RaceParticipant.race_id == run.race_id, core.RaceParticipant.student_id == run.student_id))
    attendance = _attendance(db, participant.id) if participant else None
    return {"attendance_id": attendance.id if attendance else None,
            "status": attendance.status if attendance else "NOT_CHECKED_IN",
            "checked_in_at": attendance.checked_in_at if attendance else None,
            "checked_out_at": attendance.checked_out_at if attendance else None,
            "outcome": attendance.outcome if attendance else None,
            "version": attendance.version if attendance else 0}


def _canonical_hash(payload: Any) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def _receipt_replay(db: Session, principal: StudentPrincipal, key: str, path: str, payload: Any):
    receipt = db.scalar(select(StudentMutationReceipt).where(
        StudentMutationReceipt.account_id == principal.account.id,
        StudentMutationReceipt.idempotency_key == key))
    if not receipt:
        return None
    if receipt.method_path != path or receipt.payload_hash != _canonical_hash(payload):
        _fail(409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key đã được sử dụng với request khác.")
    return JSONResponse(status_code=receipt.status_code,
                        content=jsonable_encoder(json.loads(receipt.response_json), exclude_none=False),
                        headers={"Idempotency-Replayed": "true", "Cache-Control": "no-store"})


def _save_receipt(db: Session, principal: StudentPrincipal, key: str, path: str,
                  payload: Any, response: dict[str, Any], status: int = 200) -> JSONResponse:
    db.add(StudentMutationReceipt(account_id=principal.account.id, idempotency_key=key,
        method_path=path, payload_hash=_canonical_hash(payload), status_code=status,
        response_json=json.dumps(jsonable_encoder(response), separators=(",", ":"))))
    db.flush()
    return JSONResponse(status_code=status, content=jsonable_encoder(response), headers={"Cache-Control": "no-store"})


def _idempotency_key(value: str | None) -> str:
    if not value or len(value) > 80:
        _fail(422, "VALIDATION_ERROR", "Thiếu Idempotency-Key hợp lệ.")
    return value


def _validate_position(db: Session, race_id: str, position: PositionEvidence,
                       checkpoint_id: str, config: StudentAttendanceConfig) -> core.Checkpoint:
    checkpoint = db.get(core.Checkpoint, checkpoint_id)
    if not checkpoint or checkpoint.race_id != race_id:
        _fail(409, "CHECKPOINT_RACE_MISMATCH", "Checkpoint điểm danh không thuộc giải này.")
    if checkpoint.latitude is None or checkpoint.longitude is None or checkpoint.radius_m <= 0:
        _fail(409, "ATTENDANCE_NOT_CONFIGURED", "Checkpoint điểm danh chưa có tọa độ hợp lệ.")
    captured = _utc(position.captured_at)
    now = core.now_utc()
    if (now - captured).total_seconds() > config.max_position_age_seconds:
        _fail(422, "GPS_SAMPLE_STALE", "Vị trí GPS đã quá hạn.")
    if (captured - now).total_seconds() > 5:
        _fail(422, "CLOCK_SKEW", "Thời gian trên thiết bị vượt giới hạn cho phép.")
    if position.accuracy_m > config.max_accuracy_m:
        _fail(422, "GPS_INACCURATE", "Độ chính xác GPS chưa đạt yêu cầu.")
    distance = core.haversine_m(position.latitude, position.longitude,
                                checkpoint.latitude, checkpoint.longitude)
    if distance > checkpoint.radius_m:
        _fail(422, "OUTSIDE_ATTENDANCE_ZONE", "Bạn đang ở ngoài vùng điểm danh.")
    return checkpoint


def _assert_window(now: datetime, opens: datetime, closes: datetime, *, opening: str, closing: str):
    if now < _utc(opens):
        _fail(409, opening, "Chưa đến thời gian thao tác.")
    if now > _utc(closes):
        _fail(409, closing, "Đã hết thời gian thao tác.")


def _race_view(db: Session, race: core.Race, student_id: str, installation_id: str) -> dict[str, Any]:
    participant = db.scalar(select(core.RaceParticipant).where(
        core.RaceParticipant.race_id == race.id, core.RaceParticipant.student_id == student_id))
    policy = _race_policy(db, race.id)
    if not participant and (not policy or not policy.published or race.status == "DRAFT"):
        _fail(404, "RESOURCE_NOT_FOUND", "Không tìm thấy giải chạy.")
    part = _participation(db, race, participant, student_id, installation_id) if participant else None
    config = db.get(StudentAttendanceConfig, race.id)
    route = core.race_route_dict(db, race.id)
    now = core.now_utc()
    can_register, blocked_reason, registered_count, capacity = _registration_gate(db, race, student_id)
    return {"race_id": race.id, "name": race.name,
            "description": policy.description if policy else None,
            "location": race.route_name, "status": race.status,
            "start_at": race.start_at, "end_at": race.end_at,
            "matching_mode": race.checkpoint_mode, "target_laps": race.total_laps,
            "target_distance_m": race.target_distance_m,
            "route_length_m": route.get("distance_m"),
            "registration_opens_at": policy.registration_opens_at if policy else None,
            "registration_closes_at": policy.registration_closes_at if policy else None,
            "capacity": capacity, "registered_count": registered_count,
            "remaining_slots": max(0, capacity - registered_count) if capacity is not None else None,
            "registration_status": participant.registration_status if participant else None,
            "bib_number": participant.bib_number if participant else None,
            "attendance_status": part["attendance"]["status"] if part else None,
            "run_status": part["run"]["status"] if part and part["run"] else None,
            "participation": part,
            "attendance_configured": config is not None,
            "can_register": can_register,
            "blocked_reason": blocked_reason,
            "actions": {"can_register": can_register,
                        "can_check_in": bool(part and any(a["action"] == "CHECK_IN" and a["allowed"] for a in part["actions"])),
                        "can_start": bool(part and any(a["action"] == "START" and a["allowed"] for a in part["actions"])),
                        "can_pause": bool(part and part["run"] and part["run"]["actions"]["can_pause"]),
                        "can_resume": bool(part and part["run"] and part["run"]["actions"]["can_resume"]),
                        "can_withdraw": bool(part and any(a["action"] == "WITHDRAW" and a["allowed"] for a in part["actions"])),
                        "can_check_out": bool(part and any(a["action"] == "CHECK_OUT" and a["allowed"] for a in part["actions"]))},
            "server_time": now}


def _race_for_registered(db: Session, race_id: str, student_id: str) -> tuple[core.Race, core.RaceParticipant]:
    race, participant = _enrollment(db, race_id, student_id)
    if race.status == "DRAFT":
        _fail(404, "RESOURCE_NOT_FOUND", "Không tìm thấy giải chạy.")
    return race, participant


async def publish_student_event(student_id: str, event_type: str, aggregate_type: str,
                                aggregate_id: str, revision: int, data: dict[str, Any]) -> None:
    """Fan-out committed student-visible state events to this process's sockets."""
    event = {"event_id": core.new_id(), "type": event_type, "schema_version": 1,
             "aggregate_type": aggregate_type, "aggregate_id": aggregate_id,
             "revision": revision, "occurred_at": core.now_utc(), "data": data}
    for socket in list(_student_sockets.get(student_id, set())):
        try:
            await socket.send_json(jsonable_encoder(event))
        except (RuntimeError, WebSocketDisconnect):
            _student_sockets.get(student_id, set()).discard(socket)


@router.post("/api/v1/student/auth/login")
def student_login(data: LoginIn, db: Session = Depends(core.db_session)):
    if data.platform not in {"ANDROID", "IOS"}:
        _fail(422, "VALIDATION_ERROR", "platform phải là ANDROID hoặc IOS.")
    try:
        uuid.UUID(data.installation_id)
    except ValueError:
        _fail(422, "VALIDATION_ERROR", "installation_id phải là UUID.")
    student = db.scalar(select(core.Student).where(core.Student.student_code == data.student_code.strip()))
    account = db.scalar(select(StudentAccount).where(StudentAccount.student_id == student.id)) if student else None
    if not account or account.status != "ACTIVE" or student.status != "ACTIVE" or not _verify_password(data.password, account.password_hash):
        _fail(401, "INVALID_CREDENTIALS", "Mã sinh viên hoặc mật khẩu không chính xác.")
    session = StudentAuthSession(id=core.new_id(), account_id=account.id, student_id=student.id,
        installation_id=data.installation_id, platform=data.platform, access_hash="", access_expires_at=core.now_utc())
    db.add(session); db.flush()
    pair = _token_pair(db, account, session, student)
    db.commit()
    return pair


@router.post("/api/v1/student/auth/refresh")
def refresh_student_token(data: RefreshIn, db: Session = Depends(core.db_session)):
    try:
        uuid.UUID(data.installation_id)
    except ValueError:
        _fail(422, "VALIDATION_ERROR", "installation_id phải là UUID.")
    token_hash = _hash_token(data.refresh_token)
    token_row = db.scalar(select(StudentRefreshToken).where(StudentRefreshToken.token_hash == token_hash).with_for_update())
    if not token_row:
        _fail(401, "INVALID_REFRESH_TOKEN", "Refresh token không hợp lệ.")
    session = db.get(StudentAuthSession, token_row.session_id)
    if not session:
        _fail(401, "INVALID_REFRESH_TOKEN", "Refresh token không hợp lệ.")
    if token_row.used_at:
        session.revoked_at = core.now_utc()
        db.commit()
        _fail(401, "REFRESH_REUSE_DETECTED", "Refresh token đã được thay thế; phiên đăng nhập bị thu hồi.")
    if session.revoked_at or _utc(token_row.expires_at) <= core.now_utc() or session.installation_id != data.installation_id:
        _fail(401, "INVALID_REFRESH_TOKEN", "Refresh token không hợp lệ hoặc đã hết hạn.")
    account = db.get(StudentAccount, session.account_id)
    student = db.get(core.Student, session.student_id)
    if not account or not student or account.status != "ACTIVE" or student.status != "ACTIVE":
        _fail(401, "INVALID_REFRESH_TOKEN", "Refresh token không hợp lệ.")
    now = core.now_utc()
    token_row.used_at = now
    pair = _token_pair(db, account, session, student)
    token_row.replaced_by_hash = _hash_token(pair["refresh_token"])
    db.commit()
    return pair


@router.post("/api/v1/student/auth/logout", status_code=204)
def student_logout(data: LogoutIn, db: Session = Depends(core.db_session)):
    token = db.scalar(select(StudentRefreshToken).where(StudentRefreshToken.token_hash == _hash_token(data.refresh_token)))
    if token:
        session = db.get(StudentAuthSession, token.session_id)
        if session and not session.revoked_at:
            session.revoked_at = core.now_utc()
            db.commit()
    return Response(status_code=204)


@router.post("/api/v1/student/auth/change-password", status_code=204)
def change_student_password(data: ChangePasswordIn, authorization: str | None = Header(default=None),
                           db: Session = Depends(core.db_session)):
    principal = _principal(authorization, db, allow_password_change=True)
    if not _verify_password(data.current_password, principal.account.password_hash):
        _fail(401, "INVALID_CREDENTIALS", "Mật khẩu hiện tại không chính xác.")
    if secrets.compare_digest(data.current_password, data.new_password):
        _fail(400, "PASSWORD_UNCHANGED", "Mật khẩu mới phải khác mật khẩu hiện tại.")
    active = db.scalar(select(core.RunSession.id).where(
        core.RunSession.student_id == principal.student.id, core.RunSession.status == "ACTIVE").limit(1))
    if active:
        _fail(409, "ACTIVE_RUN_EXISTS", "Hãy xử lý phiên chạy đang hoạt động trước khi đổi mật khẩu.")
    principal.account.password_hash = _password_hash(data.new_password)
    principal.account.must_change_password = False
    principal.account.updated_at = core.now_utc()
    for row in db.scalars(select(StudentAuthSession).where(
            StudentAuthSession.account_id == principal.account.id,
            StudentAuthSession.revoked_at.is_(None))).all():
        row.revoked_at = core.now_utc()
    db.commit()
    return Response(status_code=204)


@router.get("/api/v1/student/me")
def student_me(authorization: str | None = Header(default=None),
               db: Session = Depends(core.db_session)):
    principal = _principal(authorization, db, allow_password_change=True)
    return {"profile": _profile(principal.student, principal.account),
            "capabilities": {"can_track_gps": True, "can_view_personal_history": True},
            "server_time": core.now_utc()}


@router.get("/api/v1/admin/races/{race_id}/student-policy")
def admin_get_student_race_policy(race_id: str, x_admin_key: str | None = Header(default=None),
                                  db: Session = Depends(core.db_session)):
    _require_admin(x_admin_key)
    race = db.get(core.Race, race_id)
    if not race:
        _fail(404, "RESOURCE_NOT_FOUND", "Không tìm thấy giải chạy.")
    policy = _race_policy(db, race_id)
    registered_count = db.scalar(select(func.count(core.RaceParticipant.id)).where(
        core.RaceParticipant.race_id == race_id,
        core.RaceParticipant.registration_status == "REGISTERED")) or 0
    return {"race_id": race_id, "description": policy.description if policy else None,
            "published": bool(policy and policy.published),
            "registration_enabled": bool(policy and policy.registration_enabled),
            "registration_opens_at": policy.registration_opens_at if policy else None,
            "registration_closes_at": policy.registration_closes_at if policy else None,
            "capacity": policy.capacity if policy else None,
            "registered_count": registered_count,
            "version": policy.version if policy else 0, "server_time": core.now_utc()}


@router.put("/api/v1/admin/races/{race_id}/student-policy")
async def admin_put_student_race_policy(race_id: str, data: StudentRacePolicyIn,
                                        x_admin_key: str | None = Header(default=None),
                                        db: Session = Depends(core.db_session)):
    _require_admin(x_admin_key)
    race = core.lock_race_configuration(db, race_id)
    policy = _race_policy(db, race_id)
    current_version = policy.version if policy else 0
    if data.expected_version != current_version:
        _fail(409, "VERSION_CONFLICT", "Cấu hình đăng ký đã thay đổi; hãy tải lại.")
    if data.registration_enabled:
        if not data.published:
            _fail(422, "REGISTRATION_REQUIRES_PUBLISHED_RACE", "Giải cần được công bố trước khi mở đăng ký.")
        if not data.registration_opens_at or not data.registration_closes_at:
            _fail(422, "REGISTRATION_WINDOW_REQUIRED", "Cần đặt thời điểm mở và đóng đăng ký.")
        if _utc(data.registration_opens_at) >= _utc(data.registration_closes_at):
            _fail(422, "INVALID_REGISTRATION_WINDOW", "Thời điểm mở phải trước thời điểm đóng đăng ký.")
    registered_count = db.scalar(select(func.count(core.RaceParticipant.id)).where(
        core.RaceParticipant.race_id == race_id,
        core.RaceParticipant.registration_status == "REGISTERED")) or 0
    if data.capacity is not None and data.capacity < registered_count:
        _fail(409, "CAPACITY_BELOW_REGISTERED", "Sức chứa không thể nhỏ hơn số sinh viên đã đăng ký.")
    values = data.model_dump(exclude={"expected_version"})
    if policy:
        for name, value in values.items():
            setattr(policy, name, value)
        policy.version += 1
    else:
        policy = StudentRacePolicy(race_id=race_id, version=1, **values)
        db.add(policy)
    db.commit()
    result = {"race_id": race_id, "description": policy.description,
              "published": policy.published, "registration_enabled": policy.registration_enabled,
              "registration_opens_at": policy.registration_opens_at,
              "registration_closes_at": policy.registration_closes_at,
              "capacity": policy.capacity, "registered_count": registered_count,
              "version": policy.version, "server_time": core.now_utc()}
    await core.hub.publish(race_id, {"event_id": core.new_id(), "type": "race.registration.config.updated",
        "race_id": race_id, "occurred_at": result["server_time"], "data": result})
    return result


def _next_bib_number(db: Session, race_id: str) -> str:
    current = db.scalars(select(core.RaceParticipant.bib_number).where(
        core.RaceParticipant.race_id == race_id)).all()
    numbers = [int(value) for value in current if value and value.isdigit()]
    candidate = max(numbers, default=0) + 1
    return f"{candidate:02d}"


@router.post("/api/v1/student/races/{race_id}/registrations", status_code=201)
async def student_register_for_race(race_id: str, data: EmptyStudentRequest,
                                    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
                                    principal: StudentPrincipal = Depends(require_student),
                                    db: Session = Depends(core.db_session)):
    key = _idempotency_key(idempotency_key)
    try:
        uuid.UUID(key)
    except ValueError:
        _fail(422, "VALIDATION_ERROR", "Idempotency-Key phải là UUID.")
    path = f"POST:/api/v1/student/races/{race_id}/registrations"
    payload = data.model_dump(mode="json")
    replay = _receipt_replay(db, principal, key, path, payload)
    if replay:
        return replay
    race = core.lock_race_configuration(db, race_id)
    existing = db.scalar(select(core.RaceParticipant).where(
        core.RaceParticipant.race_id == race_id,
        core.RaceParticipant.student_id == principal.student.id))
    if existing:
        result = {"registration_id": existing.id, "race_id": race_id,
                  "registration_status": existing.registration_status,
                  "bib_number": existing.bib_number,
                  "registered_at": getattr(existing, "registered_at", None),
                  "server_time": core.now_utc()}
        response = _save_receipt(db, principal, key, path, payload, result, 200)
        db.commit()
        return response
    allowed, reason, registered_count, capacity = _registration_gate(db, race, principal.student.id)
    if not allowed:
        messages = {"RACE_NOT_PUBLISHED": "Giải chưa được công bố cho sinh viên.",
                    "REGISTRATION_NOT_OPEN": "Giải chưa mở đăng ký.",
                    "REGISTRATION_CLOSED": "Đã hết hạn đăng ký.",
                    "RACE_FULL": "Giải đã đủ số lượng sinh viên.",
                    "RACE_CANCELLED": "Giải đã bị hủy."}
        _fail(409, reason or "REGISTRATION_NOT_OPEN", messages.get(reason, "Không thể đăng ký giải này."))
    # lock_race_configuration obtains a per-race write lock on SQLite and a row
    # lock on SQL Server before capacity and bib allocation are checked.
    if capacity is not None and registered_count >= capacity:
        _fail(409, "RACE_FULL", "Giải đã đủ số lượng sinh viên.")
    now = core.now_utc()
    bib_number = _next_bib_number(db, race_id)
    participant = core.RaceParticipant(race_id=race_id, student_id=principal.student.id,
        bib_number=bib_number, registration_status="REGISTERED")
    db.add(participant)
    db.flush()
    result = {"registration_id": participant.id, "race_id": race_id,
              "registration_status": participant.registration_status,
              "bib_number": participant.bib_number, "registered_at": now,
              "server_time": now}
    response = _save_receipt(db, principal, key, path, payload, result, 201)
    db.commit()
    await core.hub.publish(race_id, {"event_id": core.new_id(), "type": "race.participant.registered",
        "race_id": race_id, "occurred_at": now, "data": result})
    await publish_student_event(principal.student.id, "registration.created", "REGISTRATION",
        participant.id, 1, result)
    return response


@router.get("/api/v1/student/races")
def student_races(status: str | None = None, keyword: str | None = Query(default=None, max_length=100),
                  registered_only: bool = False,
                  limit: int = Query(default=20, ge=1, le=100), cursor: str | None = None,
                  principal: StudentPrincipal = Depends(require_student), db: Session = Depends(core.db_session)):
    registered_races = select(core.RaceParticipant.race_id).where(
        core.RaceParticipant.student_id == principal.student.id)
    stmt = select(core.Race).join(StudentRacePolicy,
        StudentRacePolicy.race_id == core.Race.id).where(
        StudentRacePolicy.published.is_(True), core.Race.status != "DRAFT")
    if registered_only:
        stmt = stmt.where(core.Race.id.in_(registered_races))
    else:
        stmt = stmt.where(or_(core.Race.status.in_(["SCHEDULED", "LIVE"]),
                              core.Race.id.in_(registered_races)))
    if status:
        stmt = stmt.where(core.Race.status == status.upper())
    if keyword and keyword.strip():
        stmt = stmt.where(core.Race.name.ilike(f"%{keyword.strip()}%"))
    rows = db.scalars(stmt.order_by(core.Race.start_at.desc().nullslast(), core.Race.id).limit(500)).all()
    offset = 0
    if cursor:
        try:
            offset = int(__import__("base64").urlsafe_b64decode(cursor + "==").decode())
        except Exception:
            _fail(400, "INVALID_CURSOR", "Cursor không hợp lệ; hãy tải lại danh sách.")
    page = rows[offset:offset + limit]
    next_offset = offset + len(page)
    next_cursor = (__import__("base64").urlsafe_b64encode(str(next_offset).encode()).decode().rstrip("=")) if next_offset < len(rows) else None
    items = [_race_view(db, race, principal.student.id, principal.session.installation_id) for race in page]
    return {"items": items, "next_cursor": next_cursor, "has_more": next_cursor is not None,
            "server_time": core.now_utc()}


@router.get("/api/v1/student/races/{race_id}")
def student_race_detail(race_id: str, principal: StudentPrincipal = Depends(require_student),
                        db: Session = Depends(core.db_session)):
    race = db.get(core.Race, race_id)
    if not race:
        _fail(404, "RESOURCE_NOT_FOUND", "Không tìm thấy giải chạy.")
    return _race_view(db, race, principal.student.id, principal.session.installation_id)


@router.get("/api/v1/student/races/{race_id}/map")
def student_race_map(race_id: str, principal: StudentPrincipal = Depends(require_student),
                     db: Session = Depends(core.db_session)):
    race = db.get(core.Race, race_id)
    if not race:
        _fail(404, "RESOURCE_NOT_FOUND", "Không tìm thấy giải chạy.")
    _race_view(db, race, principal.student.id, principal.session.installation_id)
    route = core.race_route_dict(db, race.id)
    checkpoints = db.scalars(select(core.Checkpoint).where(
        core.Checkpoint.race_id == race.id).order_by(core.Checkpoint.sequence_no)).all()
    lock = core.route_lock_metadata(db, race.id)
    return {"race_id": race.id, "route_version": race.config_version,
            "coordinate_system": "WGS84", "route_points": route["points"],
            "checkpoints": [{"checkpoint_id": cp.id, "code": cp.code, "name": cp.name,
                "sequence_no": cp.sequence_no, "type": cp.kind, "latitude": cp.latitude,
                "longitude": cp.longitude, "radius_m": cp.radius_m,
                "is_lap_counting": cp.kind == "LAP"} for cp in checkpoints],
            "route_length_m": route["distance_m"] if route["points"] else None,
            "route_locked": lock["locked"], "lock_reason": lock["locked_reason"],
            "server_time": core.now_utc()}


@router.get("/api/v1/student/races/{race_id}/participation")
def student_participation(race_id: str, principal: StudentPrincipal = Depends(require_student),
                          db: Session = Depends(core.db_session)):
    race, participant = _race_for_registered(db, race_id, principal.student.id)
    return _participation(db, race, participant, principal.student.id, principal.session.installation_id)


def _attendance_projection(db: Session, race: core.Race, participant: core.RaceParticipant,
                           student_id: str, installation_id: str) -> dict[str, Any]:
    return _participation(db, race, participant, student_id, installation_id)


@router.post("/api/v1/student/races/{race_id}/check-in")
async def student_check_in(race_id: str, data: CheckInIn,
                     idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
                     principal: StudentPrincipal = Depends(require_student), db: Session = Depends(core.db_session)):
    key = _idempotency_key(idempotency_key)
    path = f"POST:/api/v1/student/races/{race_id}/check-in"
    replay = _receipt_replay(db, principal, key, path, data.model_dump(mode="json"))
    if replay:
        return replay
    race, participant = _race_for_registered(db, race_id, principal.student.id)
    if participant.registration_status != "REGISTERED":
        _fail(409, "REGISTRATION_CANCELLED", "Đăng ký giải của bạn đã bị hủy.")
    config = db.get(StudentAttendanceConfig, race_id)
    if not config:
        _fail(409, "ATTENDANCE_NOT_CONFIGURED", "Giải chưa cấu hình vùng điểm danh.")
    existing = _attendance(db, participant.id)
    if existing:
        if existing.status == "CHECKED_IN":
            result = _attendance_projection(db, race, participant, principal.student.id, principal.session.installation_id)
            response = _save_receipt(db, principal, key, path, data.model_dump(mode="json"), result, 200)
            db.commit()
            return response
        _fail(409, "ALREADY_CHECKED_OUT", "Lượt tham gia này đã check-out.")
    now = core.now_utc()
    _assert_window(now, config.check_in_open_at, config.check_in_close_at,
                   opening="CHECK_IN_NOT_OPEN", closing="CHECK_IN_CLOSED")
    _validate_position(db, race_id, data.position, config.check_in_checkpoint_id, config)
    attendance = StudentAttendance(registration_id=participant.id, status="CHECKED_IN",
        checked_in_at=now, check_in_latitude=data.position.latitude,
        check_in_longitude=data.position.longitude, check_in_accuracy_m=data.position.accuracy_m,
        check_in_captured_at=_utc(data.position.captured_at))
    config.locked_at = config.locked_at or now
    db.add(attendance); db.flush()
    result = _attendance_projection(db, race, participant, principal.student.id, principal.session.installation_id)
    response = _save_receipt(db, principal, key, path, data.model_dump(mode="json"), result, 201)
    db.commit()
    await publish_student_event(principal.student.id, "attendance.updated", "ATTENDANCE", attendance.id, attendance.version, result)
    return response


@router.post("/api/v1/student/races/{race_id}/runs", status_code=201)
async def student_start_run(race_id: str, data: StartRunIn,
                            idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
                            principal: StudentPrincipal = Depends(require_student), db: Session = Depends(core.db_session)):
    key = _idempotency_key(idempotency_key)
    path = f"POST:/api/v1/student/races/{race_id}/runs"
    payload = data.model_dump(mode="json")
    replay = _receipt_replay(db, principal, key, path, payload)
    if replay:
        return replay
    race, participant = _race_for_registered(db, race_id, principal.student.id)
    existing = _latest_run(db, race_id, principal.student.id)
    if existing:
        if existing.status == "ACTIVE":
            if existing.wearable_device_id == f"MOBILE:{principal.session.installation_id}":
                result = _run_snapshot(db, existing, principal.session.installation_id)
                response = _save_receipt(db, principal, key, path, payload, result, 200)
                db.commit()
                return response
            _fail(409, "DEVICE_BINDING_MISMATCH", "Phiên chạy đang gắn với một cài đặt app khác.")
        # Health-month registrations may create a new daily session after the
        # previous one was explicitly finished. Ordinary races remain one-run.
        if not race.target_distance_m or existing.status not in {"COMPLETED", "ABANDONED"}:
            _fail(409, "RUN_ALREADY_EXISTS", "Đăng ký này đã có phiên chạy.")
    if participant.registration_status != "REGISTERED":
        _fail(409, "REGISTRATION_CANCELLED", "Đăng ký giải của bạn đã bị hủy.")
    if not data.consent_granted:
        _fail(422, "CONSENT_REQUIRED", "Cần xác nhận cho phép ghi nhận GPS để bắt đầu.")
    if race.status != "LIVE":
        _fail(409, "RACE_NOT_STARTED" if race.status in {"DRAFT", "SCHEDULED"} else "RACE_CLOSED",
              "Giải chưa mở lượt chạy." if race.status in {"DRAFT", "SCHEDULED"} else "Giải đã đóng.")
    config = db.get(StudentAttendanceConfig, race_id)
    if race.target_distance_m:
        if not config:
            _fail(409, "ATTENDANCE_NOT_CONFIGURED", "Giải thử thách chưa cấu hình checkpoint xuất phát.")
        # For a multi-day challenge, each workout starts by checking the
        # student's current GPS at the configured start/finish checkpoint.
        _validate_position(db, race_id, data.position, config.check_in_checkpoint_id, config)
        if race.start_at and core.now_utc() < _utc(race.start_at):
            _fail(409, "RACE_NOT_STARTED", "Chưa đến thời gian mở thử thách.")
        if race.end_at and core.now_utc() > _utc(race.end_at):
            _fail(409, "RACE_CLOSED", "Thời gian thử thách đã kết thúc.")
    else:
        if not config:
            _fail(409, "ATTENDANCE_NOT_CONFIGURED", "Giải chưa cấu hình vùng điểm danh.")
        attendance = _attendance(db, participant.id)
        if not attendance or attendance.status != "CHECKED_IN":
            _fail(409, "CHECK_IN_REQUIRED", "Bạn cần check-in trước khi bắt đầu.")
        _validate_position(db, race_id, data.position, config.check_in_checkpoint_id, config)
    any_active = db.scalar(select(core.RunSession.id).where(
        core.RunSession.student_id == principal.student.id, core.RunSession.status == "ACTIVE").limit(1))
    if any_active:
        _fail(409, "ACTIVE_RUN_EXISTS", "Bạn đang có một phiên chạy chưa kết thúc.")
    now = core.now_utc()
    run = core.RunSession(race_id=race.id, student_id=principal.student.id,
        wearable_device_id=f"MOBILE:{principal.session.installation_id}",
        source="MOBILE_GPS", status="ACTIVE", started_at=now)
    if race.matching_locked_at is None:
        race.matching_locked_at = now
    if race.start_at is None:
        race.start_at = now
    if hasattr(run, "revision"):
        run.revision = 1
    if hasattr(run, "consent_version"):
        run.consent_version = data.consent_version
        run.consent_granted_at = now
    db.add(run); db.flush()
    result = _run_snapshot(db, run, principal.session.installation_id)
    response = _save_receipt(db, principal, key, path, payload, result, 201)
    db.commit()
    await core.hub.publish(race.id, {"type": "runner.updated", "race_id": race.id, "data": core.run_dict(db, run)})
    await publish_student_event(principal.student.id, "run.updated", "RUN", run.id, 1, result)
    return response


@router.get("/api/v1/student/current-run")
def student_current_run(principal: StudentPrincipal = Depends(require_student), db: Session = Depends(core.db_session)):
    run = db.scalar(select(core.RunSession).where(
        core.RunSession.student_id == principal.student.id,
        core.RunSession.status == "ACTIVE").order_by(core.RunSession.started_at.desc()).limit(1))
    return {"run": _run_snapshot(db, run, principal.session.installation_id) if run else None,
            "server_time": core.now_utc()}


def _owned_run(db: Session, run_id: str, student_id: str) -> core.RunSession:
    run = db.get(core.RunSession, run_id)
    if not run or run.student_id != student_id:
        _fail(404, "RESOURCE_NOT_FOUND", "Không tìm thấy phiên chạy.")
    return run


def _lock_owned_run(db: Session, run_id: str, student_id: str) -> core.RunSession:
    run = db.scalar(select(core.RunSession).where(
        core.RunSession.id == run_id, core.RunSession.student_id == student_id).with_for_update())
    if not run:
        _fail(404, "RESOURCE_NOT_FOUND", "Không tìm thấy phiên chạy.")
    if core.engine.dialect.name == "sqlite":
        db.execute(update(core.RunSession).where(core.RunSession.id == run_id)
                   .values(revision=core.RunSession.revision))
        db.refresh(run)
    return run


@router.get("/api/v1/student/runs/{run_id}")
def student_run_detail(run_id: str, principal: StudentPrincipal = Depends(require_student), db: Session = Depends(core.db_session)):
    return _run_snapshot(db, _owned_run(db, run_id, principal.student.id), principal.session.installation_id)


@router.post("/api/v1/student/runs/{run_id}/gps-batches")
async def student_gps_batch(run_id: str, data: GpsBatchIn, principal: StudentPrincipal = Depends(require_student),
                            db: Session = Depends(core.db_session)):
    run = _owned_run(db, run_id, principal.student.id)
    if run.wearable_device_id != f"MOBILE:{principal.session.installation_id}":
        _fail(409, "DEVICE_BINDING_MISMATCH", "Phiên chạy được gắn với cài đặt app khác.")
    body = data.model_dump(mode="json")
    try:
        uuid.UUID(data.batch_id)
        for sample in data.samples:
            uuid.UUID(sample.sample_id)
    except ValueError:
        _fail(422, "VALIDATION_ERROR", "batch_id và sample_id phải là UUID.")
    if len(json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")) > 65536:
        _fail(413, "PAYLOAD_TOO_LARGE", "Gói GPS vượt quá 65536 byte.")
    if any(a.sequence >= b.sequence for a, b in zip(data.samples, data.samples[1:])):
        _fail(422, "SEQUENCE_NOT_INCREASING", "sequence trong batch phải tăng dần.")
    payload_hash = _canonical_hash(body)
    receipt = db.scalar(select(MobileGpsBatchReceipt).where(
        MobileGpsBatchReceipt.run_id == run_id, MobileGpsBatchReceipt.batch_id == data.batch_id))
    if receipt:
        if receipt.payload_hash != payload_hash:
            _fail(409, "BATCH_ID_CONFLICT", "batch_id đã được dùng với payload khác.")
        return JSONResponse(status_code=200, content=jsonable_encoder(json.loads(receipt.response_json)),
                            headers={"Idempotency-Replayed": "true", "Cache-Control": "no-store"})
    if run.status != "ACTIVE":
        _fail(409, "RUN_NOT_ACTIVE", "Phiên chạy không còn hoạt động.")
    items: list[dict[str, Any]] = []
    for sample in data.samples:
        sample_key = f"mobile:{run_id}:{sample.sample_id}"
        captured_at = _utc(sample.recorded_at)
        # A sample's identity belongs to its immutable body, not the transport
        # batch that happened to carry it. This makes retries across batches safe.
        sample_hash = _canonical_hash(sample.model_dump(mode="json"))
        previous_resume = db.scalar(select(StudentRunPause).where(
            StudentRunPause.run_id == run_id,
            StudentRunPause.resumed_at.is_not(None),
            StudentRunPause.resumed_at <= captured_at
        ).order_by(StudentRunPause.resumed_at.desc()).limit(1))
        offset = previous_resume.steps_offset_after if previous_resume else 0
        normalized_steps = (sample.steps_since_start + offset) if sample.steps_since_start is not None else None
        existing = db.scalar(select(core.GpsPoint).where(core.GpsPoint.idempotency_key == sample_key))
        if existing:
            same_sample = existing.mobile_sample_hash == sample_hash
            if existing.mobile_sample_hash is None:
                # Compatibility for records created before canonical mobile hashes.
                same_sample = (existing.sample_id == sample.sample_id
                    and existing.sequence == sample.sequence
                    and _utc(existing.recorded_at) == captured_at
                    and existing.latitude == sample.latitude and existing.longitude == sample.longitude
                    and existing.accuracy_m == sample.accuracy_m and existing.speed_mps == sample.speed_mps
                    and (normalized_steps is None or existing.total_steps == normalized_steps))
            if not same_sample:
                _fail(409, "SAMPLE_ID_CONFLICT", "sample_id đã được dùng với payload GPS khác.")
            items.append({"sample_id": sample.sample_id, "status": "DUPLICATE", "accepted": True,
                          "retryable": False, "gps_point_id": existing.id, "sequence": sample.sequence})
            continue
        if captured_at < _utc(core.now_utc()) - timedelta(seconds=core.settings.max_mobile_offline_age_seconds):
            items.append({"sample_id": sample.sample_id, "status": "REJECTED", "accepted": False,
                          "retryable": False, "reason_code": "GPS_TOO_OLD",
                          "max_age_seconds": core.settings.max_mobile_offline_age_seconds,
                          "sequence": sample.sequence})
            continue
        gps = core.GpsIn(idempotency_key=sample_key, race_id=run.race_id, run_id=run.id,
            student_id=run.student_id, wearable_device_id=run.wearable_device_id,
            latitude=sample.latitude, longitude=sample.longitude, recorded_at=sample.recorded_at,
            accuracy_m=sample.accuracy_m, speed_mps=sample.speed_mps,
            total_steps=sample.steps_since_start if sample.steps_since_start is not None else run.total_steps,
            source="MOBILE_GPS", sample_id=sample.sample_id, sequence=sample.sequence,
            batch_id=data.batch_id)
        gps._mobile_sample_hash = sample_hash
        if run_is_paused_at(db, run_id, captured_at):
            items.append({"sample_id": sample.sample_id, "status": "REJECTED", "accepted": False,
                          "reason_code": "RUN_PAUSED", "sequence": sample.sequence,
                          "distance_delta_m": 0, "passage_created": False})
            continue
        db.refresh(run)
        last_sequence = getattr(run, "last_sequence", 0)
        if sample.sequence <= last_sequence:
            items.append({"sample_id": sample.sample_id, "status": "REJECTED", "accepted": False,
                          "reason_code": "GPS_OUT_OF_ORDER", "sequence": sample.sequence})
            continue
        if sample.accuracy_m > 100:
            items.append({"sample_id": sample.sample_id, "status": "REJECTED", "accepted": False,
                          "reason_code": "GPS_INACCURATE", "sequence": sample.sequence})
            continue
        steps_total = run.total_steps
        if sample.steps_since_start is not None:
            steps_total = max(run.total_steps, sample.steps_since_start + offset)
        try:
            gps.total_steps = steps_total
            result = await core.receive_gps(gps, auth_source="MOBILE", db=db)
            db.refresh(run)
            point = db.scalar(select(core.GpsPoint).where(core.GpsPoint.idempotency_key == sample_key))
            result = {"sample_id": sample.sample_id, "status": "ACCEPTED", "accepted": True,
                      "sequence": sample.sequence, "distance_delta_m": result["distance_delta_m"],
                      "lap_count": result["lap_count"], "run_status": result["status"],
                      "gps_point_id": result["gps_point_id"]}
            items.append(result)
        except HTTPException as exc:
            db.rollback()
            detail = exc.detail.get("error", exc.detail) if isinstance(exc.detail, dict) else {}
            items.append({"sample_id": sample.sample_id, "status": "REJECTED", "accepted": False,
                          "sequence": sample.sequence, "reason_code": detail.get("code", "GPS_REJECTED")})
            run = _owned_run(db, run_id, principal.student.id)
    # Every row-level decision is final for this sample. Clients should not
    # retry validation failures; transient transport failures retry the batch.
    for item in items:
        item.setdefault("retryable", False)
    snapshot = _run_snapshot(db, run, principal.session.installation_id)
    result = {"run_id": run.id, "batch_id": data.batch_id, "items": items,
              "run": snapshot, "last_processed_sequence": getattr(run, "last_sequence", 0),
              "server_time": core.now_utc()}
    db.add(MobileGpsBatchReceipt(run_id=run.id, batch_id=data.batch_id, payload_hash=payload_hash,
        response_json=json.dumps(jsonable_encoder(result), separators=(",", ":"))))
    db.commit()
    return result


@router.post("/api/v1/student/runs/{run_id}/pause")
async def student_pause_run(run_id: str, data: RunControlIn,
                            idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
                            principal: StudentPrincipal = Depends(require_student),
                            db: Session = Depends(core.db_session)):
    key = _idempotency_key(idempotency_key)
    path = f"POST:/api/v1/student/runs/{run_id}/pause"
    payload = data.model_dump(mode="json")
    replay = _receipt_replay(db, principal, key, path, payload)
    if replay:
        return replay
    run = _lock_owned_run(db, run_id, principal.student.id)
    if run.status != "ACTIVE":
        _fail(409, "RUN_NOT_ACTIVE", "Chỉ có thể tạm dừng phiên đang hoạt động.")
    if _open_pause(db, run_id):
        _fail(409, "RUN_ALREADY_PAUSED", "Phiên chạy đang tạm dừng.")
    if data.expected_revision != run.revision:
        _fail(409, "VERSION_CONFLICT", "Phiên chạy đã thay đổi; hãy tải lại snapshot.")
    now = core.now_utc()
    interval = StudentRunPause(run_id=run.id, paused_at=now, steps_at_pause=run.total_steps)
    db.add(interval)
    run.revision += 1
    # Make the next accepted GPS point an anchor only; never bridge the pause gap.
    run.segment_id += 1
    run.last_latitude = None
    run.last_longitude = None
    for state in db.scalars(select(core.GeofenceState).where(core.GeofenceState.run_id == run.id)).all():
        state.region = "UNKNOWN"
        state.last_gps_point_id = None
        state.last_sample_at = None
    result = _run_snapshot(db, run, principal.session.installation_id)
    response = _save_receipt(db, principal, key, path, payload, result)
    db.commit()
    await core.hub.publish(run.race_id, {"type": "runner.updated", "race_id": run.race_id,
        "data": core.run_dict(db, run)})
    await publish_student_event(principal.student.id, "run.paused", "RUN", run.id, run.revision, result)
    return response


@router.post("/api/v1/student/runs/{run_id}/resume")
async def student_resume_run(run_id: str, data: ResumeRunIn,
                             idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
                             principal: StudentPrincipal = Depends(require_student),
                             db: Session = Depends(core.db_session)):
    key = _idempotency_key(idempotency_key)
    path = f"POST:/api/v1/student/runs/{run_id}/resume"
    payload = data.model_dump(mode="json")
    replay = _receipt_replay(db, principal, key, path, payload)
    if replay:
        return replay
    run = _lock_owned_run(db, run_id, principal.student.id)
    if run.status != "ACTIVE":
        _fail(409, "RUN_NOT_ACTIVE", "Chỉ có thể tiếp tục phiên đang hoạt động.")
    interval = _open_pause(db, run_id)
    if not interval:
        _fail(409, "RUN_NOT_PAUSED", "Phiên chạy hiện không tạm dừng.")
    if data.expected_revision != run.revision:
        _fail(409, "VERSION_CONFLICT", "Phiên chạy đã thay đổi; hãy tải lại snapshot.")
    now = core.now_utc()
    interval.resumed_at = now
    interval.steps_offset_after = run.total_steps - data.steps_since_start
    run.revision += 1
    result = _run_snapshot(db, run, principal.session.installation_id)
    response = _save_receipt(db, principal, key, path, payload, result)
    db.commit()
    await core.hub.publish(run.race_id, {"type": "runner.updated", "race_id": run.race_id,
        "data": core.run_dict(db, run)})
    await publish_student_event(principal.student.id, "run.resumed", "RUN", run.id, run.revision, result)
    return response


@router.post("/api/v1/student/runs/{run_id}/withdraw")
async def student_withdraw(run_id: str, data: WithdrawIn,
                           idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
                           principal: StudentPrincipal = Depends(require_student), db: Session = Depends(core.db_session)):
    key = _idempotency_key(idempotency_key)
    path = f"POST:/api/v1/student/runs/{run_id}/withdraw"
    payload = data.model_dump(mode="json")
    replay = _receipt_replay(db, principal, key, path, payload)
    if replay:
        return replay
    run = _owned_run(db, run_id, principal.student.id)
    if run.status == "COMPLETED":
        _fail(409, "RUN_ALREADY_COMPLETED", "Phiên chạy đã hoàn thành.")
    if run.status != "ACTIVE":
        _fail(409, "RUN_NOT_ACTIVE", "Phiên chạy không còn hoạt động.")
    revision = getattr(run, "revision", 1)
    if data.expected_revision != revision:
        _fail(409, "VERSION_CONFLICT", "Phiên chạy đã thay đổi; hãy tải lại.")
    now = core.now_utc()
    close_open_pause(db, run.id, now)
    run.status = "ABANDONED"
    run.ended_at = now
    run.duration_total_s = max(0, int((now - _utc(run.started_at)).total_seconds()))
    if hasattr(run, "finalized_at"):
        run.finalized_at = now
    if hasattr(run, "revision"):
        run.revision += 1
    result = _run_snapshot(db, run, principal.session.installation_id)
    response = _save_receipt(db, principal, key, path, payload, result, 200)
    db.commit()
    await core.hub.publish(run.race_id, {"type": "runner.updated", "race_id": run.race_id, "data": core.run_dict(db, run)})
    await publish_student_event(principal.student.id, "run.abandoned", "RUN", run.id, getattr(run, "revision", 2), result)
    return response


class FinishChallengeRunIn(StrictInput):
    """Student confirms the end of one daily challenge workout at its GPS gate."""
    position: PositionEvidence
    expected_revision: int = Field(ge=1)


@router.post("/api/v1/student/runs/{run_id}/finish")
async def student_finish_challenge_run(run_id: str, data: FinishChallengeRunIn,
        idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
        principal: StudentPrincipal = Depends(require_student), db: Session = Depends(core.db_session)):
    key = _idempotency_key(idempotency_key)
    path = f"POST:/api/v1/student/runs/{run_id}/finish"
    payload = data.model_dump(mode="json")
    replay = _receipt_replay(db, principal, key, path, payload)
    if replay:
        return replay
    run = _lock_owned_run(db, run_id, principal.student.id)
    race = db.get(core.Race, run.race_id)
    if not race or not race.target_distance_m:
        _fail(409, "NOT_A_DISTANCE_CHALLENGE", "API này chỉ dùng để kết thúc một buổi trong thử thách quãng đường.")
    if run.status != "ACTIVE":
        _fail(409, "RUN_NOT_ACTIVE", "Buổi chạy không ở trạng thái đang chạy.")
    if data.expected_revision != getattr(run, "revision", 1):
        _fail(409, "VERSION_CONFLICT", "Phiên chạy đã thay đổi; hãy tải lại trạng thái.")
    config = db.get(StudentAttendanceConfig, run.race_id)
    if not config:
        _fail(409, "ATTENDANCE_NOT_CONFIGURED", "Giải chưa cấu hình checkpoint kết thúc.")
    _validate_position(db, run.race_id, data.position, config.check_out_checkpoint_id, config)
    # Persist the button-confirmed stop GPS sample through the same ingest
    # validator as every ordinary app sample; its outside-to-inside evidence
    # can therefore create the final checkpoint passage in the run history.
    finish_sample = core.GpsIn(idempotency_key=f"mobile:finish:{run.id}:{key}",
        sample_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"finish:{run.id}:{key}")),
        sequence=getattr(run, "last_sequence", 0) + 1, segment_id=getattr(run, "segment_id", 1),
        race_id=run.race_id, run_id=run.id, student_id=run.student_id,
        wearable_device_id=run.wearable_device_id, latitude=data.position.latitude,
        longitude=data.position.longitude, recorded_at=_utc(data.position.captured_at),
        accuracy_m=data.position.accuracy_m, total_steps=run.total_steps, source="MOBILE_GPS")
    finish_gps = await core.receive_gps(finish_sample, auth_source="MOBILE", db=db)
    db.refresh(run)
    now = core.now_utc()
    close_open_pause(db, run.id, now)
    run.status = "COMPLETED"
    run.ended_at = now
    run.finalized_at = now
    run.duration_total_s = max(0, int((now - _utc(run.started_at)).total_seconds()))
    run.revision = getattr(run, "revision", 1) + 1
    result = _run_snapshot(db, run, principal.session.installation_id)
    result["finish_gps"] = {"gps_point_id": finish_gps["gps_point_id"],
        "checkpoint_crossings": finish_gps.get("checkpoint_crossings", [])}
    response = _save_receipt(db, principal, key, path, payload, result, 200)
    db.commit()
    await core.hub.publish(run.race_id, {"type": "runner.updated", "race_id": run.race_id, "data": core.run_dict(db, run)})
    await publish_student_event(principal.student.id, "run.finished", "RUN", run.id, run.revision, result)
    return response


@router.get("/api/v1/student/races/{race_id}/progress")
def student_challenge_progress(race_id: str, principal: StudentPrincipal = Depends(require_student),
                               db: Session = Depends(core.db_session)):
    race, _participant = _race_for_registered(db, race_id, principal.student.id)
    if not race.target_distance_m:
        _fail(409, "NOT_A_DISTANCE_CHALLENGE", "Giải này không phải thử thách tích lũy quãng đường.")
    zone = timezone(timedelta(hours=7))
    runs = db.scalars(select(core.RunSession).where(
        core.RunSession.race_id == race.id, core.RunSession.student_id == principal.student.id,
        core.RunSession.source == "MOBILE_GPS").order_by(core.RunSession.started_at)).all()
    days: dict[str, dict[str, Any]] = {}
    for run in runs:
        local_day = _utc(run.started_at).astimezone(zone).date().isoformat()
        item = days.setdefault(local_day, {"date": local_day, "sessions": 0, "distance_m": 0.0,
            "steps": 0, "elapsed_seconds": 0, "active_seconds": 0, "paused_seconds": 0,
            "active_sessions": 0})
        item["sessions"] += 1
        item["distance_m"] += run.distance_total_m
        item["steps"] += run.total_steps
        elapsed = (run.duration_total_s if run.duration_total_s is not None else
            max(0, int((core.now_utc() - _utc(run.started_at)).total_seconds())))
        paused, _open = _pause_totals(db, run, core.now_utc())
        item["elapsed_seconds"] += elapsed
        item["paused_seconds"] += paused
        item["active_seconds"] += max(0, elapsed - paused)
        item["active_sessions"] += int(run.status == "ACTIVE")
    distance_total = sum(row["distance_m"] for row in days.values())
    elapsed_total = sum(row["elapsed_seconds"] for row in days.values())
    active_total = sum(row["active_seconds"] for row in days.values())
    paused_total = sum(row["paused_seconds"] for row in days.values())
    steps_total = sum(row["steps"] for row in days.values())
    return {"race_id": race.id, "target_distance_m": race.target_distance_m,
        "distance_total_m": round(distance_total, 2), "remaining_distance_m": round(max(0, race.target_distance_m - distance_total), 2),
        "target_reached": distance_total >= race.target_distance_m,
        "elapsed_total_seconds": elapsed_total, "active_total_seconds": active_total,
        "paused_total_seconds": paused_total, "steps_total": steps_total,
        "race_start_at": race.start_at, "race_end_at": race.end_at, "race_status": race.status,
        "can_continue_after_target": bool(race.end_at and core.now_utc() <= _utc(race.end_at)),
        "days": [{**row, "distance_m": round(row["distance_m"], 2)} for row in sorted(days.values(), key=lambda x: x["date"])],
        "server_time": core.now_utc()}


@router.post("/api/v1/student/races/{race_id}/check-out")
async def student_check_out(race_id: str, data: CheckOutIn,
                      idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
                      principal: StudentPrincipal = Depends(require_student), db: Session = Depends(core.db_session)):
    key = _idempotency_key(idempotency_key)
    path = f"POST:/api/v1/student/races/{race_id}/check-out"
    payload = data.model_dump(mode="json")
    replay = _receipt_replay(db, principal, key, path, payload)
    if replay:
        return replay
    race, participant = _race_for_registered(db, race_id, principal.student.id)
    config = db.get(StudentAttendanceConfig, race_id)
    if not config:
        _fail(409, "ATTENDANCE_NOT_CONFIGURED", "Giải chưa cấu hình vùng điểm danh.")
    attendance = _attendance(db, participant.id)
    if attendance and attendance.status == "CHECKED_OUT":
        result = _participation(db, race, participant, principal.student.id, principal.session.installation_id)
        response = _save_receipt(db, principal, key, path, payload, result, 200)
        db.commit()
        return response
    now = core.now_utc()
    _assert_window(now, config.check_out_open_at, config.check_out_close_at,
                   opening="CHECK_OUT_NOT_OPEN", closing="CHECK_OUT_CLOSED")
    if not attendance:
        _fail(409, "CHECK_IN_REQUIRED", "Bạn cần check-in trước khi check-out.")
    active = db.scalar(select(core.RunSession.id).where(
        core.RunSession.student_id == principal.student.id, core.RunSession.status == "ACTIVE").limit(1))
    if active:
        _fail(409, "ACTIVE_RUN_EXISTS", "Kết thúc sớm phiên chạy trước khi check-out.")
    _validate_position(db, race_id, data.position, config.check_out_checkpoint_id, config)
    run = _latest_run(db, race_id, principal.student.id)
    attendance.status = "CHECKED_OUT"
    attendance.checked_out_at = now
    attendance.check_out_latitude = data.position.latitude
    attendance.check_out_longitude = data.position.longitude
    attendance.check_out_accuracy_m = data.position.accuracy_m
    attendance.check_out_captured_at = _utc(data.position.captured_at)
    attendance.outcome = "NO_RUN" if not run else "COMPLETED" if run.status == "COMPLETED" else "INCOMPLETE"
    attendance.version += 1
    result = _participation(db, race, participant, principal.student.id, principal.session.installation_id)
    response = _save_receipt(db, principal, key, path, payload, result, 201)
    db.commit()
    await publish_student_event(principal.student.id, "attendance.updated", "ATTENDANCE", attendance.id, attendance.version, result)
    return response


@router.get("/api/v1/student/runs")
def student_run_history(race_id: str | None = None, status: str | None = None,
                        from_date: date | None = Query(default=None, alias="from"),
                        to_date: date | None = Query(default=None, alias="to"),
                        limit: int = Query(default=20, ge=1, le=100), cursor: str | None = None,
                        principal: StudentPrincipal = Depends(require_student), db: Session = Depends(core.db_session)):
    if (from_date is None) != (to_date is None) or (from_date and to_date and to_date < from_date):
        _fail(422, "INVALID_DATE_RANGE", "from và to phải cùng có hoặc cùng bỏ; to không được trước from.")
    stmt = select(core.RunSession).where(core.RunSession.student_id == principal.student.id)
    if race_id:
        stmt = stmt.where(core.RunSession.race_id == race_id)
    if status:
        stmt = stmt.where(core.RunSession.status == status.upper())
    if from_date:
        start = datetime.combine(from_date, time.min, tzinfo=timezone(timedelta(hours=7))).astimezone(timezone.utc)
        end = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=timezone(timedelta(hours=7))).astimezone(timezone.utc)
        stmt = stmt.where(core.RunSession.started_at >= start, core.RunSession.started_at < end)
    rows = db.scalars(stmt.order_by(core.RunSession.started_at.desc(), core.RunSession.id).limit(501)).all()
    offset = _decode_offset(cursor)
    page = rows[offset:offset + limit]
    items = []
    for run in page:
        snap = _run_snapshot(db, run, principal.session.installation_id)
        race = db.get(core.Race, run.race_id)
        items.append({**snap, "race_name": race.name if race else None})
    next_cursor = _encode_offset(offset + len(page)) if offset + len(page) < len(rows) else None
    return {"items": items, "next_cursor": next_cursor, "has_more": next_cursor is not None,
            "server_time": core.now_utc()}


def _decode_offset(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        import base64
        value = int(base64.urlsafe_b64decode(cursor + "==").decode())
        if value < 0:
            raise ValueError
        return value
    except Exception:
        _fail(400, "INVALID_CURSOR", "Cursor không hợp lệ; hãy tải lại trang đầu.")


def _encode_offset(value: int) -> str:
    import base64
    return base64.urlsafe_b64encode(str(value).encode()).decode().rstrip("=")


@router.get("/api/v1/student/runs/{run_id}/laps")
def student_run_laps(run_id: str, limit: int = Query(default=100, ge=1, le=200), cursor: str | None = None,
                     principal: StudentPrincipal = Depends(require_student), db: Session = Depends(core.db_session)):
    run = _owned_run(db, run_id, principal.student.id)
    rows = db.scalars(select(core.LapEvent).where(core.LapEvent.run_id == run.id,
        core.LapEvent.validation_status == "VALID").order_by(core.LapEvent.lap_no, core.LapEvent.id)).all()
    offset = _decode_offset(cursor)
    page = rows[offset:offset + limit]
    items = [{"lap_event_id": row.id, "lap_no": row.lap_no, "checkpoint_id": row.checkpoint_id,
              "occurred_at": row.occurred_at, "recorded_by_server_at": None,
              "duration_s": row.duration_s, "source": row.source, "counting_status": "COUNTED"}
             for row in page]
    next_cursor = _encode_offset(offset + len(page)) if offset + len(page) < len(rows) else None
    return {"items": items, "next_cursor": next_cursor, "has_more": next_cursor is not None,
            "run_revision": getattr(run, "revision", 1), "lap_count": run.lap_count,
            "server_time": core.now_utc()}


@router.get("/api/v1/student/runs/{run_id}/track")
def student_run_track(run_id: str, limit: int = Query(default=100, ge=1, le=1000), cursor: str | None = None,
                      principal: StudentPrincipal = Depends(require_student), db: Session = Depends(core.db_session)):
    run = _owned_run(db, run_id, principal.student.id)
    rows = db.scalars(select(core.GpsPoint).where(core.GpsPoint.run_id == run.id)
                      .order_by(core.GpsPoint.recorded_at, core.GpsPoint.id)).all()
    offset = _decode_offset(cursor)
    page = rows[offset:offset + limit]
    items = []
    segment = 1
    last_at = None
    for row in page:
        if last_at and (_utc(row.recorded_at) - last_at).total_seconds() > 30:
            segment += 1
        items.append({"sample_id": getattr(row, "sample_id", None) or row.id,
                      "sequence": getattr(row, "sequence", None),
                      "latitude": row.latitude, "longitude": row.longitude,
                      "accuracy_m": row.accuracy_m, "recorded_at": row.recorded_at,
                      "received_at": row.received_at,
                      "segment_id": getattr(row, "segment_id", None) or segment})
        last_at = _utc(row.recorded_at)
    next_cursor = _encode_offset(offset + len(page)) if offset + len(page) < len(rows) else None
    return {"items": items, "next_cursor": next_cursor, "has_more": next_cursor is not None,
            "run_revision": getattr(run, "revision", 1), "source": run.source,
            "server_time": core.now_utc()}


@router.get("/api/v1/student/dashboard")
def student_dashboard(from_date: date | None = Query(default=None, alias="from"),
                      to_date: date | None = Query(default=None, alias="to"),
                      group_by: str = Query(default="day"),
                      principal: StudentPrincipal = Depends(require_student), db: Session = Depends(core.db_session)):
    today = core.now_utc().astimezone(timezone(timedelta(hours=7))).date()
    to_day = to_date or today
    from_day = from_date or (to_day - timedelta(days=29))
    if to_day < from_day or (to_day - from_day).days > 366:
        _fail(422, "INVALID_DATE_RANGE", "Kỳ thống kê phải tối đa 366 ngày.")
    if group_by not in {"day", "week", "month"}:
        _fail(422, "INVALID_GROUP_BY", "group_by phải là day, week hoặc month.")
    start = datetime.combine(from_day, time.min, tzinfo=timezone(timedelta(hours=7))).astimezone(timezone.utc)
    end = datetime.combine(to_day + timedelta(days=1), time.min, tzinfo=timezone(timedelta(hours=7))).astimezone(timezone.utc)
    all_runs = db.scalars(select(core.RunSession).where(core.RunSession.student_id == principal.student.id)).all()
    mobile_in_period = [r for r in all_runs if r.source == "MOBILE_GPS" and start <= _utc(r.started_at) < end]
    terminal = [r for r in all_runs if r.source == "MOBILE_GPS" and r.ended_at is not None
                and start <= _utc(r.ended_at) < end]
    attendance_rows = db.scalars(select(StudentAttendance).join(core.RaceParticipant,
        core.RaceParticipant.id == StudentAttendance.registration_id).where(
        core.RaceParticipant.student_id == principal.student.id,
        StudentAttendance.checked_in_at >= start, StudentAttendance.checked_in_at < end)).all()
    checked_in = len({db.get(core.RaceParticipant, item.registration_id).race_id for item in attendance_rows
                      if db.get(core.RaceParticipant, item.registration_id)})
    completed = [r for r in terminal if r.status == "COMPLETED"]
    abandoned = [r for r in terminal if r.status == "ABANDONED"]
    dist = sum(r.distance_total_m for r in completed)
    duration = sum(r.duration_total_s or 0 for r in completed)
    pace = round(duration / (dist / 1000), 1) if dist else None
    def bucket_start(day: date) -> date:
        if group_by == "week":
            return day - timedelta(days=day.weekday())
        if group_by == "month":
            return day.replace(day=1)
        return day

    bucket_keys: list[date] = []
    day = from_day
    while day <= to_day:
        key = bucket_start(day)
        if not bucket_keys or bucket_keys[-1] != key:
            bucket_keys.append(key)
        day += timedelta(days=1)
    buckets = {key: {"checked_in_races": 0, "completed_races": 0, "abandoned_runs": 0,
                     "completed_distance_m": 0.0, "completed_duration_s": 0}
               for key in bucket_keys}
    for attendance in attendance_rows:
        local_day = _utc(attendance.checked_in_at).astimezone(timezone(timedelta(hours=7))).date()
        key = bucket_start(local_day)
        if key in buckets:
            buckets[key]["checked_in_races"] += 1
    for run in completed:
        local_day = _utc(run.ended_at).astimezone(timezone(timedelta(hours=7))).date()
        key = bucket_start(local_day)
        if key in buckets:
            buckets[key]["completed_races"] += 1
            buckets[key]["completed_distance_m"] += run.distance_total_m
            buckets[key]["completed_duration_s"] += run.duration_total_s or 0
    for run in abandoned:
        local_day = _utc(run.ended_at).astimezone(timezone(timedelta(hours=7))).date()
        key = bucket_start(local_day)
        if key in buckets:
            buckets[key]["abandoned_runs"] += 1
    series = []
    for key in bucket_keys:
        bucket = buckets[key]
        bucket_end = (key + timedelta(days=6) if group_by == "week" else
                      (key.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
                      if group_by == "month" else key)
        period_start, period_end = max(key, from_day), min(bucket_end, to_day)
        distance = bucket["completed_distance_m"]
        bucket.update({"period_start": period_start, "period_end": period_end,
            "completed_distance_m": round(distance, 2),
            "avg_pace_seconds_per_km": round(bucket["completed_duration_s"] / (distance / 1000), 1) if distance else None})
        series.append(bucket)
    result = {"period": {"from": from_day, "to": to_day, "timezone": "Asia/Ho_Chi_Minh", "group_by": group_by},
        "summary": {"checked_in_races": checked_in,
            "completed_races": len(completed), "abandoned_runs": len(abandoned),
            "completed_distance_m": round(dist, 2), "completed_duration_s": duration,
            "avg_pace_seconds_per_km": pace,
            "completion_rate": (len(completed) / (len(completed) + len(abandoned))) if completed or abandoned else None,
            "active_run": None},
        "series": series, "excluded_non_mobile_runs": sum(1 for r in all_runs if start <= _utc(r.started_at) < end) - len(mobile_in_period),
        "generated_at": core.now_utc(), "server_time": core.now_utc()}
    active = db.scalar(select(core.RunSession).where(core.RunSession.student_id == principal.student.id,
        core.RunSession.status == "ACTIVE").limit(1))
    result["summary"]["active_run"] = _run_snapshot(db, active, principal.session.installation_id) if active else None
    return result


@router.post("/api/v1/student/realtime-tickets", status_code=201)
def student_realtime_ticket(principal: StudentPrincipal = Depends(require_student), db: Session = Depends(core.db_session)):
    token = secrets.token_urlsafe(32)
    expiry = core.now_utc() + timedelta(seconds=30)
    db.add(StudentRealtimeTicket(token_hash=_hash_token(token), session_id=principal.session.id,
        account_id=principal.account.id, expires_at=expiry))
    db.commit()
    return {"ticket": token, "expires_at": expiry,
            "websocket_path": "/ws/v1/student/live", "server_time": core.now_utc()}


@router.websocket("/ws/v1/student/live")
async def student_live_socket(websocket: WebSocket):
    await websocket.accept()
    try:
        message = await __import__("asyncio").wait_for(websocket.receive_json(), timeout=5)
        if message.get("type") != "authenticate" or not message.get("ticket"):
            await websocket.close(code=4401); return
        with core.SessionLocal() as db:
            ticket = db.scalar(select(StudentRealtimeTicket).where(
                StudentRealtimeTicket.token_hash == _hash_token(message["ticket"])).with_for_update())
            if not ticket or ticket.used_at or _utc(ticket.expires_at) <= core.now_utc():
                await websocket.close(code=4401); return
            session = db.get(StudentAuthSession, ticket.session_id)
            account = db.get(StudentAccount, ticket.account_id)
            if not session or session.revoked_at or not account or account.status != "ACTIVE":
                await websocket.close(code=4401); return
            ticket.used_at = core.now_utc()
            db.commit()
            student_id = session.student_id
        _student_sockets.setdefault(student_id, set()).add(websocket)
        await websocket.send_json({"type": "ready", "server_time": core.now_utc().isoformat()})
        while True:
            await websocket.receive_text()
    except __import__("asyncio").TimeoutError:
        await websocket.close(code=4408)
    except WebSocketDisconnect:
        pass
    finally:
        for sockets in _student_sockets.values():
            sockets.discard(websocket)


@router.post("/api/v1/admin/student-accounts", status_code=201)
def admin_create_student_account(data: AdminAccountIn, x_admin_key: str | None = Header(default=None),
                                 db: Session = Depends(core.db_session)):
    _require_admin(x_admin_key)
    student_id = data.student_id
    student = db.get(core.Student, student_id)
    if not student:
        _fail(404, "RESOURCE_NOT_FOUND", "Không tìm thấy hồ sơ sinh viên.")
    if db.scalar(select(StudentAccount.id).where(StudentAccount.student_id == student_id)):
        _fail(409, "ACCOUNT_EXISTS", "Sinh viên đã có tài khoản app.")
    password = secrets.token_urlsafe(18)
    account = StudentAccount(student_id=student_id, password_hash=_password_hash(password), must_change_password=True)
    db.add(account); db.commit(); db.refresh(account)
    return {"account_id": account.id, "student_id": student_id, "student_code": student.student_code,
            "temporary_password": password, "must_change_password": True, "server_time": core.now_utc()}


@router.post("/api/v1/admin/student-accounts/{account_id}/reset-password")
def admin_reset_student_password(account_id: str, data: AdminResetPasswordIn,
                                 x_admin_key: str | None = Header(default=None),
                                 db: Session = Depends(core.db_session)):
    _require_admin(x_admin_key)
    account = db.get(StudentAccount, account_id)
    if not account:
        _fail(404, "RESOURCE_NOT_FOUND", "Không tìm thấy tài khoản sinh viên.")
    if not data.reason.strip():
        _fail(422, "VALIDATION_ERROR", "reason bắt buộc.")
    active = db.scalar(select(core.RunSession.id).where(
        core.RunSession.student_id == account.student_id, core.RunSession.status == "ACTIVE").limit(1))
    if active:
        _fail(409, "ACTIVE_RUN_EXISTS", "Không thể reset mật khẩu khi sinh viên còn phiên ACTIVE.")
    password = secrets.token_urlsafe(18)
    account.password_hash = _password_hash(password)
    account.must_change_password = True
    account.updated_at = core.now_utc()
    for session in db.scalars(select(StudentAuthSession).where(
            StudentAuthSession.account_id == account.id, StudentAuthSession.revoked_at.is_(None))).all():
        session.revoked_at = core.now_utc()
    db.commit()
    return {"account_id": account.id, "temporary_password": password,
            "must_change_password": True, "server_time": core.now_utc()}


@router.put("/api/v1/admin/races/{race_id}/attendance-config")
def admin_put_attendance_config(race_id: str, data: AttendanceConfigIn,
                                x_admin_key: str | None = Header(default=None),
                                db: Session = Depends(core.db_session)):
    _require_admin(x_admin_key)
    if not db.get(core.Race, race_id):
        _fail(404, "RESOURCE_NOT_FOUND", "Không tìm thấy giải chạy.")
    existing = db.get(StudentAttendanceConfig, race_id)
    current_version = existing.version if existing else 0
    if data.expected_version != current_version:
        _fail(409, "VERSION_CONFLICT", "Cấu hình điểm danh đã thay đổi.")
    if existing and existing.locked_at:
        _fail(409, "CONFIG_LOCKED", "Cấu hình điểm danh đã khóa sau check-in đầu tiên.")
    if not (_utc(data.check_in_open_at) < _utc(data.check_in_close_at)
            and _utc(data.check_out_open_at) < _utc(data.check_out_close_at)
            and _utc(data.check_out_close_at) >= _utc(data.check_in_open_at)):
        _fail(422, "INVALID_TIME_WINDOW", "Khoảng thời gian check-in/check-out không hợp lệ.")
    for checkpoint_id in (data.check_in_checkpoint_id, data.check_out_checkpoint_id):
        cp = db.get(core.Checkpoint, checkpoint_id)
        if not cp:
            _fail(404, "RESOURCE_NOT_FOUND", "Không tìm thấy checkpoint.")
        if cp.race_id != race_id or cp.latitude is None or cp.longitude is None or cp.radius_m <= 0:
            _fail(422, "CHECKPOINT_RACE_MISMATCH", "Checkpoint phải thuộc giải và có tọa độ hợp lệ.")
    values = data.model_dump(exclude={"expected_version"})
    if existing:
        for key, value in values.items():
            setattr(existing, key, value)
        existing.version += 1
        config = existing
    else:
        config = StudentAttendanceConfig(race_id=race_id, version=1, **values)
        db.add(config)
    db.commit()
    return {"config": {"race_id": race_id, "check_in_open_at": config.check_in_open_at,
            "check_in_close_at": config.check_in_close_at, "check_out_open_at": config.check_out_open_at,
            "check_out_close_at": config.check_out_close_at,
            "check_in_checkpoint_id": config.check_in_checkpoint_id,
            "check_out_checkpoint_id": config.check_out_checkpoint_id,
            "max_position_age_seconds": config.max_position_age_seconds,
            "max_accuracy_m": config.max_accuracy_m, "version": config.version,
            "locked_at": config.locked_at}, "server_time": core.now_utc()}


@router.get("/api/v1/admin/races/{race_id}/attendance")
def admin_attendance(race_id: str, status: str | None = None,
                     keyword: str | None = Query(default=None, max_length=100),
                     limit: int = Query(default=20, ge=1, le=100), cursor: str | None = None,
                     x_admin_key: str | None = Header(default=None), db: Session = Depends(core.db_session)):
    _require_admin(x_admin_key)
    race = db.get(core.Race, race_id)
    if not race:
        _fail(404, "RESOURCE_NOT_FOUND", "Không tìm thấy giải chạy.")
    registrations = db.scalars(select(core.RaceParticipant).where(
        core.RaceParticipant.race_id == race_id,
        core.RaceParticipant.registration_status == "REGISTERED")).all()
    rows = []
    counts = {"registered": len(registrations), "not_checked_in": 0, "checked_in": 0, "checked_out": 0}
    for registration in registrations:
        student = db.get(core.Student, registration.student_id)
        attendance = _attendance(db, registration.id)
        att_status = attendance.status if attendance else "NOT_CHECKED_IN"
        counts[{"NOT_CHECKED_IN": "not_checked_in", "CHECKED_IN": "checked_in", "CHECKED_OUT": "checked_out"}.get(att_status, "not_checked_in")] += 1
        if status and att_status != status.upper():
            continue
        if keyword and student and keyword.lower() not in f"{student.student_code} {student.full_name}".lower():
            continue
        run = _latest_run(db, race_id, registration.student_id)
        rows.append({"student": {"student_id": student.id, "student_code": student.student_code,
                    "full_name": student.full_name, "class_name": None, "faculty": student.faculty} if student else None,
            "registration_id": registration.id, "bib_number": registration.bib_number,
            "registration_status": registration.registration_status,
            "attendance": ({"attendance_id": attendance.id, "status": att_status,
                "checked_in_at": attendance.checked_in_at, "checked_out_at": attendance.checked_out_at,
                "outcome": attendance.outcome, "version": attendance.version}
                if attendance else {"attendance_id": None, "status": att_status, "checked_in_at": None,
                    "checked_out_at": None, "outcome": None, "version": 0}),
            "run_id": run.id if run else None, "run_status": run.status if run else None})
    rows.sort(key=lambda item: (item["bib_number"] or "", item["student"]["student_code"] if item["student"] else ""))
    offset = _decode_offset(cursor)
    page = rows[offset:offset + limit]
    next_cursor = _encode_offset(offset + len(page)) if offset + len(page) < len(rows) else None
    return {"items": page, "next_cursor": next_cursor, "has_more": next_cursor is not None,
            "summary": counts, "server_time": core.now_utc()}

