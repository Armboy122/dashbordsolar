import type { RepairEvidence } from "./maintenance";
export type AnalysisEvidence = {
  id: string;
  month: string;
  hasReport: boolean;
  inverterYieldKwh: number | null;
  capacityKwp: number | null;
  selfConsumptionKwh: number | null;
  exportKwh: number | null;
  consumptionKwh: number | null;
};
export type SolarAiAnalysis = {
  summary: string;
  hypotheses: {
    title: string;
    explanation: string;
    evidenceIds: string[];
    checks: string[];
  }[];
  dataQualityNotes: string[];
  limitations: string[];
};
export type SolarAiResult = {
  ok: true;
  analysis: SolarAiAnalysis;
  evidence: AnalysisEvidence[];
  repairs?: RepairEvidence[];
  model: string;
  generatedAt: string;
  inputHash: string;
  promptVersion: string;
  month: string;
};
