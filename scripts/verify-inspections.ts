import { loadEnvConfig } from "@next/env";
import pg from "pg";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
loadEnvConfig(process.cwd());
async function main() {
  const { writeInspection } = await import("../src/lib/inspection-store");
  const c = new pg.Client({ connectionString: process.env.NEON_DB });
  await c.connect();
  const migration = await fs.readFile(
    "migrations/20260909-inspections.sql",
    "utf8",
  );
  const schema = "inspection_qa_" + Date.now();
  try {
    await c.query("BEGIN");
    await c.query(`CREATE SCHEMA ${schema}`);
    await c.query(`SET LOCAL search_path TO ${schema},public`);
    await c.query("CREATE TABLE sites (id uuid PRIMARY KEY,name text UNIQUE)");
    await c.query(
      "CREATE TABLE monthly_reports(site_id uuid,report_month text,inverter_yield_kwh numeric)",
    );
    await c.query(
      "CREATE TABLE solar_maintenance_records (id uuid PRIMARY KEY,site_name text,occurred_on date,category text,findings text,action_taken text,outcome text,verification_evidence text,recorded_by text)",
    );
    await c.query(migration);
    await c.query(migration);
    const siteId = randomUUID();
    await c.query("INSERT INTO sites VALUES($1,$2)", [
      siteId,
      "ไซต์ทดสอบแยก ไม่ใช่ผลตรวจจริง",
    ]);
    await c.query("INSERT INTO monthly_reports VALUES($1,$2,$3)", [
      siteId,
      "2026-08",
      0,
    ]);
    const command = {
      action: "create" as const,
      requestId: randomUUID(),
      siteName: "ไซต์ทดสอบแยก ไม่ใช่ผลตรวจจริง",
      month: "2026-08",
      category: "production" as const,
      title: "ทดสอบแยก",
      actor: "QA",
    };
    const client = c as unknown as pg.PoolClient;
    const id = await writeInspection(command, client);
    assert.equal(await writeInspection(command, client), id);
    assert.equal(
      (await c.query("SELECT count(*)::int n FROM solar_inspections")).rows[0]
        .n,
      1,
    );
    assert.equal(
      (await c.query("SELECT evidence FROM solar_inspections")).rows[0].evidence
        .inverterYieldKwh,
      0,
    );
    async function rejected(
      v: Parameters<typeof writeInspection>[0],
      message: string,
    ) {
      await c.query("SAVEPOINT reject_test");
      await assert.rejects(
        () => writeInspection(v, client),
        new RegExp(message),
      );
      await c.query("ROLLBACK TO SAVEPOINT reject_test");
    }
    await rejected({ ...command, requestId: randomUUID() }, "DUPLICATE");
    const notified = {
      action: "transition" as const,
      requestId: randomUUID(),
      id,
      version: 1,
      status: "notified" as const,
      actor: "QA",
      note: "แจ้งด้วยตนเองในฐานทดสอบ",
    };
    await writeInspection(notified, client);
    await rejected(
      { ...notified, requestId: randomUUID(), status: "inspected" },
      "CONFLICT",
    );
    const result = {
      ...notified,
      requestId: randomUUID(),
      version: 2,
      status: "inspected" as const,
      repair: {
        occurredOn: "2026-09-09",
        findings: "ผลจำลองเฉพาะ schema ทดสอบ",
        actionTaken: "ไม่มีงานกับไซต์จริง",
        outcome: "follow_up" as const,
        verificationEvidence: "",
      },
    };
    await writeInspection(result, client);
    await writeInspection(result, client);
    assert.equal(
      (await c.query("SELECT count(*)::int n FROM solar_maintenance_records"))
        .rows[0].n,
      1,
    );
    assert.equal(
      (await c.query("SELECT count(*)::int n FROM solar_inspection_events"))
        .rows[0].n,
      3,
    );
    assert.equal(
      (await c.query("SELECT status FROM solar_inspections")).rows[0].status,
      "inspected",
    );
    // Fail repair insert: no status or event can survive the rolled-back operation.
    await writeInspection(
      {
        ...notified,
        requestId: randomUUID(),
        version: 3,
        status: "awaiting",
        note: "ติดตามเดิมต่อ",
      },
      client,
    );
    await c.query(
      "ALTER TABLE solar_maintenance_records ADD CONSTRAINT qa_reject CHECK(findings <> 'FAIL')",
    );
    await rejected(
      {
        ...result,
        requestId: randomUUID(),
        version: 4,
        repair: { ...result.repair, findings: "FAIL" },
      },
      "qa_reject",
    );
    assert.equal(
      (await c.query("SELECT status FROM solar_inspections")).rows[0].status,
      "awaiting",
    );
    assert.equal(
      (await c.query("SELECT count(*)::int n FROM solar_inspection_events"))
        .rows[0].n,
      4,
    );
    await c.query("ROLLBACK");
    assert.equal(
      (await c.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [schema]))
        .rowCount,
      0,
    );
    console.log(
      "PASS: isolated SQL migration twice, zero snapshot, duplicate open task, idempotent create/result, version conflict, linked repair, reopen and failed-result rollback. QA schema removed by rollback.",
    );
  } finally {
    await c.query("ROLLBACK");
    await c.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Verification failed");
  process.exitCode = 1;
});
