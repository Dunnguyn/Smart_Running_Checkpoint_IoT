import { dataMode } from "../../services";
import { useState } from "react";
import {
  CalendarDays,
  MapPin,
  Flag,
  Users,
  Footprints,
  CircleCheck,
  ScanLine,
  Play,
  Pause,
  RotateCcw,
  ArrowUpRight,
  Radio,
} from "lucide-react";
import { useLive } from "../../app/LiveProvider";
import { Badge, Empty } from "../../components/ui";
import { LiveMap } from "../live-map/LiveMap";
import { WatchList } from "../live-map/WatchList";
import { RunnerTable } from "../runners/RunnerTable";
import { datetime } from "../../utils/format";
export function SimulationControls() {
  const { snapshot, start, pause, reset } = useLive();
  if (dataMode === "api")
    return (
      <span className="simulation-tag">
        API thật · nguồn GPS xem ở chi tiết runner
      </span>
    );
  return (
    <div className="simulation-controls">
      <span className="simulation-tag">
        <Radio size={13} /> Dữ liệu mô phỏng
      </span>
      <button
        className={snapshot?.running ? "button" : "button primary"}
        disabled={!snapshot}
        onClick={snapshot?.running ? pause : start}
      >
        {snapshot?.running ? <Pause size={15} /> : <Play size={15} />}{" "}
        {snapshot?.running ? "Tạm dừng" : "Bắt đầu"}
      </button>
      <button
        className="icon-button reset"
        aria-label="Đặt lại mô phỏng"
        title="Đặt lại mô phỏng"
        disabled={!snapshot}
        onClick={reset}
      >
        <RotateCcw size={17} />
      </button>
    </div>
  );
}
export function Dashboard({ mapOnly = false }: { mapOnly?: boolean }) {
  const { snapshot, error, raceId } = useLive();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (error)
    return <Empty title="Dữ liệu không khả dụng" description={error} />;
  if (!snapshot)
    return (
      <div className="empty" role="status">
        Đang tải không gian giải chạy…
      </div>
    );
  const race = snapshot.races.find((r) => r.race_id === raceId)!,
    active =
      snapshot.overview?.active ??
      snapshot.runners.filter((r) => r.status === "ACTIVE").length,
    completed =
      snapshot.overview?.completed ??
      snapshot.runners.filter((r) => r.status === "COMPLETED").length;
  const kpis = [
    {
      label: "Tổng sinh viên tham gia",
      value: snapshot.overview?.total ?? snapshot.runners.length,
      icon: Users,
      color: "blue",
      note: "Đã đăng ký tham gia",
      suffix: "sinh viên",
    },
    {
      label: "Đang chạy",
      value: active,
      icon: Footprints,
      color: "teal",
      note: `${Math.round((active / Math.max(1, snapshot.overview?.total ?? snapshot.runners.length)) * 100)}% tổng sinh viên`,
      suffix: "sinh viên",
    },
    {
      label: "Đã hoàn thành",
      value: completed,
      icon: CircleCheck,
      color: "purple",
      note: "Kết quả phiên chạy",
      suffix: "sinh viên",
    },
    {
      label: "Sự kiện checkpoint",
      value: snapshot.overview?.checkpoint_events ?? snapshot.events.length,
      icon: ScanLine,
      color: "orange",
      note:
        dataMode === "api"
          ? "Backend chưa cung cấp danh sách checkpoint"
          : `${snapshot.checkpoints.length} checkpoint trên tuyến`,
      suffix: "sự kiện",
    },
  ];
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">TỔNG QUAN GIẢI CHẠY</div>
          <h1>
            {mapOnly ? "Bản đồ trực tiếp" : race.name}
            <span className="year-pill">{race.name}</span>
          </h1>
          <p>Chào mừng trở lại! Cùng theo dõi hành trình của sinh viên NEU.</p>
        </div>
        <SimulationControls />
      </div>
      <section className="race-banner">
        <div className="race-banner-icon">
          <Flag size={24} />
        </div>
        <div className="race-banner-info">
          <div>
            <strong>{race.name}</strong>
            <Badge status={race.status} />
          </div>
          <p>
            <span>
              <CalendarDays size={14} />
              {datetime(race.started_at)}
            </span>
            <span>
              <MapPin size={14} />
              {race.location}
            </span>
            <span>
              <Flag size={14} />
              {dataMode === "api" ? "—" : snapshot.checkpoints.length}{" "}
              checkpoint · {race.total_laps ?? "—"} vòng
            </span>
          </p>
        </div>
        <span className="race-distance">
          <strong>
            {dataMode === "api" ? "—" : "5"}
            <span> km</span>
          </strong>
          <small>MỤC TIÊU MỖI SINH VIÊN</small>
        </span>
      </section>
      {!mapOnly && (
        <div className="kpi-grid">
          {kpis.map(({ label, value, icon: Icon, color, note, suffix }) => (
            <section className="kpi-card" key={label}>
              <div className="kpi-top">
                <span>{label}</span>
                <span className={`kpi-icon ${color}`}>
                  <Icon size={21} />
                </span>
              </div>
              <div className="kpi-value">
                {value.toLocaleString("vi-VN")}
                <small>{suffix}</small>
              </div>
              <div className="kpi-note">
                <span className={`kpi-note-dot ${color}`} />
                {note}
                <ArrowUpRight size={13} />
              </div>
            </section>
          ))}
        </div>
      )}
      <div className={`live-grid ${mapOnly ? "expanded-map" : ""}`}>
        <LiveMap
          snapshot={snapshot}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <WatchList
          snapshot={snapshot}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      <p className="map-disclaimer">
        {dataMode === "api"
          ? "Backend chưa cung cấp geometry tuyến và API đọc checkpoint. Marker lấy từ GPS backend; không tự tính vòng. Mất cập nhật GPS sau 30 giây là nhãn hiển thị, không thay đổi trạng thái phiên."
          : "Tuyến chạy minh họa, không phải tuyến chính thức của NEU. 8 sinh viên được mô phỏng di chuyển."}
      </p>
      {!mapOnly && <RunnerTable compact onSelect={setSelectedId} />}
    </>
  );
}
