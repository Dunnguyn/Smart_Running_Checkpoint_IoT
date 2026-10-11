import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLive } from "../../app/LiveProvider";
import { Panel } from "../../components/ui";
import { Modal } from "../../components/Modal";
import { CheckpointJournal } from "./CheckpointJournal";
import { RegisterDevice } from "./RegisterDevice";
import { hasRuns, routeAccess } from "../../services/mapEditorService";
export function Checkpoints() {
  const { snapshot, raceId } = useLive();
  const [params, setParams] = useSearchParams();
  const tab =
    params.get("tab") ?? (params.has("event") ? "journal" : "attention");
  const [register, setRegister] = useState<{
    race: string;
    checkpoint: string;
  } | null>(null);
  const access = routeAccess(
    snapshot?.dashboard?.race,
    hasRuns(snapshot?.dashboard),
  );
  const locked = access.blocked;
  if (!snapshot)
    return (
      <div className="skeleton" role="status">
        Đang tải checkpoint…
      </div>
    );
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Checkpoint</h1>
          <p>
            Xác nhận người chạy, kiểm tra kết quả tính vòng và quản lý trạm.
          </p>
        </div>
      </div>
      <nav className="tabs" aria-label="Các mục checkpoint">
        {[
          ["attention", "Cần xác nhận"],
          ["journal", "Nhật ký"],
          ["stations", "Trạm và thiết bị"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-current={tab === key ? "page" : undefined}
            className={tab === key ? "active" : ""}
            onClick={() => {
              const p = new URLSearchParams();
              p.set("tab", key);
              setParams(p);
            }}
          >
            {label}
            {key === "attention" && snapshot.dashboard && (
              <span className="count-chip">
                {snapshot.dashboard.summary.ambiguous_matches}
              </span>
            )}
          </button>
        ))}
      </nav>
      {tab === "stations" ? (
        <Panel
          title="Trạm và thiết bị"
          subtitle="Danh sách thiết bị và trạng thái online chưa được backend hỗ trợ."
        >
          {locked && <p className="map-note">{access.reason}</p>}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Checkpoint</th>
                  <th>Loại</th>
                  <th>Vĩ độ / Kinh độ</th>
                  <th>Bán kính</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.checkpoints.map((c) => (
                  <tr key={c.checkpoint_id}>
                    <td>
                      <strong>
                        {c.code} · {c.name}
                      </strong>
                      <details>
                        <summary>Mã định danh</summary>
                        <code>{c.checkpoint_id}</code>
                      </details>
                    </td>
                    <td>
                      {c.type === "START_FINISH"
                        ? "Điểm tính vòng"
                        : "Điểm trung gian"}
                    </td>
                    <td>
                      {c.latitude ?? "Chưa có"} / {c.longitude ?? "Chưa có"}
                    </td>
                    <td>
                      {c.radius_m == null ? "Chưa có" : `${c.radius_m} m`}
                    </td>
                    <td>
                      <div className="row-actions">
                        {locked ? (
                          <button
                            className="button"
                            disabled
                            title={access.reason}
                          >
                            Chỉnh sửa
                          </button>
                        ) : (
                          <Link
                            className="button"
                            to={`/live?edit=checkpoint&checkpoint=${c.checkpoint_id}`}
                          >
                            Chỉnh sửa
                          </Link>
                        )}
                        <button
                          className="button"
                          onClick={() =>
                            setRegister({
                              race: raceId,
                              checkpoint: c.checkpoint_id,
                            })
                          }
                        >
                          Đăng ký thiết bị
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!snapshot.checkpoints.length && (
            <p className="empty">Giải chưa có checkpoint.</p>
          )}
        </Panel>
      ) : (
        <CheckpointJournal key={tab} attention={tab === "attention"} />
      )}
      {register?.race === raceId && (
        <Modal title="Đăng ký thiết bị" onClose={() => setRegister(null)}>
          <RegisterDevice checkpointId={register.checkpoint} />
        </Modal>
      )}
    </>
  );
}
