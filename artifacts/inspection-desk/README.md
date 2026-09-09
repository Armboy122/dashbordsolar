# Inspection Desk — ภาพ 2

เปิด http://localhost:3100/prototype

Codex ทำโค้ดรอบนี้เองทั้งหมด ภาพแนวทางสร้างด้วย Image Gen; ไม่ได้ใช้ Kimi สร้างโค้ดรอบนี้

- ทั้ง 4 หน้าใช้เมนูด้านบน พื้นขาว เขียวเข้ม และตัวอักษรไทย Sarabun
- รายละเอียดไซต์มีรายชื่อด้านซ้าย กราฟก่อนเนื้อหา และข้อมูลที่พบ/ประวัติซ่อม/AI คนละส่วน
- ข้อมูลในภาพ runtime มาจาก API จริง ไม่เอาตัวเลขกราฟและข้อสันนิษฐานจาก mockup มาใช้
- ภาพ `{overview,sites,checks,reports}-{1440,390}.png` และ `detail-*` เป็นหน้าจอจริง
- `repair-form-390.png` เปิดแบบฟอร์มว่าง ไม่ได้สร้างข้อมูลซ่อม
- `comparison-desktop.png` ใช้เทียบภาพ 2; ตัวเลขไซต์/กราฟต่างจาก mockup เพราะรักษาข้อมูลจริง

ฟีเจอร์จริง: อ่าน API, เปลี่ยนเดือน/scope, เข้าดูหลักฐาน, คัดลอก LINE, นำเข้าไฟล์, คิว AI, ประวัติผล AI, บันทึกซ่อมและอ่านย้อนหลัง

จำลอง: SampleFlow เดิมอยู่ใน details ปิดเริ่มต้น มีป้ายข้อมูลตัวอย่าง/ยังไม่บันทึกจริง แยกจากฟอร์มบันทึกจริง

ยังขาด: workflow มอบหมาย/แจ้งช่างจริง, sync history, export report, authentication, รายงานแก้ไขย้อนหลัง, immutable revision ของไฟล์, กติกาความสำคัญใหม่และการรับรองผล AI โดยช่าง

การตรวจ: ไม่มี horizontal overflow ทั้ง 8 หน้า, ชื่อไทยยาวบนมือถือแสดงครบ, เปิดแบบฟอร์มมือถือได้, เข้ากลับไซต์คง month/scope, คัดลอกไม่ POST และข้อความไม่อ้างส่ง LINE แล้ว, จำลอง save failure ใน browser แล้วข้อความกรอกยังอยู่ ไม่มีข้อมูล QA ลง DB, ไม่มี console error ในการใช้งานข้อมูลจริง; มี HTTP 500 ที่จงใจ mock เพื่อทดสอบบันทึกล้มเหลว และ HMR/devtools log

Backend checks: `../auto-analysis/tests.txt` (126 tests), `typecheck.txt`, `build.txt`, `live-queue-check.json`, `live-gemini.json`. การ import จริงทั้งไฟล์ยังไม่ได้รัน; integration ใช้ mock DB แล้วตรวจ worker จริงแยกบนข้อมูลเดิม
