import { useEffect, useRef, useState } from "react";
import type { Race } from "../../types/domain";
import { useLive } from "../../app/LiveProvider";
import { Modal } from "../../components/Modal";
import {
  changeRaceStatus,
  nextRaceTransition,
  type RaceTransition,
} from "../../services/raceLifecycle";
export function RaceLifecycle({ race }: { race: Race }) {
  const { reloadRaces, refreshData } = useLive();
  const [command, setCommand] = useState<RaceTransition>();
  const [busy, setBusy] = useState(false);
  const [needsRead, setNeedsRead] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const guard = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const next = nextRaceTransition(race.status);
  async function reload(signal: AbortSignal) {
    const rows = await reloadRaces(signal);
    const latest = rows.find((r) => r.race_id === race.race_id);
    if (!latest)
      throw new Error(
        "Không tìm thấy giải trong danh sách mới. Hãy đóng cửa sổ và tải lại trang.",
      );
    await refreshData();
    return latest;
  }
  async function act(readOnly: boolean) {
    if (!command || guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    const c = new AbortController();
    controller.current = c;
    try {
      if (!readOnly) {
        await changeRaceStatus(race.race_id, command, c.signal);
        if (c.signal.aborted) return;
        setConfirmed(true);
        setNeedsRead(true);
        setNotice(
          command.status === "LIVE"
            ? "Backend đã xác nhận giải đang diễn ra."
            : "Backend đã xác nhận giải sắp diễn ra.",
        );
      }
      const latest = await reload(c.signal);
      if (c.signal.aborted) return;
      if (latest.status === command.status) {
        setNotice(
          command.status === "LIVE"
            ? "Đã xác nhận giải đang diễn ra. Sinh viên đủ điều kiện có thể bắt đầu chạy."
            : "Đã xác nhận giải sắp diễn ra. Có thể công bố và mở đăng ký trong mục App sinh viên.",
        );
        setCommand(undefined);
        setConfirmed(false);
        setNeedsRead(false);
      } else if (
        latest.status === command.expected_status &&
        !confirmed &&
        readOnly
      ) {
        setNeedsRead(false);
        setError(
          "Đã tải trạng thái hiện tại. Bạn có thể xác nhận lại thao tác.",
        );
      } else {
        setNeedsRead(true);
        setError(
          "Trạng thái hiện tại khác với thao tác đang xác nhận. Đóng cửa sổ để xem lại giải.",
        );
      }
    } catch (e) {
      if (!c.signal.aborted) {
        setNeedsRead(true);
        setError((e as Error).message);
      }
    } finally {
      guard.current = false;
      if (!c.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      aria-label="Trạng thái giải"
      className="panel"
      style={{ padding: 20, marginBlock: 16 }}
    >
      {notice && <p role="status">{notice}</p>}
      {next ? (
        <button
          className="button primary"
          onClick={() => {
            setCommand(next);
            setError("");
            setNotice("");
          }}
        >
          {next.status === "LIVE"
            ? "Mở giải sang LIVE"
            : "Chuyển sang Sắp diễn ra"}
        </button>
      ) : (
        <p>
          {race.status === "LIVE"
            ? "Giải đang diễn ra."
            : race.status === "CANCELLED"
              ? "Giải đã hủy."
              : "Giải đã hoàn thành."}
        </p>
      )}
      {command && (
        <Modal
          title={
            command.status === "LIVE"
              ? "Mở giải chạy?"
              : "Chuyển giải sang Sắp diễn ra?"
          }
          onClose={() => {
            if (!guard.current) setCommand(undefined);
          }}
        >
          <p>
            <strong>{race.name}</strong>
          </p>
          <p>
            {command.status === "LIVE"
              ? "Giải sẽ bắt đầu nhận phiên chạy của sinh viên đã đăng ký và check-in. Đăng ký mới sẽ đóng khi chuyển sang LIVE; hãy kiểm tra danh sách tham gia trước khi mở giải. Thời điểm mở thực tế được máy chủ ghi nhận."
              : "Giải sẽ chuyển từ bản nháp sang Sắp diễn ra. Sau đó thiết lập công bố và cửa sổ đăng ký trong mục App sinh viên."}
          </p>
          {notice && <p role="status">{notice}</p>}
          {error && <p role="alert">{error}</p>}
          {needsRead || confirmed ? (
            <>
              <p>
                Tải lại trạng thái để kiểm tra kết quả trước khi thực hiện thao
                tác tiếp.
              </p>
              <button
                className="button"
                disabled={busy}
                onClick={() => void act(true)}
              >
                {busy ? "Đang kiểm tra…" : "Kiểm tra trạng thái"}
              </button>
            </>
          ) : (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void act(false)}
            >
              {busy
                ? "Đang gửi…"
                : command.status === "LIVE"
                  ? "Xác nhận mở giải"
                  : "Xác nhận chuyển trạng thái"}
            </button>
          )}
        </Modal>
      )}
    </section>
  );
}
