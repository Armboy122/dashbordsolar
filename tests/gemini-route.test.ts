import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("../src/db/client", () => ({ sql: query }));
const providerResult = {
  summary: "ตัวอย่างสำหรับทดสอบ",
  hypotheses: [],
  dataQualityNotes: ["ยังไม่ยืนยัน"],
  limitations: ["ข้อมูลรายเดือน"],
};
const request = (
  body: unknown,
  url = "http://localhost/api/analysis/site",
  origin = "http://localhost",
) =>
  new Request(url, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetModules();
  query.mockReset();
  query.mockImplementation(async (strings: TemplateStringsArray) =>
    strings.join(" ").includes("from monthly_reports")
      ? [
          {
            report_month: "2026-02",
            inverter_yield_kwh: "5",
            capacity_kwp: "10",
            export_kwh: null,
            self_consumption_kwh: null,
            consumption_kwh: null,
          },
        ]
      : [],
  );
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(providerResult) }] },
          },
        ],
      }),
    ),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("site analysis endpoint", () => {
  it("reports missing configuration without reading DB or calling Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const route = await import("../app/api/analysis/site/route");
    expect(await (await route.GET()).json()).toMatchObject({
      configured: false,
    });
    expect(
      (await route.POST(request({ site: "A", month: "2026-02" }))).status,
    ).toBe(503);
    expect(query).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and nonlocal requests", async () => {
    const { POST } = await import("../app/api/analysis/site/route");
    expect(
      (
        await POST(
          request(
            { site: "A", month: "2026-02" },
            undefined,
            "https://example.com",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          request(
            { site: "A", month: "2026-02" },
            "https://example.com/api/analysis/site",
            "https://example.com",
          ),
        )
      ).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["2026-13", "2026-00", "invalid", "2099-01"])(
    "rejects invalid/future month %s",
    async (month) => {
      const { POST } = await import("../app/api/analysis/site/route");
      expect((await POST(request({ site: "A", month }))).status).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("reads authoritative values with bounded date range and ignores client measurements", async () => {
    const { POST } = await import("../app/api/analysis/site/route");
    const response = await POST(
      request({
        site: "Private Site",
        month: "2026-02",
        inverterYieldKwh: 999999,
      }),
    );
    expect(response.status).toBe(200);
    expect(
      query.mock.calls
        .find((c) => c[0].join(" ").includes("from monthly_reports"))
        ?.slice(1),
    ).toEqual(["Private Site", "2024-02", "2026-02"]);
    const outbound = String(vi.mocked(fetch).mock.calls[0][1]?.body);
    expect(outbound).not.toContain("Private Site");
    expect(outbound).not.toContain("999999");
    expect((await response.json()).evidence.at(-1).inverterYieldKwh).toBe(5);
  });
  it("does not fabricate output for nonexistent site history", async () => {
    query.mockResolvedValue([]);
    const { POST } = await import("../app/api/analysis/site/route");
    expect(
      (await POST(request({ site: "Missing", month: "2026-02" }))).status,
    ).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("blocks a concurrent request while generation is running", async () => {
    let release: (value: Response) => void = () => {};
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((r) => {
          release = r;
        }),
    );
    const { POST } = await import("../app/api/analysis/site/route");
    const first = POST(request({ site: "A", month: "2026-02" }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect((await POST(request({ site: "A", month: "2026-02" }))).status).toBe(
      429,
    );
    release(
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(providerResult) }] },
          },
        ],
      }),
    );
    expect((await first).status).toBe(200);
  });
});
