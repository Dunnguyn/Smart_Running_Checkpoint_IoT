import { useEffect, useRef, useState } from "react";
import { Panel } from "../../components/ui";
import { matchingService } from "../../services/matchingService";
import { RequestError } from "../../services/client";
export function RegisterDevice({
  checkpointId = "",
}: {
  checkpointId?: string;
}) {
  const [checkpoint, setCheckpoint] = useState(checkpointId),
    [device, setDevice] = useState(""),
    [name, setName] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const guard = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return (
    <Panel
      title="Đăng ký thiết bị Gateway vào checkpoint"
      subtitle="Nhập ID checkpoint do backend cấp. Chưa có API liệt kê/sửa/xóa thiết bị."
    >
      <form
        className="matching-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (guard.current) return;
          guard.current = true;
          setBusy(true);
          setMessage("");
          controller.current = new AbortController();
          try {
            const result = await matchingService.register(
              checkpoint.trim(),
              {
                device_id: device.trim(),
                ...(name.trim() ? { name: name.trim() } : {}),
              },
              controller.current.signal,
            );
            if (!controller.current.signal.aborted)
              setMessage(
                `Đã đăng ký ${result.device_id} vào checkpoint ${result.checkpoint_id}. Trạng thái đăng ký: ${result.status}; không phải bằng chứng thiết bị online.`,
              );
          } catch (error) {
            if (!controller.current.signal.aborted) {
              const e = error as RequestError;
              setMessage(
                `${e.message} ${e.code ?? ""} ${Object.values(e.fields ?? {}).join("; ")}`,
              );
            }
          } finally {
            guard.current = false;
            setBusy(false);
          }
        }}
      >
        <label>
          Checkpoint ID
          <input
            required
            disabled={busy}
            value={checkpoint}
            onChange={(e) => setCheckpoint(e.target.value)}
          />
        </label>
        <label>
          Device ID
          <input
            required
            maxLength={80}
            disabled={busy}
            value={device}
            onChange={(e) => setDevice(e.target.value)}
          />
        </label>
        <label>
          Tên thiết bị
          <input
            maxLength={120}
            disabled={busy}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          className="button primary"
          disabled={busy || !checkpoint.trim() || !device.trim()}
        >
          Đăng ký thiết bị
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
