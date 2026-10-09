import { useEffect, useRef, useState } from "react";
import { useLive } from "../../app/LiveProvider";
import { Panel } from "../../components/ui";
import { matchingService } from "../../services/matchingService";
import { RequestError } from "../../services/client";
import type {
  CheckpointMode,
  MatchingConfig,
} from "../../services/matchingContract";
const fields = [
  ["inner_radius_m", "Bán kính trong (m)", Number.MIN_VALUE, undefined, "any"],
  ["outer_radius_m", "Bán kính ngoài (m)", Number.MIN_VALUE, undefined, "any"],
  ["match_window_seconds", "Cửa sổ đối chiếu ± (giây)", 0, 60, "1"],
  ["late_grace_seconds", "Grace (giây)", 0, 60, "1"],
  ["max_sample_gap_seconds", "Khoảng trống mẫu tối đa (giây)", 1, 300, "1"],
  ["max_event_age_seconds", "Tuổi sự kiện tối đa (giây)", 1, 3600, "1"],
  ["max_future_skew_seconds", "Độ lệch tương lai (giây)", 0, 60, "1"],
] as const;
export function MatchingSettings() {
  const { snapshot, raceId } = useLive();
  if (!snapshot?.dashboard || snapshot.dashboard.race.race_id !== raceId)
    return null;
  return (
    <ConfigForm
      key={raceId}
      raceId={raceId}
      initialMode={snapshot.dashboard.race.checkpoint_mode}
      version={snapshot.dashboard.race.config_version}
    />
  );
}
function ConfigForm({
  raceId,
  initialMode,
  version,
}: {
  raceId: string;
  initialMode: CheckpointMode;
  version: number;
}) {
  const { refreshData } = useLive();
  const [modeOverride, setMode] = useState<CheckpointMode | null>(null),
    [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<MatchingConfig | null>(null),
    [blocked, setBlocked] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null),
    guard = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const readOnly = blocked;
  const currentSaved = saved && saved.config_version >= version ? saved : null;
  const serverMode = currentSaved?.checkpoint_mode ?? initialMode;
  const mode = modeOverride ?? serverMode;
  return (
    <Panel
      title="Cấu hình ghép GPS / Arduino"
      subtitle={`Phiên bản cấu hình: ${currentSaved?.config_version ?? version}`}
    >
      <p className="form-message">
        {readOnly
          ? "Cấu hình đã khóa sau khi có phiên chạy. Tạo race demo mới để thử cấu hình khác."
          : "Chưa có dữ liệu trạng thái khóa: API đọc chưa hỗ trợ trường này. Backend kiểm tra khi lưu; màn hình không suy đoán từ số phiên chạy."}
      </p>
      <p className="form-message">
        API đọc hiện chỉ trả mode và phiên bản; các thông số chưa biết hiển thị
        “—”. Chỉ những ô bạn nhập mới được gửi; không tự điền giá trị demo. Giá
        trị đã lưu chỉ hiện trong phiên màn hình này.
      </p>
      <form
        className="matching-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (readOnly || guard.current) return;
          const values: Partial<Omit<MatchingConfig, "config_version">> = {};
          if (modeOverride !== null && modeOverride !== serverMode)
            values.checkpoint_mode = modeOverride;
          for (const [key] of fields)
            if (draft[key]?.trim()) values[key] = Number(draft[key]);
          const inner = values.inner_radius_m ?? currentSaved?.inner_radius_m,
            outer = values.outer_radius_m ?? currentSaved?.outer_radius_m;
          if (inner !== undefined && outer !== undefined && inner >= outer) {
            setMessage("Bán kính trong phải nhỏ hơn bán kính ngoài.");
            return;
          }
          if (!Object.keys(values).length) {
            setMessage("Chưa có thay đổi để lưu.");
            return;
          }
          guard.current = true;
          setBusy(true);
          setMessage("");
          controller.current = new AbortController();
          try {
            const result = await matchingService.config(
              raceId,
              values,
              controller.current.signal,
            );
            setSaved(result);
            setMode(null);
            setDraft({});
            setMessage("Backend đã lưu cấu hình.");
            refreshData();
          } catch (error) {
            const e = error as RequestError;
            if (!controller.current.signal.aborted) {
              setMessage(
                `${e.message} ${e.code ?? ""} ${Object.values(e.fields ?? {}).join("; ")}`,
              );
              if (e.status === 409) {
                if (e.code === "MATCHING_CONFIG_LOCKED") setBlocked(true);
                refreshData();
              }
            }
          } finally {
            guard.current = false;
            setBusy(false);
          }
        }}
      >
        <label>
          Chế độ
          <select
            aria-label="Chế độ"
            value={readOnly ? serverMode : mode}
            disabled={readOnly || busy}
            onChange={(e) => setMode(e.target.value as CheckpointMode)}
          >
            <option>GPS_ONLY</option>
            <option>GPS_AND_ARDUINO</option>
          </select>
        </label>
        {fields.map(([key, label, min, max, step]) => (
          <label key={key}>
            {label}
            <small>Hiện tại: {currentSaved?.[key] ?? "—"}</small>
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              placeholder="Giữ nguyên"
              disabled={readOnly || busy}
              value={draft[key] ?? ""}
              onChange={(e) =>
                setDraft((s) => ({ ...s, [key]: e.target.value }))
              }
            />
          </label>
        ))}
        <button
          className="button primary"
          disabled={readOnly || busy}
          type="submit"
        >
          {busy ? "Đang lưu…" : "Lưu cấu hình ghép"}
        </button>
      </form>
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
    </Panel>
  );
}
