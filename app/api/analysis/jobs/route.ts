import { NextResponse } from "next/server";
import { ensureOperationsSchema } from "@/src/lib/operations-store";
import { sql } from "@/src/db/client";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month");
  if (!month || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))
    return NextResponse.json(
      { ok: false, error: "ระบุเดือน" },
      { status: 400 },
    );
  try {
    await ensureOperationsSchema();
    const rows =
      await sql`select status,count(*)::integer as count from solar_ai_jobs where report_month=${month} group by status`;
    return NextResponse.json(
      {
        ok: true,
        configured: !!process.env.GEMINI_API_KEY,
        counts: Object.fromEntries(
          rows.map((r) => [r.status, Number(r.count)]),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "อ่านคิวไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
