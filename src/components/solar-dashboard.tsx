"use client";

import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Empty, Select, Skeleton, Statistic, Tag, Typography } from "antd";
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
} from "../lib/solar-table";

type DashboardResponse = {
  ok: boolean;
  selectedMonth: string;
  availableMonths: string[];
  availableYears: number[];
  meta: {
    siteCount: number;
    reportCount: number;
    firstMonth: string;
    latestMonth: string;
  };
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

export function SolarDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "status", desc: false }]);
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
  const dashboardAbortRef = useRef<AbortController | null>(null);
  const dashboardRequestRef = useRef(0);

  const loadDashboard = useCallback(async (month = "") => {
    dashboardAbortRef.current?.abort();
    const controller = new AbortController();
    dashboardAbortRef.current = controller;
    const requestId = dashboardRequestRef.current + 1;
    dashboardRequestRef.current = requestId;

    setLoading(true);
    setError(null);

    try {
      const query = month ? `?month=${encodeURIComponent(month)}` : "";
      const response = await fetch(`/api/dashboard/latest${query}`, { cache: "no-store", signal: controller.signal });
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
    void loadDashboard();
    return () => {
      dashboardAbortRef.current?.abort();
    };
  }, [loadDashboard]);

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
      await loadDashboard(payload.reportMonth);
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
  const latestYearTotal = data?.portfolio?.latestYearYieldKwh ?? null;
  const monthLabel = formatMonthLabel(selectedMonth);
  const yearLabel = effectiveYear !== null ? formatYearLabel(effectiveYear) : "ยังไม่เลือกปี";
  const portfolioChartPoints = useMemo(
    () => buildPortfolioComparisonPoints(data?.portfolioMonthlySeries ?? [], data?.portfolio?.latestYear ?? undefined),
    [data?.portfolio?.latestYear, data?.portfolioMonthlySeries],
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
    return { abs: raw.deltaAbsKwh, pct: raw.deltaPct };
  }, [data?.portfolioMonthlySeries, selectedMonth]);

  const availableMonthsInYear = useMemo(
    () => (data?.portfolioMonthlySeries ?? []).filter((p) => p.year === effectiveYear && p.totalYieldKwh !== null).length,
    [data?.portfolioMonthlySeries, effectiveYear],
  );

  const attentionCount = useMemo(() => monitoringRows.filter((r) => r.status === "attention").length, [monitoringRows]);
  const watchCount = useMemo(() => monitoringRows.filter((r) => r.status === "watch").length, [monitoringRows]);
  const reviewCount = useMemo(() => monitoringRows.filter((r) => r.status === "review").length, [monitoringRows]);

  const columns = useMemo<ColumnDef<SiteTableRow>[]>(
    () => [
      {
        id: "status",
        header: siteTableHeaderLabels.status,
        accessorFn: (row) => statusRank[row.status],
        sortingFn: statusSortFn,
        cell: ({ row }) => <StatusTag status={row.original.status} />,
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
              href={`/sites/${encodeURIComponent(row.original.siteName)}?month=${encodeURIComponent(selectedMonth)}`}
            >
              {row.original.siteName}
            </Link>
            <span className="site-name-cell__sub">
              {row.original.capacityKwp === null
                ? "ยังไม่ระบุกำลังติดตั้ง"
                : `${formatNumber(row.original.capacityKwp)} kWp`}
            </span>
          </div>
        ),
      },
      {
        id: "monthYieldKwh",
        header: siteTableHeaderLabels.monthYieldKwh,
        accessorKey: "monthYieldKwh",
        sortingFn: nullsLastSort,
        cell: ({ row }) =>
          row.original.monthYieldKwh === null ? <NoDataCell /> : formatNumber(row.original.monthYieldKwh),
      },
      {
        id: "yearYieldKwh",
        header: siteTableHeaderLabels.yearYieldKwh,
        accessorKey: "yearYieldKwh",
        sortingFn: nullsLastSort,
        cell: ({ row }) =>
          row.original.yearYieldKwh === null ? <NoDataCell /> : formatNumber(row.original.yearYieldKwh),
      },
      {
        id: "vsLastMonthPct",
        header: "เดือนก่อน",
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
                <span className="comparison-cell__abs">{abs >= 0 ? "+" : ""}{formatNumber(abs)} kWh</span>
              )}
            </>
          );
        },
      },
      {
        id: "vsSiteAvgPct",
        header: "ค่าเฉลี่ยไซต์",
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
                <span className="comparison-cell__abs">{abs >= 0 ? "+" : ""}{formatNumber(abs)} kWh</span>
              )}
            </>
          );
        },
      },
      {
        id: "vsLastYearPct",
        header: "YoY (ปีก่อน)",
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
                <span className="comparison-cell__abs">{abs >= 0 ? "+" : ""}{formatNumber(abs)} kWh</span>
              )}
            </>
          );
        },
      },
    ],
    [selectedMonth],
  );


  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => row.siteId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} onRetry={() => void loadDashboard(selectedMonth)} />;

  if (!data || rows.length === 0 || !data.portfolio) {
    return (
      <EmptyScreen
        monthOptions={data?.availableMonths ?? []}
        selectedMonth={selectedMonth}
        onMonthChange={(month) => void loadDashboard(month)}
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

  return (
    <main className="dashboard-shell">
      <header className="page-head">
        <div>
          <h1>สรุปไซต์ที่ต้องดูตอนนี้</h1>
          <p className="page-sub">เลือกเดือนเพื่อดูผลผลิตรวม เทียบปีก่อน และไซต์ที่ควรตรวจสอบก่อน</p>
        </div>

        <div className="toolbar-meta stacked compact-controls">
          <label className="month-select">
            <span>เดือน</span>
            <select value={selectedMonth} onChange={(event) => void loadDashboard(event.target.value)}>
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

      <AlertBanner attention={attentionCount} watch={watchCount} review={reviewCount} monitoringRows={monitoringRows} />

      {importSuccess && !isImportOpen && (
        <Alert type="success" message={importSuccess} showIcon closable onClose={() => setImportSuccess(null)} />
      )}

      <section className="summary-grid" aria-label="สรุปผลผลิต">
        <SummaryCard
          label={`เดือนนี้ (${monthLabel})`}
          value={formatNumber(data.portfolio.monthlyYieldKwh)}
          unit="kWh"
          delta={monthDelta}
          note={`สะสม: ${formatNumber(data.portfolio.cumulativeYieldKwh)} kWh`}
        />
        <SummaryCard
          label={data.portfolio.latestYear ? `ปีล่าสุด (${formatYearLabel(data.portfolio.latestYear)})` : "ปีล่าสุด"}
          value={formatNumber(latestYearTotal)}
          unit="kWh"
          note={data.portfolio.latestYear ? `${formatYearLabel(data.portfolio.latestYear)}: ผลรวมปีนี้` : "ปีล่าสุด"}
        />
        <SummaryCard
          label="ปีที่เลือก"
          value={formatNumber(yearSelection?.yieldKwh ?? null)}
          unit="kWh"
          note={availableMonthsInYear > 0 ? `จาก ${availableMonthsInYear} เดือน` : yearLabel}
          control={
            <label className="summary-card__select">
              <span className="visually-hidden">เลือกปี</span>
              <select value={effectiveYear ?? ""} onChange={(event) => setSelectedYear(event.target.value ? Number(event.target.value) : null)}>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {formatYearLabel(year)}
                  </option>
                ))}
              </select>
            </label>
          }
        />
        <SummaryCard
          label="กำลังติดตั้งรวม"
          value={formatNumber(data.portfolio.installedCapacityKwp)}
          unit="kWp"
          note={`${data.meta.siteCount} ไซต์`}
        />
      </section>

      <PortfolioComparisonChart
        currentYear={data.portfolio.latestYear}
        points={portfolioChartPoints}
        scale={portfolioChartScale}
        hasData={portfolioChartHasData}
        insight={portfolioInsight}
        selectedMonthNumber={selectedMonthNumber}
      />

      <section aria-labelledby="attention-heading" className="section-block">
        <div className="section-head">
          <div>
            <h2 id="attention-heading">ศูนย์ควบคุมความเสี่ยง (Risk Command Center)</h2>
          </div>
          <p className="section-note">แสดงเฉพาะไซต์ที่ต้องดำเนินการ จัดเรียงตามความเร่งด่วน</p>
        </div>

        {monitoringRows.length === 0 ? (
          <div className="empty-state empty-state--soft">
            <p className="empty-state__title">เดือนนี้ทุกไซต์อยู่ในเกณฑ์ปกติ ✓</p>
            <p className="empty-state__text">ไม่มีไซต์ที่ต้องดำเนินการในขณะนี้</p>
          </div>
        ) : (
          <div className="risk-list">
            {monitoringRows.map((row) => {
              const isRecovering =
                row.comparison.mom.deltaPct !== null &&
                row.comparison.mom.deltaPct > 0 &&
                ((row.comparison.yoy.deltaPct !== null && row.comparison.yoy.deltaPct < 0) ||
                  (row.comparison.siteAvg.deltaPct !== null && row.comparison.siteAvg.deltaPct < 0));
              return (
                <Link
                  key={row.siteId}
                  href={`/sites/${encodeURIComponent(row.siteName)}?month=${encodeURIComponent(data.selectedMonth)}`}
                  className={`risk-card risk-card--${row.status}`}
                >
                  <div className="risk-card__top">
                    <StatusTag status={row.status} />
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isRecovering && <span className="recovery-indicator">↑ ฟื้นจากเดือนก่อน</span>}
                      <span className="risk-card__yield">{row.monthYieldKwh === null ? "ไม่มีข้อมูล" : `${formatNumber(row.monthYieldKwh)} kWh`}</span>
                    </div>
                  </div>

                  <div className="risk-card__body">
                    <h3>{row.siteName}</h3>
                    <p className="risk-card__caption">
                      {row.capacityKwp === null ? "ยังไม่ระบุกำลังติดตั้ง" : `${formatNumber(row.capacityKwp)} kWp`}
                    </p>
                    <p className="risk-card__reason">{row.reason}</p>
                  </div>

                  <div className="risk-card__meta">
                    <ComparisonBlock label="ปีที่แล้ว (YoY)" comparison={row.comparison.yoy} />
                    <ComparisonBlock label="ค่าเฉลี่ยไซต์" comparison={row.comparison.siteAvg} />
                    <ComparisonBlock label="เดือนก่อน (MoM)" comparison={row.comparison.mom} secondary />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="table-heading" className="section-block">
        <div className="section-head table-head">
          <div>
            <h2 id="table-heading">ตารางรายละเอียดของแต่ละไซต์</h2>
          </div>
          <p className="section-note">เรียง/คลิกหัวตารางเพื่อจัดลำดับไซต์ และคลิกชื่อไซต์เพื่อดูประวัติ</p>
          <div className="table-head-meta">
            <span className="meta-pill">{data.meta.siteCount} ไซต์</span>
            <span className="meta-pill">{monthLabel}</span>
            <span className="meta-pill">{yearLabel}</span>
          </div>
        </div>

        <div className="table-wrap table-wrap--elevated">
          <table className="site-table site-table--pretty">
            <caption className="visually-hidden">รายละเอียดไซต์ทั้งหมดสำหรับเดือนที่เลือก</caption>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isRight = rightAlignedColumnIds.has(header.id);
                    return (
                      <th key={header.id} className={`th ${isRight ? "th--right" : ""}`}>
                        {header.column.getCanSort() ? (
                          <button
                            type="button"
                            className="th-button"
                            onClick={() => header.column.toggleSorting()}
                          >
                            <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                            <span className="th-arrow" aria-hidden>
                              {{ asc: "↑", desc: "↓" }[header.column.getIsSorted() as string] ?? "↕"}
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
                      ? (pctVal === null ? "muted" : pctVal < 0 ? "danger" : pctVal > 0 ? "success" : "")
                      : "";
                    return (
                      <td
                        key={cell.id}
                        className={[isRight ? "num" : "", colorClass].filter(Boolean).join(" ")}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        <summary>อธิบายคำสั้น ๆ</summary>
        <div className="glossary__body">
          <p><strong>เดือนนี้</strong> = ผลผลิตรวมของเดือนที่เลือก</p>
          <p><strong>ปีที่เลือก</strong> = ผลรวมทั้งปีของปีที่เลือกจาก dropdown</p>
          <p><strong>เดือนก่อน</strong> = เทียบกับเดือนที่แล้ว</p>
          <p><strong>ค่าเฉลี่ยไซต์</strong> = เทียบกับค่าเฉลี่ยที่ไซต์นี้เคยทำได้</p>
          <p><strong>ปีที่แล้ว</strong> = เทียบกับเดือนเดียวกันของปีก่อน</p>
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
        {direction} {formatNumber(Math.abs(comparison.deltaAbsKwh))} kWh ({formatSignedPercent(comparison.deltaPct)})
      </span>
      <span className="comparison-row__baseline">ฐาน {formatNumber(comparison.baselineKwh)} kWh</span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  unit,
  note,
  control,
  delta,
}: {
  label: string;
  value: string;
  unit: string;
  note: string;
  control?: React.ReactNode;
  delta?: { abs: number; pct: number } | null;
}) {
  const deltaClass = delta === null || delta === undefined ? null : delta.abs > 0 ? "up" : delta.abs < 0 ? "down" : "flat";
  const deltaDirection = delta === null || delta === undefined ? null : delta.abs > 0 ? "เพิ่มขึ้น" : delta.abs < 0 ? "ลดลง" : "เท่าเดิม";

  return (
    <Card className="summary-card" variant="outlined">
      <div className="summary-card__head">
        <p className="summary-card__label">{label}</p>
        {control}
      </div>
      <Statistic
        value={value === "-" ? "—" : value}
        suffix={<Typography.Text type="secondary" style={{ fontSize: 14 }}>{unit}</Typography.Text>}
        valueStyle={{ fontSize: 28, fontWeight: 700, color: "var(--primary)" }}
      />
      {delta !== null && delta !== undefined && deltaClass !== null && deltaDirection !== null && (
        <p className={`summary-card__delta summary-card__delta--${deltaClass}`}>
          {deltaDirection} {formatNumber(Math.abs(delta.abs))} kWh ({formatSignedPercent(delta.pct)})
        </p>
      )}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{note}</Typography.Text>
    </Card>
  );
}

function AlertBanner({
  attention,
  watch,
  review,
  monitoringRows,
}: {
  attention: number;
  watch: number;
  review: number;
  monitoringRows?: SiteTableRow[];
}) {
  const total = attention + watch + review;
  if (total === 0) return null;

  const isUrgent = attention > 0;
  const parts: string[] = [];
  if (attention > 0) parts.push(`${attention} ตรวจด่วน`);
  if (watch > 0) parts.push(`${watch} เฝ้าระวัง`);
  if (review > 0) parts.push(`${review} พิจารณา`);
  const topSite = monitoringRows?.[0]?.siteName;

  return (
    <div className={`alert-banner ${isUrgent ? "alert-banner--urgent" : "alert-banner--watch"}`} role="alert">
      <strong>{total} ไซต์ต้องตรวจสอบ</strong>
      <span>— {parts.join(", ")}{topSite ? ` · อันดับแรก: ${topSite}` : ""}</span>
    </div>
  );
}

function ImportPanel({
  fileName,
  inferredMonth,
  reportMonth,
  rowCount,
  siteNames,
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
  currentYear,
  points,
  scale,
  hasData,
  insight,
  selectedMonthNumber,
}: {
  currentYear: number | null;
  points: PortfolioComparisonChartPoint[];
  scale: PortfolioChartScale;
  hasData: boolean;
  insight?: PortfolioInsight | null;
  selectedMonthNumber?: number | null;
}) {
  const currentPath = buildChartPath(points, (point) => point.currentYearYieldKwh, scale);
  const previousPath = buildChartPath(points, (point) => point.previousYearSameMonthYieldKwh, scale);
  const currentTitle = currentYear ? `ปีล่าสุด (${formatYearLabel(currentYear)})` : "ปีล่าสุด";
  const insightText = insight && insight.totalMonthsCompared >= 2 ? formatPortfolioInsight(insight) : null;
  const insightClass = !insight || !insightText ? "" :
    insight.monthsAhead >= insight.monthsBehind ? "chart-insight-line--good" : "chart-insight-line--bad";



  return (
    <section className="section-block" aria-labelledby="portfolio-chart-heading">
      <div className="section-head">
        <div>
          <h2 id="portfolio-chart-heading">ผลผลิตรวมทุกไซต์เทียบเดือนเดียวกันปีก่อน</h2>
          {insightText && <p className={`chart-insight-line ${insightClass}`}>{insightText}</p>}
        </div>
        <p className="section-note">เส้นสีม่วงคือ{currentTitle} · เส้นสีเทาอ่อนคือเดือนเดียวกันของปีก่อน</p>
      </div>

      <article className="surface-card portfolio-chart-card">
        {hasData ? (
          <>
            <div className="portfolio-chart__legend" aria-hidden="true">
              <span className="portfolio-chart__legend-item portfolio-chart__legend-item--current">{currentTitle}</span>
              <span className="portfolio-chart__legend-item portfolio-chart__legend-item--previous">เทียบเดือนเดียวกันปีก่อน</span>
            </div>

            <div className="portfolio-chart__plot">
              <svg
                className="portfolio-chart__svg"
                viewBox={`0 0 ${scale.width} ${scale.height}`}
                role="img"
                aria-labelledby="portfolio-chart-title portfolio-chart-desc"
              >
                <title id="portfolio-chart-title">กราฟผลผลิตรวมทุกไซต์รายเดือน</title>
                <desc id="portfolio-chart-desc">
                  กราฟเส้นแสดงผลผลิตรวมทุกไซต์ของปีล่าสุดเทียบกับเดือนเดียวกันของปีก่อนแต่ละเดือน
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
                {/* Y-axis reference labels */}
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
                {/* Selected month highlight — rendered on top of regular dots */}
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
                <caption className="visually-hidden">ตารางสรุปผลผลิตรายเดือน</caption>
                <thead>
                  <tr>
                    <th scope="col">เดือน</th>
                    <th scope="col">{currentTitle}</th>
                    <th scope="col">เทียบเดือนเดียวกันปีก่อน</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.monthNumber}>
                      <th scope="row">{point.monthLabel}</th>
                      <td>{point.currentYearYieldKwh === null ? "ไม่มีข้อมูล" : `${formatNumber(point.currentYearYieldKwh)} kWh`}</td>
                      <td>
                        {point.previousYearSameMonthYieldKwh === null
                          ? "ไม่มีข้อมูล"
                          : `${formatNumber(point.previousYearSameMonthYieldKwh)} kWh`}
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
            <p className="empty-state__text">ยังไม่พบข้อมูลผลผลิตรายเดือนสำหรับเปรียบเทียบ</p>
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

function formatPortfolioInsight(insight: PortfolioInsight): string {
  const total = insight.totalMonthsCompared;
  const avgStr =
    insight.averageDeltaPct !== null
      ? ` (เฉลี่ย ${insight.averageDeltaPct >= 0 ? "+" : ""}${(insight.averageDeltaPct * 100).toFixed(1)}%)`
      : "";
  if (insight.monthsAhead >= insight.monthsBehind) {
    return `ปีนี้อยู่เหนือปีก่อน ${insight.monthsAhead} จาก ${total} เดือน${avgStr}`;
  }
  return `ปีนี้อยู่ต่ำกว่าปีก่อน ${insight.monthsBehind} จาก ${total} เดือน${avgStr}`;
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
            <>
              <Typography.Title level={4}>ยังไม่มีข้อมูล</Typography.Title>
              <Typography.Text type="secondary">ลองเลือกเดือนอื่นหรือรอการนำเข้ารายงาน</Typography.Text>
            </>
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
  return <Typography.Text type="secondary">ไม่มีข้อมูล</Typography.Text>;
}

const STATUS_TAG_CONFIG: Record<string, { color: string; label: string }> = {
  attention: { color: "red", label: statusLabel.attention },
  watch: { color: "gold", label: statusLabel.watch },
  review: { color: "orange", label: statusLabel.review },
  ok: { color: "purple", label: statusLabel.ok },
  "no-data": { color: "default", label: statusLabel["no-data"] },
};

function StatusTag({ status }: { status: string }) {
  const config = STATUS_TAG_CONFIG[status] ?? { color: "default", label: status };
  return <Tag color={config.color}>{config.label}</Tag>;
}

export default SolarDashboard;
