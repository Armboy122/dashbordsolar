import type { ScoredPlant } from "@/src/types/solar";

export type ImportPayload = {
  filename: string;
  reportMonth: string;
  rows: ScoredPlant[];
};

export function isValidReportMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

export function inferReportMonthFromFilename(filename: string): string | null {
  for (let index = 0; index < filename.length; index += 1) {
    const suffix = filename.slice(index);
    const monthYear = suffix.match(/^(\d{2})-(\d{4})/);
    if (monthYear) {
      const candidate = `${monthYear[2]}-${monthYear[1]}`;
      if (isValidReportMonth(candidate)) return candidate;
    }

    const yearMonth = suffix.match(/^(\d{4})-(\d{2})/);
    if (yearMonth) {
      const candidate = `${yearMonth[1]}-${yearMonth[2]}`;
      if (isValidReportMonth(candidate)) return candidate;
    }
  }

  return null;
}

export function resolveReportMonth({
  reportMonth,
  filename,
}: {
  reportMonth: string;
  filename: string;
}): string | null {
  if (isValidReportMonth(reportMonth)) return reportMonth;
  return inferReportMonthFromFilename(filename);
}

export function buildImportPayload({
  filename,
  reportMonth,
  rows,
}: {
  filename: string;
  reportMonth: string;
  rows: ScoredPlant[];
}): ImportPayload {
  if (!filename.trim()) {
    throw new Error("ต้องระบุชื่อไฟล์");
  }

  if (!isValidReportMonth(reportMonth)) {
    throw new Error("ต้องเลือกเดือนรายงานที่ถูกต้องก่อนนำเข้า");
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("ต้องมีข้อมูลแถวสำหรับนำเข้า");
  }

  return {
    filename: filename.trim(),
    reportMonth,
    rows,
  };
}
