export function gpsAge(value: string | null, now: number, completed = false) {
  if (!value) return "Chưa có vị trí mới";
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return "Thời gian GPS không hợp lệ";
  if (stamp > now) return "Thời gian GPS vượt thời gian hiện tại";
  if (completed) return "Vị trí cuối phiên";
  const seconds = Math.floor((now - stamp) / 1000);
  if (seconds < 5) return "Vừa cập nhật";
  if (seconds < 60) return `Cập nhật ${seconds} giây trước`;
  if (seconds < 3600) return `Cập nhật ${Math.floor(seconds / 60)} phút trước`;
  if (seconds < 86400)
    return `Cập nhật ${Math.floor(seconds / 3600)} giờ trước`;
  return `Cập nhật ${Math.floor(seconds / 86400)} ngày trước`;
}
