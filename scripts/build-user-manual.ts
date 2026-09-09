import fs from "node:fs/promises";
import { manualSections, manualVersion } from "../src/lib/user-manual";
async function main() {
const dir = "public/manual/v2";
function diagram(title: string, boxes: string[][]) {
  const w = 1040,
    n = boxes.length,
    bw = (w - 40 - (n - 1) * 18) / n;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="290" viewBox="0 0 1040 290"><rect width="1040" height="290" rx="16" fill="#f4f6f5"/><text x="24" y="38" font-family="Sarabun,Thonburi,sans-serif" font-size="23" fill="#0a4536">${title}</text>${boxes
    .map((b, i) => {
      const x = 20 + i * (bw + 18);
      return `<rect x="${x}" y="70" width="${bw}" height="180" rx="10" fill="white" stroke="#c9d9d1"/><circle cx="${x + 28}" cy="100" r="16" fill="#0f5c46"/><text x="${x + 28}" y="106" text-anchor="middle" fill="white" font-size="18" font-family="sans-serif">${i + 1}</text>${b.map((t, j) => `<text x="${x + 16}" y="${140 + j * 31}" font-family="Sarabun,Thonburi,sans-serif" font-size="${j === 0 ? 22 : 17}" fill="${j === 0 ? "#17293f" : "#52637a"}">${t}</text>`).join("")}${i < n - 1 ? `<text x="${x + bw + 3}" y="165" fill="#0f5c46" font-size="20">→</text>` : ""}`;
    })
    .join("")}</svg>`;
}
await fs.writeFile(
  `${dir}/automation.svg`,
  diagram("การทำงานใน V2: ผู้ใช้เริ่มนำเข้า แล้วระบบช่วยวิเคราะห์", [
    ["ดาวน์โหลด Excel", "ทำเองใน FusionSolar", "ยังไม่มีตั้งเวลา"],
    ["เลือกไฟล์ + นำเข้า", "ทำเองใน V2", "ตรวจเดือนก่อนกด"],
    ["AI อ่านข้อมูล", "อัตโนมัติหลังนำเข้า", "ต้องเปิดเซิร์ฟเวอร์"],
    ["แจ้งช่าง + ผลตรวจ", "ผู้ใช้ยืนยันเอง", "เก็บประวัติจริง"],
  ]),
);
await fs.writeFile(
  `${dir}/fusionsolar.svg`,
  diagram("แผนผังเมนู FusionSolar • ไม่ใช่ภาพหน้าจอของ Huawei", [
    ["Reports", "เปิดหมวดรายงาน"],
    ["Plant Report", "เลือกรายงานไซต์"],
    ["By plant", "ไม่ใช่รายอุปกรณ์"],
    ["By month", "เลือกเดือน + ไซต์"],
    ["Export", "ตรวจยอดก่อนโหลด", "รับ Excel ต้นฉบับ"],
  ]),
);
await fs.writeFile(
  `${dir}/workflow.svg`,
  diagram("สถานะงาน แยกจากความสำคัญและคุณภาพข้อมูล", [
    ["รอตรวจ", "เปิดงานจากหลักฐาน", "ยังไม่แจ้งช่างก็ได้"],
    ["แจ้งช่างแล้ว", "ผู้ดูแลยืนยันเอง", "ไม่ใช่สถานะ LINE"],
    ["ได้ผลตรวจ", "บันทึกสิ่งที่ช่างพบ", "ไม่ได้แปลว่าซ่อมจบ"],
    ["ติดตามต่อ", "เปิดงานเดิมกลับมา", "รักษาประวัติทุกครั้ง"],
  ]),
);
const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const sheets = manualSections
  .map((s, i) => {
    const side = "layout" in s && s.layout === "side";
    const crop = "crop" in s ? s.crop : null;
    return `<section class="sheet ${side ? "side" : "wide"}"><header><span>ANALYSISSOLAR / คู่มือผู้ใช้งาน</span><b>${manualVersion}</b></header><h1><em>${String(i + 1).padStart(2, "0")}</em>${s.title}</h1>${"example" in s ? '<div class="example">ภาพตัวอย่างอธิบายฟอร์ม • ไม่ใช่ผลตรวจหรือการบันทึกจริง</div>' : ""}<div class="body"><figure class="${crop ? "crop " + crop : ""}"><img src="${s.image}" alt="${esc(s.title)}"/>${"extraImage" in s ? `<img class="extra" src="${s.extraImage}" alt="ภาพประกอบเพิ่มเติม"/>` : ""}</figure><div class="instructions"><ol>${s.steps.map((t) => `<li>${esc(t)}</li>`).join("")}</ol><aside>${esc(s.note)}</aside></div></div><footer><span>วิธีใช้ฉบับมีภาพ • เปิดภาพขยายและดาวน์โหลดที่เมนู “วิธีใช้งาน”</span><span>${i + 1} / ${manualSections.length}</span></footer></section>`;
  })
  .join("");
await fs.writeFile(
  `${dir}/print.html`,
  `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>AnalysisSolar V2 คู่มือผู้ใช้งาน</title><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet"><style>
@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;color:#17293f;font-family:Sarabun,Thonburi,sans-serif;background:#e8edeb}.sheet{width:297mm;height:210mm;padding:10mm 14mm 12mm;background:white;break-after:page;position:relative}.sheet:last-child{break-after:auto}header{display:flex;justify-content:space-between;font-size:11px;color:#52637a;border-bottom:1px solid #dce4df;padding-bottom:8px}h1{font-size:27px;line-height:1.3;margin:15px 0 14px;display:flex;gap:12px;align-items:center}h1 em{font-size:20px;display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:40px;background:#0a4536;color:white;border-radius:8px;font-style:normal}.body{height:595px}.wide figure{height:345px;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;margin:0 0 10px}.wide figure img{max-height:345px;max-width:100%;object-fit:contain}.wide figure:has(.extra) img{max-height:245px}.wide figure .extra{max-height:100px}.instructions{font-size:16px;line-height:1.55}ol{margin:4px 0 12px;padding-left:28px;counter-reset:step}li{padding-left:5px;margin-bottom:8px}li::marker{font-weight:700;color:#0f5c46}aside{background:#eef5f1;border-left:4px solid #0f5c46;padding:10px 14px;font-size:14px;line-height:1.55}.side .body{display:grid;grid-template-columns:480px 1fr;gap:26px;height:575px}.side figure{margin:0;display:flex;align-items:flex-start;justify-content:center;height:565px}.side figure img{max-width:100%;max-height:565px;object-fit:contain}.side .instructions{font-size:19px;line-height:1.65}.side li{margin-bottom:16px}.side aside{font-size:16px}.example{display:inline-block;background:#fff3dd;color:#75420f;padding:5px 12px;margin-bottom:10px;font-size:13px}.side:has(.example) .body{height:545px}.side:has(.example) figure{height:535px}.side figure.crop{display:block;overflow:hidden;height:445px;border:1px solid #dde3e9;border-radius:8px}.side figure.crop img{width:480px;max-height:none;max-width:none}.side figure.crop.bottom img{transform:translateY(-400px)}footer{position:absolute;left:14mm;right:14mm;bottom:7mm;display:flex;justify-content:space-between;border-top:1px solid #dce4df;padding-top:7px;font-size:11px;color:#52637a}@media screen{.sheet{margin:16px auto;box-shadow:0 1px 10px #b7c2bb}}
</style></head><body>${sheets}</body></html>`,
);
console.log(`Prepared ${manualSections.length} A4 landscape pages.`);

}
main().catch(error => { console.error(error); process.exitCode = 1; });
