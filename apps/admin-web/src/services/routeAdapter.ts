import type { LiveSnapshot } from "../types/domain";
import type { BackendRoute, BackendCheckpoint } from "./contract";
import { validPosition } from "./contract";

// Leaflet takes [latitude, longitude]. Never substitute checkpoint geometry
// for a saved route or drop a bad vertex and bridge the resulting gap.
export function mapGeometry(
  raceId: string,
  route?: BackendRoute,
  checkpoints?: BackendCheckpoint[],
): Pick<
  LiveSnapshot,
  "route" | "checkpoints" | "routeDistance_m" | "routeMessage"
> {
  const valid = route?.points.every((p) =>
    validPosition(p.latitude, p.longitude),
  );
  return {
    route: valid
      ? [...route!.points]
          .sort((a, b) => a.sequence_no - b.sequence_no)
          .map((p) => [p.latitude, p.longitude])
      : [],
    routeDistance_m: valid ? route!.distance_m : undefined,
    routeMessage: !route
      ? "Chưa được backend hỗ trợ: dữ liệu tuyến"
      : !valid
        ? "Tuyến backend có tọa độ không hợp lệ; không thể vẽ tuyến."
        : !route.points.length
          ? "Giải chạy chưa có tuyến được lưu."
          : undefined,
    checkpoints: (checkpoints ?? []).map((c) => ({
      checkpoint_id: c.checkpoint_id,
      race_id: raceId,
      code: c.code,
      name: c.name,
      order: c.sequence_no,
      type: c.kind === "LAP" ? "START_FINISH" : "INTERMEDIATE",
      device: "Chưa được backend hỗ trợ: danh sách / trạng thái thiết bị",
      latitude: c.latitude,
      longitude: c.longitude,
      radius_m: c.radius_m,
    })),
  };
}
