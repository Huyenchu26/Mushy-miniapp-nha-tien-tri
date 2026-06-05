# UI/UX Playwright Audit - 2026-06-05

## Pham vi test

- URL test: `http://127.0.0.1:5173/?mock=1`
- Cong cu: Playwright headless
- Viewport:
  - PC/Desktop: `1440 x 1000`
  - Tablet: `768 x 1024`
  - Mobile: `390 x 844`
- Cac man hinh da test: `Tran dau`, `Cau hoi`, `BXH`, `Ket qua`, `Luat`
- Screenshot luu tai: `.agent/ui-audit/`

## Ket qua tong quan

- Khong phat hien horizontal scroll toan trang tren PC, tablet, mobile.
- Text tieng Viet hien thi dung trong browser.
- Co loi UX nghiem trong tren mobile do bottom navigation che noi dung chinh.
- Co mot so touch target nho hon chuan mobile.
- Co request 404 trong console khi chay mock local.

## Loi can sua

### 1. Bottom navigation che noi dung tren mobile

- Muc do: High
- Man hinh anh huong: Mobile `390 x 844`, dac biet tab `Cau hoi` va `Ket qua`
- Bang chung:
  - `.agent/ui-audit/mobile-daily.png`
  - `.agent/ui-audit/mobile-results.png`
- Mo ta:
  - Thanh tab fixed bottom dang de len form `Du doan dai han` o tab `Cau hoi`.
  - O tab `Ket qua`, nav che mot phan bang xep hang bong da.
  - Nguoi dung co the bi che input/row dang doc hoac dang thao tac.
- Goi y sua:
  - Tang `padding-bottom` cho vung noi dung theo chieu cao nav + safe area, vi du `padding-bottom: calc(128px + env(safe-area-inset-bottom))`.
  - Neu nav fixed, can dam bao moi screen/card co khoang dem du lon o cuoi viewport.

### 2. Bottom navigation che footer tren desktop/tablet o tab Cau hoi

- Muc do: Medium
- Man hinh anh huong: Desktop `1440 x 1000`, Tablet `768 x 1024`
- Bang chung:
  - `.agent/ui-audit/desktop-daily.png`
  - `.agent/ui-audit/tablet-daily.png`
- Mo ta:
  - Khi o tab `Cau hoi`, footer nam ngay sau form va bi bottom nav fixed phu len.
  - Day la dau hieu khoang cach cuoi trang chua tinh dung chieu cao nav.
- Goi y sua:
  - Tang padding/margin bottom cho `.app-footer` hoac `.wc-app`.
  - Co the dung CSS variable cho nav height de tranh magic number.

### 3. Touch target cua nut tang/giam ti so qua nho

- Muc do: Medium
- Man hinh anh huong: Tat ca viewport, ro nhat tren mobile
- Bang chung:
  - `.agent/ui-audit/mobile-matches.png`
  - `.agent/ui-audit/tablet-matches.png`
- Mo ta:
  - Nut `-` / `+` trong score stepper co kich thuoc khoang `24-26px x 30-32px`.
  - Chuan mobile nen toi thieu khoang `44 x 44px`; hien tai de bam nham khi nhap du doan.
- Goi y sua:
  - Tang `.step-group button` len toi thieu `40-44px`.
  - Dieu chinh lai layout card neu can de giu score editor gon.

### 4. Ten doi bi cat tren card tran dau

- Muc do: Low/Medium
- Man hinh anh huong: Tablet va Mobile
- Bang chung:
  - `.agent/ui-audit/tablet-matches.png`
  - `.agent/ui-audit/mobile-matches.png`
- Mo ta:
  - Mot so ten doi dai nhu `Bosna va Hercegovina` bi cat trong card tran dau.
  - Playwright ghi nhan text clipped trong `.match-team strong`.
- Goi y sua:
  - Cho phep ten doi xuong dong linh hoat hon hoac tang width vung team name.
  - Co the dung ten rut gon co chu dich cho cac doi dai.

### 5. Chip filter tran khoi viewport trong hang scroll ngang

- Muc do: Low
- Man hinh anh huong: Mobile tab `Tran dau`
- Bang chung:
  - `.agent/ui-audit/mobile-matches.png`
- Mo ta:
  - Cac chip `Bang D`, `+ them` nam ngoai viewport trong container scroll ngang.
  - Day co the la chu y thiet ke, nhung chua co affordance ro rang cho nguoi dung biet con noi dung ben phai.
- Goi y sua:
  - Them fade edge/scroll hint hoac gom chip vao dropdown/segmented control tren mobile.

### 6. Request 404 khi chay mock local

- Muc do: Low
- Man hinh anh huong: Tat ca viewport
- Bang chung:
  - Console co `Failed to load resource: 404`
  - Request: `.../rest/v1/long_term_bets?...`
- Mo ta:
  - Khi chay `?mock=1`, app van co request den Supabase table `long_term_bets` va nhan 404.
  - UI van fallback duoc, nhung console bi loi va co the gay nhieu khi debug.
- Goi y sua:
  - Trong local mock mode, tranh goi DB cho `long_term_bets`.
  - Hoac dam bao migration/table ton tai trong dev schema.

## Ghi chu

- Playwright khong ghi nhan horizontal scroll toan trang.
- Cac anh chup va JSON audit nam trong `.agent/ui-audit/ui-audit.json`.

## Trang thai sau khi sua - 2026-06-05

Da sua tat ca loi trong report.

### Thay doi da thuc hien

- Chuyen `.bottom-nav` tu `position: fixed` sang nam trong document flow (`position: static`) de khong phu noi dung hoac footer.
- Tang touch target cho tab nav, chip filter, score stepper, group picker, leader mode buttons, footer links va cac nut nho len nguong `44px`.
- Cho phep ten doi trong `.match-team strong` wrap linh hoat hon, khong con bi line-clamp/cat chu bat ngo.
- Them fade edge cho hang chip filter ngang de co affordance rang con noi dung scroll.
- Trong local mock mode, khong goi `fetchLongTermBet(...)`, tranh request 404 toi `long_term_bets`.

### Ket qua verify

- `npm run build`: PASS.
- Playwright final audit: PASS tren 3 viewport:
  - Desktop `1440 x 1000`
  - Tablet `768 x 1024`
  - Mobile `390 x 844`
- Ket qua final:
  - `badResponses=0`
  - `errors=0`
  - `hscroll=False`
  - `overflow=0`
  - `tiny=0`
  - `clipped=0`
  - `nav=static`
- Bang chung sau sua:
  - `.agent/ui-audit-final/ui-audit-final.json`
  - `.agent/ui-audit-final/mobile-daily.png`
  - `.agent/ui-audit-final/mobile-results.png`
  - `.agent/ui-audit-final/mobile-matches.png`
