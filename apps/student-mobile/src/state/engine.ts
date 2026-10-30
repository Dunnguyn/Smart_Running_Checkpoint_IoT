import {
  meters,
  terminal,
  type Auth,
  type Fix,
  type Operation,
  type Snapshot,
  type Tracking,
} from "../domain/model";
import type { Gps } from "../gps/port";
import { ServiceError, type StudentService } from "../services/contract";
import type { Store } from "../storage/port";

export type ViewState = {
  auth?: Auth;
  snapshot?: Snapshot;
  tracking?: Tracking;
  busy: boolean;
  syncing: boolean;
  online: boolean;
  error?: string;
  updatedAt?: number;
  ready: boolean;
};
export interface AuthStore {
  read(): Promise<Auth | undefined>;
  write(auth: Auth): Promise<void>;
  clear(): Promise<void>;
}
export const MAX_QUEUE = 3000;
// Device continuity policy, not a backend result/pace threshold.
export const MAX_FIX_GAP_MS = 30000;
import { uuid as id } from "../services/ids";
export class Engine {
  private view: ViewState = {
    busy: false,
    syncing: false,
    online: true,
    ready: false,
  };
  private listeners = new Set<() => void>();
  private syncing = false;
  private syncTask?: Promise<void>;
  private resetting = false;
  private captureStarting = false;
  private bootPromise?: Promise<void>;
  constructor(
    private service: StudentService,
    private store: Store,
    private authStore: AuthStore,
    public gps: Gps,
    private mode: string,
    private now: () => number = Date.now,
  ) {}
  get = () => this.view;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  private update(patch: Partial<ViewState>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private trackKey(owner: string) {
    return `tracking:${this.mode}:${owner}`;
  }
  private saveTracking(tracking: Tracking) {
    this.update({ tracking: { ...tracking } });
    this.store.write(this.trackKey(tracking.owner), tracking);
  }
  private apply(snapshot: Snapshot) {
    const auth = this.view.auth;
    if (!auth) return;
    if (snapshot.runs.some((r) => r.owner !== auth.student.id))
      throw new ServiceError(
        "IDENTITY",
        "Phản hồi không thuộc tài khoản hiện tại.",
      );
    if (snapshot.revision < (this.view.snapshot?.revision ?? -1)) return;
    this.store.write(`snapshot:${this.mode}:${auth.student.id}`, snapshot);
    this.update({ snapshot, updatedAt: this.now() });
    const tracking = this.view.tracking;
    if (
      tracking &&
      snapshot.runs.some(
        (r) =>
          r.id === tracking.runId && (terminal(r) || r.status === "VERIFYING"),
      )
    ) {
      this.saveTracking({ ...tracking, capture: "STOPPED", last: undefined });
      void this.gps.stop().catch((e) => this.report(e));
    }
  }
  boot(background = false) {
    return (this.bootPromise ??= this.restore(background));
  }
  private async restore(background: boolean) {
    try {
      const auth = await this.authStore.read();
      if (auth) {
        if (auth.token.startsWith("mock:") !== (this.mode === "mock")) {
          await this.authStore.clear();
          return;
        }
        this.restoreAccount(auth, background);
        if (!background) await this.gps.stop();
        if (auth.expiresAt <= this.now() && !auth.refreshToken)
          await this.expire();
        else await this.refresh();
      }
    } catch (error) {
      await this.report(error);
    } finally {
      this.update({ ready: true });
    }
  }
  private restoreAccount(auth: Auth, background = false) {
    const snapshot = this.store.read<Snapshot>(
      `snapshot:${this.mode}:${auth.student.id}`,
    );
    let tracking = this.store.read<Tracking>(this.trackKey(auth.student.id));
    if (
      !background &&
      tracking &&
      ["ACQUIRING", "RECORDING"].includes(tracking.capture)
    ) {
      tracking = {
        ...tracking,
        capture: "ERROR",
        last: undefined,
        error: "Phiên đã khôi phục. Chạm Lấy lại GPS để bắt đầu đoạn mới.",
      };
      this.store.write(this.trackKey(auth.student.id), tracking);
    }
    // Never resume a paused/error collector because server reports ACTIVE.
    this.update({ auth, snapshot, tracking, error: undefined });
  }
  async login(code: string, password: string) {
    if (this.view.busy) return;
    this.update({ busy: true, error: undefined });
    try {
      const auth = await this.service.login(code, password);
      await this.authStore.write(auth);
      this.restoreAccount(auth);
      await this.refresh();
    } catch (e) {
      await this.report(e);
    } finally {
      this.update({ busy: false });
    }
  }
  private async expire() {
    const tracking = this.view.tracking;
    if (tracking)
      this.saveTracking({
        ...tracking,
        capture: "PAUSED",
        last: undefined,
        error: "Cần đăng nhập lại để tiếp tục.",
      });
    await this.gps.stop();
    await this.authStore.clear();
    this.update({
      auth: undefined,
      snapshot: undefined,
      tracking: undefined,
      error:
        "Phiên đăng nhập đã hết hạn. Dữ liệu chờ được giữ riêng cho tài khoản cũ.",
    });
  }
  async logout() {
    this.resetting = true;
    this.update({ busy: true });
    let error: unknown;
    try {
      const tracking = this.view.tracking;
      if (tracking)
        this.saveTracking({ ...tracking, capture: "PAUSED", last: undefined });
      await this.gps.stop();
      // Let an in-flight token rotation finish before clearing stored credentials.
      if (this.syncTask) await this.syncTask;
      const auth = this.view.auth;
      await this.expire();
      try {
        if (auth) await this.service.logout?.(auth);
      } catch (e) {
        error = e;
      }
      this.update({
        error: error
          ? "Đã đăng xuất khỏi thiết bị. Chưa xác nhận thu hồi phiên trên máy chủ do lỗi kết nối."
          : undefined,
      });
    } finally {
      this.resetting = false;
      this.update({ busy: false });
    }
  }
  async changePassword(current: string, next: string) {
    if (!this.view.auth || this.view.busy || !this.service.changePassword)
      return;
    this.update({ busy: true, error: undefined });
    try {
      await this.service.changePassword(this.view.auth, current, next);
      await this.expire();
      this.update({
        error: "Đổi mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.",
      });
    } catch (e) {
      await this.report(e);
    } finally {
      this.update({ busy: false });
    }
  }
  async report(error: unknown) {
    if (error instanceof ServiceError && error.code === "UNAUTHORIZED") {
      await this.expire();
      return;
    }
    this.update({
      error:
        error instanceof Error
          ? error.message
          : "Có lỗi xảy ra. Vui lòng thử lại.",
    });
  }
  clearError() {
    this.update({ error: undefined });
  }
  setOnline(online: boolean) {
    this.update({ online });
    if (online) void this.sync();
  }
  async refresh() {
    const auth = this.view.auth;
    if (!auth || auth.mustChangePassword) return;
    try {
      const snapshot = await this.service.snapshot(auth);
      if (this.view.auth?.student.id === auth.student.id) this.apply(snapshot);
    } catch (e) {
      await this.report(e);
    }
  }
  private emptyTracking(owner: string): Tracking {
    return {
      owner,
      runId: "",
      segment: 0,
      sequence: 0,
      capture: "STOPPED",
      distance: 0,
      queue: [],
      rejected: [],
      operations: [],
      boundaryAt: this.now(),
    };
  }
  async action(kind: Operation["kind"], raceId: string, runId?: string) {
    if (this.view.busy || !this.view.auth) return false;
    this.update({ busy: true, error: undefined });
    try {
      const auth = this.view.auth;
      if (this.mode === "api" && !this.view.online)
        throw new Error("Cần kết nối mạng để xác nhận thao tác với backend.");
      const race = this.view.snapshot?.races.find((r) => r.id === raceId);
      if (
        ["register", "checkin", "start"].includes(kind) &&
        race &&
        ["CANCELLED", "ENDED"].includes(race.phase)
      )
        throw new Error(
          "Giải đã hủy hoặc kết thúc; không thể đăng ký, điểm danh hay bắt đầu phiên mới.",
        );
      let tracking = this.view.tracking ?? this.emptyTracking(auth.student.id);
      if (kind === "pause" || kind === "finish") {
        // Synchronous gate first: ignore callbacks already in the native bridge.
        tracking = {
          ...tracking,
          capture: kind === "pause" ? "PAUSED" : "STOPPED",
          last: undefined,
          boundaryAt: this.now(),
        };
        try {
          this.saveTracking(tracking);
        } finally {
          await this.gps.stop();
        }
      }
      if (
        kind === "start" &&
        (tracking.queue.length ||
          tracking.operations.length ||
          this.view.snapshot?.runs.some((r) => !terminal(r)))
      )
        throw new Error(
          "Hãy xử lý phiên hoặc dữ liệu đang chờ trước khi bắt đầu phiên mới.",
        );
      if (kind === "resume" && tracking.operations.length)
        throw new Error(
          "Thao tác tạm dừng chưa được xác nhận. Đồng bộ trước khi tiếp tục.",
        );
      const pending = tracking.operations.find(
        (o) => o.kind === kind && o.raceId === raceId && o.runId === runId,
      );
      const fix =
        !pending &&
        (kind === "checkin" ||
          kind === "checkout" ||
          (kind === "start" && this.mode === "api"))
          ? await this.gps.fresh()
          : undefined;
      if (fix?.simulated && this.mode === "api")
        throw new Error("GPS giả bị chặn trong chế độ API thật.");
      const op: Operation = pending ?? {
        id: id(),
        owner: auth.student.id,
        kind,
        raceId,
        runId,
        fix,
        createdAt: this.now(),
      };
      if (!pending)
        this.saveTracking({
          ...(this.view.tracking ?? tracking),
          operations: [
            ...(this.view.tracking?.operations ?? tracking.operations),
            op,
          ],
        });
      // A poll may already have captured its operation list. Wait for that
      // pass, then explicitly reconcile this action before reporting success.
      if (this.syncTask) await this.syncTask;
      await this.sync();
      const confirmed =
        !this.view.tracking?.operations.some((o) => o.id === op.id) &&
        !this.view.error;
      if (confirmed && (kind === "start" || kind === "resume")) {
        const run = this.view.snapshot?.runs.find(
          (r) => r.raceId === raceId && r.status === "ACTIVE",
        );
        if (run) await this.startCapture(run.id);
      }
      return confirmed;
    } catch (e) {
      await this.report(e);
      return false;
    } finally {
      this.update({ busy: false });
    }
  }
  async startCapture(runId: string) {
    if (this.captureStarting || this.view.tracking?.capture === "RECORDING")
      return;
    const auth = this.view.auth,
      run = this.view.snapshot?.runs.find((r) => r.id === runId);
    if (!auth || run?.status !== "ACTIVE") return;
    if (run.boundToInstallation === false) {
      await this.report(
        new Error(
          "Phiên chạy thuộc thiết bị khác. Hãy tiếp tục trên thiết bị đã bắt đầu phiên.",
        ),
      );
      return;
    }
    let tracking = this.view.tracking ?? this.emptyTracking(auth.student.id);
    if (tracking.operations.length)
      throw new Error("Cần đồng bộ thao tác đang chờ trước khi ghi GPS.");
    if (tracking.runId !== runId)
      tracking = this.emptyTracking(auth.student.id);
    this.saveTracking({
      ...tracking,
      runId,
      capture: "ACQUIRING",
      segment: Math.max(tracking.segment, run.lastSegment ?? 0) + 1,
      sequence: Math.max(tracking.sequence, run.lastSequence ?? 0),
      last: undefined,
      boundaryAt: this.now(),
      error: undefined,
    });
    this.captureStarting = true;
    try {
      await this.gps.start(
        (fix) => this.ingest(fix),
        (message) => this.gpsError(message),
      );
    } catch (e) {
      this.gpsError((e as Error).message);
    } finally {
      this.captureStarting = false;
    }
  }
  gpsError(message: string) {
    const tracking = this.view.tracking;
    if (tracking) {
      try {
        this.saveTracking({
          ...tracking,
          capture: "ERROR",
          last: undefined,
          error: message,
        });
      } catch {
        this.update({
          error:
            "Bộ nhớ thiết bị không ghi được. GPS đã ngừng; giữ app mở để thử đồng bộ dữ liệu.",
        });
      }
    }
    void this.gps.stop().catch((e) => this.report(e));
  }
  async backgroundFixes(fixes: Fix[]) {
    await this.boot(true);
    const auth = this.view.auth;
    if (!auth) {
      await this.gps.stop();
      return;
    }
    // A headless task must honor the durable pause/stop gate before accepting
    // a late native batch. Use the same sequence, segment and queue as foreground.
    const saved = this.store.read<Tracking>(this.trackKey(auth.student.id));
    if (!saved || !["ACQUIRING", "RECORDING"].includes(saved.capture)) {
      await this.gps.stop();
      return;
    }
    this.update({ tracking: saved });
    for (const fix of [...fixes].sort((a, b) => a.timestamp - b.timestamp))
      this.ingest(fix);
    await this.sync();
  }
  ingest(fix: Fix) {
    let tracking = this.view.tracking;
    const auth = this.view.auth;
    if (
      !auth ||
      !tracking ||
      tracking.owner !== auth.student.id ||
      !["ACQUIRING", "RECORDING"].includes(tracking.capture)
    )
      return;
    if (auth.expiresAt <= this.now() && !auth.refreshToken) {
      void this.expire();
      return;
    }
    const runId = tracking.runId;
    const run = this.view.snapshot?.runs.find((r) => r.id === runId);
    if (
      !run ||
      run.status !== "ACTIVE" ||
      fix.timestamp < tracking.boundaryAt ||
      (tracking.last && fix.timestamp <= tracking.last.timestamp)
    )
      return;
    if (fix.simulated && this.mode === "api") {
      this.gpsError("GPS giả không được gửi lên API thật.");
      return;
    }
    const maxAccuracy = this.view.snapshot?.races.find(
      (r) => r.id === run.raceId,
    )?.attendanceZone?.maxAccuracy;
    if (
      !Number.isFinite(fix.accuracy) ||
      (maxAccuracy !== undefined && fix.accuracy > maxAccuracy)
    ) {
      this.saveTracking({
        ...tracking,
        capture: "ACQUIRING",
        segment: tracking.segment + (tracking.last ? 1 : 0),
        last: undefined,
        error: "GPS có độ chính xác thấp. Đang chờ vị trí tốt hơn.",
      });
      return;
    }
    if (
      tracking.last &&
      fix.timestamp - tracking.last.timestamp > MAX_FIX_GAP_MS
    )
      tracking = {
        ...tracking,
        segment: tracking.segment + 1,
        last: undefined,
      };
    if (tracking.queue.length >= MAX_QUEUE) {
      this.gpsError(
        "Bộ nhớ chờ đã đạt 3.000 mẫu. Đã ngừng ghi GPS; hãy kết nối mạng và đồng bộ.",
      );
      return;
    }
    const sample = {
      ...fix,
      id: id(),
      sequence: tracking.sequence + 1,
      segment: tracking.segment,
      owner: tracking.owner,
      runId: tracking.runId,
    };
    try {
      this.saveTracking({
        ...tracking,
        capture: "RECORDING",
        sequence: sample.sequence,
        last: sample,
        lastFix: fix,
        distance:
          tracking.distance +
          (tracking.last?.segment === sample.segment
            ? meters(tracking.last, sample)
            : 0),
        queue: [...tracking.queue, sample],
        error: undefined,
      });
    } catch {
      this.gpsError(
        "Không lưu được GPS. Đã ngừng ghi để bảo vệ dữ liệu đang chờ.",
      );
    }
  }
  async sync() {
    if (this.syncTask) return this.syncTask;
    this.syncTask = this.syncOnce();
    try {
      await this.syncTask;
    } finally {
      this.syncTask = undefined;
    }
  }
  private async syncOnce() {
    if (
      this.syncing ||
      this.resetting ||
      !this.view.auth ||
      this.view.auth.mustChangePassword ||
      !this.view.online
    )
      return;
    const auth = this.view.auth;
    if (auth.expiresAt <= this.now() && !auth.refreshToken) {
      await this.expire();
      return;
    }
    this.syncing = true;
    this.update({ syncing: true });
    try {
      // Upload real GPS promptly; server validates run ownership/state. A full
      // history refresh must not consume the backend's short freshness window.
      if (this.mode !== "api") {
        const snapshot = await this.service.snapshot(auth);
        if (this.view.auth?.student.id !== auth.student.id) return;
        this.apply(snapshot);
      }
      const batch = this.view.tracking?.queue.slice(0, 100) ?? [];
      if (batch.length) {
        const ack = await this.service.upload(auth, batch);
        if (this.view.auth?.student.id !== auth.student.id) return;
        const sent = new Set(batch.map((s) => s.id));
        const handled = new Set(
          [...ack.accepted, ...ack.rejected.map((r) => r.id)].filter((x) =>
            sent.has(x),
          ),
        );
        const current = this.view.tracking!;
        this.saveTracking({
          ...current,
          queue: current.queue.filter((s) => !handled.has(s.id)),
          rejected: [
            ...current.rejected,
            ...ack.rejected.filter((r) => sent.has(r.id)),
          ].slice(-100),
        });
      }
      // Drain before pause/finish so pre-pause samples can be processed. Do not
      // drop batches when a result becomes terminal; explicit ACK still required.
      if (this.view.tracking?.queue.length) return;
      for (const op of [...(this.view.tracking?.operations ?? [])]) {
        try {
          const snapshot = await this.service.execute(auth, op);
          if (this.view.auth?.student.id !== auth.student.id) return;
          this.apply(snapshot);
          const current = this.view.tracking!;
          this.saveTracking({
            ...current,
            operations: current.operations.filter((o) => o.id !== op.id),
          });
          this.update({ error: undefined });
        } catch (e) {
          if (
            e instanceof ServiceError &&
            !e.retryable &&
            e.code !== "UNAUTHORIZED"
          ) {
            const current = this.view.tracking!;
            this.saveTracking({
              ...current,
              operations: current.operations.filter((o) => o.id !== op.id),
            });
          }
          throw e;
        }
      }
      await this.refresh();
    } catch (e) {
      await this.report(e);
    } finally {
      this.syncing = false;
      this.update({ syncing: false });
    }
  }
  async suspendForeground() {
    const tracking = this.view.tracking;
    if (tracking && ["RECORDING", "ACQUIRING"].includes(tracking.capture)) {
      this.saveTracking({
        ...tracking,
        capture: "ERROR",
        last: undefined,
        error: "App đã ra nền. Chạm Lấy lại GPS để bắt đầu đoạn mới.",
      });
      await this.gps.stop();
    }
  }
  async resetDemo() {
    if (this.mode !== "mock" || !this.view.auth) return;
    if (this.syncing || this.view.busy)
      throw new Error(
        "Hãy chờ thao tác đang gửi hoàn tất trước khi đặt lại demo.",
      );
    const owner = this.view.auth.student.id;
    this.resetting = true;
    this.update({
      busy: true,
      tracking: this.view.tracking
        ? { ...this.view.tracking, capture: "STOPPED" }
        : undefined,
    });
    try {
      await this.gps.stop();
      this.store.remove(this.trackKey(owner));
      this.store.remove(`snapshot:mock:${owner}`);
      this.store.remove(`mock-server:${owner}`);
      this.update({
        tracking: undefined,
        snapshot: undefined,
        error: undefined,
      });
      await this.refresh();
    } finally {
      this.resetting = false;
      this.update({ busy: false });
    }
  }
}
