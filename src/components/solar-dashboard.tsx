"use client";

import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Empty, Select, Skeleton } from "antd";
import { CloudUploadOutlined, ReloadOutlined } from "@ant-design/icons";
import { parsePlantReport } from "@/src/lib/report-parser";
import { scorePlants } from "@/src/lib/scoring";
import { buildImportPayload, inferReportMonthFromFilename, isValidReportMonth, resolveReportMonth } from "@/src/lib/import-workflow";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingFn,
  type SortingState,
} from "@tanstack/react-table";

import {
  buildPortfolioChartScale,
  buildPortfolioComparisonPoints,
  buildPortfolioInsight,
  findMonthDelta,
  type PortfolioComparisonChartPoint,
  type PortfolioChartScale,
  type PortfolioInsight,
  type PortfolioMonthlySeriesPoint,
} from "../lib/analytics";

import {
  buildSiteTableRows,
  compareSiteRowsByRisk,
  percentageColumnIds,
  rightAlignedColumnIds,
  siteTableHeaderLabels,
  statusLabel,
  statusRank,
  type ComparisonValue,
  type SiteSummary,
  type SiteTableRow,
  type Status,
} from "../lib/solar-table";

type DashboardScope = "source" | "history";

type DashboardMeta = {
  siteCount: number;
  reportCount: number;
  firstMonth: string;
  latestMonth: string;
  sourceSiteCount?: number | null;
  historicalSiteCount?: number;
  reportedSiteCount?: number;
  missingReportCount?: number;
  missingYieldCount?: number;
  rosterUpdatedAt?: string | null;
  rosterReportMonth?: string | null;
  sourceAvailable?: boolean;
};

type DashboardResponse = {
  ok: boolean;
  selectedMonth: string;
  availableMonths: string[];
  availableYears: number[];
  scope?: DashboardScope;
  meta: DashboardMeta;
  portfolio: {
    monthlyYieldKwh: number | null;
    latestYearYieldKwh: number | null;
    cumulativeYieldKwh: number | null;
    installedCapacityKwp: number | null;
    latestYear: number | null;
  } | null;
  portfolioMonthlySeries: Array<{
    month: string;
    year: number;
    monthNumber: number;
    totalYieldKwh: number | null;
    previousYearTotalYieldKwh: number | null;
    deltaPct: number | null;
  }>;
  yearTotals: Array<{ year: number; yieldKwh: number }>;
  plants: SiteSummary[];
  error?: string;
};

type ImportState = {
  fileName: string;
  inferredMonth: string;
  reportMonth: string;
  rowCount: number;
  siteNames: string[];
};

type StatusFilter = "all" | "monitor" | Status;

const nullsLastSort: SortingFn<SiteTableRow> = (rowA, rowB, columnId) => {
  const a = rowA.getValue<number | null>(columnId);
  const b = rowB.getValue<number | null>(columnId);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
};

const statusSortFn: SortingFn<SiteTableRow> = (rowA, rowB) => statusRank[rowA.original.status] - statusRank[rowB.original.status];

const thaiTextSort: SortingFn<SiteTableRow> = (rowA, rowB) =>
  rowA.original.siteName.localeCompare(rowB.original.siteName, "th");

function readInitialQuery(): { month: string; scope: DashboardScope } {
  if (typeof window === "undefined") return { month: "", scope: "source" };
  const params = new URLSearchParams(window.location.search);
  const month = params.get("month") ?? "";
  const scope: DashboardScope = params.get("scope") === "history" ? "history" : "source";
  return { month, scope };
}

export function SolarDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => readInitialQuery().month);
  const [scope, setScope] = useState<DashboardScope>(() => readInitialQuery().scope);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "status", desc: false }]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [importState, setImportState] = useState<ImportState>({
    fileName: "",
    inferredMonth: "",
    reportMonth: "",
    rowCount: 0,
    siteNames: [],
  });
  const [importRows, setImportRows] = useState<import("@/src/types/solar").ScoredPlant[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const importRef = useRef<HTMLDivElement>(null);
  const tableSectionRef = useRef<HTMLElement>(null);
  const dashboardAbortRef = useRef<AbortController | null>(null);
  const dashboardRequestRef = useRef(0);

  const loadDashboard = useCallback(async (month = "", nextScope: DashboardScope = "source") => {
    dashboardAbortRef.current?.abort();
    const controller = new AbortController();
    dashboardAbortRef.current = controller;
    const requestId = dashboardRequestRef.current + 1;
    dashboardRequestRef.current = requestId;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      params.set("scope", nextScope);
      const response = await fetch(`/api/dashboard/latest?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const payload = (await response.json()) as DashboardResponse;

      if (requestId !== dashboardRequestRef.current) return;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "ไม่สามารถโหลดข้อมูลหน้าหลักได้");
      }

      setData(payload);
      setSelectedMonth(payload.selectedMonth || month);
      setSelectedYear((current) => {
        const latestAvailableYear = payload.availableYears[payload.availableYears.length - 1] ?? null;
        if (current !== null && payload.availableYears.includes(current)) {
          return current;
        }
        return latestAvailableYear;
      });
    } catch (fetchError) {
      if (controller.signal.aborted || requestId !== dashboardRequestRef.current) return;
      setError(fetchError instanceof Error ? fetchError.message : "ไม่สามารถโหลดข้อมูลหน้าหลักได้");
    } finally {
      if (requestId === dashboardRequestRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDashboard(selectedMonth, scope);
    return () => {
      dashboardAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDashboard]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (selectedMonth) params.set("month", selectedMonth);
    else params.delete("month");
    params.set("scope", scope);
    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [selectedMonth, scope]);

  function handleMonthChange(month: string) {
    setSelectedMonth(month);
    void loadDashboard(month, scope);
  }

  function handleScopeChange(nextScope: DashboardScope) {
    if (nextScope === scope) return;
    setScope(nextScope);
    void loadDashboard(selectedMonth, nextScope);
  }

  function openImport() {
    setIsImportOpen(true);
    setTimeout(() => importRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function resetImportState() {
    setImportRows([]);
    setImportState({
      fileName: "",
      inferredMonth: "",
      reportMonth: "",
      rowCount: 0,
      siteNames: [],
    });
  }

  async function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setImportError(null);
    setImportSuccess(null);

    if (!file) {
      resetImportState();
      return;
    }

    try {
      const parsedRows = await parsePlantReport(file);
      const scoredRows = scorePlants(parsedRows);
      const inferredMonth = inferReportMonthFromFilename(file.name) ?? parsedRows[0]?.sourceMonth ?? "";
      const reportMonth = resolveReportMonth({ reportMonth: inferredMonth, filename: file.name }) ?? inferredMonth;

      setImportRows(scoredRows);
      setImportState({
        fileName: file.name,
        inferredMonth,
        reportMonth,
        rowCount: scoredRows.length,
        siteNames: scoredRows.slice(0, 3).map((row) => row.plantName),
      });
    } catch (fileError) {
      resetImportState();
      setImportError(fileError instanceof Error ? fileError.message : "ไม่สามารถอ่านไฟล์นี้ได้");
    } finally {
      event.target.value = "";
    }
  }

  function handleImportMonthChange(event: ChangeEvent<HTMLInputElement>) {
    setImportState((current) => ({ ...current, reportMonth: event.target.value }));
    setImportError(null);
    setImportSuccess(null);
  }

  async function handleImportSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const reportMonth = resolveReportMonth({ reportMonth: importState.reportMonth, filename: importState.fileName });
      const payload = buildImportPayload({
        filename: importState.fileName,
        reportMonth: reportMonth ?? "",
        rows: importRows,
      });

      setImporting(true);
      setImportError(null);
      setImportSuccess(null);

      const response = await fetch("/api/reports/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "ไม่สามารถนำเข้ารายงานได้");
      }

      setImportSuccess(`นำเข้าไฟล์ ${importState.fileName} สำเร็จแล้ว`);
      setIsImportOpen(false);
      await loadDashboard(payload.reportMonth, scope);
      resetImportState();
    } catch (submitError) {
      setImportError(submitError instanceof Error ? submitError.message : "ไม่สามารถนำเข้ารายงานได้");
    } finally {
      setImporting(false);
    }
  }

  const availableYears = data?.availableYears ?? [];
  const effectiveYear = selectedYear !== null && availableYears.includes(selectedYear) ? selectedYear : availableYears[availableYears.length - 1] ?? null;
  const rows = useMemo(() => buildSiteTableRows(data?.plants ?? [], effectiveYear), [data, effectiveYear]);
  const rowsByRisk = useMemo(() => [...rows].sort(compareSiteRowsByRisk), [rows]);
  const monitoringRows = useMemo(() => rowsByRisk.filter((row) => row.status !== "ok"), [rowsByRisk]);
  const yearSelection = data?.yearTotals.find((item) => item.year === effectiveYear) ?? null;
  const monthLabel = formatMonthLabel(selectedMonth);
  const yearLabel = effectiveYear !== null ? formatYearLabel(effectiveYear) : "ยังไม่เลือกปี";

  const yearSeries = useMemo(
    () => (data?.portfolioMonthlySeries ?? []).filter((point) => point.year === effectiveYear),
    [data?.portfolioMonthlySeries, effectiveYear],
  );
  const portfolioChartPoints = useMemo(
    () => buildPortfolioComparisonPoints(yearSeries, effectiveYear ?? undefined),
    [yearSeries, effectiveYear],
  );
  const portfolioChartScale = useMemo(() => buildPortfolioChartScale(portfolioChartPoints, 720, 280), [portfolioChartPoints]);
  const portfolioChartHasData = portfolioChartPoints.some(
    (point) => point.currentYearYieldKwh !== null || point.previousYearSameMonthYieldKwh !== null,
  );
  const portfolioInsight = useMemo(() => buildPortfolioInsight(portfolioChartPoints), [portfolioChartPoints]);
  const selectedMonthNumber = useMemo(() => {
    if (!selectedMonth) return null;
    const n = Number(selectedMonth.split("-")[1]);
    return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
  }, [selectedMonth]);

  const monthDelta = useMemo(() => {
    const series = data?.portfolioMonthlySeries ?? [];
    const raw = findMonthDelta(series as PortfolioMonthlySeriesPoint[], selectedMonth);
    if (!raw || raw.deltaAbsKwh === null || raw.deltaPct === null) return null;
    return { abs: raw.deltaAbsKwh, pct: raw.deltaPct, baselineKwh: raw.previousYearKwh };
  }, [data?.portfolioMonthlySeries, selectedMonth]);

  const previousYearMonthLabel = useMemo(() => {
    if (!selectedMonth) return "";
    const [yearPart, monthPart] = selectedMonth.split("-");
    const year = Number(yearPart);
    if (!Number.isFinite(year) || !monthPart) return "";
    return formatMonthLabel(`${year - 1}-${monthPart}`);
  }, [selectedMonth]);

  const availableMonthsInYear = useMemo(
    () => yearSeries.filter((p) => p.totalYieldKwh !== null).length,
    [yearSeries],
  );

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (query && !row.siteName.toLowerCase().includes(query)) return false;
      if (statusFilter === "all") return true;
      if (statusFilter === "monitor") return row.status !== "ok";
      return row.status === statusFilter;
    });
  }, [rows, searchQuery, statusFilter]);

  const columns = useMemo<ColumnDef<SiteTableRow>[]>(
    () => [
      {
        id: "status",
        header: siteTableHeaderLabels.status,
        accessorFn: (row) => statusRank[row.status],
        sortingFn: statusSortFn,
        cell: ({ row }) => <StatusChip status={row.original.status} />,
      },
      {
        id: "siteName",
        header: siteTableHeaderLabels.siteName,
        accessorKey: "siteName",
        sortingFn: thaiTextSort,
        cell: ({ row }) => (
          <div className="site-name-cell">
            <Link
              className="site-table__link"
              href={`/sites/${encodeURIComponent(row.original.siteName)}?month=${encodeURIComponent(selectedMonth)}&scope=${scope}`}
            >
              {row.original.siteName}
            </Link>
            <span className="site-name-cell__sub">
              {row.original.capacityKwp === null
                ? "ยังไม่ระบุขนาดระบบ"
                : `${formatNumber(row.original.capacityKwp)} kWp`}
            </span>
          </div>
        ),
      },
      {
        id: "monthYieldKwh",
        header: "ไฟฟ้าเดือนนี้ (หน่วย)",
        accessorKey: "monthYieldKwh",
        sortingFn: nullsLastSort,
        cell: ({ row }) =>
          row.original.monthYieldKwh === null ? <NoDataCell /> : formatNumber(row.original.monthYieldKwh),
      },
      {
        id: "yearYieldKwh",
        header: "รวมปีที่เลือก (หน่วย)",
        accessorKey: "yearYieldKwh",
        sortingFn: nullsLastSort,
        cell: ({ row }) =>
          row.original.yearYieldKwh === null ? <NoDataCell /> : formatNumber(row.original.yearYieldKwh),
      },
      {
        id: "vsLastMonthPct",
        header: "เทียบเดือนก่อน",
        accessorKey: "vsLastMonthPct",
        sortingFn: nullsLastSort,
        cell: ({ row }) => {
          const pct = row.original.vsLastMonthPct;
          const abs = row.original.comparison.mom.deltaAbsKwh;
          if (pct === null) return <NoDataCell />;
          return (
            <>
              <span className="comparison-cell__pct">{formatSignedPercent(pct)}</span>
              {abs !== null && (
                <span className="comparison-cell__abs">{abs >= 0 ? "+" : ""}{formatNumber(abs)} หน่วย</span>
              )}
            </>
          );
        },
      },
      {
        id: "vsSiteAvgPct",
        header: "เทียบค่าเฉลี่ยไซต์",
        accessorKey: "vsSiteAvgPct",
        sortingFn: nullsLastSort,
        cell: ({ row }) => {
          const pct = row.original.vsSiteAvgPct;
          const abs = row.original.comparison.siteAvg.deltaAbsKwh;
          if (pct === null) return <NoDataCell />;
          return (
            <>
              <span className="comparison-cell__pct">{formatSignedPercent(pct)}</span>
              {abs !== null && (
                <span className="comparison-cell__abs">{abs >= 0 ? "+" : ""}{formatNumber(abs)} หน่วย</span>
              )}
            </>
          );
        },
      },
      {
        id: "vsLastYearPct",
        header: "เทียบเดือนเดียวกันปีก่อน",
        accessorKey: "vsLastYearPct",
        sortingFn: nullsLastSort,
        cell: ({ row }) => {
          const pct = row.original.vsLastYearPct;
          const abs = row.original.comparison.yoy.deltaAbsKwh;
          if (pct === null) return <NoDataCell />;
          return (
            <>
              <span className="comparison-cell__pct">{formatSignedPercent(pct)}</span>
              {abs !== null && (
                <span className="comparison-cell__abs">{abs >= 0 ? "+" : ""}{formatNumber(abs)} หน่วย</span>
              )}
            </>
          );
        },
      },
    ],
    [selectedMonth, scope],
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => row.siteId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} onRetry={() => void loadDashboard(selectedMonth, scope)} />;

  if (!data || rows.length === 0 || !data.portfolio) {
    return (
      <EmptyScreen
        monthOptions={data?.availableMonths ?? []}
        selectedMonth={selectedMonth}
        onMonthChange={(month) => void loadDashboard(month, scope)}
        importPanel={
          <ImportPanel
            fileName={importState.fileName}
            inferredMonth={importState.inferredMonth}
            reportMonth={importState.reportMonth}
            rowCount={importState.rowCount}
            siteNames={importState.siteNames}
            importing={importing}
            importError={importError}
            importSuccess={importSuccess}
            canSubmit={importRows.length > 0 && isValidReportMonth(importState.reportMonth) && !importing}
            onFileChange={handleImportFileChange}
            onReportMonthChange={handleImportMonthChange}
            onSubmit={handleImportSubmit}
          />
        }
      />
    );
  }

  const meta = data.meta;
  const totalSites = data.plants.length;
  const reportedCount = meta.reportedSiteCount ?? totalSites - (meta.missingReportCount ?? 0);
  const missingCount = meta.missingReportCount ?? 0;
  const sourceRosterMissing = scope === "source" && (meta.sourceSiteCount == null || meta.sourceAvailable === false);
  const topMonitoring = monitoringRows.slice(0, 4);

  function showAllMonitoring() {
    setStatusFilter("monitor");
    setSearchQuery("");
    setTimeout(() => tableSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function resetTableFilters() {
    setStatusFilter("all");
    setSearchQuery("");
  }

  return (
    <main className="dashboard-shell">
      <header className="page-head">
        <div>
          <h1>ภาพรวมผลผลิตไฟฟ้าโซลาร์</h1>
          <p className="page-sub">เดือนนี้ผลิตไฟได้เท่าไร ไซต์ไหนต้องดู และต้องทำอะไรต่อ</p>
        </div>

        <div className="toolbar-meta compact-controls">
          <label className="month-select">
            <span>เดือนที่ดู</span>
            <select value={selectedMonth} onChange={(event) => handleMonthChange(event.target.value)}>
              {data.availableMonths.slice().reverse().map((month) => (
                <option key={month} value={month}>
                  {formatMonthLabel(month)}
                </option>
              ))}
            </select>
          </label>
          <Button icon={<CloudUploadOutlined />} onClick={openImport} size="small">
            นำเข้ารายงาน
          </Button>
        </div>
      </header>

      <section className="coverage-strip" aria-label="ขอบเขตข้อมูลที่แสดง">
        <div className="scope-toggle" role="group" aria-label="เลือกขอบเขตรายชื่อไซต์">
          <button
            type="button"
            className={`scope-toggle__button${scope === "source" ? " scope-toggle__button--active" : ""}`}
            aria-pressed={scope === "source"}
            onClick={() => handleScopeChange("source")}
          >
            รายชื่อจากการซิงก์ล่าสุด
          </button>
          <button
            type="button"
            className={`scope-toggle__button${scope === "history" ? " scope-toggle__button--active" : ""}`}
            aria-pressed={scope === "history"}
            onClick={() => handleScopeChange("history")}
          >
            รวมประวัติไซต์เก่า
          </button>
        </div>

        <ul className="coverage-strip__facts">
          <li className="coverage-strip__fact">
            <strong>{totalSites}</strong> ไซต์ในมุมมองนี้
          </li>
          <li className="coverage-strip__fact">
            มีรายงาน {monthLabel} แล้ว <strong>{reportedCount}</strong> ไซต์
          </li>
          {missingCount > 0 && (
            <li className="coverage-strip__fact coverage-strip__fact--warn">
              ยังไม่มีรายงาน <strong>{missingCount}</strong> ไซต์
            </li>
          )}
          {(meta.missingYieldCount ?? 0) > 0 && (
            <li className="coverage-strip__fact coverage-strip__fact--warn">
              ยังไม่มีค่าผลิตไฟ <strong>{meta.missingYieldCount}</strong> ไซต์
            </li>
          )}
          {scope === "history" && (meta.historicalSiteCount ?? 0) > 0 && (
            <li className="coverage-strip__fact">
              รวมไซต์เก่าที่ไม่ได้อยู่ในรายชื่อซิงก์ล่าสุดอีก <strong>{meta.historicalSiteCount}</strong> ไซต์
            </li>
          )}
          {meta.rosterUpdatedAt && (
            <li className="coverage-strip__fact">
              อัปเดตรายชื่อไซต์เมื่อ {formatDateTimeLabel(meta.rosterUpdatedAt)}
              {meta.rosterReportMonth ? ` (รายชื่อจากรายงาน ${formatMonthLabel(meta.rosterReportMonth)})` : ""}
            </li>
          )}
        </ul>

        {sourceRosterMissing && (
          <p className="coverage-strip__note">
            ยังไม่มีรายชื่อจากการซิงก์ล่าสุด — ตอนนี้แสดงตามไซต์ที่มีรายงานใน{monthLabel} ไม่ได้ยืนยันว่าเป็นไซต์ที่ใช้งานอยู่ทั้งหมด
          </p>
        )}
      </section>

      {importSuccess && !isImportOpen && (
        <Alert type="success" message={importSuccess} showIcon closable onClose={() => setImportSuccess(null)} />
      )}

      <section className="summary-grid" aria-label="สรุปผลผลิต">
        <article className="summary-card summary-card--primary">
          <p className="summary-card__label">ไฟฟ้าที่ผลิตได้เดือนนี้</p>
          <p className="summary-card__value">
            {formatNumber(data.portfolio.monthlyYieldKwh)} <span>หน่วย</span>
          </p>
          <p className="summary-card__note">
            {monthLabel} · 1 หน่วย = 1 kWh
          </p>
          <p className="summary-card__note">
            สะสมทั้งหมด {formatNumber(data.portfolio.cumulativeYieldKwh)} หน่วย
          </p>
        </article>

        <article className="summary-card">
          <p className="summary-card__label">เทียบเดือนเดียวกันปีก่อน</p>
          {monthDelta ? (
            <>
              <p className={`summary-card__value summary-card__value--${monthDelta.abs > 0 ? "up" : monthDelta.abs < 0 ? "down" : "flat"}`}>
                {formatSignedPercent(monthDelta.pct)}
              </p>
              <p className="summary-card__note">
                {monthDelta.abs >= 0 ? "มากกว่า" : "น้อยกว่า"}
                {previousYearMonthLabel ? `${previousYearMonthLabel} ` : "ปีก่อน "}
                {formatNumber(Math.abs(monthDelta.abs))} หน่วย
              </p>
            </>
          ) : (
            <>
              <p className="summary-card__value summary-card__value--flat">—</p>
              <p className="summary-card__note">ยังไม่มีข้อมูลเดือนเดียวกันของปีก่อนให้เทียบ</p>
            </>
          )}
        </article>

        <article className="summary-card">
          <p className="summary-card__label">ขนาดระบบติดตั้งรวม</p>
          <p className="summary-card__value">
            {formatNumber(data.portfolio.installedCapacityKwp)} <span>kWp</span>
          </p>
          <p className="summary-card__note">kWp = ขนาดระบบติดตั้ง จาก {totalSites} ไซต์ในมุมมองนี้</p>
        </article>

        <article className="summary-card">
          <div className="summary-card__head">
            <p className="summary-card__label">ผลรวมปีที่เลือก</p>
            <label className="summary-card__select">
              <span className="visually-hidden">เลือกปี</span>
              <select
                value={effectiveYear ?? ""}
                onChange={(event) => setSelectedYear(event.target.value ? Number(event.target.value) : null)}
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {formatYearLabel(year)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="summary-card__value">
            {formatNumber(yearSelection?.yieldKwh ?? null)} <span>หน่วย</span>
          </p>
          <p className="summary-card__note">
            {yearLabel}
            {availableMonthsInYear > 0 ? ` · จาก ${availableMonthsInYear} เดือนที่มีข้อมูล` : ""}
          </p>
        </article>
      </section>

      <PortfolioComparisonChart
        effectiveYear={effectiveYear}
        points={portfolioChartPoints}
        scale={portfolioChartScale}
        hasData={portfolioChartHasData}
        insight={portfolioInsight}
        selectedMonthNumber={selectedMonthNumber}
      />

      <section aria-labelledby="attention-heading" className="section-block">
        <div className="section-head">
          <div>
            <h2 id="attention-heading">ไซต์ที่ต้องติดตาม</h2>
          </div>
          <p className="section-note">แสดงสูงสุด 4 ไซต์แรก จัดเรียงตามความเร่งด่วน</p>
        </div>

        {monitoringRows.length === 0 ? (
          <div className="empty-state empty-state--soft">
            <p className="empty-state__title">เดือนนี้ทุกไซต์อยู่ในเกณฑ์ปกติ</p>
            <p className="empty-state__text">ไม่มีไซต์ที่ต้องดำเนินการในขณะนี้</p>
          </div>
        ) : (
          <>
            <div className="risk-list">
              {topMonitoring.map((row) => {
                const isRecovering =
                  row.comparison.mom.deltaPct !== null &&
                  row.comparison.mom.deltaPct > 0 &&
                  ((row.comparison.yoy.deltaPct !== null && row.comparison.yoy.deltaPct < 0) ||
                    (row.comparison.siteAvg.deltaPct !== null && row.comparison.siteAvg.deltaPct < 0));
                const isNoData = row.status === "no-data";
                return (
                  <Link
                    key={row.siteId}
                    href={`/sites/${encodeURIComponent(row.siteName)}?month=${encodeURIComponent(data.selectedMonth)}&scope=${scope}`}
                    className={`risk-card risk-card--${row.status}`}
                  >
                    <div className="risk-card__top">
                      <StatusChip status={row.status} />
                      <div className="risk-card__flags">
                        {isRecovering && <span className="recovery-indicator">↑ ฟื้นจากเดือนก่อน</span>}
                        <span className="risk-card__yield">
                          {row.monthYieldKwh === null ? "ไม่มีข้อมูล" : `${formatNumber(row.monthYieldKwh)} หน่วย`}
                        </span>
                      </div>
                    </div>

                    <div className="risk-card__body">
                      <h3>{row.siteName}</h3>
                      <p className="risk-card__caption">
                        {row.capacityKwp === null ? "ยังไม่ระบุขนาดระบบ" : `${formatNumber(row.capacityKwp)} kWp`}
                      </p>
                      <p className="risk-card__reason">
                        {isNoData
                          ? "ยังไม่มีค่าผลิตไฟเดือนนี้ กรุณาตรวจสอบข้อมูลรายงาน"
                          : row.reason}
                      </p>
                    </div>

                    {!isNoData && (
                      <div className="risk-card__meta">
                        <ComparisonBlock label="เทียบเดือนเดียวกันปีก่อน" comparison={row.comparison.yoy} />
                        <ComparisonBlock label="เทียบค่าเฉลี่ยไซต์" comparison={row.comparison.siteAvg} />
                        <ComparisonBlock label="เทียบเดือนก่อน" comparison={row.comparison.mom} secondary />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>

            {monitoringRows.length > topMonitoring.length && (
              <button type="button" className="link-button" onClick={showAllMonitoring}>
                ดูไซต์ที่ต้องติดตามทั้งหมด ({monitoringRows.length} ไซต์) ↓
              </button>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="table-heading" className="section-block" ref={tableSectionRef}>
        <div className="section-head table-head">
          <div>
            <h2 id="table-heading">รายละเอียดแต่ละไซต์</h2>
          </div>
          <div className="table-head-meta">
            <span className="meta-pill">{monthLabel}</span>
            <span className="meta-pill">{yearLabel}</span>
            <span className="meta-pill meta-pill--strong">
              แสดง {filteredRows.length} จาก {totalSites} ไซต์
            </span>
          </div>
        </div>

        <div className="filter-bar">
          <label className="field filter-bar__search">
            <span>ค้นหาชื่อไซต์</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="พิมพ์ชื่อไซต์…"
            />
          </label>
          <label className="field">
            <span>กรองตามสถานะ</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">ทุกสถานะ</option>
              <option value="monitor">เฉพาะที่ต้องติดตาม</option>
              <option value="attention">{statusLabel.attention}</option>
              <option value="watch">{statusLabel.watch}</option>
              <option value="review">{statusLabel.review}</option>
              <option value="ok">{statusLabel.ok}</option>
              <option value="no-data">{statusLabel["no-data"]}</option>
            </select>
          </label>
        </div>

        {filteredRows.length === 0 ? (
          <div className="empty-state empty-state--soft no-results">
            <p className="empty-state__title">ไม่พบไซต์ที่ตรงกับการค้นหา</p>
            <p className="empty-state__text">ลองเปลี่ยนคำค้นหรือล้างตัวกรองเพื่อดูไซต์ทั้งหมด</p>
            <button type="button" className="primary-button" onClick={resetTableFilters}>
              ล้างการค้นหาและตัวกรอง
            </button>
          </div>
        ) : (
          <div className="table-wrap table-wrap--elevated">
            <table className="site-table site-table--pretty">
              <caption className="visually-hidden">
                รายละเอียดไซต์สำหรับ{monthLabel} แสดง {filteredRows.length} จาก {totalSites} ไซต์
              </caption>
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const isRight = rightAlignedColumnIds.has(header.id);
                      const sorted = header.column.getIsSorted();
                      return (
                        <th
                          key={header.id}
                          className={`th ${isRight ? "th--right" : ""}`}
                          aria-sort={
                            header.column.getCanSort()
                              ? sorted === "asc"
                                ? "ascending"
                                : sorted === "desc"
                                  ? "descending"
                                  : "none"
                              : undefined
                          }
                        >
                          {header.column.getCanSort() ? (
                            <button
                              type="button"
                              className="th-button"
                              onClick={() => header.column.toggleSorting()}
                              aria-label={`เรียงตาม${flexRender(header.column.columnDef.header, header.getContext())}`}
                            >
                              <span aria-hidden="true">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                              <span className="th-arrow" aria-hidden>
                                {{ asc: "↑", desc: "↓" }[sorted as string] ?? "↕"}
                              </span>
                            </button>
                          ) : (
                            <div className="th-button">
                              <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id}>
                    {row.getVisibleCells().map((cell) => {
                      const colId = cell.column.id;
                      const isRight = rightAlignedColumnIds.has(colId);
                      const isPct = percentageColumnIds.has(colId);
                      const pctVal = isPct ? (cell.getValue() as number | null) : null;
                      const colorClass = isPct
                        ? pctVal === null
                          ? "muted"
                          : pctVal < 0
                            ? "danger"
                            : pctVal > 0
                              ? "success"
                              : ""
                        : "";
                      return (
                        <td key={cell.id} className={[isRight ? "num" : "", colorClass].filter(Boolean).join(" ")}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div
        ref={importRef}
        className={`import-section-wrapper${isImportOpen ? "" : " import-section-wrapper--collapsed"}`}
      >
        <ImportPanel
          fileName={importState.fileName}
          inferredMonth={importState.inferredMonth}
          reportMonth={importState.reportMonth}
          rowCount={importState.rowCount}
          siteNames={importState.siteNames}
          importing={importing}
          importError={importError}
          importSuccess={isImportOpen ? importSuccess : null}
          canSubmit={importRows.length > 0 && isValidReportMonth(importState.reportMonth) && !importing}
          onFileChange={handleImportFileChange}
          onReportMonthChange={handleImportMonthChange}
          onSubmit={handleImportSubmit}
        />
      </div>

      <details className="glossary">
        <summary>อธิบายคำและหน่วยที่ใช้ในหน้านี้</summary>
        <div className="glossary__body">
          <p><strong>หน่วย</strong> = หน่วยไฟฟ้า 1 หน่วย เท่ากับ 1 kWh</p>
          <p><strong>kWp</strong> = ขนาดกำลังผลิตติดตั้งภายใต้สภาวะทดสอบ ผลผลิตจริงขึ้นอยู่กับแสงแดดและสภาพระบบด้วย</p>
          <p><strong>ไฟฟ้าที่ผลิตได้เดือนนี้</strong> = ผลผลิตรวมทุกไซต์ของเดือนที่เลือก</p>
          <p><strong>เทียบเดือนเดียวกันปีก่อน</strong> = เทียบกับเดือนเดียวกันของปีที่แล้ว เพื่อให้เห็นแนวโน้มโดยไม่ติดฤดูกาล</p>
          <p><strong>เทียบเดือนก่อน</strong> = เทียบกับรายงานเดือนก่อนหน้าของไซต์นั้น หากข้อมูลขาด อาจไม่ใช่เดือนติดกัน</p>
          <p><strong>เทียบค่าเฉลี่ยไซต์</strong> = เทียบกับค่าเฉลี่ยเดือนอื่นที่มีค่าผลิตไฟมากกว่าศูนย์ของไซต์นี้</p>
          <p><strong>ขอบเขตข้อมูล</strong> = "รายชื่อจากการซิงก์ล่าสุด" แสดงเฉพาะไซต์ในรายชื่อล่าสุด ส่วน "รวมประวัติไซต์เก่า" จะรวมไซต์ที่เคยมีข้อมูลในอดีตด้วย</p>
        </div>
      </details>
    </main>
  );
}

function formatMonthLabel(value: string): string {
  if (!value) return "ยังไม่เลือกเดือน";
  const [yearPart, monthPart] = value.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return value;

  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${months[month - 1] ?? monthPart} ${year + 543}`;
}

function formatYearLabel(year: number): string {
  return `พ.ศ. ${year + 543}`;
}

function formatDateTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(value);
}

function formatSignedPercent(value: number): string {
  const percent = value * 100;
  return `${percent >= 0 ? "+" : ""}${new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: percent % 1 === 0 ? 0 : 1,
  }).format(percent)}%`;
}

function ComparisonBlock({ label, comparison, secondary = false }: { label: string; comparison: ComparisonValue; secondary?: boolean }) {
  const secondaryClass = secondary ? " comparison-row--secondary" : "";

  if (comparison.deltaAbsKwh === null || comparison.deltaPct === null || comparison.baselineKwh === null) {
    return (
      <div className={`comparison-row comparison-row--empty${secondaryClass}`}>
        <span className="comparison-row__label">{label}</span>
        <span className="comparison-row__value">ไม่มีข้อมูลเทียบ</span>
      </div>
    );
  }

  const direction = comparison.deltaAbsKwh > 0 ? "เพิ่มขึ้น" : comparison.deltaAbsKwh < 0 ? "ลดลง" : "เท่าเดิม";
  return (
    <div className={`comparison-row comparison-row--${comparison.state}${secondaryClass}`}>
      <span className="comparison-row__label">{label}</span>
      <span className="comparison-row__value">
        {direction} {formatNumber(Math.abs(comparison.deltaAbsKwh))} หน่วย ({formatSignedPercent(comparison.deltaPct)})
      </span>
      <span className="comparison-row__baseline">ช่วงเทียบ {formatNumber(comparison.baselineKwh)} หน่วย</span>
    </div>
  );
}

function ImportPanel({
  fileName,
  inferredMonth,
  reportMonth,
  rowCount,
  importing,
  importError,
  importSuccess,
  canSubmit,
  onFileChange,
  onReportMonthChange,
  onSubmit,
}: {
  fileName: string;
  inferredMonth: string;
  reportMonth: string;
  rowCount: number;
  siteNames: string[];
  importing: boolean;
  importError: string | null;
  importSuccess: string | null;
  canSubmit: boolean;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onReportMonthChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const resolvedMonth = isValidReportMonth(reportMonth) ? reportMonth : inferredMonth;
  const monthLabel = resolvedMonth ? formatMonthLabel(resolvedMonth) : "ยังไม่รู้เดือน";

  return (
    <section className="surface-card import-card" aria-labelledby="import-heading">
      <div className="section-head compact import-card__head">
        <div>
          <h2 id="import-heading">นำเข้ารายงาน</h2>
        </div>
        <span className="meta-pill">{rowCount > 0 ? `${rowCount} แถว` : "รอไฟล์"}</span>
      </div>

      <form className="import-form" onSubmit={onSubmit}>
        <label className="field field--file">
          <span>ไฟล์ Excel</span>
          <input type="file" accept=".xlsx,.xls" onChange={onFileChange} />
        </label>

        <label className="field">
          <span>เดือนรายงาน</span>
          <input type="month" value={reportMonth} onChange={onReportMonthChange} />
        </label>

        <div className="import-actions">
          <Button
            type="primary"
            htmlType="submit"
            icon={<CloudUploadOutlined />}
            loading={importing}
            disabled={!canSubmit}
          >
            {importing ? "กำลังนำเข้า..." : "นำเข้ารายงาน"}
          </Button>
        </div>
      </form>

      <div className="import-preview">
        <div>
          <p className="import-preview__label">ไฟล์</p>
          <p className="import-preview__value">{fileName || "ยังไม่ได้เลือกไฟล์"}</p>
        </div>
        <div>
          <p className="import-preview__label">เดือนที่จะบันทึก</p>
          <p className="import-preview__value">{monthLabel}</p>
        </div>
      </div>

      {importSuccess ? <Alert type="success" message={importSuccess} showIcon style={{ marginTop: 12 }} /> : null}
      {importError ? <Alert type="error" message={importError} showIcon style={{ marginTop: 12 }} /> : null}
    </section>
  );
}

function PortfolioComparisonChart({
  effectiveYear,
  points,
  scale,
  hasData,
  insight,
  selectedMonthNumber,
}: {
  effectiveYear: number | null;
  points: PortfolioComparisonChartPoint[];
  scale: PortfolioChartScale;
  hasData: boolean;
  insight?: PortfolioInsight | null;
  selectedMonthNumber?: number | null;
}) {
  const currentPath = buildChartPath(points, (point) => point.currentYearYieldKwh, scale);
  const previousPath = buildChartPath(points, (point) => point.previousYearSameMonthYieldKwh, scale);
  const currentTitle = effectiveYear ? `ปี ${formatYearLabel(effectiveYear)}` : "ปีที่เลือก";
  const previousTitle = effectiveYear ? `ปี ${formatYearLabel(effectiveYear - 1)}` : "ปีก่อน";
  const insightText = insight && insight.totalMonthsCompared >= 2 && effectiveYear
    ? formatPortfolioInsight(insight, effectiveYear)
    : null;
  const insightClass = !insight || !insightText
    ? ""
    : insight.monthsAhead >= insight.monthsBehind
      ? "chart-insight-line--good"
      : "chart-insight-line--bad";

  return (
    <section className="section-block" aria-labelledby="portfolio-chart-heading">
      <div className="section-head">
        <div>
          <h2 id="portfolio-chart-heading">ผลผลิตรวมทุกไซต์ {currentTitle} เทียบเดือนเดียวกันปีก่อน</h2>
          {insightText && <p className={`chart-insight-line ${insightClass}`}>{insightText}</p>}
        </div>
        <p className="section-note">
          เส้นสีน้ำเงินคือ{currentTitle} · เส้นประสีเทาคือเดือนเดียวกันของ{previousTitle}
        </p>
      </div>

      <article className="surface-card portfolio-chart__card">
        {hasData ? (
          <>
            <div className="portfolio-chart__legend" aria-hidden="true">
              <span className="portfolio-chart__legend-item portfolio-chart__legend-item--current">{currentTitle}</span>
              <span className="portfolio-chart__legend-item portfolio-chart__legend-item--previous">
                เทียบเดือนเดียวกันปีก่อน ({previousTitle})
              </span>
            </div>

            <div className="portfolio-chart__plot">
              <svg
                className="portfolio-chart__svg"
                viewBox={`0 0 ${scale.width} ${scale.height}`}
                role="img"
                aria-labelledby="portfolio-chart-title portfolio-chart-desc"
              >
                <title id="portfolio-chart-title">กราฟผลผลิตรวมทุกไซต์รายเดือน {currentTitle}</title>
                <desc id="portfolio-chart-desc">
                  กราฟเส้นแสดงผลผลิตรวมทุกไซต์ของ{currentTitle}เทียบกับเดือนเดียวกันของ{previousTitle}แต่ละเดือน
                </desc>
                <line
                  x1={scale.padding.left}
                  x2={scale.width - scale.padding.right}
                  y1={scale.height - scale.padding.bottom}
                  y2={scale.height - scale.padding.bottom}
                  className="portfolio-chart__axis"
                />
                <line
                  x1={scale.padding.left}
                  x2={scale.padding.left}
                  y1={scale.padding.top}
                  y2={scale.height - scale.padding.bottom}
                  className="portfolio-chart__axis"
                />
                {([0, 0.5, 1] as const).map((ratio) => {
                  const value = ratio * scale.yMax;
                  const y = scale.yForValue(value);
                  if (y === null) return null;
                  return (
                    <text
                      key={ratio}
                      x={scale.padding.left - 6}
                      y={y + 4}
                      textAnchor="end"
                      className="portfolio-chart__label"
                    >
                      {formatAxisKwh(value)}
                    </text>
                  );
                })}
                <path d={currentPath} className="portfolio-chart__line portfolio-chart__line--current" />
                <path d={previousPath} className="portfolio-chart__line portfolio-chart__line--previous" />
                {points.flatMap((point) => {
                  const x = scale.xForMonth(point.monthNumber);
                  const currentY = scale.yForValue(point.currentYearYieldKwh);
                  const previousY = scale.yForValue(point.previousYearSameMonthYieldKwh);
                  const dots: React.ReactNode[] = [];

                  if (currentY !== null) {
                    dots.push(
                      <circle
                        key={`current-${point.monthNumber}`}
                        cx={x}
                        cy={currentY}
                        r="4"
                        className="portfolio-chart__point portfolio-chart__point--current"
                      />,
                    );
                  }

                  if (previousY !== null) {
                    dots.push(
                      <circle
                        key={`previous-${point.monthNumber}`}
                        cx={x}
                        cy={previousY}
                        r="4"
                        className="portfolio-chart__point portfolio-chart__point--previous"
                      />,
                    );
                  }

                  return dots;
                })}
                {selectedMonthNumber !== null && selectedMonthNumber !== undefined && (() => {
                  const point = points.find((p) => p.monthNumber === selectedMonthNumber);
                  if (!point) return null;
                  const x = scale.xForMonth(point.monthNumber);
                  const currentY = scale.yForValue(point.currentYearYieldKwh);
                  const previousY = scale.yForValue(point.previousYearSameMonthYieldKwh);
                  return (
                    <>
                      {currentY !== null && (
                        <circle cx={x} cy={currentY} r="7" className="portfolio-chart__point portfolio-chart__point--selected portfolio-chart__point--selected-current" />
                      )}
                      {previousY !== null && (
                        <circle cx={x} cy={previousY} r="7" className="portfolio-chart__point portfolio-chart__point--selected portfolio-chart__point--selected-previous" />
                      )}
                    </>
                  );
                })()}
                {points.map((point) => (
                  <text
                    key={`label-${point.monthNumber}`}
                    x={scale.xForMonth(point.monthNumber)}
                    y={scale.height - 8}
                    textAnchor="middle"
                    className="portfolio-chart__label"
                  >
                    {point.monthLabel}
                  </text>
                ))}
              </svg>
            </div>

            <div className="table-wrap portfolio-chart__table-wrap">
              <table className="portfolio-chart__table">
                <caption className="visually-hidden">ตารางสรุปผลผลิตรายเดือน {currentTitle} เทียบ{previousTitle}</caption>
                <thead>
                  <tr>
                    <th scope="col">เดือน</th>
                    <th scope="col">{currentTitle}</th>
                    <th scope="col">เดือนเดียวกัน{previousTitle}</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.monthNumber}>
                      <th scope="row">{point.monthLabel}</th>
                      <td>{point.currentYearYieldKwh === null ? "ไม่มีข้อมูล" : `${formatNumber(point.currentYearYieldKwh)} หน่วย`}</td>
                      <td>
                        {point.previousYearSameMonthYieldKwh === null
                          ? "ไม่มีข้อมูล"
                          : `${formatNumber(point.previousYearSameMonthYieldKwh)} หน่วย`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty-state empty-state--soft">
            <p className="empty-state__title">ยังไม่มีข้อมูลกราฟ</p>
            <p className="empty-state__text">ยังไม่พบข้อมูลผลผลิตรายเดือนของ{currentTitle}สำหรับเปรียบเทียบ</p>
          </div>
        )}
      </article>
    </section>
  );
}

function buildChartPath(
  points: PortfolioComparisonChartPoint[],
  accessor: (point: PortfolioComparisonChartPoint) => number | null,
  scale: PortfolioChartScale,
): string {
  const commands: string[] = [];
  let segmentOpen = false;

  for (const point of points) {
    const value = accessor(point);
    const y = scale.yForValue(value);
    if (y === null) {
      segmentOpen = false;
      continue;
    }

    const x = scale.xForMonth(point.monthNumber);
    commands.push(`${segmentOpen ? "L" : "M"} ${x} ${y}`);
    segmentOpen = true;
  }

  return commands.join(" ");
}

function formatAxisKwh(value: number): string {
  if (value === 0) return "0";
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return Math.round(value).toString();
}

function formatPortfolioInsight(insight: PortfolioInsight, effectiveYear: number): string {
  const total = insight.totalMonthsCompared;
  const yearText = formatYearLabel(effectiveYear);
  const avgStr =
    insight.averageDeltaPct !== null
      ? ` (เฉลี่ย ${insight.averageDeltaPct >= 0 ? "+" : ""}${(insight.averageDeltaPct * 100).toFixed(1)}%)`
      : "";
  if (insight.monthsAhead >= insight.monthsBehind) {
    return `ปี ${yearText} ผลิตมากกว่าปีก่อน ${insight.monthsAhead} จาก ${total} เดือนที่เทียบได้${avgStr}`;
  }
  return `ปี ${yearText} ผลิตน้อยกว่าปีก่อน ${insight.monthsBehind} จาก ${total} เดือนที่เทียบได้${avgStr}`;
}

function LoadingScreen() {
  return (
    <main className="dashboard-shell">
      <Card className="loading-state" role="status" aria-live="polite">
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    </main>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="dashboard-shell">
      <Card className="empty-state">
        <Alert
          type="error"
          showIcon
          message="โหลดข้อมูลไม่ได้"
          description={message}
          style={{ marginBottom: 16 }}
        />
        <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
          ลองใหม่
        </Button>
      </Card>
    </main>
  );
}

function EmptyScreen({
  monthOptions,
  selectedMonth,
  onMonthChange,
  importPanel,
}: {
  monthOptions: string[];
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  importPanel: React.ReactNode;
}) {
  return (
    <main className="dashboard-shell">
      <Card className="empty-state">
        <Empty
          description={
            <span>
              <strong className="empty-state__title">ยังไม่มีข้อมูล</strong>
              <br />
              ลองเลือกเดือนอื่น สลับขอบเขตข้อมูล หรือนำเข้ารายงานใหม่
            </span>
          }
        />
        {monthOptions.length > 0 && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <Select
              value={selectedMonth || undefined}
              placeholder="เลือกเดือน"
              onChange={onMonthChange}
              style={{ minWidth: 200 }}
              options={monthOptions.map((month) => ({ value: month, label: formatMonthLabel(month) }))}
            />
          </div>
        )}
      </Card>
      {importPanel}
    </main>
  );
}

function NoDataCell() {
  return <span className="muted">ไม่มีข้อมูล</span>;
}

function StatusChip({ status }: { status: Status }) {
  return <span className={`status-chip status-chip--${status}`}>{statusLabel[status]}</span>;
}

export default SolarDashboard;
