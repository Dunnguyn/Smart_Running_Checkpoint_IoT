import {
  activeTime,
  canRegister,
  meters,
  terminal,
  type Ack,
  type Auth,
  type Operation,
  type Sample,
  type Snapshot,
} from "../domain/model";
import type { Store } from "../storage/port";
import { ServiceError, type StudentService } from "./contract";
import { seed } from "./fixtures";

export type Scenario =
  | "normal"
  | "offline"
  | "empty"
  | "start-error"
  | "ambiguous"
  | "expired"
  | "ack-lost";
type Database = {
  snapshot: Snapshot;
  operations: Record<string, string>;
  accepted: string[];
  resolving: Record<string, number>;
};
export class MockService implements StudentService {
  scenario: Scenario = "normal";
  latency = 450;
  constructor(
    private store: Store,
    private now: () => number = Date.now,
  ) {}
  private key(owner: string) {
    return `mock-server:${owner}`;
  }
  private load(owner: string): Database {
    return (
      this.store.read<Database>(this.key(owner)) ?? {
        snapshot: seed(owner, this.now()),
        operations: {},
        accepted: [],
        resolving: {},
      }
    );
  }
  private save(owner: string, db: Database) {
    this.store.write(this.key(owner), db);
  }
  private async gate(auth?: Auth) {
    if (this.latency)
      await new Promise((resolve) => setTimeout(resolve, this.latency));
    if (this.scenario === "offline")
      throw new ServiceError(
        "NETWORK",
        "Mất kết nối. Dữ liệu đang chờ đồng bộ.",
        true,
      );
    if (auth && (auth.expiresAt <= this.now() || this.scenario === "expired"))
      throw new ServiceError(
        "UNAUTHORIZED",
        "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      );
  }
  async login(code: string, password: string): Promise<Auth> {
    await this.gate();
    if (!["11223344", "11223345"].includes(code) || password !== "NeuRun@demo")
      throw new ServiceError(
        "BAD_CREDENTIALS",
        "Mã sinh viên hoặc mật khẩu chưa chính xác.",
      );
    this.scenario = this.scenario === "expired" ? "normal" : this.scenario;
    return {
      token: `mock:${code}`,
      expiresAt: this.now() + 8 * 3600000,
      student: {
        id: code,
        code,
        name: code === "11223344" ? "Nguyễn Minh Anh" : "Trần Hoàng Nam",
        faculty: "Kinh tế học",
        className: "Kinh tế 64A",
      },
    };
  }
  async snapshot(auth: Auth) {
    await this.gate(auth);
    const db = this.load(auth.student.id);
    for (const run of db.snapshot.runs) {
      if (
        run.status === "VERIFYING" &&
        this.now() >= (db.resolving[run.id] ?? Infinity)
      ) {
        run.status =
          run.laps.length >=
          db.snapshot.races.find((r) => r.id === run.raceId)!.targetLaps
            ? "COMPLETED"
            : "ENDED";
        run.revision++;
        db.snapshot.revision++;
      }
    }
    this.save(auth.student.id, db);
    return this.scenario === "empty"
      ? { ...db.snapshot, races: [], enrollments: [], runs: [] }
      : db.snapshot;
  }
  async execute(auth: Auth, op: Operation): Promise<Snapshot> {
    await this.gate(auth);
    const owner = auth.student.id;
    if (owner !== op.owner)
      throw new ServiceError(
        "IDENTITY",
        "Thao tác không thuộc tài khoản hiện tại.",
      );
    const db = this.load(owner),
      snap = db.snapshot;
    if (db.operations[op.id]) {
      if (db.operations[op.id] !== JSON.stringify(op))
        throw new ServiceError(
          "KEY_CONFLICT",
          "Mã thao tác đã được dùng với dữ liệu khác.",
        );
      return snap;
    }
    const race = snap.races.find((r) => r.id === op.raceId);
    if (!race) throw new ServiceError("NOT_FOUND", "Không tìm thấy giải chạy.");
    const enrollment = snap.enrollments.find((e) => e.raceId === op.raceId);
    const run = snap.runs.find((r) => r.id === op.runId);
    const now = this.now();
    if (op.kind === "register") {
      if (!enrollment) {
        if (!canRegister(race, now))
          throw new ServiceError(
            "REGISTRATION_CLOSED",
            "Giải chưa mở, đã hết hạn, hết chỗ hoặc đã hủy.",
          );
        race.registered++;
        snap.enrollments.push({
          raceId: race.id,
          bib: `${race.id === "campus" ? "NR" : "NEU"}-${String(race.registered).padStart(4, "0")}`,
        });
      }
    } else if (op.kind === "checkin" || op.kind === "checkout") {
      if (!enrollment)
        throw new ServiceError("NOT_REGISTERED", "Bạn chưa đăng ký giải.");
      if (race.phase === "CANCELLED")
        throw new ServiceError("CANCELLED", "Giải đã hủy.");
      if (!op.fix || !race.attendanceZone)
        throw new ServiceError(
          "LOCATION_REQUIRED",
          "Cần vị trí mới và cấu hình vùng điểm danh.",
        );
      if (now - op.fix.timestamp > 30000 || op.fix.timestamp > now + 5000)
        throw new ServiceError(
          "STALE_FIX",
          "Vị trí đã cũ. Vui lòng lấy lại vị trí.",
        );
      if (op.fix.accuracy > race.attendanceZone.maxAccuracy)
        throw new ServiceError(
          "ACCURACY",
          "GPS chưa chính xác. Di chuyển ra nơi thoáng và thử lại.",
        );
      if (
        meters(op.fix, race.attendanceZone.center) > race.attendanceZone.radius
      )
        throw new ServiceError(
          "OUTSIDE",
          "Bạn đang ngoài vùng điểm danh của giải.",
        );
      if (op.kind === "checkin") {
        if (race.phase !== "LIVE")
          throw new ServiceError("NOT_OPEN", "Chưa đến thời gian check-in.");
        enrollment.checkedInAt ??= now;
      } else {
        if (
          !enrollment.checkedInAt ||
          snap.runs.some((r) => r.raceId === race.id && !terminal(r))
        )
          throw new ServiceError(
            "RUN_PENDING",
            "Cần kết thúc và xác nhận phiên chạy trước check-out.",
          );
        enrollment.checkedOutAt ??= now;
      }
    } else if (op.kind === "start") {
      if (this.scenario === "start-error")
        throw new ServiceError(
          "START_FAILED",
          "Không thể bắt đầu phiên. Chưa ghi GPS.",
        );
      if (
        !enrollment?.checkedInAt ||
        enrollment.checkedOutAt ||
        race.phase !== "LIVE"
      )
        throw new ServiceError(
          "NOT_CHECKED_IN",
          "Cần check-in trong giải đang diễn ra.",
        );
      if (snap.runs.some((r) => !terminal(r)))
        throw new ServiceError(
          "ACTIVE_RUN_EXISTS",
          "Bạn còn một phiên chưa kết thúc.",
        );
      snap.runs.unshift({
        id: `run-${op.id}`,
        owner,
        raceId: race.id,
        status: "ACTIVE",
        startedAt: now,
        activeSince: now,
        activeMs: 0,
        distance: 0,
        laps: [],
        samples: [],
        revision: 1,
        outsideLapZone: false,
      });
    } else {
      if (!run || run.owner !== owner || run.raceId !== race.id)
        throw new ServiceError(
          "NOT_FOUND",
          "Không tìm thấy phiên chạy của bạn.",
        );
      if (terminal(run))
        throw new ServiceError("TERMINAL", "Phiên chạy đã kết thúc.");
      if (op.kind === "pause") {
        if (run.status !== "ACTIVE")
          throw new ServiceError("INVALID_STATE", "Phiên không đang chạy.");
        run.pausedAt = Math.max(
          run.activeSince ?? run.startedAt,
          Math.min(now, op.createdAt),
        );
        run.activeMs = activeTime(run, run.pausedAt);
        run.activeSince = undefined;
        run.status = "PAUSED";
      } else if (op.kind === "resume") {
        if (run.status !== "PAUSED")
          throw new ServiceError("INVALID_STATE", "Phiên không đang tạm dừng.");
        run.status = "ACTIVE";
        run.activeSince = now;
        run.pausedAt = undefined;
        run.outsideLapZone = false;
        run.lastSegment = undefined;
      } else {
        run.activeMs = activeTime(run, now);
        run.activeSince = undefined;
        run.endedAt = now;
        run.status = "VERIFYING";
        db.resolving[run.id] = now + 1200;
      }
      run.revision++;
    }
    snap.revision++;
    db.operations[op.id] = JSON.stringify(op);
    this.save(owner, db);
    if (this.scenario === "ambiguous") {
      this.scenario = "normal";
      throw new ServiceError(
        "TIMEOUT",
        "Chưa rõ kết quả gửi. Đang đối chiếu trạng thái.",
        true,
      );
    }
    return snap;
  }
  async upload(auth: Auth, samples: Sample[]): Promise<Ack> {
    await this.gate(auth);
    const db = this.load(auth.student.id),
      ack: Ack = { accepted: [], rejected: [] };
    for (const sample of samples) {
      const run = db.snapshot.runs.find((r) => r.id === sample.runId);
      if (sample.owner !== auth.student.id || !run) {
        ack.rejected.push({
          id: sample.id,
          reason: "Sai tài khoản hoặc phiên",
        });
        continue;
      }
      if (db.accepted.includes(sample.id)) {
        ack.accepted.push(sample.id);
        continue;
      }
      const race = db.snapshot.races.find((r) => r.id === run.raceId)!;
      if (
        terminal(run) ||
        run.status === "VERIFYING" ||
        (run.status === "PAUSED" && sample.timestamp > (run.pausedAt ?? 0)) ||
        !Number.isFinite(sample.latitude) ||
        !Number.isFinite(sample.longitude) ||
        Math.abs(sample.latitude) > 90 ||
        Math.abs(sample.longitude) > 180 ||
        !Number.isFinite(sample.accuracy) ||
        sample.accuracy < 0 ||
        sample.accuracy > (race.attendanceZone?.maxAccuracy ?? Infinity) ||
        !Number.isFinite(sample.timestamp) ||
        sample.timestamp < run.startedAt ||
        sample.timestamp > this.now() + 5000 ||
        !Number.isInteger(sample.sequence) ||
        sample.sequence < 1 ||
        !Number.isInteger(sample.segment) ||
        sample.segment < 1
      ) {
        ack.rejected.push({
          id: sample.id,
          reason: "Phiên đã đóng hoặc mẫu không hợp lệ",
        });
        continue;
      }
      const last = run.samples.at(-1);
      if (
        last &&
        (sample.sequence <= last.sequence || sample.timestamp <= last.timestamp)
      ) {
        ack.rejected.push({
          id: sample.id,
          reason: "Thứ tự hoặc thời gian mẫu không hợp lệ",
        });
        continue;
      }
      if (last?.segment === sample.segment)
        run.distance += meters(last, sample);
      // Mock service is the ONLY lap/result authority. A new segment must leave
      // the lap zone before a subsequent entry can count. Demo radius is 20m.
      const outside = meters(sample, race.route[0]) > 20;
      if (run.lastSegment !== sample.segment) {
        run.outsideLapZone = outside;
        run.lastSegment = sample.segment;
      } else {
        if (!outside && run.outsideLapZone) {
          run.laps.push({ number: run.laps.length + 1, at: sample.timestamp });
          run.outsideLapZone = false;
        }
        if (outside) run.outsideLapZone = true;
      }
      run.samples.push(sample);
      db.accepted.push(sample.id);
      ack.accepted.push(sample.id);
      run.revision++;
      if (run.laps.length >= race.targetLaps) {
        run.activeMs = activeTime(run, this.now());
        run.activeSince = undefined;
        run.status = "COMPLETED";
        run.endedAt = this.now();
      }
    }
    db.snapshot.revision++;
    this.save(auth.student.id, db);
    if (this.scenario === "ack-lost") {
      this.scenario = "normal";
      throw new ServiceError(
        "TIMEOUT",
        "Mock: ACK bị mất sau khi đã nhận mẫu; thử lại giữ nguyên ID.",
        true,
      );
    }
    return ack;
  }
  reset(owner: string) {
    this.store.remove(this.key(owner));
    this.scenario = "normal";
  }
}
