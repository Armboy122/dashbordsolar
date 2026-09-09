import type {
  InspectionCategory,
  InspectionStatus,
} from "@/src/types/inspection";
import type { RepairRecord } from "@/src/types/maintenance";
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type InspectionCommand =
  | {
      action: "create";
      requestId: string;
      siteName: string;
      month: string;
      category: InspectionCategory;
      title: string;
      actor: string;
    }
  | {
      action: "transition";
      requestId: string;
      id: string;
      version: number;
      status: InspectionStatus;
      actor: string;
      note: string;
      repair?: Omit<
        RepairRecord,
        "id" | "createdAt" | "siteName" | "category" | "recordedBy"
      >;
    };
export function parseInspectionCommand(raw: unknown): InspectionCommand {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("INVALID");
  const v = raw as Record<string, unknown>;
  const text = (key: string, max: number, required = true) =>
    typeof v[key] === "string" &&
    (v[key] as string).length <= max &&
    (!required || !!(v[key] as string).trim());
  if (
    !text("requestId", 36) ||
    !uuidPattern.test(String(v.requestId)) ||
    !text("actor", 100)
  )
    throw Error("INVALID");
  if (v.action === "create") {
    if (
      !text("siteName", 300) ||
      !text("month", 7) ||
      !/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(v.month)) ||
      !["production", "data", "other"].includes(String(v.category)) ||
      !text("title", 300)
    )
      throw Error("INVALID");
  } else if (v.action === "transition") {
    if (
      !text("id", 36) ||
      !uuidPattern.test(String(v.id)) ||
      !Number.isSafeInteger(v.version) ||
      Number(v.version) < 1 ||
      !["awaiting", "notified", "inspected"].includes(String(v.status)) ||
      !text("note", 1500)
    )
      throw Error("INVALID");
    if (v.status === "inspected") {
      const r = v.repair as Record<string, unknown>;
      if (!r || typeof r !== "object" || Array.isArray(r))
        throw Error("INVALID");
      const str = (k: string, required = true) =>
        typeof r[k] === "string" &&
        (r[k] as string).length <= 1500 &&
        (!required || !!(r[k] as string).trim());
      const date = String(r.occurredOn);
      if (
        !/^20\d{2}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date ||
        date >
          new Date().toLocaleDateString("sv-SE", {
            timeZone: "Asia/Bangkok",
          }) ||
        !str("findings") ||
        !str("actionTaken") ||
        ![
          "unknown",
          "follow_up",
          "reported_fixed",
          "verified_resolved",
        ].includes(String(r.outcome)) ||
        !str("verificationEvidence", r.outcome === "verified_resolved")
      )
        throw Error("INVALID");
    }
  } else throw Error("INVALID");
  return v as InspectionCommand;
}
export function validTransition(from: InspectionStatus, to: InspectionStatus) {
  return from !== to && (from === "inspected" ? to === "awaiting" : true);
}
