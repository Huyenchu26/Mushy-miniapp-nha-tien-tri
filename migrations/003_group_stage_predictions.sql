-- =====================================================================
-- Nha Tien Tri World Cup 2026 - group-stage-only tables.
--
-- Slug: worldcup -> schema app_worldcup. Do NOT write app_worldcup_dev here;
-- the Mushy migration reviewer duplicates to the dev schema.
-- =====================================================================

create or replace function app_worldcup.set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- @realtime
create table if not exists app_worldcup.group_predictions (
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
  on app_worldcup.group_predictions (workspace_id);
create index if not exists idx_wc_group_predictions_user_day
  on app_worldcup.group_predictions (workspace_id, created_by, match_day);

grant select, insert, update, delete on app_worldcup.group_predictions to authenticated;
alter table app_worldcup.group_predictions enable row level security;

drop policy if exists "group_predictions_select" on app_worldcup.group_predictions;
create policy "group_predictions_select" on app_worldcup.group_predictions
for select using (public.can_access_app_data(workspace_id, 'worldcup'));

drop policy if exists "group_predictions_insert" on app_worldcup.group_predictions;
create policy "group_predictions_insert" on app_worldcup.group_predictions
for insert with check (public.can_access_app_data(workspace_id, 'worldcup'));

drop policy if exists "group_predictions_update" on app_worldcup.group_predictions;
create policy "group_predictions_update" on app_worldcup.group_predictions
for update using (public.can_access_app_data(workspace_id, 'worldcup'))
with check (public.can_access_app_data(workspace_id, 'worldcup'));

drop policy if exists "group_predictions_delete" on app_worldcup.group_predictions;
create policy "group_predictions_delete" on app_worldcup.group_predictions
for delete using (public.is_owner_workspace_member(workspace_id));

drop trigger if exists trg_wc_group_predictions_updated on app_worldcup.group_predictions;
create trigger trg_wc_group_predictions_updated
  before update on app_worldcup.group_predictions
  for each row execute function app_worldcup.set_updated_at();

-- @realtime
create table if not exists app_worldcup.group_daily_answers (
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
  on app_worldcup.group_daily_answers (workspace_id);
create index if not exists idx_wc_group_daily_answers_user
  on app_worldcup.group_daily_answers (workspace_id, created_by);

grant select, insert, update, delete on app_worldcup.group_daily_answers to authenticated;
alter table app_worldcup.group_daily_answers enable row level security;

drop policy if exists "group_daily_answers_select" on app_worldcup.group_daily_answers;
create policy "group_daily_answers_select" on app_worldcup.group_daily_answers
for select using (public.can_access_app_data(workspace_id, 'worldcup'));

drop policy if exists "group_daily_answers_insert" on app_worldcup.group_daily_answers;
create policy "group_daily_answers_insert" on app_worldcup.group_daily_answers
for insert with check (public.can_access_app_data(workspace_id, 'worldcup'));

drop policy if exists "group_daily_answers_update" on app_worldcup.group_daily_answers;
create policy "group_daily_answers_update" on app_worldcup.group_daily_answers
for update using (public.can_access_app_data(workspace_id, 'worldcup'))
with check (public.can_access_app_data(workspace_id, 'worldcup'));

drop policy if exists "group_daily_answers_delete" on app_worldcup.group_daily_answers;
create policy "group_daily_answers_delete" on app_worldcup.group_daily_answers
for delete using (public.is_owner_workspace_member(workspace_id));

drop trigger if exists trg_wc_group_daily_answers_updated on app_worldcup.group_daily_answers;
create trigger trg_wc_group_daily_answers_updated
  before update on app_worldcup.group_daily_answers
  for each row execute function app_worldcup.set_updated_at();
