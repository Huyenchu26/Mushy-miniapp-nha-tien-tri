-- =====================================================================
-- Nha Tien Tri - tournament operations hardening.
-- Submit through Admin Portal Migration Reviewer. Reviewer duplicates dev.
-- =====================================================================

-- Some workspaces applied the group-stage migrations before the full
-- tournament table existed. Keep this migration self-healing so the later
-- policies/functions can safely reference app_nha_tien_tri.matches.
-- @realtime
create table if not exists app_nha_tien_tri.matches (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references auth.users(id),
  match_no      int not null check (match_no between 1 and 104),
  stage         text not null check (stage in ('group','r32','r16','qf','sf','third','final')),
  group_label   text,
  home_team     text not null check (char_length(home_team) between 1 and 60),
  away_team     text not null check (char_length(away_team) between 1 and 60),
  kickoff_at    timestamptz not null,
  home_score    int check (home_score >= 0),
  away_score    int check (away_score >= 0),
  status        text not null default 'scheduled' check (status in ('scheduled','finished')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, match_no)
);

create index if not exists idx_wc_matches_ws
  on app_nha_tien_tri.matches (workspace_id);
create index if not exists idx_wc_matches_ws_kick
  on app_nha_tien_tri.matches (workspace_id, kickoff_at);

grant select, insert, update, delete on app_nha_tien_tri.matches to authenticated;
alter table app_nha_tien_tri.matches enable row level security;

drop policy if exists "matches_select" on app_nha_tien_tri.matches;
create policy "matches_select" on app_nha_tien_tri.matches
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

-- Same recovery path for long-term picks and app config when the legacy
-- all-in-one schema migration was not applied to the target schema.
-- @realtime
create table if not exists app_nha_tien_tri.long_term_bets (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references auth.users(id),
  champion      text check (char_length(champion) <= 60),
  top_scorer    text check (char_length(top_scorer) <= 80),
  shock_team    text check (char_length(shock_team) <= 60),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, created_by)
);

create index if not exists idx_wc_ltb_ws
  on app_nha_tien_tri.long_term_bets (workspace_id);

grant select, insert, update, delete on app_nha_tien_tri.long_term_bets to authenticated;
alter table app_nha_tien_tri.long_term_bets enable row level security;

create table if not exists app_nha_tien_tri.app_config (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  created_by         uuid not null references auth.users(id),
  opening_kickoff_at timestamptz,
  champion_actual    text,
  top_scorer_actual  text,
  shock_team_actual  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (workspace_id)
);

create index if not exists idx_wc_cfg_ws
  on app_nha_tien_tri.app_config (workspace_id);

grant select, insert, update, delete on app_nha_tien_tri.app_config to authenticated;
alter table app_nha_tien_tri.app_config enable row level security;

drop policy if exists "app_config_select" on app_nha_tien_tri.app_config;
create policy "app_config_select" on app_nha_tien_tri.app_config
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

-- Allow persisted predictions/results for the complete 104-match tournament.
alter table app_nha_tien_tri.group_predictions
  drop constraint if exists group_predictions_match_no_check;
alter table app_nha_tien_tri.group_predictions
  add constraint group_predictions_match_no_check check (match_no between 1 and 104);

alter table app_nha_tien_tri.group_match_results
  drop constraint if exists group_match_results_match_no_check;
alter table app_nha_tien_tri.group_match_results
  add constraint group_match_results_match_no_check check (match_no between 1 and 104);

alter table app_nha_tien_tri.matches
  add column if not exists result_source text,
  add column if not exists finish_type text,
  add column if not exists status_detail text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references auth.users(id);

alter table app_nha_tien_tri.app_config
  add column if not exists predictions_hidden_until_kickoff boolean not null default true,
  add column if not exists reminders_enabled boolean not null default true,
  add column if not exists last_recap_sent_at timestamptz;

create table if not exists app_nha_tien_tri.admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references auth.users(id),
  action        text not null check (char_length(action) between 3 and 80),
  entity_type   text not null check (char_length(entity_type) between 2 and 40),
  entity_key    text not null check (char_length(entity_key) between 1 and 120),
  before_data   jsonb,
  after_data    jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_wc_admin_audit_workspace_time
  on app_nha_tien_tri.admin_audit_log (workspace_id, created_at desc);

grant select, insert on app_nha_tien_tri.admin_audit_log to authenticated;
alter table app_nha_tien_tri.admin_audit_log enable row level security;

drop policy if exists "admin_audit_select" on app_nha_tien_tri.admin_audit_log;
create policy "admin_audit_select" on app_nha_tien_tri.admin_audit_log
for select using (app_nha_tien_tri.can_manage_group_results(workspace_id));

drop policy if exists "admin_audit_insert" on app_nha_tien_tri.admin_audit_log;
create policy "admin_audit_insert" on app_nha_tien_tri.admin_audit_log
for insert with check (
  app_nha_tien_tri.can_manage_group_results(workspace_id)
  and created_by = auth.uid()
);

-- Tournament schedule and official snapshots are BTC-managed only.
drop policy if exists "matches_insert" on app_nha_tien_tri.matches;
create policy "matches_insert" on app_nha_tien_tri.matches
for insert with check (app_nha_tien_tri.can_manage_group_results(workspace_id));

drop policy if exists "matches_update" on app_nha_tien_tri.matches;
create policy "matches_update" on app_nha_tien_tri.matches
for update using (app_nha_tien_tri.can_manage_group_results(workspace_id))
with check (app_nha_tien_tri.can_manage_group_results(workspace_id));

drop policy if exists "matches_delete" on app_nha_tien_tri.matches;
create policy "matches_delete" on app_nha_tien_tri.matches
for delete using (app_nha_tien_tri.can_manage_group_results(workspace_id));

drop policy if exists "app_config_insert" on app_nha_tien_tri.app_config;
create policy "app_config_insert" on app_nha_tien_tri.app_config
for insert with check (app_nha_tien_tri.can_manage_group_results(workspace_id));

drop policy if exists "app_config_update" on app_nha_tien_tri.app_config;
create policy "app_config_update" on app_nha_tien_tri.app_config
for update using (app_nha_tien_tri.can_manage_group_results(workspace_id))
with check (app_nha_tien_tri.can_manage_group_results(workspace_id));

-- Users may see their own pick immediately. Other picks become visible only
-- after kickoff. If the runtime schedule has not been synced yet, privacy wins.
drop policy if exists "group_predictions_select" on app_nha_tien_tri.group_predictions;
create policy "group_predictions_select" on app_nha_tien_tri.group_predictions
for select using (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and (
    created_by = auth.uid()
    or exists (
      select 1
      from app_nha_tien_tri.matches m
      where m.workspace_id = group_predictions.workspace_id
        and m.match_no = group_predictions.match_no
        and m.kickoff_at <= now()
    )
  )
);

drop policy if exists "group_predictions_insert" on app_nha_tien_tri.group_predictions;
create policy "group_predictions_insert" on app_nha_tien_tri.group_predictions
for insert with check (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
);

drop policy if exists "group_predictions_update" on app_nha_tien_tri.group_predictions;
create policy "group_predictions_update" on app_nha_tien_tri.group_predictions
for update using (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
) with check (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
);

create or replace function app_nha_tien_tri.enforce_prediction_deadline()
returns trigger
language plpgsql
as $$
declare
  v_kickoff timestamptz;
begin
  select kickoff_at into v_kickoff
  from app_nha_tien_tri.matches
  where workspace_id = new.workspace_id and match_no = new.match_no;

  if v_kickoff is null then
    raise exception 'Tournament schedule is not synced for match %', new.match_no;
  end if;
  if now() >= v_kickoff - interval '15 minutes' then
    raise exception 'Prediction deadline has passed for match %', new.match_no;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wc_prediction_deadline on app_nha_tien_tri.group_predictions;
create trigger trg_wc_prediction_deadline
before insert or update on app_nha_tien_tri.group_predictions
for each row execute function app_nha_tien_tri.enforce_prediction_deadline();

-- Long-term picks follow the same rule, using the configured opening kickoff.
drop policy if exists "long_term_bets_select" on app_nha_tien_tri.long_term_bets;
create policy "long_term_bets_select" on app_nha_tien_tri.long_term_bets
for select using (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and (
    created_by = auth.uid()
    or exists (
      select 1 from app_nha_tien_tri.app_config c
      where c.workspace_id = long_term_bets.workspace_id
        and c.opening_kickoff_at <= now()
    )
  )
);

drop policy if exists "long_term_bets_insert" on app_nha_tien_tri.long_term_bets;
create policy "long_term_bets_insert" on app_nha_tien_tri.long_term_bets
for insert with check (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
);

drop policy if exists "long_term_bets_update" on app_nha_tien_tri.long_term_bets;
create policy "long_term_bets_update" on app_nha_tien_tri.long_term_bets
for update using (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
) with check (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
);

create or replace function app_nha_tien_tri.enforce_long_term_deadline()
returns trigger
language plpgsql
as $$
declare
  v_opening timestamptz;
begin
  select opening_kickoff_at into v_opening
  from app_nha_tien_tri.app_config
  where workspace_id = new.workspace_id;

  if v_opening is null then
    raise exception 'Tournament opening kickoff is not configured';
  end if;
  if now() >= v_opening then
    raise exception 'Long-term prediction deadline has passed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wc_long_term_deadline on app_nha_tien_tri.long_term_bets;
create trigger trg_wc_long_term_deadline
before insert or update on app_nha_tien_tri.long_term_bets
for each row execute function app_nha_tien_tri.enforce_long_term_deadline();

create or replace function app_nha_tien_tri.list_missing_prediction_users(
  p_workspace_id uuid,
  p_match_no int
) returns table(user_id uuid)
language sql
security definer
set search_path = public, app_nha_tien_tri
as $$
  select wm.user_id
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and app_nha_tien_tri.can_manage_group_results(p_workspace_id)
    and not exists (
      select 1 from app_nha_tien_tri.group_predictions gp
      where gp.workspace_id = p_workspace_id
        and gp.created_by = wm.user_id
        and gp.match_no = p_match_no
    );
$$;

revoke all on function app_nha_tien_tri.list_missing_prediction_users(uuid, int) from public;
grant execute on function app_nha_tien_tri.list_missing_prediction_users(uuid, int) to authenticated;
