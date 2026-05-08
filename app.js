// PEA Solar Ops Dashboard — v2
// โฟกัสที่ Inverter Yield: MoM, ค่าเฉลี่ยตั้งแต่ติดตั้ง, YoY, ไซต์ไม่มีการผลิต, รายปี

const REQUIRED = {
  plant:           "Plant Name",
  capacity:        "Total String Capacity (kWp)",
  pvYield:         "PV Yield (kWh)",
  inverterYield:   "Inverter Yield (kWh)",
  exportKwh:       "Export (kWh)",
  specific:        "Specific Energy (kWh/kWp)",
  selfConsumption: "Self-consumption (kWh)",
  revenue:         "Revenue (฿)",
};

const THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  monthlyData: {},     // { "YYYY-MM": { plantName: { inverterYield, pvYield, … } } }
  sortedPeriods: [],   // ["2023-07", "2023-08", …] sorted ascending
  currentPeriod: null, // "YYYY-MM"
  selectedYear:  null, // integer
  searchTerm:    "",
};

// ── DOM references ─────────────────────────────────────────────────────────────

const el = {
  reportFiles:        document.querySelector("#reportFiles"),
  fileInfo:           document.querySelector("#fileInfo"),
  periodSelectorWrap: document.querySelector("#periodSelectorWrap"),
  periodSelect:       document.querySelector("#periodSelect"),
  periodDisplay:      document.querySelector("#periodDisplay"),
  demoButton:         document.querySelector("#demoButton"),

  kpiSites:  document.querySelector("#kpi-sites"),
  kpiYield:  document.querySelector("#kpi-yield"),
  kpiMom:    document.querySelector("#kpi-mom"),
  kpiMomSub: document.querySelector("#kpi-mom-sub"),
  kpiZero:   document.querySelector("#kpi-zero"),

  zeroCount:   document.querySelector("#zeroCount"),
  zeroList:    document.querySelector("#zeroList"),
  dropCount:   document.querySelector("#dropCount"),
  dropList:    document.querySelector("#dropList"),

  compareBody: document.querySelector("#compareBody"),

  yearTabs:        document.querySelector("#yearTabs"),
  annualTotal:     document.querySelector("#annualTotal"),
  annualMonths:    document.querySelector("#annualMonths"),
  annualAvgMonth:  document.querySelector("#annualAvgMonth"),
  annualChart:     document.querySelector("#annualChart"),
  annualSiteTable: document.querySelector("#annualSiteTable"),
  annualYearLabel: document.querySelector("#annualYearLabel"),

  searchBox:  document.querySelector("#searchBox"),
  plantTable: document.querySelector("#plantTable"),
};

// ── Events ────────────────────────────────────────────────────────────────────

el.reportFiles.addEventListener("change", handleFiles);
el.demoButton.addEventListener("click", loadDemo);
el.periodSelect.addEventListener("change", () => {
  state.currentPeriod = el.periodSelect.value;
  render();
});
el.searchBox.addEventListener("input", () => {
  state.searchTerm = el.searchBox.value.trim().toLowerCase();
  renderRawTable();
});
window.addEventListener("resize", () => {
  if (state.selectedYear) renderAnnualChart();
});

// ── File handling ─────────────────────────────────────────────────────────────

async function handleFiles(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  el.fileInfo.textContent = `กำลังโหลด ${files.length} ไฟล์…`;

  const results = await Promise.all(files.map(parseExcelFile));
  results.forEach(({ period, data }) => {
    if (period && data && Object.keys(data).length) {
      state.monthlyData[period] = data;
    }
  });

  const loaded = Object.keys(state.monthlyData).length;
  el.fileInfo.textContent = `โหลดแล้ว ${loaded} เดือน`;
  finalizeLoad();
}

async function parseExcelFile(file) {
  const rawPeriod = inferPeriodFromName(file.name);
  if (!rawPeriod) return { period: null, data: null };
  const period = normalizePeriod(rawPeriod);

  const buffer = await file.arrayBuffer();
  const wb     = XLSX.read(buffer, { type: "array" });
  const sheet  = wb.Sheets[wb.SheetNames[0]];
  const rows   = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  const headerIdx = rows.findIndex(r =>
    r.map(normalizeHeader).includes(REQUIRED.plant)
  );
  if (headerIdx === -1) return { period, data: null };

  const headers = rows[headerIdx].map(normalizeHeader);
  const data    = {};
  rows.slice(headerIdx + 1)
    .filter(r => r.some(c => c !== null && c !== ""))
    .forEach(row => {
      const rec  = Object.fromEntries(headers.map((h, i) => [h, row[i]]));
      const name = String(rec[REQUIRED.plant] || "").trim();
      if (!name) return;
      data[name] = extractPlant(rec);
    });

  return { period, data };
}

function extractPlant(rec) {
  const capacity      = toNum(rec[REQUIRED.capacity]);
  const pvYield       = toNum(rec[REQUIRED.pvYield]);
  const inverterYield = toNum(rec[REQUIRED.inverterYield]);
  const specific      = toNum(rec[REQUIRED.specific]) || safeDivide(pvYield, capacity);
  return {
    capacity,
    pvYield,
    inverterYield,
    specific,
    exportKwh:       toNum(rec[REQUIRED.exportKwh]),
    selfConsumption: toNum(rec[REQUIRED.selfConsumption]),
    revenue:         toNum(rec[REQUIRED.revenue]),
  };
}

function finalizeLoad() {
  state.sortedPeriods = Object.keys(state.monthlyData).sort();
  if (!state.currentPeriod || !state.monthlyData[state.currentPeriod]) {
    state.currentPeriod = state.sortedPeriods.at(-1) || null;
  }
  const years = getAvailableYears();
  if (!state.selectedYear || !years.includes(state.selectedYear)) {
    state.selectedYear = years.at(-1) || null;
  }
  render();
}

// ── Render orchestrator ───────────────────────────────────────────────────────

function render() {
  renderPeriodSelector();
  renderYearTabs();
  renderKPIs();
  renderAlerts();
  renderCompareTable();
  renderAnnual();
  renderRawTable();
  updatePeriodDisplay();
}

function updatePeriodDisplay() {
  const p = state.currentPeriod;
  if (!p) { el.periodDisplay.textContent = "ยังไม่มีข้อมูล"; return; }
  el.periodDisplay.textContent = fmtPeriodThai(p);
}

// ── Period selector ───────────────────────────────────────────────────────────

function renderPeriodSelector() {
  if (!state.sortedPeriods.length) { el.periodSelectorWrap.hidden = true; return; }
  el.periodSelectorWrap.hidden = false;
  el.periodSelect.innerHTML = [...state.sortedPeriods].reverse().map(p =>
    `<option value="${p}"${p === state.currentPeriod ? " selected" : ""}>${fmtPeriodThai(p)}</option>`
  ).join("");
}

// ── Year tabs ─────────────────────────────────────────────────────────────────

function renderYearTabs() {
  const years = getAvailableYears();
  el.yearTabs.innerHTML = years.map(y =>
    `<button class="year-tab${y === state.selectedYear ? " active" : ""}" data-year="${y}">${y + 543}</button>`
  ).join("");
  el.yearTabs.querySelectorAll(".year-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.selectedYear = parseInt(btn.dataset.year);
      renderYearTabs();
      renderAnnual();
    });
  });
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

function renderKPIs() {
  const cur   = getMonthData(state.currentPeriod);
  const prev  = getMonthData(getPrevPeriod());
  const names = Object.keys(cur);

  const totalYield = names.reduce((s, n) => s + (cur[n].inverterYield > 0 ? cur[n].inverterYield : 0), 0);
  const prevYield  = Object.values(prev).reduce((s, d) => s + (d.inverterYield > 0 ? d.inverterYield : 0), 0);
  const zeroCount  = names.filter(n => !(cur[n].inverterYield > 0)).length;

  el.kpiSites.textContent = names.length || "—";
  el.kpiYield.textContent = names.length ? `${fmtNum(totalYield, 0)} kWh` : "—";
  el.kpiZero.textContent  = names.length ? String(zeroCount) : "—";

  document.querySelector("#kpi-zero-card").classList.toggle("danger-card", zeroCount > 0);

  if (prevYield > 0 && names.length) {
    const delta = (totalYield - prevYield) / prevYield;
    el.kpiMom.textContent = fmtDelta(delta);
    el.kpiMom.className   = `kpi-delta ${delta >= 0 ? "kpi-up" : "kpi-dn"}`;
    el.kpiMomSub.textContent = `เทียบกับ ${fmtPeriodThai(getPrevPeriod())}`;
  } else {
    el.kpiMom.textContent    = "—";
    el.kpiMom.className      = "kpi-delta";
    el.kpiMomSub.textContent = getPrevPeriod()
      ? `ไม่มีข้อมูลเดือน ${fmtPeriodThai(getPrevPeriod())}`
      : "ไม่มีข้อมูลเดือนก่อน";
  }
}

// ── Alerts ────────────────────────────────────────────────────────────────────

function renderAlerts() {
  const cur  = getMonthData(state.currentPeriod);
  const prev = getMonthData(getPrevPeriod());
  const names = Object.keys(cur);

  // Zero production
  const zeros = names.filter(n => !(cur[n].inverterYield > 0));
  el.zeroCount.textContent = `${zeros.length} ไซต์`;
  el.zeroList.innerHTML = zeros.length
    ? zeros.map(name => `
        <div class="alert-row-item alert-row-item--red">
          <span class="dot dot--red"></span>
          <span class="alert-site">${escHtml(name)}</span>
          <span class="alert-tag-txt">ไม่มีข้อมูลการผลิต</span>
        </div>`).join("")
    : `<p class="empty-sm">ทุกไซต์มีการผลิตในเดือนนี้ ✓</p>`;

  // MoM drop > 20%
  const drops = names
    .filter(n => cur[n].inverterYield > 0)
    .map(name => {
      const c = cur[name].inverterYield;
      const p = prev[name]?.inverterYield;
      if (!(p > 0)) return null;
      const delta = (c - p) / p;
      return delta < -0.20 ? { name, cur: c, prev: p, delta } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.delta - b.delta);

  el.dropCount.textContent = `${drops.length} ไซต์`;
  el.dropList.innerHTML = drops.length
    ? drops.map(d => `
        <div class="alert-row-item alert-row-item--orange">
          <span class="dot dot--orange"></span>
          <div class="alert-info">
            <span class="alert-site">${escHtml(d.name)}</span>
            <span class="alert-range">${fmtNum(d.prev, 0)} → ${fmtNum(d.cur, 0)} kWh</span>
          </div>
          <span class="delta-badge delta-dn">${fmtDelta(d.delta)}</span>
        </div>`).join("")
    : `<p class="empty-sm">ไม่มีไซต์ที่ลดลงเกิน 20% ✓</p>`;
}

// ── Compare table ─────────────────────────────────────────────────────────────

function renderCompareTable() {
  const cur  = getMonthData(state.currentPeriod);
  const prev = getMonthData(getPrevPeriod());
  const yoy  = getMonthData(getYoYPeriod());
  const names = Object.keys(cur).sort((a, b) => a.localeCompare(b, "th"));

  if (!names.length) {
    el.compareBody.innerHTML = `<tr><td colspan="8" class="td-empty">อัปโหลดไฟล์หรือกดดูตัวอย่างเพื่อเริ่มต้น</td></tr>`;
    return;
  }

  el.compareBody.innerHTML = names.map(name => {
    const c   = cur[name]?.inverterYield;
    const p   = prev[name]?.inverterYield;
    const y   = yoy[name]?.inverterYield;
    const avg = getAllTimeAvg(name);
    const isZero = !(c > 0);

    return `<tr class="${isZero ? "row-zero" : ""}">
      <td class="td-site">${escHtml(name)}</td>
      <td class="td-num ${isZero ? "td-zero" : "td-bold"}">${isZero ? "ไม่มีข้อมูล" : fmtNum(c, 0)}</td>
      <td class="td-muted">${p > 0 ? fmtNum(p, 0) : "—"}</td>
      <td class="td-center">${deltaBadge(calcDelta(c, p))}</td>
      <td class="td-muted">${avg > 0 ? fmtNum(avg, 0) : "—"}</td>
      <td class="td-center">${deltaBadge(calcDelta(c, avg))}</td>
      <td class="td-muted">${y > 0 ? fmtNum(y, 0) : "—"}</td>
      <td class="td-center">${deltaBadge(calcDelta(c, y))}</td>
    </tr>`;
  }).join("");
}

// ── Annual section ────────────────────────────────────────────────────────────

function renderAnnual() {
  const y = state.selectedYear;
  if (!y) return;

  el.annualYearLabel.textContent = `รวมทั้งปี ${y + 543} (kWh)`;

  const yearPeriods = state.sortedPeriods.filter(p => p.startsWith(`${y}-`)).sort();
  if (!yearPeriods.length) {
    el.annualTotal.textContent    = "—";
    el.annualMonths.textContent   = "0 เดือน";
    el.annualAvgMonth.textContent = "—";
    el.annualSiteTable.innerHTML  = `<tr><td colspan="4" class="empty-cell">ไม่มีข้อมูลปี ${y + 543}</td></tr>`;
    return;
  }

  const monthlyTotals = {};
  let grandTotal = 0;
  yearPeriods.forEach(p => {
    const t = Object.values(getMonthData(p))
      .reduce((s, d) => s + (d.inverterYield > 0 ? d.inverterYield : 0), 0);
    monthlyTotals[p] = t;
    grandTotal += t;
  });

  el.annualTotal.textContent    = `${fmtNum(grandTotal, 0)} kWh`;
  el.annualMonths.textContent   = `${yearPeriods.length} เดือน`;
  el.annualAvgMonth.textContent = `${fmtNum(grandTotal / yearPeriods.length, 0)} kWh`;

  renderAnnualChart(y, monthlyTotals);

  const allPlants = [...new Set(yearPeriods.flatMap(p => Object.keys(getMonthData(p))))].sort((a, b) => a.localeCompare(b, "th"));
  el.annualSiteTable.innerHTML = allPlants.map(name => {
    const yields = yearPeriods
      .map(p => getMonthData(p)[name]?.inverterYield)
      .filter(v => v > 0);
    const total = yields.reduce((s, v) => s + v, 0);
    return `<tr>
      <td class="td-site">${escHtml(name)}</td>
      <td class="td-num td-bold">${fmtNum(total, 0)}</td>
      <td class="td-muted">${yields.length} / ${yearPeriods.length}</td>
      <td class="td-num">${yields.length ? fmtNum(total / yields.length, 0) : "—"}</td>
    </tr>`;
  }).join("");
}

function renderAnnualChart(year, monthlyTotals) {
  const canvas = el.annualChart;
  const W = Math.max((canvas.parentElement?.clientWidth || 700) - 36, 300);
  const H = 200;
  setCanvasSize(canvas, W, H);
  const ratio = window.devicePixelRatio || 1;
  const ctx   = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const values = months.map(p => monthlyTotals[p] || 0);
  const maxVal = Math.max(...values, 1);

  const pad = { top: 24, right: 16, bottom: 42, left: 68 };
  const drawW = W - pad.left - pad.right;
  const drawH = H - pad.top - pad.bottom;
  const barW  = drawW / 12;

  // Grid lines + Y labels
  for (let i = 0; i <= 4; i++) {
    const gy = H - pad.bottom - (drawH * i) / 4;
    ctx.strokeStyle = "#e8ede4";
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(W - pad.right, gy); ctx.stroke();
    ctx.fillStyle   = "#8a9d8f";
    ctx.font        = "11px Sarabun, ui-sans-serif, sans-serif";
    ctx.textAlign   = "right";
    ctx.fillText(fmtCompact((maxVal * i) / 4), pad.left - 6, gy + 4);
  }

  // Axes
  ctx.strokeStyle = "#c8d4c2";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, H - pad.bottom);
  ctx.lineTo(W - pad.right, H - pad.bottom); ctx.stroke();

  // Bars
  months.forEach((p, i) => {
    const val = values[i];
    const bw  = Math.max(4, barW - 8);
    const bx  = pad.left + i * barW + (barW - bw) / 2;
    const barH = val > 0 ? (drawH * val) / maxVal : 0;
    const by   = H - pad.bottom - barH;

    if (val > 0) {
      const isCurrent = p === state.currentPeriod;
      ctx.fillStyle   = isCurrent ? "#2f6f9f" : "#2c8a56";
      ctx.globalAlpha = isCurrent ? 1 : 0.72;
      ctx.fillRect(bx, by, bw, barH);
      ctx.globalAlpha = 1;

      // Value label
      if (barH > 20) {
        ctx.fillStyle = isCurrent ? "#1a4870" : "#1a5c38";
        ctx.font      = "10px Sarabun, ui-sans-serif, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(fmtCompact(val), bx + bw / 2, by - 4);
      }
    } else {
      // no-data marker
      ctx.fillStyle   = "#e8ede4";
      ctx.fillRect(bx, H - pad.bottom - 4, bw, 4);
    }

    // Month label
    ctx.fillStyle = "#6c776f";
    ctx.font      = "11px Sarabun, ui-sans-serif, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(THAI_MONTHS[i], bx + bw / 2, H - pad.bottom + 16);
  });

  // Current month indicator text
  if (state.currentPeriod?.startsWith(`${year}-`)) {
    ctx.fillStyle = "#2f6f9f";
    ctx.font      = "bold 10px Sarabun, ui-sans-serif, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("■ เดือนที่เลือกอยู่", pad.left, 14);
  }
}

// ── Raw data table ────────────────────────────────────────────────────────────

function renderRawTable() {
  const cur   = getMonthData(state.currentPeriod);
  let entries = Object.entries(cur).sort(([a], [b]) => a.localeCompare(b, "th"));

  if (state.searchTerm) {
    entries = entries.filter(([name]) => name.toLowerCase().includes(state.searchTerm));
  }

  if (!entries.length) {
    el.plantTable.innerHTML = `<tr><td colspan="8" class="td-empty">${state.searchTerm ? "ไม่พบไซต์ที่ค้นหา" : "รอข้อมูลจาก Excel"}</td></tr>`;
    return;
  }

  el.plantTable.innerHTML = entries.map(([name, d]) => {
    const isZero = !(d.inverterYield > 0);
    return `<tr class="${isZero ? "row-zero" : ""}">
      <td class="td-site">${escHtml(name)}</td>
      <td class="td-num ${isZero ? "td-zero" : "td-bold"}">${isZero ? "ไม่มีข้อมูล" : fmtNum(d.inverterYield, 0)}</td>
      <td class="td-num">${d.pvYield > 0 ? fmtNum(d.pvYield, 0) : "—"}</td>
      <td class="td-num">${d.capacity > 0 ? fmtNum(d.capacity, 2) : "—"}</td>
      <td class="td-num">${d.specific > 0 ? fmtNum(d.specific, 2) : "—"}</td>
      <td class="td-num">${Number.isFinite(d.exportKwh) ? fmtNum(d.exportKwh, 0) : "—"}</td>
      <td class="td-num">${d.selfConsumption > 0 ? fmtNum(d.selfConsumption, 0) : "—"}</td>
      <td class="td-num">${Number.isFinite(d.revenue) ? fmtNum(d.revenue, 0) : "—"}</td>
    </tr>`;
  }).join("");
}

// ── Analysis helpers ──────────────────────────────────────────────────────────

function getMonthData(period) {
  return (period && state.monthlyData[period]) || {};
}

function getPrevPeriod() {
  if (!state.currentPeriod) return null;
  const idx = state.sortedPeriods.indexOf(state.currentPeriod);
  return idx > 0 ? state.sortedPeriods[idx - 1] : null;
}

function getYoYPeriod() {
  if (!state.currentPeriod) return null;
  const [y, m] = state.currentPeriod.split("-");
  return `${parseInt(y) - 1}-${m}`;
}

function getAllTimeAvg(plantName) {
  const vals = state.sortedPeriods
    .filter(p => p <= state.currentPeriod)
    .map(p => state.monthlyData[p]?.[plantName]?.inverterYield)
    .filter(v => v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
}

function calcDelta(cur, ref) {
  return (cur > 0 && ref > 0) ? (cur - ref) / ref : NaN;
}

function getAvailableYears() {
  return [...new Set(state.sortedPeriods.map(p => parseInt(p.split("-")[0])))].sort();
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function deltaBadge(delta) {
  if (!Number.isFinite(delta)) return `<span class="delta-badge delta-na">—</span>`;
  let cls;
  if (delta >=  0.05)  cls = "delta-up";
  else if (delta >= -0.05)  cls = "delta-flat";
  else if (delta >= -0.20)  cls = "delta-warn";
  else                      cls = "delta-dn";
  return `<span class="delta-badge ${cls}">${fmtDelta(delta)}</span>`;
}

function fmtDelta(delta) {
  if (!Number.isFinite(delta)) return "—";
  const pct = Math.round(delta * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

function fmtPeriodThai(period) {
  if (!period) return "—";
  const [y, m] = period.split("-");
  return `${THAI_MONTHS[parseInt(m) - 1]} ${parseInt(y) + 543}`;
}

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_SITES = [
  { name: "SKL สนง.กฟจ.สงขลา",    cap: 20.16, base: 550 },
  { name: "KOP สนง.กฟส.โคกโพธิ์",  cap: 23.94, base: 534 },
  { name: "PTN สนง.กฟส.พัทลุง",    cap: 18.50, base: 498 },
  { name: "NKS สนง.กฟส.นครศรีฯ",   cap: 25.00, base: 610 },
  { name: "SRT สนง.กฟส.สุราษฎร์ฯ", cap: 22.00, base: 580 },
  { name: "CHM สนง.กฟส.ชุมพร",     cap: 19.20, base: 420 },
  { name: "RNG สนง.กฟส.ระนอง",     cap: 16.80, base: 390 },
  { name: "HAT สนง.กฟส.หาดใหญ่",   cap: 24.00, base: 600 },
  { name: "PHG สนง.กฟส.พังงา",     cap: 17.60, base: 410 },
  { name: "KBI สนง.กฟส.กระบี่",    cap: 21.50, base: 520 },
];

// เดือน ม.ค.–ธ.ค. ปริมาณแสงแดดต่างกัน ภาคใต้
const MF = [0.74, 0.77, 0.88, 0.96, 0.97, 0.90, 0.86, 0.89, 0.92, 0.91, 0.83, 0.76];

// seedable pseudo-random ให้ข้อมูลเหมือนเดิมทุกครั้ง
function seededRand(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function loadDemo() {
  state.monthlyData = {};
  const rand = seededRand(42);

  // 2023-07 ถึง 2026-03 = 33 เดือน
  const START_YEAR = 2023, START_MONTH = 7;
  for (let i = 0; i < 33; i++) {
    const totalM = (START_YEAR - 2000) * 12 + (START_MONTH - 1) + i;
    const y = Math.floor(totalM / 12) + 2000;
    const m = (totalM % 12) + 1;
    const period = `${y}-${String(m).padStart(2, "0")}`;
    const mf = MF[m - 1];

    const data = {};
    DEMO_SITES.forEach((site, si) => {
      const degradation = 1 - i * 0.002;
      const noise = 0.90 + rand() * 0.20;
      let iv = Math.round(site.base * mf * degradation * noise);

      // สถานการณ์พิเศษเพื่อทำให้ dashboard น่าสนใจ
      // RNG หยุดผลิต มี.ค.–เม.ย. 67 (ซ่อมอินเวอร์เตอร์)
      if (si === 6 && y === 2024 && (m === 3 || m === 4)) iv = 0;
      // PHG เสื่อมเร็วหลัง มิ.ย. 68
      if (si === 8 && y === 2025 && m >= 6) iv = Math.round(iv * (1 - (m - 5) * 0.06));
      // PTN ไม่มีข้อมูลเดือนล่าสุด
      if (si === 2 && period === "2026-03") iv = 0;
      // CHM ผลิตลดลง 30% เดือนล่าสุด (สาย DC หลวม)
      if (si === 5 && period === "2026-03") iv = Math.round(iv * 0.65);

      const pv = Math.round(iv * (1 + rand() * 0.03));
      data[site.name] = {
        capacity:        site.cap,
        pvYield:         pv,
        inverterYield:   iv,
        specific:        parseFloat((iv / site.cap).toFixed(2)),
        exportKwh:       Math.round(iv * 0.18),
        selfConsumption: Math.round(iv * 0.82),
        revenue:         Math.round(iv * 0.69),
      };
    });

    state.monthlyData[period] = data;
  }

  el.fileInfo.textContent = "ข้อมูลตัวอย่าง ก.ค. 2566 – มี.ค. 2569";
  finalizeLoad();
}

// ── Canvas helper ─────────────────────────────────────────────────────────────

function setCanvasSize(canvas, w, h) {
  const ratio   = window.devicePixelRatio || 1;
  canvas.width  = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  canvas.style.width  = `${w}px`;
  canvas.style.height = `${h}px`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function toNum(v) {
  if (v === null || v === undefined || v === "" || v === "--") return NaN;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function safeDivide(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : NaN;
}

function fmtNum(v, digits = 0) {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtCompact(v) {
  if (!Number.isFinite(v) || v === 0) return "0";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

function normalizeHeader(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function inferPeriodFromName(name) {
  const m = name.match(/(\d{2})-(\d{4})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

function normalizePeriod(raw) {
  const [mm, yyyy] = raw.split("-");
  return `${yyyy}-${mm}`;
}

function escHtml(v) {
  return String(v).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])
  );
}

// ── Nav active state ──────────────────────────────────────────────────────────

function setupNav() {
  const links    = document.querySelectorAll(".nav-link");
  const sections = [...links].map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const link = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
      if (link) link.classList.toggle("active", entry.isIntersecting);
    });
  }, { rootMargin: "-20% 0px -70% 0px" });
  sections.forEach(s => observer.observe(s));
}

setupNav();
