export type Point = { latitude: number; longitude: number };
export type Fix = Point & {
  timestamp: number;
  accuracy: number;
  simulated: boolean;
};
export type Sample = Fix & {
  id: string;
  sequence: number;
  segment: number;
  runId: string;
  owner: string;
};
export type Student = {
  id: string;
  code: string;
  name: string;
  faculty: string;
  className: string;
};
export type Auth = {
  token: string;
  student: Student;
  expiresAt: number;
  refreshToken?: string;
  installationId?: string;
  mustChangePassword?: boolean;
};
export type Race = {
  id: string;
  name: string;
  place: string;
  description?: string;
  actions?: Record<string, boolean>;
  registrationAllowed?: boolean;
  registrationMessage?: string;
  startsAt: number;
  opensAt: number;
  closesAt: number;
  phase: "UPCOMING" | "LIVE" | "ENDED" | "CANCELLED";
  capacity: number;
  registered: number;
  targetLaps: number;
  lapMeters: number;
  route: Point[];
  checkpoints: {
    id: string;
    name: string;
    point: Point;
    kind: "START" | "LAP" | "CONTROL";
  }[];
  attendanceZone?: { center: Point; radius: number; maxAccuracy: number };
};
export type Enrollment = {
  raceId: string;
  bib: string;
  checkedInAt?: number;
  checkedOutAt?: number;
};
export type RunStatus =
  "ACTIVE" | "PAUSED" | "VERIFYING" | "COMPLETED" | "ENDED";
export type Run = {
  id: string;
  owner: string;
  raceId: string;
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  activeMs: number;
  activeSince?: number;
  pausedAt?: number;
  distance: number;
  laps: { number: number; at: number }[];
  samples: Sample[];
  revision: number;
  outsideLapZone: boolean;
  lastSegment?: number;
  lastSequence?: number;
  boundToInstallation?: boolean;
};
export type Snapshot = {
  races: Race[];
  enrollments: Enrollment[];
  runs: Run[];
  revision: number;
};
export type Operation = {
  id: string;
  owner: string;
  kind:
    | "register"
    | "checkin"
    | "checkout"
    | "start"
    | "pause"
    | "resume"
    | "finish";
  raceId: string;
  runId?: string;
  fix?: Fix;
  createdAt: number;
};
export type Ack = {
  accepted: string[];
  rejected: { id: string; reason: string }[];
};
export type Capture =
  "STOPPED" | "ACQUIRING" | "RECORDING" | "PAUSED" | "ERROR";
export type Tracking = {
  owner: string;
  runId: string;
  segment: number;
  sequence: number;
  capture: Capture;
  distance: number;
  last?: Sample;
  lastFix?: Fix;
  queue: Sample[];
  rejected: { id: string; reason: string }[];
  operations: Operation[];
  error?: string;
  boundaryAt: number;
};
export const terminal = (run: Run) =>
  run.status === "COMPLETED" || run.status === "ENDED";
export const elapsed = (run: Run, now = Date.now()) =>
  Math.max(0, (run.endedAt ?? now) - run.startedAt);
export const activeTime = (run: Run, now = Date.now()) =>
  run.activeMs +
  (run.activeSince ? Math.max(0, (run.endedAt ?? now) - run.activeSince) : 0);
export function meters(a: Point, b: Point) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * r) / 2) ** 2 +
    Math.cos(a.latitude * r) *
      Math.cos(b.latitude * r) *
      Math.sin(((b.longitude - a.longitude) * r) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function registrationLabel(r: Race, now = Date.now()) {
  if (r.registrationMessage) return r.registrationMessage;
  if (r.phase === "CANCELLED") return "Giải đã hủy";
  if (now < r.opensAt) return "Chưa mở đăng ký";
  if (now > r.closesAt || r.phase === "ENDED") return "Hết hạn đăng ký";
  if (r.registered >= r.capacity) return "Hết chỗ";
  return `Còn ${r.capacity - r.registered} chỗ`;
}
export const canRegister = (r: Race, now = Date.now()) =>
  r.registrationAllowed ?? registrationLabel(r, now).startsWith("Còn");
