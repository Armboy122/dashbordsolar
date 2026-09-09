"use client";
/**
 * Year-over-year production chart with line and grouped-bar modes.
 *
 * Both modes read the same data. Gaps stay gaps: a month without a usable
 * value is not drawn as zero. Percentages appear only when the baseline is
 * positive, and the compared group is always stated in text.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, LineChart } from "lucide-react";
import {
  type CohortComparisonPoint,
  monthLabel,
  number,
  percentLabel,
  signedNumber,
} from "@/src/lib/prototype-model";

export type ComparisonChartPoint = {
  month: string;
  /** Value plotted for the selected period. */
  value: number | null;
  /** Same month one year earlier. */
  previous: number | null;
  /** Sites behind `value`, when the scope is a portfolio total. */
  siteCount?: number;
  previousSiteCount?: number;
  /** Matched-cohort figures, present for portfolio charts only. */
  cohortSiteCount?: number;
  cohortCurrentKwh?: number | null;
  cohortPreviousKwh?: number | null;
  cohortDeltaKwh?: number | null;
  cohortDeltaPct?: number | null;
  membershipDiffers?: boolean;
};

export function cohortToChartPoints(
  series: CohortComparisonPoint[],
): ComparisonChartPoint[] {
  return series.map((point) => ({
    month: point.month,
    value: point.totalYieldKwh,
    previous: point.previousYearTotalYieldKwh,
    siteCount: point.siteCountWithValue,
    previousSiteCount: point.previousYearSiteCountWithValue,
    cohortSiteCount: point.cohortSiteCount,
    cohortCurrentKwh: point.cohortCurrentKwh,
    cohortPreviousKwh: point.cohortPreviousKwh,
    cohortDeltaKwh: point.cohortDeltaKwh,
    cohortDeltaPct: point.cohortDeltaPct,
    membershipDiffers: point.membershipDiffers,
  }));
}

const PLOT = { top: 18, bottom: 44, left: 52, right: 16, height: 250 };

function scaleY(value: number, max: number) {
  const usable = PLOT.height - PLOT.top - PLOT.bottom;
  return PLOT.height - PLOT.bottom - (value / max) * usable;
}

export default function ComparisonChart({
  points,
  month,
  onMonth,
  title,
  scopeNote,
  cohortMode = false,
}: {
  points: ComparisonChartPoint[];
  month: string;
  onMonth?: (month: string) => void;
  title: string;
  /** Sentence describing which sites the plotted values cover. */
  scopeNote: string;
  /** Portfolio charts carry matched-cohort figures; single-site charts do not. */
  cohortMode?: boolean;
}) {
  const [mode, setMode] = useState<"line" | "bar">("line");
  const [compare, setCompare] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(760);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(280, entries[0].contentRect.width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const showPrevious = compare || mode === "bar";
  const max = useMemo(() => {
    const values = points.flatMap((point) => [
      point.value ?? 0,
      showPrevious ? (point.previous ?? 0) : 0,
    ]);
    return Math.max(1, ...values) * 1.12;
  }, [points, showPrevious]);

  const slot = points.length
    ? (width - PLOT.left - PLOT.right) / points.length
    : 0;
  const centerX = (index: number) => PLOT.left + slot * (index + 0.5);
  const activeMonth = points.some((point) => point.month === active) ? active! : month;
  const current = points.find((point) => point.month === activeMonth);

  const linePath = (field: "value" | "previous") => {
    let drawing = false;
    return points
      .map((point, index) => {
        const value = point[field];
        if (value === null || value === undefined) {
          drawing = false;
          return "";
        }
        const command = drawing ? "L" : "M";
        drawing = true;
        return `${command}${centerX(index)},${scaleY(value, max)}`;
      })
      .filter(Boolean)
      .join(" ");
  };

  return (
    <section className="as-panel as-chart">
      <div className="as-section-title">
        <div>
          <p className="as-eyebrow">PRODUCTION TREND</p>
          <h2>{title}</h2>
        </div>
        <div className="as-chart-modes">
          <div className="as-mode-switch" role="group" aria-label="รูปแบบกราฟ">
            <button
              type="button"
              aria-pressed={mode === "line"}
              onClick={() => setMode("line")}
            >
              <LineChart size={16} aria-hidden /> กราฟเส้น
            </button>
            <button
              type="button"
              aria-pressed={mode === "bar"}
              onClick={() => setMode("bar")}
            >
              <BarChart3 size={16} aria-hidden /> แท่งคู่เทียบปีก่อน
            </button>
          </div>
          {mode === "line" && (
            <label className="as-check">
              <input
                type="checkbox"
                checked={compare}
                onChange={(event) => setCompare(event.target.checked)}
              />{" "}
              เทียบเดือนเดียวกันปีก่อน
            </label>
          )}
        </div>
      </div>
      <p className="as-chart-range">
        {points.length
          ? `${monthLabel(points[0].month, true)} – ${monthLabel(points[points.length - 1].month, true)}`
          : "ไม่มีช่วงเดือน"}{" "}
        · หน่วย (kWh) · 1 หน่วย = 1 kWh
      </p>
      <p className="as-chart-scope">{scopeNote}</p>
      <div ref={wrapRef} className="as-chart-canvas">
        <ChartSvg
          points={points}
          width={width}
          max={max}
          mode={mode}
          showPrevious={showPrevious}
          slot={slot}
          centerX={centerX}
          linePath={linePath}
          activeMonth={activeMonth}
        />
      </div>
      <div className="as-chart-legend">
        <span>
          <i /> เดือนที่เลือก (เส้นทึบ/แท่งทึบ)
        </span>
        {showPrevious && (
          <span>
            <i className="as-line-previous" /> เดือนเดียวกันปีก่อน (เส้นประ/แท่งลาย)
          </span>
        )}
      </div>
      <div className="as-month-buttons" aria-label="เลือกเดือนเพื่ออ่านค่ากราฟ">
        {points.map((point) => (
          <button
            key={point.month}
            type="button"
            aria-label={`อ่านค่า ${monthLabel(point.month)}`}
            aria-pressed={activeMonth === point.month}
            onClick={() => {
              setActive(point.month);
              onMonth?.(point.month);
            }}
          >
            {monthLabel(point.month, true).split(" ")[0]}
          </button>
        ))}
      </div>
      <p className="as-chart-tooltip" aria-live="polite">
        {current ? readingSentence(current, cohortMode) : "เลือกเดือนเพื่ออ่านค่า"}
      </p>
      <p className="as-muted">
        ช่องว่างคือเดือนที่ไม่มีค่าที่ใช้ได้ ไม่ใช่ศูนย์ · เส้นขาดเมื่อไม่มีข้อมูล
        {cohortMode
          ? " · เปอร์เซ็นต์เปลี่ยนคิดจากกลุ่มไซต์ที่มีค่าทั้งสองช่วงเท่านั้น ไม่ใช่ยอดรวมทั้งพอร์ต"
          : ""}
      </p>
      <details>
        <summary>ดูค่ากราฟแบบตารางข้อความ</summary>
        <ChartTable points={points} cohortMode={cohortMode} />
      </details>
    </section>
  );
}

function readingSentence(point: ComparisonChartPoint, cohortMode: boolean) {
  const head = `${monthLabel(point.month)}: ${number(point.value)}${
    point.value === null ? "" : " หน่วย"
  }`;
  const coverage =
    point.siteCount === undefined ? "" : ` (รวมจาก ${point.siteCount} ไซต์ที่มีค่า)`;
  const prior = ` · เดือนเดียวกันปีก่อน ${number(point.previous)}${
    point.previous === null ? "" : " หน่วย"
  }${
    point.previousSiteCount === undefined
      ? ""
      : ` (${point.previousSiteCount} ไซต์)`
  }`;

  if (!cohortMode) {
    return `${head}${coverage}${prior}`;
  }
  if (!point.cohortSiteCount) {
    return `${head}${coverage}${prior} · ไม่มีไซต์ที่มีค่าทั้งสองช่วง เทียบปีต่อปีไม่ได้`;
  }
  return `${head}${coverage}${prior} · เปรียบกลุ่มไซต์เดิม ${point.cohortSiteCount} ไซต์: ${number(point.cohortCurrentKwh)} เทียบ ${number(point.cohortPreviousKwh)} หน่วย · ผลต่าง ${signedNumber(point.cohortDeltaKwh)} หน่วย · ${percentLabel(point.cohortDeltaPct)}`;
}

function ChartSvg({
  points,
  width,
  max,
  mode,
  showPrevious,
  slot,
  centerX,
  linePath,
  activeMonth,
}: {
  points: ComparisonChartPoint[];
  width: number;
  max: number;
  mode: "line" | "bar";
  showPrevious: boolean;
  slot: number;
  centerX: (index: number) => number;
  linePath: (field: "value" | "previous") => string;
  activeMonth: string;
}) {
  const baseline = PLOT.height - PLOT.bottom;
  const barWidth = Math.max(4, Math.min(18, slot / (showPrevious ? 3.1 : 2.2)));
  return (
    <svg
      viewBox={`0 0 ${width} ${PLOT.height}`}
      role="img"
      aria-label={
        mode === "bar"
          ? "กราฟแท่งคู่เทียบเดือนเดียวกันปีก่อน แท่งทึบคือเดือนที่เลือก แท่งลายคือปีก่อน อ่านค่าเป็นข้อความได้ในตารางด้านล่าง"
          : "กราฟเส้นผลผลิตย้อนหลัง เส้นทึบคือเดือนที่เลือก เส้นประคือปีก่อน อ่านค่าเป็นข้อความได้ในตารางด้านล่าง"
      }
    >
      <defs>
        <pattern
          id="as-prev-hatch"
          width="5"
          height="5"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <rect width="5" height="5" fill="#fdf3e4" />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="5"
            stroke="#995619"
            strokeWidth="2.4"
          />
        </pattern>
      </defs>
      {[0, 0.5, 1].map((fraction) => (
        <g key={fraction}>
          <line
            x1={PLOT.left}
            x2={width - PLOT.right}
            y1={scaleY(max * fraction, max)}
            y2={scaleY(max * fraction, max)}
            stroke="#dce3e8"
            strokeDasharray="3 5"
          />
          <text
            x={PLOT.left - 8}
            y={scaleY(max * fraction, max) + 4}
            textAnchor="end"
            fontSize="12"
            fill="#526173"
          >
            {number((max * fraction) / 1000, 1)}k
          </text>
        </g>
      ))}
      {mode === "bar"
        ? points.map((point, index) => {
            const center = centerX(index);
            const gap = showPrevious ? barWidth / 2 + 1.5 : 0;
            return (
              <g key={point.month}>
                {point.previous !== null && showPrevious && (
                  <rect
                    x={center - gap - barWidth}
                    y={scaleY(point.previous, max)}
                    width={barWidth}
                    height={Math.max(1, baseline - scaleY(point.previous, max))}
                    fill="url(#as-prev-hatch)"
                    stroke="#995619"
                    strokeWidth="1"
                  />
                )}
                {point.value !== null && (
                  <rect
                    x={center - gap + (showPrevious ? 1.5 : -barWidth / 2)}
                    y={scaleY(point.value, max)}
                    width={barWidth}
                    height={Math.max(1, baseline - scaleY(point.value, max))}
                    fill={point.month === activeMonth ? "#0a4536" : "#10624d"}
                  />
                )}
              </g>
            );
          })
        : null}
      {mode === "line" && (
        <>
          {showPrevious && (
            <path
              d={linePath("previous")}
              fill="none"
              stroke="#995619"
              strokeWidth="2.5"
              strokeDasharray="7 5"
            />
          )}
          <path
            d={linePath("value")}
            fill="none"
            stroke="#10624d"
            strokeWidth="3"
          />
          {points.map((point, index) =>
            point.value === null ? null : (
              <circle
                key={point.month}
                cx={centerX(index)}
                cy={scaleY(point.value, max)}
                r={point.month === activeMonth ? 5.5 : 4}
                fill="#10624d"
                stroke="#fff"
                strokeWidth={point.month === activeMonth ? 2 : 0}
              />
            ),
          )}
        </>
      )}
      {points.map((point, index) => (
        <text
          key={`label-${point.month}`}
          x={centerX(index)}
          y={PLOT.height - 14}
          textAnchor="middle"
          fontSize="12"
          fill={point.month === activeMonth ? "#10624d" : "#526173"}
          fontWeight={point.month === activeMonth ? 700 : 400}
        >
          {point.month.slice(5)}
        </text>
      ))}
    </svg>
  );
}

function ChartTable({
  points,
  cohortMode,
}: {
  points: ComparisonChartPoint[];
  cohortMode: boolean;
}) {
  return (
    <div className="as-chart-table-wrap">
      <table className="as-chart-table">
        <caption>
          ค่าที่ใช้วาดกราฟ · &quot;ไม่มีข้อมูล&quot; ไม่ใช่ศูนย์
          {cohortMode ? " · คอลัมน์กลุ่มไซต์เดิมคือฐานเปรียบเทียบปีต่อปี" : ""}
        </caption>
        <thead>
          <tr>
            <th scope="col">เดือน</th>
            <th scope="col">เดือนที่เลือก (หน่วย)</th>
            <th scope="col">ปีก่อน (หน่วย)</th>
            {cohortMode && <th scope="col">กลุ่มไซต์เดิม</th>}
            <th scope="col">ผลต่าง (หน่วย)</th>
            <th scope="col">เปลี่ยนแปลง</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => {
            const currentValue = cohortMode
              ? point.cohortCurrentKwh
              : point.value;
            const baseValue = cohortMode
              ? point.cohortPreviousKwh
              : point.previous;
            const delta =
              currentValue == null || baseValue == null
                ? null
                : currentValue - baseValue;
            const pct =
              delta == null || baseValue == null || baseValue <= 0
                ? null
                : delta / baseValue;
            return (
              <tr key={point.month}>
                <th scope="row">{monthLabel(point.month, true)}</th>
                <td>
                  {number(point.value)}
                  {point.siteCount === undefined
                    ? ""
                    : ` · ${point.siteCount} ไซต์`}
                </td>
                <td>
                  {number(point.previous)}
                  {point.previousSiteCount === undefined
                    ? ""
                    : ` · ${point.previousSiteCount} ไซต์`}
                </td>
                {cohortMode && (
                  <td>
                    {point.cohortSiteCount
                      ? `${point.cohortSiteCount} ไซต์ · ${number(point.cohortCurrentKwh)} / ${number(point.cohortPreviousKwh)}`
                      : "ไม่มีไซต์ที่มีค่าทั้งสองช่วง"}
                  </td>
                )}
                <td>{delta == null ? "คำนวณไม่ได้" : signedNumber(delta)}</td>
                <td>{percentLabel(pct)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
