import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLive } from "../../app/LiveProvider";
import { Panel } from "../../components/ui";
import {
  emptyAttendanceDraft,
  validateAttendanceDraft,
  validAttendanceCheckpoint,
  type AttendanceField,
} from "../../services/attendanceDraft";
import "./attendance.css";

const labels: Record<AttendanceField, string> = {
  check_in_checkpoint_id: "Trạm check-in",
  check_out_checkpoint_id: "Trạm check-out",
  check_in_open_at: "Mở check-in (UTC+7)",
  check_in_close_at: "Đóng check-in (UTC+7)",
  check_out_open_at: "Mở check-out (UTC+7)",
  check_out_close_at: "Đóng check-out (UTC+7)",
  max_position_age_seconds: "Tuổi vị trí tối đa (giây)",
  max_accuracy_m: "Sai số GPS tối đa (m)",
};

export function AttendanceSettings({ raceId }: { raceId: string }) {
  const { snapshot, setDirty } = useLive();
  const [draft, setDraft] = useState(emptyAttendanceDraft);
  const [checked, setChecked] = useState(false);
  const [touched, setTouched] = useState<
    Partial<Record<AttendanceField, boolean>>
  >({});
  const cps = (snapshot?.checkpoints ?? []).filter(
    (cp) => cp.race_id === raceId,
  );
  const dirty = Object.values(draft).some(Boolean);
  const errors = validateAttendanceDraft(draft, cps, raceId);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  const change = (key: AttendanceField, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setChecked(false);
  };
  const error = (key: AttendanceField) =>
    (checked || touched[key]) && errors[key];
  const attrs = (key: AttendanceField) => ({
    id: `attendance-${key}`,
    "aria-label": labels[key],
    value: draft[key],
    "aria-invalid": !!error(key),
    "aria-describedby": error(key) ? `attendance-${key}-error` : undefined,
    onBlur: () => setTouched((t) => ({ ...t, [key]: true })),
  });
  const fieldError = (key: AttendanceField) =>
    error(key) && (
      <small className="field-error" id={`attendance-${key}-error`}>
        {error(key)}
      </small>
    );
  const route = `/races/${encodeURIComponent(raceId)}?setup=route`;
  return (
    <Panel
      title="Cấu hình điểm danh"
      subtitle="Chuẩn bị trạm, khung giờ và yêu cầu vị trí cho sinh viên."
      className="attendance-settings"
    >
      <div className="attendance-notice" role="status">
        <strong>Chưa thể đọc cấu hình hiện tại</strong>
        <p>
          Hệ thống chưa hỗ trợ đọc cấu hình điểm danh. Chưa thể xác định giải đã
          cấu hình, đang mở hay đã khóa. Chức năng lưu tạm thời chưa khả dụng.
        </p>
        <p>
          Bạn có thể chuẩn bị bản nháp bên dưới để kiểm tra thông tin. Bản nháp
          chỉ nằm trên trang này, không thay đổi cấu hình của giải.
        </p>
      </div>
      <p>
        Chuyển giải sang LIVE không tự mở check-in. Check-in cũng không tự bắt
        đầu phiên chạy. Cấu hình sẽ khóa sau lần check-in đầu tiên.
      </p>
      {!cps.length && (
        <div className="attendance-notice">
          <strong>Chưa có trạm thuộc giải</strong>
          <p>
            Thêm trạm có tọa độ và vùng hợp lệ trước khi chuẩn bị điểm danh.
          </p>
          <Link className="button" to={route}>
            Thiết lập tuyến & trạm
          </Link>
        </div>
      )}
      <form
        className="editor-fields"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setChecked(true);
          const key = Object.keys(errors).find(
            (key) =>
              !document
                .getElementById(`attendance-${key}`)
                ?.hasAttribute("disabled"),
          );
          if (key) document.getElementById(`attendance-${key}`)?.focus();
        }}
      >
        <p>
          <strong>Bản nháp chuẩn bị · Chưa lưu</strong> — Tất cả thời gian theo
          giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7).
        </p>
        {(
          [
            ["check_in", "1. Check-in", "Xác nhận sinh viên có mặt tại giải."],
            [
              "check_out",
              "2. Check-out",
              "Xác nhận sinh viên rời giải; phiên chạy đang hoạt động phải kết thúc trước.",
            ],
          ] as const
        ).map(([prefix, title, help]) => {
          const key = `${prefix}_checkpoint_id` as const;
          const cp = cps.find((c) => c.checkpoint_id === draft[key]);
          return (
            <fieldset key={prefix}>
              <legend>{title}</legend>
              <p>{help}</p>
              <label htmlFor={`attendance-${key}`}>
                Trạm {prefix === "check_in" ? "check-in" : "check-out"}
                <select
                  {...attrs(key)}
                  onChange={(e) => change(key, e.target.value)}
                  disabled={!cps.length}
                >
                  <option value="">Chọn trạm thuộc giải</option>
                  {cps.map((c) => (
                    <option
                      key={c.checkpoint_id}
                      value={c.checkpoint_id}
                      disabled={!validAttendanceCheckpoint(c, raceId)}
                    >
                      {c.code} · {c.name}
                      {validAttendanceCheckpoint(c, raceId)
                        ? ""
                        : " · Chưa có vùng hợp lệ"}
                    </option>
                  ))}
                </select>
                {fieldError(key)}
              </label>
              {cp && (
                <p>
                  Vị trí: {cp.latitude ?? "Chưa có"},{" "}
                  {cp.longitude ?? "Chưa có"}. Vùng hợp lệ: bán kính{" "}
                  {cp.radius_m ?? "chưa có"} m quanh trạm, theo cấu hình tuyến.{" "}
                  <Link to={route}>Kiểm tra trên bản đồ</Link>
                </p>
              )}
              <div className="attendance-grid">
                {(
                  [
                    ["open", "Mở"],
                    ["close", "Đóng"],
                  ] as const
                ).map(([edge, label]) => {
                  const timeKey = `${prefix}_${edge}_at` as const;
                  return (
                    <label key={timeKey} htmlFor={`attendance-${timeKey}`}>
                      {label} {prefix === "check_in" ? "check-in" : "check-out"}{" "}
                      (UTC+7)
                      <input
                        type="datetime-local"
                        {...attrs(timeKey)}
                        onChange={(e) => change(timeKey, e.target.value)}
                      />
                      {fieldError(timeKey)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        <fieldset>
          <legend>3. Điều kiện GPS</legend>
          <div className="attendance-grid">
            <label htmlFor="attendance-max_position_age_seconds">
              Tuổi vị trí tối đa (giây)
              <input
                type="number"
                min="5"
                max="60"
                step="1"
                {...attrs("max_position_age_seconds")}
                onChange={(e) =>
                  change("max_position_age_seconds", e.target.value)
                }
              />
              <small>
                5–60 giây. Vị trí phải được lấy đủ gần thời điểm gửi điểm danh.
              </small>
              {fieldError("max_position_age_seconds")}
            </label>
            <label htmlFor="attendance-max_accuracy_m">
              Sai số GPS tối đa (m)
              <input
                type="number"
                min="5"
                max="100"
                step="any"
                {...attrs("max_accuracy_m")}
                onChange={(e) => change("max_accuracy_m", e.target.value)}
              />
              <small>
                5–100 m. Số càng nhỏ, yêu cầu định vị càng chính xác. Đây không
                phải bán kính trạm.
              </small>
              {fieldError("max_accuracy_m")}
            </label>
          </div>
        </fieldset>
        <section aria-label="Tóm tắt bản nháp" className="attendance-notice">
          <h3>Tóm tắt bản nháp</h3>
          {(["check_in", "check_out"] as const).map((prefix) => (
            <p key={prefix}>
              <strong>
                {prefix === "check_in" ? "Check-in" : "Check-out"}:
              </strong>{" "}
              {cps.find(
                (cp) => cp.checkpoint_id === draft[`${prefix}_checkpoint_id`],
              )?.name ?? "Chưa chọn trạm"}{" "}
              ·{" "}
              {draft[`${prefix}_open_at`]?.replace("T", " ") ||
                "Chưa chọn giờ mở"}{" "}
              →{" "}
              {draft[`${prefix}_close_at`]?.replace("T", " ") ||
                "Chưa chọn giờ đóng"}{" "}
              (UTC+7).
            </p>
          ))}
          <p>
            Vị trí không quá {draft.max_position_age_seconds || "…"} giây, sai
            số không quá {draft.max_accuracy_m || "…"} m và nằm trong vùng trạm.
            Máy chủ quyết định quyền check-in theo đăng ký, thời gian và tình
            trạng điểm danh.
          </p>
        </section>
        {checked && (
          <p role="status">
            {Object.keys(errors).length
              ? "Bản nháp còn thông tin chưa hợp lệ. Kiểm tra các trường được đánh dấu."
              : "Bản nháp hợp lệ theo schema hiện tại. Chưa gửi và chưa lưu lên hệ thống."}
          </p>
        )}
        <div className="action-row">
          <button className="button" type="submit">
            Kiểm tra bản nháp
          </button>
          <button
            className="button primary"
            type="button"
            disabled
            aria-describedby="attendance-save-unavailable"
          >
            Lưu cấu hình điểm danh
          </button>
        </div>
        <p id="attendance-save-unavailable">
          Cần đọc được cấu hình, phiên bản và trạng thái khóa từ máy chủ trước
          khi cho phép lưu.
        </p>
      </form>
    </Panel>
  );
}
