# dashbordsolar

Dashboard วิเคราะห์ข้อมูล Solar ด้วย Next.js, Ant Design, TypeScript และ Vitest

ดาวน์โหลดและนำเข้า Excel จาก FusionSolar: ดู [คู่มือ sync](docs/fusionsolar-sync.md)

การแก้จำนวนไซต์ 71/72/73 และขอบเขตข้อมูลหน้าหลัก: ดู [รายละเอียด](docs/site-count-correction.md)

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm test
npm run typecheck
npm run build
```

## แนวทาง UX/UI ใหม่

เริ่มที่ [DESIGN.md](DESIGN.md) ซึ่งเชื่อมไปยังข้อกำหนด UX, UI, กติกาข้อมูล และ [prompt สำหรับ pi / Kimi K3](docs/kimi-prompt.md) เอกสารอธิบายเป้าหมายการพัฒนา ไม่ได้หมายความว่าฟีเจอร์ทั้งหมดเปิดใช้แล้ว


## V2: คู่มือและงานตรวจ

เปิด `/prototype` เพื่อใช้ V2 และ `/help` เพื่ออ่านคู่มือพร้อมภาพ
ดาวน์โหลด [คู่มือ PDF](public/manual/AnalysisSolar-V2-User-Guide.pdf) หรือดู [ระบบงานตรวจ](docs/inspections.md)

ก่อนเริ่มใช้ระบบบันทึกบนฐานข้อมูลเดิม ให้ตั้ง `NEON_DB` ฝั่งเซิร์ฟเวอร์ แล้วรันตามลำดับ:

```bash
npx tsx scripts/init-operations.ts
npx tsx scripts/init-inspections.ts
npm run dev -- --port 3100
```

ตั้งค่า Gemini ตาม [.env.gemini.example](.env.gemini.example) และ [คู่มือ AI](docs/gemini-analysis.md) โดยเก็บ key ใน `.env.local` เท่านั้น
ดาวน์โหลด Excel และกดนำเข้าเอง; AI เข้าคิวอัตโนมัติหลังนำเข้าสำเร็จเมื่อเซิร์ฟเวอร์ทำงาน ไม่มี scheduler ที่ตั้งให้ใน repository นี้
