export function attendanceErrorHelp(code: string): string | undefined {
  return (
    {
      ATTENDANCE_NOT_CONFIGURED:
        "Chưa cấu hình điểm danh. Liên hệ ban tổ chức để kiểm tra trạm và giờ điểm danh.",
      CHECK_IN_NOT_OPEN:
        "Chưa đến giờ check-in. Chờ ban tổ chức mở điểm danh và làm mới quyền thao tác.",
      CHECK_IN_CLOSED:
        "Đã hết giờ check-in. Liên hệ ban tổ chức nếu bạn cần hỗ trợ.",
      GPS_SAMPLE_STALE:
        "Vị trí đã quá cũ. Kiểm tra kết nối rồi nhấn check-in lại để lấy GPS mới.",
      GPS_INACCURATE:
        "GPS chưa đủ chính xác. Ra nơi thoáng, bật vị trí chính xác rồi thử lại.",
      OUTSIDE_ATTENDANCE_ZONE:
        "Bạn đang ngoài vùng điểm danh. Đến trạm được ban tổ chức chỉ định rồi lấy lại GPS.",
      CLOCK_SKEW:
        "Giờ thiết bị chưa chính xác. Bật ngày giờ tự động rồi lấy lại GPS.",
    } as Record<string, string>
  )[code];
}
