import { NextResponse } from "next/server";
import { addRepair, readRepairs } from "@/src/lib/operations-store";
import type { RepairRecord } from "@/src/types/maintenance";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  const site = new URL(request.url).searchParams.get("site");
  if (!site || site.length > 300)
    return reply({ ok: false, error: "ระบุไซต์" }, 400);
  try {
    return reply({ ok: true, records: await readRepairs(site) });
  } catch {
    return reply({ ok: false, error: "อ่านประวัติซ่อมไม่สำเร็จ" }, 500);
  }
}
export async function POST(request: Request) {
  const url = new URL(request.url),
    origin = request.headers.get("origin");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    (origin && origin !== url.origin)
  )
    return reply({ ok: false, error: "เปิดบันทึกเฉพาะระบบบนเครื่อง" }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 8000)
      return reply({ ok: false, error: "ข้อมูลยาวเกินไป" }, 413);
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== "object" || Array.isArray(v))
      return reply({ ok: false, error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
    const text = (k: string, max: number, required = true) =>
      typeof v[k] === "string" &&
      (v[k] as string).length <= max &&
      (!required || (v[k] as string).trim().length > 0);
    if (
      !text("siteName", 300) ||
      !text("occurredOn", 10) ||
      !/^20\d{2}-\d{2}-\d{2}$/.test(String(v.occurredOn)) ||
      !Number.isFinite(Date.parse(String(v.occurredOn))) ||
      new Date(String(v.occurredOn)).toISOString().slice(0, 10) !==
        v.occurredOn ||
      String(v.occurredOn) >
        new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }) ||
      !text("category", 100) ||
      !text("findings", 1500) ||
      !text("actionTaken", 1500) ||
      !text("recordedBy", 100) ||
      !["unknown", "follow_up", "reported_fixed", "verified_resolved"].includes(
        String(v.outcome),
      ) ||
      !text("verificationEvidence", 1500, v.outcome === "verified_resolved")
    )
      return reply(
        {
          ok: false,
          error:
            "กรอกวันที่ สิ่งที่พบ สิ่งที่ทำ ผู้บันทึก และหลักฐานยืนยันให้ครบ",
        },
        400,
      );
    const record = await addRepair(
      v as unknown as Omit<RepairRecord, "id" | "createdAt">,
    );
    return reply({ ok: true, record }, 201);
  } catch (error) {
    if (error instanceof SyntaxError)
      return reply({ ok: false, error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
    return reply(
      {
        ok: false,
        error:
          error instanceof Error && error.message === "SITE_NOT_FOUND"
            ? "ไม่พบไซต์นี้"
            : "บันทึกไม่สำเร็จ กรุณาลองใหม่",
      },
      500,
    );
  }
}
