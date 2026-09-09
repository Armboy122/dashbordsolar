import {
  analyzeEvidence,
  analysisInput,
  AnalysisError,
  DEFAULT_GEMINI_MODEL,
  PROMPT_VERSION,
} from "@/src/lib/gemini-analysis";
import {
  ensureOperationsSchema,
  claimAnalysisJob,
  loadAnalysisContext,
  findCachedAnalysis,
  completeAnalysisJob,
  failAnalysisJob,
} from "@/src/lib/operations-store";
const workerGlobal = globalThis as typeof globalThis & {
  __solarAnalysisWorker?: boolean;
};
export async function runOneAnalysisJob() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return false;
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  if (!/^gemini-[a-z0-9.-]+$/.test(model)) return false;
  const job = await claimAnalysisJob();
  if (!job) return false;
  try {
    const { rows, evidence, repairs } = await loadAnalysisContext(
      job.site,
      job.month,
    );
    if (!rows.length)
      throw new AnalysisError(
        "NO_DATA",
        "ไม่มีข้อมูลในช่วงที่ใช้วิเคราะห์",
        422,
      );
    const { inputHash } = analysisInput(evidence, job.month, repairs);
    const cached = await findCachedAnalysis(
      job.site,
      job.month,
      inputHash,
      model,
      PROMPT_VERSION,
    );
    const result =
      cached ??
      (await analyzeEvidence(evidence, job.month, { apiKey, model, repairs }));
    await completeAnalysisJob(job, result);
  } catch (error) {
    await failAnalysisJob(
      job,
      error instanceof AnalysisError
        ? error.message
        : "อ่านข้อมูลหรือบันทึกผลวิเคราะห์ไม่สำเร็จ",
    );
  }
  return true;
}
export function startAnalysisWorker() {
  if (workerGlobal.__solarAnalysisWorker || !process.env.GEMINI_API_KEY) return;
  workerGlobal.__solarAnalysisWorker = true;
  const tick = async () => {
    try {
      await ensureOperationsSchema();
      await runOneAnalysisJob();
    } catch {
      /* Durable jobs remain available; never expose DB or provider secrets in logs. */
    } finally {
      setTimeout(() => void tick(), 10000).unref();
    }
  };
  void tick();
}
