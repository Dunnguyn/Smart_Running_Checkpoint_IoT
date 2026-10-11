export const modeLabel = (value: string) =>
  ({ GPS_ONLY: "GPS", GPS_AND_ARDUINO: "GPS kết hợp trạm Arduino" })[value] ??
  `Chế độ khác (${value})`;
export const sourceLabel = (value: string) =>
  ({
    SIMULATOR: "Mô phỏng",
    SIMULATED_GPS: "GPS mô phỏng",
    WEARABLE: "Thiết bị đeo",
    WEARABLE_GPS: "GPS thiết bị đeo",
    ARDUINO_GATEWAY: "Trạm Arduino / Gateway",
  })[value] ?? value;
export const gpsLabel = (value: string) =>
  ({
    ONLINE: "GPS mới",
    STALE: "GPS đã cũ",
    UNAVAILABLE: "Chưa có GPS",
    FINISHED: "Vị trí cuối phiên",
  })[value] ?? `GPS: ${value}`;
