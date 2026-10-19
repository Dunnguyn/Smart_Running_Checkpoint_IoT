import { useState } from "react";
import type { LiveSnapshot } from "../../types/domain";
import { Panel, Empty, Badge } from "../../components/ui";
import { GpsTimestamp } from "../../components/GpsTimestamp";
import { gpsLabel, sourceLabel } from "../../utils/labels";
export function WatchList({
  snapshot,
  selectedId,
  onSelect,
}: {
  snapshot: LiveSnapshot;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [gps, setGps] = useState("");
  const rows = snapshot.runners.filter(
    (r) =>
      (!status || r.status === status) &&
      (!gps || r.connection === gps) &&
      `${r.bib} ${r.full_name} ${r.student_code}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <Panel
      title="Vị trí người chạy"
      subtitle={`${rows.length} / ${snapshot.runners.length} người trong dữ liệu giải`}
      className="watch-panel"
    >
      <div className="watch-filters">
        <label>
          Tìm người chạy
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tên, mã sinh viên, số báo danh"
          />
        </label>
        <label>
          Trạng thái chạy
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tất cả</option>
            <option value="ACTIVE">Đang chạy</option>
            <option value="COMPLETED">Hoàn thành</option>
            <option value="PENDING">Chưa bắt đầu</option>
            <option value="ABANDONED">Đã dừng</option>
          </select>
        </label>
        <label>
          Vị trí GPS
          <select value={gps} onChange={(e) => setGps(e.target.value)}>
            <option value="">Tất cả GPS</option>
            {["ONLINE", "STALE", "UNAVAILABLE", "FINISHED"].map((k) => (
              <option key={k} value={k}>
                {gpsLabel(k)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="watch-list">
        {rows.map((r) => (
          <button
            key={r.student_id}
            className={`watch-row ${selectedId === r.student_id ? "chosen" : ""}`}
            aria-pressed={selectedId === r.student_id}
            onClick={() => onSelect(r.student_id)}
          >
            <span className="bib-token" style={{ color: r.color }}>
              #{r.bib}
            </span>
            <span className="watch-info">
              <strong>{r.full_name}</strong>
              <small>
                {r.student_code} · Vòng {r.lap_count}/{r.total_laps}
              </small>
              <Badge status={r.status} />
              <small>
                <GpsTimestamp
                  value={r.last_seen_at}
                  completed={r.status === "COMPLETED"}
                />
                <br />
                {sourceLabel(r.source)}
              </small>
            </span>
          </button>
        ))}
      </div>
      {!rows.length && (
        <Empty
          title="Không có người chạy phù hợp"
          description="Thay đổi bộ lọc. Người chưa có GPS vẫn nằm trong danh sách của giải."
        />
      )}
    </Panel>
  );
}
