import { Link, useParams } from "react-router-dom";
import { Plus, ArrowLeft } from "lucide-react";
import { useLive } from "../../app/LiveProvider";
import { Panel, Empty } from "../../components/ui";
import { datetime } from "../../utils/format";
export function Checkpoints() {
  const { snapshot, error } = useLive(),
    { checkpointId } = useParams();
  if (error)
    return <Empty title="Dữ liệu không khả dụng" description={error} />;
  if (!snapshot) return <div className="empty">Đang tải checkpoint…</div>;
  const selected = snapshot.checkpoints.find(
      (c) => c.checkpoint_id === checkpointId,
    ),
    events = snapshot.events
      .filter((e) => !checkpointId || e.checkpoint_id === checkpointId)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  if (checkpointId && !selected)
    return (
      <Empty
        title="Không tìm thấy checkpoint"
        description="Kiểm tra lại đường dẫn."
      />
    );
  return (
    <>
      {checkpointId && (
        <Link className="back-link" to="/checkpoints">
          <ArrowLeft size={16} /> Tất cả checkpoint
        </Link>
      )}
      <div className="page-title">
        <div>
          <div className="eyebrow">ĐIỂM GHI NHẬN</div>
          <h1>
            {selected ? `${selected.code} · ${selected.name}` : "Checkpoint"}
          </h1>
          <p>
            {snapshot.checkpoints.length} điểm trên tuyến minh họa · Dữ liệu mô
            phỏng
          </p>
        </div>
        <div className="disabled-action">
          <button
            className="button"
            disabled
            title="Chưa có API contract tạo/sửa checkpoint"
          >
            <Plus size={16} /> {selected ? "Chỉnh sửa" : "Thêm checkpoint"}
          </button>
          <small>Chờ API contract tạo / sửa</small>
        </div>
      </div>
      {selected ? (
        <Panel title="Thông tin checkpoint">
          <dl className="info-list">
            <dt>Mã</dt>
            <dd>{selected.code}</dd>
            <dt>Loại</dt>
            <dd>
              {selected.type === "START_FINISH"
                ? "Xuất phát / Về đích"
                : "Trung gian"}
            </dd>
            <dt>Thứ tự</dt>
            <dd>{selected.order}</dd>
            <dt>Thiết bị</dt>
            <dd>{selected.device}</dd>
            <dt>Vị trí</dt>
            <dd>
              {selected.latitude}, {selected.longitude}
            </dd>
            <dt>Sự kiện gần nhất</dt>
            <dd>{datetime(events[0]?.occurred_at ?? null)}</dd>
          </dl>
        </Panel>
      ) : (
        <Panel title="Danh sách checkpoint">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>MÃ / TÊN</th>
                  <th>LOẠI</th>
                  <th>THỨ TỰ</th>
                  <th>THIẾT BỊ</th>
                  <th>SỰ KIỆN GẦN NHẤT</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {snapshot.checkpoints.map((c) => (
                  <tr key={c.checkpoint_id}>
                    <td>
                      <Link
                        className="student-link"
                        to={`/checkpoints/${c.checkpoint_id}`}
                      >
                        <strong>{c.code}</strong>
                        <small>{c.name}</small>
                      </Link>
                    </td>
                    <td>
                      {c.type === "START_FINISH"
                        ? "Xuất phát / Về đích"
                        : "Trung gian"}
                    </td>
                    <td>{c.order}</td>
                    <td>{c.device}</td>
                    <td>
                      {datetime(
                        events.find((e) => e.checkpoint_id === c.checkpoint_id)
                          ?.occurred_at ?? null,
                      )}
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        to={`/checkpoints/${c.checkpoint_id}`}
                      >
                        Chi tiết →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <Panel
        title="Sự kiện gần đây"
        subtitle="Sự kiện chưa gắn sinh viên không ảnh hưởng đến kết quả vòng chạy"
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>THỜI ĐIỂM</th>
                <th>CHECKPOINT</th>
                <th>SINH VIÊN</th>
                <th>NGUỒN</th>
                <th>TRẠNG THÁI</th>
              </tr>
            </thead>
            <tbody>
              {events.slice(0, 20).map((e) => (
                <tr key={e.event_id}>
                  <td>{datetime(e.occurred_at)}</td>
                  <td>
                    {
                      snapshot.checkpoints.find(
                        (c) => c.checkpoint_id === e.checkpoint_id,
                      )?.code
                    }
                  </td>
                  <td>
                    {e.student_id ? (
                      <Link
                        className="text-link"
                        to={`/runners/${e.student_id}/runs/${e.run_id}`}
                      >
                        {snapshot.runners.find(
                          (r) => r.student_id === e.student_id,
                        )?.full_name ?? e.student_id}
                      </Link>
                    ) : (
                      "Chưa xác định sinh viên"
                    )}
                  </td>
                  <td>{e.source}</td>
                  <td>
                    <span
                      className={`badge ${e.status === "MATCHED" ? "badge-completed" : "badge-pending"}`}
                    >
                      {e.status === "MATCHED"
                        ? "Đã gắn sinh viên"
                        : "Chưa xác định"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!events.length && (
          <Empty
            title="Chưa có sự kiện"
            description="Sự kiện mới sẽ xuất hiện tại đây."
          />
        )}
      </Panel>
    </>
  );
}
