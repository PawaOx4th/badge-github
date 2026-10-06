# Badge Comments (GitHub)

ส่วนขยายเบราว์เซอร์สำหรับ Chrome และ Firefox (Manifest V3) ที่เพิ่มแถบปุ่มสถานะ
เหนือกล่องคอมเมนต์บน GitHub คลิกครั้งเดียวเพื่อแทรกป้าย (badge) ที่ต้องการ
ลงในคอมเมนต์

ได้แรงบันดาลใจจาก [pullpo-io/conventional-comments](https://github.com/pullpo-io/conventional-comments)
แต่ลดรูปเหลือแถวเดียว 4 ตัวเลือก ไม่มีขั้นตอนเลือก decoration, ไม่มี GitLab, ไม่มี Slack
และไม่มีหน้าตั้งค่า

## ตัวเลือกทั้ง 6

| ปุ่ม | สี | Markdown ที่แทรก |
|------|-----|-------------------|
| Solved | เขียว `#28A745` | `![Solved](https://img.shields.io/badge/Solved-28A745?style=for-the-badge)` |
| Skip | เทา `#6B7280` | `![Skip](https://img.shields.io/badge/Skip-6B7280?style=for-the-badge)` |
| In Review | เหลือง `#F59E0B` | `![In Review](https://img.shields.io/badge/In_Review_--_02%2F10%2F2026_10%3A56-F59E0B?style=for-the-badge)` (เวลาในป้ายคือวัน/เวลา ณ ตอนคลิก รูปแบบ `In Review - DD/MM/YYYY HH:mm`) |
| Request Change | แดง `#DC2626` | `![Request Change](https://img.shields.io/badge/Request_Change-DC2626?style=for-the-badge)` |
| Comment | ม่วง `#8B5CF6` | `![Comment](https://img.shields.io/badge/Comment-8B5CF6?style=for-the-badge)` |
| Approve | น้ำเงิน `#3B82F6` | `![Approve](https://img.shields.io/badge/Approve_--_02%2F10%2F2026_10%3A56-3B82F6?style=for-the-badge)` (เวลาในป้ายคือวัน/เวลา ณ ตอนคลิก รูปแบบ `Approve - DD/MM/YYYY HH:mm`) |

ป้ายเป็นรูปภาพ Markdown ธรรมดา (ไม่มีลิงก์คลิก) โดยป้ายจะแสดงผลด้วยสีตามที่กำหนด
ผ่านบริการ shields.io ตอนที่ GitHub เรนเดอร์คอมเมนต์

## การทำงาน

- แถบปุ่มจะถูกแทรกไว้เหนือกล่องคอมเมนต์ทุกกล่องบน GitHub (ทั้ง UI แบบเก่าและใหม่
  รวมถึงเธรดรีวิวแบบ inline และช่องตอบกลับ)
- **คลิกตัวเลือก** → แทรกป้ายไว้ต้นคอมเมนต์ ข้อความเดิมยังอยู่ครบ
- **คลิกตัวเลือกอื่น** → เปลี่ยนป้าย (ไม่ซ้อนกัน)
- **คลิกตัวเลือกเดิมซ้ำ** → ลบป้ายออก
- ถ้ากล่องคอมเมนต์มีป้ายของส่วนขยายอยู่แล้ว ตอนเปิดหน้าจะไฮไลต์ปุ่มที่ตรงกับป้ายนั้นให้อัตโนมัติ
- รองรับธีมสว่าง/มืดของ GitHub

## การติดตั้ง (โหลดแบบ unpacked)

ต้องมี [Node.js](https://nodejs.org/) และ npm ก่อน

```bash
npm install     # ติดตั้ง esbuild (dev dependency)
npm run build   # บิลด์ทั้ง Chrome และ Firefox
```

คำสั่งบิลด์อื่น ๆ:

```bash
npm run build:chrome    # บิลด์เฉพาะ Chrome
npm run build:firefox   # บิลด์เฉพาะ Firefox
```

ผลลัพธ์จะอยู่ในโฟลเดอร์ `build/chrome` และ `build/firefox`

### Chrome

1. เปิด `chrome://extensions`
2. เปิด **Developer mode** (มุมขวาบน)
3. กด **Load unpacked** แล้วเลือกโฟลเดอร์ `build/chrome`

### Firefox

1. เปิด `about:debugging#/runtime/this-firefox`
2. กด **Load Temporary Add-on...**
3. เลือกไฟล์ `build/firefox/manifest.json`

## วิธีใช้

1. เปิดหน้า Pull Request หรือ Issue บน GitHub
2. คลิกที่กล่องคอมเมนต์
3. เลือกปุ่มที่ต้องการจากแถบที่ปรากฏขึ้นเหนือกล่อง
4. ป้ายจะถูกแทรกที่ต้นคอมเมนต์ จากนั้นพิมพ์ข้อความต่อได้ตามปกติ

## โครงสร้างโปรเจกต์

```
manifest-base.json     Manifest V3 ต้นแบบ (ใช้ร่วมกันทั้งสองเบราว์เซอร์)
build-manifests.js     สคริปต์บิลด์ (esbuild) → build/chrome, build/firefox
scripts/gen-icons.js   สร้างไอคอน PNG ขนาด 16/48/128
src/
  content.js           จุดเริ่มต้น (สแกน, MutationObserver, จัดการ SPA)
  content/platform.js  selector ของ GitHub + ที่เก็บค่า (chrome.storage)
  content/badges.js    รายการตัวเลือก, ตัวสร้างป้าย, แถบปุ่ม, ลอจิกสลับ
  style.css            สไตล์แถบปุ่ม (รองรับธีมสว่าง/มืด)
  background.js        service worker ขนาดเล็ก
icons/                 ไอคอนที่สร้างขึ้น
```

## การพัฒนา

- แก้ไขโค้ดใน `src/` แล้วรัน `npm run build` ใหม่
- โหลดซ้ำ (reload) ส่วนขยายในหน้า `chrome://extensions` หรือ `about:debugging`
- เอกสารออกแบบและแผนงานอยู่ใน `docs/superpowers/`

## สิทธิ์การใช้งาน (Permissions)

- `storage` — สำรองไว้ใช้ในอนาคต (ยังไม่มีหน้าตั้งค่าในเวอร์ชันนี้)
- `host_permissions`: `*://github.com/*` — ทำงานเฉพาะบน GitHub เท่านั้น

## สิ่งที่ยังไม่ได้ทำ (Non-goals)

GitLab, ลิงก์เธรด Slack, ขั้นตอน decoration, ปุ่มสลับข้อความ/ป้าย, หน้าตั้งค่า
และลิงก์ที่คลิกได้บนตัวป้าย
