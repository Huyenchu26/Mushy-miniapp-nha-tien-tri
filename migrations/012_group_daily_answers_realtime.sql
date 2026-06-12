-- =====================================================================
-- Nha Tien Tri - enable realtime for daily answer changes.
-- Submit through Admin Portal Migration Reviewer. Reviewer duplicates dev
-- and appends publication/replica identity DDL for the @realtime marker.
-- =====================================================================

-- @realtime
create table if not exists app_nha_tien_tri.group_daily_answers (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references auth.users(id),
  question_key  text not null check (char_length(question_key) between 3 and 40),
  answer        text not null check (char_length(answer) between 1 and 280),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, created_by, question_key)
);

create index if not exists idx_wc_group_daily_answers_workspace
  on app_nha_tien_tri.group_daily_answers (workspace_id);
create index if not exists idx_wc_group_daily_answers_user
  on app_nha_tien_tri.group_daily_answers (workspace_id, created_by);

grant select, insert, update, delete on app_nha_tien_tri.group_daily_answers to authenticated;
alter table app_nha_tien_tri.group_daily_answers enable row level security;

drop policy if exists "group_daily_answers_select" on app_nha_tien_tri.group_daily_answers;
create policy "group_daily_answers_select" on app_nha_tien_tri.group_daily_answers
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "group_daily_answers_insert" on app_nha_tien_tri.group_daily_answers;
create policy "group_daily_answers_insert" on app_nha_tien_tri.group_daily_answers
for insert with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "group_daily_answers_update" on app_nha_tien_tri.group_daily_answers;
create policy "group_daily_answers_update" on app_nha_tien_tri.group_daily_answers
for update using (public.can_access_app_data(workspace_id, 'nha-tien-tri'))
with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "group_daily_answers_delete" on app_nha_tien_tri.group_daily_answers;
create policy "group_daily_answers_delete" on app_nha_tien_tri.group_daily_answers
for delete using (public.is_owner_workspace_member(workspace_id));
