import { expect, it } from "vitest";
import { canCheckIn, checkInLabel } from "../src/domain/model";
import { seed } from "../src/services/fixtures";
import { attendanceErrorHelp } from "../src/services/attendanceMessages";
const race = {
  ...seed("test", Date.now()).races[0],
  phase: "LIVE" as const,
  registrationStatus: "REGISTERED",
  attendanceConfigured: true,
  actions: { can_check_in: false },
};
it("waits for server permissions across opening and closing boundaries", () => {
  expect(canCheckIn(race)).toBe(false);
  expect(canCheckIn({ ...race, actions: { can_check_in: true } })).toBe(true);
  expect(canCheckIn(race)).toBe(false);
  expect(checkInLabel(race)).toBe("Check-in chưa khả dụng");
});
it("distinguishes missing configuration and requires valid enrollment", () => {
  expect(checkInLabel({ ...race, attendanceConfigured: false })).toBe(
    "Chưa cấu hình điểm danh",
  );
  expect(
    canCheckIn({
      ...race,
      registrationStatus: "CANCELLED",
      actions: { can_check_in: true },
    }),
  ).toBe(false);
  expect(
    canCheckIn({
      ...race,
      attendanceConfigured: false,
      actions: { can_check_in: true },
    }),
  ).toBe(false);
});
it("uses explicit server rejection codes for time and GPS guidance", () => {
  expect(attendanceErrorHelp("CHECK_IN_NOT_OPEN")).toContain("Chưa đến giờ");
  expect(attendanceErrorHelp("CHECK_IN_CLOSED")).toContain("Đã hết giờ");
  expect(attendanceErrorHelp("GPS_SAMPLE_STALE")).toContain("GPS mới");
  expect(attendanceErrorHelp("GPS_INACCURATE")).toContain("nơi thoáng");
  expect(attendanceErrorHelp("OUTSIDE_ATTENDANCE_ZONE")).toContain("Đến trạm");
  expect(attendanceErrorHelp("UNKNOWN")).toBeUndefined();
});
