import { beforeEach, afterEach, it, expect, vi } from "vitest";
const db = vi.hoisted(() => ({
  ensureOperationsSchema: vi.fn(),
  claimAnalysisJob: vi.fn(),
  loadAnalysisContext: vi.fn(),
  findCachedAnalysis: vi.fn(),
  completeAnalysisJob: vi.fn(),
  failAnalysisJob: vi.fn(),
}));
vi.mock("../src/lib/operations-store", () => db);
const generate = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/gemini-analysis", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  analyzeEvidence: generate,
}));
import { runOneAnalysisJob } from "../src/lib/analysis-worker";
const job = {
  id: "job",
  site: "A",
  month: "2026-02",
  attempts: 1,
  token: "lease",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "test");
  db.claimAnalysisJob.mockResolvedValue(job);
  db.loadAnalysisContext.mockResolvedValue({
    rows: [{}],
    evidence: [],
    repairs: [],
  });
  db.findCachedAnalysis.mockResolvedValue(undefined);
  generate.mockResolvedValue({ inputHash: "hash" });
});
afterEach(() => vi.unstubAllEnvs());
it("does not claim jobs without a key", async () => {
  vi.stubEnv("GEMINI_API_KEY", "");
  expect(await runOneAnalysisJob()).toBe(false);
  expect(db.claimAnalysisJob).not.toHaveBeenCalled();
});
it("persists a generated result with its lease and includes repair context", async () => {
  const repairs = [{ id: "repair-1" }];
  db.loadAnalysisContext.mockResolvedValue({
    rows: [{}],
    evidence: [],
    repairs,
  });
  await runOneAnalysisJob();
  expect(generate.mock.calls[0][2].repairs).toEqual(repairs);
  expect(db.completeAnalysisJob).toHaveBeenCalledWith(job, {
    inputHash: "hash",
  });
});
it("reuses a matching prior result without another paid request", async () => {
  db.findCachedAnalysis.mockResolvedValue({ inputHash: "cached" });
  await runOneAnalysisJob();
  expect(generate).not.toHaveBeenCalled();
  expect(db.completeAnalysisJob).toHaveBeenCalledWith(job, {
    inputHash: "cached",
  });
});
it("never marks provider failures succeeded or exposes arbitrary error text", async () => {
  generate.mockRejectedValue(Error("secret"));
  await runOneAnalysisJob();
  expect(db.completeAnalysisJob).not.toHaveBeenCalled();
  expect(db.failAnalysisJob).toHaveBeenCalledWith(
    job,
    "อ่านข้อมูลหรือบันทึกผลวิเคราะห์ไม่สำเร็จ",
  );
});
it("does not generate against absent report history", async () => {
  db.loadAnalysisContext.mockResolvedValue({
    rows: [],
    evidence: [],
    repairs: [],
  });
  await runOneAnalysisJob();
  expect(generate).not.toHaveBeenCalled();
  expect(db.failAnalysisJob).toHaveBeenCalled();
});
