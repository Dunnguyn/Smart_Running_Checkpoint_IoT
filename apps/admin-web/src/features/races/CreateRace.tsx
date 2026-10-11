import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/Modal";
import { RequestError } from "../../services/client";
import {
  createRace,
  racePayload,
  type RaceDraft,
} from "../../services/raceCreation";

export function CreateRace({
  onClose,
  onCreated,
  onRefresh,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState<RaceDraft>({
    name: "",
    route_name: "",
    start_at: "",
    end_at: "",
    total_laps: "4",
    min_lap_interval_seconds: "",
    checkpoint_mode: "GPS_ONLY",
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const guard = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  function input(key: keyof RaceDraft, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    setFields((f) => ({ ...f, [key]: "" }));
  }
  const labels = {
    name: "Tên giải",
    route_name: "Tên tuyến (tùy chọn)",
    start_at: "Bắt đầu dự kiến",
    end_at: "Kết thúc dự kiến",
    total_laps: "Số vòng",
    min_lap_interval_seconds: "Thời gian tối thiểu giữa hai vòng (giây)",
  };
  return (
    <Modal
      title="Tạo giải chạy"
      onClose={() => {
        if (!guard.current) onClose();
      }}
    >
      <p>
        Giải mới được tạo ở trạng thái Bản nháp. Hãy cấu hình checkpoint và
        tuyến trước khi tạo phiên chạy.
      </p>
      <form
        className="editor-fields"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (guard.current || uncertain) return;
          const validated = racePayload(draft);
          setFields(validated.fields);
          setError("");
          if (Object.keys(validated.fields).length) return;
          guard.current = true;
          setBusy(true);
          const current = new AbortController();
          controller.current = current;
          try {
            const result = await createRace(draft, current.signal);
            if (!current.signal.aborted) onCreated(result.race_id);
          } catch (err) {
            if (current.signal.aborted) return;
            const failure = err as RequestError;
            setError(failure.message);
            if (failure.status === 0 || failure.status >= 500)
              setUncertain(true);
            setFields(
              Object.fromEntries(
                Object.entries(failure.fields ?? {}).map(([key, value]) => [
                  key.replace(/^body\./, ""),
                  value,
                ]),
              ),
            );
          } finally {
            guard.current = false;
            if (!current.signal.aborted) setBusy(false);
          }
        }}
      >
        <fieldset
          disabled={busy || uncertain}
          className="editor-fields"
          style={{ border: 0, padding: 0 }}
        >
          {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
            <label key={key}>
              {labels[key]}
              <input
                aria-label={labels[key]}
                value={draft[key]}
                onChange={(e) => input(key, e.target.value)}
                required={key === "name" || key === "total_laps"}
                type={
                  key.endsWith("_at")
                    ? "datetime-local"
                    : key === "total_laps" || key === "min_lap_interval_seconds"
                      ? "number"
                      : "text"
                }
                maxLength={key === "name" ? 160 : undefined}
                min={
                  key === "total_laps" || key === "min_lap_interval_seconds"
                    ? 1
                    : undefined
                }
                max={
                  key === "total_laps"
                    ? 100
                    : key === "min_lap_interval_seconds"
                      ? 3600
                      : undefined
                }
                step={
                  key === "total_laps" || key === "min_lap_interval_seconds"
                    ? 1
                    : undefined
                }
                aria-invalid={!!fields[key]}
                aria-describedby={
                  fields[key] ? `create-${key}-error` : undefined
                }
              />
              {fields[key] && (
                <span className="field-error" id={`create-${key}-error`}>
                  {fields[key]}
                </span>
              )}
            </label>
          ))}
          <small>
            Ngày giờ theo múi giờ của trình duyệt. Để trống thời gian tối thiểu
            giữa hai vòng để dùng cấu hình backend.
          </small>
          <label>
            Chế độ tính vòng
            <select
              value={draft.checkpoint_mode}
              onChange={(e) => input("checkpoint_mode", e.target.value)}
            >
              <option value="GPS_ONLY">GPS</option>
              <option value="GPS_AND_ARDUINO">GPS kết hợp trạm Arduino</option>
            </select>
          </label>
          {fields.checkpoint_mode && (
            <span className="field-error">{fields.checkpoint_mode}</span>
          )}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {uncertain && (
          <div role="alert">
            <p>
              Chưa xác định giải đã được tạo hay chưa. Hãy tải lại danh sách và
              kiểm tra trước khi tạo tiếp để tránh trùng giải.
            </p>
            <button
              type="button"
              className="button"
              onClick={() => {
                onRefresh();
                onClose();
              }}
            >
              Đóng và tải lại danh sách
            </button>
          </div>
        )}
        <div className="filter-bar">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Hủy
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={busy || uncertain}
          >
            {busy ? "Đang tạo…" : "Tạo giải"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
