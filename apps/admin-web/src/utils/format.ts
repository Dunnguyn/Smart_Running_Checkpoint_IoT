export const duration = (seconds: number | null) =>
  seconds === null
    ? "—"
    : [
        Math.floor(seconds / 3600),
        Math.floor(seconds / 60) % 60,
        Math.floor(seconds) % 60,
      ]
        .map((n) => String(n).padStart(2, "0"))
        .join(":");
export const distance = (meters: number) =>
  `${(meters / 1000).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
export const datetime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(value))
    : "—";
export const time = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
export const statusLabels = {
  PENDING: "Chưa bắt đầu",
  ACTIVE: "Đang chạy",
  COMPLETED: "Hoàn thành",
  ABANDONED: "Đã dừng",
  DRAFT: "Bản nháp",
  SCHEDULED: "Sắp diễn ra",
  LIVE: "Đang diễn ra",
  CANCELLED: "Đã hủy",
};
