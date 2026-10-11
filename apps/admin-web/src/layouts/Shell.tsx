import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  Map,
  Users,
  Flag,
  ScanLine,
  PanelLeftClose,
} from "lucide-react";
import { useLive } from "../app/LiveProvider";
import { datetime } from "../utils/format";
import { dataMode } from "../services";
const navigation = [
  { to: "/", label: "Tổng quan", icon: LayoutDashboard },
  { to: "/live", label: "Bản đồ trực tiếp", icon: Map },
  { to: "/runners", label: "Sinh viên", icon: Users },
  { to: "/races", label: "Giải chạy", icon: Flag },
  { to: "/checkpoints", label: "Checkpoint", icon: ScanLine },
];
export function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const {
    races,
    raceId,
    selectRace,
    connection,
    refreshData,
    retry,
    snapshot,
    logout,
  } = useLive();
  const connectionLabel =
    connection === "connected"
      ? "Đã kết nối server"
      : connection === "connecting" || connection === "reconnecting"
        ? "Đang kết nối lại"
        : "Mất kết nối server";
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="NEU RUN trang chủ">
          <span className="brand-icon">
            <Activity size={25} />
          </span>
          <span className="brand-name">
            NEU RUN<small>LIVE</small>
          </span>
        </NavLink>
        <button
          className="button collapse-control"
          aria-label="Thu gọn hoặc mở sidebar"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          <PanelLeftClose size={18} />
          <span>Thu gọn</span>
        </button>
        <nav aria-label="Điều hướng chính">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={label}
              aria-label={label}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-shell">
        <header className="topbar unified-header">
          <label className="race-select">
            Giải đang xem
            <select
              aria-label="Chọn giải chạy"
              value={raceId}
              onChange={(e) => selectRace(e.target.value)}
            >
              {races.map((r) => (
                <option key={r.race_id} value={r.race_id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <div className="server-state">
            <strong>
              {dataMode === "api" ? connectionLabel : "Dữ liệu minh họa"}
            </strong>
            <small>
              {snapshot
                ? `Cập nhật ${datetime(snapshot.updated_at)}`
                : "Đang tải dữ liệu"}
            </small>
          </div>
          <button
            className="button"
            onClick={() => (snapshot ? refreshData() : retry())}
          >
            Làm mới
          </button>
          <details className="account-menu">
            <summary>Quản trị viên</summary>
            <div>
              <p>
                Nguồn GPS xem riêng ở từng người chạy; kết nối server không xác
                nhận GPS mới.
              </p>
              <button className="button" onClick={logout}>
                Đăng xuất
              </button>
              <details>
                <summary>Chi tiết kỹ thuật</summary>
                <p>WebSocket: {connection}</p>
                <p>Chế độ dữ liệu: {dataMode}</p>
              </details>
            </div>
          </details>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
