export type RiskLevel = "critical" | "high" | "watch" | "normal";

export type PlantReportRow = {
  plantName: string;
  address?: string;
  capacityKwp: number | null;
  pvYieldKwh: number | null;
  inverterYieldKwh: number | null;
  exportKwh: number | null;
  importKwh: number | null;
  specificEnergy: number | null;
  consumptionKwh: number | null;
  selfConsumptionKwh: number | null;
  selfConsumptionRate: number | null;
  peakPowerKw: number | null;
  performanceRatio: number | null;
  revenueBaht: number | null;
  sourceMonth?: string;
};

export type ScoredPlant = PlantReportRow & {
  id: string;
  riskLevel: RiskLevel;
  riskScore: number;
  reasons: string[];
  actions: string[];
  peakRatio: number | null;
  peerPercent: number | null;
  dataQualityIssues: number;
  baselineSpecificAvg?: number | null;
  ownHistoryPercent?: number | null;
  yoySpecificEnergy?: number | null;
  yoyPercent?: number | null;
  baselineInverterYield?: number | null;
  productionPercent?: number | null;
  energyBalanceGapKwh?: number | null;
  loadBalanceGapKwh?: number | null;
};

export type PortfolioSummary = {
  siteCount: number;
  totalCapacityKwp: number;
  totalYieldKwh: number;
  totalRevenueBaht: number;
  medianSpecificEnergy: number | null;
  averageSpecificEnergy: number | null;
  criticalCount: number;
  highCount: number;
  watchCount: number;
  normalCount: number;
  zeroYieldCount: number;
  missingCapacityCount: number;
  lowPeakCount: number;
};
