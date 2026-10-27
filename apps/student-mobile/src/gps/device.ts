import * as Location from "expo-location";
import { Alert, Platform } from "react-native";
import { config } from "../config";
import type { Fix } from "../domain/model";
import { LOCATION_TASK, type Gps } from "./port";
export const toFix = (position: Location.LocationObject): Fix => ({
  ...position.coords,
  accuracy: position.coords.accuracy ?? Infinity,
  timestamp: position.timestamp,
  simulated: position.mocked === true,
});
export class DeviceGps implements Gps {
  private subscription?: Location.LocationSubscription;
  private generation = 0;
  private async permission() {
    if (!(await Location.hasServicesEnabledAsync()))
      throw new Error("Dịch vụ vị trí đang tắt. Hãy bật GPS trên điện thoại.");
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted")
      throw new Error(
        "Chưa có quyền vị trí. Mở Cài đặt và cho phép NEU RUN dùng GPS.",
      );
  }
  async fresh() {
    await this.permission();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(
                  "Lấy vị trí quá 20 giây. Hãy ra nơi thoáng và thử lại.",
                ),
              ),
            20000,
          );
        }),
      ]);
      return toFix(position);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  async start(onFix: (fix: Fix) => void, onError: (message: string) => void) {
    const stopped = this.stop();
    const generation = this.generation;
    await stopped;
    await this.permission();
    if (generation !== this.generation) return;
    if (config.background && Platform.OS !== "web") {
      if (
        (await Location.getBackgroundPermissionsAsync()).status !== "granted"
      ) {
        const consent = await new Promise<boolean>((resolve) =>
          Alert.alert(
            "Ghi GPS khi chạy nền",
            "NEU RUN cần quyền vị trí Luôn cho phép để ghi tuyến khi bạn bấm Home hoặc khóa màn hình. Tạm dừng và kết thúc sẽ ngừng thu GPS. Chọn Tiếp tục để mở cài đặt quyền.",
            [
              {
                text: "Để sau",
                style: "cancel",
                onPress: () => resolve(false),
              },
              { text: "Tiếp tục", onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          ),
        );
        if (!consent)
          throw new Error(
            "Chưa cấp quyền GPS nền. Chưa bắt đầu thu vị trí; chọn Lấy lại GPS khi sẵn sàng.",
          );
      }
      const permission = await Location.requestBackgroundPermissionsAsync();
      if (permission.status !== "granted")
        throw new Error(
          "Chưa có quyền vị trí nền. Cấp quyền Luôn luôn trong Cài đặt để ghi khi khóa màn hình.",
        );
      if (generation !== this.generation) return;
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 3000,
        distanceInterval: 3,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "NEU RUN đang ghi tuyến chạy",
          notificationBody: "Mở app và chọn Tạm dừng để ngừng thu GPS.",
          killServiceOnDestroy: true,
        },
      });
      if (generation !== this.generation) await this.stop();
    } else {
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 3,
        },
        (pos) => {
          if (generation === this.generation) onFix(toFix(pos));
        },
        (message) => onError(message),
      );
      if (generation === this.generation) this.subscription = subscription;
      else subscription.remove();
    }
  }
  async stop() {
    this.generation++;
    this.subscription?.remove();
    this.subscription = undefined;
    if (
      Platform.OS !== "web" &&
      (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))
    )
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
