import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLive } from "../../app/LiveProvider";
import { Badge, Panel, Empty } from "../../components/ui";
import { SimulationPanel } from "./SimulationPanel";
import { DeleteRace } from "./DeleteRace";
import type { Race } from "../../types/domain";
import { CreateRace } from "./CreateRace";
import { dataMode } from "../../services";
import { MatchingSettings } from "./MatchingSettings";
import { datetime } from "../../utils/format";
import { modeLabel } from "../../utils/labels";
export function Races() {
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
        r.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
        (!status || r.status === status),
    );
  return (
    <>
      <div className="page-title">
        <div>
          <h1>{selected?.name ?? "Giải chạy"}</h1>
          <p>
            {selected
              ? "Thông tin giải đang xem"
              : "Chọn giải để theo dõi tiến độ và xử lý sự kiện."}
          </p>
        </div>
        {selected && <Badge status={selected.status} />}
        {!selected && dataMode === "api" && (
          <button className="button primary" onClick={() => setCreating(true)}>
            Tạo giải chạy
          </button>
        )}
      </div>
      {deleting && (
        <DeleteRace race={deleting} onClose={() => setDeleting(null)} />
      )}
      {!selected && dataMode === "api" && <SimulationPanel />}
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
          <Panel title="Thông tin giải">
            <dl className="info-list">
              <dt>Lịch chạy</dt>
              <dd>
                {selected.started_at
                  ? datetime(selected.started_at)
                  : "Chưa có lịch"}
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
          <details className="panel statistics">
            <summary>Cấu hình GPS / Arduino</summary>
            <MatchingSettings />
          </details>
        </>
      ) : (
        <Panel
          title="Danh sách giải"
          subtitle="Tìm và lọc trong toàn bộ danh sách giải đã tải."
        >
          <div className="filter-bar">
            <label>
              Tìm giải
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tên giải chạy"
              />
            </label>
            <label>
              Trạng thái giải
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="LIVE">Đang diễn ra</option>
                <option value="COMPLETED">Hoàn thành</option>
                <option value="DRAFT">Bản nháp</option>
                <option value="SCHEDULED">Sắp diễn ra</option>
                <option value="CANCELLED">Đã hủy</option>
              </select>
            </label>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Giải chạy</th>
                  <th>Trạng thái</th>
                  <th>Lịch chạy</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.race_id}
                    className={r.race_id === current ? "current-race" : ""}
                  >
                    <td>
                      <strong>{r.name}</strong>
                      {r.race_id === current && <small>Đang xem</small>}
                      {r.participant_count != null && (
                        <small>
                          {r.participant_count} người · {r.total_laps ?? "—"}{" "}
                          vòng
                        </small>
                      )}
                    </td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td>
                      {r.started_at ? datetime(r.started_at) : "Chưa có lịch"}
                    </td>
                    <td>
                      <Link
                        className="button primary"
                        to={`/races/${r.race_id}`}
                      >
                        Mở giải
                      </Link>
                      {dataMode === "api" && (
                        <details className="race-actions">
                          <summary>Thao tác khác</summary>
                          <button
                            className="button danger"
                            onClick={() => setDeleting(r)}
                          >
                            Xóa giải
                          </button>
                        </details>
                      )}
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
        </Panel>
      )}
    </>
  );
}
