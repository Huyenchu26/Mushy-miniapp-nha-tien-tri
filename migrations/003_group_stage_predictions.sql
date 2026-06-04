-- =====================================================================
-- Nha Tien Tri World Cup 2026 - group-stage-only tables.
--
-- Slug: nha-tien-tri -> schema app_nha_tien_tri.
-- The Mushy migration reviewer duplicates this migration to the dev schema.
-- =====================================================================

create table if not exists app_nha_tien_tri.group_predictions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references auth.users(id),
  match_no      int not null check (match_no between 1 and 72),
  match_day     date not null,
  home_pred     int not null check (home_pred between 0 and 99),
  away_pred     int not null check (away_pred between 0 and 99),
  double_down   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, created_by, match_no)
);

create index if not exists idx_wc_group_predictions_workspace
  on app_nha_tien_tri.group_predictions (workspace_id);
create index if not exists idx_wc_group_predictions_user_day
  on app_nha_tien_tri.group_predictions (workspace_id, created_by, match_day);
create unique index if not exists idx_wc_group_predictions_one_double_day
  on app_nha_tien_tri.group_predictions (workspace_id, created_by, match_day)
  where double_down = true;

grant select, insert, update, delete on app_nha_tien_tri.group_predictions to authenticated;
alter table app_nha_tien_tri.group_predictions enable row level security;

drop policy if exists "group_predictions_select" on app_nha_tien_tri.group_predictions;
create policy "group_predictions_select" on app_nha_tien_tri.group_predictions
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "group_predictions_insert" on app_nha_tien_tri.group_predictions;
create policy "group_predictions_insert" on app_nha_tien_tri.group_predictions
for insert with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "group_predictions_update" on app_nha_tien_tri.group_predictions;
create policy "group_predictions_update" on app_nha_tien_tri.group_predictions
for update using (public.can_access_app_data(workspace_id, 'nha-tien-tri'))
with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "group_predictions_delete" on app_nha_tien_tri.group_predictions;
create policy "group_predictions_delete" on app_nha_tien_tri.group_predictions
for delete using (public.is_owner_workspace_member(workspace_id));

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
