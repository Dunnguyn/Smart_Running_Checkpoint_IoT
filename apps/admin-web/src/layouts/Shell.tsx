import { useState, useRef } from "react";
import {
  NavLink,
  Outlet,
  ScrollRestoration,
  useLocation,
} from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useLive } from "../app/LiveProvider";
import { IconAction } from "../components/IconAction";
import { ReferenceIcon } from "../components/ReferenceIcon";
import { Fragment } from "react";
import { dataMode } from "../services";
const navigation = [
  { to: "/races", label: "Giải chạy", icon: "flag", group: "QUẢN LÝ CHUNG" },
  { to: "/runners", label: "Sinh viên", icon: "users" },
  { to: "/simulation", label: "Mô phỏng", icon: "flask" },
  { to: "/", label: "Tổng quan", icon: "grid", group: "VẬN HÀNH GIẢI" },
  { to: "/live", label: "Bản đồ trực tiếp", icon: "map" },
  { to: "/checkpoints", label: "Trạm kiểm soát", icon: "checkpoint" },
  {
    to: "/analytics",
    label: "Phân tích",
    icon: "chart",
    group: "BÁO CÁO & CẤU HÌNH",
  },
] as const;
export function Shell() {
  const location = useLocation();
  const globalPage =
    location.pathname === "/races" || location.pathname === "/simulation";
  const [refreshing, setRefreshing] = useState(false);
  const refreshGuard = useRef(false);
  const [refreshError, setRefreshError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const {
    races,
    error,
    reloadRaces,
    raceId,
    selectRace,
    connection,
    refreshData,
    retry,
    snapshot,
    logout,
  } = useLive();
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Chuyển đến nội dung chính
      </a>
      <aside className="sidebar">
        <div className="sidebar-brand-row">
          <NavLink to="/" className="brand" aria-label="NEU RUN trang chủ">
            <span className="brand-icon">
              <span>NR</span>
            </span>
            <span className="brand-name">
              NEU RUN<small>TRUNG TÂM ĐIỀU HÀNH</small>
            </span>
          </NavLink>
          <button
            className="button collapse-control"
            aria-label="Thu gọn hoặc mở sidebar"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <ReferenceIcon name="menu" />
            <span>Thu gọn</span>
          </button>
        </div>
        <nav aria-label="Điều hướng chính">
          {navigation.map((item) => {
            const { to, label, icon } = item;
            return (
              <Fragment key={to}>
                {"group" in item && (
                  <div className="nav-caption">{item.group}</div>
                )}
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/" || to === "/races"}
                  title={label}
                  aria-label={label}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                  }
                >
                  <ReferenceIcon name={icon} />
                  <span>{label}</span>
                  {to === "/checkpoints" &&
                    snapshot?.dashboard &&
                    snapshot.dashboard.summary.ambiguous_matches > 0 && (
                      <span className="nav-count">
                        {snapshot.dashboard.summary.ambiguous_matches}
                      </span>
                    )}
                </NavLink>
              </Fragment>
            );
          })}
          {raceId && (
            <NavLink
              to={`/races/${raceId}`}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
              title="Thiết lập giải"
              aria-label="Thiết lập giải"
            >
              <ReferenceIcon name="settings" />
              <span>Thiết lập giải</span>
            </NavLink>
          )}
        </nav>
        {!collapsed && (
          <div className="sidebar-footer">
            <ReferenceIcon name="info" />
            <span>
              <strong>
                {connection === "connected"
                  ? "Kết nối máy chủ"
                  : "Theo dõi kết nối"}
              </strong>
              <small>Nguồn GPS theo từng người chạy</small>
            </span>
          </div>
        )}
      </aside>
      <div className="main-shell">
        <header className="topbar unified-header">
          {!globalPage ? (
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
          ) : (
            <strong className="global-context">
              {location.pathname === "/simulation"
                ? "Mô phỏng"
                : "Quản lý giải"}
            </strong>
          )}
          {location.pathname === "/races" && (
            <span className="muted global-scope">
              Danh sách tất cả giải chạy
            </span>
          )}
          <IconAction
            label="Làm mới dữ liệu"
            disabled={refreshing}
            aria-busy={refreshing}
            onClick={async () => {
              if (refreshGuard.current) return;
              refreshGuard.current = true;
              setRefreshing(true);
              setRefreshError("");
              try {
                if (globalPage) await reloadRaces();
                else await refreshData();
              } catch {
                setRefreshError("Chưa thể tải dữ liệu mới. Vui lòng thử lại.");
              } finally {
                refreshGuard.current = false;
                setRefreshing(false);
              }
            }}
          >
            <RefreshCw
              size={19}
              className={refreshing ? "refresh-spinning" : ""}
            />
          </IconAction>
          <details className="account-menu">
            <summary>
              <span className="account-avatar" aria-hidden="true">
                <ReferenceIcon name="lock" size={15} />
              </span>
              Quản trị
            </summary>
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
        <main id="main-content" tabIndex={-1}>
          {(error ||
            refreshError ||
            (!globalPage &&
              raceId &&
              dataMode === "api" &&
              connection !== "connected")) && (
            <div className="connection-notice" role="status">
              <div>
                <strong>
                  {error || refreshError
                    ? "Chưa thể tải dữ liệu mới. Vui lòng thử lại."
                    : "Đang kết nối lại để nhận cập nhật trực tiếp…"}
                </strong>
                {snapshot && <p>Đang hiển thị dữ liệu đã tải trước đó.</p>}
              </div>
              <button
                className="button"
                onClick={() => {
                  setRefreshError("");
                  if (globalPage)
                    void reloadRaces().catch(() =>
                      setRefreshError(
                        "Chưa thể tải dữ liệu mới. Vui lòng thử lại.",
                      ),
                    );
                  else if (snapshot) void refreshData();
                  else retry();
                }}
              >
                Thử lại
              </button>
            </div>
          )}
          <Outlet />
          <ScrollRestoration getKey={(location) => location.pathname} />
        </main>
      </div>
    </div>
  );
}
