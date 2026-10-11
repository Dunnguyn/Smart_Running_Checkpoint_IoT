import { Modal } from "../../components/Modal";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams, useParams } from "react-router-dom";
import { useLive } from "../../app/LiveProvider";
import { Panel, Empty } from "../../components/ui";
import { matchingService } from "../../services/matchingService";
import { RequestError } from "../../services/client";
import {
  canResolve,
  lapLabels,
  matchLabels,
  reasonText,
  type CheckpointEvent,
  type MatchStatus,
  type Resolution,
} from "../../services/matchingContract";
import { datetime } from "../../utils/format";
export function EventStatus({ event }: { event: CheckpointEvent }) {
  return (
    <>
      <span className="badge">
        {matchLabels[event.match_status] ??
          `Trạng thái khác (${event.match_status})`}
      </span>{" "}
      <span className="badge">
        {lapLabels[event.lap_status] ?? `Trạng thái khác (${event.lap_status})`}
      </span>
    </>
  );
}
export function CheckpointJournal({
  attention = false,
}: {
  attention?: boolean;
}) {
  const { raceId, snapshot } = useLive();
  const { checkpointId } = useParams();
  return (
    <Journal
      key={`${raceId}:${checkpointId ?? ""}:${attention}`}
      raceId={raceId}
      checkpointId={checkpointId}
      attention={attention}
      revision={snapshot?.eventRevision ?? 0}
    />
  );
}
function Journal({
  raceId,
  revision,
  checkpointId,
  attention,
}: {
  raceId: string;
  revision: number;
  checkpointId?: string;
  attention: boolean;
}) {
  const [params] = useSearchParams();
  const { snapshot } = useLive();
  const [status, setStatus] = useState<MatchStatus | "">(
      attention
        ? "AMBIGUOUS"
        : ((params.get("status") ?? "") as MatchStatus | ""),
    ),
    [checkpoint, setCheckpoint] = useState(checkpointId ?? "");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [applied, setApplied] = useState({
    status: attention ? "AMBIGUOUS" : (params.get("status") ?? ""),
    checkpoint: checkpointId ?? "",
    from: "",
    to: "",
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [page, setPage] = useState<{
    items: CheckpointEvent[];
    next_cursor: string | null;
  } | null>(null);
  const [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [selected, setSelected] = useState<string | null>(params.get("event"));
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setError("");
    const timer = setTimeout(() => {
      matchingService
        .list(
          raceId,
          {
            match_status: applied.status as MatchStatus | "",
            checkpoint_id: applied.checkpoint,
            from: applied.from
              ? new Date(applied.from).toISOString()
              : undefined,
            to: applied.to ? new Date(applied.to).toISOString() : undefined,
            cursor: cursors.at(-1),
            limit: 20,
          },
          controller.signal,
        )
        .then((value) => {
          if (current) setPage(value);
        })
        .catch((e: Error) => {
          if (current) setError(e.message);
        });
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [raceId, applied, cursors, revision, refresh]);
  const reset = () => {
    setCursors([undefined]);
    setPage(null);
  };
  return (
    <>
      <Panel
        title={attention ? "Sự kiện cần xác nhận" : "Nhật ký checkpoint"}
        subtitle="Trạng thái ghép và trạng thái tính vòng là hai kết quả độc lập"
      >
        <div className="matching-form">
          <label>
            Trạng thái ghép
            <select
              value={status}
              disabled={attention}
              onChange={(e) => {
                setStatus(e.target.value as MatchStatus | "");
              }}
            >
              <option value="">Tất cả</option>
              {Object.entries(matchLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Checkpoint
            <select
              value={checkpoint}
              onChange={(e) => setCheckpoint(e.target.value)}
            >
              <option value="">Tất cả checkpoint</option>
              {snapshot?.checkpoints.map((c) => (
                <option key={c.checkpoint_id} value={c.checkpoint_id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Từ thời điểm
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
              }}
            />
          </label>
          <label>
            Đến trước thời điểm
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
              }}
            />
          </label>
          <button
            className="button primary"
            onClick={() => {
              if (from && to && from >= to) {
                setError("Thời điểm kết thúc phải sau thời điểm bắt đầu.");
                return;
              }
              setApplied({ status, checkpoint, from, to });
              reset();
            }}
          >
            Áp dụng
          </button>
          <button
            className="button"
            onClick={() => {
              const status = attention ? "AMBIGUOUS" : "";
              setStatus(status);
              setCheckpoint("");
              setFrom("");
              setTo("");
              setApplied({ status, checkpoint: "", from: "", to: "" });
              reset();
            }}
          >
            Xóa bộ lọc
          </button>
          <button className="button" onClick={() => setRefresh((n) => n + 1)}>
            Làm mới nhật ký
          </button>
        </div>
        {error ? (
          <p role="alert" className="form-message">
            {error}
          </p>
        ) : !page ? (
          <p className="empty">Đang tải sự kiện…</p>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>THỜI ĐIỂM</th>
                    <th>CHECKPOINT</th>
                    <th>NGƯỜI CHẠY</th>
                    <th>NHẬN DIỆN</th>
                    <th>TÍNH VÒNG</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((event) => (
                    <tr key={event.event_id}>
                      <td>
                        {datetime(event.occurred_at)}
                        <small>{event.device_id}</small>
                      </td>
                      <td>
                        {snapshot?.checkpoints.find(
                          (c) => c.checkpoint_id === event.checkpoint_id,
                        )?.name ?? "Checkpoint chưa có tên"}
                      </td>
                      <td>
                        {event.matched_runner
                          ? `${event.matched_runner.display_id ?? "—"} · ${event.matched_runner.full_name ?? event.matched_runner.student_code ?? ""}`
                          : "Chưa xác định"}
                      </td>
                      <td>
                        <span className="badge">
                          {matchLabels[event.match_status] ??
                            event.match_status}
                        </span>
                        {event.match_status === "AMBIGUOUS" && (
                          <small>
                            {event.candidates_final
                              ? "Sẵn sàng xác nhận"
                              : "Đang thu nhận ứng viên"}
                          </small>
                        )}
                      </td>
                      <td>
                        <span className="badge">
                          {lapLabels[event.lap_status] ?? event.lap_status}
                        </span>
                        {event.reason_code &&
                          event.lap_status !== "COUNTED" && (
                            <small>{reasonText(event.reason_code)}</small>
                          )}
                      </td>
                      <td>
                        <button
                          className="button"
                          onClick={() => setSelected(event.event_id)}
                        >
                          {canResolve(event)
                            ? "Xác nhận người chạy"
                            : "Chi tiết sự kiện"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!page.items.length && (
              <Empty
                title="Chưa có sự kiện phù hợp"
                description="Thử thay đổi bộ lọc hoặc chờ sự kiện từ Gateway."
              />
            )}
            <div className="pagination">
              <button
                className="button"
                disabled={cursors.length === 1}
                onClick={() => {
                  setPage(null);
                  setCursors((s) => s.slice(0, -1));
                }}
              >
                Trang trước
              </button>
              <span>Trang {cursors.length}</span>
              <button
                className="button"
                disabled={!page.next_cursor}
                onClick={() => {
                  setCursors((s) => [...s, page.next_cursor!]);
                  setPage(null);
                }}
              >
                Trang sau
              </button>
            </div>
          </>
        )}
      </Panel>
      {selected && (
        <Modal
          title="Chi tiết và xác nhận sự kiện"
          onClose={() => setSelected(null)}
        >
          <EventDetail
            key={selected}
            id={selected}
            raceId={raceId}
            revision={revision}
            onClose={() => setSelected(null)}
            onChanged={() => setRefresh((n) => n + 1)}
          />
        </Modal>
      )}
    </>
  );
}
function EventDetail({
  id,
  raceId,
  revision,
  onClose,
  onChanged,
}: {
  id: string;
  raceId: string;
  revision: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { refreshData } = useLive();
  const [event, setEvent] = useState<CheckpointEvent | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0),
    [passage, setPassage] = useState(""),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Resolution | null>(null),
    [verified, setVerified] = useState(false);
  const guard = useRef(false),
    mounted = useRef(true),
    writeController = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      writeController.current?.abort();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    matchingService
      .detail(id, controller.signal)
      .then((value) => {
        if (!current) return;
        if (value.race_id !== raceId)
          throw new Error("Sự kiện không thuộc giải đang chọn.");
        setEvent((previous) =>
          previous && previous.version > value.version ? previous : value,
        );
        setVerified(true);
        setError("");
      })
      .catch((e: Error) => {
        if (current) {
          setError(e.message);
          setVerified(false);
        }
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [id, raceId, revision, refresh]);
  async function submit(action: Resolution["action"], replay = false) {
    if (
      !event ||
      guard.current ||
      (!replay && (!canResolve(event) || !verified || pending))
    )
      return;
    if (
      !replay &&
      (!reason.trim() ||
        (action === "CONFIRM" &&
          !event.candidates?.some(
            (c) => c.passage_id === passage && c.available,
          )))
    )
      return;
    const operation: Resolution =
      replay && pending
        ? pending
        : {
            action,
            passage_id: action === "CONFIRM" ? passage : null,
            expected_version: event.version,
            idempotency_key: crypto.randomUUID(),
            reason: reason.trim(),
          };
    guard.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setPending(operation);
    writeController.current = new AbortController();
    try {
      const result = await matchingService.resolve(
        id,
        operation,
        writeController.current.signal,
      );
      if (!mounted.current) return;
      setEvent((previous) =>
        previous && previous.version > result.version ? previous : result,
      );
      setPending(null);
      setPassage("");
      setReason("");
      setNotice("Backend đã ghi nhận thao tác.");
      onChanged();
      refreshData();
    } catch (e) {
      if (!mounted.current) return;
      const failure = e as RequestError;
      setError(failure.message + (failure.code ? ` (${failure.code})` : ""));
      if (failure.status === 409) {
        setPending(null);
        setPassage("");
        setNotice(
          "Sự kiện đã thay đổi. Đọc lại dữ liệu rồi chọn lại; không tự ghi đè phiên bản.",
        );
      } else if (failure.status >= 400 && failure.status < 500)
        setPending(null);
      else
        setNotice(
          "Kết quả gửi chưa rõ. Đang đọc lại sự kiện; chỉ thử lại đúng thao tác cũ khi đã tải lại được.",
        );
      setVerified(false);
      setRefresh((n) => n + 1);
    } finally {
      if (mounted.current) setBusy(false);
      guard.current = false;
    }
  }
  return (
    <Panel
      title="Chi tiết và xác nhận sự kiện"
      action={
        <button className="button" disabled={busy} onClick={onClose}>
          Đóng
        </button>
      }
    >
      {error && (
        <p role="alert" className="form-message">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="form-message">
          {notice}
        </p>
      )}
      <button
        className="button"
        disabled={busy}
        onClick={() => setRefresh((n) => n + 1)}
      >
        Đọc lại trạng thái
      </button>
      {!event ? (
        <p className="empty">Đang tải chi tiết…</p>
      ) : (
        <>
          <details>
            <summary>Chi tiết kỹ thuật và định danh</summary>
            <dl className="info-list">
              <dt>Sự kiện / phiên bản</dt>
              <dd>
                {event.event_id} / {event.version}
              </dd>
              <dt>Checkpoint / thiết bị</dt>
              <dd>
                {event.checkpoint_id} / {event.device_id}
              </dd>
              <dt>Thời điểm / nhận</dt>
              <dd>
                {datetime(event.occurred_at)} / {datetime(event.received_at)}
              </dd>
              <dt>Đóng cửa sổ</dt>
              <dd>{datetime(event.match_deadline_at)}</dd>
              <dt>Kết quả</dt>
              <dd>
                <EventStatus event={event} />
              </dd>
              <dt>Lý do</dt>
              <dd>
                {reasonText(event.reason_code)}{" "}
                <code>{event.reason_code ?? "—"}</code>
              </dd>
              <dt>Runner đã ghép</dt>
              <dd>
                {event.matched_runner ? (
                  <Link
                    to={`/runners/${event.matched_runner.student_id}/runs/${event.matched_runner.run_id}`}
                  >
                    #{event.matched_runner.display_id ?? "—"} ·{" "}
                    {event.matched_runner.full_name ??
                      event.matched_runner.student_code}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
              <dt>Vòng / thời gian vòng</dt>
              <dd>
                {event.lap_number ?? "—"} /{" "}
                {event.lap_duration_ms === null
                  ? "—"
                  : `${event.lap_duration_ms / 1000} giây`}
              </dd>
              <dt>Nguồn</dt>
              <dd>
                {event.checkpoint_source} /{" "}
                {event.telemetry_source ?? "Chưa có thông tin GPS"}
              </dd>
              <dt>Phương thức</dt>
              <dd>{event.method ?? "—"}</dd>
            </dl>
            <p>
              Mã nhận diện: {event.match_status}; mã tính vòng:{" "}
              {event.lap_status}
            </p>
            <button
              className="button"
              onClick={() => {
                navigator.clipboard
                  .writeText(event.event_id)
                  .then(() => setNotice("Đã sao chép mã sự kiện"))
                  .catch(() =>
                    setError(
                      "Không thể sao chép; chọn mã sự kiện trong chi tiết.",
                    ),
                  );
              }}
            >
              Sao chép mã sự kiện
            </button>
          </details>
          <p className="form-message">
            Nguồn Gateway chưa có cờ phân biệt mô phỏng/phần cứng; không xác
            nhận Arduino online hay danh tính người thật. Danh sách ứng viên:{" "}
            {event.candidates_final ? "đã chốt" : "đang thu thập"}.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CHỌN PASSAGE</th>
                  <th>BIB / SINH VIÊN</th>
                  <th>KHOẢNG CÁCH</th>
                  <th>ĐỘ LỆCH</th>
                  <th>KHẢ DỤNG</th>
                </tr>
              </thead>
              <tbody>
                {event.candidates?.map((c) => (
                  <tr key={c.passage_id}>
                    <td>
                      <input
                        type="radio"
                        name="passage"
                        aria-label={`Chọn passage ${c.passage_id}`}
                        checked={passage === c.passage_id}
                        disabled={
                          !canResolve(event) ||
                          !c.available ||
                          busy ||
                          !!pending ||
                          !verified
                        }
                        onChange={() => setPassage(c.passage_id)}
                      />
                    </td>
                    <td>
                      #{c.display_id ?? "—"} · {c.student_code ?? c.student_id}
                    </td>
                    <td>{c.entry_distance_m} m</td>
                    <td>{c.time_delta_ms} ms</td>
                    <td>
                      {c.available ? "Có, theo snapshot backend" : "Không"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="form-message">
            Khả dụng có thể thay đổi do sự kiện cạnh tranh; backend kiểm tra lại
            khi xác nhận.
          </p>
          {canResolve(event) && (
            <div className="matching-form">
              <label>
                Lý do xử lý
                <textarea
                  maxLength={500}
                  required
                  value={reason}
                  disabled={busy || !!pending}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                className="button primary"
                disabled={
                  busy || !!pending || !verified || !passage || !reason.trim()
                }
                onClick={() => void submit("CONFIRM")}
              >
                Xác nhận người chạy
              </button>
              <button
                className="button"
                disabled={busy || !!pending || !verified || !reason.trim()}
                onClick={() => void submit("DISMISS")}
              >
                Loại bỏ sự kiện
              </button>
            </div>
          )}
          {pending && (
            <button
              className="button"
              disabled={busy || !verified}
              onClick={() => void submit(pending.action, true)}
            >
              Thử lại đúng thao tác đã gửi
            </button>
          )}
        </>
      )}
    </Panel>
  );
}
