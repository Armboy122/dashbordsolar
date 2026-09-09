export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAnalysisWorker } = await import("./src/lib/analysis-worker");
    startAnalysisWorker();
  }
}
