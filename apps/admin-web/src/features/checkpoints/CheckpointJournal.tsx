import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
        {matchLabels[event.match_status]} · {event.match_status}
      </span>{" "}
      <span className="badge">
        {lapLabels[event.lap_status]} · {event.lap_status}
      </span>
    </>
  );
}
export function CheckpointJournal() {
  const { raceId, snapshot } = useLive();
  return (
    <Journal
      key={raceId}
      raceId={raceId}
      revision={snapshot?.eventRevision ?? 0}
    />
  );
}
function Journal({ raceId, revision }: { raceId: string; revision: number }) {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<MatchStatus | "">(""),
    [checkpoint, setCheckpoint] = useState("");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
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
            match_status: status,
            checkpoint_id: checkpoint.trim(),
            from: from ? new Date(from).toISOString() : undefined,
            to: to ? new Date(to).toISOString() : undefined,
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
  }, [raceId, status, checkpoint, from, to, cursors, revision, refresh]);
  const reset = () => {
    setCursors([undefined]);
    setPage(null);
  };
  return (
    <>
      <Panel
        title="Nhật ký checkpoint"
        subtitle="Trạng thái ghép và trạng thái tính vòng là hai kết quả độc lập"
      >
        <div className="matching-form">
          <label>
            Trạng thái ghép
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as MatchStatus | "");
                reset();
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
            Checkpoint ID
            <input
              value={checkpoint}
              onChange={(e) => {
                setCheckpoint(e.target.value);
                reset();
              }}
            />
          </label>
          <label>
            Từ thời điểm
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                reset();
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
                reset();
              }}
            />
          </label>
          <button className="button" onClick={() => setRefresh((n) => n + 1)}>
            Tải lại sự kiện
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
                    <th>THỜI ĐIỂM / THIẾT BỊ</th>
                    <th>CHECKPOINT</th>
                    <th>KẾT QUẢ</th>
                    <th>LÝ DO</th>
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
                      <td>{event.checkpoint_id}</td>
                      <td>
                        <EventStatus event={event} />
                      </td>
                      <td>{reasonText(event.reason_code)}</td>
                      <td>
                        <button
                          className="button"
                          onClick={() => setSelected(event.event_id)}
                        >
                          Chi tiết sự kiện
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
        <EventDetail
          key={selected}
          id={selected}
          raceId={raceId}
          revision={revision}
          onClose={() => setSelected(null)}
          onChanged={() => setRefresh((n) => n + 1)}
        />
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
                      <code>{c.passage_id}</code>
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
                Xác nhận ứng viên
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
