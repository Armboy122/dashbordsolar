import { beforeEach, it, expect, vi } from "vitest";
const sql = vi.hoisted(() => vi.fn());
vi.mock("../src/db/client", () => ({ sql }));
import {
  loadAnalysisContext,
  enqueueMonthlyAnalysis,
  completeAnalysisJob,
  failAnalysisJob,
} from "../src/lib/operations-store";
beforeEach(() => {
  sql.mockReset();
  sql.mockResolvedValue([]);
});
it("bounds both monthly data and repair chronology to the selected month", async () => {
  await loadAnalysisContext("A", "2026-02");
  const monthly = sql.mock.calls.find((c) =>
    c[0].join("").includes("from monthly_reports"),
  );
  expect(monthly?.slice(1)).toEqual(["A", "2024-02", "2026-02"]);
  const repairs = sql.mock.calls.find((c) =>
    c[0].join("").includes("from solar_maintenance_records"),
  );
  expect(repairs?.slice(1)).toEqual(["A", "2026-02-01"]);
  expect(repairs?.[0].join("")).toContain("interval '1 month'");
});
it("deduplicates sites and uses import-specific conflict protection", async () => {
  await enqueueMonthlyAnalysis("import-id", "2026-02", ["A", "A", "B"]);
  const call = sql.mock.calls.find((c) =>
    c[0].join("").includes("insert into solar_ai_jobs"),
  );
  expect(call?.slice(1)).toEqual(["import:import-id:", "2026-02", '["A","B"]']);
  expect(call?.[0].join("")).toContain("on conflict(trigger_key) do nothing");
});
it("fences stale completions and stops retrying after attempt three", async () => {
  await completeAnalysisJob({ id: "id", token: "token" }, {
    inputHash: "hash",
    model: "model",
    promptVersion: "v",
  } as never);
  expect(sql.mock.calls.at(-1)?.[0].join("")).toContain("and status='running'");
  expect(sql.mock.calls.at(-1)?.slice(-2)).toEqual(["id", "token"]);
  await failAnalysisJob({ id: "id", token: "token", attempts: 3 }, "safe");
  expect(sql.mock.calls.at(-1)?.[1]).toBe("failed");
});
