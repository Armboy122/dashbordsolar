import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { parsePlantReport } from "../src/lib/report-parser";
import { resolveSyncMonths, validateSource } from "../src/lib/solar-sync";
import { downloadReport } from "./fusionsolar/download";

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  try { process.loadEnvFile(path.join(root, ".env")); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  const { values } = parseArgs({ options: {
    month: { type: "string" }, file: { type: "string" }, "expected-sites": { type: "string" },
    apply: { type: "boolean", default: false }, headed: { type: "boolean", default: false },
    "download-only": { type: "boolean", default: false }, help: { type: "boolean", default: false },
  } });
  if (values.help) {
    console.log("npm run sync:fusionsolar -- [--month YYYY-MM] [--apply] [--headed] [--download-only]\nOffline: --file '/path/Plant Report_MM-YYYY.xlsx' --month YYYY-MM [--expected-sites N]\nDefault: download current + previous Bangkok month, validate and preview without DB writes.\nCredentials: FUSIONSOLAR_USERNAME / FUSIONSOLAR_PASSWORD. Database: NEON_DB.");
    return;
  }
  if (values.file && !values.month) throw new Error("--file requires --month");
  if (values.apply && values["download-only"]) throw new Error("Choose --apply or --download-only");
  const expected = values["expected-sites"] === undefined ? undefined : Number(values["expected-sites"]);
  if (expected !== undefined && (!Number.isInteger(expected) || expected <= 0)) throw new Error("Invalid --expected-sites");
  const months = resolveSyncMonths(values.month);
  const cache = path.join(root, "cache", "fusionsolar");
  await fs.mkdir(cache, { recursive: true, mode: 0o700 });
  const lock = path.join(cache, "sync.lock");
  try { await fs.mkdir(lock); } catch { throw new Error("Another sync is running (cache/fusionsolar/sync.lock). Remove a stale lock only after confirming no worker is running."); }
  try {
    for (const month of months) {
      const directory = path.join(cache, `${month}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
      await fs.mkdir(directory, { mode: 0o700 });
      let file = values.file ? path.resolve(values.file) : "";
      let expectedRows = expected;
      if (!file) {
        const username = process.env.FUSIONSOLAR_USERNAME;
        const password = process.env.FUSIONSOLAR_PASSWORD;
        if (!username || !password) throw new Error("Set FUSIONSOLAR_USERNAME and FUSIONSOLAR_PASSWORD before downloading");
        console.log(`[${month}] Downloading report from FusionSolar...`);
        const result = await downloadReport({ month, directory, username, password, headed: values.headed });
        file = result.file;
        if (expected !== undefined && expected !== result.expectedRows) throw new Error(`Website reports ${result.expectedRows} sites; configured count is ${expected}`);
        expectedRows = result.expectedRows;
      }
      const bytes = await fs.readFile(file);
      const rows = await parsePlantReport(new File([bytes], path.basename(file)));
      validateSource(rows, month, path.basename(file), expectedRows);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const summary: Record<string, unknown> = {
        month, file, sha256: hash, sites: rows.length, expectedSites: expectedRows ?? null,
        inverterYieldKwh: Number(rows.reduce((sum, row) => sum + (row.inverterYieldKwh ?? 0), 0).toFixed(3)),
        imported: false,
      };
      if (!values["download-only"]) {
        const { importSource } = await import("./fusionsolar/import");
        Object.assign(summary, await importSource(rows, { month, filename: path.basename(file), hash, apply: values.apply, expectedSites: expectedRows }));
      }
      await fs.writeFile(path.join(directory, "result.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
      console.log(JSON.stringify(summary, null, 2));
    }
  } finally { await fs.rmdir(lock); }
}

main().catch(error => {
  // Do not print stack traces or DB connection strings.
  let message = error instanceof Error ? error.message : "Sync failed";
  for (const key of ["FUSIONSOLAR_PASSWORD", "NEON_DB"]) {
    if (process.env[key]) message = message.split(process.env[key]!).join("[redacted]");
  }
  console.error(message);
  process.exitCode = 1;
});
