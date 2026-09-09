import { expect, it } from "vitest";
import { parseRows, parseSheet } from "../src/lib/report-parser";

it("reads headers and the first plant even when Huawei declares a range starting at row 4", () => {
  const rows = parseSheet({
    "!ref": "A4:C4",
    A1: { t: "s", v: "Plant Report" },
    A2: { t: "s", v: "Plant Name" },
    B2: { t: "s", v: "Total String Capacity (kWp)" },
    C2: { t: "s", v: "Inverter Yield (kWh)" },
    A3: { t: "s", v: "SKL" }, B3: { t: "n", v: 20.16 }, C3: { t: "n", v: 2943.95 },
    A4: { t: "s", v: "JAN" }, B4: { t: "n", v: 20.8 }, C4: { t: "n", v: 2889.6 },
  }, "2026-02");
  expect(rows.map(row => row.plantName)).toEqual(["SKL", "JAN"]);
  expect(rows[0].inverterYieldKwh).toBe(2943.95);
});

it("keeps headerless plants with missing capacity or all missing measurements", () => {
  const producing = Array<unknown>(24).fill("");
  producing[0] = "Plant without capacity"; producing[1] = "Thailand";
  producing[7] = 420.38; producing[8] = 420.38;
  const missing = Array<unknown>(24).fill("");
  missing[0] = "Plant not reporting"; missing[1] = "Thailand";
  const rows = parseRows([producing, missing], "2026-02");
  expect(rows).toHaveLength(2);
  expect(rows[0].capacityKwp).toBeNull();
  expect(rows[0].inverterYieldKwh).toBe(420.38);
  expect(rows[1].inverterYieldKwh).toBeNull();
});

it("does not guess positional columns for an unrelated short table", () => {
  expect(parseRows([["not a solar report", "some address", 10, 20]])).toEqual([]);
});
