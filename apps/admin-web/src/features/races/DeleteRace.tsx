import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { useLive } from "../../app/LiveProvider";
import { adminOperations } from "../../services/adminOperations";
import { apiAdapter } from "../../services/apiAdapter";
import { request, RequestError } from "../../services/client";
import type { DashboardDto } from "../../services/matchingContract";
import type { Race } from "../../types/domain";
export function DeleteRace({
  race,
  onClose,
}: {
  race: Race;
  onClose: () => void;
}) {
  const { forgetRace, reloadRaces } = useLive();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState(""),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState<number | null>(null),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false),
    [reload, setReload] = useState(0);
  const guard = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const read = useCallback(
    async (signal: AbortSignal) => {
      const d = await request<DashboardDto>(
        `/races/${encodeURIComponent(race.race_id)}/dashboard`,
        { signal },
      );
      if (
        d.race.race_id !== race.race_id ||
        !Number.isFinite(d.summary.active_runners)
      )
        throw new Error("Chưa xác minh được số phiên đang chạy.");
      return d.summary.active_runners;
    },
    [race.race_id],
  );
  useEffect(() => {
    const c = new AbortController();
    setActive(null);
    setError("");
    read(c.signal)
      .then((n) => {
        if (!c.signal.aborted) setActive(n);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [read, reload]);
  async function finish(signal: AbortSignal) {
    forgetRace(race.race_id);
    navigate("/races", {
      replace: true,
      state: { notice: "Đã xóa giải chạy." },
    });
    await reloadRaces(signal).catch(() => {});
    if (!signal.aborted) onClose();
  }
  return (
    <Modal
      title="Xóa giải chạy"
      onClose={() => {
        if (!guard.current) onClose();
      }}
    >
      <p>
        <strong>{race.name}</strong>
      </p>
      <p>
        Mã giải: <code>{race.race_id}</code>
      </p>
      <p>
        Mọi phiên đang chạy tại thời điểm xóa sẽ bị hủy. Xóa vĩnh viễn tuyến, checkpoint/thiết bị trạm, đăng ký, phiên chạy, GPS,
        vòng chạy và sự kiện/audit thuộc giải. Hồ sơ sinh viên và wearable toàn
        hệ thống được giữ lại.
      </p>
      <p>
        Backend có thể dừng mô phỏng do nó quản lý khi xóa. Giao diện không tự
        dừng hoặc kết thúc phiên để vượt điều kiện xóa.
      </p>
      {active === null ? (
        <p>Chưa xác minh điều kiện xóa.</p>
      ) : active > 0 ? (
        <p role="alert">
          Giải có {active} phiên đang chạy. Các phiên này sẽ bị hủy và dữ liệu
          thuộc giải sẽ bị xóa.
        </p>
      ) : (
        <p>Hiện không có phiên đang chạy. Backend sẽ kiểm tra lại khi xóa.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {uncertain ? (
        <>
          <p role="alert">
            Chưa xác định kết quả xóa. Đọc lại danh sách trước khi thử lại.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              if (guard.current) return;
              guard.current = true;
              setBusy(true);
              const c = new AbortController();
              controller.current = c;
              try {
                const rows = await apiAdapter.listRaces(c.signal);
                if (!rows.some((r) => r.race_id === race.race_id))
                  await finish(c.signal);
                else if (!c.signal.aborted) {
                  setUncertain(false);
                  setError(
                    "Giải vẫn còn trong danh sách. Kiểm tra trước khi gửi lại.",
                  );
                  setReload((n) => n + 1);
                }
              } catch (e) {
                if (!c.signal.aborted) setError((e as Error).message);
              } finally {
                guard.current = false;
                if (!c.signal.aborted) setBusy(false);
              }
            }}
          >
            Kiểm tra kết quả xóa
          </button>
        </>
      ) : (
        <>
          {active === null && (
            <button
              className="button"
              disabled={busy}
              onClick={() => setReload((n) => n + 1)}
            >
              Kiểm tra lại điều kiện
            </button>
          )}
          <form
            className="editor-fields"
            onSubmit={async (e) => {
              e.preventDefault();
              if (guard.current || confirmText !== "XÓA" || active === null)
                return;
              guard.current = true;
              setBusy(true);
              setError("");
              const c = new AbortController();
              controller.current = c;
              let sent = false;
              try {
                const current = await read(c.signal);
                setActive(current);
                sent = true;
                const result = await adminOperations.deleteRace(
                  race.race_id,
                  c.signal,
                );
                if (!result.deleted || result.race_id !== race.race_id)
                  throw new RequestError(
                    0,
                    "Phản hồi xóa chưa xác nhận đúng giải.",
                  );
                if (!c.signal.aborted) await finish(c.signal);
              } catch (e) {
                if (c.signal.aborted) return;
                const f = e as RequestError;
                if (
                  sent &&
                  (f.status === 0 || f.status >= 500 || f.status === 404)
                ) {
                  try {
                    const rows = await apiAdapter.listRaces(c.signal);
                    if (!rows.some((r) => r.race_id === race.race_id)) {
                      await finish(c.signal);
                      return;
                    }
                    setError(
                      "Giải vẫn còn sau khi đọc lại. Kiểm tra trước khi gửi xóa lần nữa.",
                    );
                  } catch {
                    if (!c.signal.aborted) {
                      setUncertain(true);
                      setError("Không đọc được kết quả xóa.");
                    }
                  }
                } else {
                  setError(
                    f.code === "RACE_HAS_ACTIVE_RUNS"
                      ? "Backend từ chối: giải còn phiên đang chạy."
                      : f.code === "SIMULATOR_STARTING"
                        ? "Mô phỏng đang tạo giải. Đợi backend trả race_id rồi kiểm tra lại."
                        : f.message,
                  );
                }
              } finally {
                guard.current = false;
                if (!c.signal.aborted) setBusy(false);
              }
            }}
          >
            <label>
              Nhập XÓA để xác nhận
              <input
                autoComplete="off"
                value={confirmText}
                disabled={busy}
                onChange={(e) => setConfirmText(e.target.value)}
              />
            </label>
            <div className="filter-bar">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={onClose}
              >
                Hủy
              </button>
              <button
                className="button danger"
                disabled={busy || confirmText !== "XÓA" || active === null}
              >
                {busy ? "Đang kiểm tra / xóa…" : "Xóa giải"}
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}
