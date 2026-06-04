# CLAUDE.md — Mini-app Template

> File này được Claude (và dev) đọc khi vibe code mini-app trong repo clone từ template này.
> Đọc kỹ trước khi viết code. Đây là single source of truth cho mọi quy tắc kỹ thuật.

---

## ⛔ CRITICAL — Template là READ-ONLY cho mini-app dev

**Nếu bạn đang đọc file này trong 1 repo clone từ template** (tên kiểu `miniapp-{slug}` hoặc bất cứ repo nào KHÔNG phải `mushy/miniapp-template`):

- ❌ **TUYỆT ĐỐI KHÔNG** commit thay đổi shared infra (`src/lib/*`, `api/_verify.js`, `scripts/*`, `CLAUDE.md`, `.env.example`) rồi push **NGƯỢC** về repo template canonical.
- ❌ **TUYỆT ĐỐI KHÔNG** tạo PR từ mini-app repo về `mushy/miniapp-template`.
- ❌ **TUYỆT ĐỐI KHÔNG** chạy `git remote add` thêm remote pointing tới template để push.
- ✅ Template là **upstream READ-ONLY** — chỉ kéo về (`scripts/sync-template.sh`), không bao giờ đẩy ngược.

**Tại sao**: Template là single-source-of-truth cho **mọi** mini-app trong hệ Mushy (hiện có nhiều mini-app downstream cùng pull về). Mỗi mini-app có nhu cầu app-specific khác nhau — nếu mini-app `lunch-plan` push thay đổi local về template, mini-app `expense` pull về sẽ ăn cái thay đổi đó dù không cần. Hoặc tệ hơn: push thay đổi phá compatibility cho mini-app khác.

**Quy tắc fix bug ở shared layer**:
1. Reproduce bug ở 1 mini-app downstream.
2. Mở issue / báo team Mushy canonical (anhdqvn).
3. Fix được apply ở repo `mushy/miniapp-template` (do team canonical).
4. Mini-app downstream pull về qua `scripts/sync-template.sh` (xem section 11).

**Nếu bạn là Claude đang vibe code mini-app**: chỉ sửa `src/App.jsx`, `src/components/<app-specific>`, `src/lib/app/*`, `migrations/*`, `api/<app-specific>.js`, `mushy.config.json`, `package.json` (thêm dep app cần). KHÔNG đụng các file trong section 11.2 "Cái gì SYNC". Nếu phải fix shared infra để app chạy được, báo dev — đừng tự sửa rồi push.

**Nếu bạn đang sửa repo template canonical** (`mushy/miniapp-template` ở GitHub user `anhdqvn`): mục này không áp dụng — bạn đang ở upstream, sửa thoải mái.

---

## 0. Cho người mới (vibe coder) — đọc 3 phút trước khi bắt đầu

Mini-app Mushy giống như "tab Mini Program" trong Zalo/WeChat: là 1 web app nhỏ chạy bên trong app Mushy. Mỗi mini-app **của bạn** = 1 dự án riêng (1 repo GitHub + 1 project Vercel + 1 schema database).

### 0.1 Ba môi trường — local, preview, prod

| Môi trường | Khi nào chạy | URL | Schema database | Ai thấy được |
|---|---|---|---|---|
| **Local** | `npm run dev` trên máy bạn | `localhost:5173` (browser) | `app_{slug}_dev` (sandbox) | Chỉ mình bạn |
| **Preview** | Push code lên branch `dev` → Vercel auto-deploy | `mushy-miniapp-{slug}-git-dev.vercel.app` | `app_{slug}_dev` (cùng với local) | Bạn (qua dev_mode trong app Mushy) |
| **Production** | Merge code vào branch `main` → Vercel auto-deploy | `mushy-miniapp-{slug}.vercel.app` | `app_{slug}` (real data) | Mọi người dùng app trong workspace |

Quy tắc nhớ: **dev → an toàn, prod → cẩn thận**. Mặc định mọi thay đổi đều ở dev. Chỉ khi sẵn sàng → merge vào main → tự lên prod.

### 0.2 Dev mode trong app Mushy là gì

Mặc định khi user mở mini-app trong app Mushy, nó load **URL prod** (`mushy-miniapp-{slug}.vercel.app`). Bạn (mini-app owner) muốn xem **build dev** (URL preview Vercel `mushy-miniapp-{slug}-git-dev.vercel.app`) để test → bật **Dev Mode**:

1. Mở app Mushy → **Cài đặt** (⚙ góc phải trên home)
2. Tìm toggle "🛠️ Chế độ phát triển" → bật
3. Quay lại home → tap mini-app của mình → giờ load URL preview Vercel

Dev mode CHỈ ảnh hưởng mini-app **bạn own**. App của người khác vẫn load prod bình thường. Khi push noti từ mini-app trong dev mode → superapp tự chỉ gửi cho **bạn**, không spam team (xem 2.4).

### 0.3 Migration là gì + khi nào cần

Mini-app lưu data vào **database PostgreSQL** dùng chung với app Mushy. Mỗi mini-app có **schema riêng** (kiểu "namespace") tên là `app_{slug}` — vd mini-app slug `expense` → schema `app_expense`, có thể chứa tables `app_expense.transactions`, `app_expense.categories`, v.v.

**Migration** = file SQL thay đổi schema (tạo bảng, thêm cột, thêm RLS, v.v.). Bạn cần migration khi:
- Muốn lưu data vào database (lần đầu tạo mini-app → cần migration để tạo bảng)
- Thêm tính năng mới cần cột/bảng mới
- Sửa cấu trúc bảng (vd: rename cột, đổi kiểu data)

**KHÔNG cần migration** cho thay đổi UI thuần (App.jsx, CSS, components — chỉ là code, deploy Vercel là xong).

**Quy trình submit migration**:
1. Viết SQL trong file `migrations/00X_xxx.sql` (vd `migrations/002_add_categories.sql`)
2. Mở Admin Portal (https://admin.mini.mushy-app.com) → tab **Migrations**
3. Chọn mini-app của bạn → paste SQL → **Submit & AI Review**
4. AI review SQL (verify đúng convention) → nếu PASS → auto-apply cả prod + dev schema
5. Nếu REJECT → đọc lý do, sửa, submit lại

⚠️ **KHÔNG bao giờ apply SQL trực tiếp qua Supabase Dashboard SQL Editor.** Migration phải đi qua Admin Portal Reviewer (để verify + audit log + auto-duplicate sang dev schema).

Chi tiết quy tắc viết migration ở section 3 + 8.4.

### 0.4 Tóm tắt workflow vibe code

```
1. Clone template → đổi slug → npm install → npm run dev:setup
   (Mushy account + OTP → workspace picker → ghi .env)
2. Tạo workspace riêng của mình trong app Mushy (xem 8.1.4)
3. Register mini-app trong Admin Portal (Private mode) — xem 8.2
4. Code App.jsx, dùng db.from('table').select() — xem 3.4
5. Thêm bảng? Viết migration → submit Admin Portal — xem 0.3 + 8.4
6. Test local (browser) → push branch dev → preview Vercel + dev_mode
7. OK → merge dev → main → prod live
8. Sẵn sàng cho team khác? → đổi visibility Public — xem 8.6
```

Đọc 3 phút này rồi đọc tiếp section 1+ để hiểu chi tiết kỹ thuật.

---

## 1. Mini-app là gì trong hệ Mushy

Một **mini-app** = web app độc lập trong hệ Mushy Super App:

- **Frontend**: Vite + React, deploy trên Vercel (1 project per mini-app)
- **Backend**: `api/` thư mục → Vercel Serverless Functions
- **Database**: schema riêng `app_{slug}` trong Supabase chung của Mushy
- **Chạy 2 mode**: trong WebView của Shell (production native app) hoặc browser (dev, có bridge mock)

Đọc thêm `CLAUDE.md` ở repo gốc Mushy để hiểu triết lý + kiến trúc tổng thể.

### Config — `mushy.config.json` (committed)

File này ở root repo, **committed Git**. Chứa 3 thứ public (Supabase design intent — đã giải thích ở section 4):

```json
{
  "slug": "demo",
  "supabase": {
    "url": "https://....supabase.co",
    "anonKey": "eyJ..."
  }
}
```

Khi clone template tạo mini-app mới: chỉ cần đổi `slug` → xong. URL + anon key đã sẵn (platform admin pre-fill, không cần hỏi xin).

**Slug bất biến**: 3-41 ký tự `[a-z0-9_-]`. Cho phép cả dash + underscore.

Slug quyết định:
- **schema** `app_{slug_normalized}` + `app_{slug_normalized}_dev` — dash trong slug **normalize sang underscore** (Postgres unquoted identifier không nhận dash). Vd slug `lunch-plan` → schema `app_lunch_plan`.
- **bucket storage** `miniapp-{slug}` (giữ nguyên slug)
- **prod domain** `{slug}.mini.mushy-app.com` (giữ nguyên slug)

⚠️ **QUAN TRỌNG cho viết migration**: schema name luôn dùng **underscore version** kể cả slug có dash:
- slug = `lunch-plan` → migration ref: `create table app_lunch_plan.tasks (...)` (KHÔNG `app_lunch-plan.tasks`)
- slug = `lunch_plan` → migration ref: `create table app_lunch_plan.tasks (...)` (giống nhau)
- slug = `expense` → migration ref: `create table app_expense.tasks (...)` (giống nhau)

KHÔNG đổi slug sau khi đã có data.

**Vercel env vars** chỉ còn server-side + per-environment scope (xem section 8.2).

---

## 2. Môi trường dev / prod

### 2.1 Schema namespace
- `app_{slug}`     → production (deploy `main` → custom domain `{slug}.mini.mushy-app.com`)
- `app_{slug}_dev` → dev sandbox (deploy mọi branch khác main → `*.vercel.app`, và local `npm run dev`)

User auth + workspaces dùng chung 1 DB → đăng nhập 1 lần, real account ở mọi mode.

### 2.2 Schema selection — fully automatic
Mini-app tự chọn schema theo `process.env.VERCEL_ENV` (Vercel inject sẵn lúc build):
- `production` → schema prod
- `preview` → schema dev
- `development` (local) → schema dev (an toàn — không touch prod data)

**KHÔNG cần setup env var nào ở Vercel cho cái này.** Logic ở `vite.config.js` + `src/lib/supabase.js`.

⚠️ **Vercel Free plan**: custom domain CHỈ gắn vào production. Preview phải dùng `*.vercel.app`.

### 2.3 dev_mode (read-only context)
Mini-app đọc `ctx.userDevMode` + `ctx.isAppOwner` từ `getContext()`. Khi cả 2 = true, user đang xem preview build của app — có thể hiện badge `🛠 DEV` riêng nếu cần. Mặc định không bắt buộc làm gì.

### 2.4 Push noti khi dev_mode — auto chỉ gửi cho owner

Khi mini-app owner bật `dev_mode` ở Settings + đang test mini-app (qua preview build), **mọi remote push qua `mushyApi.push(...)` sẽ được superapp `mini-proxy` auto-filter chỉ gửi cho owner**, KHÔNG đẩy push cho members khác của workspace. Tránh noise (member thật bị spam noti từ build dev của owner).

- Enforce ở **superapp mini-proxy Edge Function** — mini-app frontend không thể bypass.
- Detect: caller có `user_profiles.dev_mode = true` AND `mini_apps.owner_id = caller.user_id` (lookup qua `data.appSlug`).
- Filter logic: `userIds` từ mini-app bị override → push chỉ tới `[caller.user_id]`.
- Local noti qua `callNative('PUSH_NOTIFICATION', ...)` (chỉ device user) KHÔNG bị filter — vốn đã chỉ tới device user rồi.

→ Mini-app **không cần** check `userDevMode` trước khi gọi `mushyApi.push(...)`. Cứ gọi bình thường, superapp lo filtering.

---

## 3. Quy tắc Database (BẮT BUỘC)

### 3.1 Schema rule
- **Schema duy nhất**: `app_{slug}`. KHÔNG bao giờ tạo table trong `public`/`auth`/`storage`
- **KHÔNG viết tay** `app_{slug}_dev` trong migration file. Migration Reviewer auto duplicate cả 2 schema (atomic apply).
- File migration trong `migrations/00X_xxx.sql` chỉ viết `app_{slug}.tablename` — Reviewer regex-replace whole-word khi apply lần 2 cho dev schema.
- **KHÔNG viết SQL nào touch schema `storage`** (bucket, objects, policies). Reviewer chặn hết. Bucket + RLS auto-tạo bởi Admin Portal khi register app — giống Cloudflare DNS auto-create.

### 3.2 Mọi table phải có

**RLS pattern hỗ trợ cross-workspace sharing** (superapp mig 049 — xem section 3.6):
```sql
create table if not exists app_{slug}.tablename (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

create index if not exists idx_tablename_workspace on app_{slug}.tablename (workspace_id);

grant select, insert, update, delete on app_{slug}.tablename to authenticated;

alter table app_{slug}.tablename enable row level security;

-- 4 policies tách biệt — KHÔNG dùng `for all` (vì DELETE cần restrict hơn).
-- `{slug}` LITERAL trong policy — KHÔNG dùng biến (helper cần biết app slug).
drop policy if exists "tablename_select" on app_{slug}.tablename;
create policy "tablename_select" on app_{slug}.tablename
for select using (
  public.can_access_app_data(workspace_id, '{slug}')
);

drop policy if exists "tablename_insert" on app_{slug}.tablename;
create policy "tablename_insert" on app_{slug}.tablename
for insert with check (
  public.can_access_app_data(workspace_id, '{slug}')
);

drop policy if exists "tablename_update" on app_{slug}.tablename;
create policy "tablename_update" on app_{slug}.tablename
for update using (
  public.can_access_app_data(workspace_id, '{slug}')
) with check (
  public.can_access_app_data(workspace_id, '{slug}')
);

-- DELETE: chỉ member TRỰC TIẾP của ws owner. Follower share KHÔNG delete được.
drop policy if exists "tablename_delete" on app_{slug}.tablename;
create policy "tablename_delete" on app_{slug}.tablename
for delete using (
  public.is_owner_workspace_member(workspace_id)
);
```

Helpers fallback đúng khi app KHÔNG có share grant nào: chỉ member của workspace_id thấy/sửa được — giống pattern cũ `workspace_isolation`. Mặc định KHÔNG ai bị share gì cho tới khi owner gen mã + follower redeem (xem 3.6).

⚠️ **Hardcode app slug trong policy** (`'{slug}'` literal). Helper `can_access_app_data` cần biết app để filter grants đúng — không có cách inject biến runtime ở DB level. Nếu slug đổi (không nên — xem section 1) → phải update mọi policy.

### 3.3 Kiểu dữ liệu
- **Tiền**: `bigint` (đơn vị nhỏ nhất, vd VND × 1)
- **ID**: `uuid` (gen_random_uuid())
- **Thời gian**: `timestamptz`, default `now()`
- **File**: lưu `object_key text`, **KHÔNG** lưu URL (URL có expiry)
- **Currency, locale, status**: `text` + check constraint cho enum

### 3.4 Workspace scoping (đặc biệt quan trọng)

⚠️ **Mọi query PHẢI có `.eq('workspace_id', activeScope.workspaceId)`**. RLS chỉ chặn cross-user, KHÔNG chặn cross-workspace của cùng user (qua direct membership lẫn share grant). User là member của nhiều workspace → RLS cho thấy hết → query phải scope tay.

```js
import { useActiveScope } from './lib/sharing.js';

function MyComponent() {
  const scope = useActiveScope();   // { workspaceId, scopeKind, label }

  // ✅ Đúng — dùng active scope (default = ctx.workspaceId; nếu user switch
  //    qua scope follower thì là workspace_id của ws owner đang được share)
  const { data } = await db.from('notes').select('*')
    .eq('workspace_id', scope.workspaceId);

  // ❌ Sai — sẽ thấy notes ở workspace khác user cũng là member/follower
  const { data } = await db.from('notes').select('*');

  // ✅ Insert: gán workspace_id từ active scope
  await db.from('notes').insert({ ...payload, workspace_id: scope.workspaceId });
}
```

Áp dụng cho `select`, `update`, `delete`. `insert` thì set `workspace_id` trong row.

**Nếu mini-app KHÔNG opt-in sharing**: `scope.workspaceId` luôn = `ctx.workspaceId`. Vẫn nên dùng `useActiveScope()` thay vì `ctx.workspaceId` trực tiếp — để khi opt-in sharing sau này không phải refactor.

Xem `migrations/001_init_example.sql` làm template chi tiết.

### 3.5 Cross-workspace sharing — pattern share data sang ws khác

**Vấn đề**: 2 team Mushy muốn cộng tác trên data của 1 mini-app (vd: cùng 1 KB chiến lược, cùng 1 sổ chi tiêu...). Mặc định mỗi ws data riêng — không thấy nhau.

**Giải pháp** (superapp mig 049): owner workspace A gen mã 6 ký tự → ws B/C/D redeem → row được tạo trong `public.app_share_grants`. Sau đó:
- Member của B/C/D đọc + insert + update **trực tiếp** vào data của A (row có `workspace_id = A.id`). KHÔNG copy, KHÔNG mirror — 1 dataset thật.
- Chỉ owner/admin của A gen mã được. Chỉ owner/admin của B redeem được.
- Re-share KHÔNG cho phép (B không grant tiếp cho D). Chỉ A grant.
- Follower KHÔNG delete row của A (RLS `for delete` chỉ cho member trực tiếp).
- Unpair = xoá grant → follower mất access tức thì. Data ở yên A.
- Push noti từ scope shared → tự gửi cho members(A) ∪ members(B, C, D) (mini-proxy mở rộng tự động).

**UI** (header):
```jsx
import ScopeSwitcher from './components/ScopeSwitcher.jsx';

<header>
  <ScopeSwitcher onManageGrants={() => setShowGrantsModal(true)} />
</header>
```
Dropdown liệt kê:
- Mọi ws user là member → "🏠 [WS name] · Workspace của bạn"
- Mọi ws có grant tới 1 ws của user → "⇆ [Owner WS name] · Chia sẻ qua [Follower WS name]"

User chọn → mọi query dùng `useActiveScope().workspaceId` tự động (xem 3.4).

**Lib API** (`src/lib/sharing.js`):
```js
import {
  generateShareCode, redeemShareCode, listShareGrants, revokeShareGrant,
  listAccessibleScopes, useActiveScope, useAccessibleScopes
} from './lib/sharing.js';

// Owner side — settings modal "Share data" button
const { code, expiresAt } = await generateShareCode({ expiresHours: 24 });
// Hiện code cho user copy/share qua chat

// Follower side — settings modal "Redeem code" input
const grant = await redeemShareCode({ code: 'ABCD23' });

// List grants liên quan (cả 2 phía) — settings modal
const grants = await listShareGrants();
// [{ grantId, direction: 'as_owner'|'as_follower', ownerWorkspaceName, followerWorkspaceName, ... }]

// Revoke 1 grant
await revokeShareGrant(grantId);
```

**KHÔNG cần migration mini-app riêng cho feature này** — superapp mig 049 đã expose RPC + helpers ở `public.*`. Mini-app chỉ cần:
1. RLS policy dùng `public.can_access_app_data(workspace_id, '{slug}')` (xem 3.2)
2. Render `<ScopeSwitcher />` ở header
3. Dùng `useActiveScope().workspaceId` thay `ctx.workspaceId` trong mọi query (xem 3.4)

### 3.6 Realtime — opt-in cho table cần stream changes

### 3.5 Realtime — opt-in cho table cần stream changes

Mặc định table KHÔNG emit realtime event. Để mini-app subscribe được, **đánh dấu bằng comment `-- @realtime` trên dòng riêng ngay TRƯỚC `create table`**:

```sql
-- @realtime
create table if not exists app_{slug}.tablename (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  ...
);
```

Migration Reviewer (Admin Portal) tự phát hiện marker và **auto-append vào CUỐI SQL** (idempotent, cho cả prod + dev schema):

```sql
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='app_{slug}' and tablename='tablename') then
    alter publication supabase_realtime add table app_{slug}.tablename;
  end if;
end $$;
alter table app_{slug}.tablename replica identity full;
```

**Tại sao cần 2 DDL này** (đừng tự viết tay, để Reviewer append):

1. **`alter publication supabase_realtime add table ...`** — Postgres logical replication chỉ emit WAL event cho tables nằm trong publication `supabase_realtime`. Không add → subscribe nhận 0 event (silent, không error → debug rất khó).

2. **`replica identity full`** — mặc định DELETE/UPDATE chỉ emit primary key. Mini-app subscribe với filter `workspace_id=eq.X` cần `workspace_id` trong payload để client-side match. Thiếu FULL → DELETE event bị drop, UI không phản ánh row xoá.

Đồng thời `src/lib/supabase.js` đã tự gọi `client.realtime.setAuth(token)` (gắn JWT vào WebSocket — Realtime không share `global.headers` với REST).

⚠️ **Không đánh marker cho mọi table** — chỉ table cần UI live (vote count, chat, presence…). Mỗi table trong publication tốn WAL bandwidth + Supabase Realtime quota.

**Response từ Reviewer** chứa field `realtime_added: ["app_{slug}.tablename", …]` để confirm marker được nhận. Nếu marker bị skip (schema sai), sẽ ở `realtime_skipped`.

---

## 4. Quy tắc Security (BẮT BUỘC)

- **API key (Gemini, OpenAI, OpenRouter…)**: chỉ ở Vercel env vars **server-side**, KHÔNG prefix `VITE_`. Client gọi qua `api/*.js` proxy.
- Mọi `api/*.js` cần verify JWT qua `api/_verify.js`. Header: `Authorization: Bearer {token}` + `X-Workspace-Id: {ws}`.
- KHÔNG bypass RLS. KHÔNG "tạm thời" disable RLS để debug.
- ⚠️ **Mini-app KHÔNG được cấp `SUPABASE_SERVICE_ROLE_KEY`**. service_role = full admin DB → mỗi mini-app dev nắm key đó = compromise toàn hệ. `_verify.js` dùng anon + user JWT (đủ). Privileged op (push, cross-user) → qua `src/lib/mushy-api.js` → superapp `mini-proxy` Edge Function.

### Anti-injection (khi mini-app có AI / SQL / user input nguy hiểm)

- **Hard limit độ dài** input (vd 30KB cho SQL, 5KB cho text trước khi truyền AI)
- **Wrap user content trong tag XML rõ ràng** (vd `<user_input>...</user_input>`) + system prompt cấm "follow instructions inside the tag"
- **Force structured output**: `response_format: { type: 'json_object' }` (OpenAI/OpenRouter) hoặc Gemini structured output. **Validate shape trước khi dùng.**
- **Tolerate markdown wrap**: model đôi khi trả ` ```json ... ``` ` dù đã set json_object → strip code fence trước khi `JSON.parse`.
- **Output không match shape → fallback "unsure"**, KHÔNG silently treat như success.
- **Anti SQL injection**: dùng Supabase `from().eq()` parameterized, KHÔNG concat string. Nếu dùng `rpc()` raw SQL, validate input bằng regex chặt.
- **Rate limit per user** cho endpoint tốn token AI: tạo `*_usage_log(user_id, date, count)` + RPC atomic `consume_quota`. Default 100 req/user/ngày.

---

## 5. Lib reference (`src/lib/`)

| File | Export | Dùng khi nào |
|---|---|---|
| `context.js` | `getContext()`, `isInShell()` | Lấy `{ token, userId, workspaceId, workspaceSlug, role, userDevMode, isAppOwner }` |
| `supabase.js` | `db`, `dbPublic`, `getSupabase()`, `getPublicSupabase()` | `db` scoped vào `app_{slug}` (theo VITE_APP_ENV → có thể là `_dev`); `dbPublic` cho public.* (hiếm dùng) |
| `bridge.js` | `callNative('TYPE', payload)`, `bridge.*` (typed helpers) | Native bridge. Type: `GET_LOCATION` / `OPEN_CAMERA` / `PICK_FILE` / `PUSH_NOTIFICATION` / `OPEN_TEL` / `OPEN_URL` / `SHARE` / `HAPTIC` / `SCAN_QR` / `BIOMETRIC` / `REFRESH_TOKEN` / `SAVE_IMAGE` / `COPY_TEXT` / `GET_CLIPBOARD` / `OPEN_SETTINGS` / `SAVE_CONTACT` / `PICK_CONTACT` / `ADD_CALENDAR_EVENT`. Helpers ưu tiên (`bridge.tel`, `bridge.share`, `bridge.haptic`, `bridge.scanQr`, `bridge.biometric`, `bridge.saveImage`, `bridge.copyText`, `bridge.getClipboard`, `bridge.openSettings`, `bridge.saveContact`, `bridge.pickContact`, `bridge.addCalendarEvent`) — auto-fallback browser khi DEV. Mock tự bật khi không có Shell. Generic non-http scheme (zalo://, whatsapp://, maps://...) tự được Shell route ra Linking — `<a href="...">` cũng work. |
| `storage.js` | `upload(file, folder)`, `getViewUrl(objectKey)` | Bucket `miniapp-{slug}` **auto-tạo bởi Admin Portal khi register app** (giống DNS). Mini-app dev KHÔNG viết storage SQL. Path: `{ws_id}/[dev/]{folder}/{uuid}.{ext}` (dev có prefix `dev/` để dễ wipe). Lưu `object_key` vào DB. R2 opt-in qua `VITE_USE_R2=true`. |
| `realtime.js` | `subscribeToTable(table, workspaceId, cb)`, `subscribeBroadcast()` | Trả unsubscribe — gọi khi unmount! |
| `queue.js` | `enqueue(jobType, payload)`, `onJob(jobId, cb)` | Tác vụ nặng async qua `public.job_queue` |
| `mushy-api.js` | `mushyApi.push({...})` | Gateway sang superapp `mini-proxy` cho privileged op (push noti remote). User JWT auth — không cần service_role. Push tự mở rộng recipients sang follower ws nếu có grant (superapp mig 049). |
| `members.js` | `listMembers(workspaceId)`, `getProfiles(userIds)` | Batch lookup workspace members + full_name/avatar_url qua `dbPublic`. RLS workspace-mate đã mở (superapp mig 004). KHÔNG dùng hash-color fallback nữa. |
| `sharing.js` | `generateShareCode()`, `redeemShareCode()`, `listShareGrants()`, `revokeShareGrant()`, `listAccessibleScopes()`, `useActiveScope()`, `useAccessibleScopes()`, `getActiveScope()`, `setActiveScope()`, `resetActiveScope()` | Cross-workspace data sharing (superapp mig 049). `useActiveScope()` trả ws đang thao tác (default ctx.workspaceId; đổi qua `<ScopeSwitcher />`). Dùng `scope.workspaceId` cho mọi query thay `ctx.workspaceId`. Xem section 3.5. |
| `analytics.js` | `track(event, props)`, `trackScreen(name, props)`, `initAnalytics()`, `refreshIdentity()`, `resetAnalytics()` | PostHog wrapper. Auto-init từ `main.jsx`, auto-identify userId, auto-group workspace, auto-gắn `app_slug`/`workspace_id`/`role` vào mọi event. DEV mode tự skip (set `VITE_POSTHOG_DEBUG=1` nếu cần test local). Xem section 12 — event taxonomy chuẩn. |
| `theme.js` | `colors`, `radii`, `fonts`, `space`, `fontSize` | Inline style nếu cần |

**Component sẵn có** (`src/components/`):
- `Dialog.jsx` — `DialogProvider` + `useDialog()`. Wrap App với `<DialogProvider>` (đã có trong `main.jsx`).
- `Select.jsx` — custom dropdown thay native `<select>` (KHÔNG được dùng `<select>` HTML — break design system). API: `<Select value onChange options={[{value, label, icon?}]} placeholder />`. Click ngoài + Esc đóng, keyboard nav (Up/Down/Enter).
- `ScopeSwitcher.jsx` — header dropdown chọn ws đang thao tác (cross-ws sharing). API: `<ScopeSwitcher onManageGrants={() => ...} />`. Auto-collapse thành label chỉ-đọc nếu chỉ có 1 scope (user chưa share gì). Xem section 3.5.

### Dialog API (THAY native alert/confirm)

```js
const dialog = useDialog();

await dialog.info('Title', 'Body');
await dialog.success('Đã lưu', 'OK');
await dialog.error('Lỗi', err.message);

const ok = await dialog.confirm(
  'Xoá file?', 'Không thể hoàn tác.',
  { danger: true, confirmLabel: 'Xoá', cancelLabel: 'Huỷ' }
);
if (!ok) return;
```

Esc = cancel, Enter = confirm. CSS có sẵn trong `theme.css`.

---

## 6. Design system (synced với superapp v3.0, 2026-05-31)

`src/lib/theme.css` auto-import qua `main.jsx`. Mọi mini-app có sẵn brand Mushy.

**Backward compat**: legacy tokens (pill button 999, `--muted #6B6770`, `.mushy-card` clay shadow) KHÔNG xoá. Mini-app cũ vẫn chạy. Mini-app mới nên opt-in v3 token để consistent với superapp shell v3.0.

### Tokens (CSS variables)

**Brand + surface (đồng nhất)**:
- `--brand` `#E63946`, `--brand-pressed` `#C92A39`, `--brand-soft` `#FFE4E7`
- `--brand-wash` `rgba(230,57,70,0.07)` — v3 (app icon container bg)
- `--bg` `#FFF7F8`, `--surface` `#FFFFFF`, `--surface-muted` `#FBEEF0`

**Text**:
- `--ink` `#0F0F12` (heading), `--text` `#1A1A1F` (body)
- `--fg-secondary` `#3C3C43` — v3 (subtitle/label)
- `--muted` `#6B6770` (legacy) / `--muted-v3` `#8E8E93` (iOS palette)
- `--hairline` `rgba(15,15,18,0.08)` / `--hairline-strong` `rgba(15,15,18,0.10)` — v3

**Radii** — opt-in v3 suffix:
- Legacy: `--r-card` 20px, `--r-button` 999px (pill), `--r-input` 999px (pill)
- V3: `--r-card-v3` 16px, `--r-button-v3` 14px (rounded rect), `--r-input-v3` 12px, `--r-hero` 20px, `--r-app-icon` 14px, `--r-modal` 24px

**Fonts**:
- `--font-body` `'Be Vietnam Pro'` (giữ nguyên — body, label, paragraph)
- `--font-display` `'Plus Jakarta Sans'` — V3 MỚI (heading lớn, hero, stat numbers, section label uppercase)
- Index.html đã preload cả 2 từ Google Fonts.

**Status (iOS palette v3)**:
- Legacy `--success` #10B981, `--warn` #F59E0B, `--danger` = brand red
- V3 `--success-v3` #34C759, `--warn-v3` #FF9500, `--danger-v3` #FF3B30 (khác brand — error toast), `--info-v3` #007AFF

**Type scale + space scale (v3)**:
- `--fs-xs..xxl` + matching `--lh-*` (11→32 size, 14→38 line-height)
- `--space-1..9` (4 → 56)

### Utility classes

**Legacy (giữ nguyên)**:
- Layout: `.mushy-page` (max 720px center)
- Card: `.mushy-card` (clay rounded + shadow + highlight top)
- Section: `.mushy-section-title`, `.mushy-section-sub`
- Button: `.mushy-btn` + variant `--primary` / `--ghost` / `--dashed` / `--danger`. `--block` = full width.
- Input: `.mushy-input` + `.mushy-label` (pill). `--error` cho error state. textarea auto bo `16px`.
- Status pill: `.mushy-status` + `--ok` / `--warn` / `--err`
- Code/Spinner/Modal-Dialog: như cũ

**V3 mới (opt-in)**:
- `.mushy-card--v3` — card cleaner shadow, border-1px hairline, KHÔNG inset highlight
- `.mushy-btn--v3` — rounded rect r14 (kết hợp `--primary` để filled)
- `.mushy-input--v3` — input rounded r12
- `.mushy-hero` + `.mushy-hero-eyebrow` + `.mushy-hero-title` + `.mushy-hero-sub` — gradient red hero banner (eyebrow uppercase + title display + sub max 2 lines)
- `.mushy-app-icon` — 58×58 r14 brandWash bg + border red, render Ionicons web component (`<ion-icon>`) bên trong
- `.mushy-section-label` — uppercase 11/700 letterSpacing 0.8 padding 20/16/8/16 (khoảng trên/2 bên/dưới/2 bên), `numberOfLines={1}`
- `.mushy-info-row` + `.mushy-info-icon` + `.mushy-info-body` + `.mushy-info-label` + `.mushy-info-value` — info row pattern (icon container brandWash + label/value middle)
- `.mushy-display` — helper class apply font display + weight 800 + letterSpacing -0.6

### JS tokens

```js
import { colors, radii, fonts, shadow, typeScale, space } from './lib/theme.js';
// V3 tokens: colors.brandWash, colors.fgSecondary, colors.dangerV3,
//            radii.cardV3, radii.buttonV3, fonts.display, typeScale.lg
```

**Override tự do**: đè class CSS riêng hoặc thay tokens trong `:root` của `App.css`. Mục tiêu là consistent với superapp shell v3.0, không ép. Mini-app mới khuyến nghị dùng v3 tokens; mini-app cũ migrate khi rảnh.

---

## 7. Layout repo

```
miniapp-{slug}/
├── CLAUDE.md                 ← file này
├── README.md
├── .env.example              ← copy sang .env, điền giá trị
├── package.json
├── vite.config.js
├── vercel.json               ← Vercel config (nếu cần rewrites)
├── index.html
├── src/
│   ├── main.jsx              ← import theme.css + DialogProvider + App
│   ├── App.jsx               ← UI mini-app (sửa khi build)
│   ├── App.css               ← style app-specific
│   ├── components/
│   │   ├── Dialog.jsx        ← DialogProvider + useDialog
│   │   ├── Select.jsx        ← custom dropdown thay native <select>
│   │   └── ScopeSwitcher.jsx ← header dropdown chọn workspace đang thao tác
│   └── lib/                  ← shared infra (đừng sửa, sync với template)
│       ├── theme.css
│       ├── theme.js
│       ├── context.js
│       ├── bridge.js
│       ├── supabase.js
│       ├── storage.js
│       ├── realtime.js
│       ├── queue.js
│       ├── mushy-api.js      ← gateway sang superapp mini-proxy (push, …)
│       ├── members.js        ← batch lookup workspace members + profiles
│       ├── sharing.js        ← cross-workspace data sharing + active scope
│       └── analytics.js      ← PostHog wrapper (auto-init từ main.jsx)
├── api/                      ← Vercel Serverless Functions
│   ├── _verify.js            ← verify JWT, KHÔNG expose endpoint
│   └── ai-proxy.js           ← ví dụ: proxy AI request server-side
├── migrations/
│   └── 001_init_example.sql  ← template migration đúng convention
├── scripts/
│   ├── setup.js              ← npm run dev:setup
│   ├── seed.js               ← npm run dev:seed
│   └── refresh-token.js      ← npm run dev:token
└── public/                   ← static assets
```

---

## 8. Workflow

### 8.1 Setup lần đầu (local dev)

```bash
# 1. Clone template
git clone <template-repo-url> miniapp-{slug}
cd miniapp-{slug}

# 2. Đổi slug trong mushy.config.json
#    Mở file → "slug": "REPLACE_WITH_YOUR_SLUG" → "slug": "expense" (vd)
#    Slug được Mushy admin cấp khi đăng ký mini-app (3-41 chars [a-z0-9-]).
#    URL + anon key đã pre-fill, KHÔNG cần đổi.

# 3. Install + dev setup
cp .env.example .env    # giữ placeholder VITE_DEV_*, chưa cần điền
npm install
npm run dev:setup       # ↓ giải thích chi tiết bên dưới
npm run dev             # localhost:5173 (browser, có bridge mock)
```

### 8.1.1 `npm run dev:setup` — flow auto-config local DEV

Script tự động:
1. **Hỏi email** Mushy → server gửi OTP 6 chữ số qua mail
2. **Nhập OTP** từ mail → verify → lấy JWT access token (1h expiry)
3. **List workspace** bạn là member → bạn chọn 1
4. **Auto ghi 4 biến** vào `.env`:
   - `VITE_DEV_TOKEN` — JWT access token (mock cho `getContext()`)
   - `VITE_DEV_WORKSPACE_ID` — workspace_id đã chọn
   - `VITE_DEV_USER_ID` — auth.users.id của bạn
   - `VITE_DEV_ROLE` — role của bạn trong workspace đó (owner/admin/member)

Khi `npm run dev`, mini-app browser localhost gọi `getContext()` → fallback đọc `VITE_DEV_*` từ `.env` (không có Shell inject ở browser) → có đủ context giống chạy trong superapp.

### 8.1.2 Token hết hạn sau 1 giờ

JWT expire 1h → mọi query Supabase trả 401. Refresh:
```bash
npm run dev:token       # login lại + update VITE_DEV_TOKEN
```
Workspace/user/role không đổi nên chỉ cần refresh token.

### 8.1.3 Không có account?
Cài app **Mushy** (search "Mushy" trên store cũng ra):
- **Android**: [Play Store](https://play.google.com/store/apps/details?id=com.mushyapp.shell)
- **iOS**: [App Store](https://apps.apple.com/vn/app/id6768073102)

Mở app → **Đăng ký** (email → OTP qua mail). Mushy đã bỏ password (2026-05-12) — chỉ cần email cá nhân, login mọi nơi bằng OTP.

### 8.1.4 ⚠️ BẮT BUỘC tự tạo 1 workspace của riêng mình TRƯỚC khi register mini-app

Sau khi đăng ký account Mushy (8.1.3) hoặc login bằng account có sẵn:

1. Mở app Mushy → màn "Workspaces của bạn" → cuộn xuống cuối → tap **+ Tạo Workspace mới**
2. Đặt tên (vd "Tech Team Dev") + slug + mô tả → Tạo → tự động là **owner**
3. Workspace này = sandbox riêng để dev + test mini-app, KHÔNG đụng workspace company/team thật

**Tại sao bắt buộc**: RLS `mini_apps_owner_insert` (miniapp-admin migration) yêu cầu caller phải là **owner của ít nhất 1 workspace** mới được tạo mini-app catalog row. Nếu account chỉ join workspace của người khác (role `member` hoặc `admin` qua invite), Admin Portal sẽ reject với lỗi:

> `new row violates row-level security policy for table "mini_apps"`

→ Tự tạo workspace = tự động owner = pass RLS.

**Khi mini-app sẵn sàng cho team khác dùng**:
- Visibility default = **Private** (chỉ owner thấy ở Mushy app, chỉ owner enable cho ws của chính mình)
- Test xong → Admin Portal → app edit → đổi visibility = **Public** → mọi workspace thấy + owner của ws khác có thể enable cho team họ
- Chi tiết lifecycle ở 8.6.

### 8.2 Đăng ký mini-app vào catalog Mushy (1 lần per app)

1. Push lần đầu lên GitHub: tạo repo `mushy-miniapp-{slug}`, push **CẢ HAI** branch `main` + `dev`.

   ⚠️ **Bước này không được skip.** Vercel tự gán branch duy nhất trong repo thành Production Branch. Nếu chỉ push `dev` trước khi connect Vercel:
   - Vercel coi `dev` là production → build với `VERCEL_ENV=production`
   - Mini-app query schema `app_{slug}` (PROD) thay vì `app_{slug}_dev`
   - Mushy dev_mode load preview URL → schema PROD → seed data dev không hiện → app trống trơn
   - User không hiểu vì sao "đang bật dev_mode mà sao schema prod" — vì Mushy `dev_mode` và Vercel `VERCEL_ENV` là 2 khái niệm độc lập

   Nếu chưa muốn ship prod thật: tạo `main` với placeholder HTML "🚧 Đang phát triển". `npm run dev:setup` auto-detect khi thiếu `main` và offer tạo placeholder + push lên origin (dùng orphan branch — KHÔNG inherit commits của `dev`, main hoàn toàn rỗng + 1 file placeholder).

2. Connect Vercel (tài khoản của bạn) → import GitHub repo → **đổi project name = `mushy-miniapp-{slug}`** ở Vercel UI. Vercel auto-build:
   - Branch `main` → `https://mushy-miniapp-{slug}.vercel.app` (production)
   - Branch `dev` → `https://mushy-miniapp-{slug}-git-dev.vercel.app` (preview, branch alias)

   Project name chuẩn = URL predict được, dễ paste vào Admin Portal.
3. Set Vercel env vars (chỉ server-side, KHÔNG `VITE_` prefix) — **cả 2 scope** Production + Preview:
   - AI provider keys nếu mini-app dùng (`GEMINI_API_KEY`, `OPENAI_API_KEY`, vv)

   ⚠️ **KHÔNG set `SUPABASE_URL` hay `SUPABASE_SERVICE_ROLE_KEY`** — URL + anon key đọc từ `mushy.config.json` (committed). `_verify.js` dùng anon + user JWT, đủ verify membership. Privileged op (push, cross-user) qua `mushyApi` → superapp `mini-proxy`. Mini-app dev **không bao giờ** được cấp service_role.

   Schema dev/prod tự switch theo `VERCEL_ENV` Vercel inject sẵn — không cần env var nào ở client.

4. **Vercel Settings → Deployment Protection** (BẮT BUỘC):
   - **Vercel Authentication**: đổi sang **Disabled** → Save.
   - Lý do: mặc định Vercel chặn preview deployment bằng SSO. Superapp WebView không có session Vercel → 401, dev_mode vô dụng. Mushy = internal team, RLS Supabase đã bảo vệ data → không cần SSO layer này.

5. **2 stable URLs Vercel** (auto, không cần Cloudflare custom domain):

   | Branch | URL stable | Vai trò trong Mushy |
   |---|---|---|
   | `main` | `mushy-miniapp-{slug}.vercel.app` | Production — paste vào `url` ở Admin Portal |
   | `dev`  | `mushy-miniapp-{slug}-git-dev.vercel.app` | Preview (dev_mode) — paste vào `preview_url` ở Admin Portal |

   Vercel auto-tạo 2 URL khi push lên 2 branch tương ứng. **Stable per branch** (không phải per-commit). Mỗi push lên branch tương ứng → cùng URL update sang deploy mới.

   **KHÔNG paste** per-deployment URL random kiểu `mushy-miniapp-{slug}-abc123.vercel.app` — đổi theo commit, không stable.

   ℹ️ Optional: nếu muốn URL branded `{slug}.mini.mushy-app.com`, nhờ anhdqvn manual add Cloudflare CNAME + Vercel custom domain. Default flow KHÔNG yêu cầu — `*.vercel.app` đủ dùng cho mọi mini-app (WebView không show URL bar, user không thấy).

6. Mở Admin Portal (https://admin.mini.mushy-app.com) → login → catalog → **+ Đăng ký app mới**:
   - Slug: `{slug}` (uniqueness check live)
   - Tên + mô tả
   - **Icon**: bấm nút "Chọn icon" → picker hiện 1357 Ionicons (Outline / Sharp / Filled), gõ tìm kiếm theo tên (vd `restaurant`, `calendar`, `cash`). Design v3.0 dùng **Outline**. DB lưu format `ion:<name>` (vd `ion:restaurant-outline`). Bỏ trống → shell fallback theo slug map. Cũng accept URL nếu paste vào DB tay (logo riêng PNG/SVG).
   - **Production URL**: paste `https://mushy-miniapp-{slug}.vercel.app`
   - **Preview URL**: paste `https://mushy-miniapp-{slug}-git-dev.vercel.app`
   - Visibility: **Private** (default — chỉ owner thấy) hoặc **Public** (mọi ws thấy + ws owner enable)

7. Submit → admin portal auto-provision **bucket storage** (`miniapp-{slug}`) + **2 schemas DB** (`app_{slug}`, `app_{slug}_dev`) + **expose Data API**.

   KHÔNG còn auto-tạo Cloudflare CNAME (chuyển sang manual nếu cần branded domain). Custom domain `*.mini.mushy-app.com` không bắt buộc.

ℹ️ **Sau khi đổi Vercel setting** (Auth, env): Vercel Edge cache + Expo Go WebView cache có thể giữ response cũ vài phút. Nếu trong Expo Go thấy 403/401 mặc dù đã sửa: curl URL trên máy local trước (xác nhận Vercel trả 200), rồi **swipe Expo Go khỏi recent apps** + mở lại. Đừng vội nghi ngờ logic.

### 8.3 Quy ước branch + git flow

- `main` = production (canonical, stable). Push lên main → Vercel deploy `mushy-miniapp-{slug}.vercel.app`.
- `dev` = development/preview. Push lên dev → Vercel deploy `mushy-miniapp-{slug}-git-dev.vercel.app`.
- Standard Git flow: code daily trên `dev` → PR/merge `dev → main` để ship prod.

Cả 2 URL `mushy-miniapp-{slug}.vercel.app` + `mushy-miniapp-{slug}-git-dev.vercel.app` được Vercel auto-cấp, không cần Cloudflare/DNS setup.

### 8.4 Submit migration mới

⚠️ **KHÔNG apply migration trực tiếp qua Supabase SQL Editor**. Luôn đi qua Admin Portal Migration Reviewer:

1. Viết SQL trong `migrations/00X_xxx.sql` (chỉ ref `app_{slug}`, KHÔNG viết tay `_dev`)
2. Mở Admin Portal → tab **Migrations** → chọn mini-app của bạn
3. Nhập version (vd `002_add_notes`) + paste SQL
4. **Submit & AI Review** — verdict:
   - **PASS** → auto-apply atomic cho cả `app_{slug}` + `app_{slug}_dev`
   - **REJECT** → đọc reasons, sửa SQL, submit lại (cùng version OK — Reviewer cho re-submit)
   - **UNSURE** → audit log, không apply; sửa + submit lại
5. Quota: 100 review/user/ngày
6. Audit log lưu trong `public.schema_migrations` (owner workspace đọc được)

⚠️ **SQL phải idempotent** — dùng `create table if not exists`, `drop policy if exists`, `create or replace function` … Reviewer cho re-submit cùng version sau fix → migration phải chạy lại an toàn.

ℹ️ **Schema `app_{slug}` + `app_{slug}_dev` được Admin Portal auto-tạo + auto-expose** ngay khi đăng ký mini-app (giống Cloudflare DNS, Storage bucket). Migration đầu tiên chỉ cần tables/RLS/triggers — KHÔNG cần `create schema` hay GRANT/default privileges.

### 8.5 Hàng ngày
- JWT hết hạn sau 1 giờ → `npm run dev:token` để refresh
- Test trong browser (mock) trước, sau đó qua Vercel preview + Expo Go (Shell thật)
- Sửa schema → submit migration qua Reviewer (8.4)

### 8.6 Visibility lifecycle — workflow chuẩn từ dev → ship

```
[Tạo workspace dev của mình (8.1.4)]
            ↓
[Register app — visibility=Private (default)]
            ↓
[Enable app cho dev workspace của mình (Admin Portal)]
            ↓
[Code, test, fix bug trong dev workspace — không ai khác thấy app]
            ↓
[Sẵn sàng public] → Admin Portal → Sửa app → visibility = Public
            ↓
[Mọi workspace owner trong Mushy thấy app trong catalog]
            ↓
[Owner workspace khác tự enable app cho team họ]
```

- **Private** (default): chỉ owner của mini-app thấy app + chỉ enable được cho workspace họ là owner. Dùng cho dev/test giai đoạn đầu — không noise team khác.
- **Public**: mọi ws owner thấy + có thể enable cho ws của họ. Dùng khi app stable, sẵn sàng cho người khác xài.
- KHÔNG có "Tắt globally" — nếu cần thu hồi: chuyển về Private + disable per-workspace, hoặc set status='disabled' qua SQL Editor (rare).

---

## 9. Anti-patterns (KHÔNG làm)

### Database / Backend
- ❌ Tạo table trong schema `public`/`auth`/`storage`
- ❌ Viết tay `app_{slug}_dev` trong migration (Reviewer tự duplicate)
- ❌ Viết SQL touching `storage.*` (bucket auto-managed bởi Admin Portal — Reviewer block)
- ❌ Apply migration trực tiếp qua Supabase SQL Editor (đi qua Admin Portal Reviewer)
- ❌ Quên RLS hoặc "tạm thời" disable
- ❌ Quên `.eq('workspace_id', ctx.workspaceId)` trong query
- ❌ Lưu URL file vào DB (lưu `object_key`)
- ❌ Hardcode workspaceId — dùng `useActiveScope().workspaceId` (xem 3.4). Fallback `getContext().workspaceId` chỉ chấp nhận khi mini-app chắc chắn không bao giờ opt-in sharing.
- ❌ Tự viết policy `for delete using (public.can_access_app_data(...))` — sẽ cho follower xoá data của owner. DELETE phải dùng `public.is_owner_workspace_member(workspace_id)`. Xem section 3.2.
- ❌ Dùng `for all` policy thay 4 policy tách biệt — không enforce được DELETE riêng cho member trực tiếp. Pattern cũ `workspace_isolation` (1 policy) chỉ chấp nhận nếu chắc chắn không support sharing.

### Frontend
- ❌ `window.alert()` / `window.confirm()` / `window.prompt()` — dùng `useDialog()`
- ❌ Native `<select>` HTML — dùng component `Select` từ `src/components/Select.jsx`
- ❌ `window.__APP_CONTEXT__` trực tiếp — dùng `getContext()`
- ❌ Hardcode domain — dùng env hoặc `window.location.origin`
- ❌ Hash-color + chữ cái UUID làm avatar fallback — RLS workspace-mate đã mở (superapp mig 004). Dùng `listMembers()` / `getProfiles()` từ `src/lib/members.js` để lấy real `full_name` + `avatar_url`. Fallback chỉ khi `avatar_url == null` (user chưa upload).
- ❌ Cho phép user pinch-zoom / double-tap zoom trang. Mini-app layout đã optimize mobile + chạy in-shell, zoom làm UI vỡ + iOS auto-zoom focus input gây khó chịu. Template đã chặn ở 2 layer (đừng remove):
  - `index.html` meta viewport: `maximum-scale=1.0, user-scalable=no`
  - `theme.css` `html, body`: `touch-action: manipulation; -webkit-text-size-adjust: 100%`

### Security
- ❌ Để API key trong code client (`VITE_*` là public!)
- ❌ Gọi `fetch` thẳng tới provider AI từ client (lộ key, không verify token)
- ❌ Concat user input vào AI prompt mà không wrap tag + force JSON output
- ❌ Trust AI output without shape validation
- ❌ Set `SUPABASE_SERVICE_ROLE_KEY` ở Vercel env của mini-app — KHÔNG được cấp. Privileged op qua `mushyApi.push()` (→ superapp mini-proxy)

### Deploy / Vercel
- ❌ Connect Vercel khi repo chỉ có 1 branch (vd chỉ `dev`, chưa có `main`) — Vercel auto-promote branch duy nhất thành Production Branch → code dev build với `VERCEL_ENV=production` → query schema prod thay vì dev → toàn bộ tách schema dev/prod vô nghĩa. Luôn push cả `main` + `dev` trước khi connect (xem 8.2 bước 1). `npm run dev:setup` auto-check.
- ❌ Dùng URL Vercel lệch chuẩn hoặc để alias `mushy-miniapp-{slug}.vercel.app` trỏ Production Branch — project/preview alias phải theo format `mushy-miniapp-{slug}` và re-assign sang branch `dev` ở Settings → Domains (xem 8.2 bước 5). Bỏ qua = dev_mode load build prod, schema prod, hết cứu.

---

## 10. Quick reference cho Claude (vibe coding)

Khi user nói:
- **"Thêm feature X cho mini-app"** → viết UI trong `App.jsx` (hoặc tách `screens/`), dùng `db.from('table').select().eq('workspace_id', ctx.workspaceId)`, `useDialog()` cho confirm.
- **"Cần table mới"** → viết migration `00X.sql` trong `migrations/` (chỉ `app_{slug}`), 4 RLS policies dùng helpers `public.can_access_app_data` + `public.is_owner_workspace_member` (xem section 3.2 + 3.5), instruct user submit qua Admin Portal Reviewer. Nếu UI sẽ subscribe table này qua `subscribeToTable()` (vote count live, chat, presence, …) → **thêm `-- @realtime` trên dòng riêng ngay trước `create table`**. KHÔNG viết tay `alter publication` / `replica identity full` — Reviewer auto-append idempotent. Xem section 3.6.
- **"Share data sang ws khác / nhận share từ ws khác"** → owner gen mã: `generateShareCode({ expiresHours })` → hiện code cho user share. Follower redeem: `redeemShareCode({ code })` từ `src/lib/sharing.js`. Header render `<ScopeSwitcher />` để switch giữa scopes. Mọi query dùng `useActiveScope().workspaceId` thay `ctx.workspaceId`. KHÔNG cần migration mini-app riêng — RLS dùng helper `public.can_access_app_data(workspace_id, '{slug}')` (section 3.2) là đủ. Quản lý + revoke grant: `listShareGrants()` / `revokeShareGrant(grantId)`. Xem section 3.5.
- **"Gọi AI"** → tạo `api/X-proxy.js` dùng `_verify.js`, set key Vercel env. Anti-injection: wrap input, force JSON, validate output.
- **"Upload file"** → dùng `upload(file, folder)` từ `storage.js`, lưu `object_key` vào DB, `getViewUrl()` khi render.
- **"Push notification"** → local (chỉ device user): `callNative('PUSH_NOTIFICATION', { title, body })` từ `bridge.js`. Remote (gửi cho members workspace): `mushyApi.push({ title, body, data?, userIds? })` từ `mushy-api.js` → superapp `mini-proxy` → Expo Push API. `data` cần `appSlug` để Shell deeplink vào mini-app khi tap noti (thêm `screen`, `recordId` nếu cần — Shell pass qua query params). `workspaceId` auto-inject từ ctx — không cần truyền tay. **Khuyến nghị**: truyền `data.kind = '<event_slug>'` (snake_case, vd `'answer_to_asker'`, `'comment_reply'`, `'deadline_reminder'`) để user mute granular từng loại event ở superapp Settings → Thông báo. Thiếu `kind` → default `'generic'` → user chỉ mute được nguyên app. Xem jsdoc `src/lib/mushy-api.js`.
- **"Tap-to-call số điện thoại"** → `bridge.tel('0901234567')`. Browser fallback tự `window.location = tel:...`.
- **"Mở external link"** → `bridge.openUrl('https://...')` hoặc anchor `<a href="zalo://...">` (Shell route ra Linking tự động).
- **"Share / Chia sẻ"** → `bridge.share({ title, message, url })` → native share sheet. Browser fallback navigator.share / clipboard.
- **"Haptic / Rung phản hồi"** → `bridge.haptic('success'|'warning'|'error'|'light'|'medium'|'heavy'|'selection')`. Free UX win cho confirm/swipe action.
- **"Quét QR"** → `bridge.scanQr()` → `{ data, type }`. Mở camera full-screen overlay trong Shell.
- **"Xác thực sinh trắc / Face ID"** → `bridge.biometric({ promptMessage: 'Xác nhận' })` → `{ success }`. Gate action nhạy cảm. Browser luôn throw — mini-app phải có password fallback.
- **"Lưu ảnh vào máy"** (QR chuyển tiền, ảnh tạo từ canvas…) → `bridge.saveImage({ dataUrl })` (hoặc `{ base64, mimeType }` / `{ url }`). DataUrl = `canvas.toDataURL()`. → `{ saved: true }`.
- **"Sao chép / dán"** → `bridge.copyText('STK 123...')` → `{ copied }`. `bridge.getClipboard()` → `{ text }`. Dùng khi `navigator.clipboard` bị WebView chặn.
- **"Mở Cài đặt app"** (user lỡ từ chối quyền) → `bridge.openSettings()`.
- **"Lưu danh bạ / chọn danh bạ"** → `bridge.saveContact({ name, phone, email? })` → `{ saved, id }`. `bridge.pickContact()` → `{ name, phone }` (system picker, không cần quyền đọc full danh bạ).
- **"Thêm vào Lịch"** (deadline, sinh nhật, sự kiện đội) → `bridge.addCalendarEvent({ title, startDate, endDate?, notes?, location?, allDay? })`. `startDate/endDate` = ISO string / epoch ms. Mở UI hệ thống, user xác nhận → `{ action, saved }`.
- **"Hiện avatar / tên member"** (voter, comment author, mention, presence…) → `listMembers(ctx.workspaceId)` từ `src/lib/members.js` → `[{ user_id, role, full_name, avatar_url, work_phone }, ...]`. Hoặc `getProfiles([uid1, uid2])` cho subset đã biết user_ids. KHÔNG dùng hash-color + chữ cái UUID — RLS workspace-mate đã cho phép real lookup (superapp migration 004). `work_phone` có thể null (user chưa khai) — dùng cho tap-to-call qua `bridge.tel(member.work_phone)`.
- **"Tracking / analytics user action"** → `track('event_name', { ...props })` từ `src/lib/analytics.js`. Auto-gắn sẵn `app_slug`/`workspace_id`/`role`/`user_dev_mode` — chỉ truyền property RIÊNG event này cần. Đổi screen → `trackScreen('home')`. Đừng tự gọi `posthog.capture()` — wrapper xử lý DEV skip + identify + group rồi. Xem section 12 cho event taxonomy chuẩn.

Memory bên Mushy chính (đọc nếu cần):
- `project_environments.md` — kiến trúc dev/prod, schema-per-env, dev_mode
- `project_domain.md` — quy ước domain
- `project_milestones.md` — state hiện tại

---

## 11. Cập nhật template định kỳ (BẮT BUỘC làm hàng tháng)

Mini-app downstream được **fork tại 1 thời điểm** từ template này — sau đó shared infra trong template (lib, bridge types, helpers, RLS adjustment, Dialog, theme, _verify.js…) sẽ phát triển tiếp ở **Mushy canonical**, không tự đẩy về downstream. Bug fix + feature mới ở shared layer chỉ có khi **bạn pull về tay**.

### 11.1 Khi nào cần sync

- **Định kỳ**: 2-4 tuần/lần (đặt nhắc Calendar). Nhanh — script auto + diff vài phút.
- **Khẩn**: khi
  - Team thông báo có bridge type mới (`bridge.somethingNew()`)
  - `mushyApi`/`members.js` lỗi 401/RLS sau khi superapp update
  - Supabase RPC mới được mention trong PR Mushy chính
  - Bug được fix ở `_verify.js` / `supabase.js` / `realtime.js`

### 11.2 Cái gì SYNC (shared infra — xem như kim cương, đừng sửa downstream)

| Path | Lý do |
|---|---|
| `src/lib/*` | Bridge, supabase, storage, realtime, queue, mushy-api, members, analytics, theme — toàn bộ |
| `src/components/Dialog.jsx` | Design system primitive |
| `src/components/Select.jsx` | Design system primitive (replace native `<select>`) |
| `src/components/ScopeSwitcher.jsx` | Cross-workspace sharing UI primitive |
| `api/_verify.js` | JWT verification logic |
| `scripts/setup.js` `seed.js` `refresh-token.js` | DEV onboarding flow |
| `.env.example` | Có thể có biến mới |
| `CLAUDE.md` | Quy tắc + bridge reference (script tự copy nếu khác) |

### 11.3 Cái gì KHÔNG sync (app-specific)

| Path | Lý do |
|---|---|
| `src/App.jsx`, `src/App.css` | UI app của bạn |
| `src/components/<của-bạn>.jsx` | Component app-specific (trừ Dialog/Select) |
| `src/lib/app/*.js` hoặc `src/app-lib/*.js` | Helper riêng app — đặt SUBFOLDER để né `--delete` (xem 11.3.1) |
| `migrations/*.sql` | Schema app riêng |
| `mushy.config.json` | Slug khác nhau |
| `package.json`, `vite.config.js`, `vercel.json` | Diff thủ công nếu nghi có dep mới |
| `README.md` | Tự do viết |

#### 11.3.1 ⚠️ Đừng để file app-specific TRỰC TIẾP trong `src/lib/`

`sync-template.sh` chạy `rsync --delete` cho `src/lib/` — XOÁ mọi file ở destination không có ở source template. Nếu bạn để `src/lib/auth.js`, `src/lib/chat.js`, `src/lib/weather.js` (app-specific) trực tiếp trong `src/lib/`, **sẽ bị xoá khi sync**.

**Convention đúng**: app-specific helper đặt trong SUBFOLDER `src/lib/app/` hoặc `src/app-lib/`:
```
src/lib/
├── supabase.js       ← shared, sync overwrite OK
├── bridge.js         ← shared
├── realtime.js       ← shared
├── storage.js        ← shared
├── members.js        ← shared
├── theme.css         ← shared
└── app/              ← ← app-specific, KHÔNG bị --delete touch
    ├── auth.js
    ├── chat.js
    └── weather.js
```

`sync-template.sh` có **pre-flight check** — nếu detect file ngoài template trong `src/lib/`, abort + in danh sách. User phải move ra subfolder hoặc confirm `FORCE_DELETE=1` (rủi ro tự chịu).

### 11.4 Cách sync (khuyến nghị)

```bash
# 1. Clone Mushy canonical về tạm (lần đầu, hoặc rm -rf rồi clone lại)
git clone https://github.com/anhdqvn/mushy.git /tmp/mushy-latest
# (hoặc git -C /tmp/mushy-latest pull nếu đã có)

# 2. Trong project mini-app downstream, branch riêng để review
cd ~/miniapp-{your-slug}
git checkout dev && git pull
git checkout -b sync-template-$(date +%Y%m%d)

# 3. Run sync script (đã ship trong template)
bash scripts/sync-template.sh /tmp/mushy-latest/miniapp-template

# 4. Review thay đổi
git status
git diff --stat
git diff src/lib/    # spot-check shared lib

# 5. Diff package.json bằng tay nếu nghi có dep mới
diff /tmp/mushy-latest/miniapp-template/package.json package.json
# Nếu thấy thêm dep cần thiết → npm install <pkg>@<version>

# 6. Test
npm install
npm run dev:setup    # refresh token + verify lib mới còn login OK
npm run dev          # smoke test UI

# 7. Push + PR vào dev
git push -u origin sync-template-$(date +%Y%m%d)
# Tạo PR trên GitHub: base=dev, compare=sync-template-...
# Review xong merge → dev → main như flow thường
```

### 11.5 Theo dõi changelog (xem có gì mới đáng sync)

```bash
# Tại Mushy canonical clone (/tmp/mushy-latest):
git log --oneline --since="1 month ago" -- miniapp-template/
# Hoặc filter cụ thể shared infra:
git log --oneline --since="1 month ago" -- \
  miniapp-template/src/lib \
  miniapp-template/api/_verify.js \
  miniapp-template/scripts \
  miniapp-template/CLAUDE.md
```

### 11.6 Conflict thường gặp + cách xử

- **`src/lib/supabase.js` đã custom local** (vd add helper riêng): KHÔNG nên — move helper riêng sang `src/lib/<your-app>.js`. Nếu lỡ sửa → backup trước sync rồi merge tay.
- **`scripts/setup.js` đổi prompt**: thường chỉ là copy text mới hoặc thêm bước. Diff trước, accept nếu hợp lý.
- **`.env.example` có biến mới**: copy biến mới sang `.env` thực + điền giá trị (vd nhờ admin nếu là token).
- **`CLAUDE.md` thay đổi quy tắc** (vd RLS mới, bridge type mới): đọc kỹ section thay đổi, áp dụng vào code app nếu cần (vd thay native `<select>` còn sót → `Select` component).

### 11.7 ❌ KHÔNG push ngược về template

Sync là **MỘT CHIỀU**: template → mini-app downstream. KHÔNG được làm ngược lại.

- ❌ KHÔNG `git remote add upstream https://github.com/anhdqvn/mushy.git` rồi push từ mini-app repo lên path `miniapp-template/`.
- ❌ KHÔNG mở PR từ mini-app GitHub repo về `mushy/miniapp-template`.
- ❌ KHÔNG copy file từ mini-app về local clone của template rồi commit.

Lý do: nhiều mini-app khác cùng pull từ template. Push ngược = áp đặt 1 mini-app's choice lên mọi mini-app khác.

Cần fix shared infra → báo team Mushy canonical (anhdqvn) qua issue / chat. Fix được apply ở template canonical, mini-app downstream pull về như thường.

### 11.8 Anti-pattern khi sync

- ❌ Skip sync 6+ tháng → khi cần upgrade gặp 50 conflict + 5 breaking changes cùng lúc
- ❌ Sửa `src/lib/*` để fix bug local → patch lost khi sync. **Bug ở shared layer phải fix ở Mushy canonical + sync về.**
- ❌ Merge thẳng vào main bỏ qua test — sync có thể đụng RLS / bridge breaking → smoke test bắt buộc
- ❌ Xóa `scripts/sync-template.sh` ở downstream — script tự exclude khỏi sync để bạn upgrade được lần sau

---

## 12. Analytics — PostHog (event taxonomy chuẩn)

Mọi mini-app Mushy dùng **chung 1 PostHog project** (EU Cloud). Wrapper `src/lib/analytics.js` auto-init từ `main.jsx` — không phải setup tay. Auto-skip ở DEV local (`npm run dev`) để không bẩn data.

### 12.1 Đã có sẵn — không cần bắn tay

- `app_opened` — bắn ngay khi mini-app mount (auto từ `initAnalytics()`).
- `error` — bắn khi `window.error` hoặc `unhandledrejection` fire (auto).
- `$pageleave` — bắn khi user đóng tab/WebView (PostHog auto, đo time-on-page).

Shell tự bắn `shell_opened` / `mini_app_opened` / `mini_app_closed` (kèm `session_ms`) bên ngoài — mini-app không lo.

### 12.2 Bắn tay khi user làm action

```js
import { track, trackScreen } from './lib/analytics.js';

// Đổi screen / route trong SPA
trackScreen('detail', { record_id: id });

// User action có ý nghĩa (CRUD, submit, vote, ...)
track('note_created', { length: text.length });
track('vote_submitted', { question_id: qid, choice: 'A' });
track('export_clicked', { format: 'csv' });
```

**Naming convention**:
- snake_case: `note_created`, KHÔNG `noteCreated` / `Note Created`
- verb past tense: `_created`, `_submitted`, `_completed`, `_failed`, `_clicked`, `_opened`, `_closed`
- KHÔNG prefix `app_slug` vào tên event — đã có ở property tự gắn.

### 12.3 Event chuẩn (gợi ý — chọn cái phù hợp với mini-app)

| Event | Khi nào bắn | Properties nên có |
|---|---|---|
| `screen_view` | Mỗi lần đổi route/screen (dùng `trackScreen()`) | `screen_name`, optional `record_id` |
| `action_success` | Action có CTA chính hoàn thành (vd "Lưu", "Gửi") | `action` (vd `'save_note'`), optional `duration_ms` |
| `action_failed` | Action lỗi (network, validation, RLS reject) | `action`, `error_code`, `error_message` |
| `feature_used` | User dùng feature phụ (filter, search, export…) | `feature` (vd `'filter_by_date'`) |
| `external_link_opened` | User tap link external (qua `bridge.openUrl`) | `domain` (KHÔNG full URL, privacy) |
| `share_initiated` | User tap share button | `target` (vd `'system_sheet'`) |
| `notification_tap_inside` | User tap deep-link noti landing vào mini-app | `kind`, `record_id` |

### 12.4 KHÔNG bắn (anti-pattern)

- ❌ **PII trong properties**: email, phone, full content note. Property nên là metadata (length, count, status), không phải nội dung.
- ❌ **Bắn mỗi render**: `track()` trong `useEffect` không deps, hoặc trong render body → flood quota. Chỉ bắn khi user thực sự action.
- ❌ **Tự gọi `posthog.capture()`**: bypass wrapper → mất super props (`app_slug`, `role`…), mất DEV skip, mất identify. Luôn dùng `track()` / `trackScreen()`.
- ❌ **Một event nhiều ý nghĩa**: `user_action` với prop `type='note_created'` → khó query. Tách: `note_created`, `note_deleted`, mỗi cái event riêng.

### 12.5 Xem dashboard

PostHog Cloud EU: https://eu.posthog.com → project "Mushy". Breakdown theo `app_slug` để xem per-app, theo group `workspace` để xem per-workspace.
