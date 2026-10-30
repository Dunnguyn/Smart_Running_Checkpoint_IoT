"""Regression checks for the seven defects listed in the backend review PDF.

Run from services/backend with: python -m unittest discover -s tests -v
The suite uses a disposable SQLite database and never touches user data.
"""
from __future__ import annotations

import os
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from sqlalchemy import select

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from app import main as core  # noqa: E402
from app import student_api  # noqa: E402
from app import demos  # noqa: E402


def run_coroutine_without_io(coroutine):
    """Drive API coroutines whose regression paths perform no network I/O."""
    while True:
        try:
            yielded = coroutine.send(None)
        except StopIteration as completed:
            return completed.value
        if yielded is not None:
            raise AssertionError("Regression path unexpectedly attempted asynchronous I/O")


class RegressionTests(unittest.TestCase):
    def setUp(self) -> None:
        core.Base.metadata.drop_all(bind=core.engine)
        core.Base.metadata.create_all(bind=core.engine)
        self.db = core.SessionLocal()

    def tearDown(self) -> None:
        self.db.close()

    def race(self, *, mode: str = "GPS_ONLY", status: str = "LIVE", laps: int = 4):
        race = core.Race(id=core.new_id(), name="Regression", status=status,
                         checkpoint_mode=mode, total_laps=laps,
                         min_lap_interval_seconds=1, max_event_age_seconds=10)
        self.db.add(race)
        self.db.commit()
        return race

    def test_f01_sqlite_naive_datetimes_do_not_break_participation_projection(self):
        race = self.race()
        student = core.Student(id=core.new_id(), student_code="T001", full_name="Test", faculty="NEU")
        self.db.add(student)
        self.db.flush()
        cp = core.Checkpoint(id=core.new_id(), race_id=race.id, code="C1", name="Start",
                             sequence_no=1, latitude=21.0, longitude=105.0)
        participant = core.RaceParticipant(id=core.new_id(), race_id=race.id, student_id=student.id,
                                           bib_number="01")
        self.db.add_all([cp, participant])
        now = core.now_utc()
        self.db.add(student_api.StudentAttendanceConfig(
            race_id=race.id, check_in_checkpoint_id=cp.id, check_out_checkpoint_id=cp.id,
            check_in_open_at=now - timedelta(hours=1), check_in_close_at=now + timedelta(hours=1),
            check_out_open_at=now - timedelta(hours=1), check_out_close_at=now + timedelta(hours=1)))
        self.db.commit()
        self.db.expire_all()  # SQLite returns timezone-naive DateTime values.
        result = student_api._participation(self.db, self.db.get(core.Race, race.id),
            self.db.get(core.RaceParticipant, participant.id), student.id)
        actions = {item["action"]: item for item in result["actions"]}
        self.assertTrue(actions["CHECK_IN"]["allowed"])
        self.assertFalse(actions["CHECK_OUT"]["allowed"])

    def test_f02_sample_retry_in_another_batch_is_idempotent(self):
        race = self.race()
        student = core.Student(id=core.new_id(), student_code="T002", full_name="Test", faculty="NEU")
        self.db.add(student)
        self.db.flush()
        self.db.add(core.RaceParticipant(id=core.new_id(), race_id=race.id,
                                         student_id=student.id, bib_number="01"))
        started = core.now_utc() - timedelta(minutes=2)
        run = core.RunSession(id=core.new_id(), race_id=race.id, student_id=student.id,
            wearable_device_id="MOBILE:install-1", source="MOBILE_GPS", status="ACTIVE", started_at=started)
        self.db.add(run)
        self.db.commit()
        principal = SimpleNamespace(student=student, session=SimpleNamespace(installation_id="install-1"), account=None)
        sample_id = core.new_id()
        captured = core.now_utc() - timedelta(seconds=20)
        sample = {"sample_id": sample_id, "sequence": 1, "recorded_at": captured,
                  "latitude": 21.0, "longitude": 105.0, "accuracy_m": 8.0,
                  "speed_mps": 2.0, "steps_since_start": 100}
        first = student_api.GpsBatchIn(batch_id=core.new_id(), samples=[sample])
        first_result = run_coroutine_without_io(student_api.student_gps_batch(run.id, first, principal, self.db))
        self.assertEqual(first_result["items"][0]["status"], "ACCEPTED")

        replay = student_api.GpsBatchIn(batch_id=core.new_id(), samples=[sample])
        replay_result = run_coroutine_without_io(student_api.student_gps_batch(run.id, replay, principal, self.db))
        self.assertEqual(replay_result["items"][0]["status"], "DUPLICATE")
        self.assertEqual(self.db.query(core.GpsPoint).filter_by(run_id=run.id).count(), 1)

    def test_f03_mobile_offline_sample_has_explicit_300_second_ack_window(self):
        race = self.race()
        student = core.Student(id=core.new_id(), student_code="T003", full_name="Test", faculty="NEU")
        self.db.add(student)
        self.db.flush()
        self.db.add(core.RaceParticipant(id=core.new_id(), race_id=race.id,
                                         student_id=student.id, bib_number="01"))
        run = core.RunSession(id=core.new_id(), race_id=race.id, student_id=student.id,
            wearable_device_id="MOBILE:install-2", source="MOBILE_GPS", status="ACTIVE",
            started_at=core.now_utc() - timedelta(minutes=10))
        self.db.add(run)
        self.db.commit()
        principal = SimpleNamespace(student=student, session=SimpleNamespace(installation_id="install-2"), account=None)
        sample = {"sample_id": core.new_id(), "sequence": 1,
            "recorded_at": core.now_utc() - timedelta(seconds=20), "latitude": 21.0,
            "longitude": 105.0, "accuracy_m": 8.0, "steps_since_start": 10}
        accepted = run_coroutine_without_io(student_api.student_gps_batch(run.id,
            student_api.GpsBatchIn(batch_id=core.new_id(), samples=[sample]), principal, self.db))
        self.assertEqual(accepted["items"][0]["status"], "ACCEPTED")

        stale_sample = {**sample, "sample_id": core.new_id(), "sequence": 2,
                        "recorded_at": core.now_utc() - timedelta(seconds=301)}
        rejected = run_coroutine_without_io(student_api.student_gps_batch(run.id,
            student_api.GpsBatchIn(batch_id=core.new_id(), samples=[stale_sample]), principal, self.db))
        self.assertEqual(rejected["items"][0]["reason_code"], "GPS_TOO_OLD")
        self.assertFalse(rejected["items"][0]["retryable"])

    def test_f04_admin_finish_is_incomplete_until_lap_target_met(self):
        race = self.race(laps=4)
        student = core.Student(id=core.new_id(), student_code="T004", full_name="Test", faculty="NEU")
        self.db.add(student)
        self.db.flush()
        run = core.RunSession(id=core.new_id(), race_id=race.id, student_id=student.id,
            source="SIMULATOR", status="ACTIVE", started_at=core.now_utc() - timedelta(seconds=12), lap_count=3)
        self.db.add(run)
        self.db.commit()
        response = run_coroutine_without_io(core.finish_run(run.id, core.FinishIn(), self.db))
        self.assertEqual(response["status"], "ABANDONED")
        self.assertEqual(response["result_state"], "INCOMPLETE")
        self.assertFalse(response["is_done"])
        self.assertEqual(self.db.get(core.RunSession, run.id).status, "ABANDONED")
        replay = run_coroutine_without_io(core.finish_run(run.id, core.FinishIn(), self.db))
        self.assertTrue(replay["idempotent"])
        self.assertFalse(replay["is_done"])

    def test_f05_websocket_encodes_datetimes_before_fanout(self):
        class Socket:
            sent = None
            async def send_json(self, payload):
                self.sent = payload

        hub = core.EventHub()
        socket = Socket()
        hub.clients["race"] = {socket}
        run_coroutine_without_io(hub.publish("race", {"type": "test", "occurred_at": datetime.now(timezone.utc)}))
        sent = socket.sent
        self.assertIsInstance(sent["occurred_at"], str)

    def test_f06_lap_requires_all_checkpoints_in_route_order(self):
        race = self.race()
        student = core.Student(id=core.new_id(), student_code="T006", full_name="Test", faculty="NEU")
        self.db.add(student)
        self.db.flush()
        run = core.RunSession(id=core.new_id(), race_id=race.id, student_id=student.id,
            status="ACTIVE", started_at=core.now_utc() - timedelta(minutes=1))
        self.db.add(run)
        checkpoints = [core.Checkpoint(id=core.new_id(), race_id=race.id, code=f"C{i}",
            name=f"Checkpoint {i}", sequence_no=i, kind="LAP") for i in range(1, 5)]
        self.db.add_all(checkpoints)
        self.db.flush()
        finish_at = core.now_utc()

        def passage(cp, sequence):
            return core.GPSPassage(id=core.new_id(), race_id=race.id, checkpoint_id=cp.id,
                run_id=run.id, student_id=student.id, wearable_device_id="sim-device",
                entry_gps_point_id=core.new_id(), entry_at=finish_at - timedelta(seconds=10-sequence),
                received_at=finish_at, entry_distance_m=0, telemetry_source="SIMULATED_GPS")

        self.db.add_all([passage(checkpoints[0], 1), passage(checkpoints[2], 3),
                         passage(checkpoints[3], 4)])
        self.db.commit()
        self.assertFalse(core._route_sequence_complete(self.db, run, checkpoints[3], finish_at))
        self.db.add(passage(checkpoints[1], 2))
        self.db.commit()
        self.assertTrue(core._route_sequence_complete(self.db, run, checkpoints[3], finish_at))
        counted, duration = core.record_lap(self.db, run, checkpoints[3], finish_at,
                                             "SIMULATOR", "route-order-check")
        self.assertTrue(counted)
        self.assertGreater(duration, 0)

    def test_f06_single_checkpoint_requires_a_separate_start_and_finish_passage(self):
        race = self.race(mode="GPS_AND_ARDUINO", laps=1)
        student = core.Student(id=core.new_id(), student_code="T060", full_name="Test", faculty="NEU")
        self.db.add(student)
        self.db.flush()
        run = core.RunSession(id=core.new_id(), race_id=race.id, student_id=student.id,
            status="ACTIVE", started_at=core.now_utc() - timedelta(seconds=20))
        cp = core.Checkpoint(id=core.new_id(), race_id=race.id, code="C04", name="Finish",
            sequence_no=1, kind="LAP")
        self.db.add_all([run, cp])
        self.db.flush()
        first_at = core.now_utc() - timedelta(seconds=10)

        def one_passage(at):
            return core.GPSPassage(id=core.new_id(), race_id=race.id, checkpoint_id=cp.id,
                run_id=run.id, student_id=student.id, wearable_device_id="kit-sim",
                entry_gps_point_id=core.new_id(), entry_at=at, received_at=at,
                entry_distance_m=0, telemetry_source="MOBILE_GPS",
                consumed_by_event_id=core.new_id())

        self.db.add(one_passage(first_at))
        self.db.commit()
        self.assertFalse(core._route_sequence_complete(self.db, run, cp, core.now_utc()))
        finish_at = core.now_utc()
        self.db.add(one_passage(finish_at))
        self.db.commit()
        self.assertTrue(core._route_sequence_complete(self.db, run, cp, finish_at))

    def test_f06_declared_lap_checkpoint_can_be_first_in_route_order(self):
        race = self.race()
        student = core.Student(id=core.new_id(), student_code="T061", full_name="Test", faculty="NEU")
        self.db.add(student)
        self.db.flush()
        run = core.RunSession(id=core.new_id(), race_id=race.id, student_id=student.id,
            status="ACTIVE", started_at=core.now_utc() - timedelta(seconds=30))
        points = [core.Checkpoint(id=core.new_id(), race_id=race.id, code=f"R{i}",
            name=f"Route {i}", sequence_no=i, kind="LAP" if i == 1 else "CHECKPOINT")
            for i in range(1, 5)]
        self.db.add_all([run, *points])
        self.db.flush()
        start_at = core.now_utc() - timedelta(seconds=20)
        # Initial C01 anchor is followed by C02,C03,C04 and a separate C01 finish.
        ordered = [(points[0], start_at),
                   (points[1], start_at + timedelta(seconds=4)),
                   (points[2], start_at + timedelta(seconds=8)),
                   (points[3], start_at + timedelta(seconds=12)),
                   (points[0], start_at + timedelta(seconds=16))]
        for cp, at in ordered:
            self.db.add(core.GPSPassage(id=core.new_id(), race_id=race.id, checkpoint_id=cp.id,
                run_id=run.id, student_id=student.id, wearable_device_id="sim-device",
                entry_gps_point_id=core.new_id(), entry_at=at, received_at=at,
                entry_distance_m=0, telemetry_source="SIMULATED_GPS"))
        self.db.commit()
        self.assertTrue(core._route_sequence_complete(self.db, run, points[0], ordered[-1][1]))

    def test_f07_admin_can_open_scheduled_race_for_student_runs(self):
        race = self.race(status="SCHEDULED")
        response = core.change_race_status(race.id,
            core.RaceStatusPatch(expected_status="SCHEDULED", status="LIVE"), self.db)
        self.assertEqual(response["status"], "LIVE")
        self.assertIsNotNone(response["actual_start_at"])
        replay = core.change_race_status(race.id,
            core.RaceStatusPatch(expected_status="SCHEDULED", status="LIVE"), self.db)
        self.assertTrue(replay["idempotent"])

    def test_health_month_demo_is_ready_for_mobile_start_and_finish_contract(self):
        demo, _runners, _accounts, route_length = demos._create_month_demo(self.db, 60)
        race = self.db.get(core.Race, demo.race_id)
        attendance = self.db.get(student_api.StudentAttendanceConfig, race.id)
        challenge = self.db.get(demos.StudentRaceChallenge, race.id)
        participants = self.db.query(core.RaceParticipant).filter_by(race_id=race.id).all()
        self.assertEqual(race.target_distance_m, 50_000)
        self.assertEqual(challenge.target_distance_m, 50_000)
        self.assertIsNotNone(attendance)
        self.assertEqual(attendance.check_in_checkpoint_id, challenge.start_checkpoint_id)
        self.assertEqual(attendance.check_out_checkpoint_id, challenge.end_checkpoint_id)
        self.assertEqual(len(participants), 3)
        self.assertGreaterEqual(route_length, 400)
        self.assertLessEqual(route_length, 450)
        student = core.Student(student_code="T999", full_name="Test Challenge",
                               faculty="NEU")
        self.db.add(student)
        self.db.commit()
        allowed, reason, _, _ = student_api._registration_gate(
            self.db, race, student.id)
        self.assertTrue(allowed, reason)

    def test_kit_single_checkpoint_start_and_finish_events_complete_one_lap(self):
        race = self.race(mode="GPS_AND_ARDUINO", laps=1)
        student = core.Student(id=core.new_id(), student_code="11235723",
            full_name="Lê Phương Linh", faculty="NEU")
        self.db.add(student)
        self.db.flush()
        checkpoint = core.Checkpoint(id=core.new_id(), race_id=race.id,
            code="NEU-C04", name="C04", sequence_no=1, kind="LAP",
            latitude=20.9999722222, longitude=105.8418888889, radius_m=12)
        device = core.Device(id="KIT-TEST", name="Kit test", checkpoint_id=checkpoint.id)
        wearable = core.RunnerWearable(id="WEARABLE-TEST", student_id=student.id,
            name="Simulated GPS")
        self.db.add_all([checkpoint, device, wearable])
        self.db.flush()
        started = core.now_utc() - timedelta(seconds=12)
        run = core.RunSession(id=core.new_id(), race_id=race.id, student_id=student.id,
            wearable_device_id=wearable.id, source="KIT_DEMO", status="ACTIVE", started_at=started)
        self.db.add(run)
        self.db.flush()
        passages = []
        for label, when in (("start", started + timedelta(seconds=1)),
                            ("finish", core.now_utc())):
            point = core.GpsPoint(run_id=run.id, wearable_device_id=wearable.id,
                latitude=checkpoint.latitude, longitude=checkpoint.longitude,
                recorded_at=when, received_at=when, accuracy_m=4, speed_mps=0,
                total_steps=0, source="SIMULATED_GPS", idempotency_key=f"kit:{label}")
            self.db.add(point)
            self.db.flush()
            passage = core.GPSPassage(race_id=race.id, checkpoint_id=checkpoint.id,
                run_id=run.id, student_id=student.id, wearable_device_id=wearable.id,
                entry_gps_point_id=point.id, entry_at=when, received_at=when,
                entry_distance_m=0, telemetry_source="SIMULATED_GPS")
            event = core.DeviceEvent(device_id=device.id, checkpoint_id=checkpoint.id,
                occurred_at=when, received_at=when, event_type="PASSAGE_DETECTED",
                source_event_id=f"kit-test:{label}", status="MATCHED", student_id=student.id,
                matched_run_id=run.id, lap_status="NOT_COUNTED" if label == "start" else "NOT_EVALUATED",
                reason_code="KIT_DEMO_START_TRIGGER" if label == "start" else None,
                candidates_final=True)
            self.db.add_all([passage, event])
            self.db.flush()
            event.passage_id = passage.id
            passage.consumed_by_event_id = event.id
            passages.append(passage)
        self.db.commit()
        self.assertEqual(len(passages), 2)
        self.assertTrue(all(item.consumed_by_event_id for item in passages))
        counted, _duration = core.record_lap(self.db, run, checkpoint,
            passages[1].entry_at, "ARDUINO_KIT_DEMO", "kit-test:finish")
        self.db.commit()
        self.assertTrue(counted)
        self.assertEqual(run.lap_count, 1)
        self.assertEqual(run.status, "COMPLETED")

    def test_student_app_routes_are_in_the_openapi_contract(self):
        paths = core.app.openapi()["paths"]
        expected = {
            "/api/v1/student/auth/login", "/api/v1/student/races",
            "/api/v1/student/races/{race_id}/registrations",
            "/api/v1/student/races/{race_id}/runs",
            "/api/v1/student/runs/{run_id}/gps-batches",
            "/api/v1/student/runs/{run_id}/finish",
            "/api/v1/student/races/{race_id}/progress",
        }
        self.assertTrue(expected.issubset(paths), expected - set(paths))


if __name__ == "__main__":
    unittest.main(verbosity=2)
