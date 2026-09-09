import pg from "pg";
import { randomUUID, createHash } from "node:crypto";
import type { Inspection } from "@/src/types/inspection";
import { inspectionCategories } from "@/src/types/inspection";
import { validTransition, type InspectionCommand } from "./inspection-input";
const pool = new pg.Pool({
  connectionString: process.env.NEON_DB,
  max: 3,
  connectionTimeoutMillis: 8000,
  idleTimeoutMillis: 10000,
});
export async function readInspections(site?: string) {
  const { rows } = await pool.query(
    `SELECT i.*,s.name AS site_name,coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'fromStatus',e.from_status,'toStatus',e.to_status,'actor',e.actor,'note',e.note,'repairId',e.repair_id,'createdAt',e.created_at) ORDER BY e.created_at,e.id) FROM solar_inspection_events e WHERE e.inspection_id=i.id),'[]'::jsonb) AS events FROM solar_inspections i JOIN sites s ON s.id=i.site_id WHERE ($1::text IS NULL OR s.name=$1) ORDER BY (i.status='inspected'),i.updated_at DESC LIMIT 201`,
    [site ?? null],
  );
  return {
    truncated: rows.length > 200,
    records: rows
      .slice(0, 200)
      .map((r) => ({
        id: r.id,
        siteId: r.site_id,
        siteName: r.site_name,
        originMonth: r.origin_month,
        category: r.category,
        title: r.title,
        evidence: r.evidence,
        status: r.status,
        version: r.version,
        createdBy: r.created_by,
        createdAt: r.created_at.toISOString(),
        events: r.events,
      })) as Inspection[],
  };
}
/** All state changes, audit events, and technician records commit together. Optional client supports isolated rollback verification. */
export async function writeInspection(
  v: InspectionCommand,
  provided?: pg.PoolClient,
) {
  const client = provided ?? (await pool.connect());
  try {
    if (!provided) await client.query("BEGIN");
    // Serialize retries of the same request, including ambiguous network failures.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      v.requestId,
    ]);
    const commandHash = createHash("sha256")
      .update(JSON.stringify(v))
      .digest("hex");
    const previous = await client.query(
      "SELECT inspection_id,command_hash FROM solar_inspection_events WHERE id=$1",
      [v.requestId],
    );
    if (previous.rows.length) {
      if (previous.rows[0].command_hash !== commandHash)
        throw Error("CONFLICT");
      if (v.action === "transition" && previous.rows[0].inspection_id !== v.id)
        throw Error("CONFLICT");
      if (!provided) await client.query("COMMIT");
      return previous.rows[0].inspection_id as string;
    }
    let id: string;
    if (v.action === "create") {
      const site = await client.query("SELECT id FROM sites WHERE name=$1", [
        v.siteName,
      ]);
      if (!site.rows.length) throw Error("NOT_FOUND");
      const report = await client.query(
        "SELECT inverter_yield_kwh FROM monthly_reports WHERE site_id=$1 AND report_month=$2",
        [site.rows[0].id, v.month],
      );
      const prior = await client.query(
        "SELECT id FROM solar_inspections WHERE site_id=$1 AND category=$2 AND status='inspected' ORDER BY updated_at DESC LIMIT 1",
        [site.rows[0].id, v.category],
      );
      const evidence = {
        previousInspectionId: prior.rows[0]?.id ?? null,
        reportPresent: !!report.rows.length,
        inverterYieldKwh:
          report.rows[0]?.inverter_yield_kwh == null
            ? null
            : Number(report.rows[0].inverter_yield_kwh),
        capturedAt: new Date().toISOString(),
        source: "Huawei Plant Report รายเดือน",
      };
      id = randomUUID();
      await client.query(
        "INSERT INTO solar_inspections(id,site_id,origin_month,category,title,evidence,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          site.rows[0].id,
          v.month,
          v.category,
          v.title.trim(),
          JSON.stringify(evidence),
          v.actor.trim(),
        ],
      );
      await client.query(
        "INSERT INTO solar_inspection_events(id,inspection_id,to_status,actor,note,command_hash) VALUES($1,$2,'awaiting',$3,'เปิดงานตรวจจากหลักฐานเดือนต้นทาง',$4)",
        [v.requestId, id, v.actor.trim(), commandHash],
      );
    } else {
      id = v.id;
      const found = await client.query(
        "SELECT i.*,s.name AS site_name FROM solar_inspections i JOIN sites s ON s.id=i.site_id WHERE i.id=$1 FOR UPDATE OF i",
        [id],
      );
      const task = found.rows[0];
      if (!task) throw Error("NOT_FOUND");
      if (task.version !== v.version || !validTransition(task.status, v.status))
        throw Error("CONFLICT");
      let repairId = null;
      if (v.status === "inspected" && v.repair) {
        repairId = randomUUID();
        const r = v.repair;
        await client.query(
          "INSERT INTO solar_maintenance_records(id,site_name,occurred_on,category,findings,action_taken,outcome,verification_evidence,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            repairId,
            task.site_name,
            r.occurredOn,
            inspectionCategories[
              task.category as keyof typeof inspectionCategories
            ],
            r.findings.trim(),
            r.actionTaken.trim(),
            r.outcome,
            r.verificationEvidence.trim(),
            v.actor.trim(),
          ],
        );
      }
      await client.query(
        "UPDATE solar_inspections SET status=$2,version=version+1,updated_at=now() WHERE id=$1",
        [id, v.status],
      );
      await client.query(
        "INSERT INTO solar_inspection_events(id,inspection_id,from_status,to_status,actor,note,repair_id,command_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          v.requestId,
          id,
          task.status,
          v.status,
          v.actor.trim(),
          v.note.trim(),
          repairId,
          commandHash,
        ],
      );
    }
    if (!provided) await client.query("COMMIT");
    return id;
  } catch (e) {
    if (!provided) await client.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") throw Error("DUPLICATE");
    throw e;
  } finally {
    if (!provided) client.release();
  }
}
