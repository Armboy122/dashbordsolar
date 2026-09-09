import { describe, it, expect, vi } from "vitest";
import {
  buildEvidence,
  analysisInput,
  analyzeEvidence,
  validateAnalysis,
  type AnalysisDbRow,
} from "../src/lib/gemini-analysis";
const row = (month: string, yieldValue: string | null): AnalysisDbRow => ({
  report_month: month,
  inverter_yield_kwh: yieldValue,
  capacity_kwp: "10",
  self_consumption_kwh: null,
  export_kwh: "0",
  consumption_kwh: null,
});
const evidence = buildEvidence(
  [row("2026-01", "100"), row("2026-02", "0")],
  "2026-02",
);
const output = () => ({
  summary: "ควรตรวจข้อมูลก่อนสรุป",
  hypotheses: [
    {
      title: "อาจมีช่วงหยุด",
      explanation: "ยังไม่ยืนยันสาเหตุ",
      evidenceIds: ["month-2026-02"],
      checks: ["ตรวจรายงานต้นทาง"],
    },
  ],
  dataQualityNotes: ["ไม่มีข้อมูลสถานะเปิดใช้งาน"],
  limitations: ["ไม่ใช่สถานะสด"],
});
const gemini = (content: unknown, reason = "STOP") =>
  Response.json({
    candidates: [
      {
        finishReason: reason,
        content: { parts: [{ text: JSON.stringify(content) }] },
      },
    ],
  });
describe("Gemini evidence boundaries", () => {
  it("distinguishes missing report, null field, and zero without future leakage", () => {
    const result = buildEvidence(
      [row("2026-01", null), row("2026-02", "0"), row("2026-03", "999")],
      "2026-02",
    );
    expect(result).toHaveLength(25);
    expect(result.at(-3)).toMatchObject({
      hasReport: false,
      inverterYieldKwh: null,
    });
    expect(result.at(-2)).toMatchObject({
      hasReport: true,
      inverterYieldKwh: null,
    });
    expect(result.at(-1)).toMatchObject({
      hasReport: true,
      inverterYieldKwh: 0,
    });
    expect(result.some((e) => e.month === "2026-03")).toBe(false);
  });
  it("rejects invented evidence references", () => {
    const value = output();
    value.hypotheses[0].evidenceIds = ["invented"];
    expect(() => validateAnalysis(value, evidence)).toThrow();
  });
  it("rejects missing or oversized structured fields", () => {
    expect(() =>
      validateAnalysis({ ...output(), limitations: [] }, evidence),
    ).toThrow();
    expect(() =>
      validateAnalysis({ ...output(), summary: "a".repeat(1900) }, evidence),
    ).toThrow();
  });
  it("drops extra model-supplied status/scoring keys rather than treating them as instructions", () => {
    expect(
      validateAnalysis(
        { ...output(), status: "resolved", riskScore: 0 },
        evidence,
      ),
    ).not.toHaveProperty("status");
  });
  it("posts only numeric evidence without site identity and returns verifiable metadata", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(gemini(output()));
    const result = await analyzeEvidence(
      evidence,
      "2026-02",
      { apiKey: "test-secret", model: "gemini-2.5-flash" },
      fetcher,
    );
    const [url, options] = fetcher.mock.calls[0];
    expect(url).not.toContain("test-secret");
    const body = JSON.parse(options?.body as string);
    const input = JSON.parse(body.contents[0].parts[0].text);
    expect(input).not.toHaveProperty("site");
    expect(input.evidence.at(-1).inverterYieldKwh).toBe(0);
    expect(body).not.toHaveProperty("tools");
    expect(result.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result).not.toHaveProperty("apiKey");
    expect(result.analysis.summary).toBe(output().summary);
  });
  it("rejects truncated provider output", async () => {
    await expect(
      analyzeEvidence(
        evidence,
        "2026-02",
        { apiKey: "x", model: "gemini-2.5-flash" },
        vi.fn<typeof fetch>().mockResolvedValue(gemini(output(), "MAX_TOKENS")),
      ),
    ).rejects.toMatchObject({ code: "INCOMPLETE_OUTPUT" });
  });
  it("redacts provider errors rather than returning body secrets", async () => {
    await expect(
      analyzeEvidence(
        evidence,
        "2026-02",
        { apiKey: "secret", model: "gemini-2.5-flash" },
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("secret", { status: 403 })),
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR", status: 502 });
  });
  it("handles rate limits and network failures explicitly", async () => {
    await expect(
      analyzeEvidence(
        evidence,
        "2026-02",
        { apiKey: "x", model: "gemini-2.5-flash" },
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("", { status: 429 })),
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
    await expect(
      analyzeEvidence(
        evidence,
        "2026-02",
        { apiKey: "x", model: "gemini-2.5-flash" },
        vi.fn<typeof fetch>().mockRejectedValue(Error("secret")),
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE", status: 504 });
  });
  it("rejects malformed JSON inside a successful provider response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "not json" }] },
          },
        ],
      }),
    );
    await expect(
      analyzeEvidence(
        evidence,
        "2026-02",
        { apiKey: "x", model: "gemini-2.5-flash" },
        fetcher,
      ),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });
});

it("includes repair changes in cache identity and accepts only supplied repair citations", () => {
  const repair = {
    id: "repair-1",
    occurredOn: "2026-02-01",
    category: "ตรวจสอบ",
    findings: "พบฝุ่น",
    actionTaken: "ทำความสะอาด",
    outcome: "reported_fixed" as const,
    verificationEvidence: "",
    source: "caretaker_record" as const,
  };
  const value = output();
  value.hypotheses[0].evidenceIds = [repair.id];
  expect(() => validateAnalysis(value, evidence, [repair])).not.toThrow();
  expect(() => validateAnalysis(value, evidence, [])).toThrow();
  expect(analysisInput(evidence, "2026-02", [repair]).inputHash).not.toBe(
    analysisInput(evidence, "2026-02", []).inputHash,
  );
});
