# หน้าปัดปฏิทินฟ้า สำหรับ Wear OS

หน้าปัดแบบเดียวกับเวอร์ชัน Amazfit (`../watchface`) สำหรับนาฬิกา Wear OS 4 ขึ้นไป
(Samsung Galaxy Watch, Google Pixel Watch ฯลฯ) ทำด้วย Watch Face Format ที่ Google บังคับใช้กับหน้าปัดใหม่ทุกตัว

- ใช้ภาพชุดเดียวกับเวอร์ชัน Amazfit: โลก 36 ภาพตามฤดู ดวงจันทร์ 30 ภาพ
- นาฬิกาคำนวณตำแหน่งดวงอาทิตย์/ดวงจันทร์ ขึ้น-แรมกี่ค่ำ และนับถอยหลังวิษุวัต/อายันเอง
  ด้วยสูตรย่อใน `tools/expr.mjs` (Watch Face Format ไม่มีโค้ด มีแต่สูตรคำนวณใน XML)
  ทดสอบเทียบกับสูตรของเว็บใน `../test/wearos.test.js`: ภาพตรงทุกครั้ง (คลาดไม่เกิน 1 ภาพ)
  วันขึ้น/แรมและวันนับถอยหลังตรงมากกว่า 97% ที่เหลือคลาด 1 วันตอนใกล้เที่ยงคืน
- ข้อความภาษาไทยใช้ฟอนต์ของ Android ซึ่งแสดงวรรณยุกต์ซ้อนได้ปกติ

## สร้างไฟล์

```bash
node watchface/tools/render-assets.cjs   # วาดภาพ (ใช้ร่วมกับเวอร์ชัน Amazfit)
node wearos/tools/gen-watchface.mjs      # เขียน src/main/res/raw/watchface.xml และคัดลอกภาพ
```

## ลองบนคอม (ยังไม่มีนาฬิกา)

1. ติดตั้ง Android Studio
2. Device Manager → สร้างอุปกรณ์ใหม่ เลือกหมวด Wear OS เช่น "Wear OS Large Round" ระบบ Wear OS 4 ขึ้นไป
3. File → Open แล้วเลือกโฟลเดอร์ `wearos`
4. กด Run ให้ติดตั้งลงอุปกรณ์จำลอง แล้วบนนาฬิกาจำลองกดค้างที่หน้าปัด เลือก Sky Calendar

## ส่งขึ้น Google Play

ต้องมีบัญชี Google Play Console (ค่าสมัครครั้งเดียว 25 ดอลลาร์) แล้ว Build → Generate Signed App Bundle
ด้วยกุญแจของคุณเอง (`build.gradle` ตอนนี้ใช้กุญแจทดสอบ)
