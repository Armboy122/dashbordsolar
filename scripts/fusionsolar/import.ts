import pg from "pg";
import { randomUUID } from "node:crypto";
import { scorePlants } from "../../src/lib/scoring";
import { mergeSource, normalizeSiteName, sourceValues, syncFields, type SourceValues, type SyncField } from "../../src/lib/solar-sync";
import type { PlantReportRow, ScoredPlant } from "../../src/types/solar";
import { rebuildMonthlyAnalysis } from "../../src/lib/rebuild-monthly-analysis";

const columns: Record<SyncField, string> = {
  capacityKwp: "capacity_kwp", pvYieldKwh: "pv_yield_kwh", inverterYieldKwh: "inverter_yield_kwh",
  exportKwh: "export_kwh", importKwh: "import_kwh", specificEnergy: "specific_energy",
  consumptionKwh: "consumption_kwh", selfConsumptionKwh: "self_consumption_kwh",
  selfConsumptionRate: "self_consumption_rate", peakPowerKw: "peak_power_kw", revenueBaht: "revenue_baht",
};
type DbRow = Record<string, unknown> & { site_name: string; report_month: string };
type State = { site_name: string; source_values: SourceValues; protected_fields: SyncField[] };

function rowFromDb(row: DbRow): PlantReportRow {
  return {
    plantName: row.site_name, performanceRatio: null,
    ...Object.fromEntries(syncFields.map(field => [field, row[columns[field]] == null ? null : Number(row[columns[field]])])),
  } as PlantReportRow;
}

export async function importSource(rows: PlantReportRow[], options: { month: string; filename: string; hash: string; apply: boolean; expectedSites?: number }) {
  if (!process.env.NEON_DB) throw new Error("Missing NEON_DB");
  const connection = new URL(process.env.NEON_DB);
  connection.searchParams.set("sslmode", "verify-full");
  const client = new pg.Client({ connectionString: connection.toString(), connectionTimeoutMillis: 15_000, statement_timeout: 120_000 });
  await client.connect();
  try {
    await client.query(options.apply ? "BEGIN" : "BEGIN READ ONLY");
    if (options.apply) {
      await client.query(`CREATE TABLE IF NOT EXISTS fusionsolar_sources (
        site_name text NOT NULL, report_month text NOT NULL,
        source_values jsonb NOT NULL, protected_fields jsonb NOT NULL DEFAULT '[]',
        source_sha256 text NOT NULL, synced_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (site_name, report_month)
      )`);
      await client.query(`CREATE TABLE IF NOT EXISTS fusionsolar_sync_runs (
        id uuid PRIMARY KEY, report_month text NOT NULL, filename text NOT NULL,
        source_sha256 text NOT NULL, before_rows jsonb NOT NULL, summary jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
      // Serialize with imports/edits, including other workers, throughout read-merge-write.
      await client.query("LOCK TABLE sites, monthly_reports, fusionsolar_sources IN SHARE ROW EXCLUSIVE MODE");
    }
    const existing = (await client.query<DbRow>("SELECT * FROM monthly_reports WHERE report_month = $1 ORDER BY site_name", [options.month])).rows;
    const sites = (await client.query<{name: string}>("SELECT name FROM sites")).rows;
    const siteNames = new Map(sites.map(row => [normalizeSiteName(row.name), row.name]));
    for (const row of rows) {
      const match = siteNames.get(normalizeSiteName(row.plantName));
      if (match && match !== row.plantName) throw new Error(`Site name needs explicit mapping: ${row.plantName} -> ${match}`);
    }
    const hasState = (await client.query("SELECT to_regclass('public.fusionsolar_sources') AS name")).rows[0].name;
    const states = hasState ? (await client.query<State>("SELECT * FROM fusionsolar_sources WHERE report_month = $1", [options.month])).rows : [];
    const stateBySite = new Map(states.map(row => [row.site_name, row]));
    const currentBySite = new Map(existing.map(row => [row.site_name, row]));
    const protectedSites: Array<{site: string; fields: SyncField[]}> = [];
    const merged = rows.map(row => {
      const current = currentBySite.get(row.plantName);
      const state = stateBySite.get(row.plantName);
      const result = mergeSource(sourceValues(row), current ? sourceValues(rowFromDb(current)) : null, state?.source_values ?? null, state?.protected_fields ?? []);
      if (result.protectedFields.length) protectedSites.push({ site: row.plantName, fields: result.protectedFields });
      return { ...row, ...result.values };
    });
    const incomingNames = new Set(rows.map(row => row.plantName));
    const missingFromSource = existing.filter(row => !incomingNames.has(row.site_name)).map(row => row.site_name);
    const newSites = rows.filter(row => !siteNames.has(normalizeSiteName(row.plantName))).map(row => row.plantName);
    const inserted = merged.filter(row => !currentBySite.has(row.plantName)).length;
    const changed = merged.filter(row => {
      const current = currentBySite.get(row.plantName);
      return current && syncFields.some(field => sourceValues(rowFromDb(current))[field] !== row[field]);
    }).length;
    const summary = {
      imported: options.apply, inserted, updated: changed, unchanged: rows.length - inserted - changed,
      expectedSites: options.expectedSites ?? null,
      newSites, protectedSites, missingFromSource,
    };
    if (!options.apply) { await client.query("ROLLBACK"); return summary; }

    // Re-score the complete effective month, including sites absent from this source file.
    const scored = scorePlants([...merged, ...existing.filter(row => !incomingNames.has(row.site_name)).map(rowFromDb)]);
    const scoredByName = new Map(scored.map(row => [row.plantName, row]));
    const importId = randomUUID();
    const runId = randomUUID();
    await client.query("INSERT INTO import_files (id, filename, report_month, status) VALUES ($1,$2,$3,'imported')", [importId, options.filename, options.month]);
    for (const row of merged) {
      const site = await client.query<{id: string}>(`INSERT INTO sites(name,address,capacity_kwp) VALUES ($1,$2,$3)
        ON CONFLICT(name) DO UPDATE SET
          address = CASE WHEN NOT EXISTS (SELECT 1 FROM monthly_reports m WHERE m.site_name = $1 AND m.report_month > $4) THEN EXCLUDED.address ELSE sites.address END,
          capacity_kwp = CASE WHEN NOT EXISTS (SELECT 1 FROM monthly_reports m WHERE m.site_name = $1 AND m.report_month > $4) THEN EXCLUDED.capacity_kwp ELSE sites.capacity_kwp END
        RETURNING id`, [row.plantName, row.address || null, row.capacityKwp, options.month]);
      await writeReport(client, scoredByName.get(row.plantName)!, options.month, site.rows[0].id, importId);
      const original = rows.find(source => source.plantName === row.plantName)!;
      const protectedFields = protectedSites.find(item => item.site === row.plantName)?.fields ?? [];
      await client.query(`INSERT INTO fusionsolar_sources (site_name,report_month,source_values,protected_fields,source_sha256)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT(site_name,report_month) DO UPDATE SET
        source_values=EXCLUDED.source_values, protected_fields=EXCLUDED.protected_fields,
        source_sha256=EXCLUDED.source_sha256, synced_at=now()`,
      [row.plantName, options.month, JSON.stringify(sourceValues(original)), JSON.stringify(protectedFields), options.hash]);
    }
    for (const name of missingFromSource) {
      const row = scoredByName.get(name)!;
      await client.query(`UPDATE monthly_reports SET risk_score=$3,risk_level=$4,reasons_json=$5,actions_json=$6,updated_at=now()
        WHERE site_name=$1 AND report_month=$2`, [name, options.month, row.riskScore, row.riskLevel, JSON.stringify(row.reasons), JSON.stringify(row.actions)]);
    }
    await refreshHistory(client);
    await client.query("INSERT INTO fusionsolar_sync_runs(id,report_month,filename,source_sha256,before_rows,summary) VALUES($1,$2,$3,$4,$5,$6)",
      [runId, options.month, options.filename, options.hash, JSON.stringify(existing), JSON.stringify(summary)]);
    await client.query("COMMIT");
    return { ...summary, runId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { await client.end(); }
}

async function refreshHistory(client: pg.Client) {
  const writes: Array<{ text: string; values: unknown[] }> = [];
  await rebuildMonthlyAnalysis(async (strings, ...values) => {
    const text = strings.reduce((result, part, index) => result + (index ? `$${index}` : "") + part, "");
    if (/^\s*select\b/i.test(text)) return (await client.query(text, values)).rows;
    writes.push({ text, values });
    return [];
  });
  // Same historical rules as manual imports, batched instead of one round trip per row.
  for (let offset = 0; offset < writes.length; offset += 500) {
    const batch = writes.slice(offset, offset + 500);
    const template = batch[0].text;
    const valuesIndex = template.search(/\bvalues\s*\(/i);
    const conflictIndex = template.search(/\bon conflict\b/i);
    if (valuesIndex < 0 || conflictIndex < 0) throw new Error("Unexpected historical-analysis statement");
    const params = batch.flatMap(item => item.values);
    const count = batch[0].values.length;
    const tuples = batch.map((_, index) => `(${Array.from({ length: count }, (_, column) => `$${index * count + column + 1}`).join(",")})`).join(",");
    await client.query(`${template.slice(0, valuesIndex)} VALUES ${tuples} ${template.slice(conflictIndex)}`, params);
  }
}

async function writeReport(client: pg.Client, row: ScoredPlant, month: string, siteId: string, importId: string) {
  const names = ["site_id", "site_name", "report_month", ...syncFields.map(field => columns[field]), "peak_ratio", "risk_score", "risk_level", "reasons_json", "actions_json", "import_file_id"];
  const values = [siteId, row.plantName, month, ...syncFields.map(field => row[field]), row.peakRatio, row.riskScore, row.riskLevel, JSON.stringify(row.reasons), JSON.stringify(row.actions), importId];
  // Column identifiers are fixed constants; all external values are bound parameters.
  await client.query(`INSERT INTO monthly_reports (${names.join(",")}) VALUES (${values.map((_, index) => `$${index + 1}`).join(",")})
    ON CONFLICT(site_name, report_month) DO UPDATE SET ${names.filter(name => !["site_name", "report_month"].includes(name)).map(name => `${name}=EXCLUDED.${name}`).join(",")}, updated_at=now()`, values);
}
