import { useSyncExternalStore } from "react";
import { gpsAge } from "../utils/gpsTime";

// One clock for all mounted GPS labels; no timers remain after the last unmount.
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((notify) => notify());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
const getSnapshot = () => now;
export function GpsTimestamp({
  value,
  completed = false,
}: {
  value: string | null;
  completed?: boolean;
}) {
  const clock = useSyncExternalStore(subscribe, getSnapshot);
  const label = gpsAge(value, clock, completed);
  const exact =
    value && Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat("vi-VN", {
          dateStyle: "short",
          timeStyle: "medium",
        }).format(new Date(value))
      : null;
  return (
    <span
      title={exact ?? undefined}
      aria-label={exact ? `${label}. ${exact}` : label}
    >
      {label}
    </span>
  );
}
