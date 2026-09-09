import { rebuildMonthlyAnalysis } from "@/src/lib/rebuild-monthly-analysis";
import { NextResponse } from "next/server";
import { ensureSchema } from "@/src/db/bootstrap";
import { sql } from "@/src/db/client";
import { isValidReportMonth } from "@/src/lib/import-workflow";
import type { ScoredPlant } from "@/src/types/solar";

export const runtime = "nodejs";

type ImportPayload = {
  filename: string;
  reportMonth: string;
  rows: ScoredPlant[];
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ImportPayload;

    if (!payload.filename || !payload.reportMonth || !Array.isArray(payload.rows) || !isValidReportMonth(payload.reportMonth)) {
      return NextResponse.json({ ok: false, error: "Invalid import payload" }, { status: 400 });
    }

    await ensureSchema();

    const importFile = await sql`
      insert into import_files (filename, report_month, status)
      values (${payload.filename}, ${payload.reportMonth}, 'imported')
      returning id
    `;
    const importFileId = String(importFile[0]?.id);

    for (const row of payload.rows) {
      if (!row.plantName) continue;

      const site = await sql`
        insert into sites (name, address, capacity_kwp)
        values (${row.plantName}, ${row.address ?? null}, ${num(row.capacityKwp)})
        on conflict (name) do update set
          address = excluded.address,
          capacity_kwp = excluded.capacity_kwp
        returning id
      `;

      const siteId = String(site[0]?.id);

      await sql`
        insert into monthly_reports (
          site_id,
          site_name,
          report_month,
          capacity_kwp,
          pv_yield_kwh,
          inverter_yield_kwh,
          export_kwh,
          import_kwh,
          specific_energy,
          consumption_kwh,
          self_consumption_kwh,
          self_consumption_rate,
          peak_power_kw,
          peak_ratio,
          revenue_baht,
          risk_score,
          risk_level,
          reasons_json,
          actions_json,
          import_file_id
        )
        values (
          ${siteId},
          ${row.plantName},
          ${payload.reportMonth},
          ${num(row.capacityKwp)},
          ${num(row.pvYieldKwh)},
          ${num(row.inverterYieldKwh)},
          ${num(row.exportKwh)},
          ${num(row.importKwh)},
          ${num(row.specificEnergy)},
          ${num(row.consumptionKwh)},
          ${num(row.selfConsumptionKwh)},
          ${num(row.selfConsumptionRate)},
          ${num(row.peakPowerKw)},
          ${num(row.peakRatio)},
          ${num(row.revenueBaht)},
          ${row.riskScore},
          ${row.riskLevel},
          ${JSON.stringify(row.reasons)},
          ${JSON.stringify(row.actions)},
          ${importFileId}
        )
        on conflict (site_name, report_month) do update set
          site_id = excluded.site_id,
          capacity_kwp = excluded.capacity_kwp,
          pv_yield_kwh = excluded.pv_yield_kwh,
          inverter_yield_kwh = excluded.inverter_yield_kwh,
          export_kwh = excluded.export_kwh,
          import_kwh = excluded.import_kwh,
          specific_energy = excluded.specific_energy,
          consumption_kwh = excluded.consumption_kwh,
          self_consumption_kwh = excluded.self_consumption_kwh,
          self_consumption_rate = excluded.self_consumption_rate,
          peak_power_kw = excluded.peak_power_kw,
          peak_ratio = excluded.peak_ratio,
          revenue_baht = excluded.revenue_baht,
          risk_score = excluded.risk_score,
          risk_level = excluded.risk_level,
          reasons_json = excluded.reasons_json,
          actions_json = excluded.actions_json,
          import_file_id = excluded.import_file_id,
          updated_at = now()
      `;
    }

    await rebuildMonthlyAnalysis(sql);

    let aiAnalysis: { status: string; queued?: number; message?: string };
    try {
      const { enqueueMonthlyAnalysis } = await import("@/src/lib/operations-store");
      const queued = await enqueueMonthlyAnalysis(importFileId, payload.reportMonth, payload.rows.map(row => row.plantName));
      const { startAnalysisWorker } = await import("@/src/lib/analysis-worker");
      startAnalysisWorker();
      aiAnalysis = { status: process.env.GEMINI_API_KEY ? "queued" : "waiting_configuration", queued };
    } catch {
      aiAnalysis = { status: "queue_failed", message: "นำเข้าข้อมูลแล้ว แต่เพิ่มคิว AI ไม่สำเร็จ" };
    }
    return NextResponse.json({ ok: true, imported: payload.rows.length, reportMonth: payload.reportMonth, aiAnalysis });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Import failed",
      },
      { status: 500 },
    );
  }
}

function num(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : null;
}
