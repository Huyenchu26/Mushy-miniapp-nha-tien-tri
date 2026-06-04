-- =====================================================================
-- Migration mẫu cho mini-app — RLS pattern hỗ trợ cross-workspace sharing.
-- Đổi `demo` thành schema thật TRƯỚC KHI SUBMIT qua Migration Reviewer.
--
-- ⚠️ Schema name = "app_{slug}" với dash → underscore.
--    Vd: slug "lunch-plan" → schema "app_lunch_plan" (KHÔNG "app_lunch-plan").
--    Lý do: Postgres unquoted identifier không nhận dash.
--
-- Schema `app_{slug_normalized}` đã được Admin Portal auto-tạo khi register
-- mini-app (cùng grants + default privileges). Migration KHÔNG cần CREATE
-- SCHEMA hay GRANT — chỉ tập trung vào tables, indexes, RLS policies, triggers.
--
-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ ⚠️  TUYỆT ĐỐI KHÔNG VIẾT TAY `_dev` TRONG MIGRATION SQL.           ║
-- ║                                                                   ║
-- ║ Slug = "lunch-plan" → schema PROD = `app_lunch_plan` (DUY NHẤT     ║
-- ║ tên xuất hiện trong file SQL). Reviewer apply 2 lần atomic:        ║
-- ║   1. PROD: chạy nguyên SQL với `app_lunch_plan.xxx`                ║
-- ║   2. DEV:  regex-replace whole-word → `app_lunch_plan_dev.xxx`     ║
-- ║                                                                   ║
-- ║ Nếu bạn viết tay `app_lunch_plan_dev`, regex-replace lần 2 sẽ      ║
-- ║ ra `app_lunch_plan_dev_dev` → schema sai → migration fail.         ║
-- ║                                                                   ║
-- ║ ❌ create table app_lunch_plan_dev.tasks (...);                    ║
-- ║ ✅ create table app_lunch_plan.tasks (...);                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝
--
-- Checklist (Migration Reviewer sẽ verify):
--   [x] Mọi table có `workspace_id uuid not null`
--   [x] Foreign key `workspace_id` → `public.workspaces` ON DELETE CASCADE
--   [x] Index trên `workspace_id`
--   [x] RLS bật + 4 policies (select/insert/update/delete) dùng helpers
--       `public.can_access_app_data` + `public.is_owner_workspace_member`
--   [x] `created_at timestamptz default now()`
--   [x] `created_by uuid references auth.users(id)`
--   [x] Tiền: `bigint` (đơn vị nhỏ nhất); ID: `uuid`; thời gian: `timestamptz`
--   [x] File: lưu `object_key`, không lưu URL
--   [x] Trigger updated_at nếu có cột này
--
-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ Về RLS pattern mới (cross-workspace sharing — superapp mig 049)   ║
-- ╚═══════════════════════════════════════════════════════════════════╝
-- Pattern CŨ (workspace_isolation single policy) còn dùng được nhưng KHÔNG
-- tận dụng được feature share data cross-workspace. Pattern MỚI:
--
--   - `for select/insert/update`: gọi `public.can_access_app_data(workspace_id, '{slug}')`
--     → TRUE nếu user là member của workspace_id HOẶC member của 1 ws follower
--       có grant tới workspace_id cho app slug này.
--   - `for delete`: gọi `public.is_owner_workspace_member(workspace_id)`
--     → CHỈ member trực tiếp của ws owner xoá được. Follower KHÔNG delete.
--
-- App slug TRUYỀN LITERAL trong policy (vd 'demo'), KHÔNG dùng biến.
-- Lý do: helper `can_access_app_data` cần biết app_slug để lookup grants
-- đúng app — nhưng app slug không có sẵn ở DB context, phải hardcode.
--
-- Nếu mini-app KHÔNG cần share cross-ws: helpers vẫn fallback đúng (chỉ
-- member của workspace_id thấy/sửa được — y hệt pattern cũ). Mặc định
-- KHÔNG có ai bị share gì cho tới khi owner gen mã + follower redeem.
-- =====================================================================

-- ---------- Bảng tasks (ví dụ) ----------
-- Để mini-app subscribe realtime cho table này: uncomment "-- @realtime" dòng
-- dưới. Reviewer tự append ALTER PUBLICATION + REPLICA IDENTITY FULL idempotent
-- vào cuối SQL khi apply (cả prod + dev schema). KHÔNG cần tự viết 2 DDL đó.
-- Xem CLAUDE.md section 3.6.
--
-- -- @realtime
create table if not exists app_demo.tasks (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references auth.users(id),
  title         text not null check (char_length(title) between 1 and 200),
  done          boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_tasks_workspace      on app_demo.tasks (workspace_id);
create index if not exists idx_tasks_workspace_time on app_demo.tasks (workspace_id, created_at desc);

-- GRANT cho table cụ thể (default privileges chỉ áp dụng cho table TƯƠNG LAI
-- nếu chạy default privileges TRƯỚC khi tạo table — vì admin auto setup chạy
-- trước, default sẽ apply cho table này. Nhưng explicit grant cho an tâm.)
grant select, insert, update, delete on app_demo.tasks to authenticated;

alter table app_demo.tasks enable row level security;

-- Drop legacy policy (nếu migration cũ từng tạo "workspace_isolation")
drop policy if exists "workspace_isolation" on app_demo.tasks;
drop policy if exists "tasks_select" on app_demo.tasks;
drop policy if exists "tasks_insert" on app_demo.tasks;
drop policy if exists "tasks_update" on app_demo.tasks;
drop policy if exists "tasks_delete" on app_demo.tasks;

-- SELECT: member ws owner HOẶC member ws follower được share
create policy "tasks_select" on app_demo.tasks
for select using (
  public.can_access_app_data(workspace_id, 'demo')
);

-- INSERT: cùng quyền với select (follower được ghi data vào ws owner)
create policy "tasks_insert" on app_demo.tasks
for insert with check (
  public.can_access_app_data(workspace_id, 'demo')
);

-- UPDATE: cùng quyền (follower được sửa data của owner)
create policy "tasks_update" on app_demo.tasks
for update using (
  public.can_access_app_data(workspace_id, 'demo')
) with check (
  public.can_access_app_data(workspace_id, 'demo')
);

-- DELETE: CHỈ member trực tiếp của ws owner. Follower KHÔNG xoá được.
create policy "tasks_delete" on app_demo.tasks
for delete using (
  public.is_owner_workspace_member(workspace_id)
);

-- ---------- Trigger updated_at ----------
create or replace function app_demo.set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_tasks_updated_at on app_demo.tasks;
create trigger trg_tasks_updated_at
  before update on app_demo.tasks
  for each row execute function app_demo.set_updated_at();

-- ---------- Realtime opt-in ----------
-- Đánh dấu bằng "-- @realtime" trên dòng riêng ngay TRƯỚC create table (xem
-- ví dụ phía trên với app_demo.tasks). Reviewer auto-append:
--   alter publication supabase_realtime add table <schema>.<table>;
--   alter table <schema>.<table> replica identity full;
-- vào cuối SQL khi apply (cho cả prod + dev schema).
--
-- KHÔNG opt-in mọi table — tốn WAL + Supabase Realtime quota. Chỉ table có UI
-- live (vote, chat, presence...) mới cần.
