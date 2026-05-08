"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Card, Empty, Skeleton, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { buildSiteDetailView, type SiteDetailChartSection, type SiteDetailView } from "@/src/lib/site-detail-view";
import { getRiskBadgePresentation, getSiteDetailKpiLabel, getKpiTier } from "@/src/lib/site-detail-presentation";
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
    if (selectedMonth) query.set("month", selectedMonth);
    else query.delete("month");

    if (selectedYear !== null) query.set("year", String(selectedYear));
    else query.delete("year");

    const nextUrl = query.toString() ? `${pathname}?${query.toString()}` : pathname;
    const currentQuery = searchParams.toString();
    const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;

    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [data, pathname, router, selectedMonth, selectedYear]);

  const view = useMemo<SiteDetailView | null>(() => {
    if (!data) return null;
    return buildSiteDetailView(data.rows, {
      requestedMonth: selectedMonth,
      selectedYear,
      backHref: selectedMonth ? `/?month=${encodeURIComponent(selectedMonth)}` : "/",
    });
  }, [data, selectedMonth, selectedYear]);

  useEffect(() => {
    if (!view) return;
    setSelectedMonth((current) => (current === view.selectedMonth ? current : view.selectedMonth));
  }, [view?.selectedMonth, view?.selectedYear, view?.totalMonths]);

  const resolvedBackHref = view?.selectedMonth ? `/?month=${encodeURIComponent(view.selectedMonth)}` : initialMonth ? `/?month=${encodeURIComponent(initialMonth)}` : "/";

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
  };

  return (
    <main className="dashboard-shell detail-page">
      <section className="surface-card hero-card detail-hero">
        <div className="hero-copy">
          <Link href={resolvedBackHref} className="back-link">
            ← กลับหน้าหลัก
          </Link>
          <h1>{view.siteName || siteName}</h1>
          <p className="hero-subtitle">ดูสรุปเดือนที่เลือก เหตุผลความเสี่ยง และแนวโน้มรายปีก่อนลงรายละเอียดในตาราง</p>
        </div>

        <div className="detail-hero__right">
          {view.selectedRow && (() => {
            const riskPresentation = getRiskBadgePresentation(view.selectedRow.riskLevel);
            return (
              <div className="detail-hero-risk">
                <span className="detail-summary-meta__label">สถานะเดือนที่เลือก</span>
                <span className={`risk-badge ${riskPresentation.className}`}>{riskPresentation.label}</span>
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
              <span className="detail-summary-meta__label">กำลังติดตั้งล่าสุด</span>
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
          <p className="section-note">สลับปีเพื่อดูชุดข้อมูลประวัติเดียวกันโดยไม่เปลี่ยนบริบทของไซต์</p>
        </div>
        <div className="year-tabs" role="tablist" aria-label="เลือกปีที่ต้องการดู">
          {view.yearTabs.map((tab, index) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={tab.active}
              tabIndex={tab.active ? 0 : -1}
              className={`year-tab ${tab.active ? "year-tab--active" : ""}`}
              onClick={() => setSelectedYear(tab.value)}
              onKeyDown={(event) => handleYearTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="detail-toolbar-row">
          <label className="field detail-month-field">
            <span>เดือนที่เลือก</span>
            <select value={view.selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              {monthOptions.slice().reverse().map((month) => (
                <option key={month} value={month}>
                  {formatMonthThai(month)}
                </option>
              ))}
            </select>
          </label>
          <div className="detail-toolbar-row__note">
            <span>แสดง {view.activeRows.length} เดือนในมุมมองปัจจุบัน</span>
            <span>{view.selectedYear === null ? "กำลังดูทุกปี" : `กำลังดูปี ${view.selectedYear}`}</span>
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
          {view.kpis.map((kpi) => {
            const label = getSiteDetailKpiLabel(kpi);

            return (
              <article key={kpi.key} className={`detail-kpi detail-kpi--${getKpiTier(kpi.key)}`}>
                <p className="detail-kpi__label">{label.primary}</p>
                {label.secondary ? <p className="detail-kpi__sub">{label.secondary}</p> : null}
                <strong className="detail-kpi__value">{formatMetricValue(kpi.value, kpi.unit)}</strong>
                <p className="detail-kpi__note">{kpi.note}</p>
              </article>
            );
          })}
        </div>
      </section>

      {view.selectedRow && (
        <section className="surface-card detail-risk-card">
          <div className="section-head compact">
            <div>
              <h2>การวินิจฉัยและคำแนะนำ</h2>
            </div>
            {(() => {
              const riskPresentation = getRiskBadgePresentation(view.selectedRow.riskLevel);
              return (
                <div className={`risk-score-badge ${riskPresentation.className}`}>
                  <span>Risk score</span>
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
            <h2>กราฟแนวโน้มทุกปี</h2>
          </div>
        </div>

        <div className="chart-stack">
          {view.chartSections.map((section) => (
            <TrendChart key={section.key} section={section} selectedYear={view.selectedYear} />
          ))}
        </div>
      </section>

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
                <th>ผลผลิต <small>(Inverter yield)</small></th>
                <th>กำลัง <small>(Capacity)</small></th>
                <th>ผลผลิตต่อกำลัง <small>(Specific energy)</small></th>
                <th>ประสิทธิภาพ <small>(Peak ratio)</small></th>
                <th>ใช้เอง <small>(Self-consumption)</small></th>
                <th>ส่งออก <small>(Export)</small></th>
                <th>นำเข้า <small>(Import)</small></th>
                <th>ใช้รวม <small>(Consumption)</small></th>
                <th>ช่องว่างพลังงาน <small>(Energy gap)</small></th>
                <th>ช่องว่างโหลด <small>(Load gap)</small></th>
                <th>ความเสี่ยง <small>(Risk)</small></th>
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
                        return <span className={`risk-badge ${riskPresentation.className}`}>{riskPresentation.label}</span>;
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

function TrendChart({ section, selectedYear }: { section: SiteDetailChartSection; selectedYear: number | null }) {
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
  const insight = buildChartInsight(section);

  return (
    <article className="surface-card chart-card">
      <div className="chart-card__head">
        <div>
          <p className="chart-card__eyebrow">{section.unit}</p>
          <h3>{section.title}</h3>
          <p className="chart-card__desc">{section.description}</p>
          {insight ? <p className="chart-insight">{insight}</p> : null}
        </div>
        <div className="chart-legend">
          {activeSeries.map((series) => (
            <span key={series.year} className="chart-legend__item">
              <span className="chart-legend__swatch" style={{ backgroundColor: series.color }} />
              {series.label}
            </span>
          ))}
        </div>
      </div>

      {activeSeries.length === 0 ? (
        <p className="no-data">ยังไม่มีข้อมูลสำหรับปีที่เลือก</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" role="img" aria-label={section.title}>
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

function buildChartInsight(section: SiteDetailChartSection): string | null {
  if (section.key === "yield") return buildYieldInsight(section.series);
  if (section.key === "performance") return buildPeakRatioInsight(section.series);
  if (section.key === "selfConsumption") return buildSelfConsumptionInsight(section.series);
  return null;
}

function buildYieldInsight(series: SiteDetailChartSection["series"]): string | null {
  const yearsWithData = series.filter((s) => s.points.some((p) => p.value !== null));
  if (yearsWithData.length < 2) return null;

  const yearTotals = yearsWithData.map((s) => ({
    year: s.year,
    total: s.points.reduce((sum, p) => sum + (p.value ?? 0), 0),
  }));

  const bestYear = yearTotals.reduce((best, y) => (y.total > best.total ? y : best));
  const latestYear = yearTotals[yearTotals.length - 1];

  if (latestYear.year === bestYear.year) {
    return `ปีที่ดีที่สุด: ${bestYear.year} (${formatNumber(bestYear.total, 0)} kWh) — ปีล่าสุดดีที่สุด`;
  }

  const pct = bestYear.total > 0 ? (latestYear.total / bestYear.total) * 100 : null;
  return `ปีที่ดีที่สุด: ${bestYear.year} (${formatNumber(bestYear.total, 0)} kWh) — ปีล่าสุด ${pct !== null ? formatNumber(pct, 1) + "%" : "—"} เทียบค่าสูงสุด`;
}

function buildPeakRatioInsight(series: SiteDetailChartSection["series"]): string | null {
  const lowCount = series.flatMap((s) => s.points).filter((p) => p.value !== null && p.value < 0.65).length;
  if (lowCount === 0) return null;
  return `พบค่าต่ำกว่า 0.65 ใน ${lowCount} เดือน`;
}

function buildSelfConsumptionInsight(series: SiteDetailChartSection["series"]): string | null {
  const validPoints = series.flatMap((s) => s.points).filter((p) => p.value !== null);
  if (validPoints.length < 3) return null;
  if (!validPoints.every((p) => (p.value ?? 0) > 0.9)) return null;
  return "ใช้ไฟเองสูงตลอด — ตรวจ export meter";
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
