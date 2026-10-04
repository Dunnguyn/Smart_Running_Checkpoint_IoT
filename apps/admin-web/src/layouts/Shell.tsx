import { dataMode } from "../services";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  Map,
  Users,
  Flag,
  ScanLine,
  ChartNoAxesCombined,
  Settings,
  Bell,
  Search,
  ChevronDown,
  ArrowUpRight,
  X,
} from "lucide-react";
const navigation = [
  { to: "/", label: "Tổng quan", icon: LayoutDashboard },
  { to: "/live", label: "Bản đồ trực tiếp", icon: Map },
  { to: "/runners", label: "Sinh viên", icon: Users },
  { to: "/races", label: "Giải chạy", icon: Flag },
  { to: "/checkpoints", label: "Checkpoint", icon: ScanLine },
];
export function Shell() {
  const [notifications, setNotifications] = useState(false),
    [profile, setProfile] = useState(false),
    [query, setQuery] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotifications(false);
        setProfile(false);
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand" aria-label="NEU RUN trang chủ">
          <span className="brand-icon">
            <Activity size={25} />
          </span>
          <span>
            NEU RUN
            <small>
              <i /> LIVE
            </small>
          </span>
        </NavLink>
        <div className="nav-label">KHÔNG GIAN QUẢN TRỊ</div>
        <nav>
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
              {to === "/live" && <i className="live-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="nav-label secondary">CÔNG CỤ</div>
        <nav>
          <NavLink
            to="/reports"
            className="nav-item"
            title="Báo cáo"
            aria-label="Báo cáo"
          >
            <ChartNoAxesCombined size={20} />
            <span>Báo cáo</span>
          </NavLink>
          <NavLink
            to="/settings"
            className="nav-item"
            title="Cài đặt"
            aria-label="Cài đặt"
          >
            <Settings size={20} />
            <span>Cài đặt</span>
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card">
            <span className="support-icon">
              <Activity size={22} />
            </span>
            <strong>
              Mỗi bước chân,
              <br />
              một hành trình.
            </strong>
            <p>
              Cùng NEU chinh phục
              <br />
              những giới hạn mới.
            </p>
            <NavLink to="/races">
              Khám phá giải chạy <ArrowUpRight size={14} />
            </NavLink>
          </div>
          <div className="system">
            <i /> {dataMode === "api" ? "Kết nối API" : "Chế độ mô phỏng"}{" "}
            <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Không gian quản trị <span>/</span>
            <strong>NEU RUN</strong>
          </div>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/runners?q=${encodeURIComponent(query)}`);
            }}
          >
            <Search size={17} />
            <input
              aria-label="Tìm kiếm sinh viên toàn hệ thống"
              placeholder="Tìm kiếm sinh viên…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>↵</kbd>
          </form>
          <div className="header-actions">
            <button
              className="icon-button notification-button"
              aria-label="Thông báo"
              aria-expanded={notifications}
              title="Thông báo"
              onClick={() => {
                setNotifications(!notifications);
                setProfile(false);
              }}
            >
              <Bell size={20} />
              <i />
            </button>
            <button
              className="profile-button"
              aria-label="Hồ sơ quản trị viên"
              aria-expanded={profile}
              onClick={() => {
                setProfile(!profile);
                setNotifications(false);
              }}
            >
              <span className="avatar">QT</span>
              <span>
                <strong>Quản trị viên</strong>
                <small>NEU Administrator</small>
              </span>
              <ChevronDown size={15} />
            </button>
          </div>
          {(notifications || profile) && (
            <div className="header-popover">
              <button
                className="icon-button popover-close"
                aria-label="Đóng"
                onClick={() => {
                  setNotifications(false);
                  setProfile(false);
                }}
              >
                <X size={16} />
              </button>
              <strong>
                {notifications ? "Thông báo mô phỏng" : "Hồ sơ mẫu"}
              </strong>
              <p>
                {notifications
                  ? "Hệ thống sẵn sàng. Nhấn Bắt đầu để theo dõi 8 sinh viên di chuyển trên tuyến minh họa."
                  : "Quản trị viên · Đại học Kinh tế Quốc dân. Đây là thông tin mẫu cho bản demo."}
              </p>
            </div>
          )}
        </header>
        <main>
          <Outlet />
        </main>
        <footer>
          <span>© 2026 NEU RUN · Đại học Kinh tế Quốc dân</span>
          <span>
            <i />{" "}
            {dataMode === "api"
              ? "API thật · nguồn dữ liệu do backend cung cấp"
              : "Mock frontend · Không kết nối backend"}
          </span>
        </footer>
      </div>
    </div>
  );
}
