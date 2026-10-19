import { CheckCircle2, Users, Activity, Trophy, Route } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLive } from "../../app/LiveProvider";
import { Badge, Empty, Panel } from "../../components/ui";
import { LiveMap } from "../live-map/LiveMap";
import { WatchList } from "../live-map/WatchList";
import { EventStatus } from "../checkpoints/CheckpointJournal";
import { datetime, duration, distance } from "../../utils/format";
import { modeLabel } from "../../utils/labels";
import { ReferenceIcon } from "../../components/ReferenceIcon";
import { dataMode } from "../../services";
function relativeEventTime(value: string) {
  const seconds = (Date.parse(value) - Date.now()) / 1000;
  if (!Number.isFinite(seconds)) return "Chưa có thời điểm";
  const format = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return "Vừa ghi nhận";
  if (Math.abs(seconds) < 3600)
    return format.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400)
    return format.format(Math.round(seconds / 3600), "hour");
  return format.format(Math.round(seconds / 86400), "day");
}
export function SimulationControls() {
  const { snapshot, start, pause, reset } = useLive();
  if (dataMode !== "mock") return null;
  return (
    <div className="row-actions">
      <span>Dữ liệu minh họa</span>
      <button className="button" onClick={snapshot?.running ? pause : start}>
        {snapshot?.running ? "Tạm dừng" : "Bắt đầu"}
      </button>
      <button className="button" onClick={reset}>
        Đặt lại minh họa
      </button>
    </div>
  );
}
export function Dashboard({ mapOnly = false }: { mapOnly?: boolean }) {
  const { snapshot, error, raceId, retry } = useLive();
  const [params] = useSearchParams();
  const [chosen, setChosen] = useState<{ race: string; id: string } | null>(
    null,
  );
  const selectedId = chosen?.race === raceId ? chosen.id : params.get("runner");
  const onSelect = (id: string) => setChosen({ race: raceId, id });
  if (!snapshot)
    return (
      <div className="panel skeleton" role="status">
        Đang tải tổng quan giải…
        {error && (
          <>
            <p role="alert">{error}</p>
            <button className="button" onClick={retry}>
              Thử lại
            </button>
          </>
        )}
      </div>
    );
  const d = snapshot.dashboard,
    s = d?.summary,
    race = d?.race ?? snapshot.overview?.race;
  const attention = s?.ambiguous_matches;
  const cards = [
    {
      label: "Người tham gia",
      icon: Users,
      tone: "blue",
      value: s?.participants,
      to: "/runners?view=participants",
    },
    {
      label: "Đang chạy",
      icon: Activity,
      tone: "green",
      value: s?.active_runners ?? snapshot.overview?.active,
      to: "/runners?status=ACTIVE",
    },
    {
      label: "Tổng vòng ghi nhận",
      icon: Route,
      tone: "blue",
      value: s?.laps_recorded,
      to: "/analytics",
    },
    {
      label: "Đã hoàn thành",
      icon: Trophy,
      tone: "green",
      value: s?.completed_runners,
      to: "/runners?status=COMPLETED",
    },
  ];
  return (
    <div className="dashboard-sections">
      {mapOnly ? (
        <div className="page-title">
          <div>
            <h1>Bản đồ trực tiếp</h1>
            <p>Theo dõi vị trí và tiến độ của người chạy trên tuyến.</p>
          </div>
          {race && <Badge status={race.status} />}
        </div>
      ) : (
        <>
          <section className="panel overview-hero">
            <div className="hero-main">
              <div className="hero-title-row">
                {race && <Badge status={race.status} />}
                <span
                  className="hero-updated"
                  title={datetime(snapshot.updated_at)}
                >
                  <ReferenceIcon name="refresh" size={13} />
                  {datetime(snapshot.updated_at)}
                </span>
              </div>
              <h1>{race?.name ?? "Tổng quan giải"}</h1>
              <p>Trung tâm điều hành giải chạy</p>
              <div className="hero-meta">
                <span>
                  <ReferenceIcon name="route" />
                  {race?.total_laps ?? "—"} vòng ·{" "}
                  {snapshot.routeDistance_m ?? "—"} m/vòng
                </span>
                <span>
                  <ReferenceIcon name="device" />
                  {d ? modeLabel(d.race.checkpoint_mode) : "Chưa có chế độ"}
                </span>
              </div>
            </div>
            <div className="hero-actions">
              <Link className="button" to="/analytics">
                <ReferenceIcon name="chart" />
                Xem phân tích
              </Link>
              <Link className="button primary" to="/live">
                <ReferenceIcon name="map" />
                Mở bản đồ trực tiếp
              </Link>
            </div>
          </section>
          <div className="overview-health">
            <div>
              <span className="health-icon">
                <ReferenceIcon name="info" />
              </span>
              <span>
                <strong>
                  {error ? "Cần kiểm tra kết nối" : "Dữ liệu từ máy chủ"}
                </strong>
                <small>
                  {d?.race.checkpoint_mode === "GPS_AND_ARDUINO"
                    ? "Vòng chạy được ghi nhận khi GPS khớp sự kiện tại trạm Arduino."
                    : "Vòng chạy được ghi nhận từ GPS tại điểm tính vòng."}
                </small>
              </span>
            </div>
            <Link to="/checkpoints?tab=attention">
              {attention ?? "—"} sự kiện cần xác nhận{" "}
              <ReferenceIcon name="chevron" size={15} />
            </Link>
          </div>
          <div className="kpi-grid overview-stats">
            {cards.map((c) => (
              <Link className="kpi-card" key={c.label} to={c.to}>
                <div className="stat-card-top">
                  <span>{c.label}</span>
                  <span className={`kpi-symbol tone-${c.tone}`}>
                    <c.icon size={20} aria-hidden="true" />
                  </span>
                </div>
                <div className="stat-value-row">
                  <strong className="kpi-value">{c.value ?? "—"}</strong>
                </div>
                <small>Theo dữ liệu giải đang chọn</small>
              </Link>
            ))}
          </div>
        </>
      )}
      <SimulationControls />
      <div
        className={`live-grid ${mapOnly ? "expanded-map" : "overview-map"} ${params.has("edit") ? "editing-grid" : ""}`}
      >
        <LiveMap
          snapshot={snapshot}
          selectedId={selectedId}
          onSelect={onSelect}
        />
        {!params.has("edit") &&
          (mapOnly ? (
            <WatchList
              key={raceId}
              snapshot={snapshot}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ) : (
            <Panel
              title="Cần xử lý"
              subtitle="Các mục cần ban tổ chức chú ý"
              className="attention-card"
            >
              <div className="attention-list">
                {(attention ?? 0) > 0 && (
                  <Link to="/checkpoints?tab=attention">
                    <strong>{attention} sự kiện cần xác nhận người chạy</strong>
                    <span>Xem ứng viên →</span>
                  </Link>
                )}
                {(s?.pending_matches ?? 0) > 0 && (
                  <Link to="/checkpoints?tab=journal&status=PENDING_MATCH">
                    <strong>{s?.pending_matches} sự kiện đang đối chiếu</strong>
                    <span>Xem nhật ký →</span>
                  </Link>
                )}
                {snapshot.runners.some((r) => r.connection === "STALE") && (
                  <Link to="/live">
                    <strong>
                      {
                        snapshot.runners.filter((r) => r.connection === "STALE")
                          .length
                      }{" "}
                      người có GPS đã cũ
                    </strong>
                    <span>Xem vị trí cập nhật cuối →</span>
                  </Link>
                )}
                {!snapshot.route.length && (
                  <p>
                    Chưa có tuyến được lưu. Bản đồ vẫn hiển thị GPS hiện có.
                  </p>
                )}
                {!error &&
                  attention === 0 &&
                  s?.pending_matches === 0 &&
                  snapshot.route.length > 0 &&
                  !snapshot.runners.some((r) => r.connection === "STALE") && (
                    <p className="calm-empty">
                      <CheckCircle2 size={20} />
                      Không có mục cần xử lý
                    </p>
                  )}
                {(error || attention == null || s?.pending_matches == null) && (
                  <p>Chưa đủ dữ liệu để xác định các mục cần xử lý.</p>
                )}
              </div>
            </Panel>
          ))}
      </div>
      {!mapOnly && d && (
        <>
          <div className="detail-grid">
            <Panel
              title="Tiến độ nổi bật"
              subtitle="5 người theo thứ tự backend cung cấp; không phải kết quả thi đấu chính thức."
              action={
                <Link className="text-link" to="/runners">
                  Tất cả sinh viên →
                </Link>
              }
            >
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Số báo danh</th>
                      <th>Sinh viên</th>
                      <th>Vòng</th>
                      <th>Quãng đường</th>
                      <th>Thời gian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.top_runners.slice(0, 5).map((r) => (
                      <tr key={r.run_id ?? r.student_id}>
                        <td>{r.bib_number ?? r.display_id ?? "—"}</td>
                        <td>
                          {r.run_id ? (
                            <Link
                              className="text-link"
                              to={`/runners/${r.student_id}/runs/${r.run_id}`}
                            >
                              {r.full_name}
                            </Link>
                          ) : (
                            r.full_name
                          )}
                        </td>
                        <td>
                          {r.lap_count}/{r.total_laps ?? "—"}
                        </td>
                        <td>{distance(r.distance_total_m)}</td>
                        <td>{duration(r.duration_total_s ?? null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!d.top_runners.length && (
                  <Empty
                    title="Chưa có kết quả"
                    description="Kết quả sẽ xuất hiện khi có dữ liệu chạy."
                  />
                )}
              </div>
            </Panel>
            <Panel
              title="Sự kiện gần nhất"
              action={
                <Link className="text-link" to="/checkpoints?tab=journal">
                  Mở nhật ký →
                </Link>
              }
            >
              <div className="recent-events">
                {d.recent_checkpoint_events.slice(0, 5).map((e) => (
                  <Link
                    key={e.event_id}
                    to={`/checkpoints?tab=journal&event=${e.event_id}`}
                  >
                    <small title={datetime(e.occurred_at)}>
                      {relativeEventTime(e.occurred_at)}
                    </small>
                    <strong>
                      {snapshot.checkpoints.find(
                        (c) => c.checkpoint_id === e.checkpoint_id,
                      )?.name ?? "Trạm kiểm soát"}
                    </strong>
                    <EventStatus event={e} />
                  </Link>
                ))}
                {!d.recent_checkpoint_events.length && (
                  <Empty
                    title="Chưa có sự kiện"
                    description="Sự kiện tại trạm sẽ xuất hiện tại đây."
                  />
                )}
              </div>
            </Panel>
          </div>
          <details className="panel statistics">
            <summary>Thống kê chi tiết</summary>
            <dl className="info-list">
              <dt>Chế độ</dt>
              <dd>{modeLabel(d.race.checkpoint_mode)}</dd>
              <dt>Chưa bắt đầu</dt>
              <dd>{s?.not_started_runners}</dd>
              <dt>Tổng vòng được ghi nhận</dt>
              <dd>{s?.laps_recorded}</dd>
              <dt>Đạt mục tiêu vòng</dt>
              <dd>{s?.runners_at_lap_target}</dd>
              <dt>Tổng quãng đường</dt>
              <dd>{distance(s?.distance_total_m ?? 0)}</dd>
              <dt>Tổng bước chân</dt>
              <dd>{s?.steps_total.toLocaleString("vi-VN")}</dd>
            </dl>
          </details>
        </>
      )}
    </div>
  );
}
