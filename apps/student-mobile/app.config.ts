import type { ExpoConfig } from "expo/config";

const background = process.env.EXPO_PUBLIC_BACKGROUND_GPS === "true";
const mapsKey = process.env.ANDROID_MAPS_API_KEY;
const config: ExpoConfig = {
  name: "NEU RUN",
  slug: "neu-run-student",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "neurun",
  userInterfaceStyle: "light",
  icon: "./assets/neu-run-logo.png",
  ios: { bundleIdentifier: "vn.edu.neu.run.student", supportsTablet: true },
  android: {
    package: "vn.edu.neu.run.student",
    allowBackup: false,
    blockedPermissions: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.VIBRATE",
    ],
  },
  web: {
    bundler: "metro",
    name: "NEU RUN · Kiểm thử giao diện",
    favicon: "./assets/neu-run-logo.png",
  },
  extra: { mapsConfigured: !!mapsKey },
  plugins: [
    "./plugins/with-short-cmake.cjs",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "NEU RUN dùng vị trí để điểm danh và ghi tuyến chạy khi bạn bắt đầu.",
        locationAlwaysAndWhenInUsePermission:
          "Cho phép NEU RUN ghi tuyến chạy khi khóa màn hình. Tạm dừng sẽ ngừng thu vị trí.",
        isIosBackgroundLocationEnabled: background,
        isAndroidBackgroundLocationEnabled: background,
        isAndroidForegroundServiceEnabled: background,
      },
    ],
    "expo-secure-store",
    "expo-sqlite",
    ["react-native-maps", mapsKey ? { androidGoogleMapsApiKey: mapsKey } : {}],
  ],
};
export default config;
