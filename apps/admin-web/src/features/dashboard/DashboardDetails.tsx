import { Link } from "react-router-dom";
import { Panel } from "../../components/ui";
import { EventStatus } from "../checkpoints/CheckpointJournal";
import type { DashboardDto } from "../../services/matchingContract";
import { datetime, distance, duration } from "../../utils/format";
export function DashboardDetails({
  data,
  pending,
}: {
  data: DashboardDto;
  pending: number;
}) {
  const s = data.summary;
  return (
    <>
      <Panel
        title={`Chế độ ${data.race.checkpoint_mode}`}
        subtitle={
          data.race.checkpoint_mode === "GPS_ONLY"
            ? "GPS geofence hợp lệ tính vòng tại backend. Arduino UNASSIGNED là hành vi dự kiến."
            : "GPS tạo passage chờ Arduino. Backend đối chiếu sau khi cửa sổ đóng; không chọn runner gần nhất."
        }
      >
        <div className="matching-form">
          {[
            ["Đã bắt đầu", s.started_runners],
            ["Chưa bắt đầu", s.not_started_runners],
            ["Đạt mục tiêu vòng", s.runners_at_lap_target],
            ["Tổng vòng", s.laps_recorded],
            ["Tổng quãng đường", distance(s.distance_total_m)],
            ["Tổng bước chân", s.steps_total.toLocaleString("vi-VN")],
            [
              "Thời gian trung bình đã hoàn thành",
              duration(s.average_duration_s),
            ],
            ["Chờ đối chiếu", s.pending_matches],
            ["Cần xác nhận", s.ambiguous_matches],
          ].map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <h2>{value}</h2>
            </div>
          ))}
        </div>
        <p className="form-message">
          {Object.entries(s.checkpoint_events_by_status)
            .map(([status, count]) => `${status}: ${count}`)
            .join(" · ") || "Chưa có sự kiện checkpoint"}
        </p>
        {pending > 0 && (
          <p role="status" className="form-message">
            GPS_PASSAGE_PENDING_ARDUINO: vừa nhận {pending} passage có bằng
            chứng GPS, chưa tính vòng. Kết quả tiếp theo do backend cung cấp.
          </p>
        )}
      </Panel>
      <div className="detail-grid">
        <Panel title="Top runner" subtitle="Giữ nguyên thứ tự backend trả về">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>BIB</th>
                  <th>SINH VIÊN</th>
                  <th>VÒNG</th>
                  <th>THỜI GIAN</th>
                </tr>
              </thead>
              <tbody>
                {data.top_runners.map((r) => (
                  <tr key={r.run_id || r.student_id}>
                    <td>{r.bib_number ?? r.display_id ?? "—"}</td>
                    <td>
                      {r.run_id ? (
                        <Link to={`/runners/${r.student_id}/runs/${r.run_id}`}>
                          {r.full_name}
                        </Link>
                      ) : (
                        r.full_name
                      )}
                    </td>
                    <td>{r.lap_count}</td>
                    <td>{duration(r.duration_total_s ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Sự kiện checkpoint gần nhất">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>THỜI ĐIỂM</th>
                  <th>KẾT QUẢ</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_checkpoint_events.map((e) => (
                  <tr key={e.event_id}>
                    <td>
                      <Link
                        to={`/checkpoints?event=${encodeURIComponent(e.event_id)}`}
                      >
                        {datetime(e.occurred_at)}
                      </Link>
                    </td>
                    <td>
                      <EventStatus event={e} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link className="panel-link" to="/checkpoints">
            Mở nhật ký và xử lý ứng viên →
          </Link>
        </Panel>
      </div>
    </>
  );
}
