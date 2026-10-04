import { dataMode } from "../../services";
import { validPosition } from "../../services/apiAdapter";
import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";
import { LocateFixed, Layers, Maximize2 } from "lucide-react";
import type { LiveSnapshot, RunSession } from "../../types/domain";
import { Panel } from "../../components/ui";
import { distance, time, statusLabels } from "../../utils/format";
import { Link } from "react-router-dom";
function MapActions({
  route,
  selected,
  fitRequest,
}: {
  route: [number, number][];
  selected: RunSession | undefined;
  fitRequest: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (route.length)
      map.fitBounds(latLngBounds(route), { padding: [45, 45], maxZoom: 17 });
    // Refit on first position / explicit action, not on every GPS point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, route.length, fitRequest]);
  const id = selected?.student_id;
  useEffect(() => {
    if (selected?.last_latitude != null && selected.last_longitude != null)
      map.flyTo([selected.last_latitude, selected.last_longitude], 17, {
        duration: 0.7,
      });
    // Selection changes recenter the map. Live position updates preserve the viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, map]);
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
  const [showRunners, setShowRunners] = useState(true),
    [showCheckpoints, setShowCheckpoints] = useState(true),
    [layers, setLayers] = useState(false),
    [fit, setFit] = useState(0),
    [tileError, setTileError] = useState(false);
  const runners = snapshot.runners.filter(
      (r) =>
        r.status === "ACTIVE" &&
        r.connection === "ONLINE" &&
        r.last_latitude != null &&
        r.last_longitude != null &&
        validPosition(r.last_latitude, r.last_longitude),
    ),
    selected = snapshot.runners.find((r) => r.student_id === selectedId);
  const moving = dataMode === "api" ? runners : runners.slice(0, 8);
  return (
    <Panel
      title="Bản đồ trực tiếp"
      subtitle="Theo dõi từng bước chân trên hành trình"
      className="map-panel"
      action={
        <span className="live-label">
          <i />
          {snapshot.running ? "ĐANG CẬP NHẬT" : "ĐÃ TẠM DỪNG"}
        </span>
      }
    >
      <div className="map-wrap">
        <MapContainer
          center={[21.0011, 105.8441]}
          zoom={16}
          scrollWheelZoom={false}
          className="leaflet-map"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            eventHandlers={{ tileerror: () => setTileError(true) }}
          />
          <Polyline
            positions={snapshot.route}
            pathOptions={{ color: "#fff", weight: 10, opacity: 0.95 }}
          />
          <Polyline
            positions={snapshot.route}
            pathOptions={{
              color: "#3778f6",
              weight: 5,
              opacity: 0.95,
              dashArray: "10 7",
            }}
          />
          {showCheckpoints &&
            snapshot.checkpoints
              .filter((c) => validPosition(c.latitude, c.longitude))
              .map((c) => (
                <Marker
                  key={c.checkpoint_id}
                  title={`${c.code} · ${c.name}`}
                  position={[c.latitude, c.longitude]}
                  icon={divIcon({
                    className: "checkpoint-marker",
                    html: `<span>${c.order === 1 ? "⚑" : c.order}</span>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15],
                  })}
                >
                  <Popup>
                    <strong>
                      {c.code} · {c.name}
                    </strong>
                    <p>{c.device}</p>
                  </Popup>
                </Marker>
              ))}
          {showRunners &&
            moving.map((r) => (
              <Marker
                key={r.run_id || r.student_id}
                title={`Bib ${r.bib} · ${r.full_name}`}
                position={[r.last_latitude!, r.last_longitude!]}
                eventHandlers={{ click: () => onSelect(r.student_id) }}
                icon={divIcon({
                  className: `runner-marker ${r.student_id === selectedId ? "selected" : ""}`,
                  html: `<span style="background:${r.color}">${r.bib.replace(/[<>&"']/g, "")}</span>`,
                  iconSize: [38, 38],
                  iconAnchor: [19, 19],
                })}
              >
                <Popup>
                  <strong>
                    #{r.bib} · {r.full_name}
                  </strong>
                  <p>
                    {statusLabels[r.status]} · {distance(r.distance_total_m)}
                  </p>
                  <Link to={`/runners/${r.student_id}/runs/${r.run_id}`}>
                    Xem phiên chạy →
                  </Link>
                </Popup>
              </Marker>
            ))}
          {showRunners &&
            selected &&
            !moving.some((r) => r.student_id === selectedId) &&
            selected.last_latitude != null &&
            selected.last_longitude != null &&
            validPosition(selected.last_latitude, selected.last_longitude) && (
              <Marker
                title={`Bib ${selected.bib} · ${selected.full_name}`}
                position={[selected.last_latitude, selected.last_longitude]}
                icon={divIcon({
                  className: "runner-marker selected",
                  html: `<span style="background:${selected.color}">${selected.bib.replace(/[<>&"']/g, "")}</span>`,
                  iconSize: [38, 38],
                })}
              >
                <Popup>{selected.full_name}</Popup>
              </Marker>
            )}
          <MapActions
            route={
              snapshot.route.length
                ? snapshot.route
                : runners.map(
                    (r) =>
                      [r.last_latitude!, r.last_longitude!] as [number, number],
                  )
            }
            selected={selected}
            fitRequest={fit}
          />
        </MapContainer>
        <div className="map-caption">
          <span className="route-dot" />{" "}
          {dataMode === "api"
            ? "Chưa có geometry tuyến từ backend"
            : "Tuyến minh họa · 1 km / vòng"}
        </div>
        <div className="map-buttons">
          <button
            className="icon-button"
            title="Về toàn tuyến"
            aria-label="Về toàn tuyến"
            onClick={() => setFit((f) => f + 1)}
          >
            <LocateFixed size={18} />
          </button>
          <button
            className="icon-button"
            title="Lớp bản đồ"
            aria-label="Lớp bản đồ"
            aria-expanded={layers}
            onClick={() => setLayers(!layers)}
          >
            <Layers size={18} />
          </button>
          <Link
            className="icon-button"
            to="/live"
            title="Mở bản đồ"
            aria-label="Mở bản đồ"
          >
            <Maximize2 size={17} />
          </Link>
        </div>
        {layers && (
          <div className="layer-menu">
            <strong>Lớp hiển thị</strong>
            <label>
              <input
                type="checkbox"
                checked={showRunners}
                onChange={(e) => setShowRunners(e.target.checked)}
              />{" "}
              Sinh viên
            </label>
            <label>
              <input
                type="checkbox"
                checked={showCheckpoints}
                onChange={(e) => setShowCheckpoints(e.target.checked)}
              />{" "}
              Checkpoint
            </label>
          </div>
        )}
        {tileError && (
          <div role="status" className="map-warning">
            Không tải được một số ô bản đồ nền. Tuyến, vị trí và số liệu vẫn
            hoạt động.
          </div>
        )}
      </div>
      <div className="map-footer">
        <div>
          <span className="legend-route" /> Tuyến chạy{" "}
          <span className="legend-checkpoint" /> Checkpoint{" "}
          <span className="legend-runner" /> Sinh viên (bib)
        </div>
        <span>Cập nhật {time(snapshot.updated_at)}</span>
      </div>
    </Panel>
  );
}
