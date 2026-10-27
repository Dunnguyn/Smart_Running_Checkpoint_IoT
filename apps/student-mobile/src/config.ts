export const config = {
  mode: process.env.EXPO_PUBLIC_SERVICE_MODE ?? "mock",
  gps: process.env.EXPO_PUBLIC_GPS_MODE ?? "demo",
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  background: process.env.EXPO_PUBLIC_BACKGROUND_GPS === "true",
};
export function configurationError() {
  if (!["mock", "api"].includes(config.mode))
    return "SERVICE_MODE phải là mock hoặc api.";
  if (!["demo", "device"].includes(config.gps))
    return "GPS_MODE phải là demo hoặc device.";
  if (config.mode === "api" && config.gps === "demo")
    return "Không được gửi GPS giả trong chế độ API thật. Chọn GPS_MODE=device.";
  if (config.mode === "api" && !/^https?:\/\//.test(config.baseUrl))
    return "Cần cấu hình EXPO_PUBLIC_API_BASE_URL là địa chỉ backend http(s).";
  return "";
}
