import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Panel } from "../../components/ui";
import { ReferenceIcon } from "../../components/ReferenceIcon";
import { useLive } from "../../app/LiveProvider";
import { dataMode } from "../../services";
import { apiBase, RequestError } from "../../services/client";
import {
  kitActive,
  kitDemo,
  kitLabel,
  kitProgress,
  type KitDemo,
} from "../../services/kitDemo";
import { distance, duration } from "../../utils/format";
import "./kitDemo.css";

const storageKey = `neu:kit-demo:${apiBase}`;
function restore() {
  try {
    return sessionStorage.getItem(storageKey) ?? "";
  } catch {
    return "";
  }
}
export function KitDemoPage() {
  const { reloadRaces } = useLive();
  const [id, setId] = useState(restore);
  const [demo, setDemo] = useState<KitDemo | null>(null);
  const [port, setPort] = useState("COM03");
  const [ports, setPorts] = useState<{ device: string; description: string }[]>(
    [],
  );
  const [student, setStudent] = useState("11235723");
  const [name, setName] = useState("Lê Phương Linh");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [portsLoading, setPortsLoading] = useState(false);
  const [portsError, setPortsError] = useState("");
  const guard = useRef(false);
  const enabled = dataMode !== "mock";

  useEffect(() => {
    if (!demo?.race_id) return;
    const controller = new AbortController();
    void reloadRaces(controller.signal).catch(() => {
      if (!controller.signal.aborted)
        setError(
          "Chưa tải được danh sách giải. Hãy làm mới trước khi mở giải kit.",
        );
    });
    return () => controller.abort();
  }, [demo?.race_id, reloadRaces]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setPortsLoading(true);
    void kitDemo
      .ports(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setPorts(value.items);
          setPortsError(value.error ?? "");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setPortsError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPortsLoading(false);
      });
    return () => controller.abort();
  }, [enabled, retry]);

  useEffect(() => {
    if (!id || !enabled || busy) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await kitDemo.get(id, controller.signal);
        if (controller.signal.aborted) return;
        setDemo(value);
        setMissing(false);
        setError("");
        if (kitActive(value.status)) timer = setTimeout(poll, 1000);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError((e as Error).message);
        setMissing((e as RequestError).status === 404);
        if (![401, 403, 404].includes((e as RequestError).status))
          timer = setTimeout(poll, 5000);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, enabled, busy, retry]);

  async function mutate(action: () => Promise<KitDemo>) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await action();
      setDemo(value);
      setId(value.demo_id);
      try {
        sessionStorage.setItem(storageKey, value.demo_id);
      } catch {
        /* Optional session recovery. */
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  const progress = demo ? kitProgress(demo) : null;
  const locked = busy || (!!id && (!demo || kitActive(demo.status)));
  return (
    <div className="kit-demo-page">
      <div className="page-title">
        <div>
          <div className="eyebrow">TRẢI NGHIỆM BỘ KIT</div>
          <h1>Demo bộ kit C04</h1>
          <p>
            Kết nối Arduino, xuất phát tại C04 và theo dõi kết quả qua từng vòng
            chạy.
          </p>
        </div>
        <span className="kit-demo-tag">
          <ReferenceIcon name="device" /> Arduino · HC-SR04
        </span>
      </div>
      <div className="kit-demo-summary" aria-label="Thông tin lượt chạy">
        <span>
          <ReferenceIcon name="flag" />
          <strong>2 vòng</strong> để hoàn thành
        </span>
        <span>
          <ReferenceIcon name="route" />
          <strong>400–450 m</strong> mỗi vòng
        </span>
        <span>
          <ReferenceIcon name="clock" />
          <strong>≥ 60 giây</strong> mỗi vòng
        </span>
        <span>
          <ReferenceIcon name="checkpoint" />
          <strong>NEU-C04</strong> xuất phát & về đích
        </span>
      </div>
      <div className="kit-demo-setup">
        <Panel
          className="kit-demo-connect"
          title="Kết nối bộ kit"
          subtitle="Chọn cổng kết nối và xác nhận người tham gia."
        >
          <div className="kit-demo-note">
            <ReferenceIcon name="info" />
            <span>
              Đóng <strong>Arduino Serial Monitor</strong> trước khi kết nối để
              bộ kit sẵn sàng nhận tín hiệu.
            </span>
          </div>
          {!enabled && (
            <p role="status">
              Chuyển sang chế độ dữ liệu API để kết nối bộ kit.
            </p>
          )}
          <form
            className="kit-demo-form"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate(() =>
                kitDemo.start({
                  serial_port: port,
                  student_code: student.trim(),
                  full_name: name.trim(),
                }),
              );
            }}
          >
            <label className="kit-demo-port">
              Cổng Serial (COM)
              <input
                list="kit-ports"
                value={port}
                required
                pattern="COM[0-9]{1,3}"
                maxLength={6}
                disabled={locked || !enabled}
                onChange={(e) => setPort(e.target.value.toUpperCase())}
                aria-describedby="kit-port-help"
              />
              <small id="kit-port-help">
                {portsLoading
                  ? "Đang tìm cổng kết nối…"
                  : ports.length
                    ? `Tìm thấy ${ports.length} cổng. Chọn từ danh sách hoặc nhập thủ công.`
                    : "Nhập cổng COM của Arduino, ví dụ COM03."}
              </small>
            </label>
            <button
              className="button kit-demo-scan"
              type="button"
              disabled={portsLoading || busy || !enabled}
              onClick={() => setRetry((v) => v + 1)}
            >
              <ReferenceIcon name="refresh" />
              Tìm lại cổng
            </button>
            <datalist id="kit-ports">
              {ports.map((p) => (
                <option key={p.device} value={p.device}>
                  {p.description}
                </option>
              ))}
            </datalist>
            <label>
              MSSV
              <input
                value={student}
                required
                disabled={locked || !enabled}
                onChange={(e) => setStudent(e.target.value)}
              />
            </label>
            <label>
              Họ và tên
              <input
                value={name}
                required
                disabled={locked || !enabled}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="kit-demo-form-footer">
              <span>
                <ReferenceIcon name="lock" />
                {locked
                  ? "Thông tin được giữ trong phiên hiện tại"
                  : "Một người tham gia cho mỗi phiên kit"}
              </span>
              <button
                className="button primary"
                disabled={locked || !enabled || !student.trim() || !name.trim()}
                type="submit"
              >
                <ReferenceIcon name="device" />
                {busy ? "Đang xử lý…" : "Kết nối kit và tạo phiên"}
              </button>
            </div>
          </form>
          {(error || portsError) && (
            <div className="kit-demo-error" role="alert">
              <ReferenceIcon name="alert" />
              <div>
                <strong>Chưa thể kết nối hoặc cập nhật dữ liệu</strong>
                <p>{error || portsError}</p>
                <button
                  className="button"
                  disabled={busy || portsLoading}
                  onClick={() => setRetry((v) => v + 1)}
                >
                  Thử kết nối lại
                </button>
                {missing && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      setId("");
                      setDemo(null);
                      setMissing(false);
                      setError("");
                      try {
                        sessionStorage.removeItem(storageKey);
                      } catch {
                        /* Optional storage. */
                      }
                    }}
                  >
                    Bỏ phiên không còn tồn tại
                  </button>
                )}
              </div>
            </div>
          )}
        </Panel>
        <Panel
          className="kit-demo-guide"
          title="Ba lượt qua C04"
          subtitle="Nhấn START trên kit trước khi xuất phát."
        >
          <ol className="kit-demo-steps">
            {[
              ["Xuất phát", "Lượt qua đầu tiên mở phiên và bắt đầu đồng hồ."],
              [
                "Hoàn thành vòng 1",
                "Qua C04 sau ít nhất 60 giây. Tiếp tục chạy vòng thứ hai.",
              ],
              [
                "Về đích",
                "Qua C04 sau vòng 2 hợp lệ. Kết quả và đồng hồ tự chốt.",
              ],
            ].map(([title, description], index) => (
              <li
                key={title}
                className={
                  demo &&
                  (index === 0
                    ? !!demo.run
                    : (demo.run?.lap_count ?? 0) >= index)
                    ? "is-done"
                    : ""
                }
              >
                <span className="kit-step-number">{index + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="kit-demo-source">
            <ReferenceIcon name="walk" />
            <p>
              Cảm biến ghi nhận lượt qua thực tế. GPS và bước chân được mô phỏng
              ở tốc độ khoảng <strong>3,2 m/s</strong>.
            </p>
          </div>
        </Panel>
      </div>
      {id && (
        <Panel
          className="kit-demo-tracking"
          title="Theo dõi phiên kit"
          subtitle={
            demo
              ? `${demo.full_name} · ${demo.student_code} · ${demo.serial_port}`
              : "Đang tải phiên đã lưu…"
          }
        >
          {demo && (
            <>
              <div
                className={`kit-demo-status ${demo.status === "COMPLETED" ? "is-complete" : ""}`}
                role="status"
              >
                <span className="kit-status-label">
                  <span /> <strong>{kitLabel(demo.status)}</strong>
                </span>
                <p>{progress?.text}</p>
              </div>
              <progress
                aria-label="Số vòng đã được backend xác nhận"
                value={progress?.laps ?? 0}
                max={progress?.total ?? 2}
              />
              <dl className="kit-demo-metrics">
                <div>
                  <dt>Số vòng hợp lệ</dt>
                  <dd>
                    {progress?.laps}/{progress?.total}
                  </dd>
                </div>
                <div>
                  <dt>Thời gian</dt>
                  <dd>{duration(demo.run?.duration_total_s ?? 0)}</dd>
                </div>
                <div>
                  <dt>Quãng đường mô phỏng</dt>
                  <dd>{distance(demo.run?.distance_total_m ?? 0)}</dd>
                </div>
                <div>
                  <dt>Bước chân mô phỏng</dt>
                  <dd>
                    {(demo.run?.total_steps ?? 0).toLocaleString("vi-VN")}
                  </dd>
                </div>
              </dl>
              <p className="kit-demo-message">{demo.message}</p>
              {demo.error && <p role="alert">{demo.error}</p>}
              <div className="kit-demo-actions">
                <Link
                  className="button"
                  to={`/races/${encodeURIComponent(demo.race_id)}`}
                >
                  Xem giải kit
                </Link>
                <button
                  className="button kit-demo-stop"
                  disabled={busy || !kitActive(demo.status)}
                  onClick={() => void mutate(() => kitDemo.stop(id))}
                >
                  Dừng phiên kit
                </button>
              </div>
            </>
          )}
        </Panel>
      )}
      {!id && (
        <div className="kit-demo-empty">
          <span className="kit-demo-empty-icon">
            <ReferenceIcon name="chart" />
          </span>
          <div>
            <strong>Sẵn sàng cho lượt chạy đầu tiên</strong>
            <p>
              Số vòng, thời gian, quãng đường và bước chân sẽ hiển thị tại đây
              khi kết nối kit.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
