import { useState } from "react";
import { Modal } from "../../components/Modal";
import { request } from "../../services/client";
import type { Student } from "../../services/enrollment";
export function StudentAccount({
  student,
  onClose,
}: {
  student: Student;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  return (
    <Modal
      title="Cấp tài khoản app sinh viên"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        {student.full_name} · {student.student_code}
      </p>
      <p>
        Mật khẩu tạm thời chỉ hiển thị trong cửa sổ này. Sinh viên phải đổi mật
        khẩu khi đăng nhập lần đầu.
      </p>
      {error && <p role="alert">{error}</p>}
      {password ? (
        <label>
          Mật khẩu tạm thời
          <input
            readOnly
            value={password}
            autoComplete="off"
            aria-label="Mật khẩu tạm thời"
          />
          <span>
            Chuyển mật khẩu cho đúng sinh viên qua kênh riêng trước khi đóng.
          </span>
        </label>
      ) : (
        <button
          className="button primary"
          disabled={busy || attempted}
          onClick={async () => {
            setBusy(true);
            setAttempted(true);
            setError("");
            try {
              const result = await request<{ temporary_password: string }>(
                "/admin/student-accounts",
                { method: "POST", body: { student_id: student.student_id } },
              );
              setPassword(result.temporary_password);
            } catch (e) {
              setError(
                `${(e as Error).message} Nếu yêu cầu đã tới máy chủ nhưng mất phản hồi, cần quản trị backend kiểm tra tài khoản và cấp lại mật khẩu.`,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Đang cấp tài khoản…" : "Xác nhận cấp tài khoản"}
        </button>
      )}
    </Modal>
  );
}
