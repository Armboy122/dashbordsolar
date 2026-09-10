"use client";
import { useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";
import type { RepairRecord } from "@/src/types/maintenance";
const outcomes: Record<RepairRecord["outcome"], string> = {
  unknown: "ยังไม่ทราบผล",
  follow_up: "ต้องดำเนินการต่อ",
  reported_fixed: "ช่างแจ้งว่าแก้แล้ว · รอยืนยัน",
  verified_resolved: "ผู้ดูแลบันทึกว่ายืนยันแล้ว",
};
export default function MaintenanceHistory({ site }: { site: string }) {
  const [records, setRecords] = useState<RepairRecord[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [success, setSuccess] = useState(""),
    [refresh, setRefresh] = useState(0);
  const blank = {
    occurredOn: new Date().toLocaleDateString("sv-SE", {
      timeZone: "Asia/Bangkok",
    }),
    category: "ตรวจสอบข้อมูล",
    findings: "",
    actionTaken: "",
    outcome: "unknown" as RepairRecord["outcome"],
    verificationEvidence: "",
    recordedBy: "",
  };
  const [form, setForm] = useState(blank);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    fetch(`/api/maintenance?site=${encodeURIComponent(site)}`, {
      signal: c.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.ok) throw Error(d.error);
        if (!c.signal.aborted) {
          setRecords(d.records);
          setError("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message || "โหลดประวัติไม่สำเร็จ");
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [site, refresh]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const r = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, siteName: site }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw Error(d.error);
      setRecords((v) => [d.record, ...v]);
      setSuccess("บันทึกประวัติซ่อมลงระบบแล้ว");
      setForm({ ...blank, recordedBy: form.recordedBy });
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="as-panel as-maintenance">
      <h2>ไทม์ไลน์การซ่อม / การดำเนินการ</h2>
      <p>บันทึกจริงของไซต์นี้ · รวมทุกเดือน ล่าสุดไม่เกิน 200 รายการ</p>
      <details className="as-repair-privacy">
        <summary>การใช้ประวัติประกอบ AI</summary>
        <p className="as-muted">
          AI ใช้บันทึกที่เกิดขึ้นไม่เกินเดือนที่กำลังวิเคราะห์ สูงสุด 50 รายการ
          ข้อความบันทึกจะถูกส่งให้ Gemini
          จึงไม่ควรใส่รหัสผ่านหรือข้อมูลส่วนตัวที่ไม่จำเป็น
        </p>
      </details>
      {loading ? (
        <p role="status">กำลังอ่านประวัติ…</p>
      ) : error && records.length === 0 ? null : records.length === 0 ? (
        <div className="as-empty-history">
          <FileText size={34} />
          <h3>ยังไม่มีบันทึกซ่อม</h3>
          <p>บันทึกการซ่อม การแก้ไข หรือการดำเนินการจะแสดงที่นี่</p>
          <small>ไม่ได้หมายความว่าไซต์นี้ไม่เคยซ่อม</small>
        </div>
      ) : (
        <ol className="as-repair-timeline">
          {records.map((r) => (
            <li key={r.id}>
              <strong>
                {r.occurredOn} · {r.category}
              </strong>
              <p>พบ: {r.findings}</p>
              <p>ทำ: {r.actionTaken}</p>
              <span className="as-pill">{outcomes[r.outcome]}</span>
              {r.verificationEvidence && (
                <p>หลักฐานยืนยัน: {r.verificationEvidence}</p>
              )}
              <small>
                ผู้บันทึกระบุชื่อ: {r.recordedBy} · บันทึกเมื่อ{" "}
                {new Date(r.createdAt).toLocaleString("th-TH")}
              </small>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <div role="alert">
          <p>{error} · ข้อความที่กรอกยังอยู่</p>
          <button onClick={() => setRefresh((v) => v + 1)}>
            โหลดประวัติใหม่
          </button>
        </div>
      )}
      {success && <p role="status">{success}</p>}
      <details>
        <summary className="as-add-repair">
          <Plus size={18} /> เพิ่มบันทึกซ่อมจริง
        </summary>
        <form onSubmit={save} className="as-maintenance-form">
          <label>
            วันที่ตรวจหรือดำเนินการ
            <input
              type="date"
              required
              value={form.occurredOn}
              max={blank.occurredOn}
              onChange={(e) => setForm({ ...form, occurredOn: e.target.value })}
            />
          </label>
          <label>
            ประเภท
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option>ตรวจสอบข้อมูล</option>
              <option>ทำความสะอาด</option>
              <option>ซ่อมหรือเปลี่ยนอุปกรณ์</option>
              <option>ปรับตั้งค่าหรือแก้การเชื่อมต่อ</option>
              <option>อื่น ๆ</option>
            </select>
          </label>
          <label>
            พบอะไร
            <textarea
              required
              maxLength={1500}
              value={form.findings}
              onChange={(e) => setForm({ ...form, findings: e.target.value })}
            />
          </label>
          <label>
            ซ่อมหรือแก้อะไรไป
            <textarea
              required
              maxLength={1500}
              value={form.actionTaken}
              onChange={(e) =>
                setForm({ ...form, actionTaken: e.target.value })
              }
            />
          </label>
          <label>
            ผลและการยืนยัน
            <select
              value={form.outcome}
              onChange={(e) =>
                setForm({
                  ...form,
                  outcome: e.target.value as RepairRecord["outcome"],
                })
              }
            >
              {Object.entries(outcomes).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {form.outcome === "verified_resolved" && (
            <label>
              หลักฐานหรือเหตุผลที่ยืนยัน (จำเป็น)
              <textarea
                required
                maxLength={1500}
                value={form.verificationEvidence}
                onChange={(e) =>
                  setForm({ ...form, verificationEvidence: e.target.value })
                }
              />
            </label>
          )}
          <label>
            ชื่อผู้บันทึก
            <input
              required
              maxLength={100}
              value={form.recordedBy}
              onChange={(e) => setForm({ ...form, recordedBy: e.target.value })}
            />
          </label>
          <button className="as-button" disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึกประวัติซ่อม"}
          </button>
        </form>
      </details>
    </section>
  );
}
