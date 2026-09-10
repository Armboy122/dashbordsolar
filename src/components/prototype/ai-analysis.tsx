"use client";
import { useEffect, useRef, useState } from "react";
import { Info, Sparkles, Brain } from "lucide-react";
import { monthLabel, number } from "@/src/lib/prototype-model";
import type { SolarAiResult } from "@/src/types/solar-ai";

export default function AiAnalysis({
  site,
  month,
}: {
  site: string;
  month: string;
}) {
  const [config, setConfig] = useState<{
      configured: boolean;
      model: string;
    } | null>(null),
    [configError, setConfigError] = useState(""),
    [configRetry, setConfigRetry] = useState(0);
  const [result, setResult] = useState<SolarAiResult | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [jobs, setJobs] = useState<
    {
      id: string;
      status: string;
      createdAt: string;
      lastError: string | null;
      result: SolarAiResult | null;
    }[]
  >([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRefresh, setHistoryRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setJobs([]);
    setHistoryLoaded(false);
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const r = await fetch(
          `/api/analysis/history?site=${encodeURIComponent(site)}&month=${month}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || "อ่านประวัติไม่สำเร็จ");
        if (controller.signal.aborted) return;
        setJobs(d.jobs);
        setHistoryLoaded(true);
        setHistoryError("");
        const saved = d.jobs.find(
          (j: { result: SolarAiResult | null }) => j.result,
        )?.result;
        setResult(saved ?? null);
        if (
          d.jobs.some((j: { status: string }) =>
            ["queued", "running"].includes(j.status),
          )
        )
          timer = setTimeout(read, 10000);
      } catch {
        if (!controller.signal.aborted)
          setHistoryError("อ่านประวัติ AI ไม่สำเร็จ");
      }
    }
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [site, month, historyRefresh]);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setConfigError("");
    fetch("/api/analysis/site", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data = await r.json();
        if (!controller.signal.aborted) setConfig(data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setConfigError("ตรวจสถานะ Gemini ไม่สำเร็จ");
      });
    return () => controller.abort();
  }, [configRetry]);
  useEffect(
    () => () => {
      pending.current?.abort();
    },
    [],
  );
  async function analyze() {
    if (loading) return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/analysis/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, month }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || !data.ok)
        throw new Error(data.error || "วิเคราะห์ไม่สำเร็จ");
      if (!controller.signal.aborted) {
        setResult(data);
        setHistoryRefresh((v) => v + 1);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "วิเคราะห์ไม่สำเร็จ กรุณาลองใหม่",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return (
    <section className="as-panel as-ai" aria-labelledby="ai-title">
      <div className="as-section-title">
        <div>
          <h2 id="ai-title">
            <Sparkles size={21} /> ข้อมูลเชิงลึกจาก AI
          </h2>
        </div>
        <span className="as-pill">ข้อเสนอ AI · ยังไม่ยืนยัน</span>
      </div>
      <p>
        ให้ AI ช่วยอ่านข้อมูลเดือน {monthLabel(month)} และประวัติย้อนหลัง
        พร้อมเสนอสาเหตุที่เป็นไปได้และสิ่งที่ควรตรวจต่อ
      </p>
      <details>
        <summary>AI ใช้ข้อมูลอะไรและทำงานเมื่อไร</summary>
        <p className="as-muted">
          หลังนำเข้าไฟล์สำเร็จ ระบบเข้าคิววิเคราะห์แต่ละไซต์อัตโนมัติ
          และเก็บผลไว้ดูย้อนหลัง ส่งตัวเลขย้อนหลังสูงสุด 25
          เดือนและบันทึกซ่อมจริงไม่เกิน 50 รายการถึงเดือนที่เลือกให้ Google
          Gemini ไม่ส่งชื่อไซต์จากทะเบียนหรือบัญชี Huawei
          โปรดไม่ใส่ข้อมูลลับในบันทึกซ่อม
        </p>
      </details>
      {historyError && (
        <p role="alert">
          {historyError}{" "}
          <button onClick={() => setHistoryRefresh((v) => v + 1)}>
            โหลดประวัติอีกครั้ง
          </button>
        </p>
      )}
      {jobs.length > 0 && (
        <details className="as-job-history">
          <summary>ประวัติ AI เดือนนี้ · {jobs.length} รายการล่าสุด</summary>
          {jobs.map((j) => (
            <div key={j.id}>
              <span>
                {new Date(j.createdAt).toLocaleString("th-TH")} ·{" "}
                {{
                  queued: "รอคิว",
                  running: "กำลังวิเคราะห์",
                  succeeded: "บันทึกผลแล้ว",
                  failed: "วิเคราะห์ไม่สำเร็จ",
                }[j.status] || j.status}
              </span>
              {j.lastError && <p>{j.lastError}</p>}
              {j.result && (
                <button onClick={() => setResult(j.result)}>
                  ดูผลครั้งนี้
                </button>
              )}
            </div>
          ))}
        </details>
      )}
      {jobs.some((j) => ["queued", "running"].includes(j.status)) && (
        <p role="status">
          มีงานรอคิวหรือกำลังวิเคราะห์ · ผลด้านล่างอาจเป็นครั้งก่อน
          ระบบจะอัปเดตเมื่อเสร็จ
        </p>
      )}
      {!historyLoaded && !historyError && (
        <p role="status">กำลังอ่านผลวิเคราะห์ที่บันทึกไว้…</p>
      )}
      {historyLoaded &&
        !historyError &&
        !result &&
        !loading &&
        !jobs.some((j) => ["queued", "running"].includes(j.status)) && (
          <div className="as-empty-history as-empty-ai">
            <Brain size={34} />
            <h3>ยังไม่มีผลวิเคราะห์เดือนนี้</h3>
            <p>AI จะเข้าคิวหลังนำเข้าไฟล์สำเร็จ หรือกดวิเคราะห์ด้านล่าง</p>
          </div>
        )}
      {configError ? (
        <div role="alert">
          <p>{configError}</p>
          <button onClick={() => setConfigRetry((v) => v + 1)}>
            ตรวจการเชื่อมต่ออีกครั้ง
          </button>
        </div>
      ) : config ? (
        config.configured ? (
          <button className="as-button" onClick={analyze} disabled={loading}>
            <Sparkles size={17} />
            {loading
              ? "กำลังวิเคราะห์…"
              : result
                ? "วิเคราะห์ใหม่ด้วย Gemini"
                : "วิเคราะห์ด้วย Gemini"}
          </button>
        ) : (
          <div className="as-notice">
            <Info size={18} />
            <div>
              <strong>ยังไม่ได้ตั้งค่า Gemini API</strong>
              <p>
                ผู้ดูแลระบบเพิ่ม GEMINI_API_KEY ใน .env.local ฝั่งเซิร์ฟเวอร์
                แล้วเปิดระบบใหม่ ไม่ต้องใส่ key ในหน้านี้
              </p>
              <button onClick={() => setConfigRetry((v) => v + 1)}>
                ตรวจการตั้งค่าอีกครั้ง
              </button>
            </div>
          </div>
        )
      ) : (
        <p role="status">กำลังตรวจการตั้งค่า Gemini…</p>
      )}
      {loading && (
        <p role="status">Gemini กำลังอ่านหลักฐาน อาจใช้เวลาประมาณ 45 วินาที…</p>
      )}
      {error && (
        <p role="alert" className="as-notice">
          {error} · ยังไม่มีผลวิเคราะห์ใหม่
        </p>
      )}
      {result && (
        <div className="as-ai-result">
          <details>
            <summary>ข้อมูลอ้างอิงและเวลาวิเคราะห์</summary>
            <AiProvenance result={result} />
          </details>
          <p className="as-notice">
            <Info size={18} /> เนื้อหาต่อไปนี้สร้างโดย AI อาจคลาดเคลื่อน
            ไม่ใช่สาเหตุที่ช่างยืนยัน ผลนี้อ้างอิงข้อมูล ณ เวลาที่วิเคราะห์
            หากนำเข้าไฟล์หรือเพิ่มประวัติซ่อมภายหลัง
            ต้องวิเคราะห์ใหม่เพื่อรวมข้อมูลล่าสุด
          </p>
          <h3>AI สรุปจากข้อมูล</h3>
          <p>{result.analysis.summary}</p>
          <details>
            <summary>อ่านสาเหตุที่เป็นไปได้และหลักฐาน</summary>
            <h3>สาเหตุที่เป็นไปได้ · ยังไม่ยืนยัน</h3>
            {result.analysis.hypotheses.length === 0 ? (
              <p>AI ไม่มีข้อสันนิษฐานที่เสนอได้จากข้อมูลชุดนี้</p>
            ) : (
              result.analysis.hypotheses.map((h, i) => (
                <article className="as-ai-hypothesis" key={i}>
                  <h4>
                    {i + 1}. {h.title}
                  </h4>
                  <p>{h.explanation}</p>
                  <div className="as-ai-refs">
                    หลักฐานที่ AI อ้าง:
                    {h.evidenceIds.map((id) => {
                      const e = result.evidence.find((e) => e.id === id);
                      return e ? (
                        <a key={id} href={`#ai-${id}`}>
                          {monthLabel(e.month, true)} ·{" "}
                          {e.hasReport
                            ? `${number(e.inverterYieldKwh)}${e.inverterYieldKwh === null ? "" : " kWh"}`
                            : "ขาดรายงาน"}
                        </a>
                      ) : result.repairs?.some((r) => r.id === id) ? (
                        <a key={id} href={`#ai-${id}`}>
                          บันทึกซ่อม{" "}
                          {result.repairs.find((r) => r.id === id)?.occurredOn}
                        </a>
                      ) : null;
                    })}
                  </div>
                  <strong>ตรวจต่อ</strong>
                  <ol>
                    {h.checks.map((c, j) => (
                      <li key={j}>{c}</li>
                    ))}
                  </ol>
                </article>
              ))
            )}
            <div className="as-evidence-grid">
              <div>
                <h3>ข้อสังเกตคุณภาพข้อมูลจาก AI</h3>
                <ul>
                  {result.analysis.dataQualityNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>ข้อจำกัดที่ต้องพิจารณา</h3>
                <ul>
                  {result.analysis.limitations.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="as-muted">
              โมเดล {result.model} · วิเคราะห์เมื่อ{" "}
              {new Date(result.generatedAt).toLocaleString("th-TH", {
                timeZone: "Asia/Bangkok",
              })}{" "}
              · เก็บเป็นประวัติ AI แยกจากผลตรวจของช่าง
            </p>
            <details>
              <summary>ข้อมูลจริงที่ส่งให้ AI และรุ่นคำสั่ง</summary>
              <p className="as-muted">
                Prompt: {result.promptVersion} · ลายนิ้วมือข้อมูล:{" "}
                {result.inputHash}
              </p>
            </details>
            <details>
              <summary>
                ประวัติซ่อมที่ใช้ประกอบ ({result.repairs?.length || 0})
              </summary>
              {result.repairs?.length ? (
                result.repairs.map((r) => (
                  <article id={`ai-${r.id}`} key={r.id} tabIndex={-1}>
                    <h4>
                      {r.occurredOn} · {r.category}
                    </h4>
                    <p>พบ: {r.findings}</p>
                    <p>ดำเนินการ: {r.actionTaken}</p>
                    <p>หลักฐานยืนยัน: {r.verificationEvidence || "ยังไม่มี"}</p>
                  </article>
                ))
              ) : (
                <p>ไม่มีบันทึกซ่อมถึงเดือนนี้ในข้อมูลที่ส่งให้ AI</p>
              )}
            </details>
            <div className="as-ai-evidence" aria-label="หลักฐานต้นทางของ AI">
              {result.evidence
                .filter(
                  (e) =>
                    e.hasReport ||
                    result.analysis.hypotheses.some((h) =>
                      h.evidenceIds.includes(e.id),
                    ),
                )
                .map((e) => (
                  <div id={`ai-${e.id}`} key={e.id} tabIndex={-1}>
                    <strong>{monthLabel(e.month, true)}</strong>
                    <span>
                      {e.hasReport ? "มีรายงาน" : "ขาดรายงาน"} · ผลผลิต{" "}
                      {number(e.inverterYieldKwh)}
                      {e.inverterYieldKwh === null ? "" : " kWh"}
                    </span>
                    <small>
                      กำลังติดตั้ง {number(e.capacityKwp)} kWp · ใช้เอง{" "}
                      {number(e.selfConsumptionKwh)} kWh · ส่งออก{" "}
                      {number(e.exportKwh)} kWh · ใช้ไฟ{" "}
                      {number(e.consumptionKwh)} kWh
                    </small>
                  </div>
                ))}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

/**
 * Provenance for a saved AI result.
 *
 * A stored result describes the evidence snapshot from its own run. It is not
 * re-verified against later imports, so the run time, model and evidence range
 * are shown and no claim is made that it reflects the newest data.
 */
function AiProvenance({ result }: { result: SolarAiResult }) {
  const months = result.evidence
    .map((item) => item.month)
    .filter((month) => /^\d{4}-\d{2}$/.test(month))
    .sort();
  const generated = result.generatedAt ? new Date(result.generatedAt) : null;
  const generatedText =
    generated && !Number.isNaN(generated.getTime())
      ? generated.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
      : "ไม่ทราบเวลา";
  return (
    <div className="as-ai-provenance">
      <strong>ที่มาของข้อเสนอนี้</strong>
      <dl>
        <div>
          <dt>เวลาที่สร้างผล</dt>
          <dd>{generatedText} (เวลาไทย)</dd>
        </div>
        <div>
          <dt>โมเดลและรุ่น prompt</dt>
          <dd>
            {result.model || "ไม่ทราบ"} · {result.promptVersion || "ไม่ทราบ"}
          </dd>
        </div>
        <div>
          <dt>หลักฐานที่ใช้</dt>
          <dd>
            ข้อมูลรายเดือน {result.evidence.length} จุด
            {months.length
              ? ` · ${monthLabel(months[0], true)} – ${monthLabel(months[months.length - 1], true)}`
              : ""}{" "}
            · บันทึกซ่อม {result.repairs?.length ?? 0} รายการ
          </dd>
        </div>
      </dl>
      <p>
        ผลนี้อธิบายหลักฐานเท่าที่มีอยู่ ณ เวลาที่สร้าง
        ยังไม่ได้ตรวจซ้ำกับข้อมูลที่นำเข้าภายหลัง
        จึงไม่ยืนยันว่าเป็นผลจากข้อมูลล่าสุด
        หากต้องการผลที่อ้างข้อมูลปัจจุบันต้องสั่งวิเคราะห์ใหม่เป็นรายไซต์
      </p>
    </div>
  );
}
