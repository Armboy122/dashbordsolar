import { NextResponse } from "next/server";
import {
  AnalysisError,
  analyzeEvidence,
  DEFAULT_GEMINI_MODEL,
} from "@/src/lib/gemini-analysis";
export const runtime = "nodejs";
export const maxDuration = 60;
// Local prototype guard, not a replacement for authentication before public deployment.
let inFlight = false;
let attempts: number[] = [];
const response = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  return response({
    configured: !!process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  });
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    (origin && origin !== url.origin)
  )
    return response(
      {
        ok: false,
        error: "ฟีเจอร์วิเคราะห์นี้เปิดสำหรับต้นแบบบนเครื่องเท่านั้น",
        code: "LOCAL_ONLY",
      },
      403,
    );
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return response(
      {
        ok: false,
        error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ฝั่งเซิร์ฟเวอร์",
        code: "NOT_CONFIGURED",
      },
      503,
    );
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  if (!/^gemini-[a-z0-9.-]+$/.test(model))
    return response(
      {
        ok: false,
        error: "ชื่อ GEMINI_MODEL ไม่ถูกต้อง",
        code: "INVALID_MODEL",
      },
      503,
    );
  if (Number(request.headers.get("content-length") || 0) > 4096)
    return response({ ok: false, error: "คำขอมีขนาดใหญ่เกินไป" }, 413);
  let input: unknown;
  try {
    const text = await request.text();
    if (text.length > 4096)
      return response({ ok: false, error: "คำขอมีขนาดใหญ่เกินไป" }, 413);
    input = JSON.parse(text);
  } catch {
    return response({ ok: false, error: "รูปแบบคำขอไม่ถูกต้อง" }, 400);
  }
  if (
    !input ||
    typeof input !== "object" ||
    !("site" in input) ||
    !("month" in input) ||
    typeof input.site !== "string" ||
    input.site.trim().length === 0 ||
    input.site.length > 300 ||
    typeof input.month !== "string" ||
    !/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month)
  )
    return response(
      { ok: false, error: "ระบุชื่อไซต์และเดือน YYYY-MM ให้ถูกต้อง" },
      400,
    );
  const { site, month } = input;
  if (
    month >
    new Date()
      .toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" })
      .slice(0, 7)
  )
    return response(
      { ok: false, error: "ยังวิเคราะห์เดือนในอนาคตไม่ได้" },
      400,
    );
  const now = Date.now();
  attempts = attempts.filter((t) => now - t < 60000);
  if (inFlight || attempts.length >= 6)
    return response(
      {
        ok: false,
        error: "มีคำขอวิเคราะห์อยู่หรือเรียกบ่อยเกินไป กรุณารอสักครู่",
        code: "RATE_LIMITED",
      },
      429,
    );
  inFlight = true;
  attempts.push(now);
  try {
    const { loadAnalysisContext, saveManualAnalysis } = await import(
      "@/src/lib/operations-store"
    );
    const { rows, evidence, repairs } = await loadAnalysisContext(site, month);
    if (!rows.length)
      return response(
        {
          ok: false,
          error: "ไม่มีรายงานของไซต์นี้ในช่วงที่ใช้วิเคราะห์",
          code: "NO_DATA",
        },
        422,
      );
    const result = await analyzeEvidence(evidence, month, {
      apiKey,
      model,
      signal: request.signal,
      repairs,
    });
    await saveManualAnalysis(site, result);
    return response(result);
  } catch (error) {
    if (error instanceof AnalysisError)
      return response(
        { ok: false, error: error.message, code: error.code },
        error.status,
      );
    return response(
      {
        ok: false,
        error: "อ่านข้อมูลสำหรับวิเคราะห์ไม่สำเร็จ กรุณาลองใหม่",
        code: "DATA_ERROR",
      },
      500,
    );
  } finally {
    inFlight = false;
  }
}
