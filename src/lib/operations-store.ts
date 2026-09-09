import { sql } from "@/src/db/client";
import { randomUUID } from "node:crypto";
import { withTimeout } from "@/src/lib/async-timeout";
import {
  buildEvidence,
  previousMonth,
  type AnalysisDbRow,
} from "@/src/lib/gemini-analysis";
import type { SolarAiResult } from "@/src/types/solar-ai";
import type { RepairRecord, RepairEvidence } from "@/src/types/maintenance";
let schemaReady: Promise<void> | undefined;
export function ensureOperationsSchema() {
  return (schemaReady ??= (async () => {
    await sql`create table if not exists solar_maintenance_records (
   id uuid primary key default gen_random_uuid(),site_name text not null,occurred_on date not null,
   category text not null,findings text not null,action_taken text not null,outcome text not null,
   verification_evidence text not null default '',recorded_by text not null,created_at timestamptz not null default now(),
   check(outcome in ('unknown','follow_up','reported_fixed','verified_resolved'))
  )`;
    await sql`create index if not exists solar_maintenance_site_date on solar_maintenance_records(site_name,occurred_on)`;
    await sql`create table if not exists solar_ai_jobs (
   id uuid primary key default gen_random_uuid(),trigger_key text unique not null,site_name text not null,report_month text not null,
   status text not null default 'queued',attempts integer not null default 0,lease_token uuid,started_at timestamptz,
   next_attempt_at timestamptz not null default now(),finished_at timestamptz,created_at timestamptz not null default now(),
   input_hash text,model text,prompt_version text,result jsonb,last_error text,
   check(status in ('queued','running','succeeded','failed'))
  )`;
    await sql`create index if not exists solar_ai_jobs_pending on solar_ai_jobs(status,next_attempt_at)`;
    await sql`create index if not exists solar_ai_jobs_site_month on solar_ai_jobs(site_name,report_month,created_at desc)`;
  })().catch((error) => {
    schemaReady = undefined;
    throw error;
  }));
}
export function mapRepair(row: Record<string, unknown>): RepairRecord {
  return {
    id: String(row.id),
    siteName: String(row.site_name),
    occurredOn: String(row.occurred_on).slice(0, 10),
    category: String(row.category),
    findings: String(row.findings),
    actionTaken: String(row.action_taken),
    outcome: row.outcome as RepairRecord["outcome"],
    verificationEvidence: String(row.verification_evidence || ""),
    recordedBy: String(row.recorded_by),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}
export async function readRepairs(site: string) {
  await ensureOperationsSchema();
  const rows =
    await sql`select * from solar_maintenance_records where site_name=${site} order by occurred_on desc,created_at desc limit 200`;
  return rows.map(mapRepair);
}
export async function addRepair(input: Omit<RepairRecord, "id" | "createdAt">) {
  await ensureOperationsSchema();
  const exists =
    await sql`select name from sites where name=${input.siteName} limit 1`;
  if (!exists.length) throw Error("SITE_NOT_FOUND");
  const rows =
    await sql`insert into solar_maintenance_records(site_name,occurred_on,category,findings,action_taken,outcome,verification_evidence,recorded_by) values (${input.siteName},${input.occurredOn}::date,${input.category},${input.findings},${input.actionTaken},${input.outcome},${input.verificationEvidence},${input.recordedBy}) returning *`;
  return mapRepair(rows[0]);
}
export async function loadAnalysisContext(site: string, month: string) {
  await ensureOperationsSchema();
  const [rows, repairs] = await Promise.all([
    withTimeout(
      sql`select report_month,inverter_yield_kwh,capacity_kwp,self_consumption_kwh,export_kwh,consumption_kwh from monthly_reports where site_name=${site} and report_month>=${previousMonth(month, -24)} and report_month<=${month} order by report_month asc limit 25`,
      8000,
      "Analysis data timeout",
    ) as Promise<AnalysisDbRow[]>,
    withTimeout(
      sql`select * from solar_maintenance_records where site_name=${site} and occurred_on < (${month + "-01"}::date + interval '1 month') order by occurred_on desc,created_at desc limit 50`,
      8000,
      "Repair history timeout",
    ),
  ]);
  const repairEvidence: RepairEvidence[] = repairs
    .map(mapRepair)
    .map(
      ({
        id,
        occurredOn,
        category,
        findings,
        actionTaken,
        outcome,
        verificationEvidence,
      }) => ({
        id: `repair-${id}`,
        occurredOn,
        category,
        findings,
        actionTaken,
        outcome,
        verificationEvidence,
        source: "caretaker_record",
      }),
    );
  return {
    rows,
    evidence: buildEvidence(rows, month),
    repairs: repairEvidence,
  };
}
export async function enqueueMonthlyAnalysis(
  importId: string,
  month: string,
  sites: string[],
) {
  await ensureOperationsSchema();
  const unique = [...new Set(sites.filter(Boolean))];
  if (!unique.length) return 0;
  const inserted =
    await sql`insert into solar_ai_jobs(trigger_key,site_name,report_month) select ${"import:" + importId + ":"}||name,name,${month} from jsonb_array_elements_text(${JSON.stringify(unique)}::jsonb) name on conflict(trigger_key) do nothing returning id`;
  return inserted.length;
}
export async function claimAnalysisJob() {
  // Expired leases survive process restarts; a fencing token prevents an old worker overwriting a reclaimed job.
  await sql`update solar_ai_jobs set status=case when attempts>=3 then 'failed' else 'queued' end,last_error='Worker interrupted; waiting for retry',next_attempt_at=now() where status='running' and started_at < now()-interval '2 minutes'`;
  const token = randomUUID();
  const rows =
    await sql`update solar_ai_jobs set status='running',attempts=attempts+1,started_at=now(),lease_token=${token}::uuid where id=(select id from solar_ai_jobs where status='queued' and next_attempt_at<=now() order by created_at asc for update skip locked limit 1) returning *`;
  return rows.length
    ? {
        id: String(rows[0].id),
        site: String(rows[0].site_name),
        month: String(rows[0].report_month),
        attempts: Number(rows[0].attempts),
        token,
      }
    : null;
}
export async function findCachedAnalysis(
  site: string,
  month: string,
  hash: string,
  model: string,
  promptVersion: string,
) {
  const rows =
    await sql`select result from solar_ai_jobs where site_name=${site} and report_month=${month} and status='succeeded' and input_hash=${hash} and model=${model} and prompt_version=${promptVersion} order by finished_at desc limit 1`;
  return rows[0]?.result as SolarAiResult | undefined;
}
export async function completeAnalysisJob(
  job: { id: string; token: string },
  result: SolarAiResult,
) {
  await sql`update solar_ai_jobs set status='succeeded',result=${JSON.stringify(result)}::jsonb,input_hash=${result.inputHash},model=${result.model},prompt_version=${result.promptVersion},finished_at=now(),last_error=null where id=${job.id}::uuid and lease_token=${job.token}::uuid and status='running'`;
}
export async function failAnalysisJob(
  job: { id: string; token: string; attempts: number },
  message: string,
) {
  await sql`update solar_ai_jobs set status=${job.attempts >= 3 ? "failed" : "queued"},last_error=${message},next_attempt_at=now()+interval '60 seconds',finished_at=case when ${job.attempts >= 3} then now() else null end where id=${job.id}::uuid and lease_token=${job.token}::uuid and status='running'`;
}
export async function saveManualAnalysis(site: string, result: SolarAiResult) {
  await ensureOperationsSchema();
  await sql`insert into solar_ai_jobs(trigger_key,site_name,report_month,status,attempts,finished_at,input_hash,model,prompt_version,result) values (${"manual:" + randomUUID()},${site},${result.month},'succeeded',1,now(),${result.inputHash},${result.model},${result.promptVersion},${JSON.stringify(result)}::jsonb)`;
}
export async function analysisHistory(site: string, month: string) {
  await ensureOperationsSchema();
  const rows =
    await sql`select id,report_month,status,attempts,last_error,created_at,finished_at,result from solar_ai_jobs where site_name=${site} and report_month=${month} order by created_at desc limit 25`;
  return rows.map((r) => ({
    id: String(r.id),
    reportMonth: String(r.report_month),
    status: String(r.status),
    attempts: Number(r.attempts),
    lastError: r.last_error ? String(r.last_error) : null,
    createdAt: new Date(String(r.created_at)).toISOString(),
    finishedAt: r.finished_at
      ? new Date(String(r.finished_at)).toISOString()
      : null,
    result: r.result as SolarAiResult | null,
  }));
}
