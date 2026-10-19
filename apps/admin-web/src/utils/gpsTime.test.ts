import { describe, expect, it } from "vitest";
import { gpsAge } from "./gpsTime";
describe("GPS sample age", () => {
  const now = Date.parse("2026-10-13T10:00:00Z");
  it("never presents missing, invalid or future samples as fresh", () => {
    expect(gpsAge(null, now)).toBe("Chưa có vị trí mới");
    expect(gpsAge("invalid", now)).toContain("không hợp lệ");
    expect(gpsAge("2026-10-13T10:00:01Z", now)).toContain("vượt");
  });
  it("ages the actual sample without a new request", () => {
    const stamp = "2026-10-13T10:00:00Z";
    expect(gpsAge(stamp, now)).toBe("Vừa cập nhật");
    expect(gpsAge(stamp, now + 20000)).toBe("Cập nhật 20 giây trước");
    expect(gpsAge(stamp, now + 120000)).toBe("Cập nhật 2 phút trước");
  });
  it("keeps a completed session's old position distinct from an outage", () => {
    expect(gpsAge("2026-10-12T10:00:00Z", now, true)).toBe("Vị trí cuối phiên");
    expect(gpsAge(null, now, true)).toBe("Chưa có vị trí mới");
  });
});
