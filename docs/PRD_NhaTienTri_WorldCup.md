# PRD - Nha Tien Tri World Cup 2026

> Ban PRD nay duoc viet lai theo source code hien tai cua mini-app `nha-tien-tri`.
> Neu co lech giua tai lieu nay va code, uu tien kiem tra `src/App.jsx`, `src/lib/app/worldcup-data.js`, `src/lib/app/scoring.js`, `api/live-scores.js`.

| Hang muc | Gia tri hien tai |
|---|---|
| Ten app | Nha Tien Tri |
| Nen tang | Mushy mini-app, Vite + React 18 + Supabase |
| Slug | `nha-tien-tri` |
| Schema | `app_nha_tien_tri` / `app_nha_tien_tri_dev` |
| Nguoi dung | Thanh vien workspace Mushy |
| Pham vi lich | World Cup 2026, 104 tran, 48 doi |
| Trang thai | As-built PRD, cap nhat theo code ngay 2026-06-05 |

---

## 1. Muc Tieu San Pham

`Nha Tien Tri` la mini-app du doan World Cup 2026 cho noi bo cong ty/workspace. San pham uu tien cam giac choi nhanh, vui, co ca khia nhe, de nguoi dung co the du doan tung tran, xem diem, xem bang xep hang va theo doi cuc dien bang dau.

Muc tieu chinh:

- Nguoi choi vao la du doan duoc ti so tung tran.
- Khong bat buoc du doan tat ca 104 tran.
- Tu dong tinh diem khi tran co ket qua tu live score hoac nguon ket qua.
- Tao khong khi troll/ca khia bang cac cau nhan xet thang/thua/hoa random co kiem soat lap lai.
- Hien thi BXH game va BXH bong da theo bang A-L.
- Ho tro lich knock-out tu vong 1/16 den chung ket, tam thoi hien `Unknown` khi chua xac dinh doi.

Khong nam trong ban hien tai:

- Chua co man hinh BTC/admin rieng de nhap tay ket qua, sua doi knock-out, tao/chot cau hoi.
- Chua tinh diem cuoc dai han vao tong diem.
- Chua co he so diem rieng theo vong knock-out.
- Chua co realtime subscription rieng trong UI; app dang dung fetch + local state + polling live score.

---

## 2. Tong Quan Trai Nghiem

App dung 5 tab o bottom nav:

| Tab | Noi dung |
|---|---|
| Trang chu | Man du doan tran dau, hero, top du doan, banner xem luat |
| Tran dau | Bang xep hang bong da theo bang A-L, lich & ti so tung bang |
| Du doan | Cau hoi hom nay/ngay mai va du doan dai han |
| BXH | Bang xep hang nguoi choi, lich su cong diem, giai vui du kien |
| Luat choi | Luat diem, bonus, keo tu, streak, cau hoi vui, trao thuong |

Header co nut thong bao diem `+/-`. Khi bam vao, panel hien tong diem hien tai va cac bien dong diem gan nhat cua nguoi dung.

---

## 3. Du Lieu Giai Dau

Nguon du lieu nam trong `src/lib/app/worldcup-data.js`.

### 3.1 Lich thi dau

- `MATCHES` gom 104 tran.
- Tran `1-72`: vong bang, co doi that, bang A-L, kickoff, FIFA rank.
- Tran `73-104`: knock-out placeholder.

Mapping knock-out hien tai:

| Match no | Stage | Label |
|---|---|---|
| 73-88 | `round32` | Vong 1/16 |
| 89-96 | `round16` | Vong 1/8 |
| 97-100 | `quarter` | Tu ket |
| 101-102 | `semi` | Ban ket |
| 103 | `third` | Hang ba |
| 104 | `final` | Chung ket |

Tran knock-out chua co doi se dung:

```js
homeTeam: 'Unknown'
awayTeam: 'Unknown'
```

UI phai:

- Hien `Unknown` va icon `?`.
- Khong hien FIFA rank cho `Unknown`.
- Disable stepper va nut `Luu du doan`.
- Hien hint `Cho xac dinh doi.`

### 3.2 Doi bong va FIFA rank

`TEAM_META` chua:

- `flag`
- `fifaCode`
- `fifaRank`
- `viName`
- `flagUrl`

FIFA rank duoc dung cho:

- Hien thi duoi ten doi tren match card.
- Bang xep hang bong da.
- Tinh bonus cua duoi trong scoring engine.

### 3.3 Cau hoi vui

`DAILY_QUESTIONS` la danh sach cau hoi static theo ngay, gom:

- `key`
- `date`
- `prompt`
- `options`
- `closesAt`
- `correctAnswer`
- `points`

UI hien cau hoi cua hom nay va ngay mai.

---

## 4. Luat Diem Hien Tai

Scoring engine nam trong `src/lib/app/scoring.js`.

### 4.1 Diem tung tran

| Ket qua du doan | Diem |
|---|---:|
| Dung ti so chinh xac | 5 |
| Dung ket qua va dung hieu so | 3 |
| Chi dung thang/hoa/thua | 2 |
| Sai | 0 |

Ham lien quan:

- `outcome(home, away)`
- `matchBasePoints(prediction, match)`
- `matchPoints(prediction, match)`
- `matchScoreBreakdown(prediction, match)`

### 4.2 Keo tu

Keo tu la `doubleDown`.

Hien tai:

- Chi duoc chon trong dung ngay thi dau cua tran.
- Moi ngay chi 1 keo tu.
- Khi luu, app kiem tra user da co `doubleDown` trong `matchDay` do chua.
- Diem sau cung nhan `x2`.

Khac voi blueprint cu: khong phai 1 keo/vong, ma la 1 keo/ngay thi dau.

### 4.3 Bonus cua duoi

Dung trong `matchUpsetBonus`.

| Dieu kien | Bonus |
|---|---:|
| Doi yeu hon thang, chenh FIFA rank >= 20 | +1 |
| Doi yeu hon thang, chenh FIFA rank >= 40 | +2 |
| Doan dung hoa, chenh FIFA rank >= 30 | +1 |

Bonus chi cong khi nguoi choi co diem base > 0.

### 4.4 Streak

`streakBonus` cong +5 diem cho moi chuoi 3 tran lien tiep doan dung ti so chinh xac.

Luot tinh theo `matchNo` cua cac tran da finished.

### 4.5 Cau hoi vui

`dailyPoints(answer, question)`:

- So khop cau tra loi sau khi trim, lower-case va normalize khoang trang.
- Dung thi cong `question.points`, mac dinh 2 diem.
- Chua co `correctAnswer` thi chua tinh diem.

### 4.6 Du doan dai han

UI da cho luu:

- Vo dich: +20 diem theo copy UI.
- Vua pha luoi: +10 diem theo copy UI.
- Doi gay soc: +10 diem theo copy UI.

Trang thai source hien tai:

- Co form va luu vao `long_term_bets`.
- Chua co logic cham diem du doan dai han trong `computeStandings`.
- Chua co config dap an that su trong UI.

---

## 5. Man Hinh Va Chuc Nang

### 5.1 Trang chu / Du doan tran

Component: `MatchesScreen`, `MatchCardPrototype`.

Chuc nang:

- Loc tran theo `Tat ca`, bang A-D, mo rong bang E-L.
- Loc them cac vong knock-out: `1/16`, `1/8`, `Tu ket`, `Ban ket`, `Hang ba`, `Chung ket`.
- Tim theo ten doi goc hoac ten tieng Viet.
- Nhom tran theo ngay thi dau.
- Truoc gio bong lan:
  - Hien 2 doi, co, FIFA rank.
  - Stepper ti so nam duoi tung doi.
  - Nut sao keo tu.
  - Nut `Luu du doan`.
- Sau gio bong lan:
  - Khoa du doan.
- Khi tran finished:
  - Hien ti so that.
  - Hien cau troll/ca khia theo ket qua du doan.
  - Hien diem cong cua tran.

Logic khoa:

```js
locked = now >= kickoffAt || team is Unknown
```

### 5.2 Troll copy khi thang/thua/hoa

Nguon: `ROAST_COPY` trong `src/App.jsx`.

Nhom copy:

- `win`
- `lose`
- `draw`

App dung:

- `predictionRoast`
- `buildRoastMap`
- `stablePickAvoiding`

Muc tieu:

- Cau troll co icon theo ngu canh.
- It lap lai cac cau gan nhau bang cach nho 3 cau gan nhat theo tung tone.

### 5.3 Live score va trang thai tran

API: `api/live-scores.js`.

Nguon:

- Primary: `https://worldcup26.ir/get/games`
- Fallback: ESPN scoreboard.

Client polling moi 2 phut:

```js
LIVE_SCORE_POLL_MS = 120000
```

Trang thai hien thi:

| Status normalized | Badge |
|---|---|
| `in_progress` | `LIVE` + raw clock neu co |
| `extra_time` | `ET` |
| `penalties` | `PEN` |
| `finished` + `finishType=aet` | `AET` |
| `finished` + `finishType=penalties` | `PEN` |
| `finished` mac dinh | `FT` |

Khi live score tra ve finished, app tu merge vao match bang `applyAutomaticScores`.

### 5.4 Tab Tran dau - BXH bong da

Component: `ResultsScreen`.

Chuc nang:

- Hien bang A-L.
- Moi bang co:
  - Top 2 doi dan dau.
  - Bang thong ke: tran, thang, hoa, bai, hieu so, diem.
  - Lich & ti so 6 tran cua bang.
- Co tinh tam live score neu tran dang dien ra.

Bang bong da chi tinh vong bang, dua tren `GROUPS`.

### 5.5 Tab Du doan - Cau hoi va dai han

Component: `DailyScreen`, `QuestionCard`, `LongTermBetCard`.

Cau hoi:

- Hien cau hoi hom nay va ngay mai.
- Neu co `options`, hien button option.
- Neu khong co `options`, hien input text.
- Khoa khi `now >= closesAt` hoac da co `correctAnswer`.
- Luu vao `group_daily_answers`.

Du doan dai han:

- Chon doi vo dich bang `Select`.
- Nhap/chon vua pha luoi qua input + datalist.
- Chon doi gay soc bang `Select`.
- Luu vao `long_term_bets`.

Luu y: source hien tai chua khoa du doan dai han theo gio khai mac.

### 5.6 Tab BXH

Component: `LeaderboardScreen`, `ScoreHistoryPanel`.

Chuc nang:

- Hien BXH nguoi choi theo tong diem.
- Highlight dong cua chinh user.
- Co 3 nut mode: `Tong`, `Theo tuan`, `Theo vong`.
- Hien tai 3 nut mode chi la UI state; danh sach van dung chung `standings`.
- Lich su cong diem:
  - Ngay dien ra tran nam trong badge type.
  - Label tran co co quoc ky 2 doi.
  - Hien chi tiet diem: dung ti so, dung hieu so, cua duoi, daily.
- Panel giai vui du kien:
  - Thanh phan bua.
  - Thuy chung.
  - Vua nuoc rut.

### 5.7 Tab Luat choi

Component: `RulesScreen`.

Hien cac rule-card co icon tu `lucide-react`:

- Diem tung tran.
- Bonus cua duoi.
- Keo tu moi ngay.
- Streak.
- Cau hoi vui.
- Chot so.
- Trao thuong.

---

## 6. Du Lieu Va Luu Tru

### 6.1 Bang dang duoc UI dung

Source hien tai cua UI dang doc/ghi cac bang:

| Bang | Dung de |
|---|---|
| `group_predictions` | Luu du doan ti so theo `match_no` |
| `group_daily_answers` | Luu cau tra loi daily theo `question_key` |
| `long_term_bets` | Luu du doan dai han |
| `group_match_results` | Migration co tao bang ket qua, nhung UI hien chu yeu lay ket qua tu static/live score |

Moi query can scope theo:

```js
.eq('workspace_id', scope.workspaceId)
```

### 6.2 Bang blueprint da co migration nhung chua phai duong UI chinh

Migration `002_nha_tien_tri_schema.sql` tao schema day du:

- `matches`
- `predictions`
- `long_term_bets`
- `daily_questions`
- `daily_answers`
- `app_config`

Tuy nhien source hien tai dang su dung cach static-first:

- Lich/cau hoi nam trong `worldcup-data.js`.
- Du doan/cau tra loi dung bang group-stage compatibility: `group_predictions`, `group_daily_answers`.

Can can nhac hop nhat schema trong roadmap.

### 6.3 Rang buoc hien tai can chu y

`group_predictions.match_no` va `group_match_results.match_no` trong migration 003/004 dang check `1..72`.

Trong khi source da co 104 tran. Neu muon luu du doan knock-out vao DB that, can migration cap nhat:

```sql
alter table app_nha_tien_tri.group_predictions
  drop constraint ...,
  add check (match_no between 1 and 104);
```

Tuong tu cho `group_match_results`.

---

## 7. Kien Truc Ky Thuat

### 7.1 Frontend

- Entry UI: `src/App.jsx`.
- Style app-specific: `src/App.css`.
- Data app-specific: `src/lib/app/worldcup-data.js`.
- Scoring engine: `src/lib/app/scoring.js`.
- Data validation/test: `src/lib/app/data-validation.js`, `src/lib/app/scoring.test.js`.

### 7.2 Backend/API

- `api/live-scores.js`: fetch live score, normalize status, fallback ESPN.
- `api/_verify.js`: verify JWT theo template.

### 7.3 Local simulation

App co mock mode khi dev:

- `?mock=1`
- `src/lib/app/mock-simulation.js`

Mock tao:

- Context gia lap.
- Member gia lap.
- Du doan mau.
- 6 tran dau co live/finished score.

### 7.4 Dependencies dang dung

Trong `package.json`:

- React 18.
- Supabase JS.
- PostHog JS.
- `lucide-react` cho icon bell/rules.

---

## 8. Acceptance Criteria Hien Tai

### 8.1 Du doan tran

Given tran co doi that va chua toi kickoff  
When user chon ti so va bam `Luu du doan`  
Then app upsert vao `group_predictions` voi `workspace_id`, `created_by`, `match_no`, `match_day`, `home_pred`, `away_pred`, `double_down`.

Given tran da toi kickoff  
Then stepper bi disabled va user khong luu duoc du doan moi.

Given tran knock-out co doi `Unknown`  
Then stepper va nut luu bi disabled, hien `Cho xac dinh doi.`

### 8.2 Keo tu

Given user da co 1 keo tu trong cung `matchDay`  
When user co gang luu tran khac cung ngay voi `doubleDown=true`  
Then app bao loi ngay do da co keo tu.

### 8.3 Live score

Given live score tra status `extra_time`  
Then badge hien `ET`.

Given live score tra finished sau extra time  
Then badge ket qua hien `AET`.

Given live score tra penalty/shootout  
Then badge hien `PEN`.

### 8.4 BXH bong da

Given mot bang co tran finished hoac live score  
Then `ResultsScreen` tinh W/D/L/GF/GA/GD/points va sap xep theo diem, hieu so, ban thang.

### 8.5 BXH nguoi choi

Given co predictions va matches finished  
Then `computeStandings` tinh tong diem, diem tran, bonus cua duoi, streak, daily.

---

## 9. Roadmap / Viec Can Lam Tiep

Muc uu tien cao:

1. Cap nhat migration `group_predictions` va `group_match_results` tu `1..72` len `1..104` neu muon cho du doan knock-out tren DB that.
2. Them flow cap nhat doi knock-out tu `Unknown` sang doi that.
3. Them man hinh admin/BTC hoac cong cu nhap tay ket qua khi live score khong on dinh.
4. Hop nhat schema static-first voi bang `matches/predictions/daily_questions` neu muon van hanh lau dai.
5. Tinh diem du doan dai han vao `computeStandings`.

Muc uu tien trung binh:

1. Lam that 2 mode BXH `Theo tuan` va `Theo vong`.
2. Khoa du doan dai han theo gio khai mac.
3. Them PostHog events: `prediction_saved`, `daily_answer_saved`, `long_term_saved`, `live_score_synced`.
4. Them push notification nhac truoc deadline tran hot.
5. Them cache/ghi nhan ket qua live score de tranh thay doi sau khi FT.

Rui ro:

- Nguon live score mien phi co the sai/le/khong on dinh.
- Vong knock-out da co lich slot nhung chua co doi that.
- RLS workspace cho phep member doc chung data; UI an pick nguoi khac nhung khong phai bao mat tuyet doi.
- Console local mock co the co 401 Supabase neu dev token/context khong hop le, nhung app van fallback mock.

---

## 10. File Tham Chieu

| File | Vai tro |
|---|---|
| `src/App.jsx` | UI, state, save handlers, live score merge, screens |
| `src/App.css` | Layout, compact cards, bottom nav, match UI |
| `src/lib/app/worldcup-data.js` | 104 matches, teams, FIFA ranks, daily questions |
| `src/lib/app/scoring.js` | Scoring engine |
| `src/lib/app/data-validation.js` | Static data validator |
| `src/lib/app/scoring.test.js` | Unit tests scoring/data |
| `src/lib/app/mock-simulation.js` | Local mock mode |
| `api/live-scores.js` | Live score API and normalization |
| `migrations/003_group_stage_predictions.sql` | `group_predictions`, `group_daily_answers` |
| `migrations/004_group_match_results.sql` | `group_match_results` |

---

## 11. Definition Of Done

Mot thay doi san pham duoc coi la xong khi:

- `npm test` pass.
- `npm run build` pass.
- Neu thay doi UI, da verify browser local `http://127.0.0.1:5173?mock=1`.
- PRD nay duoc cap nhat neu thay doi rule, schema, tab, scoring, live score hoac lich thi dau.
