import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { buildSiteHistoryPayload, type SiteHistoryDbRow } from "@/src/lib/site-history";
import { withTimeout } from "@/src/lib/async-timeout";

export const runtime = "nodejs";

const DB_TIMEOUT_MS = 8000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const site = searchParams.get("site");

  if (!site) {
    return NextResponse.json({ ok: false, error: "Missing site parameter" }, { status: 400 });
  }

  try {
    const rows = (await withTimeout(
      sql`
      select
        report_month,
        site_name,
        capacity_kwp,
        pv_yield_kwh,
        inverter_yield_kwh,
        specific_energy,
        export_kwh,
        import_kwh,
        consumption_kwh,
        self_consumption_kwh,
        self_consumption_rate,
        peak_power_kw,
        peak_ratio,
        risk_score,
        risk_level,
        reasons_json,
        actions_json
      from monthly_reports
      where site_name = ${site}
      order by report_month asc
    `,
      DB_TIMEOUT_MS,
      "Site history query timed out",
    )) as SiteHistoryDbRow[];

    return NextResponse.json(buildSiteHistoryPayload(site, rows));
  } catch (error) {
    console.error("Site history API failed", error);
    return NextResponse.json({ ok: false, error: "ไม่สามารถโหลดรายละเอียดไซต์ได้" }, { status: 500 });
  }
}
