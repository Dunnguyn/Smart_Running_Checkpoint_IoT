import { useState, useRef } from "react";
import {
  NavLink,
  Outlet,
  ScrollRestoration,
  useLocation,
} from "react-router-dom";
import {
  Activity,
  RefreshCw,
  LayoutDashboard,
  Map,
  Users,
  Flag,
  ScanLine,
  PanelLeftClose,
  Settings2,
  FlaskConical,
} from "lucide-react";
import { useLive } from "../app/LiveProvider";
import { IconAction } from "../components/IconAction";
import { dataMode } from "../services";
const navigation = [
  { to: "/races", label: "Giải chạy", icon: Flag },
  { to: "/runners", label: "Sinh viên", icon: Users },
  { to: "/simulation", label: "Mô phỏng", icon: FlaskConical },
  { to: "/", label: "Tổng quan", icon: LayoutDashboard },
  { to: "/live", label: "Bản đồ trực tiếp", icon: Map },
  { to: "/checkpoints", label: "Trạm kiểm soát", icon: ScanLine },
];
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
      <aside className="sidebar">
        <div className="sidebar-brand-row">
          <NavLink to="/" className="brand" aria-label="NEU RUN trang chủ">
            <span className="brand-icon">
              <Activity size={25} />
            </span>
            <span className="brand-name">
              NEU RUN<small>QUẢN TRỊ GIẢI CHẠY</small>
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
        </div>
        <div className="nav-caption">QUẢN LÝ CHUNG</div>
        <nav aria-label="Điều hướng chính">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/" || to === "/races"}
              title={label}
              aria-label={label}
              className={({ isActive }) =>
                `nav-item ${to === "/" ? "race-nav-start" : ""} ${isActive ? "active" : ""}`
              }
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
          {raceId && (
            <NavLink
              to={`/races/${raceId}`}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
              title="Thiết lập giải"
              aria-label="Thiết lập giải"
            >
              <Settings2 size={20} />
              <span>Thiết lập giải</span>
            </NavLink>
          )}
        </nav>
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
                QT
              </span>
              Quản trị viên
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
        <main>
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
