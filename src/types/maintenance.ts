export type RepairRecord = {
  id: string;
  siteName: string;
  occurredOn: string;
  category: string;
  findings: string;
  actionTaken: string;
  outcome: "unknown" | "follow_up" | "reported_fixed" | "verified_resolved";
  verificationEvidence: string;
  recordedBy: string;
  createdAt: string;
};
export type RepairEvidence = Omit<
  RepairRecord,
  "siteName" | "recordedBy" | "createdAt"
> & { source: "caretaker_record" };
export type AnalysisJob = {
  id: string;
  reportMonth: string;
  siteName: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  finishedAt: string | null;
};
