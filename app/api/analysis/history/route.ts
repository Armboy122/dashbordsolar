import { NextResponse } from "next/server";
import { analysisHistory } from "@/src/lib/operations-store";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams,
    site = p.get("site"),
    month = p.get("month");
  if (
    !site ||
    site.length > 300 ||
    !month ||
    !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)
  )
    return NextResponse.json(
      { ok: false, error: "ระบุไซต์และเดือน" },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      {
        ok: true,
        configured: !!process.env.GEMINI_API_KEY,
        jobs: await analysisHistory(site, month),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "อ่านประวัติ AI ไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
