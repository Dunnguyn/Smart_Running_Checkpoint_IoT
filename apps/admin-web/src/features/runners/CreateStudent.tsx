import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/Modal";
import { request, RequestError } from "../../services/client";
export function CreateStudent({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [faculty, setFaculty] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const guard = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return (
    <Modal
      title="Thêm sinh viên"
      onClose={() => {
        if (!guard.current) onClose();
      }}
    >
      <p>Tạo hồ sơ sinh viên mới trong danh bạ.</p>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (guard.current || uncertain || !code.trim() || !name.trim())
            return;
          guard.current = true;
          setBusy(true);
          setError("");
          controller.current = new AbortController();
          try {
            await request("/students", {
              method: "POST",
              body: {
                student_code: code.trim(),
                full_name: name.trim(),
                faculty: faculty.trim() || null,
              },
              signal: controller.current.signal,
            });
            if (!controller.current.signal.aborted) onCreated();
          } catch (e) {
            if (!controller.current.signal.aborted) {
              const failure = e as RequestError;
              setError(failure.message);
              if (!failure.status || failure.status >= 500) setUncertain(true);
            }
          } finally {
            guard.current = false;
            setBusy(false);
          }
        }}
      >
        <label>
          Mã sinh viên *
          <input
            required
            value={code}
            disabled={busy || uncertain}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <label>
          Họ và tên *
          <input
            required
            value={name}
            disabled={busy || uncertain}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Khoa / Viện
          <input
            value={faculty}
            disabled={busy || uncertain}
            onChange={(e) => setFaculty(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        {uncertain && (
          <p role="alert">
            Chưa xác định kết quả tạo. Đóng form và tìm lại mã sinh viên trước
            khi tạo thêm.
          </p>
        )}
        <div className="row-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            Hủy
          </button>
          <button
            className="button primary"
            disabled={busy || uncertain || !code.trim() || !name.trim()}
          >
            {busy ? "Đang tạo…" : "Tạo sinh viên"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
