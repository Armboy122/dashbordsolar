"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import {
  inspectionCategories,
  inspectionStatuses,
  type Inspection,
  type InspectionStatus,
  type InspectionCategory,
} from "@/src/types/inspection";
import { monthLabel, number } from "@/src/lib/prototype-model";

type Props = {
  site?: string;
  month: string;
  scope: string;
  onSaved?: () => void;
};
export default function InspectionTracker({
  site,
  month,
  scope,
  onSaved,
}: Props) {
  const [records, setRecords] = useState<Inspection[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [refresh, setRefresh] = useState(0),
    [truncated, setTruncated] = useState(false),
    [statusFilter, setStatusFilter] = useState("all");
  const [saving, setSaving] = useState(false),
    [actor, setActor] = useState(""),
    [title, setTitle] = useState(""),
    [category, setCategory] = useState<InspectionCategory>("production");
  const requestId = useRef<string | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    fetch(
      `/api/inspections${site ? `?site=${encodeURIComponent(site)}` : ""}`,
      { signal: c.signal, cache: "no-store" },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.ok) throw Error(d.error);
        if (!c.signal.aborted) {
          setRecords(d.records);
          setTruncated(d.truncated);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message || "อ่านงานไม่สำเร็จ");
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [site, refresh]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    requestId.current ??= crypto.randomUUID();
    try {
      const r = await fetch("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          requestId: requestId.current,
          siteName: site,
          month,
          category,
          title,
          actor,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw Error(d.error);
      requestId.current = null;
      setTitle("");
      setSuccess("เปิดงานตรวจและเก็บหลักฐานเดือนต้นทางแล้ว");
      setRefresh((v) => v + 1);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }
  const visible = records.filter(
    (r) => statusFilter === "all" || r.status === statusFilter,
  );
  return (
    <section className="as-panel as-tracker" aria-label="งานตรวจที่บันทึกจริง">
      <div className="as-section-title">
        <div>
          <p className="as-eyebrow">INSPECTION LOG</p>
          <h2>
            <ClipboardCheck size={20} aria-hidden /> งานตรวจที่บันทึกจริง
          </h2>
        </div>
        <button
          type="button"
          disabled={loading || saving}
          onClick={() => setRefresh((v) => v + 1)}
        >
          โหลดรายการล่าสุด
        </button>
      </div>
      <p className="as-muted">
        {site
          ? "งานของไซต์นี้ รวมทุกเดือน"
          : "งานทุกไซต์ รวมทุกเดือน ไม่อิงเดือนและขอบเขตของรายงานด้านบน"}{" "}
        · สถานะงานไม่ใช่ความสำคัญหรือคุณภาพข้อมูล ·
        ได้ผลตรวจไม่ได้แปลว่าแก้สำเร็จ
      </p>
      {site && (
        <details>
          <summary>เปิดงานตรวจจากเดือน {monthLabel(month)}</summary>
          <form className="as-maintenance-form" onSubmit={create}>
            <label>
              เรื่องที่ต้องตรวจ
              <input
                required
                maxLength={300}
                value={title}
                disabled={saving}
                onChange={(e) => {
                  setTitle(e.target.value);
                  requestId.current = null;
                }}
              />
            </label>
            <label>
              ประเภทงาน
              <select
                value={category}
                disabled={saving}
                onChange={(e) => {
                  setCategory(e.target.value as InspectionCategory);
                  requestId.current = null;
                }}
              >
                {Object.entries(inspectionCategories).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ผู้บันทึก
              <input
                required
                maxLength={100}
                value={actor}
                disabled={saving}
                onChange={(e) => {
                  setActor(e.target.value);
                  requestId.current = null;
                }}
              />
            </label>
            <p className="as-muted">
              ระบบเก็บค่ารายเดือนจาก API เป็นหลักฐาน ณ ตอนเปิดงาน
              ไม่ดึงข้อสันนิษฐานมาเป็นผลตรวจ ชื่อผู้บันทึกเป็นชื่อที่กรอกเอง
              ยังไม่มีระบบยืนยันตัวตน
            </p>
            <button className="as-button" disabled={saving}>
              {saving ? "กำลังบันทึก…" : "บันทึกเปิดงานตรวจ"}
            </button>
          </form>
        </details>
      )}
      {error && (
        <p role="alert" className="as-notice">
          {error}
        </p>
      )}
      {success && <p role="status">{success}</p>}
      <label className="as-work-filter">
        กรองสถานะงาน
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">ทุกสถานะ</option>
          {Object.entries(inspectionStatuses).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {loading ? (
        <p role="status">กำลังโหลดงานตรวจ…</p>
      ) : (
        <>
          <p className="as-muted">
            แสดง {visible.length} งานจาก {records.length} งานที่โหลดมา
            {truncated
              ? " · มีมากกว่า 200 งาน แสดงงานที่ยังไม่ได้ผลก่อนและเรียงตามแก้ไขล่าสุด"
              : ""}
          </p>
          {!visible.length && !error && (
            <p>
              ยังไม่มีงานตรงกับรายการนี้
              เปิดรายละเอียดไซต์เพื่อสร้างงานจากหลักฐานได้
            </p>
          )}
          <div className="as-work-list">
            {visible.map((task) => (
              <InspectionCard
                key={`${task.id}-${task.version}`}
                task={task}
                onSaved={() => {
                  setSuccess("บันทึกความคืบหน้าและประวัติงานแล้ว");
                  setRefresh((v) => v + 1);
                  onSaved?.();
                }}
                month={month}
                scope={scope}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
function InspectionCard({
  task,
  onSaved,
  month,
  scope,
}: {
  task: Inspection;
  onSaved: () => void;
  month: string;
  scope: string;
}) {
  const [target, setTarget] = useState<InspectionStatus>(
      task.status === "inspected"
        ? "awaiting"
        : task.status === "awaiting"
          ? "notified"
          : "inspected",
    ),
    [actor, setActor] = useState(""),
    [note, setNote] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [repair, setRepair] = useState({
    occurredOn: new Date().toLocaleDateString("sv-SE", {
      timeZone: "Asia/Bangkok",
    }),
    findings: "",
    actionTaken: "",
    outcome: "unknown",
    verificationEvidence: "",
  });
  const requestId = useRef<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const r = await fetch("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transition",
          requestId: requestId.current,
          id: task.id,
          version: task.version,
          status: target,
          actor,
          note,
          ...(target === "inspected" ? { repair } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw Error(d.error);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }
  return (
    <article className="as-work-card">
      <div className="as-section-title">
        <h3>{task.title}</h3>
        <span className={`as-badge as-work-${task.status}`}>
          {inspectionStatuses[task.status]}
        </span>
      </div>
      <p>
        {task.siteName} · {inspectionCategories[task.category]}
      </p>
      <p className="as-muted">
        เปิดจาก {monthLabel(task.originMonth)} · โดย {task.createdBy} · รหัส{" "}
        {task.id.slice(0, 8)}
      </p>
      <details>
        <summary>หลักฐานตอนเปิดงานและประวัติสถานะ</summary>
        <p>
          เดือน {monthLabel(task.originMonth)} · {task.evidence.source} ·{" "}
          {task.evidence.reportPresent
            ? `ผลผลิต ${number(task.evidence.inverterYieldKwh)}${task.evidence.inverterYieldKwh === null ? "" : " หน่วย"}`
            : "ไม่มีรายงานเดือนนี้"}{" "}
          · เก็บเมื่อ{" "}
          {new Date(task.evidence.capturedAt).toLocaleString("th-TH")}
        </p>
        {task.evidence.previousInspectionId && (
          <p>
            เรื่องประเภทเดียวกันครั้งก่อน:{" "}
            {task.evidence.previousInspectionId.slice(0, 8)} · เป็นคนละงาน
            ไม่ได้ยืนยันสาเหตุเดียวกัน
          </p>
        )}
        <ol className="as-repair-timeline">
          {task.events.map((e) => (
            <li key={e.id}>
              <strong>{inspectionStatuses[e.toStatus]}</strong> · {e.actor} ·{" "}
              {new Date(e.createdAt).toLocaleString("th-TH")}
              <p>{e.note}</p>
              {e.repairId && <p>ผลตรวจเก็บในประวัติซ่อมของไซต์นี้แล้ว</p>}
            </li>
          ))}
        </ol>
      </details>
      <Link
        className="as-evidence-link"
        href={`/prototype?${new URLSearchParams({ view: "checks", month, scope, site: task.siteName })}`}
      >
        ดูรายละเอียดไซต์และประวัติซ่อม
      </Link>
      <details>
        <summary>
          {task.status === "inspected"
            ? "เปิดติดตามงานเดิมต่อ"
            : "บันทึกความคืบหน้า / ผลตรวจ"}
        </summary>
        <form
          className="as-maintenance-form"
          onSubmit={save}
          onChange={() => {
            requestId.current = null;
          }}
        >
          <label>
            สถานะที่จะบันทึก
            <select
              disabled={saving}
              value={target}
              onChange={(e) => setTarget(e.target.value as InspectionStatus)}
            >
              {Object.entries(inspectionStatuses)
                .filter(
                  ([k]) =>
                    k !== task.status &&
                    (task.status !== "inspected" || k === "awaiting"),
                )
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </label>
          {target === "notified" && (
            <p className="as-notice">
              กดบันทึกหลังจากคุณส่งข้อความหรือแจ้งช่างแล้วเท่านั้น ระบบไม่ได้ส่ง
              LINE ให้
            </p>
          )}
          {target === "awaiting" && (
            <p className="as-muted">
              ติดตามงานเดิมต่อโดยรักษาหลักฐานและประวัติทุกครั้ง
            </p>
          )}
          <label>
            ผู้บันทึก
            <input
              required
              maxLength={100}
              disabled={saving}
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            />
          </label>
          <label>
            {target === "notified"
              ? "แจ้งใคร ผ่านช่องทางใด"
              : "หมายเหตุ / เหตุผล"}
            <textarea
              required
              maxLength={1500}
              disabled={saving}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {target === "inspected" && (
            <>
              <label>
                วันที่ตรวจ
                <input
                  type="date"
                  required
                  disabled={saving}
                  value={repair.occurredOn}
                  onChange={(e) =>
                    setRepair({ ...repair, occurredOn: e.target.value })
                  }
                />
              </label>
              <label>
                ช่างพบอะไร / สาเหตุที่รายงาน
                <textarea
                  required
                  maxLength={1500}
                  disabled={saving}
                  value={repair.findings}
                  onChange={(e) =>
                    setRepair({ ...repair, findings: e.target.value })
                  }
                />
              </label>
              <label>
                ทำอะไรไปแล้ว / ยังไม่ได้แก้เพราะอะไร
                <textarea
                  required
                  maxLength={1500}
                  disabled={saving}
                  value={repair.actionTaken}
                  onChange={(e) =>
                    setRepair({ ...repair, actionTaken: e.target.value })
                  }
                />
              </label>
              <label>
                ผลหลังดำเนินการ
                <select
                  disabled={saving}
                  value={repair.outcome}
                  onChange={(e) =>
                    setRepair({ ...repair, outcome: e.target.value })
                  }
                >
                  <option value="unknown">ยังไม่ทราบผล</option>
                  <option value="follow_up">ต้องติดตามต่อ</option>
                  <option value="reported_fixed">
                    ช่างแจ้งว่าแก้แล้ว · รอยืนยัน
                  </option>
                  <option value="verified_resolved">
                    ผู้บันทึกยืนยันผลพร้อมหลักฐาน
                  </option>
                </select>
              </label>
              <label>
                หลักฐานยืนยัน / ค่าที่ตรวจวัด
                <textarea
                  required={repair.outcome === "verified_resolved"}
                  maxLength={1500}
                  disabled={saving}
                  value={repair.verificationEvidence}
                  onChange={(e) =>
                    setRepair({
                      ...repair,
                      verificationEvidence: e.target.value,
                    })
                  }
                />
              </label>
              <p className="as-muted">
                ผลนี้บันทึกในประวัติซ่อมจริงด้วย AI
                จะอ่านในการวิเคราะห์ครั้งถัดไป ไม่ได้เรียก AI
                หรือรับรองอุปกรณ์อัตโนมัติ
              </p>
            </>
          )}
          {error && <p role="alert">{error} · ข้อความที่กรอกยังอยู่</p>}
          <button className="as-button" disabled={saving}>
            {saving
              ? "กำลังบันทึก…"
              : `ยืนยันบันทึก “${inspectionStatuses[target]}”`}
          </button>
        </form>
      </details>
    </article>
  );
}
