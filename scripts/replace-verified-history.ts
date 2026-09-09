/** Explicit full refresh only. Defaults to read-only preview; --apply requires a verified manifest. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import pg from "pg";
import { parsePlantReport } from "../src/lib/report-parser";
import type { PlantReportRow, ScoredPlant } from "../src/types/solar";
import { scorePlants } from "../src/lib/scoring";
import { sourceValues, normalizeSiteName } from "../src/lib/solar-sync";
import { rebuildMonthlyAnalysis } from "../src/lib/rebuild-monthly-analysis";
loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const rehearse = process.argv.includes("--rehearse");
const writesEnabled = apply || rehearse;
const fields = {
  capacityKwp: "capacity_kwp",
  pvYieldKwh: "pv_yield_kwh",
  inverterYieldKwh: "inverter_yield_kwh",
  exportKwh: "export_kwh",
  importKwh: "import_kwh",
  specificEnergy: "specific_energy",
  consumptionKwh: "consumption_kwh",
  selfConsumptionKwh: "self_consumption_kwh",
  selfConsumptionRate: "self_consumption_rate",
  peakPowerKw: "peak_power_kw",
  peakRatio: "peak_ratio",
  revenueBaht: "revenue_baht",
};
async function main() {
  const manifest = JSON.parse(
    await fs.readFile("artifacts/source-refresh/manifest.json", "utf8"),
  );
  const items = manifest.months as {
    month: string;
    freshFile: string;
    freshSha256: string;
    websiteSiteCount: number;
    downloadStatus: string;
  }[];
  if (
    items.length !== 39 ||
    items[0].month !== "2023-06" ||
    items.at(-1)?.month !== "2026-08" ||
    new Set(items.map((i) => i.month)).size !== 39
  )
    throw Error("Unexpected refresh range");
  const batches: {
    item: (typeof items)[number];
    rows: PlantReportRow[];
    scored: ScoredPlant[];
    importId: string;
  }[] = [];
  for (const item of items) {
    if (item.downloadStatus !== "downloaded_count_verified")
      throw Error("Unverified source");
    const bytes = await fs.readFile(item.freshFile);
    if (createHash("sha256").update(bytes).digest("hex") !== item.freshSha256)
      throw Error("Source changed after verification");
    const rows = await parsePlantReport(
      new File([bytes], path.basename(item.freshFile)),
    );
    if (
      rows.length !== item.websiteSiteCount ||
      new Set(rows.map((r) => normalizeSiteName(r.plantName))).size !==
        rows.length
    )
      throw Error("Count or identity mismatch " + item.month);
    batches.push({
      item,
      rows,
      scored: scorePlants(rows),
      importId: randomUUID(),
    });
  }
  const url = new URL(process.env.NEON_DB!);
  url.searchParams.set("sslmode", "verify-full");
  const c = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 15000,
    statement_timeout: 120000,
  });
  await c.connect();
  try {
    await c.query(writesEnabled ? "BEGIN" : "BEGIN READ ONLY");
    if (writesEnabled)
      await c.query(
        "LOCK TABLE sites,monthly_reports,monthly_analysis,fusionsolar_sources,import_files,fusionsolar_sync_runs IN SHARE ROW EXCLUSIVE MODE",
      );
    const months = items.map((i) => i.month);
    const before = (
      await c.query(
        "select * from monthly_reports where report_month=ANY($1::text[]) order by report_month,site_name",
        [months],
      )
    ).rows;
    const sites = (await c.query("select * from sites")).rows;
    const identities = new Map(
      sites.map((r) => [normalizeSiteName(r.name), r.name]),
    );
    for (const b of batches)
      for (const r of b.rows) {
        const old = identities.get(normalizeSiteName(r.plantName));
        if (old && old !== r.plantName)
          throw Error("Explicit name mapping needed");
      }
    const report = {
      applied: apply,
      months: months.length,
      beforeRows: before.length,
      afterRows: batches.reduce((s, b) => s + b.rows.length, 0),
      range: [months[0], months.at(-1)],
      preserved: [
        "solar_maintenance_records",
        "solar_ai_jobs",
        "site identities",
        "earlier import audit",
      ],
      sourceOnlyRemoved: before
        .filter(
          (r) =>
            !batches
              .find((b) => b.item.month === r.report_month)!
              .rows.some((p) => p.plantName === r.site_name),
        )
        .map((r) => ({ site: r.site_name, month: r.report_month })),
    };
    if (!writesEnabled) {
      await c.query("ROLLBACK");
      await fs.writeFile(
        "artifacts/source-refresh/replacement-preview.json",
        JSON.stringify(report, null, 2),
      );
      console.log(JSON.stringify(report));
      return;
    }
    const backup: Record<string, unknown> = { monthly_reports: before, sites };
    for (const table of [
      "monthly_analysis",
      "fusionsolar_sources",
      "import_files",
      "fusionsolar_sync_runs",
    ])
      backup[table] = (await c.query(`select * from ${table}`)).rows;
    const backupPath =
      "cache/fusionsolar/full-refresh-20260909/before-replacement" +
      (rehearse ? "-rehearsal" : "") +
      ".json";
    await fs.writeFile(backupPath, JSON.stringify(backup), {
      mode: 0o600,
      flag: "wx",
    });
    const latest = new Map<string, (typeof batches)[number]["rows"][number]>();
    for (const b of batches) for (const r of b.rows) latest.set(r.plantName, r);
    const siteJson = [...latest.values()].map((r) => ({
      name: r.plantName,
      address: r.address || null,
      capacity_kwp: r.capacityKwp,
    }));
    await c.query(
      `insert into sites(name,address,capacity_kwp) select name,address,capacity_kwp from jsonb_to_recordset($1::jsonb) as x(name text,address text,capacity_kwp numeric) on conflict(name) do update set address=excluded.address,capacity_kwp=excluded.capacity_kwp`,
      [JSON.stringify(siteJson)],
    );
    const siteIds = new Map(
      (await c.query("select id,name from sites")).rows.map((r) => [
        r.name,
        r.id,
      ]),
    );
    await c.query(
      "delete from monthly_analysis where report_month=ANY($1::text[])",
      [months],
    );
    await c.query(
      "delete from monthly_reports where report_month=ANY($1::text[])",
      [months],
    );
    await c.query(
      "delete from fusionsolar_sources where report_month=ANY($1::text[])",
      [months],
    );
    for (const b of batches) {
      const { item } = b;
      await c.query(
        "insert into import_files(id,filename,report_month,status) values($1,$2,$3,'imported')",
        [b.importId, path.basename(item.freshFile), item.month],
      );
      const records = b.scored.map((r) => ({
        id: randomUUID(),
        site_id: siteIds.get(r.plantName),
        site_name: r.plantName,
        report_month: item.month,
        ...Object.fromEntries(
          Object.entries(fields).map(([key, col]) => [
            col,
            r[key as keyof typeof r],
          ]),
        ),
        risk_score: r.riskScore,
        risk_level: r.riskLevel,
        reasons_json: JSON.stringify(r.reasons),
        actions_json: JSON.stringify(r.actions),
        import_file_id: b.importId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      await c.query(
        "insert into monthly_reports select * from jsonb_populate_recordset(null::monthly_reports,$1::jsonb)",
        [JSON.stringify(records)],
      );
      const source = b.rows.map((r) => ({
        site_name: r.plantName,
        report_month: item.month,
        source_values: sourceValues(r),
        protected_fields: [],
        source_sha256: item.freshSha256,
        synced_at: new Date().toISOString(),
      }));
      await c.query(
        "insert into fusionsolar_sources select * from jsonb_populate_recordset(null::fusionsolar_sources,$1::jsonb)",
        [JSON.stringify(source)],
      );
      await c.query(
        "insert into fusionsolar_sync_runs(id,report_month,filename,source_sha256,before_rows,summary,created_at) values($1,$2,$3,$4,$5,$6,clock_timestamp())",
        [
          randomUUID(),
          item.month,
          path.basename(item.freshFile),
          item.freshSha256,
          JSON.stringify(before.filter((r) => r.report_month === item.month)),
          JSON.stringify({
            imported: true,
            expectedSites: item.websiteSiteCount,
            mode: "explicit_verified_full_refresh",
            backupPath,
          }),
        ],
      );
    }
    const writes: { text: string; values: unknown[] }[] = [];
    await rebuildMonthlyAnalysis(async (strings, ...values) => {
      const text = strings.reduce((s, p, i) => s + (i ? "$" + i : "") + p, "");
      if (/^\s*select/i.test(text)) return (await c.query(text, values)).rows;
      writes.push({ text, values });
      return [];
    });
    for (let i = 0; i < writes.length; i += 300) {
      const batch = writes.slice(i, i + 300),
        t = batch[0].text,
        n = batch[0].values.length,
        v = t.search(/\bvalues\s*\(/i),
        conf = t.search(/\bon conflict\b/i);
      if (v < 0 || conf < 0) throw Error("Rebuild SQL changed");
      const tuples = batch
        .map(
          (_, j) =>
            "(" +
            Array.from({ length: n }, (_, k) => "$" + (j * n + k + 1)).join(
              ",",
            ) +
            ")",
        )
        .join(",");
      await c.query(
        t.slice(0, v) + " VALUES " + tuples + " " + t.slice(conf),
        batch.flatMap((b) => b.values),
      );
    }
    const verified = (
      await c.query(
        "select report_month,count(*)::integer as count,sum(inverter_yield_kwh) as total from monthly_reports where report_month=ANY($1::text[]) group by report_month order by report_month",
        [months],
      )
    ).rows;
    for (const b of batches) {
      const found = verified.find((r) => r.report_month === b.item.month);
      const nums = b.rows
        .map((r) => r.inverterYieldKwh)
        .filter((n): n is number => n !== null);
      const sum = nums.length ? nums.reduce((s, n) => s + n, 0) : null;
      if (
        found?.count !== b.rows.length ||
        (sum === null
          ? found.total !== null
          : Math.abs(Number(found.total) - sum) > 0.001)
      )
        throw Error("Post-write verification failed");
    }
    if (rehearse) {
      await c.query("ROLLBACK");
      await fs.writeFile(
        "artifacts/source-refresh/rehearsal.json",
        JSON.stringify(
          { rolledBack: true, rows: report.afterRows, verified },
          null,
          2,
        ),
      );
      console.log("Full replacement rehearsal verified and rolled back");
      return;
    }
    await c.query("COMMIT");
    await fs.writeFile(
      "artifacts/source-refresh/replacement-result.json",
      JSON.stringify({ ...report, backupPath, verified }, null, 2),
    );
    console.log(
      JSON.stringify({
        applied: true,
        rows: report.afterRows,
        months: report.months,
        backupPath,
      }),
    );
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}
main().catch((e) => {
  console.error(
    e instanceof Error
      ? e.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]")
      : "Refresh failed",
  );
  process.exitCode = 1;
});
