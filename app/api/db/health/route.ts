import { NextResponse } from "next/server";
import { sql } from "@/src/db/client";
import { withTimeout } from "@/src/lib/async-timeout";

export const runtime = "nodejs";

const DB_TIMEOUT_MS = 3000;

export async function GET() {
  try {
    const result = await withTimeout(sql`select now() as now`, DB_TIMEOUT_MS, "Database health check timed out");
    return NextResponse.json({ ok: true, now: result[0]?.now ?? null });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Database connection failed",
      },
      { status: 500 },
    );
  }
}
