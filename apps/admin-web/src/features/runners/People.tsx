import { SimulationControls } from "../dashboard/Dashboard";
import { CreateStudent } from "./CreateStudent";
import { useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useLive } from "../../app/LiveProvider";
import { Modal } from "../../components/Modal";
import {
  enrollment,
  type Student,
  type Participant,
} from "../../services/enrollment";
import { RequestError } from "../../services/client";
import { RunnerTable } from "./RunnerTable";
export function People({ defaultView = "runs" }: { defaultView?: string }) {
  const [creating, setCreating] = useState(false),
    [directoryRevision, setDirectoryRevision] = useState(0);
  const { raceId } = useLive();
  const [params, setParams] = useSearchParams();
  const tab = params.get("view") ?? defaultView;
  const setTab = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("view", value);
    setParams(next);
  };
  return (
    <>
      {creating && (
        <CreateStudent
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setDirectoryRevision((n) => n + 1);
          }}
        />
      )}
      <div className="page-title">
        <div>
          <h1>Sinh viên</h1>
          <p>
            {tab === "students"
              ? "Quản lý hồ sơ sinh viên trong hệ thống."
              : "Theo dõi tiến độ và đăng ký của giải đang chọn."}
          </p>
        </div>
        {tab === "students" ? (
          <button className="button primary" onClick={() => setCreating(true)}>
            Thêm sinh viên
          </button>
        ) : (
          <SimulationControls />
        )}
      </div>
      <nav className="tabs" aria-label="Danh sách sinh viên">
        {[
          ["runs", "Phiên chạy"],
          ["participants", "Đăng ký của giải"],
          ["students", "Sinh viên toàn hệ thống"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "runs" ? (
        <RunnerTable />
      ) : tab === "students" ? (
        <StudentDirectory key={directoryRevision} />
      ) : raceId ? (
        <Roster key={raceId} raceId={raceId} />
      ) : (
        <p>Chọn giải để xem danh sách đăng ký.</p>
      )}
    </>
  );
}
function StudentDirectory({
  onSelect,
}: {
  onSelect?: (student: Student) => void;
}) {
  const [q, setQ] = useState(""),
    [offset, setOffset] = useState(0),
    [rows, setRows] = useState<Student[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      enrollment
        .students(q, offset, c.signal)
        .then((d) => {
          if (!c.signal.aborted) setRows(d.items);
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!c.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [q, offset, revision]);
  return (
    <section className="panel people-panel">
      <h2>Sinh viên toàn hệ thống</h2>
      <label>
        Tìm sinh viên theo tên hoặc mã
        <input
          value={q}
          maxLength={160}
          onChange={(e) => {
            setQ(e.target.value);
            setOffset(0);
          }}
        />
      </label>
      <p>Tìm kiếm trên máy chủ · 20 hồ sơ mỗi trang</p>
      {loading && (
        <p className={rows.length ? "" : "skeleton"} role="status">
          Đang tải danh sách…
        </p>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button className="button" onClick={() => setRevision((n) => n + 1)}>
            Thử lại
          </button>
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Mã sinh viên</th>
              <th>Họ tên</th>
              <th>Khoa/Viện</th>
              {onSelect && <th>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.student_id}>
                <td>{s.student_code}</td>
                <td>{s.full_name}</td>
                <td>{s.faculty || "Chưa có"}</td>
                {onSelect && (
                  <td>
                    <button
                      className="button"
                      disabled={loading || !!error}
                      onClick={() => onSelect(s)}
                    >
                      Chọn {s.student_code}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !error && !rows.length && (
        <p>
          {q
            ? "Không có sinh viên phù hợp."
            : "Chưa có hồ sơ sinh viên ở trang này."}
        </p>
      )}
      <div className="filter-bar">
        <button
          className="button"
          disabled={loading || offset === 0}
          onClick={() => setOffset((n) => Math.max(0, n - 20))}
        >
          Trang trước
        </button>
        <span>Trang {offset / 20 + 1}</span>
        <button
          className="button"
          disabled={loading || !!error || rows.length < 20}
          onClick={() => setOffset((n) => n + 20)}
        >
          Trang tiếp
        </button>
      </div>
    </section>
  );
}
export function Roster({ raceId }: { raceId: string }) {
  const { snapshot, refreshData, races } = useLive();
  const [rows, setRows] = useState<Participant[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [open, setOpen] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    enrollment
      .participants(raceId, c.signal)
      .then((d) => {
        if (!c.signal.aborted) {
          if (d.race_id !== raceId)
            throw new Error("Danh sách không thuộc giải đang xem.");
          setRows(d.items);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [raceId, revision]);
  return (
    <section className="panel people-panel">
      <div className="roster-heading">
        <div>
          <h2>Người tham gia</h2>
          <p>
            {races.find((r) => r.race_id === raceId)?.name} · Đăng ký không đồng
            nghĩa đã có phiên chạy.
          </p>
        </div>
        <div className="row-actions">
          <button
            className="button"
            disabled={loading}
            onClick={() => setRevision((n) => n + 1)}
          >
            Làm mới đăng ký
          </button>
          <button className="button primary" onClick={() => setOpen(true)}>
            Đăng ký sinh viên
          </button>
        </div>
      </div>
      {message && <p role="status">{message}</p>}
      {loading && (
        <p className={rows.length ? "" : "skeleton"} role="status">
          Đang tải đăng ký…
        </p>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button className="button" onClick={() => setRevision((n) => n + 1)}>
            Thử lại
          </button>
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Số báo danh</th>
              <th>Sinh viên</th>
              <th>Đăng ký</th>
              <th>Phiên chạy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const run =
                snapshot?.dashboard?.race.race_id === raceId
                  ? snapshot.runners.find((r) => r.student_id === p.student_id)
                  : undefined;
              return (
                <tr key={p.participant_id}>
                  <td>{p.bib_number ?? p.display_id ?? "—"}</td>
                  <td>
                    {p.full_name}
                    <br />
                    <small>{p.student_code}</small>
                  </td>
                  <td>
                    {p.registration_status === "REGISTERED"
                      ? "Đã đăng ký"
                      : `Trạng thái: ${p.registration_status}`}
                  </td>
                  <td>
                    {run?.run_id
                      ? "Đã có phiên chạy"
                      : "Chưa thấy phiên trong dữ liệu đã tải"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && !error && !rows.length && <p>Giải chưa có người đăng ký.</p>}
      {open && (
        <Enroll
          raceId={raceId}
          onClose={() => {
            setOpen(false);
            setRevision((n) => n + 1);
          }}
          onSaved={() => {
            setOpen(false);
            setRevision((n) => n + 1);
            refreshData();
            setMessage("Đã cập nhật đăng ký của giải.");
          }}
        />
      )}
    </section>
  );
}
function Enroll({
  raceId,
  onClose,
  onSaved,
}: {
  raceId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [student, setStudent] = useState<Student | null>(null),
    [bib, setBib] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [bibError, setBibError] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const guard = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return (
    <Modal
      title="Đăng ký sinh viên vào giải"
      onClose={() => {
        if (!guard.current) onClose();
      }}
    >
      {!student ? (
        <StudentDirectory onSelect={setStudent} />
      ) : (
        <form
          className="editor-fields"
          onSubmit={async (e) => {
            e.preventDefault();
            if (guard.current || uncertain) return;
            guard.current = true;
            setBusy(true);
            setError("");
            setBibError("");
            const c = new AbortController();
            controller.current = c;
            try {
              await enrollment.register(
                raceId,
                student.student_id,
                bib,
                c.signal,
              );
              if (!c.signal.aborted) onSaved();
            } catch (e) {
              if (c.signal.aborted) return;
              const f = e as RequestError;
              if (f.code === "BIB_NUMBER_EXISTS")
                setBibError("Số báo danh này đã được dùng trong giải.");
              else if (f.status === 0 || f.status >= 500) {
                setUncertain(true);
                setError(
                  "Chưa xác định kết quả đăng ký. Không gửi lại; đóng form và tải lại danh sách để kiểm tra.",
                );
              } else setError(f.message);
            } finally {
              guard.current = false;
              if (!c.signal.aborted) setBusy(false);
            }
          }}
        >
          <p>
            {student.full_name} · {student.student_code}
          </p>
          <button
            type="button"
            className="button"
            disabled={busy || uncertain}
            onClick={() => setStudent(null)}
          >
            Chọn sinh viên khác
          </button>
          <label>
            Số báo danh (không bắt buộc)
            <input
              value={bib}
              disabled={busy || uncertain}
              onChange={(e) => setBib(e.target.value)}
              aria-invalid={!!bibError}
            />
          </label>
          {bibError && <p role="alert">{bibError}</p>}
          <p>Bỏ trống để máy chủ cấp bib. Không tạo phiên chạy khi đăng ký.</p>
          {error && <p role="alert">{error}</p>}
          <button className="button primary" disabled={busy || uncertain}>
            {busy ? "Đang đăng ký…" : "Xác nhận đăng ký"}
          </button>
        </form>
      )}
    </Modal>
  );
}
