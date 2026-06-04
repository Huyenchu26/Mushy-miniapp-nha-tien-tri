# PRD & Technical Spec — "Nhà Tiên Tri World Cup" 🏆

> Mini-app dự đoán tỉ số nội bộ công ty cho FIFA World Cup 2026, chạy trên nền tảng **Mushy mini-app** (Vite + React + Supabase).
> Tài liệu này là **single source of truth** cho cả team khi build. Đọc kèm `CLAUDE.md` (quy tắc kỹ thuật template).

| | |
|---|---|
| **Slug / schema** | `worldcup` → `app_worldcup` (prod) / `app_worldcup_dev` (dev) |
| **Nền tảng** | Mushy mini-app template (Vite + React 18 + Supabase) |
| **Người dùng** | Nhân viên trong 1 workspace công ty (đăng nhập bằng tài khoản Mushy) |
| **Thời gian giải** | 11/6 → 19/7/2026 · 104 trận · 48 đội |
| **Trạng thái tài liệu** | v1.0 — đã chốt blueprint, sẵn sàng phân công build |

---

## 1. Bối cảnh & Mục tiêu

### 1.1 Vấn đề
Công ty muốn một sân chơi nội bộ trong mùa World Cup 2026 để **tăng gắn kết, tạo không khí "khẩu chiến cà khịa" mỗi sáng**. Giải có **104 trận trong 39 ngày** — quá nhiều để bắt mọi người dự đoán hết. Cần một game **rào cản thấp, ai vào trễ vẫn có cửa, người "phán bừa" vẫn thắng được**.

### 1.2 Mục tiêu sản phẩm
1. **Tham gia dễ**: dự trận nào hay trận đó, bỏ trận không bị phạt.
2. **Giữ nhiệt suốt giải**: kèo tủ, cược dài hạn, câu đố vui, thưởng streak, giải theo chặng.
3. **Công bằng & minh bạch**: tự động chấm điểm, BXH cập nhật realtime, ai cũng thấy.
4. **Vận hành nhẹ cho BTC**: nạp lịch 1 lần, nhập kết quả nhanh, hệ thống tự tính.

### 1.3 Không nằm trong phạm vi (v1)
- Không có thanh toán/giải thưởng tự động (BTC trao tay ngoài app).
- Không tự lấy kết quả trận từ API thể thao (BTC nhập tay — tránh phụ thuộc & sai lệch).
- Không chống gian lận tuyệt đối ở tầng DB (xem mục 6.3 — ẩn dự đoán ở UI + tin tưởng nội bộ).

### 1.4 Chỉ số thành công (gợi ý theo dõi qua PostHog)
- % thành viên workspace tham gia ≥ 1 dự đoán.
- Số dự đoán/ngày trong vòng bảng.
- Tỉ lệ người chơi trả lời câu đố vui (đo mức kéo "dân ngoại đạo").
- Retention: số người còn dự đoán ở tuần knock-out.

---

## 2. Người dùng & Vai trò

Người chơi = **thành viên workspace công ty**, định danh bằng **tài khoản Mushy** (không cần đăng nhập riêng). Tên hiển thị lấy từ `listMembers()` (`src/lib/members.js`).

| Vai trò | Map vào | Quyền |
|---|---|---|
| **Người chơi** | `ctx.role = 'member'` | Dự đoán tỉ số, kèo tủ, cược dài hạn, trả lời câu đố, xem BXH |
| **BTC (Ban tổ chức)** | `ctx.role = 'owner'` hoặc `'admin'` | Tất cả quyền người chơi **+** nạp lịch, nhập kết quả 90', tạo câu đố + chốt đáp án, chốt champion/vua phá lưới/đội sốc, sửa tên đội knock-out |

> Lấy `ctx` từ `getContext()` (`src/lib/context.js`): `{ token, userId, workspaceId, role, ... }`. Dùng `useActiveScope().workspaceId` cho mọi query (không hardcode `ctx.workspaceId`).

---

## 3. Luật chơi (Business Rules)

### 3.1 Tính điểm mỗi trận

| Kết quả dự đoán | Điểm gốc |
|---|---|
| Đúng **tỉ số chính xác** (dự 2-1, KQ 2-1) | **5đ** |
| Đúng đội thắng + **đúng hiệu số** (dự 2-1, KQ 3-2) | **3đ** |
| Chỉ đúng kết quả thắng/hòa/thua (sai hiệu số) | **2đ** |
| Sai | **0đ** |

**Hệ số theo vòng** (nhân vào điểm gốc):

| Vòng | Hệ số |
|---|---|
| Vòng bảng (`group`) | ×1 |
| Vòng 1/16 (`r32`) | ×1.5 |
| Vòng 1/8 (`r16`) | ×1.5 |
| Tứ kết (`qf`) | ×2 |
| Bán kết (`sf`) | ×2 |
| Tranh hạng 3 (`third`) | ×2 |
| Chung kết (`final`) | ×2 |

> ⚠️ **Knock-out tính theo tỉ số 90' chính thức** (KHÔNG tính hiệp phụ/penalty). BTC nhập đúng tỉ số hết 90 phút.

### 3.2 Bốn "gia vị"

**a. Kèo tủ (Double-down) — ×2 điểm.** Mỗi **vòng đấu**, người chơi chọn **1 trận** để x2 điểm trận đó (sau khi đã nhân hệ số vòng). Đổi kèo tủ sang trận khác sẽ **tự gỡ** kèo tủ cũ. Các "vòng" để giới hạn kèo tủ: `group`, `r32`, `r16`, `qf`, `sf`, `final` (gộp `third` vào `final` hoặc cho phép riêng — xem mục mở rộng).

**b. Cược dài hạn — khoá từ đầu giải.** Trước **trận khai mạc**, mỗi người điền:
- **Vô địch** → đúng **+20đ**
- **Vua phá lưới** → đúng **+10đ**
- **Đội gây sốc nhất** (BTC chốt cuối giải) → đúng **+10đ**

Khoá khi `now() >= app_config.opening_kickoff_at`. Ai vào trễ nhưng còn trong vòng bảng vẫn được điền (mục 3.3).

**c. Câu đố vui mỗi ngày — 2đ/câu.** BTC ra câu hỏi không cần giỏi bóng đá: "Hôm nay trận nào nhiều bàn nhất?", "Có thẻ đỏ không?", "Tổng bàn cả ngày chẵn/lẻ?". Hết hạn trả lời theo `closes_at`. BTC chốt `correct_answer` → tự cộng điểm.

**d. Thưởng streak — +5đ.** Dự đúng **tỉ số chính xác** (điểm gốc = 5) **3 trận liên tiếp** → +5đ bonus. Đếm theo thứ tự `match_no` của các trận **đã có kết quả** mà người chơi có dự đoán. Cứ mỗi 3 trận đúng liên tiếp (3, 6, 9...) cộng thêm +5.

### 3.3 Luật vận hành
- **Chốt sổ**: dự đoán mỗi trận phải nộp **trước `kickoff_at`**. Sau giờ đó → khoá, không sửa được, tính theo bản đã nộp. Không nộp = 0đ.
- **Vào trễ vẫn chơi**: tham gia muộn vẫn cộng điểm từ trận kế tiếp; cược dài hạn còn điền được nếu chưa tới `opening_kickoff_at` (hoặc theo BTC nới tới hết vòng bảng — config).
- **Không bắt buộc đủ 104 trận**: bỏ trận = 0đ trận đó, không phạt.

### 3.4 Cơ cấu giải thưởng (BTC trao tay — app chỉ hiển thị)
- **Giải từng chặng**: cao điểm nhất vòng bảng + mỗi vòng knock-out → voucher nhỏ (giữ nhiệt liên tục).
- **Top 3 chung cuộc**: Quán quân / Á quân / Hạng ba.
- **Giải vui**: "Thánh phán bừa", "Cú lội ngược dòng", "Thủy chung" (xem mục 5.4).

---

## 4. Kiến trúc & Mô hình dữ liệu

### 4.1 Tổng quan kỹ thuật
- **Frontend**: Vite + React 18, 1 SPA, điều hướng bằng **tab dưới** (không react-router — state `activeTab`).
- **Backend/DB**: Supabase schema `app_worldcup`, truy cập qua `db.from(...)` (`src/lib/supabase.js`), RLS workspace-scoped.
- **Realtime**: `subscribeToTable()` cho `matches` + `predictions` (+ `long_term_bets`, `daily_answers`) → BXH live.
- **Định danh & member**: `getContext()` + `listMembers()`.
- **Design system**: `theme.css` Mushy v3 (gamified) + `useDialog()` thay alert/confirm + `Select` thay `<select>`.
- **KHÔNG cần** AI proxy, storage, service_role cho v1.

### 4.2 Sáu bảng dữ liệu (đã viết sẵn ở `migrations/002_worldcup_schema.sql`)

Mọi bảng có `workspace_id` + `created_by` + 4 RLS policy (`can_access_app_data` cho select/insert/update, `is_owner_workspace_member` cho delete) theo convention template.

**1) `matches`** — 104 trận của giải.
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `match_no` | int 1–104 | thứ tự trận, unique theo workspace |
| `stage` | text | `group/r32/r16/qf/sf/third/final` |
| `group_label` | text null | `A`..`L` (chỉ vòng bảng) |
| `home_team`, `away_team` | text | tên đội (knock-out = "Chờ xác định", BTC sửa sau) |
| `kickoff_at` | timestamptz | mốc khoá dự đoán |
| `home_score`, `away_score` | int null | tỉ số 90' (BTC nhập) |
| `status` | text | `scheduled` / `finished` |

**2) `predictions`** — dự đoán mỗi trận.
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `match_id` | uuid FK matches | |
| `home_pred`, `away_pred` | int 0–99 | |
| `double_down` | boolean | kèo tủ ×2 |
| unique | `(workspace_id, created_by, match_id)` | 1 dự đoán/người/trận |

**3) `long_term_bets`** — cược dài hạn, unique `(workspace_id, created_by)`: `champion`, `top_scorer`, `shock_team`.

**4) `daily_questions`** — câu đố: `q_date`, `prompt`, `options` (jsonb optional), `correct_answer` (null=chưa chốt), `points` (default 2), `closes_at`.

**5) `daily_answers`** — trả lời, unique `(workspace_id, created_by, question_id)`: `answer`.

**6) `app_config`** — 1 dòng/workspace: `opening_kickoff_at`, `champion_actual`, `top_scorer_actual`, `shock_team_actual`.

> Realtime opt-in (đã đánh `-- @realtime`): `matches`, `predictions`, `long_term_bets`, `daily_answers`. Reviewer tự append `alter publication` + `replica identity full`.

### 4.3 Lịch thi đấu (fixtures) — 48 đội thật, kết quả bốc thăm 5/12/2025

Lịch ship sẵn dạng JS (`src/lib/app/fixtures.js`), BTC bấm **"Nạp lịch 104 trận"** để insert vào workspace.

**12 bảng (A–L):**

| Bảng | 4 đội |
|---|---|
| A | Mexico · Nam Phi · Hàn Quốc · CH Séc |
| B | Canada · Thụy Sĩ · Qatar · Bosnia & Herzegovina |
| C | Brazil · Maroc · Haiti · Scotland |
| D | Mỹ · Paraguay · Úc · Thổ Nhĩ Kỳ |
| E | Đức · Curaçao · Bờ Biển Ngà · Ecuador |
| F | Hà Lan · Nhật Bản · Tunisia · Thụy Điển |
| G | Bỉ · Ai Cập · Iran · New Zealand |
| H | Tây Ban Nha · Cabo Verde · Ả Rập Xê Út · Uruguay |
| I | Pháp · Senegal · Iraq · Na Uy |
| J | Argentina · Algeria · Áo · Jordan |
| K | Bồ Đào Nha · CHDC Congo · Uzbekistan · Colombia |
| L | Anh · Croatia · Ghana · Panama |

**Cấu trúc 104 trận:**
- **72 trận vòng bảng**: 12 bảng × 6 trận (vòng tròn 1 lượt), 11/6 → 27/6.
- **32 trận knock-out**: 1/16 (16 trận, 28/6–3/7) → 1/8 (8 trận, 4–7/7) → tứ kết (4, 9–11/7) → bán kết (2, 14–15/7) → tranh hạng 3 (1, 18/7) → chung kết (1, 19/7).
- Đội knock-out để **"Chờ xác định"** — BTC cập nhật tên đội sau khi xong vòng bảng (đội phụ thuộc kết quả).

> `kickoff_at` ship theo khung ngày chính thức; BTC chỉnh giờ chính xác nếu cần. Mốc khoá dự đoán theo `kickoff_at`.

---

## 5. Đặc tả màn hình (UI Spec)

Điều hướng: **5 tab** ở thanh dưới. Tab "BTC" chỉ hiện khi `ctx.role ∈ {owner, admin}`.

```
[ ⚽ Trận đấu ]  [ 🏆 Cược dài hạn ]  [ ❓ Câu đố ]  [ 📊 BXH ]  [ 🛠 BTC* ]
```

### 5.1 Tab "Trận đấu" (Người chơi)
- Danh sách trận **nhóm theo ngày** (và theo vòng); mặc định cuộn tới ngày gần nhất.
- Bộ lọc: theo vòng (Vòng bảng / 1/16 / ...) và theo bảng (A–L).
- **Match card** hiển thị: tên 2 đội, vòng + bảng, giờ `kickoff_at`, hệ số vòng (badge ×1.5/×2).
- **Trước kickoff**: 2 ô nhập tỉ số (stepper 0–99) + nút ⭐ "Kèo tủ" (toggle). Nút **Lưu** → upsert `predictions`. Haptic success.
- **Sau kickoff (đã khoá)**: hiện dự đoán đã nộp của mình + tỉ số thật (nếu `finished`) + **điểm nhận được** (badge). Pick của người khác **ẩn cho tới khi trận khoá** (mục 6.3).
- Trạng thái rỗng: chưa nạp lịch → CTA hướng dẫn (người chơi) / nút "Nạp lịch" (BTC).

**Acceptance (Gherkin):**
```
Scenario: Nộp dự đoán trước giờ bóng lăn
  Given trận chưa tới kickoff_at
  When người chơi nhập 2-1 và bấm Lưu
  Then 1 dòng predictions được upsert với home_pred=2, away_pred=1
  And hiện toast "Đã lưu dự đoán"

Scenario: Khoá sau kickoff
  Given now() >= kickoff_at
  Then ô nhập tỉ số bị disable
  And nếu match.status='finished' thì hiện điểm đã tính

Scenario: Kèo tủ duy nhất mỗi vòng
  Given người chơi đã đặt kèo tủ ở trận X (cùng vòng)
  When đặt kèo tủ ở trận Y cùng vòng
  Then trận X tự bỏ double_down, chỉ Y còn double_down=true
```

### 5.2 Tab "Cược dài hạn"
- 3 ô: Vô địch (chọn từ 48 đội), Vua phá lưới (text/tự do), Đội gây sốc (chọn từ 48 đội).
- Nút **Lưu** → upsert `long_term_bets`.
- Sau `opening_kickoff_at`: khoá, chỉ xem. Sau khi BTC chốt đáp án (`app_config.*_actual`): hiện ✓/✗ + điểm.
- Hiển thị đếm ngược tới giờ khoá.

**Acceptance:**
```
Scenario: Khoá cược dài hạn khi giải bắt đầu
  Given now() >= app_config.opening_kickoff_at
  Then 3 ô bị disable, hiện "Đã khoá"
```

### 5.3 Tab "Câu đố vui"
- Danh sách câu đố theo ngày (mới nhất trên cùng).
- Câu còn hạn (`now() < closes_at`, chưa có `correct_answer`): cho trả lời (radio nếu có `options`, hoặc text) → upsert `daily_answers`.
- Câu đã chốt: hiện đáp án đúng + đáp án của mình + điểm.
- BTC tạo câu đố ở tab BTC (5.5).

### 5.4 Tab "BXH" (Bảng xếp hạng)
- **Bảng xếp hạng tổng** realtime: hạng, tên + avatar (`listMembers`), tổng điểm, badge điểm thành phần (trận / streak / dài hạn / câu đố).
- Highlight dòng của chính mình.
- **Bộ lọc chặng**: Tổng / Vòng bảng / từng vòng knock-out (điểm chỉ tính trận thuộc chặng đó) → phục vụ "giải từng chặng".
- **Giải vui** (panel riêng):
  - 🎯 **Thủy chung**: người dự nhiều trận nhất (đếm `predictions`).
  - 🃏 **Thánh phán bừa**: trong top hạng nhưng tỉ lệ đúng-tỉ-số-chính-xác thấp.
  - 🚀 **Cú lội ngược dòng**: tăng hạng mạnh nhất nửa sau giải *(cần snapshot theo ngày — xem mục 8, v1 có thể để placeholder hoặc tính từ mốc do BTC chốt)*.
- Cập nhật khi `matches`/`predictions` đổi (realtime) → re-tính `computeStandings()`.

### 5.5 Tab "BTC" (chỉ owner/admin)
- **Nạp lịch**: nút "Nạp 104 trận" (insert fixtures, idempotent — bỏ qua nếu đã có). Nút sửa giờ/tên đội từng trận.
- **Nhập kết quả**: chọn trận → nhập `home_score`/`away_score` (90') → set `status='finished'`. Tự kích hoạt tính điểm (client re-compute).
- **Câu đố**: tạo câu hỏi (prompt, options, points, closes_at) + sau đó chốt `correct_answer`.
- **Cấu hình giải**: set `opening_kickoff_at`; cuối giải chốt `champion_actual`, `top_scorer_actual`, `shock_team_actual`.
- (Tùy chọn) Gửi push nhắc nhở qua `mushyApi.push()` — xem mục 7.

**Acceptance:**
```
Scenario: Nhập kết quả → tính điểm
  Given BTC nhập KQ 90' cho trận đã đá
  When lưu (status='finished', scores set)
  Then BXH tự cập nhật điểm mọi người chơi cho trận đó (qua realtime + computeStandings)
```

---

## 6. Logic chấm điểm (Engine Spec)

Đặt ở `src/lib/app/scoring.js` (pure functions, dễ unit-test). Tính **client-side** từ data đã fetch.

### 6.1 Hàm cốt lõi
```
outcome(h, a)            → 1 (thắng) | 0 (hòa) | -1 (thua)
matchBasePoints(pred,m)  → null nếu m chưa finished; else 5 / 3 / 2 / 0
matchPoints(pred, m)     → base × STAGE_MULTIPLIER[m.stage] × (pred.double_down ? 2 : 1)
streakBonus(predsByMatchId, finishedMatchesSortedByNo)
                         → +5 mỗi 3 trận có base===5 liên tiếp
longTermPoints(bet, cfg) → {champion(20|0), topScorer(10|0), shock(10|0), total}
dailyPoints(answer, q)   → q.points nếu đúng (so khớp không phân biệt hoa/thường, trim)
computeStandings({...})  → [{ userId, total, matchPts, streakPts, longTermPts,
                             dailyPts, predictedCount, exactCount, finishedPredicted }]
                           sắp xếp giảm dần theo total
```

### 6.2 Quy tắc edge-case
- So khớp tên (vua phá lưới, đáp án câu đố): `.trim().toLowerCase()`, bỏ dấu khoảng thừa.
- Trận chưa `finished` → không tính (base=null).
- Người chơi không có dự đoán cho trận finished → 0đ trận đó (không tính vào streak, reset chuỗi).
- Hệ số nhân **trước** double-down: `base × multiplier × 2`.

### 6.3 Bảo mật & công bằng (quan trọng)
RLS template cho phép **mọi member workspace đọc data cùng workspace** (cần cho BXH + chấm điểm). Hệ quả: về mặt kỹ thuật, một người rành tech có thể đọc dự đoán người khác qua API **trước** giờ bóng lăn.
- **v1 (chấp nhận được — game vui nội bộ)**: UI **ẩn pick của người khác** cho tới khi trận khoá; dựa trên tin tưởng nội bộ.
- **Nếu cần chặt hơn (v2)**: viết RLS so sánh `kickoff_at` (policy cross-table) hoặc proxy qua Edge Function. Ngoài phạm vi v1.

> Ghi rõ giới hạn này cho BTC để truyền thông "tinh thần fair-play".

---

## 7. Tích hợp nền tảng (dùng lib có sẵn — KHÔNG sửa `src/lib/*`)

| Nhu cầu | Dùng |
|---|---|
| Context user | `getContext()` — `src/lib/context.js` |
| Query DB | `db.from('matches')...eq('workspace_id', scope.workspaceId)` — `src/lib/supabase.js` |
| Scope workspace | `useActiveScope()` — `src/lib/sharing.js` |
| Tên + avatar người chơi | `listMembers(scope.workspaceId)` — `src/lib/members.js` |
| Realtime BXH | `subscribeToTable('matches'|'predictions', ws, cb)` — `src/lib/realtime.js` (nhớ unsubscribe khi unmount) |
| Confirm/alert | `useDialog()` — `src/components/Dialog.jsx` |
| Dropdown | `Select` — `src/components/Select.jsx` (KHÔNG dùng `<select>`) |
| Haptic | `bridge.haptic('success')` — `src/lib/bridge.js` |
| Push nhắc nhở (BTC) | `mushyApi.push({ title, body, data:{ appSlug:'worldcup', kind:'deadline_reminder' } })` |
| Analytics | `track('prediction_saved', {...})`, `trackScreen('matches')` — `src/lib/analytics.js` |
| Design tokens | `theme.css` classes + `theme.js` JS tokens (gamified v3) |

**Sự kiện analytics đề xuất**: `prediction_saved`, `double_down_set`, `long_term_bet_saved`, `daily_answered`, `result_entered` (BTC), `fixtures_seeded` (BTC).

---

## 8. Cấu trúc file & phân lớp code

```
mushy.config.json              slug = "worldcup"            ✅ đã set
migrations/002_worldcup_schema.sql                          ✅ đã viết
src/
├── App.jsx                    shell + tab nav              ⬜ build
├── App.css                    style gamified               ⬜ build
├── lib/app/                   (app-specific, né --delete khi sync)
│   ├── fixtures.js            104 trận + 48 đội             ⬜ build
│   ├── scoring.js             engine chấm điểm (pure)       ⬜ build
│   └── queries.js             (tùy) wrapper db cho từng bảng ⬜ optional
└── screens/
    ├── MatchesScreen.jsx                                   ⬜ build
    ├── LongTermScreen.jsx                                  ⬜ build
    ├── DailyQuizScreen.jsx                                 ⬜ build
    ├── LeaderboardScreen.jsx                               ⬜ build
    └── AdminScreen.jsx        (BTC)                        ⬜ build
```

> ⚠️ Helper app-specific để trong `src/lib/app/` (subfolder) — `sync-template.sh` chạy `rsync --delete` ở `src/lib/`, file đặt trực tiếp sẽ bị xoá khi sync template.

---

## 9. Task Graph — phân công build cho team

Mỗi task có acceptance rõ; ưu tiên theo phụ thuộc.

```
TIP-001 Migration & seed data ──┬─► TIP-003 Scoring engine ──► TIP-006 Leaderboard
  (schema + fixtures.js)         │     (scoring.js + unit test)
                                 ├─► TIP-004 Matches screen
                                 ├─► TIP-005 Long-term + Daily quiz
                                 └─► TIP-002 App shell + tab nav ──► TIP-007 Admin (BTC)
                                                                        └─► TIP-008 VERIFY/QA
```

| TIP | Nội dung | Output | Phụ thuộc |
|---|---|---|---|
| **001** | `migrations/002` (✅) + `fixtures.js` (104 trận, 48 đội, ngày) | Submit migration qua Admin Portal; nút "Nạp lịch" insert được | — |
| **002** | `App.jsx` shell: `getContext`, tab nav, ẩn tab BTC nếu không phải admin, loading/empty states | App chạy, chuyển tab OK | — |
| **003** | `scoring.js` thuần + **unit test** mọi case (5/3/2/0, hệ số, double-down, streak, long-term, daily) | Test pass | 001 |
| **004** | Màn Trận đấu: list nhóm theo ngày, nhập tỉ số, kèo tủ, khoá theo `kickoff_at`, hiện điểm | Acceptance 5.1 | 001,002 |
| **005** | Cược dài hạn + Câu đố vui (người chơi) | Acceptance 5.2, 5.3 | 001,002 |
| **006** | BXH realtime + bộ lọc chặng + giải vui | Acceptance 5.4 | 003,004 |
| **007** | Màn BTC: nạp lịch, nhập KQ, tạo/chốt câu đố, config + đáp án dài hạn, sửa tên đội KO | Acceptance 5.5 | 001,002 |
| **008** | VERIFY: QA theo acceptance, smoke test in-shell + browser, build pass | Verify report | tất cả |

---

## 10. Quy trình triển khai (BTC/Dev)

1. **Set slug** `worldcup` (✅ trong `mushy.config.json`).
2. **Đăng ký mini-app** ở Admin Portal (visibility Private trước) — xem `CLAUDE.md` §8.2.
3. **Submit migration** `002_worldcup_schema.sql` qua Admin Portal Migration Reviewer (KHÔNG chạy SQL Editor tay).
4. `npm install` → `npm run dev:setup` → `npm run dev` (test browser mock).
5. Push 2 branch `main` + `dev` → connect Vercel → tắt Deployment Protection.
6. BTC: mở app → **Nạp lịch 104 trận** → set `opening_kickoff_at` → mở cược dài hạn.
7. Mỗi ngày: nhập KQ 90' các trận đã đá; (tùy) tạo câu đố vui; BXH tự cập nhật.
8. Cuối giải: chốt champion / vua phá lưới / đội sốc → điểm dài hạn cộng tự động.
9. Ổn định → đổi visibility **Public** cho team khác dùng.

---

## 11. Rủi ro & Quyết định mở

| # | Vấn đề | Quyết định v1 | Cần xác nhận |
|---|---|---|---|
| R1 | Đọc trộm pick người khác qua API | Ẩn ở UI + tin tưởng nội bộ | OK với BTC? |
| R2 | "Vòng" của kèo tủ định nghĩa thế nào | 1 kèo/chặng (group, r32, r16, qf, sf, final) | Có muốn 1 kèo/ngày? |
| R3 | "Cú lội ngược dòng" cần lịch sử hạng | Cần snapshot ngày (cron) — v1 để placeholder/tính từ mốc BTC | Có làm cron snapshot? |
| R4 | Tên đội knock-out | Placeholder "Chờ xác định", BTC sửa sau vòng bảng | OK |
| R5 | Vua phá lưới nhập tự do dễ lệch chính tả | So khớp lower/trim; BTC chốt 1 chuỗi chuẩn | OK |
| R6 | Đội gây sốc do BTC định nghĩa chủ quan | BTC chốt cuối giải, truyền thông tiêu chí trước | OK |

---

## 12. Phụ lục — Bảng tham chiếu nhanh

**STAGE_MULTIPLIER**: `group:1, r32:1.5, r16:1.5, qf:2, sf:2, third:2, final:2`
**STAGE_LABEL (VI)**: `group:"Vòng bảng", r32:"Vòng 1/16", r16:"Vòng 1/8", qf:"Tứ kết", sf:"Bán kết", third:"Tranh hạng 3", final:"Chung kết"`
**Điểm**: exact=5, đúng-hiệu-số=3, đúng-kết-quả=2, sai=0 · streak +5/3 trận exact · champion +20 · top_scorer +10 · shock +10 · daily +2/câu

---

*Tài liệu v1.0 — nguồn thể thức & bốc thăm World Cup 2026 đối chiếu FIFA / ESPN / Wikipedia (bốc thăm 5/12/2025, khai mạc 11/6/2026, chung kết 19/7/2026 tại MetLife Stadium).*
