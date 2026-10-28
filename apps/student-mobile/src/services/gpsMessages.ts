export function gpsRejectionMessage(code?: string) {
  const labels: Record<string, string> = {
    GPS_TOO_OLD: "Mẫu GPS đã quá thời hạn nhận của máy chủ (mặc định 5 phút).",
    GPS_OUT_OF_ORDER: "Mẫu GPS đến sai thứ tự.",
    RUN_PAUSED: "Mẫu GPS nằm trong khoảng tạm dừng.",
    RUN_NOT_ACTIVE: "Phiên chạy đã kết thúc; không nhận thêm GPS.",
    GPS_INACCURATE: "Vị trí GPS chưa đủ chính xác.",
    GPS_JUMP_REJECTED: "Vị trí thay đổi vượt ngưỡng tốc độ cho phép.",
  };
  return code ? (labels[code] ?? code) : "Chưa có lý do từ máy chủ.";
}
