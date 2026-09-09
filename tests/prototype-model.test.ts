import { describe, it, expect } from "vitest";
import {
  rollingSeries,
  plotPath,
  selectPlants,
  legacySignal,
  number,
  type Plant,
} from "../src/lib/prototype-model";
const plant = (value: number | null, level = "high"): Plant => ({
  siteId: "a",
  siteName: "ศูนย์การเรียนรู้ภาษาไทยชื่อยาว",
  inverterYieldKwh: value,
  capacityKwp: null,
  riskLevel: level,
  riskScore: 40,
  reasons: [],
  actions: [],
  comparison: {},
});
describe("prototype data safeguards", () => {
  it("rolls twelve months across year boundary without replacing missing with zero", () => {
    const points = rollingSeries(
      "2026-02",
      new Map([
        ["2026-02", 0],
        ["2025-02", 42],
      ]),
    );
    expect(points).toHaveLength(12);
    expect(points[0].month).toBe("2025-03");
    expect(points[10].value).toBeNull();
    expect(points[11]).toEqual({ month: "2026-02", value: 0, previous: 42 });
  });
  it("breaks the plotted line around missing measurements", () => {
    expect(
      plotPath(
        [
          { month: "a", value: 2, previous: null },
          { month: "b", value: null, previous: null },
          { month: "c", value: 0, previous: null },
        ],
        "value",
        4,
      ),
    ).toBe("M48,128  M172,218");
  });
  it("does not treat a missing yield with legacy high as a production signal", () => {
    expect(legacySignal(plant(null))).toBe(false);
    expect(legacySignal(plant(0))).toBe(true);
  });
  it("keeps source array and scope totals unchanged while filtering", () => {
    const input = [plant(null), plant(0), plant(25, "normal")];
    expect(selectPlants(input, "ภาษาไทย", "missing")).toEqual([input[0]]);
    expect(selectPlants(input, "", "signal")).toEqual([input[1]]);
    expect(input).toHaveLength(3);
  });
  it("formats missing distinctly from zero", () => {
    expect(number(null)).toBe("ไม่มีข้อมูล");
    expect(number(0)).toBe("0");
  });
});
