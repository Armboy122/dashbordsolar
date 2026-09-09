export const inspectionStatuses = {
  awaiting: "รอตรวจ",
  notified: "แจ้งช่างแล้ว",
  inspected: "ได้ผลตรวจ",
} as const;
export const inspectionCategories = {
  production: "ตรวจผลผลิต",
  data: "ตรวจข้อมูล",
  other: "ตรวจเรื่องอื่น",
} as const;
export type InspectionStatus = keyof typeof inspectionStatuses;
export type InspectionCategory = keyof typeof inspectionCategories;
export type Inspection = {
  id: string;
  siteName: string;
  siteId: string;
  originMonth: string;
  category: InspectionCategory;
  title: string;
  evidence: {
    previousInspectionId?: string | null;
    reportPresent: boolean;
    inverterYieldKwh: number | null;
    capturedAt: string;
    source: string;
  };
  status: InspectionStatus;
  version: number;
  createdBy: string;
  createdAt: string;
  events: {
    id: string;
    fromStatus: InspectionStatus | null;
    toStatus: InspectionStatus;
    actor: string;
    note: string;
    repairId: string | null;
    createdAt: string;
  }[];
};
