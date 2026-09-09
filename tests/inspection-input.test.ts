import { describe, it, expect } from "vitest";
import {
  parseInspectionCommand,
  validTransition,
} from "../src/lib/inspection-input";
const base = {
  action: "transition",
  requestId: "e1d1d85a-067e-4aa1-97a1-400000000001",
  id: "e1d1d85a-067e-4aa1-97a1-400000000002",
  version: 1,
  status: "inspected",
  actor: "ผู้ดูแล",
  note: "ผลตรวจ",
  repair: {
    occurredOn: "2026-02-15",
    findings: "พบฝุ่น",
    actionTaken: "ล้างแผง",
    outcome: "reported_fixed",
    verificationEvidence: "",
  },
};
describe("inspection validation", () => {
  it("distinguishes technician report from verified resolution", () => {
    expect(parseInspectionCommand(base)).toEqual(base);
    expect(() =>
      parseInspectionCommand({
        ...base,
        repair: { ...base.repair, outcome: "verified_resolved" },
      }),
    ).toThrow();
  });
  it.each([
    null,
    {},
    { ...base, version: 0 },
    { ...base, status: "normal" },
    { ...base, actor: " " },
    { ...base, repair: { ...base.repair, occurredOn: "2026-02-30" } },
    { ...base, repair: { ...base.repair, occurredOn: "2099-01-01" } },
    { ...base, repair: { ...base.repair, findings: "" } },
  ])("rejects invalid command %#", (v) =>
    expect(() => parseInspectionCommand(v)).toThrow(),
  );
  it("allows reopening but not notifying a completed inspection without reopening", () => {
    expect(validTransition("inspected", "awaiting")).toBe(true);
    expect(validTransition("inspected", "notified")).toBe(false);
    expect(validTransition("awaiting", "awaiting")).toBe(false);
  });
});
