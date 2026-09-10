import Link from "next/link";
import { manualSections, manualVersion } from "@/src/lib/user-manual";
import "../prototype/prototype.css";
import "./help.css";
export const metadata = { title: "วิธีใช้งาน V2 | AnalysisSolar" };
export default function Help() {
  return (
    <div className="as-prototype as-help">
      <header className="as-topbar">
        <Link className="as-brand" href="/">
          AnalysisSolar
        </Link>
        <nav className="as-topnav" aria-label="คู่มือ">
          <Link href="/">กลับหน้าใช้งาน</Link>
          <a href="/manual/AnalysisSolar-V2-User-Guide.pdf" download>
            ดาวน์โหลด PDF
          </a>
        </nav>
      </header>
      <main className="as-main">
        <p className="as-eyebrow">USER GUIDE</p>
        <h1>วิธีใช้งาน AnalysisSolar V2</h1>
        <p>{manualVersion} · คู่มือพร้อมภาพ กดชื่อหัวข้อเพื่อข้ามไปอ่านได้</p>
        <p className="as-notice">
          ดาวน์โหลด Excel และกดนำเข้าเอง ส่วน AI
          เริ่มอัตโนมัติหลังนำเข้าสำเร็จเมื่อเซิร์ฟเวอร์และ API key พร้อม
          ยังไม่มีการตั้งเวลาดาวน์โหลดในหน้าเว็บ
        </p>
        <nav className="as-help-toc" aria-label="สารบัญวิธีใช้งาน">
          {manualSections.map((s, i) => (
            <a href={`#${s.id}`} key={s.id}>
              {i + 1}. {s.title}
            </a>
          ))}
        </nav>
        {manualSections.map((s, i) => (
          <section className="as-panel as-help-section" id={s.id} key={s.id}>
            <h2>
              {i + 1}. {s.title}
            </h2>
            {"example" in s && s.example && (
              <p className="as-notice">
                ภาพตัวอย่างอธิบายฟอร์ม ไม่ได้บันทึกเป็นงานจริง
              </p>
            )}
            <div className="as-help-content">
              <a
                href={`/manual/v2/${s.image}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`เปิดภาพขยาย: ${s.title}`}
              >
                <img
                  src={`/manual/v2/${s.image}`}
                  alt={s.title}
                  loading="lazy"
                />
                {"extraImage" in s && (
                  <img
                    src={`/manual/v2/${s.extraImage}`}
                    alt={`ภาพประกอบเพิ่มเติม: ${s.title}`}
                    loading="lazy"
                  />
                )}
              </a>
              <div>
                <ol>
                  {s.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="as-notice">{s.note}</p>
              </div>
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
