import { ChevronRight, Radio, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import type { LiveSnapshot } from "../../types/domain";
import { Panel, Empty } from "../../components/ui";
import { distance } from "../../utils/format";
export function WatchList({
  snapshot,
  selectedId,
  onSelect,
}: {
  snapshot: LiveSnapshot;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const runners = snapshot.runners
    .filter((r) => r.status === "ACTIVE" && r.connection === "ONLINE")
    .slice(0, 8);
  return (
    <Panel
      title="Đang theo dõi"
      subtitle={`${runners.length} sinh viên có vị trí cập nhật`}
      action={<Radio size={19} className="teal" />}
      className="watch-panel"
    >
      <div className="watch-list">
        {runners.map((r) => (
          <button
            key={r.student_id}
            aria-pressed={selectedId === r.student_id}
            className={`watch-row ${selectedId === r.student_id ? "chosen" : ""}`}
            onClick={() => onSelect(r.student_id)}
          >
            <span
              className="bib-token"
              style={{ background: r.color + "15", color: r.color }}
            >
              #{r.bib}
            </span>
            <span className="watch-info">
              <strong>{r.full_name}</strong>
              <small>
                {r.student_code} <span>·</span> Vòng {r.lap_count}/
                {r.total_laps}
              </small>
              <span className="progress">
                <i
                  style={{
                    width: `${Math.min(100, (r.lap_count / (r.total_laps || 1)) * 100)}%`,
                    background: r.color,
                  }}
                />
              </span>
            </span>
            <span className="watch-distance">
              {distance(r.distance_total_m)}
              <small>
                <MapPin size={10} /> Trực tuyến
              </small>
            </span>
          </button>
        ))}
      </div>
      {!runners.length && (
        <Empty
          title="Chưa có vị trí GPS mới để theo dõi"
          description="Phiên chạy có thể vẫn đang hoạt động nhưng thiếu GPS hoặc dữ liệu đã cũ. Xem trạng thái phiên trong bảng sinh viên."
        />
      )}
      <Link className="panel-link" to="/runners">
        Xem tất cả sinh viên <ChevronRight size={16} />
      </Link>
    </Panel>
  );
}
