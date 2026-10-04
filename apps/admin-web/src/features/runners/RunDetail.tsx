import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Footprints, Timer, Flag, MapPin } from "lucide-react";
import { useLive } from "../../app/LiveProvider";
import { dataMode, raceService } from "../../services";
import type { RunDetail as Detail } from "../../types/domain";
import { Badge, Panel, Empty } from "../../components/ui";
import { datetime, distance, duration } from "../../utils/format";
export function RunDetail() {
  const { studentId = "", runId = "" } = useParams(),
    { snapshot, mergeRunners } = useLive();
  const [refresh, setRefresh] = useState(0);
  const mockSnapshot = dataMode === "mock" ? snapshot : null;
  useEffect(() => {
    if (dataMode !== "api") return;
    const timer = setInterval(() => setRefresh((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, []);
  const [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    setError("");
    raceService
      .getRunDetail(studentId, runId)
      .then((d) => {
        if (!disposed) {
          setDetail(d);
          if (dataMode === "api") mergeRunners([d.run]);
        }
      })
      .catch((e) => {
        if (!disposed) {
          setDetail(null);
          setError((e as { message: string }).message);
        }
      });
    return () => {
      disposed = true;
    };
  }, [studentId, runId, mockSnapshot, refresh, mergeRunners]);
  if (error)
    return (
      <>
        <Empty title="Không tải được phiên chạy" description={error} />
        <button className="button" onClick={() => setRefresh((n) => n + 1)}>
          Thử lại
        </button>
      </>
    );
  if (
    !detail ||
    detail.run.run_id !== runId ||
    detail.run.student_id !== studentId
  )
    return (
      <div className="empty" role="status">
        Đang tải phiên chạy…
      </div>
    );
  const shared = snapshot?.runners.find(
    (r) => r.run_id === runId && r.student_id === studentId,
  );
  const r =
    shared &&
    detail.run.status !== "COMPLETED" &&
    (shared.last_seen_at ?? "") >= (detail.run.last_seen_at ?? "")
      ? { ...detail.run, ...shared }
      : detail.run;
  return (
    <>
      <Link className="back-link" to="/runners">
        <ArrowLeft size={16} /> Danh sách sinh viên
      </Link>
      <div className="page-title">
        <div>
          <div className="eyebrow">
            CHI TIẾT PHIÊN CHẠY ·{" "}
            {dataMode === "api" ? "API THẬT" : "MOCK FRONTEND"}
          </div>
          <h1>{r.full_name}</h1>
          <p>
            #{r.bib} · {r.student_code} · {r.faculty}
          </p>
        </div>
        <Badge status={r.status} />
      </div>
      <div className="detail-metrics">
        {[
          {
            icon: Flag,
            label: "Số vòng",
            value: `${r.lap_count} / ${r.total_laps || "—"}`,
          },
          {
            icon: MapPin,
            label: "Quãng đường",
            value: distance(r.distance_total_m),
          },
          {
            icon: Timer,
            label: "Tổng thời gian",
            value: duration(r.duration_total_s),
          },
          {
            icon: Footprints,
            label: "Bước chân",
            value: r.total_steps?.toLocaleString("vi-VN") ?? "—",
          },
        ].map(({ icon: Icon, label, value }) => (
          <div className="kpi-card" key={label}>
            <Icon size={20} className="blue-text" />
            <p>{label}</p>
            <h2>{value}</h2>
          </div>
        ))}
      </div>
      <div className="detail-grid">
        <Panel title="Thông tin phiên chạy">
          <dl className="info-list">
            <dt>Giải chạy</dt>
            <dd>
              {snapshot?.races.find((race) => race.race_id === r.race_id)
                ?.name ?? r.race_id}
            </dd>
            <dt>Mã phiên</dt>
            <dd>{r.run_id}</dd>
            <dt>Bắt đầu</dt>
            <dd>{datetime(r.started_at)}</dd>
            <dt>Kết thúc</dt>
            <dd>{datetime(r.ended_at)}</dd>
            <dt>Vòng gần nhất</dt>
            <dd>{duration(r.last_lap_duration_s)}</dd>
            <dt>Vị trí gần nhất</dt>
            <dd>
              {r.last_latitude != null && r.last_longitude != null
                ? `${r.last_latitude.toFixed(6)}, ${r.last_longitude.toFixed(6)}`
                : "—"}
            </dd>
            <dt>Cập nhật vị trí</dt>
            <dd>{datetime(r.last_seen_at)}</dd>
            <dt>Kết nối</dt>
            <dd>
              {r.connection === "ONLINE"
                ? "Trực tuyến"
                : r.connection === "STALE"
                  ? "Mất cập nhật"
                  : "Chưa có vị trí"}
            </dd>
            <dt>Nguồn dữ liệu</dt>
            <dd>{r.source}</dd>
          </dl>
        </Panel>
        <Panel
          title="Các vòng đã hoàn thành"
          subtitle={
            dataMode === "api"
              ? "Kết quả do backend ghi nhận"
              : "Kết quả mock frontend"
          }
        >
          {detail.laps.length ? (
            <div className="lap-list">
              {detail.laps.map((l) => (
                <div key={l.event_id}>
                  <span className="lap-icon">
                    <Flag size={16} />
                  </span>
                  <span>
                    <strong>Vòng {l.lap}</strong>
                    <small>{datetime(l.occurred_at)}</small>
                  </span>
                  <strong>{duration(l.duration_s)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Chưa hoàn thành vòng nào"
              description="Lịch sử vòng sẽ hiển thị tại đây."
            />
          )}
        </Panel>
      </div>
      {detail.history && (
        <Panel
          title="Lịch sử GPS / LAP"
          subtitle="Sự kiện của đúng sinh viên và phiên chạy từ backend"
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>LOẠI</th>
                  <th>THỜI ĐIỂM</th>
                  <th>VỊ TRÍ / VÒNG</th>
                  <th>BƯỚC CHÂN</th>
                </tr>
              </thead>
              <tbody>
                {detail.history.map((e) => (
                  <tr key={e.id}>
                    <td>{e.type}</td>
                    <td>{datetime(e.occurred_at)}</td>
                    <td>
                      {e.type === "LAP"
                        ? `Vòng ${e.lap_no}`
                        : `${e.latitude ?? "—"}, ${e.longitude ?? "—"}`}
                    </td>
                    <td>{e.total_steps ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {dataMode === "mock" && (
        <Panel
          title="Lịch sử sự kiện checkpoint"
          subtitle="Chỉ hiển thị sự kiện đã gắn đúng sinh viên và phiên chạy"
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>SỰ KIỆN</th>
                  <th>CHECKPOINT</th>
                  <th>THỜI ĐIỂM</th>
                  <th>NGUỒN</th>
                  <th>TRẠNG THÁI</th>
                </tr>
              </thead>
              <tbody>
                {detail.events.map((e) => (
                  <tr key={e.event_id}>
                    <td>{e.event_id}</td>
                    <td>
                      {snapshot?.checkpoints.find(
                        (c) => c.checkpoint_id === e.checkpoint_id,
                      )?.name ?? e.checkpoint_id}
                    </td>
                    <td>{datetime(e.occurred_at)}</td>
                    <td>{e.source}</td>
                    <td>
                      <span className="badge badge-completed">
                        Đã gắn sinh viên
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!detail.events.length && (
            <Empty
              title="Chưa có sự kiện checkpoint"
              description="Không có sự kiện được ghi nhận cho phiên này."
            />
          )}
        </Panel>
      )}
    </>
  );
}
