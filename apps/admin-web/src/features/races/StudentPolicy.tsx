import { useEffect, useState } from "react";
import { request } from "../../services/client";
import { utc } from "../../services/contract";
type Policy = {
  race_id: string;
  version: number;
  description: string | null;
  published: boolean;
  registration_enabled: boolean;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  capacity: number | null;
};
// Inputs explicitly use Vietnam time, independent of the operator's OS timezone.
const local = (value: string | null) =>
  value
    ? new Date(Date.parse(utc(value)!) + 7 * 3600000).toISOString().slice(0, 16)
    : "";
export function StudentPolicy({ raceId }: { raceId: string }) {
  const [policy, setPolicy] = useState<Policy>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const path = `/admin/races/${encodeURIComponent(raceId)}/student-policy`;
  useEffect(() => {
    const controller = new AbortController();
    setPolicy(undefined);
    setError("");
    request<Policy>(path, { signal: controller.signal })
      .then((p) => {
        if (p.race_id !== raceId)
          throw new Error("Cấu hình không thuộc giải đang chọn.");
        if (!controller.signal.aborted) setPolicy(p);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [path, raceId, reload]);
  return (
    <section className="panel people-panel">
      <h2>Công bố trên app sinh viên</h2>
      <p>
        Đăng ký cần giải ở trạng thái Sắp diễn ra. Công bố không tự chuyển trạng
        thái giải. Thời gian bên dưới theo giờ Việt Nam (UTC+7).
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <button
        className="button"
        disabled={busy}
        onClick={() => {
          setMessage("");
          setReload((n) => n + 1);
        }}
      >
        Tải lại cấu hình
      </button>
      {!policy && !error && <p role="status">Đang tải…</p>}
      {policy && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setMessage("");
            if (
              policy.registration_enabled &&
              (!policy.published ||
                !policy.registration_opens_at ||
                !policy.registration_closes_at ||
                Date.parse(policy.registration_opens_at) >=
                  Date.parse(policy.registration_closes_at))
            ) {
              setError(
                "Cần công bố giải và đặt thời điểm mở đăng ký trước thời điểm đóng.",
              );
              return;
            }
            setBusy(true);
            try {
              const saved = await request<Policy>(path, {
                method: "PUT",
                body: {
                  expected_version: policy.version,
                  description: policy.description,
                  published: policy.published,
                  registration_enabled: policy.registration_enabled,
                  registration_opens_at: policy.registration_opens_at,
                  registration_closes_at: policy.registration_closes_at,
                  capacity: policy.capacity,
                },
              });
              setPolicy(saved);
              setMessage("Đã lưu cấu hình app sinh viên.");
            } catch (e) {
              setError(
                (e as Error).message +
                  " Nếu có xung đột hoặc mất kết nối, tải lại cấu hình trước khi lưu tiếp.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <label>
              <input
                type="checkbox"
                checked={policy.published}
                onChange={(e) =>
                  setPolicy({ ...policy, published: e.target.checked })
                }
              />{" "}
              Công bố giải
            </label>
            <label>
              <input
                type="checkbox"
                checked={policy.registration_enabled}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    registration_enabled: e.target.checked,
                  })
                }
              />{" "}
              Mở đăng ký
            </label>
            <label>
              Mô tả
              <textarea
                maxLength={2000}
                value={policy.description ?? ""}
                onChange={(e) =>
                  setPolicy({ ...policy, description: e.target.value })
                }
              />
            </label>
            {(
              [
                ["registration_opens_at", "Mở đăng ký"],
                ["registration_closes_at", "Đóng đăng ký"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label} (UTC+7)
                <input
                  type="datetime-local"
                  value={local(policy[key])}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      [key]: e.target.value
                        ? new Date(`${e.target.value}+07:00`).toISOString()
                        : null,
                    })
                  }
                />
              </label>
            ))}
            <label>
              Số chỗ (để trống nếu không giới hạn)
              <input
                type="number"
                min={1}
                max={100000}
                step={1}
                value={policy.capacity ?? ""}
                onChange={(e) =>
                  setPolicy({
                    ...policy,
                    capacity: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </label>
            <button className="button primary" type="submit">
              {busy ? "Đang lưu…" : "Lưu cấu hình"}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
