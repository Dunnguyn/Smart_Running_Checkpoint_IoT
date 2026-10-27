import { modeLabel } from "../../utils/labels";
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
  const { raceId } = useLive();
  return <ConfigForm key={raceId} raceId={raceId} />;
}
function ConfigForm({ raceId }: { raceId: string }) {
  const { refreshData, snapshot, setDirty } = useLive();
  const [saved, setSaved] = useState<MatchingConfig | null>(null);
  const [mode, setMode] = useState<CheckpointMode | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [reload, setReload] = useState(0),
    [conflict, setConflict] = useState(false);
  const controller = useRef<AbortController | null>(null),
    guard = useRef(false);
  const dirty = Object.keys(draft).length > 0 || mode !== null;
  useEffect(() => {
    setDirty(dirty || busy);
    return () => setDirty(false);
  }, [dirty, busy, setDirty]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    matchingService
      .readConfig(raceId, c.signal)
      .then((data) => {
        if (!c.signal.aborted) {
          setSaved(data);
          setDraft({});
          setMode(null);
          setConflict(false);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [raceId, reload]);
  const changed =
    conflict ||
    !!(
      saved &&
      snapshot?.dashboard?.race.race_id === raceId &&
      snapshot.dashboard.race.config_version > saved.config_version
    );
  const readOnly = loading || !saved || saved.locked !== false || changed;
  const reloadConfig = () => {
    if (!dirty || confirm("Bỏ cấu hình chưa lưu và tải lại?"))
      setReload((n) => n + 1);
  };
  return (
    <Panel
      title="Cấu hình ghép GPS / Arduino"
      subtitle={
        saved
          ? `Phiên bản cấu hình: ${saved.config_version}`
          : "Đang đọc cấu hình backend"
      }
    >
      {loading && <p role="status">Đang tải cấu hình…</p>}
      {error && <p role="alert">{error}</p>}
      {(!saved || error || changed) && (
        <button
          className="button"
          type="button"
          onClick={reloadConfig}
          disabled={busy}
        >
          Tải lại cấu hình
        </button>
      )}
      {changed && (
        <p role="alert">
          Cấu hình server đã thay đổi. Draft được giữ lại; tải lại trước khi
          lưu.
        </p>
      )}
      {saved && (
        <>
          <p>
            {saved.locked === true
              ? saved.locked_reason ||
                "Cấu hình đã khóa vì giải đã có phiên chạy."
              : saved.locked === false
                ? "Cấu hình có thể sửa trước khi tạo phiên chạy."
                : "Chưa xác định trạng thái khóa; chưa thể lưu."}
          </p>
          <p>
            Thời gian tối thiểu giữa hai vòng:{" "}
            {saved.min_lap_interval_seconds ?? "Chưa được backend cung cấp"}
            {saved.min_lap_interval_seconds != null ? " giây" : ""} (chỉ đọc)
          </p>
          <form
            className="matching-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (readOnly || guard.current || !dirty) return;
              const values: Partial<MatchingConfig> = {};
              if (mode !== null && mode !== saved.checkpoint_mode)
                values.checkpoint_mode = mode;
              for (const [key] of fields) {
                if (draft[key] !== undefined) {
                  const n = Number(draft[key]);
                  if (!draft[key].trim() || !Number.isFinite(n)) {
                    setError("Nhập đủ thông số hợp lệ.");
                    return;
                  }
                  if (n !== saved[key]) values[key] = n;
                }
              }
              if (
                (values.inner_radius_m ?? saved.inner_radius_m) >=
                (values.outer_radius_m ?? saved.outer_radius_m)
              ) {
                setError("Bán kính trong phải nhỏ hơn bán kính ngoài.");
                return;
              }
              if (!Object.keys(values).length) {
                setDraft({});
                setMode(null);
                return;
              }
              guard.current = true;
              setBusy(true);
              setError("");
              setMessage("");
              const c = new AbortController();
              controller.current = c;
              try {
                const current = await matchingService.readConfig(
                  raceId,
                  c.signal,
                );
                if (
                  current.locked !== false ||
                  current.config_version !== saved.config_version
                ) {
                  setConflict(true);
                  setError(
                    current.locked_reason ||
                      "Cấu hình đã thay đổi; chưa gửi lưu.",
                  );
                  return;
                }
                await matchingService.config(raceId, values, c.signal);
                const confirmed = await matchingService.readConfig(
                  raceId,
                  c.signal,
                );
                if (!c.signal.aborted) {
                  setSaved(confirmed);
                  setDraft({});
                  setMode(null);
                  setMessage("Đã đọc lại cấu hình sau lưu.");
                  refreshData();
                }
              } catch (e) {
                if (!c.signal.aborted) {
                  const f = e as RequestError;
                  setError(
                    `${f.message} ${f.code ?? ""} ${Object.values(f.fields ?? {}).join("; ")}`,
                  );
                  if (f.status === 409 || f.status === 0 || f.status >= 500)
                    setConflict(true);
                }
              } finally {
                guard.current = false;
                if (!c.signal.aborted) setBusy(false);
              }
            }}
          >
            <label>
              Chế độ
              <select
                aria-label="Chế độ"
                disabled={readOnly || busy}
                value={mode ?? saved.checkpoint_mode}
                onChange={(e) => setMode(e.target.value as CheckpointMode)}
              >
                <option value="GPS_ONLY">{modeLabel("GPS_ONLY")}</option>
                <option value="GPS_AND_ARDUINO">
                  {modeLabel("GPS_AND_ARDUINO")}
                </option>
              </select>
            </label>
            {fields.map(([key, label, min, max, step]) => (
              <label key={key}>
                {label}
                <input
                  aria-label={label}
                  required
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  disabled={readOnly || busy}
                  value={draft[key] ?? String(saved[key])}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <button
              className="button primary"
              disabled={readOnly || busy || !dirty}
            >
              {busy ? "Đang lưu…" : "Lưu cấu hình ghép"}
            </button>
          </form>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </Panel>
  );
}
