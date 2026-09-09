# Gemini + ประวัติซ่อม (9 กันยายน 2026)

## ใช้งาน

เปิด `/prototype` → รายงานและข้อมูล → เลือก Plant Report → ยืนยันเดือน → นำเข้าและเริ่มวิเคราะห์อัตโนมัติ จากนั้นเปิดรายละเอียดไซต์เพื่ออ่านผลและประวัติ AI ของเดือนนั้น

Key อยู่ใน `.env.local` ฝั่งเซิร์ฟเวอร์: `GEMINI_API_KEY` และ `GEMINI_MODEL` ห้ามใช้ prefix NEXT_PUBLIC หรือใส่ใน frontend ผู้ใช้ตั้งค่าแล้ว; ตรวจจริงว่า `gemini-3.5-flash` เรียกได้ ไม่เก็บ key ใน artifact

เพิ่มบันทึกจริงที่รายละเอียดไซต์ → ประวัติซ่อม → เพิ่มบันทึกซ่อมจริง ระบุวันที่ สิ่งที่พบ สิ่งที่ทำ ผล ผู้บันทึก หากเลือกยืนยันการแก้ไขต้องมีหลักฐาน ไม่สร้างประวัติย้อนหลังขึ้นเอง ข้อความที่ช่างแจ้งว่าแก้แล้วแยกจากการยืนยันของผู้ดูแล ไม่มีบัญชีผู้ใช้ยืนยันตัวตนในรอบนี้ ชื่อผู้บันทึกจึงเป็นชื่อที่ผู้ใช้กรอก

## อัตโนมัติและการเก็บข้อมูล

หลัง import เดิมและ rebuild สำเร็จ เพิ่มคิวต่อไซต์ในไฟล์ลง `solar_ai_jobs` มี trigger ต่อ import/ไซต์ ป้องกัน enqueue ซ้ำสำหรับ import เดียวกัน Worker ใน Next server ทำงานทีละรายการ และเก็บ structured result, model, prompt version, input hash, timestamp แยกจากคะแนนและบันทึกช่าง

เปิด server ค้างไว้; งานไม่ขึ้นกับการเปิดหน้า browser คิวคงอยู่เมื่อปิดเครื่องและกลับมาทำต่อเมื่อเปิด server Worker คืน lease เกิน 2 นาที ใช้ fencing token ป้องกันผลเก่าเขียนทับ Retry สูงสุด 3 attempts เว้นอย่างน้อย 60 วินาทีระหว่างการ retry ผลสำเร็จที่ input/model/prompt ตรงกันนำกลับมาใช้ได้โดยไม่เรียก Google ซ้ำ เปิดหน้าเฉย ๆ อ่านผลที่บันทึก ไม่สร้าง paid request

Worker อ่านข้อมูล effective values ตอนเริ่มประมวลผล ไม่ใช่ snapshot ไฟล์ที่ immutable หากนำเข้าทับเดือนเดิมก่อนคิวเริ่ม จะใช้ค่าล่าสุด ณ เวลานั้น ผลแต่ละครั้งเก็บหลักฐานที่ใช้ไว้ตรวจย้อนหลัง ควรเพิ่ม immutable import revision ก่อนต้องการ audit ระดับทุกเวอร์ชันไฟล์

`solar_maintenance_records` เป็นตารางบันทึกจริงแบบเพิ่มรายการ ยังไม่มีแก้/ลบหรือแนบภาพไฟล์ ปัจจุบันเริ่มว่าง ไม่มีการสร้างผลช่างจำลองในฐานข้อมูล ทั้งสองตารางเพิ่มแยกจาก schema รายงานเดิม ไม่เปลี่ยนสูตร/threshold/คะแนนรายงาน

## หลักฐานและข้อจำกัด

ตัวเลขย้อนหลังสูงสุด 25 เดือนถึงเดือนที่เลือก และบันทึกซ่อมล่าสุดสูงสุด 50 รายการที่วันที่เกิดเหตุไม่เกินเดือนนั้น ไม่ส่งชื่อไซต์จากทะเบียน ที่อยู่ บัญชี Huawei หรือข้อความ reasons/actions เดิม แต่ข้อความบันทึกซ่อมส่งให้ Google จึงไม่ควรใส่รหัสผ่านหรือข้อมูลส่วนตัวที่ไม่จำเป็น

null ต่างจาก 0; เดือนขาดรายงานแยกจากช่องค่าที่ขาด ไม่มีข้อมูลอนาคตในหลักฐานรายเดือน/วันที่ซ่อม AI อ้าง monthly ID หรือ repair ID ที่มีจริงใน payload เท่านั้น ตรวจ schema/ID แล้วก็ยังไม่รับรองความถูกต้องเชิงสาเหตุ เนื้อหาแสดงเป็นข้อเสนอที่ยังไม่ยืนยัน ไม่เปลี่ยน scoring หรือสถานะงาน

คัดลอก LINE ไม่ส่งข้อความและไม่เปลี่ยนสถานะอัตโนมัติ ผล AI ไม่ถูกใส่ข้อความ LINE โดยอัตโนมัติ

Endpoints: GET/POST `/api/analysis/site`, GET `/api/analysis/history?site=&month=`, GET `/api/analysis/jobs?month=`, GET/POST `/api/maintenance`. เขียน AI แบบ manual/ประวัติซ่อมเปิดเฉพาะ localhost และตรวจ origin เป็น local guard ไม่ใช่ authentication

Manual จำกัด 6 attempts/นาที/process และ 1 concurrent; worker 1 concurrent/process Provider timeout 45s, max output 6,000 tokens ยังไม่มี global quota/cost budget หลาย process อาจเรียกพร้อมกันได้ แต่ claim งานเดียวกันไม่ได้ด้วย DB lock

Import เดิมไม่ใช่ transaction ครอบทั้งไฟล์: เมื่อ error อาจมีแถวถูกอัปเดตบางส่วน คิวจะไม่เริ่มจน rebuild สำเร็จ หาก enqueue ล้มเหลว UI แสดงนำเข้าสำเร็จแต่คิวไม่สำเร็จ ไม่รายงาน AI สำเร็จปลอม

## ตรวจจริง

- Gemini live หนึ่งไซต์ เดือน 2026-02 สำเร็จและ persist; evidence 25 จุด, repairs 0
- งานคิวจริง trigger `verification:*` บนรายงานที่มีอยู่ สำเร็จ attempts 1 มี result ใช้ cache ผลเดิม ไม่ upload รายงานหรือสร้างบันทึกช่างปลอม
- Unit/integration ใช้ mock DB/provider: import success/failure, queue/caching, repair validation, evidence chronology, error redaction
- ภาพและผลตรวจรอบนี้: `artifacts/inspection-desk`, `artifacts/auto-analysis`
- ยังไม่ได้อัปโหลดไฟล์เดือนใหม่จริงเพื่อเลี่ยงแก้รายงานที่มีอยู่; เชื่อม import→queue ตรวจผ่าน mocked integration และ queue→saved result ตรวจจริงแยกกัน

## งานต่อ

Auth/สิทธิ์, global quota/cost control, transactional import + outbox, immutable report revisions, queue retry UI/monitoring, ประวัติแก้ไขบันทึก/แนบหลักฐาน และประเมินคุณภาพข้อเสนอร่วมกับช่าง กติกาความสำคัญใหม่ยังต้องทดสอบแยก ไม่มีการ map legacy status เป็นระดับใหม่

เอกสาร Google: [API key](https://ai.google.dev/gemini-api/docs/api-key), [structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en), [API](https://ai.google.dev/api/generate-content)
