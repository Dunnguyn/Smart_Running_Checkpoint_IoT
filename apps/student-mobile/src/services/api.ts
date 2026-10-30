import type {
  Ack,
  Auth,
  Operation,
  Race,
  Run,
  Sample,
  Snapshot,
} from "../domain/model";
import type { Store } from "../storage/port";
import type { AuthStore } from "../state/engine";
import { ServiceError, type StudentService } from "./contract";
import { uuid } from "./ids";
import { attendanceErrorHelp } from "./attendanceMessages";

type Profile = {
  student_id: string;
  student_code: string;
  full_name: string;
  faculty: string | null;
  class_name: string | null;
  must_change_password: boolean;
};
type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  profile: Profile;
};
type RunDto = {
  run_id: string;
  race_id: string;
  status: string;
  tracking_state: string;
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  active_seconds: number;
  distance_total_m: number;
  revision: number;
  segment_id: number;
  last_processed_sequence: number;
  segment_steps_current?: number;
  bound_to_current_installation: boolean;
};
type RaceDto = {
  race_id: string;
  name: string;
  description: string | null;
  location: string | null;
  status: string;
  start_at: string | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  capacity: number | null;
  registered_count: number;
  target_laps: number;
  target_distance_m?: number | null;
  route_length_m: number | null;
  can_register: boolean;
  blocked_reason: string | null;
  attendance_configured?: boolean;
  registration_status?: string | null;
  actions: Record<string, boolean>;
  participation: {
    bib_number: string;
    attendance: { checked_in_at: string | null; checked_out_at: string | null };
  } | null;
};
type MapDto = {
  route_points: { latitude: number; longitude: number }[];
  checkpoints: {
    checkpoint_id: string;
    name: string;
    latitude: number;
    longitude: number;
    type: string;
  }[];
};
type LapDto = { lap_no: number; occurred_at: string };
type TrackDto = {
  sample_id: string;
  sequence: number | null;
  segment_id: number;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  recorded_at: string;
};
type Page<T> = { items: T[]; next_cursor: string | null; has_more: boolean };
type Batch = {
  batch_id: string;
  samples: {
    sample_id: string;
    sequence: number;
    recorded_at: string;
    latitude: number;
    longitude: number;
    accuracy_m: number;
  }[];
  ack?: Ack;
};
type Mutation = { path: string; body: object; done?: boolean };
const segment = encodeURIComponent;
const time = (value: string | null) =>
  value
    ? Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`)
    : 0;

export class ApiService implements StudentService {
  private base: string;
  private renewal?: Promise<void>;
  private maps = new Map<string, { at: number; data: MapDto }>();
  private details = new Map<
    string,
    { revision: number; laps: LapDto[]; track: TrackDto[] }
  >();
  constructor(
    base: string,
    private store: Store,
    private authStore: AuthStore,
    private platform: "ANDROID" | "IOS",
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {
    this.base = base.replace(/\/+$/, "").replace(/\/api\/v1$/, "");
  }
  private key(owner: string, suffix: string) {
    return `student-api:${this.base}:${owner}:${suffix}`;
  }
  private async request<T>(
    path: string,
    body?: object,
    auth?: Auth,
    key?: string,
    method = "POST",
  ): Promise<T> {
    if (!/^https?:\/\//.test(this.base))
      throw new ServiceError("CONFIG", "Chưa cấu hình địa chỉ backend hợp lệ.");
    if (auth) await this.renew(auth);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.fetcher(
        `${this.base}/api/v1/student${path}`,
        {
          method: body === undefined ? "GET" : method,
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
            ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}),
            ...(key ? { "Idempotency-Key": key } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
      const raw = await response.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : undefined;
      } catch {
        throw new ServiceError(
          "SERVER_RESPONSE",
          `Backend trả phản hồi không hợp lệ (HTTP ${response.status}).`,
          true,
        );
      }
      if (!response.ok) {
        const error = data?.detail?.error ?? data?.detail;
        const code = error?.code ?? `HTTP_${response.status}`;
        throw new ServiceError(
          auth && response.status === 401 ? "UNAUTHORIZED" : code,
          `${attendanceErrorHelp(code) ?? error?.message ?? (response.status === 422 ? "Backend từ chối dữ liệu yêu cầu." : "Không thể xử lý yêu cầu.")} [${code}]`,
          response.status >= 500 || response.status === 429,
        );
      }
      return data as T;
    } catch (e) {
      if (e instanceof ServiceError) throw e;
      throw new ServiceError(
        "NETWORK",
        "Không nhận được xác nhận từ backend. Dữ liệu chờ được giữ để gửi lại.",
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  private async renew(auth: Auth) {
    if (auth.expiresAt > Date.now() + 30000) return;
    if (!auth.refreshToken || !auth.installationId)
      throw new ServiceError("UNAUTHORIZED", "Cần đăng nhập lại.");
    if (!this.renewal) {
      this.renewal = (async () => {
        try {
          const result = await this.request<Tokens>("/auth/refresh", {
            refresh_token: auth.refreshToken,
            installation_id: auth.installationId,
          });
          // Persist rotated credentials before allowing another authenticated request.
          const next = {
            ...auth,
            token: result.access_token,
            refreshToken: result.refresh_token,
            expiresAt: Date.now() + result.expires_in * 1000,
          };
          await this.authStore.write(next);
          Object.assign(auth, next);
        } catch {
          // A lost rotation response cannot safely be retried with the old token.
          await this.authStore.clear();
          throw new ServiceError(
            "UNAUTHORIZED",
            "Không thể khôi phục phiên. Hãy đăng nhập lại.",
          );
        }
      })();
    }
    try {
      await this.renewal;
    } finally {
      this.renewal = undefined;
    }
  }
  async login(code: string, password: string): Promise<Auth> {
    const installationKey = this.key("device", "installation");
    const installation = this.store.read<string>(installationKey) ?? uuid();
    this.store.write(installationKey, installation);
    const data = await this.request<Tokens>("/auth/login", {
      student_code: code,
      password,
      installation_id: installation,
      platform: this.platform,
      app_version: "1.0.0",
    });
    if (!data.access_token || !data.refresh_token || !data.profile?.student_id)
      throw new ServiceError(
        "CONTRACT",
        "Phản hồi đăng nhập thiếu thông tin phiên.",
      );
    this.maps.clear();
    this.details.clear();
    return {
      token: data.access_token,
      refreshToken: data.refresh_token,
      installationId: installation,
      expiresAt: Date.now() + data.expires_in * 1000,
      mustChangePassword: data.profile.must_change_password,
      student: {
        id: data.profile.student_id,
        code: data.profile.student_code,
        name: data.profile.full_name,
        faculty: data.profile.faculty ?? "",
        className: data.profile.class_name ?? "",
      },
    };
  }
  async logout(auth: Auth) {
    if (auth.refreshToken)
      await this.request("/auth/logout", { refresh_token: auth.refreshToken });
  }
  async changePassword(auth: Auth, current: string, next: string) {
    await this.request(
      "/auth/change-password",
      { current_password: current, new_password: next },
      auth,
    );
  }
  private async pages<T>(path: string, auth: Auth): Promise<T[]> {
    const result: T[] = [],
      seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const page: Page<T> = await this.request(
        `${path}?limit=100${cursor ? `&cursor=${segment(cursor)}` : ""}`,
        undefined,
        auth,
      );
      if (!Array.isArray(page.items))
        throw new ServiceError(
          "CONTRACT",
          "Backend trả danh sách không hợp lệ.",
          true,
        );
      result.push(...page.items);
      cursor = page.has_more ? page.next_cursor : null;
      if (page.has_more && (!cursor || seen.has(cursor)))
        throw new ServiceError(
          "PAGINATION",
          "Backend không trả trang kế tiếp hợp lệ.",
          true,
        );
      if (cursor) seen.add(cursor);
    } while (cursor);
    return result;
  }
  async snapshot(auth: Auth): Promise<Snapshot> {
    const rows = await this.pages<RaceDto>("/races", auth);
    const history = await this.pages<RunDto>("/runs", auth);
    const current = await this.request<{ run: RunDto | null }>(
      "/current-run",
      undefined,
      auth,
    );
    const byId = new Map(history.map((r) => [r.run_id, r]));
    if (current.run) byId.set(current.run.run_id, current.run);
    for (const run of byId.values())
      if (!rows.some((r) => r.race_id === run.race_id)) {
        rows.push(
          await this.request<RaceDto>(
            `/races/${segment(run.race_id)}`,
            undefined,
            auth,
          ),
        );
      }
    const races: Race[] = [];
    for (const r of rows) {
      const cacheKey = this.key(auth.student.id, r.race_id);
      let cached = this.maps.get(cacheKey);
      if (!cached || Date.now() - cached.at > 30000) {
        cached = {
          at: Date.now(),
          data: await this.request<MapDto>(
            `/races/${segment(r.race_id)}/map`,
            undefined,
            auth,
          ),
        };
        this.maps.set(cacheKey, cached);
      }
      races.push({
        id: r.race_id,
        name: r.name,
        description: r.description ?? "",
        place: r.location ?? "Chưa có địa điểm",
        startsAt: time(r.start_at),
        opensAt: time(r.registration_opens_at),
        closesAt: time(r.registration_closes_at),
        phase:
          r.status === "SCHEDULED"
            ? "UPCOMING"
            : r.status === "LIVE"
              ? "LIVE"
              : r.status === "CANCELLED"
                ? "CANCELLED"
                : "ENDED",
        capacity: r.capacity ?? 0,
        registered: r.registered_count,
        targetLaps: r.target_laps,
        targetDistanceMeters: r.target_distance_m ?? null,
        lapMeters: r.route_length_m ?? 0,
        registrationAllowed: r.status === "SCHEDULED" && r.can_register,
        attendanceConfigured: r.attendance_configured,
        registrationStatus: r.registration_status ?? null,
        registrationMessage: r.can_register
          ? r.capacity === null
            ? "Đang mở đăng ký"
            : `Còn ${Math.max(0, r.capacity - r.registered_count)} chỗ`
          : `Không thể đăng ký${r.blocked_reason ? ` (${r.blocked_reason})` : ""}`,
        actions: {
          ...r.actions,
          can_check_in:
            ["SCHEDULED", "LIVE"].includes(r.status) &&
            r.registration_status === "REGISTERED" &&
            r.attendance_configured !== false &&
            !!r.participation &&
            !r.participation.attendance.checked_in_at &&
            !r.participation.attendance.checked_out_at &&
            r.actions.can_check_in === true,
          can_start: r.status === "LIVE" && r.actions.can_start,
        },
        route: cached.data.route_points,
        checkpoints: cached.data.checkpoints
          .filter((p) => p.latitude != null && p.longitude != null)
          .map((p) => ({
            id: p.checkpoint_id,
            name: p.name,
            point: { latitude: p.latitude, longitude: p.longitude },
            kind: p.type === "LAP" ? "LAP" : "CONTROL",
          })),
      });
    }
    const runs: Run[] = [];
    for (const r of byId.values()) {
      const key = this.key(auth.student.id, r.run_id);
      let detail = this.details.get(key);
      if (!detail || detail.revision !== r.revision) {
        detail = {
          revision: r.revision,
          laps: await this.pages<LapDto>(
            `/runs/${segment(r.run_id)}/laps`,
            auth,
          ),
          track: await this.pages<TrackDto>(
            `/runs/${segment(r.run_id)}/track`,
            auth,
          ),
        };
        this.details.set(key, detail);
      }
      const status =
        r.status === "ACTIVE"
          ? r.tracking_state === "PAUSED"
            ? "PAUSED"
            : "ACTIVE"
          : r.status === "COMPLETED"
            ? "COMPLETED"
            : "ENDED";
      runs.push({
        id: r.run_id,
        owner: auth.student.id,
        raceId: r.race_id,
        status,
        startedAt: time(r.started_at),
        endedAt: time(r.ended_at) || undefined,
        activeMs: r.active_seconds * 1000,
        activeSince: status === "ACTIVE" ? Date.now() : undefined,
        pausedAt: time(r.paused_at) || undefined,
        distance: r.distance_total_m,
        revision: r.revision,
        lastSegment: r.segment_id,
        lastSequence: r.last_processed_sequence,
        segmentStepsCurrent: r.segment_steps_current,
        boundToInstallation: r.bound_to_current_installation,
        outsideLapZone: false,
        laps: detail.laps.map((l) => ({
          number: l.lap_no,
          at: time(l.occurred_at),
        })),
        samples: detail.track.map((p, i) => ({
          id: p.sample_id,
          owner: auth.student.id,
          runId: r.run_id,
          sequence: p.sequence ?? i + 1,
          segment: p.segment_id,
          latitude: p.latitude,
          longitude: p.longitude,
          accuracy: p.accuracy_m,
          timestamp: time(p.recorded_at),
          simulated: false,
        })),
      });
    }
    return {
      races,
      runs,
      enrollments: rows
        .filter((r) => r.participation)
        .map((r) => ({
          raceId: r.race_id,
          bib: r.participation!.bib_number,
          checkedInAt:
            time(r.participation!.attendance.checked_in_at) || undefined,
          checkedOutAt:
            time(r.participation!.attendance.checked_out_at) || undefined,
        })),
      revision: Date.now(),
    };
  }
  async execute(auth: Auth, op: Operation): Promise<Snapshot> {
    if (op.owner !== auth.student.id)
      throw new ServiceError(
        "IDENTITY",
        "Thao tác không thuộc tài khoản hiện tại.",
      );
    const key = this.key(op.owner, `operation:${op.id}`);
    let mutation = this.store.read<Mutation>(key);
    if (!mutation) {
      const racePath = `/races/${segment(op.raceId)}`;
      const position = op.fix
        ? {
            latitude: op.fix.latitude,
            longitude: op.fix.longitude,
            accuracy_m: op.fix.accuracy,
            captured_at: new Date(op.fix.timestamp).toISOString(),
          }
        : undefined;
      if (
        ["start", "checkin", "checkout"].includes(op.kind) &&
        (!position || op.fix?.simulated)
      )
        throw new ServiceError(
          "GPS_REQUIRED",
          "Cần vị trí GPS thật để xác nhận thao tác.",
        );
      if (op.kind === "register")
        mutation = { path: `${racePath}/registrations`, body: {} };
      else if (op.kind === "checkin" || op.kind === "checkout")
        mutation = {
          path: `${racePath}/${op.kind === "checkin" ? "check-in" : "check-out"}`,
          body: { position },
        };
      else if (op.kind === "start")
        mutation = {
          path: `${racePath}/runs`,
          body: { position, consent_version: "gps-v1", consent_granted: true },
        };
      else {
        if (!op.runId)
          throw new ServiceError("RUN_REQUIRED", "Không tìm thấy phiên chạy.");
        const path = `/runs/${segment(op.runId)}`;
        const run = await this.request<RunDto>(path, undefined, auth);
        if (!run.bound_to_current_installation)
          throw new ServiceError(
            "INSTALLATION",
            "Phiên chạy thuộc thiết bị khác.",
          );
        mutation = {
          path: `${path}/${op.kind === "finish" ? "withdraw" : op.kind}`,
          body: {
            expected_revision: run.revision,
            ...(op.kind === "resume" ? { steps_since_start: 0 } : {}),
          },
        };
      }
      this.store.write(key, mutation);
    }
    if (!mutation.done) {
      // Temporary client protection for cancelled-race check-in. Server must
      // still enforce this atomically: cancellation may race the POST.
      if (op.kind === "checkin" || op.kind === "start") {
        const latest = await this.request<RaceDto>(
          `/races/${segment(op.raceId)}`,
          undefined,
          auth,
        );
        if (latest.status === "CANCELLED" || latest.status === "COMPLETED")
          throw new ServiceError(
            "RACE_CLOSED",
            "Giải đã hủy hoặc kết thúc; không thể điểm danh hay bắt đầu phiên mới.",
          );
      }
      await this.request(mutation.path, mutation.body, auth, op.id);
      mutation.done = true;
      this.store.write(key, mutation);
    }
    // A committed write followed by a failed read must never be resubmitted as a new operation.
    try {
      return await this.snapshot(auth);
    } catch (e) {
      throw new ServiceError(
        e instanceof ServiceError ? e.code : "RECONCILE",
        e instanceof Error ? e.message : "Đang chờ xác nhận dữ liệu.",
        true,
      );
    }
  }
  async upload(auth: Auth, samples: Sample[]): Promise<Ack> {
    if (!samples.length) return { accepted: [], rejected: [] };
    const runId = samples[0].runId;
    if (
      samples.some(
        (s) => s.owner !== auth.student.id || s.runId !== runId || s.simulated,
      )
    )
      throw new ServiceError(
        "IDENTITY",
        "Lô GPS không hợp lệ hoặc thuộc tài khoản khác.",
      );
    const key = this.key(auth.student.id, `batch:${runId}`);
    let batch = this.store.read<Batch>(key);
    if (
      batch &&
      !batch.samples.some((s) => samples.some((p) => p.id === s.sample_id))
    )
      batch = undefined;
    if (!batch) {
      batch = {
        batch_id: uuid(),
        samples: samples.map((s) => ({
          sample_id: s.id,
          sequence: s.sequence,
          recorded_at: new Date(s.timestamp).toISOString(),
          latitude: s.latitude,
          longitude: s.longitude,
          accuracy_m: s.accuracy,
        })),
      };
      this.store.write(key, batch);
    }
    if (!batch.ack) {
      const result = await this.request<{
        items: {
          sample_id: string;
          accepted: boolean;
          status: string;
          reason_code?: string;
        }[];
      }>(
        `/runs/${segment(runId)}/gps-batches`,
        { batch_id: batch.batch_id, samples: batch.samples },
        auth,
      );
      if (
        !Array.isArray(result.items) ||
        result.items.length !== batch.samples.length ||
        new Set(result.items.map((i) => i.sample_id)).size !==
          batch.samples.length ||
        result.items.some(
          (i) =>
            !batch!.samples.some((s) => s.sample_id === i.sample_id) ||
            !["ACCEPTED", "DUPLICATE", "REJECTED"].includes(i.status) ||
            i.accepted !== (i.status !== "REJECTED"),
        )
      )
        throw new ServiceError(
          "ACK",
          "Backend chưa xác nhận đầy đủ lô GPS. Dữ liệu được giữ lại.",
          true,
        );
      batch.ack = {
        accepted: result.items
          .filter((i) => i.accepted)
          .map((i) => i.sample_id),
        rejected: result.items
          .filter((i) => !i.accepted)
          .map((i) => ({ id: i.sample_id, reason: i.reason_code ?? i.status })),
      };
      this.store.write(key, batch);
    }
    return batch.ack;
  }
}
