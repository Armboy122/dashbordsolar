import { beforeEach, it, expect, vi } from "vitest";
const db = vi.hoisted(() => ({ addRepair: vi.fn(), readRepairs: vi.fn() }));
vi.mock("../src/lib/operations-store", () => db);
import { POST, GET } from "../app/api/maintenance/route";
const valid = {
  siteName: "A",
  occurredOn: "2026-02-15",
  category: "ตรวจสอบ",
  findings: "พบฝุ่น",
  actionTaken: "ทำความสะอาด",
  outcome: "reported_fixed",
  verificationEvidence: "",
  recordedBy: "ผู้ดูแล",
};
const req = (body: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/maintenance", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  db.addRepair.mockResolvedValue({ ...valid, id: "real-returned-id" });
  db.readRepairs.mockResolvedValue([]);
});
it("keeps empty history empty", async () => {
  expect(
    await (
      await GET(new Request("http://localhost/api/maintenance?site=A"))
    ).json(),
  ).toEqual({ ok: true, records: [] });
});
it("returns success only after persistence, preserving reported versus verified", async () => {
  const r = await POST(req(valid));
  expect(r.status).toBe(201);
  expect(db.addRepair).toHaveBeenCalledWith(valid);
  expect((await r.json()).record.outcome).toBe("reported_fixed");
});
it.each([
  null,
  {},
  { ...valid, occurredOn: "2026-02-30" },
  { ...valid, occurredOn: "2099-01-01" },
  { ...valid, outcome: "verified_resolved" },
])("rejects invalid or unsubstantiated records %#", async (body) => {
  expect((await POST(req(body))).status).toBe(400);
  expect(db.addRepair).not.toHaveBeenCalled();
});
it("does not claim a failed save succeeded", async () => {
  db.addRepair.mockRejectedValue(Error("db secret"));
  const r = await POST(req(valid));
  expect(r.status).toBe(500);
  expect(JSON.stringify(await r.json())).not.toContain("secret");
});
it("rejects cross origin writes", async () => {
  expect((await POST(req(valid, "https://example.com"))).status).toBe(403);
  expect(db.addRepair).not.toHaveBeenCalled();
});
