-- =====================================================================
-- Nha Tien Tri - enable realtime for tournament app_config changes.
-- Submit through Admin Portal Migration Reviewer. Reviewer duplicates dev
-- and appends publication/replica identity DDL for the @realtime marker.
-- =====================================================================

-- @realtime
create table if not exists app_nha_tien_tri.app_config (
  id                              uuid primary key default gen_random_uuid(),
  workspace_id                    uuid not null references public.workspaces(id) on delete cascade,
  created_by                      uuid not null references auth.users(id),
  opening_kickoff_at              timestamptz,
  champion_actual                 text,
  top_scorer_actual               text,
  shock_team_actual               text,
  predictions_hidden_until_kickoff boolean not null default true,
  reminders_enabled               boolean not null default true,
  last_recap_sent_at              timestamptz,
  young_player_actual             text,
  golden_ball_actual              text,
  daily_question_answers          jsonb not null default '{}'::jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique (workspace_id)
);

create index if not exists idx_wc_cfg_ws on app_nha_tien_tri.app_config (workspace_id);

grant select, insert, update, delete on app_nha_tien_tri.app_config to authenticated;
alter table app_nha_tien_tri.app_config enable row level security;

drop policy if exists "app_config_select" on app_nha_tien_tri.app_config;
create policy "app_config_select" on app_nha_tien_tri.app_config
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "app_config_insert" on app_nha_tien_tri.app_config;
create policy "app_config_insert" on app_nha_tien_tri.app_config
for insert with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "app_config_update" on app_nha_tien_tri.app_config;
create policy "app_config_update" on app_nha_tien_tri.app_config
for update using (public.can_access_app_data(workspace_id, 'nha-tien-tri'))
with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "app_config_delete" on app_nha_tien_tri.app_config;
create policy "app_config_delete" on app_nha_tien_tri.app_config
for delete using (public.is_owner_workspace_member(workspace_id));
