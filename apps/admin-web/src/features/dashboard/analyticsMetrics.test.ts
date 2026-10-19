import { describe, expect, it } from "vitest";
import { paceLabel, chartMaximum, lapProgress } from "./analyticsMetrics";
describe("analytics presentation", () => {
  it("keeps missing pace separate from zero and formats minutes rather than a clock", () => {
    expect(paceLabel(null, 1000)).toBe("—");
    expect(paceLabel(10, 0)).toBe("—");
    expect(paceLabel(0, 1000)).toBe("00:00");
    expect(paceLabel(877, 1000)).toBe("14:37");
    expect(paceLabel(3599.8, 1000)).toBe("60:00");
  });
  it("scales chart from data and the saved route target", () => {
    expect(chartMaximum([1280, 1710], 1700)).toBe(2000);
    expect(chartMaximum([2800], 1700)).toBe(3000);
    expect(chartMaximum([], null)).toBe(500);
  });
  it("clamps visual progress without altering the displayed lap count", () => {
    expect(lapProgress(5, 4)).toBe(100);
    expect(lapProgress(2, 4)).toBe(50);
    expect(lapProgress(1, null)).toBe(0);
  });
});
