import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Footprints, Timer, Flag, MapPin } from "lucide-react";
import { useLive } from "../../app/LiveProvider";
import { raceService } from "../../services";
import type { RunDetail as Detail } from "../../types/domain";
import { Badge, Panel, Empty } from "../../components/ui";
import { datetime, distance, duration } from "../../utils/format";
export function RunDetail() {
  const { studentId = "", runId = "" } = useParams(),
    { snapshot } = useLive();
  const [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    setError("");
    raceService
      .getRunDetail(studentId, runId)
      .then((d) => {
        if (!disposed) setDetail(d);
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
  }, [studentId, runId, snapshot]);
  if (error)
    return <Empty title="Không tìm thấy phiên chạy" description={error} />;
  if (!detail)
    return (
      <div className="empty" role="status">
        Đang tải phiên chạy…
      </div>
    );
  const r = detail.run;
  return (
    <>
      <Link className="back-link" to="/runners">
        <ArrowLeft size={16} /> Danh sách sinh viên
      </Link>
      <div className="page-title">
        <div>
          <div className="eyebrow">CHI TIẾT PHIÊN CHẠY · DỮ LIỆU MÔ PHỎNG</div>
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
            value: `${r.lap_count} / ${r.total_laps}`,
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
            <dd>NEU RUN 2026</dd>
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
            <dd>SIMULATOR</dd>
          </dl>
        </Panel>
        <Panel
          title="Các vòng đã hoàn thành"
          subtitle="Kết quả mô phỏng, chưa phải kết quả chính thức"
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
    </>
  );
}
