import { loadEnvConfig } from "@next/env";
import fs from "node:fs/promises";
import pg from "pg";
loadEnvConfig(process.cwd());
async function main() {
  const c = new pg.Client({ connectionString: process.env.NEON_DB });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout='5s'");
    await c.query(
      await fs.readFile("migrations/20260909-inspections.sql", "utf8"),
    );
    await c.query("COMMIT");
    console.log(
      "Inspection tables ready. Reports, scoring, repair history and AI history unchanged.",
    );
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.end();
  }
}
main().catch(() => {
  console.error("Inspection migration failed; rolled back.");
  process.exitCode = 1;
});
