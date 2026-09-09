"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Card, Empty, Skeleton, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { buildSiteDetailView, type SiteDetailChartSection, type SiteDetailView } from "@/src/lib/site-detail-view";
import { getRiskBadgePresentation, getSiteDetailKpiLabel } from "@/src/lib/site-detail-presentation";
import { type SiteHistoryRow } from "@/src/lib/site-history";

type SiteHistoryResponse = {
  ok: boolean;
  site: string;
  rows: SiteHistoryRow[];
  noData?: boolean;
  error?: string;
};

export function SiteDetail({
  siteName,
  initialMonth = "",
  initialYear = null,
}: {
  siteName: string;
  initialMonth?: string;
  initialYear?: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<SiteHistoryResponse | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [selectedYear, setSelectedYear] = useState<number | null>(initialYear);
  const [loading, setLoading] = useState(true);
  const [missingRequestedMonth, setMissingRequestedMonth] = useState<string | null>(null);
  const requestedMonthRef = useRef(initialMonth);
  const dashboardScope = searchParams.get("scope") === "history" ? "history" : "source";
  const [error, setError] = useState<string | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const historyRequestRef = useRef(0);

  const loadHistory = useCallback(async () => {
    historyAbortRef.current?.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;
    const requestId = historyRequestRef.current + 1;
    historyRequestRef.current = requestId;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/sites/history?site=${encodeURIComponent(siteName)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json()) as SiteHistoryResponse;

      if (requestId !== historyRequestRef.current) return;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "ไม่สามารถโหลดรายละเอียดไซต์ได้");
      }

      setData(payload);
      const requested = requestedMonthRef.current;
      setMissingRequestedMonth(requested && !payload.rows.some(row => row.reportMonth === requested) ? requested : null);
    } catch (fetchError) {
      if (controller.signal.aborted || requestId !== historyRequestRef.current) return;
      setError(fetchError instanceof Error ? fetchError.message : "ไม่สามารถโหลดรายละเอียดไซต์ได้");
    } finally {
      if (requestId === historyRequestRef.current) {
        setLoading(false);
      }
    }
  }, [siteName]);

  useEffect(() => {
    void loadHistory();
    return () => {
      historyAbortRef.current?.abort();
    };
  }, [loadHistory]);

  useEffect(() => {
    if (!data) return;

    const query = new URLSearchParams(searchParams.toString());
    if (missingRequestedMonth || selectedMonth) query.set("month", missingRequestedMonth || selectedMonth);
    else query.delete("month");

    if (selectedYear !== null) query.set("year", String(selectedYear));
    else query.delete("year");

    const nextUrl = query.toString() ? `${pathname}?${query.toString()}` : pathname;
    const currentQuery = searchParams.toString();
    const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;

    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [data, pathname, router, selectedMonth, selectedYear, missingRequestedMonth, searchParams]);

  const view = useMemo<SiteDetailView | null>(() => {
    if (!data) return null;
    return buildSiteDetailView(data.rows, {
      requestedMonth: selectedMonth,
      selectedYear,
      backHref: `/?scope=${dashboardScope}${selectedMonth ? `&month=${encodeURIComponent(selectedMonth)}` : ""}`,
    });
  }, [data, selectedMonth, selectedYear, dashboardScope]);

  useEffect(() => {
    if (!view) return;
    setSelectedMonth((current) => (current === view.selectedMonth ? current : view.selectedMonth));
  }, [view?.selectedMonth, view?.selectedYear, view?.totalMonths]);

  const backMonth = missingRequestedMonth || view?.selectedMonth || initialMonth;
  const resolvedBackHref = `/?scope=${dashboardScope}${backMonth ? `&month=${encodeURIComponent(backMonth)}` : ""}`;

  if (loading) {
    return <DetailLoading siteName={siteName} />;
  }

  if (error) {
    return <DetailError siteName={siteName} message={error} onRetry={loadHistory} />;
  }

  if (!view || view.totalMonths === 0) {
    return <EmptyDetail siteName={siteName} backHref={resolvedBackHref} />;
  }

  if (view.selectedYear !== null && view.activeRows.length === 0) {
    return (
      <main className="dashboard-shell detail-page">
        <section className="surface-card empty-state">
          <Link href={resolvedBackHref} className="back-link">
            ← กลับหน้าหลัก
          </Link>
          <h1>{view.siteName || siteName}</h1>
          <p className="no-data">ยังไม่มีข้อมูลสำหรับปีที่เลือก</p>
          <button type="button" className="primary-button" onClick={() => setSelectedYear(null)}>
            ดูทุกปี
          </button>
        </section>
      </main>
    );
  }

  const monthOptions = view.activeRows.map((row) => row.reportMonth);
  const handleYearTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    event.preventDefault();
    const lastIndex = view.yearTabs.length - 1;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? lastIndex
        : event.key === "ArrowRight"
          ? Math.min(index + 1, lastIndex)
          : Math.max(index - 1, 0);

    setSelectedYear(view.yearTabs[nextIndex]?.value ?? null);
    setMissingRequestedMonth(null);
    requestedMonthRef.current = "";
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  };

  return (
    <main className="dashboard-shell detail-page">
      {missingRequestedMonth && (
        <Alert type="info" showIcon title={`ไม่มีรายงาน ${formatMonthThai(missingRequestedMonth)} สำหรับไซต์นี้`} description={`กำลังแสดงรายงาน ${formatMonthThai(view.selectedMonth)} ที่มีอยู่ คุณเลือกดูเดือนอื่นจากประวัติได้`} />
      )}
      <section className="surface-card hero-card detail-hero">
        <div className="hero-copy">
          <Link href={resolvedBackHref} className="back-link">
            ← กลับหน้าหลัก
          </Link>
          <h1>{view.siteName || siteName}</h1>
          <p className="hero-subtitle">ติดตามไฟฟ้าที่ผลิตได้ การนำไปใช้ และข้อมูลที่ควรตรวจสอบ</p>
        </div>

        <div className="detail-hero__right">
          {view.selectedRow && (() => {
            const riskPresentation = getRiskBadgePresentation(view.selectedRow.riskLevel);
            return (
              <div className="detail-hero-risk">
                <span className="detail-summary-meta__label">สถานะเดือนที่เลือก</span>
                {view.selectedRow.inverterYieldKwh === null ? <span className="status-chip status-chip--no-data">ข้อมูลไม่ครบ</span> : <span className={`risk-badge ${riskPresentation.className}`}>{riskPresentation.label}</span>}
              </div>
            );
          })()}
          <div className="detail-summary-meta">
            <div>
              <span className="detail-summary-meta__label">ช่วงข้อมูล</span>
              <strong>
                {formatMonthThai(view.firstMonth)} → {formatMonthThai(view.latestMonth)}
              </strong>
            </div>
            <div>
              <span className="detail-summary-meta__label">จำนวนเดือน</span>
              <strong>{view.totalMonths} เดือน</strong>
            </div>
            <div>
              <span className="detail-summary-meta__label">ขนาดระบบที่มีข้อมูล (kWp)</span>
              <strong>{view.capacityKwp === null ? "ยังไม่มีข้อมูล" : `${formatNumber(view.capacityKwp)} kWp`}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-card detail-tabs-card">
        <div className="section-head compact">
          <div>
            <h2>เลือกดูข้อมูลรายปี</h2>
          </div>
          <p className="section-note">เลือกปีและเดือนของรายงานที่ต้องการดู</p>
        </div>
        <div className="year-tabs" role="tablist" aria-label="เลือกปีที่ต้องการดู">
          {view.yearTabs.map((tab, index) => (
            <button
              key={tab.value === null ? "ทุกปี" : `พ.ศ. ${tab.value + 543}`}
              type="button"
              role="tab"
              aria-selected={tab.active}
              tabIndex={tab.active ? 0 : -1}
              className={`year-tab ${tab.active ? "year-tab--active" : ""}`}
              onClick={() => { setMissingRequestedMonth(null); requestedMonthRef.current = ""; setSelectedYear(tab.value); }}
              onKeyDown={(event) => handleYearTabKeyDown(event, index)}
            >
              {tab.value === null ? "ทุกปี" : `พ.ศ. ${tab.value + 543}`}
            </button>
          ))}
        </div>
        <div className="detail-toolbar-row">
          <label className="field detail-month-field">
            <span>เดือนที่เลือก</span>
            <select value={view.selectedMonth} onChange={(event) => { setMissingRequestedMonth(null); requestedMonthRef.current = ""; setSelectedMonth(event.target.value); }}>
              {monthOptions.slice().reverse().map((month) => (
                <option key={month} value={month}>
                  {formatMonthThai(month)}
                </option>
              ))}
            </select>
          </label>
          <div className="detail-toolbar-row__note">
            <span>แสดง {view.activeRows.length} เดือนในมุมมองปัจจุบัน</span>
            <span>{view.selectedYear === null ? "กำลังดูทุกปี" : `กำลังดูปี พ.ศ. ${view.selectedYear + 543}`}</span>
          </div>
        </div>
      </section>

      <section className="surface-card summary-card detail-kpi-card">
        <div className="section-head compact">
          <div>
            <h2>สรุปค่าเดือนที่เลือก</h2>
          </div>
          <span className="month-pill">{formatMonthThai(view.selectedMonth)}</span>
        </div>

        <div className="detail-kpi-grid">
          <article className="detail-kpi detail-kpi--primary">
            <p className="detail-kpi__label">ไฟฟ้าที่ผลิตได้</p>
            <strong className="detail-kpi__value">{formatNumber(view.selectedRow?.inverterYieldKwh ?? null)} <small>หน่วย</small></strong>
            <p className="detail-kpi__note">1 หน่วย = 1 kWh</p>
          </article>
          <article className="detail-kpi detail-kpi--primary">
            <p className="detail-kpi__label">ไฟโซลาร์ที่นำไปใช้เอง</p>
            <strong className="detail-kpi__value">{formatNumber(view.selectedRow?.selfConsumptionKwh ?? null)} <small>หน่วย</small></strong>
            <p className="detail-kpi__note">ไฟที่ผลิตแล้วใช้ภายในไซต์</p>
          </article>
          <article className="detail-kpi detail-kpi--primary">
            <p className="detail-kpi__label">สัดส่วนใช้เองตามรายงาน</p>
            <strong className="detail-kpi__value">{formatPercent(view.selectedRow?.selfConsumptionRate ?? null)}</strong>
            <p className="detail-kpi__note">ค่าร้อยละที่ระบุในรายงานต้นทาง</p>
          </article>
        </div>
      </section>

      {view.selectedRow?.inverterYieldKwh === null && (
        <Alert type="info" showIcon title="ยังไม่มีค่าผลิตไฟในรายงานเดือนนี้" description="ตรวจสอบความครบถ้วนของรายงานและข้อมูลมิเตอร์ ก่อนประเมินการทำงานของระบบ" />
      )}
      {view.selectedRow?.energyBalanceGapKwh != null && Math.abs(view.selectedRow.energyBalanceGapKwh) > 1 && (
        <Alert type="warning" showIcon title="ตัวเลขในรายงานควรตรวจทาน" description={`ค่าผลิตไฟต่างจากผลรวมไฟใช้เองและไฟส่งออก ${formatNumber(Math.abs(view.selectedRow.energyBalanceGapKwh))} หน่วย ตรวจสอบรายงานและช่วงเวลาของมิเตอร์ก่อนสรุปผล`} />
      )}
      {view.selectedRow && view.selectedRow.inverterYieldKwh !== null && (
        <section className="surface-card detail-risk-card">
          <div className="section-head compact">
            <div>
              <h2>สิ่งที่ควรตรวจสอบและคำแนะนำ</h2>
            </div>
            {(() => {
              const riskPresentation = getRiskBadgePresentation(view.selectedRow.riskLevel);
              return (
                <div className={`risk-score-badge ${riskPresentation.className}`}>
                  <span>คะแนนติดตาม</span>
                  <strong>{formatNumber(view.selectedRow.riskScore)}</strong>
                  <em>{riskPresentation.label}</em>
                </div>
              );
            })()}
          </div>

          <div className="risk-columns">
            <div>
              <h3 className="detail-subhead">เหตุผล</h3>
              {view.selectedRow.reasons.length ? (
                <ul className="bullet-list">
                  {view.selectedRow.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="no-data">ยังไม่มีเหตุผลประกอบ</p>
              )}
            </div>
            <div>
              <h3 className="detail-subhead">คำแนะนำ</h3>
              {view.selectedRow.actions.length ? (
                <ul className="action-list">
                  {view.selectedRow.actions.map((action) => (
                    <li key={action} className="action-item">{action}</li>
                  ))}
                </ul>
              ) : (
                <p className="no-data">ยังไม่มีคำแนะนำ</p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="section-block">
        <div className="section-head">
          <div>
            <h2>แนวโน้มไฟฟ้าที่ผลิตได้</h2>
          </div>
        </div>

        <div className="chart-stack">
          {view.chartSections.filter(section => section.key === "yield").map((section) => (
            <TrendChart
              key={section.key}
              section={section}
              selectedYear={view.selectedYear}
              insight={computeChartInsight(section)}
            />
          ))}
        </div>
      </section>

      <details className="technical-details">
        <summary>ดูข้อมูลเชิงเทคนิคเพิ่มเติม</summary>
        <p className="section-note">ใช้ตรวจผลผลิตต่อขนาดระบบ กำลังสูงสุด และความสอดคล้องของค่ามิเตอร์</p>
        <div className="detail-kpi-grid">
          {view.kpis.filter(kpi => !["inverterYield", "selfConsumptionRate"].includes(kpi.key)).map(kpi => (
            <article key={kpi.key} className="detail-kpi detail-kpi--secondary">
              <p className="detail-kpi__label">{getSiteDetailKpiLabel(kpi).primary}</p>
              <strong className="detail-kpi__value">{formatMetricValue(kpi.value, kpi.unit)}</strong>
              <p className="detail-kpi__note">{kpi.note}</p>
            </article>
          ))}
        </div>
        <div className="chart-stack">
          {view.chartSections.filter(section => section.key !== "yield").map(section => (
            <TrendChart key={section.key} section={section} selectedYear={view.selectedYear} insight={computeChartInsight(section)} />
          ))}
        </div>
      </details>

      <section className="section-block">
        <div className="section-head">
          <div>
            <h2>ตารางประวัติรายเดือน</h2>
          </div>
        </div>

        <div className="table-wrap table-wrap--elevated">
          <table className="site-table site-table--pretty detail-history-table">
            <thead>
              <tr>
                <th>เดือน</th>
                <th>ไฟฟ้าที่ผลิตได้ <small>(หน่วย)</small></th>
                <th>ขนาดระบบ <small>(kWp)</small></th>
                <th>ผลผลิตต่อขนาดระบบ <small>(kWh/kWp)</small></th>
                <th>อัตรากำลังสูงสุด</th>
                <th>สัดส่วนใช้เอง</th>
                <th>ส่งเข้าระบบไฟฟ้า</th>
                <th>ซื้อจากระบบไฟฟ้า</th>
                <th>ใช้ไฟรวม</th>
                <th>ส่วนต่างพลังงาน</th>
                <th>ส่วนต่างการใช้ไฟ</th>
                <th>สถานะติดตาม</th>
              </tr>
            </thead>
            <tbody>
              {view.historyRows.map((row) => (
                <tr key={row.reportMonth} data-selected={row.reportMonth === view.selectedMonth ? "true" : undefined}>
                  <td>
                    <strong>{formatMonthThai(row.reportMonth)}</strong>
                  </td>
                  <td className="num">{formatNumber(row.inverterYieldKwh)} kWh</td>
                  <td className="num">{formatNumber(row.capacityKwp)} kWp</td>
                  <td className="num">{formatMetricValue(row.specificEnergy, "kWh/kWp")}</td>
                  <td className="num">{formatMetricValue(row.performanceRatio, "ratio")}</td>
                  <td className="num">{formatPercent(row.selfConsumptionRate)}</td>
                  <td className="num">{formatNumber(row.exportKwh)} kWh</td>
                  <td className="num">{formatNumber(row.importKwh)} kWh</td>
                  <td className="num">{formatNumber(row.consumptionKwh)} kWh</td>
                  <td className="num">{formatSignedNumber(row.energyBalanceGapKwh)} kWh</td>
                  <td className="num">{formatSignedNumber(row.loadBalanceGapKwh)} kWh</td>
                  <td>
                    <div className="detail-history-risk">
                      {(() => {
                        const riskPresentation = getRiskBadgePresentation(row.riskLevel);
                        return row.inverterYieldKwh === null ? <span className="status-chip status-chip--no-data">ข้อมูลไม่ครบ</span> : <span className={`risk-badge ${riskPresentation.className}`}>{riskPresentation.label}</span>;
                      })()}
                      <span className="detail-history-risk__score">{formatNumber(row.riskScore)}</span>
                      {row.reasons.length ? <span className="detail-history-risk__reason">{row.reasons.join(" • ")}</span> : <span className="muted">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function computeChartInsight(section: SiteDetailChartSection): string | null {
  if (section.key === "yield") {
    const yearTotals = section.series
      .map((s) => ({
        year: s.year,
        total: s.points.reduce((sum, p) => sum + (p.value ?? 0), 0),
      }))
      .filter((y) => y.total > 0);
    if (yearTotals.length < 2) return null;
    const best = yearTotals.reduce((max, y) => (y.total > max.total ? y : max));
    const latest = yearTotals[yearTotals.length - 1];
    if (!best || !latest || best.total === 0) return null;
    const pct = (latest.total / best.total) * 100;
    const bestKwh = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(Math.round(best.total));
    return `ยอดรวมสูงสุดที่มีข้อมูล: พ.ศ. ${best.year + 543} (${bestKwh} หน่วย) · พ.ศ. ${latest.year + 543} คิดเป็น ${pct.toFixed(1)}% ของยอดนั้น (จำนวนเดือนที่มีข้อมูลอาจต่างกัน)`;
  }

  if (section.key === "performance") {
    const lowMonths = section.series
      .flatMap((s) => s.points)
      .filter((p) => p.value !== null && p.value < 0.65);
    if (lowMonths.length === 0) return null;
    return `พบค่าต่ำกว่า 0.65 ใน ${lowMonths.length} เดือน`;
  }

  if (section.key === "selfConsumption") {
    const dataPoints = section.series.flatMap((s) => s.points).filter((p) => p.value !== null);
    if (dataPoints.length === 0) return null;
    const highCount = dataPoints.filter((p) => (p.value ?? 0) > 0.9).length;
    if (highCount / dataPoints.length > 0.7) {
      return "ข้อมูลส่วนใหญ่แสดงว่าใช้ไฟโซลาร์เองเกิน 90%";
    }
    return null;
  }

  return null;
}

function TrendChart({ section, selectedYear, insight }: { section: SiteDetailChartSection; selectedYear: number | null; insight?: string | null }) {
  const chartTitle = { yield: "ไฟฟ้าที่ผลิตได้รายเดือน", performance: "อัตรากำลังสูงสุดเทียบขนาดระบบ", selfConsumption: "สัดส่วนไฟโซลาร์ที่นำไปใช้เอง" }[section.key];
  const width = 760;
  const height = 240;
  const padding = { top: 16, right: 18, bottom: 34, left: 42 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const values = section.series.flatMap((series) => series.points.map((point) => point.value).filter((value): value is number => value !== null));
  const max = values.length ? Math.max(...values) : 1;
  const min = 0;
  const months = [1, 3, 5, 7, 9, 11, 12];
  const activeSeries = selectedYear === null ? section.series : section.series.filter((series) => series.year === selectedYear);

  return (
    <article className="surface-card chart-card">
      <div className="chart-card__head">
        <div>
          <p className="chart-card__eyebrow">{section.unit}</p>
          <h3>{chartTitle}</h3>
          {insight ? <p className="chart-insight">{insight}</p> : null}
          <p className="chart-card__desc">{section.description}</p>
        </div>
        <div className="chart-legend">
          {activeSeries.map((series) => (
            <span key={series.year} className="chart-legend__item">
              <span className="chart-legend__swatch" style={{ backgroundColor: series.color }} />
              พ.ศ. {series.year + 543}
            </span>
          ))}
        </div>
      </div>

      {activeSeries.length === 0 ? (
        <p className="no-data">ยังไม่มีข้อมูลสำหรับปีที่เลือก</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" role="img" aria-label={chartTitle}>
          <g>
            {months.map((monthNumber) => {
              const x = padding.left + ((monthNumber - 1) / 11) * innerWidth;
              return <line key={monthNumber} x1={x} y1={padding.top} x2={x} y2={padding.top + innerHeight} className="trend-chart__grid" />;
            })}
          </g>

          <g>
            {activeSeries.map((series) => {
              const path = buildSeriesPath(series.points, padding, innerWidth, innerHeight, min, max);
              return (
                <g key={series.year}>
                  {path ? <path d={path} fill="none" stroke={series.color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /> : null}
                  {series.points.map((point) => {
                    if (point.value === null) return null;
                    const xy = pointToXY(point, padding, innerWidth, innerHeight, min, max);
                    if (!xy) return null;
                    const { x, y } = xy;
                    return <circle key={`${series.year}-${point.reportMonth}`} cx={x} cy={y} r={3.6} fill={series.color} />;
                  })}
                </g>
              );
            })}
          </g>

          <g>
            {months.map((monthNumber) => {
              const x = padding.left + ((monthNumber - 1) / 11) * innerWidth;
              return (
                <text key={monthNumber} x={x} y={height - 10} className="trend-chart__axis-label" textAnchor="middle">
                  {String(monthNumber).padStart(2, "0")}
                </text>
              );
            })}
          </g>

          <g>
            {Array.from({ length: 5 }, (_, index) => {
              const ratio = index / 4;
              const y = padding.top + innerHeight - ratio * innerHeight;
              const value = min + ratio * (max - min);
              return (
                <g key={index}>
                  <line x1={padding.left} y1={y} x2={padding.left + innerWidth} y2={y} className="trend-chart__grid trend-chart__grid--horizontal" />
                  <text x={12} y={y + 4} className="trend-chart__axis-label">
                    {formatChartAxisValue(section.unit, value)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </article>
  );
}

function buildSeriesPath(
  points: SiteDetailChartSection["series"][number]["points"],
  padding: { top: number; right: number; bottom: number; left: number },
  innerWidth: number,
  innerHeight: number,
  min: number,
  max: number,
): string | null {
  const segments: string[] = [];
  let current = "";

  points.forEach((point) => {
    if (point.value === null || point.monthNumber === null) {
      if (current) {
        segments.push(current);
        current = "";
      }
      return;
    }

    const { x, y } = pointToXY(point, padding, innerWidth, innerHeight, min, max)!;
    current += current ? ` L ${x} ${y}` : `M ${x} ${y}`;
  });

  if (current) segments.push(current);
  if (!segments.length) return null;
  return segments.join(" ");
}

function pointToXY(
  point: SiteDetailChartSection["series"][number]["points"][number],
  padding: { top: number; right: number; bottom: number; left: number },
  innerWidth: number,
  innerHeight: number,
  min: number,
  max: number,
) {
  if (point.monthNumber === null) return null;
  const x = padding.left + ((point.monthNumber - 1) / 11) * innerWidth;
  const range = max - min || 1;
  const normalized = (point.value ?? min) - min;
  const y = padding.top + innerHeight - (normalized / range) * innerHeight;
  return { x, y };
}

function formatChartAxisValue(unit: string, value: number) {
  if (unit === "%") return `${Math.round(value * 100)}%`;
  if (unit === "ratio") return formatNumber(value, 2);
  return formatNumber(value, 0);
}

function formatMonthThai(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(monthNumber)) return month;
  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "short", year: "numeric" }).format(date);
}

function formatNumber(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: digits, minimumFractionDigits: digits === 0 || Number.isInteger(value) ? 0 : 1 }).format(value);
}

function formatMetricValue(value: number | null, unit: string) {
  if (value === null) return "—";
  if (unit === "%") return `${formatNumber(value * 100, 1)}%`;
  if (unit === "ratio") return formatNumber(value, 2);
  return formatNumber(value, 1);
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${formatNumber(value * 100, 1)}%`;
}

function formatSignedNumber(value: number | null) {
  if (value === null) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value, 1)}`;
}

function DetailLoading({ siteName }: { siteName: string }) {
  return (
    <main className="dashboard-shell detail-page">
      <Card className="hero-card" role="status" aria-live="polite">
        <Skeleton active title={{ width: "50%" }} paragraph={{ rows: 3 }} />
        <Typography.Text type="secondary">กำลังโหลดข้อมูลไซต์... {siteName}</Typography.Text>
      </Card>
    </main>
  );
}

function DetailError({ siteName, message, onRetry }: { siteName: string; message: string; onRetry: () => void }) {
  return (
    <main className="dashboard-shell detail-page">
      <Card className="empty-state">
        <Link href="/" className="back-link">← กลับหน้าหลัก</Link>
        <Typography.Title level={3} style={{ marginTop: 12 }}>{siteName}</Typography.Title>
        <Alert type="error" showIcon message={message} style={{ marginBottom: 16 }} />
        <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
          ลองใหม่
        </Button>
      </Card>
    </main>
  );
}

function EmptyDetail({ siteName, backHref }: { siteName: string; backHref: string }) {
  return (
    <main className="dashboard-shell detail-page">
      <Card className="empty-state">
        <Link href={backHref} className="back-link">← กลับหน้าหลัก</Link>
        <Typography.Title level={3} style={{ marginTop: 12 }}>{siteName}</Typography.Title>
        <Empty description="ยังไม่มีข้อมูลประวัติของไซต์นี้" />
      </Card>
    </main>
  );
}
