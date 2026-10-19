import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { Panel, Badge } from "../../components/ui";
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
export function SimulationPanel({ fullPage = false }: { fullPage?: boolean }) {
  const { reloadRaces, selectRace, races } = useLive();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(restore),
    [job, setJob] = useState<SimulationJob | null>(null);
  const [open, setOpen] = useState(fullPage),
    [mode, setMode] = useState("GPS_ONLY"),
    [seed, setSeed] = useState("42"),
    [interval, setIntervalValue] = useState("0.5");
  const [gap, setGap] = useState("0");
  const gapEdited = useRef(false);
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
      raceId:
        value.race_id ??
        (saved?.id === value.simulation_id ? saved.raceId : null),
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
            "Không còn truy xuất được trạng thái mô phỏng. Máy chủ có thể đã khởi động lại; thông tin theo dõi phiên mô phỏng không còn khả dụng.",
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
    <div className={fullPage ? "simulation-grid" : "simulation-secondary"}>
      <Panel
        className="tracking-card"
        title="Mô phỏng gần nhất trên trình duyệt này"
        subtitle="Chỉ theo dõi phiên mô phỏng gần nhất trên trình duyệt này."
        action={
          !fullPage && (
            <button
              className="button primary"
              disabled={
                busy || uncertain || (!missing && jobActive(job?.status))
              }
              onClick={() => setOpen(true)}
            >
              Tạo mô phỏng
            </button>
          )
        }
      >
        {uncertain && (
          <p role="alert">
            Chưa xác định request tạo đã thành công hay chưa. Không tự tạo thêm;
            kiểm tra danh sách giải hoặc log backend trước khi thử trong phiên
            khác.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {!saved && (
          <div className="simulation-empty">
            <strong>Chưa có phiên đang theo dõi</strong>
            <small>
              Tạo một phiên mô phỏng để xem trạng thái và mở bản đồ.
            </small>
          </div>
        )}
        {saved && (
          <div className="simulation-status">
            <p>
              <strong>
                Giải mô phỏng:{" "}
                {races.find((r) => r.race_id === saved.raceId)?.name ??
                  "Chưa xác minh được tên giải"}
              </strong>
            </p>
            <p>
              <strong>
                {missing
                  ? "Chưa xác định trạng thái phiên mô phỏng"
                  : job
                    ? jobLabel(job.status)
                    : "Đang truy xuất mô phỏng…"}
              </strong>
            </p>
            {races.find((r) => r.race_id === saved.raceId) && (
              <p>
                Trạng thái giải:{" "}
                <Badge
                  status={races.find((r) => r.race_id === saved.raceId)!.status}
                />
              </p>
            )}
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
              <p>Đang theo dõi phiên mô phỏng đã chạy sẵn.</p>
            )}
            {saved.raceId && (
              <div className="filter-bar">
                <button
                  className="button"
                  onClick={() => void openRace("/live")}
                >
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
                <summary>
                  Log mô phỏng {missing ? "đã đọc trước đó" : ""}
                </summary>
                <pre className="simulation-log">
                  {job.log_tail || "Chưa có log"}
                </pre>
              </details>
            )}
            <details>
              <summary>Định danh</summary>
              <p>Phiên mô phỏng: {saved.id}</p>
              <p>Giải: {saved.raceId ?? "Chưa được backend trả về"}</p>
            </details>
          </div>
        )}
      </Panel>
      {(open || fullPage) && (
        <SimulationFormSurface
          inline={fullPage}
          title="Tạo mô phỏng"
          onClose={() => {
            if (!guard.current) setOpen(false);
          }}
        >
          <p>Thao tác này tạo dữ liệu giải chạy mô phỏng mới.</p>
          <p>
            5 người chạy · 4 vòng. Thời điểm xuất phát tùy chế độ và khoảng cách
            đã chọn.
          </p>
          <form
            className="editor-fields"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                guard.current ||
                uncertain ||
                (!missing && jobActive(job?.status))
              )
                return;
              if (
                !Number.isInteger(Number(seed)) ||
                !seed.trim() ||
                !interval.trim() ||
                Number(interval) < 0.5 ||
                Number(interval) > 5 ||
                !gap.trim() ||
                !Number.isFinite(Number(gap)) ||
                Number(gap) < 0 ||
                Number(gap) > 12
              ) {
                setError(
                  "Seed phải là số nguyên; chu kỳ GPS từ 0,5 đến 5 giây; khoảng cách xuất phát từ 0 đến 12 giây.",
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
                    runner_start_gap_seconds: Number(gap),
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
            <fieldset className="mode-options" disabled={busy}>
              <legend>Chế độ mô phỏng</legend>
              {(["GPS_ONLY", "GPS_AND_ARDUINO"] as const).map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="simulation-mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => {
                      setMode(value);
                      if (!gapEdited.current)
                        setGap(value === "GPS_AND_ARDUINO" ? "8" : "0");
                    }}
                  />
                  <span>
                    <strong>
                      {value === "GPS_ONLY" ? "GPS" : "GPS + Arduino"}
                    </strong>
                    <small>
                      {value === "GPS_ONLY"
                        ? "Tính vòng bằng GPS."
                        : "Đối chiếu sự kiện trạm mô phỏng."}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            {mode === "GPS_AND_ARDUINO" && (
              <p>
                GPS và sự kiện trạm được mô phỏng; chưa phải dữ liệu từ kit
                Arduino thật.
              </p>
            )}
            <label>
              Khoảng cách xuất phát giữa hai người (giây)
              <input
                required
                type="number"
                min="0"
                max="12"
                step="any"
                disabled={busy}
                value={gap}
                onChange={(e) => {
                  gapEdited.current = true;
                  setGap(e.target.value);
                }}
              />
            </label>
            <p>
              Giãn thời gian xuất phát giúp giảm trường hợp nhiều người cùng đi
              qua checkpoint. Đặt 0 để thử tình huống xuất phát đồng thời. Vẫn
              có thể cần xác nhận khi nhiều ứng viên trùng cửa sổ đối chiếu.
            </p>
            <details>
              <summary>Tùy chọn nâng cao</summary>
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
            </details>
            {error && <p role="alert">{error}</p>}
            <button
              className="button primary"
              disabled={
                busy || uncertain || (!missing && jobActive(job?.status))
              }
            >
              {busy ? "Đang tạo…" : "Bắt đầu mô phỏng"}
            </button>
          </form>
        </SimulationFormSurface>
      )}
    </div>
  );
}

function SimulationFormSurface({
  inline,
  title,
  onClose,
  children,
}: {
  inline: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return inline ? (
    <Panel className="simulation-create" title="Tạo phiên mô phỏng">
      {children}
    </Panel>
  ) : (
    <Modal title={title} onClose={onClose}>
      {children}
    </Modal>
  );
}
