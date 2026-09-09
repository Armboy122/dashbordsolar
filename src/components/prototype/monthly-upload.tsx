"use client";
import { useEffect, useState } from "react";
import { inferReportMonthFromFilename } from "@/src/lib/import-workflow";
import type { ScoredPlant } from "@/src/types/solar";
export default function MonthlyUpload({
  selectedMonth,
}: {
  selectedMonth: string;
}) {
  const [queue, setQueue] = useState<Record<string, number> | null>(null),
    [queueError, setQueueError] = useState("");

  const [rows, setRows] = useState<ScoredPlant[]>([]),
    [name, setName] = useState(""),
    [month, setMonth] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const r = await fetch(
          `/api/analysis/jobs?month=${month || selectedMonth}`,
          { signal: c.signal, cache: "no-store" },
        );
        const d = await r.json();
        if (!r.ok) throw Error();
        if (!c.signal.aborted) {
          setQueue(d.counts);
          setQueueError("");
          timer = setTimeout(read, 10000);
        }
      } catch {
        if (!c.signal.aborted) setQueueError("อ่านสถานะคิวไม่สำเร็จ");
      }
    }
    void read();
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [selectedMonth, month]);
  async function select(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    setRows([]);
    try {
      const { parsePlantReport } = await import("@/src/lib/report-parser");
      const { scorePlants } = await import("@/src/lib/scoring");
      const parsed = await parsePlantReport(file);
      setRows(scorePlants(parsed));
      setName(file.name);
      setMonth(inferReportMonthFromFilename(file.name) || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านไฟล์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/reports/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: name, reportMonth: month, rows }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw Error(result.error || "นำเข้าไม่สำเร็จ");
      setMessage(
        `นำเข้าสำเร็จ ${result.imported} ไซต์ · ${result.aiAnalysis?.status === "queued" ? `AI เข้าคิว ${result.aiAnalysis.queued} ไซต์ และจะวิเคราะห์อัตโนมัติ` : result.aiAnalysis?.status === "waiting_configuration" ? "AI รอการตั้งค่า key" : result.aiAnalysis?.message || "ตรวจสถานะคิว AI"}`,
      );
      setRows([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="as-panel">
      <h2>อัปโหลดรายงานเดือนใหม่</h2>
      <p>
        นำเข้ารายงานก่อน แล้ว AI จะวิเคราะห์ทุกไซต์ในไฟล์พร้อมประวัติซ่อมที่มี
        บันทึกผลไว้ดูย้อนหลัง ไม่ต้องเปิดหน้ารอ
      </p>
      <label>
        ไฟล์ Plant Report
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={busy}
          onChange={(e) => void select(e.target.files?.[0])}
        />
      </label>
      {rows.length > 0 && (
        <>
          <p>
            {name} · พบ {rows.length} ไซต์ · ค่าที่ขาดยังคงเป็นไม่มีข้อมูล
          </p>
          <label>
            ยืนยันเดือนของรายงาน
            <input
              type="month"
              required
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <p className="as-muted">
            การนำเข้าใช้ระบบเดิมและอาจอัปเดตข้อมูลเดือนที่มีอยู่ การวิเคราะห์ AI
            เริ่มเฉพาะเมื่อนำเข้าสำเร็จ
          </p>
          <button
            className="as-button"
            disabled={busy || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)}
            onClick={upload}
          >
            นำเข้าและเริ่มวิเคราะห์อัตโนมัติ
          </button>
        </>
      )}
      <div className="as-queue-summary">
        <h3>คิว AI · {month || selectedMonth}</h3>
        <p>
          ทุกงานของเดือนนี้ รวมการวิเคราะห์ซ้ำ · ไม่ใช่จำนวนไซต์ในขอบเขตแดชบอร์ด
        </p>
        {queue ? (
          <p>
            รอคิว {queue.queued || 0} · กำลังวิเคราะห์ {queue.running || 0} ·
            บันทึกผลแล้ว {queue.succeeded || 0} · ไม่สำเร็จ {queue.failed || 0}
          </p>
        ) : (
          <p role="status">{queueError || "กำลังอ่านคิว…"}</p>
        )}
        <p className="as-muted">
          เปิดเซิร์ฟเวอร์นี้ไว้เพื่อทำงานต่อ ดูผลและประวัติในรายละเอียดแต่ละไซต์
        </p>
      </div>
      {busy && <p role="status">กำลังดำเนินการ…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
