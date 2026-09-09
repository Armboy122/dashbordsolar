# Inspection workflow — delivered 9 September 2026

เพิ่มระบบเปิดงาน รอตรวจ/แจ้งช่างแล้ว/ได้ผลตรวจ เปิดติดตามต่อ และ audit จริง พร้อมเชื่อมผลช่างเข้า solar_maintenance_records สำหรับ AI ครั้งถัดไป

วิธีใช้: เปิดไซต์ → งานตรวจที่บันทึกจริง → เปิดงานตรวจ → บันทึกความคืบหน้า/ผลตรวจ
ดูงานรวมได้ที่ /prototype?view=checks (ส่วนงานทุกไซต์ทุกเดือน แยกจากข้อมูลรายเดือน)
รายละเอียด: ../../docs/inspections.md

## Verification
- typecheck ผ่าน
- 23 test files / 153 tests ผ่าน
- production build ผ่าน
- git diff --check ผ่าน
- Migration SQL รันสองครั้งใน schema ทดสอบแยกได้ จากนั้น rollback schema ทั้งชุด
- ทดสอบ persistence ด้วย PostgreSQL จริง: เปิดงาน, snapshot zero, กันเปิดซ้ำ, retry create/result ไม่สร้างซ้ำ, version conflict, ผลตรวจเชื่อม repair record, เปิดติดตามต่อ, repair insert ล้มเหลวแล้ว status/event ไม่เปลี่ยน
- Connector สร้าง Neon branch ใช้ไม่ได้เพราะต้อง reauthenticate จึงใช้ schema แยกภายใน transaction ผ่าน connection เดิม ไม่มี QA records ลงตารางใช้งานจริง
- เพิ่มตารางจริงสำเร็จ: migration.txt; GET /api/inspections คืน ok=true, records=[] หลังทดสอบ
- ตรวจจริงที่ 1440/390 px หน้ารวมและฟอร์มเปิดงาน ไม่พบ document overflow
- Browser จำลอง task และ POST 503 เฉพาะ QA: ข้อความผลตรวจยังอยู่, ส่งคำขอเพียงหนึ่งครั้ง, ไม่เขียนฐานจริง; ถอด interception แล้วกลับข้อมูลจริง
- ปุ่ม LINE ยังเป็น clipboard-only

ภาพ checks-real-* และ create-real-* อ่าน API จริง; ภาพ result-form-QA-* มีป้ายข้อมูลตัวอย่างทดสอบและใช้ HTTP interception ไม่ใช่ผลตรวจช่างจริง

ข้อจำกัด: ไม่ได้สร้างผลตรวจปลอมในฐานใช้งานเพื่อทดสอบ browser end-to-end; ทดสอบธุรกรรมเขียนจริงแยกใน schema rollback แทน ยังไม่มี auth, แนบรูป, export, pagination เกิน 200 งาน, เพิ่ม snapshot เดือนใหม่ในงานเดิม หรือสรุปงานตามเดือน ไม่ได้เปลี่ยน scoring หรือเรียก Gemini เสียค่าใช้จ่ายระหว่าง QA
