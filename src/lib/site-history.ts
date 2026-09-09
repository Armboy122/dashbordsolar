export type SiteHistoryDbRow = {
  report_month: string;
  site_name: string;
  capacity_kwp: string | number | null;
  inverter_yield_kwh: string | number | null;
  pv_yield_kwh: string | number | null;
  specific_energy: string | number | null;
  export_kwh: string | number | null;
  import_kwh: string | number | null;
  consumption_kwh: string | number | null;
  self_consumption_kwh: string | number | null;
  /** Source percentage points (0–100), as stored from Huawei's (%) column. */
  self_consumption_rate: string | number | null;
  peak_power_kw: string | number | null;
  peak_ratio: string | number | null;
  risk_score: string | number | null;
  risk_level: string | null;
  reasons_json: string | null;
  actions_json: string | null;
};

export type SiteHistoryRow = {
  reportMonth: string;
  siteName: string;
  capacityKwp: number | null;
  pvYieldKwh: number | null;
  inverterYieldKwh: number | null;
  specificEnergy: number | null;
  exportKwh: number | null;
  importKwh: number | null;
  consumptionKwh: number | null;
  selfConsumptionKwh: number | null;
  /** Fraction (0–1) for chart and percentage formatters. */
  selfConsumptionRate: number | null;
  peakPowerKw: number | null;
  peakRatio: number | null;
  performanceRatio: number | null;
  riskScore: number | null;
  riskLevel: string | null;
  reasons: string[];
  actions: string[];
};

export type SiteHistoryPayload = {
  ok: true;
  site: string;
  rows: SiteHistoryRow[];
  noData: boolean;
};

export type SiteParams = {
  siteId: string | string[];
};

export async function decodeSiteParam(
  params: SiteParams | Promise<SiteParams> | string | string[],
): Promise<string> {
  const resolved = await Promise.resolve(params);

  if (typeof resolved === "string") {
    return decodeSiteValue(resolved);
  }

  if (Array.isArray(resolved)) {
    return decodeSiteValue(resolved.join("/"));
  }

  return decodeSiteValue(Array.isArray(resolved.siteId) ? resolved.siteId.join("/") : resolved.siteId);
}

export function buildSiteHistoryPayload(site: string, rows: SiteHistoryDbRow[]): SiteHistoryPayload {
  const sortedRows = rows.slice().sort((left, right) => left.report_month.localeCompare(right.report_month));

  return {
    ok: true,
    site,
    noData: sortedRows.length === 0,
    rows: sortedRows.map(mapSiteHistoryRow),
  };
}

export function mapSiteHistoryRow(row: SiteHistoryDbRow): SiteHistoryRow {
  const inverterYieldKwh = toNumber(row.inverter_yield_kwh);
  const pvYieldKwh = toNumber(row.pv_yield_kwh);
  const peakRatio = toNumber(row.peak_ratio);
  const specificEnergy = toNumber(row.specific_energy) ?? deriveSpecificEnergy(pvYieldKwh, toNumber(row.capacity_kwp));
  return {
    reportMonth: row.report_month,
    siteName: row.site_name,
    capacityKwp: toNumber(row.capacity_kwp),
    pvYieldKwh,
    inverterYieldKwh,
    specificEnergy,
    exportKwh: toNumber(row.export_kwh),
    importKwh: toNumber(row.import_kwh),
    consumptionKwh: toNumber(row.consumption_kwh),
    selfConsumptionKwh: toNumber(row.self_consumption_kwh),
    selfConsumptionRate: sourcePercentToFraction(row.self_consumption_rate),
    peakPowerKw: toNumber(row.peak_power_kw),
    peakRatio,
    performanceRatio: peakRatio,
    riskScore: toNumber(row.risk_score),
    riskLevel: row.risk_level,
    reasons: parseJsonArray(row.reasons_json),
    actions: parseJsonArray(row.actions_json),
  };
}

export function sourcePercentToFraction(value: string | number | null): number | null {
  const percent = toNumber(value);
  return percent !== null && percent >= 0 && percent <= 100 ? percent / 100 : null;
}

function decodeSiteValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function deriveSpecificEnergy(pvYieldKwh: number | null, capacityKwp: number | null): number | null {
  if (pvYieldKwh === null || capacityKwp === null || capacityKwp <= 0) return null;
  return pvYieldKwh / capacityKwp;
}

function toNumber(value: string | number | null): number | null {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
