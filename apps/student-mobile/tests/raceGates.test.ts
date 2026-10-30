import { expect, it } from "vitest";
import {
  canCheckIn,
  canStart,
  canRegister,
  registrationLabel,
} from "../src/domain/model";
import { seed } from "../src/services/fixtures";
import { gpsRejectionMessage } from "../src/services/gpsMessages";
it("cancelled races override stale backend action flags", () => {
  const race = {
    ...seed("test", Date.now()).races[0],
    phase: "CANCELLED" as const,
    registrationAllowed: true,
    registrationMessage: "Đang mở đăng ký",
    actions: { can_check_in: true, can_start: true },
  };
  expect(canRegister(race)).toBe(false);
  expect(canCheckIn(race)).toBe(false);
  expect(canStart(race)).toBe(false);
  expect(registrationLabel(race)).toBe("Giải đã hủy");
});
it("allows scheduled check-in when the server permits it, but start still requires LIVE", () => {
  const race = {
    ...seed("test", Date.now()).races[0],
    phase: "UPCOMING" as const,
    actions: { can_check_in: true, can_start: true },
  };
  expect(canCheckIn(race)).toBe(true);
  expect(canStart(race)).toBe(false);
});
it("explains the updated GPS age policy without hiding unknown rejection codes", () => {
  expect(gpsRejectionMessage("GPS_TOO_OLD")).toContain("5 phút");
  expect(gpsRejectionMessage("NEW_CODE")).toBe("NEW_CODE");
});
