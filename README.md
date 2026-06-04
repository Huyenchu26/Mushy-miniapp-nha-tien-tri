# Mini-app Template — Mushy Super App

Template repo để build mini-app trong hệ Mushy. Clone repo này, đổi `slug` trong `mushy.config.json`, bắt đầu code.

> 📖 Đọc kỹ [CLAUDE.md](./CLAUDE.md) trước khi viết code — single source of truth cho mọi quy tắc kỹ thuật (DB, RLS, security, kiến trúc dev/prod, anti-patterns).

## Trước khi bắt đầu — phải có Mushy account + workspace

1. Cài app **Mushy** trên iPhone (TestFlight) hoặc Android (Play Internal Testing)
2. Mở app → **Đăng ký** tài khoản bằng email + password
3. Sau khi login lần đầu → **Tạo Workspace mới** (đặt tên team/dự án)
4. Nhớ email + password — sẽ dùng cho `npm run dev:setup` ở dưới

> Nếu chưa có link cài Mushy app, hỏi admin team.

## Quick start (local dev)

```bash
# 1. Đổi slug trong mushy.config.json
#    "slug": "REPLACE_WITH_YOUR_SLUG" → "slug": "ten-app-cua-ban"
#    (3-41 ký tự [a-z0-9_-]. Schema dùng underscore-normalized version
#     của slug — vd slug "lunch-plan" → schema "app_lunch_plan".)

# 2. Setup
cp .env.example .env    # giữ VITE_DEV_* placeholder
npm install
npm run dev:setup       # Login Mushy account + chọn workspace + tự ghi 4 VITE_DEV_*
npm run dev             # localhost:5173
```

### `npm run dev:setup` làm gì

Hỏi email + password Mushy → list workspace bạn là member → chọn 1 → tự ghi vào `.env`:
- `VITE_DEV_TOKEN` (JWT, hết hạn 1h)
- `VITE_DEV_WORKSPACE_ID`
- `VITE_DEV_USER_ID`
- `VITE_DEV_ROLE`

Mini-app local browser đọc `getContext()` → fallback lấy 4 vars này (giống Shell inject ở Expo Go).

Token hết hạn sau 1h → `npm run dev:token` để refresh (không phải login lại từ đầu).

## Scripts

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Vite dev server, port 5173 (browser mode + bridge mock) |
| `npm run dev:setup` | 1 lần: login Mushy, chọn workspace, ghi `VITE_DEV_*` vào `.env` |
| `npm run dev:token` | Refresh JWT (hết hạn sau 1 giờ) |
| `npm run dev:seed` | Insert sample data theo schema mini-app |
| `npm run build` | Build production |
| `npm run preview` | Preview build local |

## Workflow tóm tắt

1. **Code local** → `npm run dev` test trong browser (bridge mock)
2. **Push lên GitHub** (⚠️ phải có **cả 2 branch `main` + `dev`** trước khi connect Vercel — xem [Branch convention](#branch-convention)) → Vercel project/preview alias chuẩn `https://mushy-miniapp-{slug}.vercel.app`
3. **Đăng ký vào Mushy** qua Admin Portal (https://admin.mini.mushy-app.com):
   - Slug + Tên + Preview URL (Vercel)
   - Auto-tạo CNAME Cloudflare cho prod custom domain
   - Hướng dẫn add Vercel custom domain
4. **Submit migration** qua Admin Portal → Migration Reviewer (Gemini AI) → auto-apply cho cả `app_{slug}` + `app_{slug}_dev`
5. **Test trong superapp**: mở Mushy app → workspace → mini-app → load dev URL (preview) hoặc prod URL

## Branch convention

- `main` = production (custom domain `{slug}.mini.mushy-app.com`)
- `dev`  = preview (URL chuẩn `https://mushy-miniapp-{slug}.vercel.app`)

Standard Git flow: code daily trên `dev`, PR/merge `dev → main` để ship prod.

### ⚠️ Trước khi connect Vercel: PHẢI có CẢ HAI `main` + `dev` trên GitHub

Vercel tự gán branch duy nhất trong repo thành **Production Branch**. Nếu chỉ push `dev` trước:

- Vercel coi `dev` là production → build với `VERCEL_ENV=production`
- Mini-app query schema `app_{slug}` (PROD) thay vì `app_{slug}_dev`
- Bật dev_mode trong Mushy → app **không thấy seed data dev** → trống

**Fix**: tạo `main` placeholder trước (nếu chưa muốn ship prod thật), push cả 2 branch, sau đó mới connect Vercel.

`npm run dev:setup` auto-detect khi thiếu `main` và offer tạo placeholder + push (orphan branch, không inherit commits của `dev`).

Tự tay nếu cần:

```bash
git worktree add ../tmp-main --orphan main
echo '<!doctype html><meta charset="utf-8"><title>🚧</title><body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0"><h1>🚧 Đang phát triển</h1></body>' > ../tmp-main/index.html
(cd ../tmp-main && git add index.html && git commit -m "🚧 Placeholder main" && git push -u origin main)
git worktree remove ../tmp-main
```

## Stack cố định

- **Frontend**: Vite + React 18
- **Backend**: Vercel Serverless Functions (`api/`)
- **Database**: Supabase Postgres (1 project chung Mushy, schema riêng `app_{slug}`)
- **Auth**: Supabase Auth (token inject từ superapp shell)
- **Storage**: Supabase Storage bucket `miniapp-{slug}` (R2 opt-in qua `VITE_USE_R2`)
- **Realtime**: Supabase Postgres Changes + Broadcast
- **Bridge native**: postMessage protocol qua `react-native-webview` (superapp)

## Layout repo

```
mushy.config.json         ← slug + Supabase URL/anon key (committed)
src/
├── App.jsx               ← UI mini-app (sửa đây khi build feature)
├── App.css               ← style app-specific (override theme nếu cần)
├── main.jsx              ← entry, wrap DialogProvider
├── components/Dialog.jsx ← useDialog() thay alert/confirm native
└── lib/                  ← shared infra (theme, context, bridge, supabase, storage, realtime, queue)
api/                      ← Vercel Serverless Functions (server-side, có API keys)
migrations/               ← SQL migrations (submit qua Admin Portal Reviewer)
scripts/                  ← npm run dev:* scripts
```

Chi tiết từng file + quy ước: xem [CLAUDE.md](./CLAUDE.md).

## Quy tắc tối thượng (vi phạm = bug)

1. **Schema = `app_{slug}`** (KHÔNG bao giờ `public`)
2. **Mọi table có `workspace_id` + RLS workspace_isolation**
3. **Mọi query `.eq('workspace_id', ctx.workspaceId)`** (RLS không chặn cross-workspace cùng user)
4. **API key chỉ ở Vercel env server-side**, không `VITE_*` prefix
5. **Migration luôn qua Admin Portal Reviewer**, không SQL Editor trực tiếp
6. **Lưu `object_key`, không phải URL**
7. **`useDialog()` thay `window.alert/confirm`**

Đọc [CLAUDE.md](./CLAUDE.md) section 9 cho danh sách anti-patterns đầy đủ.
