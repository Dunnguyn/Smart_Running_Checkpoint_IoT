import * as TaskManager from "expo-task-manager";
import type { LocationObject } from "expo-location";
import { LOCATION_TASK } from "./port";
import { toFix } from "./device";
import { engine } from "../state/runtime";
TaskManager.defineTask<{ locations: LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    await engine.boot(true);
    if (error) {
      engine.gpsError(error.message);
      return;
    }
    try {
      await engine.backgroundFixes((data?.locations ?? []).map(toFix));
    } catch {
      engine.gpsError(
        "Không lưu được dữ liệu GPS nền. Đã ngừng thu; mở app để kiểm tra bộ nhớ và đồng bộ.",
      );
    }
  },
);
