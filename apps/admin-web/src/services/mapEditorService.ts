import { request, RequestError } from "./client";
import type { BackendRoute, BackendCheckpoint } from "./contract";
import { validPosition } from "./contract";
import type { DashboardDto } from "./matchingContract";
export type RoutePoint = Omit<BackendRoute["points"][number], "sequence_no">;
export type CheckpointDraft = {
  latitude: number;
  longitude: number;
  radius_m: number;
};
export const lockedMessage =
  "Không thể sửa tuyến hoặc checkpoint vì giải đã có phiên chạy, kể cả phiên đã hoàn thành.";
export const hasRuns = (d?: DashboardDto) =>
  !!d && (d.summary.started_runners > 0 || d.runners.some((r) => !!r.run_id));
export function meters(a: RoutePoint, b: RoutePoint) {
  const rad = Math.PI / 180,
    p1 = a.latitude * rad,
    p2 = b.latitude * rad;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(p1) *
      Math.cos(p2) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function validateRoute(
  points: RoutePoint[],
  checkpoints: BackendCheckpoint[],
) {
  const errors: string[] = [];
  const invalidPoints = points.flatMap((p, i) =>
    validPosition(p.latitude, p.longitude) ? [] : [i],
  );
  const valid = invalidPoints.length === 0;
  const distance = valid
    ? points.slice(1).reduce((sum, p, i) => sum + meters(points[i], p), 0)
    : NaN;
  const gap =
    valid && points.length > 1 ? meters(points[0], points.at(-1)!) : NaN;
  const anchors = points.flatMap((p) =>
    p.checkpoint_id ? [p.checkpoint_id] : [],
  );
  if (!valid)
    errors.push(
      `Điểm ${invalidPoints.map((i) => i + 1).join(", ")} chưa có tọa độ hợp lệ. Nhập vĩ độ −90…90 và kinh độ −180…180 hoặc xóa điểm thừa.`,
    );
  if (points.length < 5 || points.length > 500)
    errors.push("Tuyến cần 5–500 điểm.");
  if (valid && !(distance >= 400 && distance <= 450))
    errors.push("Chiều dài tuyến cần trong 400–450 m.");
  if (valid && !(gap <= 2))
    errors.push(
      "Đầu và cuối phải cách nhau tối đa 2 m; thêm điểm cuối bằng thao tác của bạn.",
    );
  if (new Set(anchors).size !== anchors.length)
    errors.push(
      "Mỗi checkpoint chỉ có một điểm neo; điểm khép vòng không lặp neo.",
    );
  if (
    checkpoints.some((c) => !anchors.includes(c.checkpoint_id)) ||
    anchors.some((id) => !checkpoints.some((c) => c.checkpoint_id === id))
  )
    errors.push(
      "Cần đúng một neo cho từng checkpoint của giải, không dùng checkpoint giải khác.",
    );
  return {
    errors,
    distance,
    gap,
    anchors: new Set(anchors).size,
    invalidPoints,
  };
}
export function checkpointErrors(d: CheckpointDraft) {
  return {
    latitude:
      Number.isFinite(d.latitude) && Math.abs(d.latitude) <= 90
        ? ""
        : "Vĩ độ phải là số từ −90 đến 90.",
    longitude:
      Number.isFinite(d.longitude) && Math.abs(d.longitude) <= 180
        ? ""
        : "Kinh độ phải là số từ −180 đến 180.",
    radius_m:
      Number.isFinite(d.radius_m) && d.radius_m > 0
        ? ""
        : "Bán kính phải lớn hơn 0 m.",
  };
}
export const routePayload = (points: RoutePoint[]) => ({
  points: points.map((p) => ({
    latitude: p.latitude,
    longitude: p.longitude,
    checkpoint_id: p.checkpoint_id,
  })),
});
export const checkpointPayload = (
  draft: CheckpointDraft,
  original: BackendCheckpoint,
) =>
  Object.fromEntries(
    (Object.keys(draft) as (keyof CheckpointDraft)[])
      .filter((k) => draft[k] !== original[k])
      .map((k) => [k, draft[k]]),
  );
export async function readMap(raceId: string, signal?: AbortSignal) {
  const base = `/races/${encodeURIComponent(raceId)}`;
  const [route, dashboard] = await Promise.all([
    request<BackendRoute & { race_id: string }>(`${base}/route`, { signal }),
    request<DashboardDto>(`${base}/dashboard`, { signal }),
  ]);
  if (
    route.race_id !== raceId ||
    dashboard.race.race_id !== raceId ||
    !dashboard.checkpoints
  )
    throw new RequestError(
      0,
      "Thiếu metadata hoặc dữ liệu không thuộc giải đang chọn.",
    );
  return { route, dashboard, checkpoints: dashboard.checkpoints };
}
export type MapData = Awaited<ReturnType<typeof readMap>>;
export const fingerprint = (data: MapData) =>
  JSON.stringify([
    data.dashboard.race.config_version,
    data.route.points,
    data.checkpoints,
  ]);
export const mapEditorService = {
  read: readMap,
  patch: (id: string, body: Partial<CheckpointDraft>, signal?: AbortSignal) =>
    request(`/checkpoints/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body,
      signal,
    }),
  put: (id: string, points: RoutePoint[], signal?: AbortSignal) =>
    request(`/races/${encodeURIComponent(id)}/route`, {
      method: "PUT",
      body: routePayload(points),
      signal,
    }),
};
export function mapFailure(error: RequestError) {
  if (["ROUTE_LOCKED", "CHECKPOINT_LOCKED"].includes(error.code ?? ""))
    return lockedMessage;
  const messages: Record<string, string> = {
    ROUTE_NOT_CLOSED: "Tuyến chưa khép kín trong 2 m.",
    ROUTE_LENGTH_OUT_OF_RANGE: "Tuyến sau thay đổi phải dài 400–450 m.",
    DUPLICATE_ROUTE_CHECKPOINT: "Neo checkpoint bị lặp.",
    ROUTE_CHECKPOINT_MISMATCH: "Tuyến thiếu hoặc thừa neo checkpoint.",
    CHECKPOINT_RACE_MISMATCH: "Neo không thuộc giải này.",
  };
  return (
    (messages[error.code ?? ""] ?? error.message) +
    " " +
    Object.values(error.fields ?? {}).join("; ")
  );
}
