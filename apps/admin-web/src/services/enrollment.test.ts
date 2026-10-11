import { describe, it, expect } from "vitest";
import { registrationPayload } from "./enrollment";
describe("registration contract", () => {
  it("omits blank bib so backend allocates it", () =>
    expect(registrationPayload("uuid", " ")).toEqual({ student_id: "uuid" }));
  it("preserves leading zeros and uses student UUID", () =>
    expect(registrationPayload("uuid", "01")).toEqual({
      student_id: "uuid",
      bib_number: "01",
    }));
});
