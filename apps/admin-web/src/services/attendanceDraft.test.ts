import { describe, expect, it } from "vitest";
import {
  emptyAttendanceDraft,
  validateAttendanceDraft,
  vietnamToUtc,
} from "./attendanceDraft";
import type { Checkpoint } from "../types/domain";
const cp: Checkpoint = {
  checkpoint_id: "cp",
  race_id: "race",
  code: "CP",
  name: "Trạm",
  type: "START_FINISH",
  order: 1,
  device: "",
  latitude: 21,
  longitude: 105,
  radius_m: 30,
};
const draft = {
  check_in_checkpoint_id: "cp",
  check_out_checkpoint_id: "cp",
  check_in_open_at: "2026-10-28T08:00",
  check_in_close_at: "2026-10-28T09:00",
  check_out_open_at: "2026-10-28T08:30",
  check_out_close_at: "2026-10-28T10:00",
  max_position_age_seconds: "5",
  max_accuracy_m: "5.5",
};
describe("attendance preparation matches existing PUT schema without inferring a version", () => {
  it("starts empty and requires all fields", () => {
    expect(Object.values(emptyAttendanceDraft()).every((v) => v === "")).toBe(
      true,
    );
    expect(
      Object.keys(validateAttendanceDraft(emptyAttendanceDraft(), [], "race")),
    ).toHaveLength(8);
    expect(draft).not.toHaveProperty("expected_version");
  });
  it("accepts overlapping windows and the same station, as backend does", () => {
    expect(validateAttendanceDraft(draft, [cp], "race")).toEqual({});
    expect(vietnamToUtc(draft.check_in_open_at)).toBe(
      "2026-10-28T01:00:00.000Z",
    );
  });
  it("rejects missing, foreign, and ungeolocated stations", () => {
    for (const cps of [
      [],
      [{ ...cp, race_id: "other" }],
      [{ ...cp, latitude: null }],
      [{ ...cp, radius_m: 0 }],
    ])
      expect(
        validateAttendanceDraft(draft, cps, "race").check_in_checkpoint_id,
      ).toBeTruthy();
  });
  it("rejects inverted windows and checkout ending before check-in opens", () => {
    expect(
      validateAttendanceDraft(
        { ...draft, check_in_close_at: draft.check_in_open_at },
        [cp],
        "race",
      ).check_in_close_at,
    ).toBeTruthy();
    expect(
      validateAttendanceDraft(
        { ...draft, check_out_close_at: "2026-10-27T10:00" },
        [cp],
        "race",
      ).check_out_close_at,
    ).toBeTruthy();
  });
  it("enforces integer age and finite accuracy bounds", () => {
    for (const age of ["4", "61", "5.5", "Infinity"])
      expect(
        validateAttendanceDraft(
          { ...draft, max_position_age_seconds: age },
          [cp],
          "race",
        ).max_position_age_seconds,
      ).toBeTruthy();
    for (const accuracy of ["4", "101", "NaN"])
      expect(
        validateAttendanceDraft(
          { ...draft, max_accuracy_m: accuracy },
          [cp],
          "race",
        ).max_accuracy_m,
      ).toBeTruthy();
  });
});
