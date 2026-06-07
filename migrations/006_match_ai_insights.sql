-- =====================================================================
-- Nha Tien Tri World Cup 2026 - cached AI match insights.
--
-- Slug: nha-tien-tri -> schema app_nha_tien_tri.
-- The Mushy migration reviewer duplicates this migration to the dev schema.
-- Submit via Admin Portal Migration Reviewer, do not run directly in SQL Editor.
-- =====================================================================

create table if not exists app_nha_tien_tri.match_ai_insights (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  created_by        uuid not null references auth.users(id),
  match_no          int not null check (match_no between 1 and 104),
  provider          text not null default 'openrouter',
  model             text not null,
  summary           text not null check (char_length(summary) between 20 and 700),
  players_mentioned text[] not null default '{}',
  created_at        timestamptz not null default now(),
  unique (workspace_id, match_no)
);

create index if not exists idx_wc_match_ai_insights_workspace
  on app_nha_tien_tri.match_ai_insights (workspace_id);

create index if not exists idx_wc_match_ai_insights_match
  on app_nha_tien_tri.match_ai_insights (workspace_id, match_no);

grant select, insert, update, delete on app_nha_tien_tri.match_ai_insights to authenticated;
alter table app_nha_tien_tri.match_ai_insights enable row level security;

drop policy if exists "match_ai_insights_select" on app_nha_tien_tri.match_ai_insights;
create policy "match_ai_insights_select" on app_nha_tien_tri.match_ai_insights
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "match_ai_insights_insert" on app_nha_tien_tri.match_ai_insights;
create policy "match_ai_insights_insert" on app_nha_tien_tri.match_ai_insights
for insert with check (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
);

drop policy if exists "match_ai_insights_update" on app_nha_tien_tri.match_ai_insights;
create policy "match_ai_insights_update" on app_nha_tien_tri.match_ai_insights
for update using (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
) with check (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
);

drop policy if exists "match_ai_insights_delete" on app_nha_tien_tri.match_ai_insights;
create policy "match_ai_insights_delete" on app_nha_tien_tri.match_ai_insights
for delete using (public.is_owner_workspace_member(workspace_id));
