"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ClipboardCheck,
  Copy,
  Database,
  FileText,
  Info,
  LayoutDashboard,
  Search,
  Sun,
  TriangleAlert,
  Zap,
  Upload,
  CircleHelp,
} from "lucide-react";
import {
  type Dashboard,
  type Plant,
  rollingSeries,
  number,
  monthLabel,
  legacySignal,
  selectPlants,
  shiftMonth,
  deltaPercent,
  percentLabel,
  signedNumber,
} from "@/src/lib/prototype-model";
import ComparisonChart, {
  type ComparisonChartPoint,
  cohortToChartPoints,
} from "./comparison-chart";
import AiAnalysis from "./ai-analysis";
import MaintenanceHistory from "./maintenance-history";
import MonthlyUpload from "./monthly-upload";
import InspectionTracker from "./inspection-tracker";
import type { SiteHistoryRow } from "@/src/lib/site-history";

const menu = [
  { id: "overview", label: "ภาพรวม", icon: LayoutDashboard },
  { id: "sites", label: "ไซต์ทั้งหมด", icon: Building2 },
  { id: "checks", label: "รายการตรวจสอบ", icon: ClipboardCheck },
  { id: "reports", label: "รายงานและข้อมูล", icon: FileText },
];
export default function Prototype() {
  const router = useRouter(),
    pathname = usePathname(),
    search = useSearchParams();
  const view = search.get("view") || "overview",
    requested = search.get("month") || "",
    scope = search.get("scope") === "history" ? "history" : "source",
    query = search.get("q") || "",
    filter = search.get("filter") || "all",
    site = search.get("site");
  const [railOpen, setRailOpen] = useState(false);
  const [data, setData] = useState<Dashboard | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [readAt, setReadAt] = useState<string>("");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    fetch(
      `/api/dashboard/latest?scope=${scope}&month=${encodeURIComponent(requested)}`,
      { signal: c.signal, cache: "no-store" },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.ok)
          throw new Error("โหลดข้อมูลรายเดือนไม่สำเร็จ กรุณาลองอีกครั้ง");
        if (c.signal.aborted) return;
        setData(d);
        setReadAt(
          new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }),
        );
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [requested, scope, reload]);
  const month = requested || data?.selectedMonth || "";
  const mismatch = !!(requested && data && data.selectedMonth !== requested);
  function href(changes: Record<string, string | null>) {
    const p = new URLSearchParams(search.toString());
    if ("q" in changes || "filter" in changes || "scope" in changes)
      p.delete("page");
    if (month) p.set("month", month);
    p.set("scope", scope);
    Object.entries(changes).forEach(([k, v]) =>
      v === null ? p.delete(k) : p.set(k, v),
    );
    return `${pathname}?${p}`;
  }
  function change(changes: Record<string, string | null>) {
    router.push(href(changes), { scroll: false });
  }
  const plants = mismatch ? [] : data?.plants || [],
    missing = data?.meta.missingYieldCount || 0,
    signals = plants.filter(legacySignal);
  const rows = selectPlants(
    view === "checks"
      ? plants.filter((p) => p.inverterYieldKwh === null || legacySignal(p))
      : plants,
    query,
    filter,
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / 12));
  const pageNumber = Math.min(
    pageCount,
    Math.max(1, Number(search.get("page")) || 1),
  );
  const selected = plants.find((p) => p.siteName === site);
  // Prefer the cohort series: it states how many sites back each month and
  // which sites are comparable year over year. Fall back to raw totals only
  // when the API has not supplied it, and say so in the scope note.
  const cohortAvailable = !!data?.cohortComparisonSeries?.length;
  const chart: ComparisonChartPoint[] = useMemo(() => {
    if (data?.cohortComparisonSeries?.length)
      return cohortToChartPoints(data.cohortComparisonSeries);
    return rollingSeries(
      month,
      new Map(
        data?.portfolioMonthlySeries.map((p) => [p.month, p.totalYieldKwh]) ||
          [],
      ),
    );
  }, [month, data]);
  const currentPoint = chart.find((point) => point.month === month);
  const chartScopeNote = cohortAvailable
    ? `ขอบเขต: ${scope === "source" ? "ทะเบียนต้นทาง" : "รวมไซต์ในประวัติ"} · เส้น/แท่งคือยอดรวมของไซต์ที่มีค่าในแต่ละเดือน จำนวนไซต์ต่อเดือนต่างกันได้ การเทียบปีต่อปีจึงใช้เฉพาะกลุ่มไซต์ที่มีค่าทั้งสองช่วง`
    : "ข้อมูลกลุ่มไซต์ที่เทียบกันได้ยังไม่มาจาก API รอบนี้ ยอดรวมแต่ละเดือนอาจครอบคลุมจำนวนไซต์ต่างกัน จึงยังไม่ใช่การเปรียบเทียบประสิทธิผลของกลุ่มเดิม";
  const validCount = data
    ? data.meta.siteCount - data.meta.missingYieldCount
    : 0;
  return (
    <div className={`as-prototype ${site ? "as-inspection" : ""}`}>
      <a className="as-skip" href="#as-main">
        ข้ามไปเนื้อหาหลัก
      </a>
      <header className="as-topbar">
        <Link
          className="as-brand"
          href={href({ view: "overview", site: null })}
        >
          <Sun size={26} />
          <span>
            AnalysisSolar<small>ดูแลโซลาร์ทีละเดือน</small>
          </span>
        </Link>
        <nav className="as-topnav" aria-label="เมนูหลัก">
          {menu.map((m) => (
            <Link
              key={m.id}
              href={href({ view: m.id, site: null })}
              aria-current={view === m.id ? "page" : undefined}
            >
              <span>{m.label}</span>
            </Link>
          ))}
        </nav>
        <Link className="as-help-link" href="/help">
          วิธีใช้งาน
        </Link>
      </header>
      {data && !mismatch && (
        <aside
          className={`as-site-rail as-global-rail ${railOpen ? "is-open" : ""}`}
          aria-label="เลือกไซต์ในขอบเขตเดือนนี้"
        >
          <button
            className="as-rail-toggle"
            aria-expanded={railOpen}
            onClick={() => setRailOpen(!railOpen)}
          >
            <Building2 size={18} /> ไซต์ทั้งหมด ({plants.length}) · เลือกไซต์
          </button>
          <h2>ไซต์ทั้งหมด ({plants.length})</h2>
          <label>
            <Search size={17} />
            <input
              aria-label="ค้นหาไซต์ในแถบข้าง"
              placeholder="ค้นหาชื่อไซต์"
              value={query}
              onChange={(e) => change({ q: e.target.value })}
            />
          </label>
          <div className="as-rail-list">
            {selectPlants(plants, query, "all").map((p) => (
              <Link
                key={p.siteName}
                href={href({
                  site: p.siteName,
                  view: view === "reports" ? "sites" : view,
                })}
                onClick={() => setRailOpen(false)}
                aria-current={p.siteName === site ? "true" : undefined}
              >
                <FileText size={19} />
                <span>
                  {p.siteName}
                  <small>
                    {p.capacityKwp === null
                      ? "ไม่มีกำลังติดตั้ง"
                      : `${number(p.capacityKwp)} kWp`}{" "}
                    ·{" "}
                    {p.inverterYieldKwh === null
                      ? "ขาดค่าผลผลิต"
                      : "มีค่าผลผลิต"}
                  </small>
                </span>
              </Link>
            ))}
            {selectPlants(plants, query, "all").length === 0 && (
              <p className="as-muted">ไม่พบชื่อไซต์ที่ค้นหา</p>
            )}
          </div>
          <p className="as-rail-count">
            {selectPlants(plants, query, "all").length} จาก {plants.length}{" "}
            ไซต์ในขอบเขต
          </p>
        </aside>
      )}
      <main id="as-main" className="as-main">
        <div className="as-desk-toolbar">
          <span>
            {site ? (
              <Link href={href({ site: null })}>
                <ChevronLeft size={15} /> Inspection Desk · กลับรายการ
              </Link>
            ) : (
              "Inspection Desk"
            )}
          </span>
          <span className="as-pill">รายงานรายเดือน · ข้อมูลจริง</span>
          <Link
            className="as-button"
            href={href({ view: "reports", site: null })}
          >
            <Upload size={17} /> อัปโหลดรายงาน
          </Link>
        </div>
        <div className="as-heading">
          <div>
            <h1>
              {site ? site : menu.find((m) => m.id === view)?.label || "ภาพรวม"}
            </h1>
            <p>
              {site
                ? `กำลังติดตั้ง ${number(selected?.capacityKwp)}${selected?.capacityKwp == null ? "" : " kWp"} · หลักฐานจากรายงานรายเดือน`
                : view === "overview"
                  ? "เดือนนี้ผลิตไฟได้เท่าไร และมีอะไรที่ควรดูต่อ"
                  : view === "sites"
                    ? "ค้นหาไซต์และเปิดดูหลักฐานของเดือนที่เลือก"
                    : view === "checks"
                      ? "แยกปัญหาข้อมูลออกจากสัญญาณผลผลิต"
                      : "สรุปเดือนนี้ พร้อมที่มาและข้อจำกัดของข้อมูล"}
            </p>
          </div>
          <div className="as-controls">
            <label>
              เดือนรายงาน
              <input
                aria-label="เดือนรายงาน"
                type="month"
                value={month}
                onChange={(e) => {
                  if (e.target.value) change({ month: e.target.value });
                }}
              />
            </label>
            <label>
              ขอบเขตไซต์
              <select
                value={scope}
                onChange={(e) => change({ scope: e.target.value })}
              >
                <option value="source">ทะเบียนต้นทาง</option>
                <option value="history">รวมไซต์ในประวัติ</option>
              </select>
            </label>
          </div>
        </div>
        {loading ? (
          <div
            className="as-loading"
            role="status"
            aria-label="กำลังโหลดข้อมูล"
          >
            <div />
            <div />
            <div />
            <p>กำลังอ่านรายงานเดือนที่เลือก…</p>
          </div>
        ) : error ? (
          <section className="as-panel as-empty" role="alert">
            <TriangleAlert />
            <h2>ยังโหลดข้อมูลไม่ได้</h2>
            <p>{error}</p>
            <button onClick={() => setReload((v) => v + 1)}>ลองใหม่</button>
          </section>
        ) : (
          data && (
            <>
              <section className="as-coverage" aria-label="ความครบถ้วนข้อมูล">
                <div>
                  <Info size={19} />
                  <span>
                    <strong>
                      {mismatch
                        ? "ไม่มีรายงานเดือนที่เลือก"
                        : `มีค่าผลผลิต ${validCount} / ${data.meta.siteCount} ไซต์`}
                    </strong>
                    <small>
                      {mismatch
                        ? `API ส่งเดือน ${monthLabel(data.selectedMonth)} กลับมา จึงไม่ใช้ยอดนั้นแทน ${monthLabel(month)}`
                        : `มีรายงาน ${data.meta.reportedSiteCount} ไซต์ · ขาดรายงาน ${data.meta.missingReportCount} ไซต์ · ขาดค่าผลผลิต ${missing} ไซต์`}
                    </small>
                  </span>
                </div>
                <div>
                  <span>
                    ทะเบียนต้นทาง:{" "}
                    <strong>
                      {monthLabel(data.meta.rosterReportMonth || "")}
                    </strong>
                  </span>
                  <small>
                    {data.meta.sourceAvailable
                      ? "เวลานำเข้าทะเบียนที่ยืนยันจำนวนแล้ว: "
                      : "ยังไม่มีทะเบียนที่ยืนยันจำนวน · ใช้รายงานเดือนที่เลือก"}
                    {data.meta.sourceAvailable && data.meta.rosterUpdatedAt
                      ? new Date(data.meta.rosterUpdatedAt).toLocaleString(
                          "th-TH",
                          { timeZone: "Asia/Bangkok" },
                        )
                      : ""}
                  </small>
                </div>
              </section>
              {month >=
                new Date()
                  .toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" })
                  .slice(0, 7) && (
                <p className="as-notice">
                  <Info size={18} /> เดือนปัจจุบันหรืออนาคต:
                  หากมีข้อมูลถือเป็นข้อมูลระหว่างเดือน ไม่ใช่ยอดเต็มเดือน
                </p>
              )}
              {mismatch ? (
                <section className="as-panel as-empty">
                  <FileText />
                  <h2>ยังไม่มีข้อมูล {monthLabel(month)}</h2>
                  <p>ไม่สรุปว่าไซต์ปกติ และไม่แทนค่าที่ขาดด้วยศูนย์</p>
                  <button onClick={() => change({ month: data.selectedMonth })}>
                    ดูเดือนล่าสุดที่มีข้อมูล: {monthLabel(data.selectedMonth)}
                  </button>
                </section>
              ) : site ? (
                <div className="as-desk">
                  <div className="as-desk-content">
                    <SiteDetail
                      key={`${site}-${month}`}
                      plant={selected}
                      site={site}
                      month={month}
                      back={href({ site: null })}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {view === "overview" && (
                    <>
                      <section className="as-kpis">
                        <div className="as-kpi as-kpi-primary">
                          <div>
                            <span>ไฟที่ผลิตได้</span>
                            <Zap size={22} />
                          </div>
                          <strong>
                            {number(data.portfolio?.monthlyYieldKwh)}
                            <small>หน่วย</small>
                          </strong>
                          <p>Inverter yield · 1 หน่วย = 1 kWh</p>
                          <small>
                            รวมค่าที่มีจาก {validCount} / {data.meta.siteCount}{" "}
                            ไซต์
                          </small>
                          <YoyLine point={currentPoint} />
                        </div>
                        <Link
                          className="as-kpi"
                          href={href({
                            view: "checks",
                            filter: "signal",
                            site: null,
                          })}
                        >
                          <div>
                            <span>ไซต์ที่มีสัญญาณเดิม</span>
                            <TriangleAlert size={22} />
                          </div>
                          <strong>
                            {signals.length}
                            <small>ไซต์</small>
                          </strong>
                          <p>ตามระดับประเมินเดิมที่ไม่ใช่ normal</p>
                          <small>
                            ยังไม่ใช่เกณฑ์ความสำคัญใหม่ <ArrowRight size={16} />
                          </small>
                        </Link>
                        <Link
                          className="as-kpi"
                          href={href({
                            view: "sites",
                            filter: "missing",
                            site: null,
                          })}
                        >
                          <div>
                            <span>ไซต์ที่ขาดค่าผลผลิต</span>
                            <Info size={22} />
                          </div>
                          <strong>
                            {missing}
                            <small>ไซต์</small>
                          </strong>
                          <p>รวมขาดรายงานและไม่มีค่าที่ใช้ได้</p>
                          <small>
                            ยังประเมินไม่ได้ · ดูรายการ <ArrowRight size={16} />
                          </small>
                        </Link>
                      </section>
                      <div className="as-overview-grid">
                        <ComparisonChart
                          points={chart}
                          month={month}
                          onMonth={(m: string) => change({ month: m })}
                          title="ผลผลิตรวม 12 เดือน เทียบเดือนเดียวกันปีก่อน"
                          cohortMode={cohortAvailable}
                          scopeNote={chartScopeNote}
                        />
                        <section className="as-panel as-review-guide">
                          <p className="as-eyebrow">เริ่มตรวจจากตรงนี้</p>
                          <h2>
                            จากตัวเลข
                            <br />
                            สู่สิ่งที่ตรวจต่อได้
                          </h2>
                          <ol>
                            <li>
                              <b>01</b>
                              <span>
                                ตรวจความครบถ้วน
                                <small>รายงานขาด ≠ ผลผลิตเป็นศูนย์</small>
                              </span>
                            </li>
                            <li>
                              <b>02</b>
                              <span>
                                เปิดหลักฐานของไซต์
                                <small>ดูค่าที่พบและข้อจำกัดก่อนสรุป</small>
                              </span>
                            </li>
                            <li>
                              <b>03</b>
                              <span>
                                คัดลอกให้ช่างทาง LINE
                                <small>คุณเป็นผู้ส่งข้อความด้วยตัวเอง</small>
                              </span>
                            </li>
                          </ol>
                          <Link
                            className="as-button"
                            href={href({ view: "checks", site: null })}
                          >
                            เปิดรายการตรวจสอบ <ArrowRight size={17} />
                          </Link>
                        </section>
                      </div>
                      <section className="as-section">
                        <div className="as-section-title">
                          <div>
                            <h2>รายการสำคัญที่ควรเปิดดู</h2>
                            <p>
                              สัญญาณตามการประเมินเดิม
                              แยกจากข้อมูลที่ยังประเมินไม่ได้
                            </p>
                          </div>
                          <Link href={href({ view: "checks", site: null })}>
                            ดูทั้งหมด <ArrowRight size={17} />
                          </Link>
                        </div>
                        <div className="as-cards">
                          {[
                            ...signals
                              .slice()
                              .sort((a, b) => b.riskScore - a.riskScore),
                            ...plants.filter(
                              (p) => p.inverterYieldKwh === null,
                            ),
                          ]
                            .slice(0, 4)
                            .map((p) => (
                              <SiteCard
                                key={p.siteName}
                                plant={p}
                                href={href({ site: p.siteName })}
                              />
                            ))}
                        </div>
                        {signals.length === 0 && missing === 0 && (
                          <p className="as-notice">
                            ไม่มีรายการตามตัวกรองสัญญาณเดิม
                            ไม่ใช่การรับรองว่าอุปกรณ์สมบูรณ์
                          </p>
                        )}
                      </section>
                    </>
                  )}
                  {view === "checks" && (
                    <InspectionTracker month={month} scope={scope} />
                  )}
                  {(view === "sites" || view === "checks") && (
                    <>
                      <div className="as-toolbar">
                        <label className="as-search">
                          <Search size={18} />
                          <input
                            aria-label="ค้นหาชื่อไซต์"
                            placeholder="ค้นหาชื่อไซต์…"
                            value={query}
                            onChange={(e) =>
                              change({ q: e.target.value || null })
                            }
                          />
                        </label>
                        <label>
                          ประเภทข้อมูล
                          <select
                            aria-label="ประเภทข้อมูล"
                            value={filter}
                            onChange={(e) => change({ filter: e.target.value })}
                          >
                            <option value="all">ทั้งหมด</option>
                            <option value="signal">
                              สัญญาณผลผลิต (ประเมินเดิม)
                            </option>
                            <option value="missing">
                              ขาดค่าผลผลิต / รอยืนยัน
                            </option>
                          </select>
                        </label>
                        <label>
                          เรียงตาม
                          <select
                            onChange={(e) => change({ sort: e.target.value })}
                            value={search.get("sort") || "risk"}
                          >
                            <option value="risk">คะแนนเดิมมากไปน้อย</option>
                            <option value="name">ชื่อไซต์</option>
                          </select>
                        </label>
                      </div>
                      <div className="as-list-note">
                        <strong>
                          พบ {rows.length} จาก {data.meta.siteCount}{" "}
                          ไซต์ในขอบเขต
                        </strong>
                        <span>
                          สถานะเปิดใช้งาน: ยังไม่มีหลักฐานจาก API · สถานะงาน:
                          ดูในส่วนงานตรวจที่บันทึกจริง
                        </span>
                      </div>
                      <p className="as-notice">
                        <Info size={18} /> ความสำคัญใหม่ยังรอทดสอบเกณฑ์
                        ป้ายด้านล่างใช้ชื่อระดับเดิม
                        ไม่ใช่สถานะงานหรือการยืนยันอุปกรณ์เสีย
                      </p>
                      <div className="as-cards as-list-cards">
                        {rows
                          .slice()
                          .sort((a, b) =>
                            search.get("sort") === "name"
                              ? a.siteName.localeCompare(b.siteName, "th")
                              : b.riskScore - a.riskScore,
                          )
                          .slice((pageNumber - 1) * 12, pageNumber * 12)
                          .map((p) => (
                            <SiteCard
                              key={p.siteName}
                              plant={p}
                              href={href({ site: p.siteName })}
                            />
                          ))}
                      </div>
                      {pageCount > 1 && (
                        <nav
                          className="as-pagination"
                          aria-label="หน้ารายการไซต์"
                        >
                          <button
                            disabled={pageNumber === 1}
                            onClick={() =>
                              change({ page: String(pageNumber - 1) })
                            }
                          >
                            ก่อนหน้า
                          </button>
                          <span>
                            หน้า {pageNumber} / {pageCount} · หน้าละ 12 ไซต์
                          </span>
                          <button
                            disabled={pageNumber === pageCount}
                            onClick={() =>
                              change({ page: String(pageNumber + 1) })
                            }
                          >
                            ถัดไป
                          </button>
                        </nav>
                      )}
                      {rows.length === 0 && (
                        <section className="as-panel as-empty">
                          <Search />
                          <h2>ไม่พบไซต์ที่ตรงกับการค้นหา</h2>
                          <button
                            onClick={() => change({ q: null, filter: "all" })}
                          >
                            ล้างตัวกรอง
                          </button>
                        </section>
                      )}
                      {view === "checks" && <NotEnabledList context="checks" />}
                    </>
                  )}
                  {view === "reports" && (
                    <>
                      <MonthlyUpload selectedMonth={month} />
                      <div className="as-report-grid">
                        <section className="as-panel">
                          <p className="as-eyebrow">MONTHLY SUMMARY</p>
                          <h2>สรุป {monthLabel(month)}</h2>
                          <p>
                            ขอบเขต:{" "}
                            {scope === "source"
                              ? "ทะเบียนต้นทาง"
                              : "รวมไซต์ในประวัติ"}
                          </p>
                          <div className="as-report-total">
                            {number(data.portfolio?.monthlyYieldKwh)}{" "}
                            <small>หน่วย</small>
                          </div>
                          <dl className="as-facts">
                            <div>
                              <dt>ไซต์ในขอบเขต</dt>
                              <dd>{data.meta.siteCount} ไซต์</dd>
                            </div>
                            <div>
                              <dt>มีค่าผลผลิต</dt>
                              <dd>{validCount} ไซต์</dd>
                            </div>
                            <div>
                              <dt>สัญญาณจากการประเมินเดิม</dt>
                              <dd>{signals.length} ไซต์</dd>
                            </div>
                            <div>
                              <dt>ข้อมูลขาด / ยังประเมินไม่ได้</dt>
                              <dd>{missing} ไซต์</dd>
                            </div>
                            <div>
                              <dt>งานใหม่ / งานค้าง / ได้ผลตรวจ</dt>
                              <dd>
                                ดูงานทุกเดือนในหน้ารายการตรวจสอบ
                                (ยังไม่สรุปจำนวนตามเดือน)
                              </dd>
                            </div>
                            <div>
                              <dt>สาเหตุที่ช่างยืนยัน</dt>
                              <dd>ดูบันทึกและหลักฐานในรายละเอียดไซต์</dd>
                            </div>
                          </dl>
                          <p className="as-muted">
                            อ่านข้อมูลเพื่อสรุปเมื่อ {readAt} (เวลาไทย) ·
                            ยังไม่มีรุ่นข้อมูลและรายงานส่งออกที่รับรองได้
                          </p>
                        </section>
                        <section className="as-panel">
                          <p className="as-eyebrow">DATA PROVENANCE</p>
                          <h2>ที่มาและการนำเข้า</h2>
                          <dl className="as-facts">
                            <div>
                              <dt>แหล่งข้อมูล</dt>
                              <dd>Huawei Plant Report รายเดือน</dd>
                            </div>
                            <div>
                              <dt>เดือนทะเบียนต้นทาง</dt>
                              <dd>
                                {monthLabel(data.meta.rosterReportMonth || "")}
                              </dd>
                            </div>
                            <div>
                              <dt>ประวัติ sync สำเร็จ / ล้มเหลว</dt>
                              <dd>ยังไม่มี API สำหรับแสดงประวัติ</dd>
                            </div>
                            <div>
                              <dt>ความขัดแย้งของค่าที่แก้</dt>
                              <dd>ยังไม่มี API สำหรับทบทวน</dd>
                            </div>
                          </dl>
                          <p className="as-notice">
                            <Info size={18} /> เวลานำเข้าทะเบียนด้านบน
                            ไม่ใช่สถานะ sync ล่าสุดของทั้งระบบ
                            และไม่ใช่สถานะอุปกรณ์สด
                          </p>
                          <details>
                            <summary>
                              สิ่งที่ต้องมี ก่อนเปิดแก้ข้อมูลรายเดือน
                            </summary>
                            <p>
                              แสดงค่าต้นทางและค่าที่ใช้ หน่วย เหตุผล ผู้แก้ เวลา
                              รุ่นข้อมูล และผลกระทบ
                              พร้อมป้องกันการเขียนทับและกลับไปใช้ค่าต้นทางอย่างมีประวัติ
                            </p>
                          </details>
                        </section>
                      </div>
                      <section className="as-panel as-next">
                        <Database size={24} />
                        <div>
                          <h2>ความสามารถด้านข้อมูล</h2>
                          <p>
                            นำเข้าไฟล์และบันทึกซ่อมได้จริงแล้ว
                            ส่วนการแก้ค่ารายเดือน ตั้งเวลา sync
                            และส่งออกรายงานยังไม่เปิดใช้งานในหน้านี้
                          </p>
                        </div>
                      </section>
                      <NotEnabledList context="reports" />
                    </>
                  )}
                </>
              )}
            </>
          )
        )}
        <footer className="as-footer">
          <span>AnalysisSolar · เครื่องมือทบทวนข้อมูลโซลาร์รายเดือน</span>
          <span>รายงานรายเดือนเป็นหลักฐานประกอบ ต้องตรวจยืนยันสาเหตุ</span>
        </footer>
      </main>
    </div>
  );
}
function Badge({ plant: p }: { plant: Plant }) {
  return (
    <span
      className={`as-badge as-${p.inverterYieldKwh === null ? "missing" : p.riskLevel}`}
    >
      <span aria-hidden>
        {p.inverterYieldKwh === null
          ? "ⓘ"
          : p.riskLevel === "normal"
            ? "○"
            : "△"}
      </span>
      {p.inverterYieldKwh === null
        ? "ยังประเมินไม่ได้"
        : `ประเมินเดิม: ${p.riskLevel}`}
    </span>
  );
}
function SiteCard({ plant: p, href }: { plant: Plant; href: string }) {
  return (
    <article className="as-site-card">
      <div className="as-site-icon">
        <Building2 size={20} />
      </div>
      <h3>{p.siteName}</h3>
      <Badge plant={p} />
      <p className="as-site-reason">
        {p.inverterYieldKwh === null
          ? "ไม่มีค่าผลผลิตที่ใช้ได้ในเดือนนี้ ต้องตรวจรายงานก่อนประเมิน"
          : `ต้นทางรายงานผลผลิต ${number(p.inverterYieldKwh)} หน่วย`}
      </p>
      <div className="as-card-meta">
        <span>
          ข้อมูล: {p.inverterYieldKwh === null ? "ขาดค่าจำเป็น" : "มีค่าผลผลิต"}
        </span>
        <span>งาน: ดูในบันทึกงานตรวจ</span>
      </div>
      <Link className="as-evidence-link" href={href}>
        ดูหลักฐาน <ArrowRight size={17} />
      </Link>
    </article>
  );
}
function SiteDetail({
  plant,
  site,
  month,
  back,
}: {
  plant?: Plant;
  site: string;
  month: string;
  back: string;
}) {
  const [inspectionRefresh, setInspectionRefresh] = useState(0);
  const [rows, setRows] = useState<SiteHistoryRow[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [copied, setCopied] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/sites/history?site=${encodeURIComponent(site)}`, {
      signal: c.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error("โหลดประวัติไซต์ไม่สำเร็จ");
        setRows(d.rows);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [site, retry]);
  const row = rows.find((r) => r.reportMonth === month);
  const prior = rows.find((r) => r.reportMonth === shiftMonth(month, -1));
  const value = plant
    ? plant.inverterYieldKwh
    : (row?.inverterYieldKwh ?? null);
  const message = `ขอให้ช่วยตรวจไซต์ ${site}\nเดือน ${monthLabel(month)}\nข้อเท็จจริง: ${value === null ? "ไม่มีค่าผลผลิตที่ใช้ได้" : `Inverter yield ${number(value)} kWh`} จาก Plant Report รายเดือน\nยังไม่ยืนยันสาเหตุหรือสุขภาพอุปกรณ์\nกรุณาตรวจความครบถ้วนของรายงาน ประวัติหยุดทำงาน และข้อมูลแจ้งเตือนในช่วงเดือนนี้ แล้วแจ้งว่าพบอะไร ทำอะไรไป และต้องตรวจต่อไหม`;
  const points = rollingSeries(
    month,
    new Map(rows.map((r) => [r.reportMonth, r.inverterYieldKwh])),
  );
  if (!plant)
    return (
      <section className="as-panel as-empty">
        <h2>ไม่พบไซต์นี้ในขอบเขตเดือนที่เลือก</h2>
        <p>{site}</p>
        <Link href={back}>กลับรายการเดิม</Link>
      </section>
    );
  return (
    <>
      {loading ? (
        <p role="status" className="as-panel">
          กำลังโหลดประวัติไซต์…
        </p>
      ) : error ? (
        <div className="as-panel" role="alert">
          <p>{error}</p>
          <button onClick={() => setRetry((v) => v + 1)}>
            ลองโหลดประวัติอีกครั้ง
          </button>
        </div>
      ) : (
        <>
          <ComparisonChart
            points={points}
            month={month}
            title="ผลผลิตย้อนหลัง 12 เดือน"
            summary={
              <div className="as-chart-stats">
                <div>
                  <strong>
                    {number(value)} <small>หน่วย</small>
                  </strong>
                  <span>ผลผลิต {monthLabel(month, true)}</span>
                </div>
                <div>
                  <strong>
                    {percentLabel(deltaPercent(value, prior?.inverterYieldKwh))}
                  </strong>
                  <span>เทียบเดือนก่อน · ยังไม่ปรับจำนวนวัน</span>
                </div>
                <div>
                  <strong>
                    {number(prior?.inverterYieldKwh)} <small>หน่วย</small>
                  </strong>
                  <span>
                    เดือนก่อน {monthLabel(shiftMonth(month, -1), true)}
                  </span>
                </div>
                <div>
                  <strong>
                    {points.some((p) => p.value !== null)
                      ? number(
                          points.reduce((sum, p) => sum + (p.value ?? 0), 0),
                        )
                      : "ไม่มีข้อมูล"}{" "}
                    <small>หน่วย</small>
                  </strong>
                  <span>
                    รวมจาก {points.filter((p) => p.value !== null).length} / 12
                    เดือนที่มีค่า
                  </span>
                </div>
              </div>
            }
            scopeNote="ค่าเหล่านี้เป็นของไซต์นี้ไซต์เดียว จาก Inverter yield ใน Plant Report รายเดือน ไม่ใช่สถานะอุปกรณ์สด"
          />
          {!row && (
            <p className="as-notice">
              ไม่มีรายงานไซต์สำหรับเดือน {monthLabel(month)} ·
              กราฟประวัติไม่ใช่ข้อมูลของเดือนที่ขาด
            </p>
          )}
        </>
      )}
      <div className="as-inspection-columns">
        <section className="as-panel as-findings">
          <h2>ผลการตรวจสอบ</h2>
          <p className="as-muted">จากรายงาน {monthLabel(month)}</p>
          <div className="as-finding">
            <FileText size={21} />
            <div>
              <h3>ข้อเท็จจริง (Facts)</h3>
              <ul>
                <li>
                  {value === null
                    ? "ไม่มีค่าผลผลิตที่ใช้ได้"
                    : `ผลผลิต ${number(value)} หน่วย`}
                </li>
                <li>
                  เดือนก่อน:{" "}
                  {loading
                    ? "กำลังอ่านประวัติ"
                    : number(prior?.inverterYieldKwh)}
                  {prior?.inverterYieldKwh == null ? "" : " หน่วย"}
                </li>
                <li>
                  {value === 0
                    ? "ต้นทางรายงานศูนย์ ยังไม่ยืนยันว่าอุปกรณ์เสีย"
                    : "รายงานรายเดือนไม่ยืนยันสุขภาพอุปกรณ์"}
                </li>
              </ul>
              <Badge plant={plant} />
            </div>
          </div>
          <div className="as-finding">
            <CircleHelp size={21} />
            <div>
              <h3>สาเหตุที่เป็นไปได้</h3>
              <p className="as-muted">ยังไม่ยืนยัน · แนวทางทั่วไป</p>
              <ul>
                <li>ข้อมูลอาจไม่ครบ หรือมีช่วงหยุดเดินระบบ</li>
                <li>
                  อากาศ เงาบัง หรือการทำงานของอุปกรณ์อาจเกี่ยวข้อง
                  ต้องตรวจหลักฐานเพิ่ม
                </li>
              </ul>
            </div>
          </div>
          <div className="as-finding">
            <ClipboardCheck size={21} />
            <div>
              <h3>ขั้นตอนถัดไป</h3>
              <ol>
                <li>ตรวจไฟล์ต้นทาง เดือน และค่าที่ขาด</li>
                <li>สอบถามช่วงหยุดตามแผนหรือเปลี่ยนกำลังติดตั้ง</li>
                <li>ให้ช่างตรวจประวัติแจ้งเตือนและอุปกรณ์</li>
              </ol>
            </div>
          </div>
          <details>
            <summary>เหตุผลจากการประเมินเดิม</summary>
            <p>ไม่ใช่ผลตรวจที่ช่างยืนยัน และยังไม่เทียบกับกติกาใหม่</p>
            <ul>
              {plant.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <ul>
              {plant.actions.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </details>
        </section>
        <MaintenanceHistory key={`${site}-${inspectionRefresh}`} site={site} />
        <AiAnalysis
          key={`${site}-${month}-${inspectionRefresh}`}
          site={site}
          month={month}
        />
      </div>
      <InspectionTracker
        key={`${site}-${month}`}
        site={site}
        month={month}
        scope={new URLSearchParams(back.split("?")[1]).get("scope") || "source"}
        onSaved={() => setInspectionRefresh((v) => v + 1)}
      />
      <section className="as-panel as-line-panel">
        <div>
          <p className="as-eyebrow">ส่งต่อให้ช่าง</p>
          <h2>คัดลอกข้อความสำหรับ LINE</h2>
          <p>คัดลอกแล้วนำไปวางและส่งเอง สถานะงานจะไม่เปลี่ยน</p>
        </div>
        <textarea
          aria-label="ข้อความสำหรับคัดลอก LINE"
          readOnly
          value={message}
          rows={7}
        />
        <button
          className="as-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message);
              setCopied(
                "คัดลอกแล้ว — ยังไม่ได้ส่ง LINE และไม่ได้เปลี่ยนสถานะงาน",
              );
            } catch {
              setCopied(
                "คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกข้อความด้านบนแล้วคัดลอกด้วยตัวเอง",
              );
            }
          }}
        >
          <Copy size={18} /> คัดลอกข้อความ
        </button>
        <p role="status">{copied}</p>
      </section>
      <NotEnabledList context="site" />
      {row && (
        <section className="as-panel">
          <details>
            <summary>
              ค่าพลังงานอื่นและรายละเอียดเทคนิค · {monthLabel(month)}
            </summary>
            <dl className="as-facts">
              <div>
                <dt>ไฟที่ใช้เอง (kWh)</dt>
                <dd>{number(row.selfConsumptionKwh)}</dd>
              </div>
              <div>
                <dt>ไฟที่ส่งออก (kWh)</dt>
                <dd>{number(row.exportKwh)}</dd>
              </div>
              <div>
                <dt>กำลังติดตั้ง (kWp)</dt>
                <dd>{number(row.capacityKwp)}</dd>
              </div>
              <div>
                <dt>สัดส่วนใช้เอง</dt>
                <dd>
                  {row.selfConsumptionRate === null
                    ? "ไม่มีข้อมูล"
                    : `${number(row.selfConsumptionRate * 100, 3)}%`}
                </dd>
              </div>
            </dl>
            <p>
              สัดส่วนใช้เองจากต้นทางผ่าน API ที่แปลงเป็น fraction แล้ว
              แสดงเป็นเปอร์เซ็นต์ครั้งเดียว
              ค่าพลังงานที่ไม่สอดคล้องต้องตรวจต้นทาง
              ยังไม่ถือว่ายืนยันความถูกต้อง
            </p>
          </details>
        </section>
      )}
    </>
  );
}

/**
 * Year-over-year reading for the headline KPI.
 *
 * Uses the matched cohort when the API supplied one, because the full-portfolio
 * totals for two years can cover different sites. Shows kWh and the unit
 * difference always; the percentage only when the baseline is positive.
 */
function YoyLine({ point }: { point?: ComparisonChartPoint }) {
  if (!point) {
    return (
      <small className="as-kpi-yoy">ยังไม่มีข้อมูลเทียบปีก่อนของเดือนนี้</small>
    );
  }
  const hasCohort = point.cohortSiteCount !== undefined;
  const current = hasCohort ? point.cohortCurrentKwh : point.value;
  const baseline = hasCohort ? point.cohortPreviousKwh : point.previous;
  const delta =
    hasCohort && point.cohortDeltaKwh !== undefined
      ? point.cohortDeltaKwh
      : current == null || baseline == null
        ? null
        : current - baseline;
  const pct = hasCohort
    ? (point.cohortDeltaPct ?? null)
    : deltaPercent(current, baseline);

  if (baseline == null) {
    return (
      <small className="as-kpi-yoy">
        เดือนเดียวกันปีก่อนไม่มีค่าที่ใช้ได้ · เทียบปีต่อปีไม่ได้
      </small>
    );
  }
  return (
    <small className="as-kpi-yoy">
      เทียบ {monthLabel(shiftMonth(point.month, -12), true)}:{" "}
      {signedNumber(delta)} หน่วย · {percentLabel(pct)}
      <br />
      {hasCohort
        ? `ฐาน: กลุ่มไซต์เดิม ${point.cohortSiteCount} ไซต์ที่มีค่าทั้งสองเดือน (${number(current)} เทียบ ${number(baseline)} หน่วย)`
        : `ฐาน: ยอดรวมของเดือน ${monthLabel(shiftMonth(point.month, -12), true)} ซึ่งอาจครอบคลุมจำนวนไซต์ต่างกัน`}
      {pct === null && baseline <= 0
        ? " · ฐานเป็นศูนย์ จึงไม่คำนวณเปอร์เซ็นต์"
        : ""}
    </small>
  );
}

/**
 * Capabilities with no backend in this round.
 *
 * Deliberately a list, not buttons. A control that looks operable but stores
 * nothing would misrepresent the system state, so nothing here is clickable.
 */
function NotEnabledList({
  context,
}: {
  context: "checks" | "reports" | "site";
}) {
  const shared = ["การแนบรูปและแจ้งเตือนช่างอัตโนมัติ"];
  const byContext = {
    checks: [
      ...shared,
      "ตัวกรองสถานะเปิดใช้งานไซต์ — ยังไม่มีแหล่งข้อมูลที่เชื่อถือได้",
    ],
    reports: [
      "แก้ค่ารายเดือน และทบทวนความขัดแย้งของค่าที่แก้",
      "ประวัติ sync สำเร็จ/ล้มเหลวบนหน้าจอ และการตั้งเวลา sync",
      "ส่งออกไฟล์รายงาน — ยังไม่เลือกรูปแบบและยังไม่มีรุ่นข้อมูลที่รับรองได้",
      ...shared,
    ],
    site: [
      "แก้หรือลบบันทึกซ่อม และแนบรูปประกอบ",
      "ระบบผู้ใช้และสิทธิ์ — ชื่อผู้บันทึกคือชื่อที่กรอกเอง",
      ...shared,
    ],
  }[context];

  return (
    <section className="as-panel as-not-enabled">
      <div className="as-not-enabled-head">
        <Info size={20} aria-hidden />
        <div>
          <h2>ยังไม่เปิดใช้งานในรอบนี้</h2>
          <p>
            แสดงเป็นรายการเพราะยังไม่มีระบบรองรับ
            จึงไม่ใส่ปุ่มที่กดแล้วไม่เกิดผล
          </p>
        </div>
      </div>
      <ul>
        {byContext.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
