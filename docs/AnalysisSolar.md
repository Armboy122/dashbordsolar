# AnalysisSolar

## 2026-05-07 14:06:54 +07 — อัปเดต logic วิเคราะห์ความเสี่ยงพลังงานโซลาร์

### Goal
วิเคราะห์และปรับระบบ `analysissolar` เพื่อเตรียมอัปเดตข้อมูลใหม่ทั้งหมด ทั้ง schema และ UI โดยเริ่มจากทำความเข้าใจ PRD จริงของระบบ และแก้ logic การแสดงสถานะความเสี่ยงให้สะท้อนข้อมูลจริงมากขึ้น

### สิ่งที่ทำไปแล้ว
- เข้าไปตรวจโปรเจค `/Users/sakdithat/Desktop/myproject/analysissolar`
- วิเคราะห์หน้าจอ dashboard และ logic การจัดกลุ่ม risk card
- พบปัญหา logic เดิมตีความข้อมูลบางเคสผิด เช่น เดือนนี้ผลิตได้มากกว่าเดือนก่อน แต่ card ยังสื่อว่าแย่จากเดือนก่อน
- ปรับ logic ให้ใช้หลาย baseline ช่วยยืนยันสถานะ ไม่พึ่ง baseline เดียว
- แก้ UI ให้แสดงรายละเอียด baseline ชัดเจนขึ้น แยก YoY, ค่าเฉลี่ยไซต์, และ MoM
- ตรวจเคส XBA สฟฟ.สายบุรี ที่เดือนนี้ 418 kWh เทียบเดือนก่อน 292 kWh ให้แสดงว่า “เพิ่มขึ้น 126 kWh (+42.9%)” อย่างถูกต้อง

### Logic ใหม่ที่ตกลงใช้
1. ตรวจความครบถ้วนของข้อมูลก่อน
   - ไม่มี inverter yield → สถานะ “ยังไม่มีข้อมูล”
   - inverter yield = 0 → สถานะ “ตรวจสอบด่วน”

2. เทียบ 3 baseline
   - ปีที่แล้ว / YoY
   - ค่าเฉลี่ยไซต์
   - เดือนก่อน / MoM

3. ให้คะแนนตามความแรงของการลดลง
   - YoY และค่าเฉลี่ยไซต์:
     - ลดน้อยกว่า 10% = 0 คะแนน
     - ลด 10-20% = 1 คะแนน
     - ลด 20-40% = 2 คะแนน
     - ลดมากกว่า 40% = 3 คะแนน
   - เดือนก่อน:
     - ลดน้อยกว่า 15% = 0 คะแนน
     - ลด 15-25% = 1 คะแนน
     - ลด 25-40% = 2 คะแนน
     - ลดมากกว่า 40% = 3 คะแนน

4. แปลงคะแนนเป็นสถานะ
   - 0-1 คะแนน = ปกติ ไม่แสดง card
   - 2-3 คะแนน = พิจารณา
   - 4-5 คะแนน = เฝ้าระวัง
   - 6+ คะแนน = ตรวจสอบด่วน

5. Risk card แสดงเฉพาะ
   - พิจารณา
   - เฝ้าระวัง
   - ตรวจสอบด่วน
   - ยังไม่มีข้อมูล

### เหตุผลของการตัดสินใจ
- ใช้หลาย baseline เพราะข้อมูล production รายเดือนมี seasonality และบางเดือนอาจดีขึ้นจากเดือนก่อนแต่ยังแย่เมื่อเทียบกับค่าเฉลี่ยไซต์หรือปีที่แล้ว
- MoM ต้องแยกน้ำหนักต่างจาก YoY/ค่าเฉลี่ยไซต์ เพราะเดือนก่อนอาจเป็นฐานที่ต่ำผิดปกติ
- Card ไม่ควรแสดงสถานะ “ปกติ” เพื่อลด noise และให้ dashboard เน้นเฉพาะรายการที่ต้องดูแล
- ข้อความสรุปต้องสื่อทั้งทิศทางดีขึ้น/แย่ลงและเหตุผลที่ยังต้องพิจารณา เช่น “ฟื้นจากเดือนก่อน แต่ยังต่ำกว่าค่าเฉลี่ยไซต์”

### ไฟล์ที่แก้
- `src/components/solar-dashboard.tsx`
- `app/globals.css`

### Verification
- `npm run typecheck` ผ่าน
- `npm run build` ผ่าน
- ตรวจหน้าเว็บแล้ว เคส XBA แสดงถูกต้อง:
  - สถานะ: พิจารณา
  - เหตุผล: ฟื้นจากเดือนก่อน แต่ยังต่ำกว่าค่าเฉลี่ยไซต์
  - เดือนก่อน: เพิ่มขึ้น 126 kWh (+42.9%)
  - ค่าเฉลี่ยไซต์: ลดลง 180 kWh (-30.1%)

### PRD ที่เริ่มสรุปได้จากงานนี้
ระบบ AnalysisSolar น่าจะเป็น dashboard สำหรับวิเคราะห์ performance ของไซต์โซลาร์รายหน่วยงาน/สาขา เพื่อช่วยทีมปฏิบัติการมองเห็นไซต์ที่ผลิตไฟผิดปกติหรือต้องตรวจสอบ โดย PRD หลักควรครอบคลุม:
- นำเข้าข้อมูล generation/inverter yield รายเดือนของแต่ละไซต์
- เปรียบเทียบ performance กับ baseline หลายแบบ เช่น ปีที่แล้ว เดือนก่อน และค่าเฉลี่ยไซต์
- จัดระดับความเสี่ยงเป็น พิจารณา / เฝ้าระวัง / ตรวจสอบด่วน / ยังไม่มีข้อมูล
- แสดงเหตุผลที่อ่านเข้าใจง่าย ไม่ใช่แค่ตัวเลขดิบ
- ลด false alarm โดยไม่แสดงไซต์ปกติใน risk card
- รองรับการอัปเดต schema และ UI สำหรับข้อมูลใหม่ในอนาคต

### Next steps
- วิเคราะห์ source data/schema ปัจจุบันทั้งหมดของโปรเจค
- สรุป PRD ฉบับเต็มจาก feature ที่มีอยู่จริงในระบบ
- ออกแบบ schema ใหม่ให้รองรับข้อมูลใหม่ทั้งหมด
- ออกแบบ UI flow/dashboard ใหม่ให้ตรงกับ PRD
- เพิ่ม test สำหรับ risk classification logic เพื่อกัน regression

## 2026-05-08 00:21:41 +07 — Redesign dashboard UI และลด copy ที่รก

### Goal
ปรับ front-end ของ `analysissolar` ให้ดูเป็น production dashboard มากขึ้น โดยใช้ Sarabun, โทนม่วงอ่อน/ขาว/เทา, ตารางและกราฟอ่านง่ายขึ้น และลบข้อความ/เครดิต/label ที่ทำให้ดูเหมือนเว็บทดสอบ

### What changed
- ปรับ design system หลักใน `app/globals.css` เป็นธีมม่วงอ่อน/ขาว/เทา พร้อม typography Sarabun และ spacing/card/table/chart polish
- ปรับ `styles.css` ซึ่งเป็น legacy/static stylesheet ให้ไม่คงธีมเขียวเดิมและลดโอกาสชนกับ Next app theme
- ปรับ `src/components/navbar.tsx`:
  - ใส่ mark/logo style ใหม่ช่วงแรก
  - ลบเครดิต `Designed by Suppakit Chalermlarp` ออกหลัง review เพราะทำให้ UI รกและดูเป็นเว็บ test
- ปรับ `src/components/solar-dashboard.tsx`:
  - ลบ copy ที่ไม่จำเป็น เช่น `Solar dashboard`, `Section 1`, `Section 2`, คำอธิบายหน้าแรก, hint import, preview site
  - คงเฉพาะ label ที่เกี่ยวกับการใช้งานจริง เช่น เดือน, นำเข้ารายงาน, ไฟล์ Excel, เดือนรายงาน, graph legend
  - ย่อ KPI note ให้สั้นขึ้น เช่น `สะสม: ...`, `ปีล่าสุด`, `ทุกไซต์`
  - ปรับคำอธิบายกราฟให้ตรงกับสีใหม่: เส้นม่วง = ปีล่าสุด, เส้นเทาอ่อน = เดือนเดียวกันปีก่อน
- ปรับ `src/components/site-detail.tsx`:
  - ลบ label อังกฤษ/dev-like เช่น `Site detail`, `Year selector`, `Key metrics`, `Risk summary`, `Performance graphs`, `History table`
  - คงหัวข้อไทยที่จำเป็นและเกี่ยวกับข้อมูลจริง
- ปรับ `src/lib/site-detail-view.ts` ให้ chart series ใช้ palette ม่วง/เทาแทนสีเขียว/ส้ม/แดงที่ขัดกับ theme

### Decisions and reasoning
- ไม่แสดง designer credit ใน UI เพราะผู้ใช้ต้องการให้หน้าเป็น production tool ไม่ใช่เว็บทดลอง/portfolio
- เก็บเฉพาะ microcopy ที่ช่วยอ่าน graph/table หรือจำเป็นต่อ form interaction เพื่อลด visual noise
- ใช้ horizontal scroll + min-width สำหรับตารางแทนการบีบทุก column เพราะข้อมูลจำนวนมากจะอ่านยากและเกิด text overlap ถ้าฝืน fit ใน viewport เดียว
- ใช้ม่วงเป็น status/accent หลัก และใช้เทา/เทาอ่อนสำหรับ secondary series เพื่อให้ graph อ่านง่ายและไม่แย่ง attention
- ยังเก็บ empty/error/loading text ที่จำเป็นต่อ UX แต่ลบ label อังกฤษที่ดูเป็น internal/dev scaffolding

### Verification
- `npm run typecheck` ผ่าน
- `npm test` ผ่าน: 7 files, 30 tests
- `npm run build` ผ่าน
- เปิด production preview ด้วย browser แล้วตรวจว่า:
  - ไม่พบ `Designed by`, `Section 1/2`, `Solar dashboard`, `Site detail`, `Year selector`, `Key metrics`, `Risk summary`, `Performance graphs`, `History table`
  - Font Sarabun และธีมม่วง/ขาว/เทาถูก apply
  - ไม่เห็น text overlap ชัดเจนใน viewport ที่ตรวจ

### Files modified
- `app/globals.css`
- `styles.css`
- `src/components/navbar.tsx`
- `src/components/solar-dashboard.tsx`
- `src/components/site-detail.tsx`
- `src/lib/site-detail-view.ts`
- ไฟล์จากรอบ review ก่อนหน้าใน session เดียวกัน:
  - `src/lib/import-workflow.ts`
  - `src/lib/site-detail-view.ts`
  - `app/api/sites/history/route.ts`
  - `app/sites/[siteId]/page.tsx`
  - `src/components/site-detail.tsx`
  - `tests/import-workflow.test.ts`
  - `tests/site-detail-view.test.ts`
  - `tests/site-history-route.test.ts`
  - `vitest.config.mjs`

### Risks / follow-up
- Dashboard เป็นข้อมูลหนาแน่นโดยธรรมชาติ โดยเฉพาะตารางใหญ่ด้านล่าง ควรพิจารณาเพิ่ม column grouping, sticky first column, หรือ compact/comfortable density toggle ถ้าผู้ใช้ยังรู้สึกแน่น
- Workspace นี้รายงานว่าไม่ใช่ git repo จาก `git status` จึงไม่มี git diff/commit trail ใน repo ปัจจุบัน
- ถ้าต้องการบันทึกใน central Obsidian vault เพิ่ม ให้ copy summary นี้ไป vault กลางด้วย แต่ตาม skill preference งานนี้บันทึกเป็น project-local note ที่ `docs/AnalysisSolar.md`

### Next steps
- ให้ผู้ใช้รีวิวภาพจริงอีกครั้งหลังเปิดหน้า
- ถ้ายังรก ให้ลด import panel หรือ KPI note เพิ่ม และพิจารณาซ่อนบาง section ไว้หลัง accordion/tabs
- เพิ่ม visual regression/screenshot check ถ้าโปรเจกต์จะมี UI iteration ต่อเนื่อง
