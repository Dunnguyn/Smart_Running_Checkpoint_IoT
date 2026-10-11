import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  Polyline,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";
import { useLive } from "../../app/LiveProvider";
import { validPosition } from "../../services/contract";
import { RequestError } from "../../services/client";
import {
  mapEditorService,
  readMap,
  hasRuns,
  routeAccess,
  routeLimits,
  lockedMessage,
  fingerprint,
  validateRoute,
  checkpointErrors,
  checkpointPayload,
  routePayload,
  mapFailure,
  type RoutePoint,
  type MapData,
  type CheckpointDraft,
} from "../../services/mapEditorService";

function Tools({
  pick,
  onPick,
  points,
  fit,
}: {
  pick: boolean;
  onPick: (lat: number, lng: number) => void;
  points: [number, number][];
  fit: number;
}) {
  const map = useMap();
  const last = useRef(-1);
  useMapEvents({
    click: (e) => {
      if (pick) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  useEffect(() => {
    if (fit !== last.current && points.length) {
      map.fitBounds(latLngBounds(points), { padding: [40, 40], maxZoom: 18 });
      last.current = fit;
    }
  }, [fit, points, map]);
  return null;
}
export function MapEditor({
  mode,
  checkpointId,
  onClose,
}: {
  mode: "route" | "checkpoint";
  checkpointId?: string;
  onClose: () => void;
}) {
  const { raceId, snapshot, setDirty, refreshData } = useLive();
  const [base, setBase] = useState<MapData | null>(null),
    [points, setPoints] = useState<RoutePoint[]>([]);
  const [cpId, setCpId] = useState(checkpointId ?? ""),
    [draft, setDraft] = useState({ latitude: "", longitude: "", radius_m: "" });
  const [history, setHistory] = useState<RoutePoint[][]>([]),
    [selected, setSelected] = useState(0),
    [pick, setPick] = useState(false),
    [fit, setFit] = useState(0);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [conflict, setConflict] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [reload, setReload] = useState(0),
    [tileError, setTileError] = useState(false);
  const controller = useRef<AbortController | null>(null),
    mounted = useRef(true),
    guard = useRef(false);
  const cp = base?.checkpoints.find((c) => c.checkpoint_id === cpId);
  const numeric: CheckpointDraft = {
    latitude: draft.latitude.trim() ? Number(draft.latitude) : NaN,
    longitude: draft.longitude.trim() ? Number(draft.longitude) : NaN,
    radius_m: draft.radius_m.trim() ? Number(draft.radius_m) : NaN,
  };
  const cpErrors = checkpointErrors(numeric);
  const dirty =
    !!base &&
    (mode === "route"
      ? JSON.stringify(routePayload(points)) !==
        JSON.stringify(routePayload(base.route.points))
      : !!cp &&
        (draft.latitude !== (cp.latitude == null ? "" : String(cp.latitude)) ||
          draft.longitude !==
            (cp.longitude == null ? "" : String(cp.longitude)) ||
          draft.radius_m !== String(cp.radius_m)));
  const access = routeAccess(base?.route, hasRuns(base?.dashboard));
  const latestAccess = routeAccess(
    snapshot?.dashboard?.race,
    hasRuns(snapshot?.dashboard),
  );
  const blocked = locked || access.blocked || latestAccess.blocked;
  const changedOnServer =
    conflict ||
    (!!base &&
      snapshot?.dashboard?.race.race_id === raceId &&
      snapshot.dashboard.race.config_version >
        base.dashboard.race.config_version);
  const validation = validateRoute(
    points,
    base?.checkpoints ?? [],
    base?.route,
  );
  const saveProblems = blocked
    ? [
        locked
          ? lockedMessage
          : access.blocked
            ? access.reason
            : latestAccess.reason,
      ]
    : changedOnServer
      ? ["Dữ liệu trên server đã thay đổi. Tải lại và kiểm tra trước khi lưu."]
      : !dirty
        ? ["Chưa có thay đổi để lưu."]
        : mode === "route"
          ? validation.errors
          : !cp
            ? ["Chọn checkpoint cần chỉnh sửa."]
            : Object.values(cpErrors).filter(Boolean);
  function install(data: MapData, id = cpId) {
    setBase(data);
    setPoints(
      [...data.route.points]
        .sort((a, b) => a.sequence_no - b.sequence_no)
        .map(({ latitude, longitude, checkpoint_id }) => ({
          latitude,
          longitude,
          checkpoint_id,
        })),
    );
    setHistory([]);
    const c =
      data.checkpoints.find((c) => c.checkpoint_id === id) ??
      data.checkpoints[0];
    setCpId(c?.checkpoint_id ?? "");
    setDraft({
      latitude: c?.latitude == null ? "" : String(c.latitude),
      longitude: c?.longitude == null ? "" : String(c.longitude),
      radius_m: c ? String(c.radius_m) : "",
    });
    setConflict(false);
    setUncertain(false);
    setPick(false);
  }
  useEffect(() => {
    setDirty(dirty || busy);
    return () => setDirty(false);
  }, [dirty, busy, setDirty]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setError("");
    readMap(raceId, c.signal)
      .then((data) => {
        if (!c.signal.aborted) install(data, checkpointId);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
    // A server refresh must never replace an active draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceId, reload, checkpointId]);
  function update(next: RoutePoint[]) {
    setHistory((h) => [...h.slice(-49), points.map((p) => ({ ...p }))]);
    setPoints(next);
    setMessage("");
  }
  function move(index: number, latitude: number, longitude: number) {
    update(
      points.map((p, i) => (i === index ? { ...p, latitude, longitude } : p)),
    );
  }
  function focusInvalidPoint(index: number) {
    setSelected(index);
    setPick(false);
    requestAnimationFrame(() =>
      document.getElementById("route-point-latitude")?.focus(),
    );
  }
  function choose(lat: number, lng: number) {
    if (blocked || busy) return;
    if (mode === "checkpoint") {
      setDraft((d) => ({
        ...d,
        latitude: String(lat),
        longitude: String(lng),
      }));
      setPick(false);
    } else if (validation.invalidPoints.length) {
      focusInvalidPoint(validation.invalidPoints[0]);
    } else if (points.length < 500) {
      const index = points.length ? selected + 1 : 0;
      update([
        ...points.slice(0, index),
        { latitude: lat, longitude: lng, checkpoint_id: null },
        ...points.slice(index),
      ]);
      setSelected(index);
    }
  }
  function matches(data: MapData) {
    if (mode === "route")
      return (
        JSON.stringify(routePayload(data.route.points)) ===
        JSON.stringify(routePayload(points))
      );
    const c = data.checkpoints.find((c) => c.checkpoint_id === cpId);
    return (
      !!c &&
      c.latitude === numeric.latitude &&
      c.longitude === numeric.longitude &&
      c.radius_m === numeric.radius_m
    );
  }
  function accepted(data: MapData) {
    setError("");
    install(data);
    setDirty(false);
    refreshData();
    setMessage(
      mode === "route" ? "Đã cập nhật tuyến chạy" : "Đã cập nhật checkpoint",
    );
  }
  async function save() {
    if (
      !base ||
      guard.current ||
      blocked ||
      changedOnServer ||
      !dirty ||
      (mode === "route"
        ? validation.errors.length
        : Object.values(cpErrors).some(Boolean) || !cp)
    )
      return;
    guard.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    controller.current = new AbortController();
    const signal = controller.current.signal;
    let sent = false;
    try {
      const current = await readMap(raceId, signal);
      if (signal.aborted) return;
      if (routeAccess(current.route, hasRuns(current.dashboard)).blocked) {
        setLocked(true);
        setError(lockedMessage + " Thay đổi chưa được lưu.");
        return;
      }
      if (uncertain) {
        setUncertain(false);
        if (matches(current)) {
          accepted(current);
          return;
        }
        setError(
          "Đã đọc lại: dữ liệu server chưa trùng draft. Kiểm tra rồi nhấn Lưu nếu vẫn muốn gửi.",
        );
        return;
      }
      if (fingerprint(current) !== fingerprint(base)) {
        setConflict(true);
        setError(
          "Dữ liệu server đã thay đổi. Tải lại để xem phiên bản mới; draft chưa được lưu.",
        );
        return;
      }
      sent = true;
      if (mode === "route") await mapEditorService.put(raceId, points, signal);
      else
        await mapEditorService.patch(
          cpId,
          checkpointPayload(numeric, cp!),
          signal,
        );
      const saved = await readMap(raceId, signal);
      if (!signal.aborted) {
        if (matches(saved)) accepted(saved);
        else {
          setConflict(true);
          setError(
            "Server đã nhận thao tác nhưng dữ liệu đọc lại khác draft. Tải lại để kiểm tra; không tự ghi đè.",
          );
          refreshData();
        }
      }
    } catch (e) {
      if (!mounted.current || signal.aborted) return;
      const failure = e as RequestError;
      if (["ROUTE_LOCKED", "CHECKPOINT_LOCKED"].includes(failure.code ?? ""))
        setLocked(true);
      setError(mapFailure(failure));
      if (failure.status === 409) {
        setConflict(true);
        refreshData();
      }
      if (sent && (failure.status === 0 || failure.status >= 500)) {
        setUncertain(true);
        try {
          const current = await readMap(raceId, signal);
          if (signal.aborted) return;
          setUncertain(false);
          if (matches(current)) accepted(current);
          else {
            if (fingerprint(current) !== fingerprint(base)) setConflict(true);
            setError(
              "Kết quả gửi chưa rõ; đã đọc lại server và chưa thấy dữ liệu trùng draft. Kiểm tra trước khi thử lại.",
            );
          }
        } catch {
          if (!signal.aborted)
            setError(
              "Chưa xác minh được kết quả lưu. Lần tiếp theo chỉ đọc lại server trước khi cho gửi lại.",
            );
        }
      }
    } finally {
      guard.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const preview = mode === "route" ? points : (base?.route.points ?? []);
  const bounds: [number, number][] = preview
    .filter((p) => validPosition(p.latitude, p.longitude))
    .map((p) => [p.latitude, p.longitude]);
  if (!bounds.length)
    for (const c of base?.checkpoints ?? [])
      if (validPosition(c.latitude, c.longitude))
        bounds.push([c.latitude!, c.longitude!]);
  const numberText = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "—");
  return (
    <section className="panel map-editor" aria-label="Chỉnh sửa bản đồ">
      <div className="panel-heading">
        <div>
          <h2>
            {mode === "route" ? "Chỉnh tuyến chạy" : "Chỉnh vị trí checkpoint"}
          </h2>
          <p>
            {dirty
              ? "Đang chỉnh sửa — chưa lưu"
              : "Bản nháp riêng • chỉ lưu khi bạn xác nhận"}
          </p>
        </div>
        <button className="button" disabled={busy} onClick={onClose}>
          Đóng editor
        </button>
      </div>
      {blocked && (
        <p className="editor-alert" role="alert">
          {lockedMessage} Draft chưa lưu có thể xem/copy; không thể gửi.
        </p>
      )}
      {changedOnServer && (
        <p className="editor-alert">
          Dữ liệu server đã thay đổi, draft vẫn được giữ.{" "}
          <button
            className="button"
            disabled={busy}
            onClick={() => {
              if (!dirty || confirm("Tải lại và bỏ draft chưa lưu?"))
                setReload((n) => n + 1);
            }}
          >
            Tải lại và bỏ draft
          </button>
        </p>
      )}
      {error && (
        <p className="editor-alert" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success-message">
          {message}
        </p>
      )}
      {!base ? (
        <div className="empty">
          <p>Đang tải tuyến và checkpoint…</p>
          <button className="button" onClick={() => setReload((n) => n + 1)}>
            Thử lại
          </button>
        </div>
      ) : (
        <>
          <div className="editor-grid">
            <div className="editor-map">
              <MapContainer
                center={bounds[0] ?? [0, 0]}
                zoom={bounds.length ? 17 : 2}
                className="leaflet-map"
                scrollWheelZoom
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap"
                  eventHandlers={{ tileerror: () => setTileError(true) }}
                />
                <Tools
                  points={bounds}
                  fit={fit}
                  pick={pick && !blocked && !busy}
                  onPick={choose}
                />
                {!!preview.length && (
                  <Polyline
                    positions={preview
                      .filter((p) => validPosition(p.latitude, p.longitude))
                      .map((p) => [p.latitude, p.longitude])}
                    pathOptions={{ color: "#2563eb" }}
                  />
                )}
                {mode === "route" &&
                  points.map(
                    (p, i) =>
                      validPosition(p.latitude, p.longitude) && (
                        <Marker
                          key={i}
                          position={[p.latitude, p.longitude]}
                          draggable={!blocked && !busy}
                          title={`Điểm ${i + 1}${p.checkpoint_id ? " · Neo checkpoint" : ""}`}
                          icon={divIcon({
                            className: `vertex-marker ${p.checkpoint_id ? "anchor" : ""} ${i === selected ? "selected" : ""}`,
                            html: `<span>${i === 0 ? "Đ" : i === points.length - 1 ? "C" : i + 1}${p.checkpoint_id ? "⚑" : ""}</span>`,
                            iconSize: [30, 30],
                          })}
                          eventHandlers={{
                            click: () => setSelected(i),
                            dragend: (e) => {
                              const ll = e.target.getLatLng();
                              move(i, ll.lat, ll.lng);
                            },
                          }}
                        >
                          <Popup>
                            {i === 0
                              ? "Bắt đầu · "
                              : i === points.length - 1
                                ? "Kết thúc · "
                                : ""}
                            {base.checkpoints.find(
                              (c) => c.checkpoint_id === p.checkpoint_id,
                            )?.name ?? `Điểm ${i + 1}`}
                          </Popup>
                        </Marker>
                      ),
                  )}
                {mode === "checkpoint" &&
                  validPosition(numeric.latitude, numeric.longitude) && (
                    <>
                      <Marker
                        title="Checkpoint đang chỉnh"
                        position={[numeric.latitude, numeric.longitude]}
                        draggable={!blocked && !busy}
                        icon={divIcon({
                          className: "checkpoint-marker",
                          html: "<span>⚑</span>",
                          iconSize: [32, 32],
                        })}
                        eventHandlers={{
                          dragend: (e) => {
                            const ll = e.target.getLatLng();
                            setDraft((d) => ({
                              ...d,
                              latitude: String(ll.lat),
                              longitude: String(ll.lng),
                            }));
                          },
                        }}
                      />
                      {!cpErrors.radius_m && (
                        <Circle
                          center={[numeric.latitude, numeric.longitude]}
                          radius={numeric.radius_m}
                          pathOptions={{ color: "#2563eb" }}
                        />
                      )}
                    </>
                  )}
                {snapshot?.runners
                  .filter((r) =>
                    validPosition(r.last_latitude, r.last_longitude),
                  )
                  .map((r) => (
                    <Marker
                      key={r.student_id}
                      position={[r.last_latitude!, r.last_longitude!]}
                      draggable={false}
                      title={`Runner ${r.bib} · chỉ xem`}
                      icon={divIcon({
                        className: "runner-marker",
                        html: `<span style="background:${r.color}">${r.bib.replace(/[<>&"']/g, "")}</span>`,
                        iconSize: [30, 30],
                      })}
                    />
                  ))}
              </MapContainer>
              {tileError && (
                <p className="map-warning" role="status">
                  Không tải được nền bản đồ. Draft và tọa độ vẫn hoạt động.
                </p>
              )}
            </div>
            <div className="editor-fields">
              <button className="button" onClick={() => setFit((n) => n + 1)}>
                Xem toàn tuyến
              </button>
              <p>
                Không theo dõi runner hoặc tự đổi khung nhìn khi chỉnh sửa.
                Runner chỉ để xem.
              </p>
              <fieldset disabled={blocked || busy}>
                {mode === "checkpoint" ? (
                  <>
                    <label>
                      Checkpoint
                      <select
                        value={cpId}
                        onChange={(e) => {
                          if (
                            dirty &&
                            !confirm("Bỏ thay đổi checkpoint hiện tại?")
                          )
                            return;
                          install(base, e.target.value);
                        }}
                      >
                        {base.checkpoints.map((c) => (
                          <option key={c.checkpoint_id} value={c.checkpoint_id}>
                            {c.code} · {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(
                      [
                        ["latitude", "Vĩ độ"],
                        ["longitude", "Kinh độ"],
                        ["radius_m", "Bán kính (m)"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <input
                          type="number"
                          step="any"
                          value={draft[key]}
                          aria-invalid={!!cpErrors[key]}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [key]: e.target.value }))
                          }
                        />
                        {cpErrors[key] && (
                          <small className="field-error">{cpErrors[key]}</small>
                        )}
                      </label>
                    ))}
                    <button
                      className="button"
                      aria-pressed={pick}
                      onClick={() => setPick(!pick)}
                    >
                      {pick ? "Dừng chọn trên bản đồ" : "Chọn trên bản đồ"}
                    </button>
                    <p>
                      Kéo cờ, nhập tọa độ hoặc bật công cụ rồi bấm bản đồ. Bán
                      kính này không thay thế bán kính trong/ngoài của matching.
                    </p>
                  </>
                ) : (
                  <>
                    {!points.length && (
                      <p>
                        Chưa có tuyến. Bật thêm điểm và bấm bản đồ hoặc nhập tọa
                        độ để bắt đầu; gán đủ neo từ checkpoint của giải.
                      </p>
                    )}
                    <label>
                      Điểm / đoạn đang chọn
                      <select
                        value={Math.min(
                          selected,
                          Math.max(0, points.length - 1),
                        )}
                        onChange={(e) => setSelected(Number(e.target.value))}
                      >
                        {points.map((p, i) => (
                          <option key={i} value={i}>
                            {i + 1}
                            {i === 0
                              ? " · Bắt đầu"
                              : i === points.length - 1
                                ? " · Kết thúc"
                                : ""}
                            {p.checkpoint_id
                              ? ` · Neo ${base.checkpoints.find((c) => c.checkpoint_id === p.checkpoint_id)?.code ?? p.checkpoint_id}`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    {points[selected] && (
                      <>
                        <label>
                          Vĩ độ điểm
                          <input
                            id="route-point-latitude"
                            type="number"
                            step="any"
                            value={
                              Number.isFinite(points[selected].latitude)
                                ? points[selected].latitude
                                : ""
                            }
                            onChange={(e) =>
                              move(
                                selected,
                                e.target.value === ""
                                  ? NaN
                                  : Number(e.target.value),
                                points[selected].longitude,
                              )
                            }
                          />
                        </label>
                        <label>
                          Kinh độ điểm
                          <input
                            type="number"
                            step="any"
                            value={
                              Number.isFinite(points[selected].longitude)
                                ? points[selected].longitude
                                : ""
                            }
                            onChange={(e) =>
                              move(
                                selected,
                                points[selected].latitude,
                                e.target.value === ""
                                  ? NaN
                                  : Number(e.target.value),
                              )
                            }
                          />
                        </label>
                        <label>
                          Neo checkpoint
                          <select
                            value={points[selected].checkpoint_id ?? ""}
                            onChange={(e) =>
                              update(
                                points.map((p, i) =>
                                  i === selected
                                    ? {
                                        ...p,
                                        checkpoint_id: e.target.value || null,
                                      }
                                    : p,
                                ),
                              )
                            }
                          >
                            <option value="">Điểm thường</option>
                            {base.checkpoints.map((c) => (
                              <option
                                key={c.checkpoint_id}
                                value={c.checkpoint_id}
                                disabled={points.some(
                                  (p, i) =>
                                    i !== selected &&
                                    p.checkpoint_id === c.checkpoint_id,
                                )}
                              >
                                {c.code} · {c.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className="button"
                          disabled={!!points[selected].checkpoint_id}
                          onClick={() => {
                            update(points.filter((_, i) => i !== selected));
                            setSelected(Math.max(0, selected - 1));
                          }}
                        >
                          Xóa điểm thường
                        </button>
                      </>
                    )}
                    <button
                      className="button"
                      aria-pressed={pick}
                      disabled={points.length >= 500}
                      onClick={() => setPick(!pick)}
                    >
                      {pick
                        ? "Dừng thêm điểm"
                        : "Thêm điểm sau điểm đang chọn bằng bản đồ"}
                    </button>
                    <button
                      className="button"
                      disabled={points.length >= 500}
                      onClick={() => {
                        if (validation.invalidPoints.length) {
                          focusInvalidPoint(validation.invalidPoints[0]);
                          return;
                        }
                        setPick(false);
                        const index = points.length ? selected + 1 : 0;
                        update([
                          ...points.slice(0, index),
                          {
                            latitude: NaN,
                            longitude: NaN,
                            checkpoint_id: null,
                          },
                          ...points.slice(index),
                        ]);
                        focusInvalidPoint(index);
                      }}
                    >
                      Thêm điểm bằng tọa độ
                    </button>
                    <p>
                      Điểm mới được chèn vào đoạn sau điểm đang chọn. Không tự
                      thêm đoạn khép vòng. Kéo neo rồi lưu tuyến sẽ cập nhật vị
                      trí checkpoint, không đổi bán kính.
                    </p>
                    <button
                      className="button"
                      disabled={!history.length}
                      onClick={() => {
                        setPoints(history.at(-1)!);
                        setHistory((h) => h.slice(0, -1));
                        setSelected(0);
                      }}
                    >
                      Hoàn tác
                    </button>
                    <button
                      className="button"
                      disabled={!dirty}
                      onClick={() => {
                        if (confirm("Khôi phục tuyến đã tải và bỏ draft?"))
                          install(base);
                      }}
                    >
                      Khôi phục tuyến đã tải
                    </button>
                  </>
                )}
              </fieldset>
              {mode === "route" && (
                <div
                  className="route-validation"
                  id="map-route-validation"
                  tabIndex={-1}
                >
                  <h3>Kiểm tra tuyến (ước tính)</h3>
                  <p>
                    {base.route.route_profile === "NEU_DEMO"
                      ? "Tuyến demo NEU"
                      : base.route.route_profile === "CUSTOM"
                        ? "Tuyến tùy chỉnh"
                        : "Chưa biết loại tuyến"}
                  </p>
                  <p>{routeLimits(base.route)}</p>
                  <p>{access.reason}</p>
                  <p>
                    Trạng thái tuyến:{" "}
                    {base.route.route_status === "CONFIGURED"
                      ? "Đã có tuyến"
                      : base.route.route_status === "NOT_CONFIGURED"
                        ? "Chưa cấu hình"
                        : (base.route.route_status ?? "Chưa biết")}
                  </p>
                  <p>{points.length} / 5–500 điểm</p>
                  <p>Chiều dài ước tính: {numberText(validation.distance)} m</p>
                  <p>Đầu–cuối: {numberText(validation.gap)} / tối đa 2 m</p>
                  <p>
                    Neo: {validation.anchors} / {base.checkpoints.length}{" "}
                    checkpoint
                  </p>
                  {validation.errors.map((e) => (
                    <p className="field-error" key={e}>
                      {e}
                    </p>
                  ))}
                </div>
              )}
              <details>
                <summary>Tọa độ draft / chi tiết</summary>
                <textarea
                  readOnly
                  aria-label="Tọa độ draft để sao chép"
                  value={JSON.stringify(
                    mode === "route" ? routePayload(points) : numeric,
                    null,
                    2,
                  )}
                />
                <p>
                  Chưa có ETag/version điều kiện cho thao tác ghi; server xác
                  nhận cuối cùng.
                </p>
              </details>
            </div>
          </div>
          <div className="editor-actions">
            <div
              className="editor-save-status"
              id="map-save-status"
              role="status"
            >
              <strong>
                {busy
                  ? "Đang kiểm tra / lưu…"
                  : saveProblems.length
                    ? "Chưa thể lưu"
                    : "Đủ điều kiện kiểm tra và lưu"}
              </strong>
              {mode === "route" && (
                <p>
                  {points.length} điểm · Chiều dài ước tính{" "}
                  {numberText(validation.distance)} m ({routeLimits(base.route)}
                  ) · Đầu–cuối {numberText(validation.gap)} m (tối đa 2 m)
                </p>
              )}
              {!busy &&
                saveProblems.map((problem) => (
                  <p className="field-error" key={problem}>
                    {problem}
                  </p>
                ))}
              {mode === "route" &&
                validation.invalidPoints.map((index) => (
                  <button
                    type="button"
                    className="button"
                    key={index}
                    onClick={() => focusInvalidPoint(index)}
                  >
                    Sửa tọa độ điểm {index + 1}
                  </button>
                ))}
              {mode === "route" && saveProblems.length > 0 && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    const panel = document.getElementById(
                      "map-route-validation",
                    );
                    panel?.scrollIntoView({
                      block: "center",
                      behavior: "smooth",
                    });
                    panel?.focus({ preventScroll: true });
                  }}
                >
                  Xem kiểm tra tuyến
                </button>
              )}
            </div>
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                if (!dirty || confirm("Hủy các thay đổi chưa lưu?")) {
                  install(base);
                  setDirty(false);
                  setMessage("Đã hủy thay đổi");
                }
              }}
            >
              Hủy thay đổi
            </button>
            <button
              className="button primary"
              aria-describedby="map-save-status"
              disabled={busy || saveProblems.length > 0}
              onClick={() => void save()}
            >
              {busy
                ? "Đang kiểm tra / lưu…"
                : uncertain
                  ? "Đọc lại kết quả lưu"
                  : "Lưu thay đổi"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
