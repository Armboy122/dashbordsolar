import { NextResponse } from "next/server";
import { parseInspectionCommand } from "@/src/lib/inspection-input";
import { readInspections, writeInspection } from "@/src/lib/inspection-store";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  const site = new URL(request.url).searchParams.get("site") ?? undefined;
  if (site !== undefined && (!site.trim() || site.length > 300))
    return reply({ ok: false, error: "ระบุไซต์ให้ถูกต้อง" }, 400);
  try {
    return reply({ ok: true, ...(await readInspections(site)) });
  } catch {
    return reply(
      { ok: false, error: "อ่านงานตรวจไม่สำเร็จ กรุณาลองใหม่" },
      500,
    );
  }
}
export async function POST(request: Request) {
  const url = new URL(request.url),
    origin = request.headers.get("origin");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    (origin && origin !== url.origin)
  )
    return reply({ ok: false, error: "บันทึกได้เฉพาะระบบบนเครื่อง" }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 12000)
      return reply({ ok: false, error: "ข้อความยาวเกินไป" }, 413);
    const v = parseInspectionCommand(JSON.parse(raw));
    return reply({ ok: true, id: await writeInspection(v) });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (e instanceof SyntaxError || code === "INVALID")
      return reply(
        {
          ok: false,
          error:
            "กรอกผู้บันทึก วันที่ สิ่งที่พบ วิธีดำเนินการ และหลักฐานตามผลตรวจให้ครบ",
        },
        400,
      );
    if (code === "NOT_FOUND")
      return reply({ ok: false, error: "ไม่พบไซต์หรืองานตรวจนี้" }, 404);
    if (["DUPLICATE", "CONFLICT"].includes(code))
      return reply(
        {
          ok: false,
          error:
            "มีงานประเภทนี้ที่ยังรอตรวจ หรือมีผู้เปลี่ยนงานแล้ว กรุณาโหลดรายการล่าสุดก่อนดำเนินการ",
          conflict: true,
        },
        409,
      );
    return reply(
      { ok: false, error: "บันทึกไม่สำเร็จ ข้อความยังอยู่ สามารถลองใหม่ได้" },
      500,
    );
  }
}
