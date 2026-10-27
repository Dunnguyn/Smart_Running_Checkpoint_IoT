import type { Gps } from "./port";
import type { Fix } from "../domain/model";
import { demoRoute } from "../services/fixtures";
export class DemoGps implements Gps {
  issue: "none" | "permission" | "outside" | "inaccurate" | "timeout" = "none";
  private timer?: ReturnType<typeof setInterval>;
  private index = 0;
  async fresh(): Promise<Fix> {
    if (this.issue === "permission")
      throw new Error("Quyền vị trí bị từ chối. Mở Cài đặt để cấp lại.");
    if (this.issue === "timeout")
      throw new Error(
        "Hết thời gian lấy vị trí. Kiểm tra dịch vụ vị trí và thử lại.",
      );
    return {
      ...demoRoute[0],
      latitude: demoRoute[0].latitude + (this.issue === "outside" ? 0.01 : 0),
      timestamp: Date.now(),
      accuracy: this.issue === "inaccurate" ? 150 : 5,
      simulated: true,
    };
  }
  async start(onFix: (fix: Fix) => void, onError: (message: string) => void) {
    await this.stop();
    const emit = async () => {
      try {
        const base = await this.fresh();
        const step = this.index++ % 32,
          edge = Math.floor(step / 8),
          t = (step % 8) / 8;
        onFix({
          ...base,
          latitude:
            base.latitude +
            demoRoute[edge].latitude -
            demoRoute[0].latitude +
            (demoRoute[edge + 1].latitude - demoRoute[edge].latitude) * t,
          longitude:
            demoRoute[edge].longitude +
            (demoRoute[edge + 1].longitude - demoRoute[edge].longitude) * t,
        });
      } catch (error) {
        onError((error as Error).message);
      }
    };
    this.timer = setInterval(() => void emit(), 1000);
    await emit();
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
