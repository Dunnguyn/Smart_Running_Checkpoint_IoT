import { RaceLifecycle } from "./RaceLifecycle";
import { StudentPolicy } from "./StudentPolicy";
import { AttendanceSettings } from "./AttendanceSettings";
import { Roster } from "../runners/People";
import { LiveMap } from "../live-map/LiveMap";
import { Search, FlaskConical, Plus } from "lucide-react";
import { RaceActions } from "./RaceActions";
import { useEffect, useState } from "react";
import {
  Link,
  useParams,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { useLive } from "../../app/LiveProvider";
import { Badge, Panel, Empty } from "../../components/ui";
import { DeleteRace } from "./DeleteRace";
import type { Race } from "../../types/domain";
import { CreateRace } from "./CreateRace";
import { dataMode } from "../../services";
import { MatchingSettings } from "./MatchingSettings";
import { datetime } from "../../utils/format";
import { modeLabel } from "../../utils/labels";
export function Races() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const setupTab = params.get("setup") ?? "participants";
  const {
      snapshot,
      races,
      racesLoaded,
      retry,
      raceId: current,
      selectRace,
    } = useLive(),
    { raceId } = useParams();
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState<Race | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState("");
  useEffect(() => {
    if (raceId && races.some((r) => r.race_id === raceId)) selectRace(raceId);
  }, [raceId, races, selectRace]);
  if (raceId && !snapshot)
    return (
      <div className="skeleton" role="status">
        Đang tải giải chạy…
      </div>
    );
  const selected = snapshot?.races.find((r) => r.race_id === raceId);
  if (raceId && !selected)
    return (
      <Empty
        title="Không tìm thấy giải"
        description="Chọn một giải trong danh sách."
      />
    );
  const rows = races
    .map((r) => snapshot?.races.find((item) => item.race_id === r.race_id) ?? r)
    .filter(
      (r) =>
        r.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
        (!status || r.status === status),
    );
  return (
    <>
      <div className="page-title">
        <div>
          <h1>{selected ? "Thiết lập giải" : "Giải chạy"}</h1>
          <p>
            {selected
              ? selected.name
              : "Chọn giải để theo dõi tiến độ và xử lý sự kiện."}
          </p>
        </div>
        {selected && <Badge status={selected.status} />}
        {!selected && dataMode === "api" && (
          <div className="action-row">
            <Link className="button" to="/simulation">
              <FlaskConical size={14} aria-hidden="true" />
              Tạo mô phỏng
            </Link>
            <button
              className="button primary"
              onClick={() => setCreating(true)}
            >
              <Plus size={14} aria-hidden="true" />
              Tạo giải chạy
            </button>
          </div>
        )}
      </div>
      {deleting && (
        <DeleteRace race={deleting} onClose={() => setDeleting(null)} />
      )}
      {location.state?.notice && <p role="status">{location.state.notice}</p>}
      {creating && (
        <CreateRace
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setCreated(id);
            setQuery("");
            setStatus("");
            retry();
          }}
          onRefresh={retry}
        />
      )}
      {created && (
        <p className="success-message" role="status">
          Đã tạo giải chạy.{" "}
          {races.some((r) => r.race_id === created) && (
            <Link to={`/races/${created}`}>Mở giải vừa tạo</Link>
          )}
        </p>
      )}
      {selected && snapshot ? (
        <>
          <Link className="text-link" to="/races">
            ← Tất cả giải chạy
          </Link>
          {dataMode === "api" && (
            <RaceLifecycle key={selected.race_id} race={selected} />
          )}
          <nav className="tabs" aria-label="Thiết lập giải">
            {[
              ["participants", "Người tham gia"],
              ["route", "Tuyến & trạm"],
              ["matching", "Cấu hình ghi nhận"],
              ["general", "Thông tin giải"],
              ...(dataMode === "api" ? [["student", "App sinh viên"]] : []),
            ].map(([id, label]) => (
              <button
                key={id}
                className={setupTab === id ? "active" : ""}
                aria-pressed={setupTab === id}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("setup", id);
                  setParams(next);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          {setupTab === "participants" && (
            <Roster key={selected.race_id} raceId={selected.race_id} />
          )}
          {setupTab === "route" && (
            <LiveMap
              snapshot={snapshot}
              selectedId={null}
              onSelect={() => {}}
            />
          )}
          {setupTab === "matching" && <MatchingSettings />}
          {setupTab === "student" && dataMode === "api" && (
            <>
              <StudentPolicy key={selected.race_id} raceId={selected.race_id} />
              <AttendanceSettings
                key={`attendance-${selected.race_id}`}
                raceId={selected.race_id}
              />
            </>
          )}
          {setupTab === "general" && (
            <Panel title="Thông tin giải">
              <dl className="info-list">
                <dt>Lịch chạy</dt>
                <dd>
                  {selected.started_at
                    ? datetime(selected.started_at)
                    : "Chưa có lịch"}
                </dd>
                <dt>Mở giải thực tế</dt>
                <dd>
                  {selected.actual_start_at
                    ? datetime(selected.actual_start_at)
                    : "Chưa mở giải"}
                </dd>
                <dt>Địa điểm</dt>
                <dd>
                  {selected.location === "—"
                    ? "Chưa có địa điểm"
                    : selected.location}
                </dd>
                <dt>Số vòng</dt>
                <dd>{selected.total_laps ?? "Chưa có thông tin"}</dd>
                <dt>Người tham gia</dt>
                <dd>{selected.participant_count ?? "Đang tải"}</dd>
                <dt>Checkpoint</dt>
                <dd>{snapshot.checkpoints.length}</dd>
                <dt>Tuyến</dt>
                <dd>
                  {snapshot.routeMessage ??
                    `${snapshot.routeDistance_m ?? "—"} m`}
                </dd>
                <dt>Chế độ</dt>
                <dd>
                  {snapshot.dashboard
                    ? modeLabel(snapshot.dashboard.race.checkpoint_mode)
                    : "Chưa có thông tin"}
                </dd>
                <dt>Khoảng cách thời gian tối thiểu giữa hai vòng</dt>
                <dd>
                  {snapshot.dashboard?.race.min_lap_interval_seconds ??
                    "Chưa có thông tin"}{" "}
                  giây
                </dd>
              </dl>
              <Link className="button primary" to="/">
                Mở tổng quan giải
              </Link>
              <details>
                <summary>Định danh giải</summary>
                <code>{selected.race_id}</code>
              </details>
            </Panel>
          )}
        </>
      ) : (
        <section className="panel race-directory" aria-label="Danh sách giải">
          <div className="filter-bar race-filter-bar">
            <label>
              <span className="sr-only">Tìm giải</span>
              <span className="search-input">
                <Search size={18} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm theo tên giải…"
                />
              </span>
            </label>
            <label>
              <span className="sr-only">Trạng thái giải</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="LIVE">Đang diễn ra</option>
                <option value="COMPLETED">Hoàn thành</option>
                <option value="DRAFT">Bản nháp</option>
                <option value="SCHEDULED">Sắp diễn ra</option>
                <option value="CANCELLED">Đã hủy</option>
              </select>
            </label>
            {(query || status) && (
              <button
                className="button race-clear-filter"
                onClick={() => {
                  setQuery("");
                  setStatus("");
                }}
              >
                Xóa bộ lọc
              </button>
            )}
            <span className="race-result-count" role="status">
              {racesLoaded
                ? `${rows.length} / ${races.length} giải`
                : "Đang tải…"}
            </span>
          </div>
          <div className="table-scroll race-table">
            <table>
              <thead>
                <tr>
                  <th>Giải chạy</th>
                  <th>Trạng thái</th>
                  <th>Lịch chạy</th>
                  <th className="race-actions-heading">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.race_id}
                    className={r.race_id === current ? "current-race" : ""}
                  >
                    <td>
                      <Link
                        className="race-name"
                        to={`/races/${r.race_id}`}
                        title={r.name}
                      >
                        {r.name}
                      </Link>
                      <div className="race-row-meta">
                        {r.race_id === current && (
                          <span className="race-current-label">Đang xem</span>
                        )}
                        {r.participant_count != null && (
                          <span>{r.participant_count} người tham gia</span>
                        )}
                        {r.total_laps != null && (
                          <span>{r.total_laps} vòng</span>
                        )}
                      </div>
                      {r.location && r.location !== "—" && (
                        <small className="race-location">{r.location}</small>
                      )}
                    </td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td>
                      <span
                        className={
                          r.started_at ? "race-schedule" : "race-unscheduled"
                        }
                      >
                        {r.started_at ? datetime(r.started_at) : "Chưa có lịch"}
                      </span>
                    </td>
                    <td>
                      <RaceActions
                        race={r}
                        onDelete={
                          dataMode === "api" ? () => setDeleting(r) : undefined
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!racesLoaded && <p role="status">Đang tải danh sách giải…</p>}
          {racesLoaded && !rows.length && (
            <Empty
              title={
                races.length ? "Không có giải phù hợp" : "Chưa có giải chạy"
              }
              description={
                races.length
                  ? "Thay đổi từ khóa hoặc trạng thái lọc."
                  : "Tạo giải để bắt đầu cấu hình."
              }
            />
          )}
        </section>
      )}
    </>
  );
}
