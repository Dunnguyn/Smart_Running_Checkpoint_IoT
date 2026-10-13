import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";
import { validPosition } from "../../services/contract";
import { hasRuns, routeAccess } from "../../services/mapEditorService";
import { dataMode } from "../../services";
import type { LiveSnapshot, RunSession } from "../../types/domain";
import { Panel } from "../../components/ui";
import { datetime, statusLabels, duration, distance } from "../../utils/format";
import { gpsLabel, sourceLabel } from "../../utils/labels";
import { GpsTimestamp } from "../../components/GpsTimestamp";
import { IconAction } from "../../components/IconAction";
import { Scan, LocateFixed } from "lucide-react";
import { MapEditor } from "./MapEditor";
function MapActions({
  positions,
  selected,
  follow,
  stop,
  fit,
}: {
  positions: [number, number][];
  selected?: RunSession;
  follow: boolean;
  stop: () => void;
  fit: number;
}) {
  const map = useMap(),
    fitted = useRef(-1);
  useMapEvents({
    dragstart: stop,
    zoomstart: () => {
      /* Explicit zoom preserves the follow choice. */
    },
  });
  useEffect(() => {
    if (positions.length && fitted.current !== fit) {
      map.fitBounds(latLngBounds(positions), {
        padding: [45, 45],
        maxZoom: 19,
      });
      fitted.current = fit;
    }
  }, [positions, fit, map]);
  useEffect(() => {
    if (
      follow &&
      selected &&
      validPosition(selected.last_latitude, selected.last_longitude)
    )
      map.panTo([selected.last_latitude!, selected.last_longitude!]);
  }, [follow, selected, map]);
  return null;
}
export function LiveMap({
  snapshot,
  selectedId,
  onSelect,
}: {
  snapshot: LiveSnapshot;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [fit, setFit] = useState(0),
    [all, setAll] = useState(false),
    [follow, setFollow] = useState(false),
    [tileError, setTileError] = useState(false),
    [menu, setMenu] = useState(false);
  const [showRunners, setShowRunners] = useState(true);
  const [showCheckpoints, setShowCheckpoints] = useState(true);
  const edit = params.get("edit"),
    cpId = params.get("checkpoint");
  const access = routeAccess(
    snapshot.dashboard?.race,
    hasRuns(snapshot.dashboard),
  );
  const locked = access.blocked;
  const runners = snapshot.runners.filter((r) =>
    validPosition(r.last_latitude, r.last_longitude),
  );
  const selected = snapshot.runners.find((r) => r.student_id === selectedId);
  const groups = new Map<string, RunSession[]>();
  for (const r of runners) {
    const key = `${r.last_latitude!.toFixed(5)},${r.last_longitude!.toFixed(5)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const markerPositions: [number, number][] = [
    ...snapshot.checkpoints
      .filter((c) => validPosition(c.latitude, c.longitude))
      .map((c) => [c.latitude!, c.longitude!] as [number, number]),
    ...runners.map(
      (r) => [r.last_latitude!, r.last_longitude!] as [number, number],
    ),
  ];
  function open(mode: string, id?: string) {
    setMenu(false);
    setFollow(false);
    const p = new URLSearchParams(params);
    p.set("edit", mode);
    if (id) p.set("checkpoint", id);
    else p.delete("checkpoint");
    setParams(p);
  }
  if ((edit === "route" || edit === "checkpoint") && dataMode === "api")
    return (
      <MapEditor
        key={`${snapshot.dashboard?.race.race_id}:${edit}:${cpId ?? ""}`}
        mode={edit}
        checkpointId={cpId ?? undefined}
        onClose={() => {
          const p = new URLSearchParams(params);
          p.delete("edit");
          p.delete("checkpoint");
          setParams(p);
        }}
      />
    );
  return (
    <Panel
      title="Bản đồ giải chạy"
      subtitle="Chọn một người chạy để xem vị trí và kết quả."
      className="map-panel"
      action={
        location.pathname !== "/live" && (
          <Link className="text-link" to="/live">
            Mở rộng bản đồ →
          </Link>
        )
      }
    >
      <div className="map-toolbar">
        <div
          className="map-view-actions"
          role="group"
          aria-label="Điều khiển khung nhìn"
        >
          <IconAction
            label="Xem toàn tuyến"
            onClick={() => {
              setFollow(false);
              setAll(false);
              setFit((n) => n + 1);
            }}
          >
            <Scan size={18} />
          </IconAction>
          <IconAction
            label="Xem tất cả vị trí"
            onClick={() => {
              setFollow(false);
              setAll(true);
              setFit((n) => n + 1);
            }}
          >
            <LocateFixed size={18} />
          </IconAction>
          <button
            className="button"
            disabled={
              !selected ||
              !validPosition(selected.last_latitude, selected.last_longitude)
            }
            aria-pressed={follow}
            onClick={() => setFollow(!follow)}
          >
            {follow ? "Dừng theo dõi" : "Theo dõi người chạy"}
          </button>
        </div>
        {dataMode === "api" && (
          <button
            className="button"
            disabled={locked}
            title={locked ? access.reason : undefined}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            Chỉnh sửa bản đồ
          </button>
        )}
        <details className="map-layers">
          <summary>Lớp bản đồ</summary>
          <label>
            <input
              type="checkbox"
              checked={showRunners}
              onChange={(e) => setShowRunners(e.target.checked)}
            />{" "}
            Người chạy
          </label>
          <label>
            <input
              type="checkbox"
              checked={showCheckpoints}
              onChange={(e) => setShowCheckpoints(e.target.checked)}
            />{" "}
            Checkpoint
          </label>
        </details>
      </div>
      {menu && !locked && (
        <div className="map-toolbar">
          <button
            className="button"
            disabled={!snapshot.checkpoints.length}
            onClick={() => open("checkpoint")}
          >
            Chỉnh vị trí checkpoint
          </button>
          <button className="button" onClick={() => open("route")}>
            Chỉnh tuyến chạy
          </button>
          <small>Trạng thái khóa sẽ được backend kiểm tra khi lưu.</small>
        </div>
      )}
      {locked && <p className="map-note">{access.reason}</p>}
      <div className="map-wrap">
        <MapContainer
          key={
            snapshot.dashboard?.race.race_id ?? snapshot.overview?.race.race_id
          }
          center={[0, 0]}
          zoom={2}
          scrollWheelZoom
          className="leaflet-map"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            eventHandlers={{ tileerror: () => setTileError(true) }}
          />
          {!!snapshot.route.length && (
            <Polyline
              positions={snapshot.route}
              pathOptions={{ color: "#2563eb", weight: 5 }}
            />
          )}
          {showCheckpoints &&
            snapshot.checkpoints
              .filter((c) => validPosition(c.latitude, c.longitude))
              .map((c) => (
                <Marker
                  key={c.checkpoint_id}
                  title={`${c.code} · ${c.name}`}
                  position={[c.latitude!, c.longitude!]}
                  draggable={false}
                  icon={divIcon({
                    className: "checkpoint-marker",
                    html: `<span>${c.code.replace(/[<>&"']/g, "")}</span>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                  })}
                >
                  <Popup>
                    <strong>
                      {c.code} · {c.name}
                    </strong>
                    <p>
                      {c.type === "START_FINISH"
                        ? "Điểm tính vòng"
                        : "Điểm trung gian"}{" "}
                      · {c.radius_m ?? "—"} m
                    </p>
                    <button
                      className="button"
                      disabled={locked}
                      title={locked ? access.reason : undefined}
                      onClick={() => open("checkpoint", c.checkpoint_id)}
                    >
                      Chỉnh vị trí
                    </button>
                  </Popup>
                </Marker>
              ))}
          {showRunners &&
            [...groups].map(([key, group]) => {
              const r = group[0],
                chosen = group.some((x) => x.student_id === selectedId);
              return (
                <Marker
                  key={key}
                  zIndexOffset={chosen ? 1000 : 0}
                  title={
                    group.length > 1
                      ? `${group.length} người tại vị trí này`
                      : `Bib ${r.bib} · ${r.full_name}`
                  }
                  position={[r.last_latitude!, r.last_longitude!]}
                  draggable={false}
                  eventHandlers={{
                    click: () => {
                      if (group.length === 1) onSelect(r.student_id);
                    },
                  }}
                  icon={divIcon({
                    className: `runner-marker ${chosen ? "selected" : ""} ${r.connection === "STALE" ? "stale-marker" : ""}`,
                    html: `<span style="background:${group.length > 1 ? "#334155" : r.color}">${group.length > 1 ? `×${group.length}` : r.bib.replace(/[<>&"']/g, "")}</span>`,
                    iconSize: [38, 38],
                    iconAnchor: [19, 19],
                  })}
                >
                  <Popup>
                    <strong>
                      {group.length > 1
                        ? `${group.length} người cùng vị trí (× là số lượng)`
                        : r.full_name}
                    </strong>
                    <div className="cluster-list">
                      {group.map((x) => (
                        <div key={x.student_id}>
                          <button
                            className="text-link"
                            onClick={() => onSelect(x.student_id)}
                          >
                            #{x.bib} · {x.full_name}
                          </button>
                          <p>
                            {statusLabels[x.status]} · {gpsLabel(x.connection)}
                          </p>
                          <small>{datetime(x.last_seen_at)}</small>
                          <Link
                            className="text-link"
                            to={`/runners/${x.student_id}/runs/${x.run_id}`}
                          >
                            Chi tiết phiên →
                          </Link>
                        </div>
                      ))}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          <MapActions
            positions={
              !all && snapshot.route.length ? snapshot.route : markerPositions
            }
            selected={selected}
            follow={follow}
            stop={() => setFollow(false)}
            fit={fit}
          />
        </MapContainer>
        {tileError && (
          <p className="map-warning" role="status">
            Không tải được nền bản đồ. Vị trí và tuyến vẫn hiển thị.
          </p>
        )}
      </div>
      <div className="map-legend" aria-label="Chú giải bản đồ">
        <span>
          <i className="legend-route" />
          Tuyến đã lưu
        </span>
        <span>
          <i className="legend-checkpoint" />
          Trạm
        </span>
        <span>
          <i className="legend-runner" />
          Người chạy · số báo danh
        </span>
        <span>×: số người cùng vị trí</span>
      </div>
      <p className="map-note">
        {snapshot.route.length
          ? `Tuyến đã lưu · ${snapshot.routeDistance_m ?? "—"} m`
          : snapshot.routeMessage?.includes("không hợp lệ")
            ? snapshot.routeMessage
            : "Giải này chưa có tuyến được lưu. Bản đồ đang hiển thị vị trí GPS hiện có."}{" "}
        {follow ? "Đang theo dõi; kéo bản đồ để dừng." : ""}
      </p>
      {selected && (
        <section className="selected-runner" aria-label="Người chạy đang chọn">
          <div>
            <strong>
              #{selected.bib} · {selected.full_name}
            </strong>
            <small>
              {statusLabels[selected.status]} · {sourceLabel(selected.source)}
            </small>
          </div>
          <div>
            <small>Số vòng</small>
            <strong>
              {selected.lap_count}/{selected.total_laps}
            </strong>
          </div>
          <div>
            <small>Thời gian ghi nhận</small>
            <strong>{duration(selected.duration_total_s)}</strong>
          </div>
          <div>
            <small>Quãng đường</small>
            <strong>{distance(selected.distance_total_m)}</strong>
          </div>
          <div>
            <small>Vị trí GPS</small>
            <small>
              <GpsTimestamp
                value={selected.last_seen_at}
                completed={selected.status === "COMPLETED"}
              />
            </small>
          </div>
          <Link
            className="text-link"
            to={`/runners/${selected.student_id}/runs/${selected.run_id}`}
          >
            Xem chi tiết →
          </Link>
        </section>
      )}
    </Panel>
  );
}
