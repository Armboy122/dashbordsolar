import type { SiteHistoryRow } from "./site-history";

export type SiteDetailHistoryRow = SiteHistoryRow & {
  monthNumber: number | null;
  monthLabel: string;
  energyBalanceGapKwh: number | null;
  loadBalanceGapKwh: number | null;
};

export type SiteDetailChartPoint = {
  reportMonth: string;
  monthNumber: number | null;
  value: number | null;
};

export type SiteDetailChartSeries = {
  year: number;
  label: string;
  color: string;
  points: SiteDetailChartPoint[];
};

export type SiteDetailChartSection = {
  key: "yield" | "performance" | "selfConsumption";
  title: string;
  description: string;
  unit: string;
  series: SiteDetailChartSeries[];
};

export type SiteDetailKpi = {
  key: "inverterYield" | "specificEnergy" | "performanceRatio" | "selfConsumptionRate" | "energyBalanceGap" | "loadBalanceGap";
  title: string;
  value: number | null;
  unit: string;
  note: string;
};

export type SiteDetailYearTab = {
  value: number | null;
  label: string;
  active: boolean;
};

export type SiteDetailView = {
  siteName: string;
  firstMonth: string;
  latestMonth: string;
  totalMonths: number;
  years: number[];
  selectedYear: number | null;
  selectedMonth: string;
  capacityKwp: number | null;
  selectedRow: SiteDetailHistoryRow | null;
  activeRows: SiteDetailHistoryRow[];
  historyRows: SiteDetailHistoryRow[];
  yearTabs: SiteDetailYearTab[];
  kpis: SiteDetailKpi[];
  chartSections: SiteDetailChartSection[];
  backHref: string;
};

export type BuildSiteDetailViewOptions = {
  requestedMonth?: string;
  selectedYear?: number | null;
  backHref?: string;
};

const CHART_COLORS = ["#2563eb", "#d97706", "#0f766e", "#64748b", "#be123c", "#0369a1"];

export function buildSiteDetailView(rows: SiteHistoryRow[], options: BuildSiteDetailViewOptions = {}): SiteDetailView {
  const sortedRows = rows.slice().sort((left, right) => left.reportMonth.localeCompare(right.reportMonth));
  const years = uniqueYears(sortedRows);
  const selectedYear = options.selectedYear ?? null;
  const yearFilteredRows = selectedYear === null ? sortedRows : sortedRows.filter((row) => yearFromMonth(row.reportMonth) === selectedYear);
  const baseRows = selectedYear === null ? sortedRows : yearFilteredRows;
  const requestedMonth = options.requestedMonth?.trim() ?? "";
  const selectedMonth = baseRows.length === 0 ? "" : resolveMonth(baseRows, requestedMonth);
  const selectedRow = selectedMonth ? baseRows.find((row) => row.reportMonth === selectedMonth) ?? baseRows[baseRows.length - 1] ?? null : null;
  const capacityKwp = selectedRow?.capacityKwp ?? latestCapacity(baseRows);
  const activeRows = baseRows.map((row) => deriveRow(row));
  const chartSourceRows = baseRows;

  return {
    siteName: selectedRow?.siteName ?? sortedRows[0]?.siteName ?? "",
    firstMonth: sortedRows[0]?.reportMonth ?? "",
    latestMonth: sortedRows[sortedRows.length - 1]?.reportMonth ?? "",
    totalMonths: sortedRows.length,
    years,
    selectedYear,
    selectedMonth,
    capacityKwp,
    selectedRow: selectedRow ? deriveRow(selectedRow) : null,
    activeRows,
    historyRows: activeRows,
    yearTabs: [
      { value: null, label: "All years", active: selectedYear === null },
      ...years.map((year) => ({ value: year, label: String(year), active: selectedYear === year })),
    ],
    kpis: buildKpis(selectedRow ? deriveRow(selectedRow) : null, capacityKwp),
    chartSections: [
      buildChartSection("yield", "Monthly inverter yield", "รายเดือนแยกตามปี", "kWh", chartSourceRows, (row) => row.inverterYieldKwh),
      buildChartSection("performance", "Peak ratio", "แนวโน้มประสิทธิภาพระบบ", "ratio", chartSourceRows, (row) => row.performanceRatio ?? row.peakRatio),
      buildChartSection("selfConsumption", "Self-consumption rate", "สัดส่วนการใช้ไฟที่ผลิตได้เอง", "%", chartSourceRows, (row) => row.selfConsumptionRate),
    ],
    backHref: options.backHref ?? "/",
  };
}

function buildChartSection(
  key: SiteDetailChartSection["key"],
  title: string,
  description: string,
  unit: string,
  rows: SiteHistoryRow[],
  valueAccessor: (row: SiteHistoryRow) => number | null,
): SiteDetailChartSection {
  const grouped = groupRowsByYear(rows);
  const series = Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(([year, yearRows], index) => ({
      year,
      label: String(year),
      color: CHART_COLORS[index % CHART_COLORS.length],
      points: yearRows.map((row) => ({
        reportMonth: row.reportMonth,
        monthNumber: monthFromMonth(row.reportMonth),
        value: valueAccessor(row),
      })),
    }));

  return { key, title, description, unit, series };
}

function buildKpis(row: SiteDetailHistoryRow | null, capacityKwp: number | null): SiteDetailKpi[] {
  const inverterYieldKwh = row?.inverterYieldKwh ?? null;
  const specificEnergy = row?.specificEnergy ?? null;
  const performanceRatio = row?.performanceRatio ?? row?.peakRatio ?? null;
  const selfConsumptionRate = row?.selfConsumptionRate ?? null;
  const energyBalanceGapKwh = row?.energyBalanceGapKwh ?? null;
  const loadBalanceGapKwh = row?.loadBalanceGapKwh ?? null;

  return [
    {
      key: "inverterYield",
      title: "Inverter yield",
      value: inverterYieldKwh,
      unit: "kWh",
      note: "พลังงานจากอินเวอร์เตอร์ในเดือนที่เลือก",
    },
    {
      key: "specificEnergy",
      title: "Specific energy",
      value: specificEnergy ?? deriveSpecificEnergy(row, capacityKwp),
      unit: "kWh/kWp",
      note: "ผลผลิตต่อกำลังติดตั้ง",
    },
    {
      key: "performanceRatio",
      title: "Peak ratio",
      value: performanceRatio,
      unit: "ratio",
      note: "เทียบกับกำลังที่ควรจะผลิตได้",
    },
    {
      key: "selfConsumptionRate",
      title: "Self-consumption rate",
      value: selfConsumptionRate,
      unit: "%",
      note: "สัดส่วนไฟที่ใช้เองในไซต์",
    },
    {
      key: "energyBalanceGap",
      title: "Energy balance gap",
      value: energyBalanceGapKwh,
      unit: "kWh",
      note: "ผลต่างพลังงานผลิต-ใช้-ส่งออก",
    },
    {
      key: "loadBalanceGap",
      title: "Load balance gap",
      value: loadBalanceGapKwh,
      unit: "kWh",
      note: "ผลต่างพลังงานใช้-นำเข้า-ใช้เอง",
    },
  ];
}

function deriveRow(row: SiteHistoryRow): SiteDetailHistoryRow {
  return {
    ...row,
    monthNumber: monthFromMonth(row.reportMonth),
    monthLabel: formatMonthLabel(row.reportMonth),
    specificEnergy: row.specificEnergy ?? deriveSpecificEnergy(row, row.capacityKwp),
    performanceRatio: row.performanceRatio ?? row.peakRatio,
    energyBalanceGapKwh: deriveEnergyBalanceGap(row),
    loadBalanceGapKwh: deriveLoadBalanceGap(row),
  };
}

function deriveSpecificEnergy(
  row: Pick<SiteHistoryRow, "capacityKwp" | "inverterYieldKwh" | "pvYieldKwh" | "specificEnergy"> | null,
  capacityKwp: number | null,
): number | null {
  if (!row) return null;
  if (row.specificEnergy !== null) return row.specificEnergy;
  const yieldKwh = row.pvYieldKwh ?? row.inverterYieldKwh;
  if (capacityKwp === null || capacityKwp <= 0 || yieldKwh === null) return null;
  return yieldKwh / capacityKwp;
}

function deriveEnergyBalanceGap(
  row: Pick<SiteHistoryRow, "pvYieldKwh" | "exportKwh" | "selfConsumptionKwh"> | null,
): number | null {
  if (!row || row.pvYieldKwh === null || row.exportKwh === null || row.selfConsumptionKwh === null) return null;
  return row.pvYieldKwh - row.exportKwh - row.selfConsumptionKwh;
}

function deriveLoadBalanceGap(
  row: Pick<SiteHistoryRow, "consumptionKwh" | "importKwh" | "selfConsumptionKwh"> | null,
): number | null {
  if (!row || row.consumptionKwh === null || row.importKwh === null || row.selfConsumptionKwh === null) return null;
  return row.consumptionKwh - row.importKwh - row.selfConsumptionKwh;
}

function resolveMonth(rows: SiteHistoryRow[], requestedMonth: string): string {
  if (requestedMonth && rows.some((row) => row.reportMonth === requestedMonth)) return requestedMonth;
  return rows[rows.length - 1]?.reportMonth ?? "";
}

function latestCapacity(rows: SiteHistoryRow[]): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const current = rows[index].capacityKwp;
    if (current !== null) return current;
  }
  return null;
}

function groupRowsByYear(rows: SiteHistoryRow[]): Map<number, SiteHistoryRow[]> {
  const grouped = new Map<number, SiteHistoryRow[]>();
  for (const row of rows) {
    const year = yearFromMonth(row.reportMonth);
    if (year === null) continue;
    const bucket = grouped.get(year) ?? [];
    bucket.push(row);
    grouped.set(year, bucket);
  }
  return grouped;
}

function uniqueYears(rows: SiteHistoryRow[]): number[] {
  return Array.from(new Set(rows.map((row) => yearFromMonth(row.reportMonth)).filter((year): year is number => year !== null))).sort((a, b) => a - b);
}

function yearFromMonth(reportMonth: string): number | null {
  const match = reportMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function monthFromMonth(reportMonth: string): number | null {
  const match = reportMonth.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const month = Number(match[2]);
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return month;
}

function formatMonthLabel(reportMonth: string): string {
  const year = yearFromMonth(reportMonth);
  const month = monthFromMonth(reportMonth);
  if (year === null || month === null) return reportMonth;
  return `${year}-${String(month).padStart(2, "0")}`;
}
