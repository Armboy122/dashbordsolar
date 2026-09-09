import { beforeEach, it, expect, vi } from "vitest";
const store = vi.hoisted(() => ({
  readInspections: vi.fn(),
  writeInspection: vi.fn(),
}));
vi.mock("../src/lib/inspection-store", () => store);
import { GET, POST } from "../app/api/inspections/route";
const v = {
  action: "create",
  requestId: "e1d1d85a-067e-4aa1-97a1-400000000001",
  siteName: "A",
  month: "2026-08",
  category: "data",
  title: "ไม่มีค่า",
  actor: "ผู้ดูแล",
};
const req = (value: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/inspections", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.resetAllMocks();
  store.readInspections.mockResolvedValue({ records: [], truncated: false });
  store.writeInspection.mockResolvedValue("id");
});
it("does not manufacture tasks on reads", async () => {
  expect(
    (await (await GET(new Request("http://localhost/api/inspections"))).json())
      .records,
  ).toEqual([]);
  expect(store.writeInspection).not.toHaveBeenCalled();
});
it("waits for persistence before success", async () => {
  expect((await POST(req(v))).status).toBe(200);
  expect(store.writeInspection).toHaveBeenCalledWith(v);
});
it("preserves conflict semantics", async () => {
  store.writeInspection.mockRejectedValue(Error("CONFLICT"));
  expect((await POST(req(v))).status).toBe(409);
});
it("hides database errors and never returns fake success", async () => {
  store.writeInspection.mockRejectedValue(Error("private credentials"));
  const r = await POST(req(v));
  expect(r.status).toBe(500);
  expect(JSON.stringify(await r.json())).not.toContain("credentials");
});
it("rejects cross-origin writes", async () => {
  expect((await POST(req(v, "https://example.org"))).status).toBe(403);
  expect(store.writeInspection).not.toHaveBeenCalled();
});
it("rejects malformed commands", async () => {
  expect((await POST(req({ ...v, month: "2026-13" }))).status).toBe(400);
  expect(store.writeInspection).not.toHaveBeenCalled();
});
