import { Link, useParams } from "react-router-dom";
import {
  Plus,
  ArrowLeft,
  CalendarDays,
  MapPin,
  Users,
  Flag,
} from "lucide-react";
import { useLive } from "../../app/LiveProvider";
import { Badge, Panel, Empty } from "../../components/ui";
import { datetime } from "../../utils/format";
export function Races() {
  const { snapshot, error } = useLive(),
    { raceId } = useParams();
  if (error)
    return <Empty title="Dữ liệu không khả dụng" description={error} />;
  if (!snapshot) return <div className="empty">Đang tải giải chạy…</div>;
  const selected = snapshot.races.find((r) => r.race_id === raceId);
  if (raceId && !selected)
    return (
      <Empty
        title="Không tìm thấy giải chạy"
        description="Kiểm tra lại đường dẫn."
      />
    );
  return (
    <>
      {raceId && (
        <Link className="back-link" to="/races">
          <ArrowLeft size={16} /> Tất cả giải chạy
        </Link>
      )}
      <div className="page-title">
        <div>
          <div className="eyebrow">QUẢN LÝ SỰ KIỆN</div>
          <h1>{selected?.name ?? "Giải chạy"}</h1>
          <p>Danh sách và thông tin giải chạy · Dữ liệu mô phỏng</p>
        </div>
        <div className="disabled-action">
          <button
            className="button"
            disabled
            title="Chưa có API contract tạo/sửa giải"
          >
            <Plus size={16} /> {selected ? "Chỉnh sửa" : "Tạo giải chạy"}
          </button>
          <small>Chờ API contract tạo / sửa</small>
        </div>
      </div>
      {selected ? (
        <Panel
          title="Thông tin giải chạy"
          action={<Badge status={selected.status} />}
        >
          <dl className="info-list">
            <dt>Tên giải</dt>
            <dd>{selected.name}</dd>
            <dt>Thời gian</dt>
            <dd>{datetime(selected.started_at)}</dd>
            <dt>Địa điểm</dt>
            <dd>{selected.location}</dd>
            <dt>Sinh viên đăng ký</dt>
            <dd>
              {
                snapshot.runners.filter((r) => r.race_id === selected.race_id)
                  .length
              }
            </dd>
            <dt>Số vòng</dt>
            <dd>{selected.total_laps}</dd>
            <dt>Số checkpoint</dt>
            <dd>
              {
                snapshot.checkpoints.filter(
                  (c) => c.race_id === selected.race_id,
                ).length
              }
            </dd>
            <dt>Tuyến chạy</dt>
            <dd>
              {selected.race_id === "neu-2026"
                ? "Tuyến minh họa nội bộ · 1 km/vòng"
                : "Chưa có tuyến minh họa"}
            </dd>
          </dl>
          {selected.status === "LIVE" && (
            <Link className="panel-link" to="/live">
              Mở bản đồ trực tiếp →
            </Link>
          )}
        </Panel>
      ) : (
        <div className="race-cards">
          {snapshot.races.map((r) => (
            <Link
              key={r.race_id}
              to={`/races/${r.race_id}`}
              className="panel race-card"
            >
              <div className="race-card-top">
                <span className="kpi-icon blue">
                  <Flag size={24} />
                </span>
                <Badge status={r.status} />
              </div>
              <h2>{r.name}</h2>
              <p>
                <CalendarDays size={16} />
                {datetime(r.started_at)}
              </p>
              <p>
                <MapPin size={16} />
                {r.location}
              </p>
              <p>
                <Users size={16} />
                {
                  snapshot.runners.filter((p) => p.race_id === r.race_id).length
                }{" "}
                sinh viên · {r.total_laps} vòng
              </p>
              <span className="panel-link">Xem chi tiết giải chạy →</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
