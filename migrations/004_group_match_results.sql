-- =====================================================================
-- Nha Tien Tri World Cup 2026 - official group-stage results.
--
-- Slug: nha-tien-tri -> schema app_nha_tien_tri.
-- The Mushy migration reviewer duplicates this migration to the dev schema.
-- =====================================================================

create table if not exists app_nha_tien_tri.group_match_results (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references auth.users(id),
  match_no      int not null check (match_no between 1 and 72),
  match_day     date not null,
  home_team     text not null check (char_length(home_team) between 1 and 60),
  away_team     text not null check (char_length(away_team) between 1 and 60),
  home_score    int check (home_score between 0 and 99),
  away_score    int check (away_score between 0 and 99),
  status        text not null default 'finished' check (status in ('scheduled','finished')),
  result_source text not null default 'manual' check (char_length(result_source) between 1 and 40),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, match_no),
  check (
    status <> 'finished'
    or (home_score is not null and away_score is not null)
  )
);

create index if not exists idx_wc_group_match_results_workspace
  on app_nha_tien_tri.group_match_results (workspace_id);
create index if not exists idx_wc_group_match_results_day
  on app_nha_tien_tri.group_match_results (workspace_id, match_day);

grant select, insert, update, delete on app_nha_tien_tri.group_match_results to authenticated;
alter table app_nha_tien_tri.group_match_results enable row level security;

create or replace function app_nha_tien_tri.can_manage_group_results(p_workspace_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  );
$$;

create or replace function app_nha_tien_tri.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop policy if exists "group_match_results_select" on app_nha_tien_tri.group_match_results;
create policy "group_match_results_select" on app_nha_tien_tri.group_match_results
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "group_match_results_insert" on app_nha_tien_tri.group_match_results;
create policy "group_match_results_insert" on app_nha_tien_tri.group_match_results
for insert with check (app_nha_tien_tri.can_manage_group_results(workspace_id));

drop policy if exists "group_match_results_update" on app_nha_tien_tri.group_match_results;
create policy "group_match_results_update" on app_nha_tien_tri.group_match_results
for update using (app_nha_tien_tri.can_manage_group_results(workspace_id));

drop policy if exists "group_match_results_delete" on app_nha_tien_tri.group_match_results;
create policy "group_match_results_delete" on app_nha_tien_tri.group_match_results
for delete using (app_nha_tien_tri.can_manage_group_results(workspace_id));

drop trigger if exists trg_wc_group_match_results_updated on app_nha_tien_tri.group_match_results;
create trigger trg_wc_group_match_results_updated before update on app_nha_tien_tri.group_match_results
  for each row execute function app_nha_tien_tri.set_updated_at();
