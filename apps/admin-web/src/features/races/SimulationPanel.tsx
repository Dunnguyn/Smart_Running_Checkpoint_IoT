import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { Panel } from "../../components/ui";
import { useLive } from "../../app/LiveProvider";
import {
  adminOperations,
  jobActive,
  jobLabel,
  type SimulationJob,
} from "../../services/adminOperations";
import { apiBase, RequestError } from "../../services/client";
import { datetime } from "../../utils/format";
const storageKey = `neu:last-simulation:${apiBase}`;
function restore(): { id: string; raceId: string | null } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    return v && typeof v.id === "string"
      ? { id: v.id, raceId: typeof v.raceId === "string" ? v.raceId : null }
      : null;
  } catch {
    return null;
  }
}
export function SimulationPanel() {
  const { reloadRaces, selectRace } = useLive();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(restore),
    [job, setJob] = useState<SimulationJob | null>(null);
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState("GPS_ONLY"),
    [seed, setSeed] = useState("42"),
    [interval, setIntervalValue] = useState("0.5");
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [missing, setMissing] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const guard = useRef(false),
    controller = useRef<AbortController | null>(null),
    seenRace = useRef<string | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function remember(value: SimulationJob) {
    const next = {
      id: value.simulation_id,
      raceId: value.race_id ?? saved?.raceId ?? null,
    };
    setJob(value);
    setSaved(next);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Session storage is optional. */
    }
  }
  useEffect(() => {
    if (!saved?.id || busy) return;
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const value = await adminOperations.job(saved.id, c.signal);
        if (c.signal.aborted) return;
        remember(value);
        setMissing(false);
        setError("");
        failures = 0;
        if (value.race_id && seenRace.current !== value.race_id) {
          seenRace.current = value.race_id;
          void reloadRaces(c.signal).catch(() => {
            if (!c.signal.aborted)
              setError("Chưa tải được danh sách giải. Có thể thử mở giải lại.");
          });
        }
        if (jobActive(value.status))
          timer = setTimeout(poll, document.hidden ? 10000 : 1500);
      } catch (e) {
        if (c.signal.aborted) return;
        const f = e as RequestError;
        if (f.status === 404) {
          setMissing(true);
          setError(
            "Không còn truy xuất được trạng thái mô phỏng. Backend có thể đã khởi động lại.",
          );
          return;
        }
        setError(f.message);
        if (++failures < 5 && ![401, 403].includes(f.status))
          timer = setTimeout(
            poll,
            Math.max(
              document.hidden ? 10000 : 0,
              Math.min(30000, 1500 * 2 ** failures),
            ),
          );
      }
    };
    void poll();
    return () => {
      c.abort();
      clearTimeout(timer);
    };
    // Only job identity/retry/mutation restarts the single polling chain.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.id, retry, busy, reloadRaces]);
  const openRace = async (path: string) => {
    if (!saved?.raceId) return;
    const c = new AbortController();
    controller.current = c;
    try {
      const races = await reloadRaces(c.signal);
      if (!c.signal.aborted) {
        if (!races.some((race) => race.race_id === saved.raceId)) {
          setError(
            "Giải của mô phỏng không còn trong danh sách. Có thể giải đã bị xóa.",
          );
          return;
        }
        selectRace(saved.raceId);
        navigate(path);
      }
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    }
  };
  return (
    <Panel
      title="Mô phỏng gần nhất trên trình duyệt này"
      subtitle="Trạng thái job được đọc từ backend; đây không phải danh sách mọi mô phỏng của hệ thống."
    >
      <button
        className="button primary"
        disabled={busy || uncertain || (!missing && jobActive(job?.status))}
        onClick={() => setOpen(true)}
      >
        Tạo mô phỏng
      </button>
      {uncertain && (
        <p role="alert">
          Chưa xác định request tạo đã thành công hay chưa. Không tự tạo thêm;
          kiểm tra danh sách giải hoặc log backend trước khi thử trong phiên
          khác.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {saved && (
        <div className="simulation-status">
          <p>
            <strong>
              {missing
                ? "Không xác định trạng thái job"
                : job
                  ? jobLabel(job.status)
                  : "Đang truy xuất mô phỏng…"}
            </strong>
          </p>
          {job && !missing && (
            <p>
              {job.students} người · {job.laps_required} vòng · Bắt đầu{" "}
              {datetime(job.started_at)}
              {job.finished_at
                ? ` · Kết thúc ${datetime(job.finished_at)}`
                : ""}
            </p>
          )}
          {job?.already_running && (
            <p>Backend trả về mô phỏng đang chạy sẵn; không tạo job mới.</p>
          )}
          {saved.raceId && (
            <div className="filter-bar">
              <button className="button" onClick={() => void openRace("/live")}>
                Mở bản đồ giải
              </button>
              <button className="button" onClick={() => void openRace("/")}>
                Xem tổng quan
              </button>
            </div>
          )}
          {job?.status === "RUNNING" && !missing && (
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                if (
                  guard.current ||
                  !confirm(
                    "Dừng mô phỏng? Dữ liệu giải được giữ lại; các phiên có thể bị hủy theo backend.",
                  )
                )
                  return;
                guard.current = true;
                setBusy(true);
                setError("");
                const c = new AbortController();
                controller.current = c;
                try {
                  await adminOperations.stop(saved.id, c.signal);
                  const next = await adminOperations.job(saved.id, c.signal);
                  if (!c.signal.aborted) {
                    remember(next);
                    await reloadRaces(c.signal);
                  }
                } catch (e) {
                  if (!c.signal.aborted)
                    setError(`Chưa xác nhận dừng. ${(e as Error).message}`);
                } finally {
                  guard.current = false;
                  if (!c.signal.aborted) setBusy(false);
                }
              }}
            >
              {busy ? "Đang yêu cầu dừng…" : "Dừng mô phỏng"}
            </button>
          )}
          {error && !missing && (
            <button
              className="button"
              disabled={busy}
              onClick={() => setRetry((n) => n + 1)}
            >
              Đọc lại trạng thái
            </button>
          )}
          {job && (
            <details>
              <summary>Log mô phỏng {missing ? "đã đọc trước đó" : ""}</summary>
              <pre className="simulation-log">
                {job.log_tail || "Chưa có log"}
              </pre>
            </details>
          )}
          <details>
            <summary>Định danh</summary>
            <p>Job: {saved.id}</p>
            <p>Giải: {saved.raceId ?? "Chưa được backend trả về"}</p>
          </details>
        </div>
      )}
      {open && (
        <Modal
          title="Tạo mô phỏng"
          onClose={() => {
            if (!guard.current) setOpen(false);
          }}
        >
          <p>Thao tác này tạo dữ liệu giải chạy mô phỏng mới.</p>
          <p>
            5 người chạy · 4 vòng · Xuất phát đồng bộ (cấu hình cố định của
            backend).
          </p>
          <form
            className="editor-fields"
            onSubmit={async (e) => {
              e.preventDefault();
              if (guard.current || uncertain) return;
              if (
                !Number.isInteger(Number(seed)) ||
                !seed.trim() ||
                !interval.trim() ||
                Number(interval) < 0.5 ||
                Number(interval) > 5
              ) {
                setError(
                  "Seed phải là số nguyên; chu kỳ GPS từ 0,5 đến 5 giây.",
                );
                return;
              }
              guard.current = true;
              setBusy(true);
              setError("");
              const c = new AbortController();
              controller.current = c;
              try {
                const value = await adminOperations.start(
                  {
                    checkpoint_mode: mode,
                    seed: Number(seed),
                    interval_seconds: Number(interval),
                  },
                  c.signal,
                );
                if (!c.signal.aborted) {
                  remember(value);
                  setMissing(false);
                  setOpen(false);
                }
              } catch (e) {
                if (!c.signal.aborted) {
                  const f = e as RequestError;
                  setError(f.message);
                  if (f.status === 0 || f.status >= 500) {
                    setUncertain(true);
                    setOpen(false);
                  }
                }
              } finally {
                guard.current = false;
                if (!c.signal.aborted) setBusy(false);
              }
            }}
          >
            <label>
              Chế độ mô phỏng
              <select
                disabled={busy}
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="GPS_ONLY">GPS — tính vòng bằng GPS</option>
                <option value="GPS_AND_ARDUINO">
                  GPS kết hợp trạm Arduino — chờ ghép sự kiện
                </option>
              </select>
            </label>
            {mode === "GPS_AND_ARDUINO" && (
              <p>
                GPS và sự kiện trạm được mô phỏng; chưa phải dữ liệu từ kit
                Arduino thật.
              </p>
            )}
            <label>
              Seed tái lập
              <input
                required
                type="number"
                step="1"
                disabled={busy}
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
            </label>
            <label>
              Chu kỳ GPS (giây)
              <input
                required
                type="number"
                min="0.5"
                max="5"
                step="any"
                disabled={busy}
                value={interval}
                onChange={(e) => setIntervalValue(e.target.value)}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <button className="button primary" disabled={busy}>
              {busy ? "Đang tạo…" : "Bắt đầu mô phỏng"}
            </button>
          </form>
        </Modal>
      )}
    </Panel>
  );
}
