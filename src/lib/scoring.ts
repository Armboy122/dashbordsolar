import { average, median, safeDivide, sum } from "./number";
import type { PlantReportRow, PortfolioSummary, RiskLevel, ScoredPlant } from "@/src/types/solar";

export function scorePlants(rows: PlantReportRow[]): ScoredPlant[] {
  const medianSpecific = median(rows.map((row) => row.specificEnergy).filter((value) => Number(value) > 0));

  return rows
    .map((row) => scorePlant(row, medianSpecific))
    .sort((a, b) => b.riskScore - a.riskScore || (a.specificEnergy ?? 999) - (b.specificEnergy ?? 999));
}

export function summarize(plants: ScoredPlant[]): PortfolioSummary {
  return {
    siteCount: plants.length,
    totalCapacityKwp: sum(plants.map((plant) => plant.capacityKwp)),
    totalYieldKwh: sum(plants.map((plant) => plant.pvYieldKwh)),
    totalRevenueBaht: sum(plants.map((plant) => plant.revenueBaht)),
    medianSpecificEnergy: median(plants.map((plant) => plant.specificEnergy).filter((value) => Number(value) > 0)),
    averageSpecificEnergy: average(plants.map((plant) => plant.specificEnergy).filter((value) => Number(value) > 0)),
    criticalCount: plants.filter((plant) => plant.riskLevel === "critical").length,
    highCount: plants.filter((plant) => plant.riskLevel === "high").length,
    watchCount: plants.filter((plant) => plant.riskLevel === "watch").length,
    normalCount: plants.filter((plant) => plant.riskLevel === "normal").length,
    zeroYieldCount: plants.filter((plant) => !plant.pvYieldKwh || plant.pvYieldKwh <= 0).length,
    missingCapacityCount: plants.filter((plant) => !plant.capacityKwp || plant.capacityKwp <= 0).length,
    lowPeakCount: plants.filter((plant) => plant.peakRatio !== null && plant.peakRatio < 0.65).length,
  };
}

function scorePlant(row: PlantReportRow, medianSpecific: number | null): ScoredPlant {
  const reasons: string[] = [];
  const actions: string[] = [];
  let score = 0;
  let dataQualityIssues = 0;

  const peakRatio = safeDivide(row.peakPowerKw, row.capacityKwp);
  const peerPercent = row.specificEnergy && medianSpecific ? row.specificEnergy / medianSpecific : null;

  if (!row.capacityKwp || row.capacityKwp <= 0) {
    score += 50;
    dataQualityIssues += 1;
    reasons.push("capacity เป็น 0 หรือ master data ยังไม่ครบ");
    actions.push("ตรวจ mapping plant และ capacity ใน FusionSolar");
  }

  if (!row.pvYieldKwh || row.pvYieldKwh <= 0) {
    score += 55;
    reasons.push("เดือนนี้ไม่มี production");
    actions.push("เช็ก inverter offline, breaker, meter และ communication");
  }

  if (peerPercent !== null) {
    if (peerPercent < 0.45) {
      score += 45;
      reasons.push(`specific yield ต่ำกว่าค่ากลาง ${Math.round((1 - peerPercent) * 100)}%`);
      actions.push("จัดลำดับเข้าตรวจหน้างานหรือตรวจ string/inverter ก่อน");
    } else if (peerPercent < 0.7) {
      score += 30;
      reasons.push(`specific yield ต่ำกว่ากลุ่ม ${Math.round((1 - peerPercent) * 100)}%`);
      actions.push("ตรวจประวัติล้างแผง เงาบัง และ alarm ย้อนหลัง");
    } else if (peerPercent < 0.85) {
      score += 15;
      reasons.push(`specific yield ต่ำกว่ากลุ่ม ${Math.round((1 - peerPercent) * 100)}%`);
      actions.push("ติดตามเดือนถัดไปและเทียบไซต์ใกล้เคียง");
    }
  } else {
    dataQualityIssues += 1;
    reasons.push("ไม่มี specific energy สำหรับเทียบกลุ่ม");
  }

  if (peakRatio !== null) {
    if (peakRatio < 0.45) {
      score += 35;
      reasons.push(`peak ratio ต่ำมาก ${(peakRatio * 100).toFixed(0)}%`);
      actions.push("ตรวจ string หลุด, inverter limit, ฝุ่น/เงาบัง");
    } else if (peakRatio < 0.65) {
      score += 22;
      reasons.push(`peak ratio ต่ำ ${(peakRatio * 100).toFixed(0)}%`);
      actions.push("remote check inverter และดูรูปแบบกำลังสูงสุด");
    } else if (peakRatio < 0.75) {
      score += 10;
      reasons.push(`peak ratio เริ่มต่ำ ${(peakRatio * 100).toFixed(0)}%`);
    }
  } else {
    dataQualityIssues += 1;
    reasons.push("ไม่มี peak power");
  }

  if (row.inverterYieldKwh !== null && row.pvYieldKwh !== null) {
    const diff = Math.abs(row.inverterYieldKwh - row.pvYieldKwh);
    if (diff > Math.max(5, row.pvYieldKwh * 0.03)) {
      score += 8;
      reasons.push("PV yield กับ inverter yield ต่างกันผิดปกติ");
      actions.push("ตรวจ meter/inverter yield mapping");
    }
  }

  if (row.revenueBaht === null) {
    dataQualityIssues += 1;
    reasons.push("ไม่มี revenue");
  }

  if (!reasons.length) {
    reasons.push("ปกติเมื่อเทียบกับไซต์ในเดือนเดียวกัน");
  }

  return {
    ...row,
    id: slugify(row.plantName),
    riskScore: Math.min(100, Math.round(score)),
    riskLevel: riskLevel(score),
    reasons,
    actions: actions.length ? Array.from(new Set(actions)) : ["ไม่ต้องเข้าหน้างานทันที"],
    peakRatio,
    peerPercent,
    dataQualityIssues,
  };
}

function riskLevel(score: number): RiskLevel {
  if (score >= 65) return "critical";
  if (score >= 38) return "high";
  if (score >= 16) return "watch";
  return "normal";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9ก-๙-]/g, "")
    .slice(0, 80);
}
