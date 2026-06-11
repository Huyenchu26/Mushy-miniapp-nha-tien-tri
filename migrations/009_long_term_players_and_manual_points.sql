-- =====================================================================
-- Nha Tien Tri - long-term player awards and manual point adjustments.
-- Submit through Admin Portal Migration Reviewer. Reviewer duplicates dev.
-- =====================================================================

alter table app_nha_tien_tri.long_term_bets
  add column if not exists young_player text,
  add column if not exists golden_ball text;

alter table app_nha_tien_tri.long_term_bets
  drop constraint if exists long_term_bets_top_scorer_check,
  drop constraint if exists long_term_bets_young_player_check,
  drop constraint if exists long_term_bets_golden_ball_check;

alter table app_nha_tien_tri.long_term_bets
  add constraint long_term_bets_top_scorer_check check (char_length(top_scorer) <= 120),
  add constraint long_term_bets_young_player_check check (char_length(young_player) <= 120),
  add constraint long_term_bets_golden_ball_check check (char_length(golden_ball) <= 120);

alter table app_nha_tien_tri.app_config
  add column if not exists young_player_actual text,
  add column if not exists golden_ball_actual text;

-- @realtime
create table if not exists app_nha_tien_tri.manual_point_adjustments (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  created_by     uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  delta_points   int not null check (delta_points between -999 and 999 and delta_points <> 0),
  reason         text check (char_length(reason) <= 180),
  created_at     timestamptz not null default now()
);

create index if not exists idx_wc_manual_points_ws_time
  on app_nha_tien_tri.manual_point_adjustments (workspace_id, created_at desc);
create index if not exists idx_wc_manual_points_target
  on app_nha_tien_tri.manual_point_adjustments (workspace_id, target_user_id);

grant select, insert, delete on app_nha_tien_tri.manual_point_adjustments to authenticated;
alter table app_nha_tien_tri.manual_point_adjustments enable row level security;

drop policy if exists "manual_points_select" on app_nha_tien_tri.manual_point_adjustments;
create policy "manual_points_select" on app_nha_tien_tri.manual_point_adjustments
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "manual_points_insert" on app_nha_tien_tri.manual_point_adjustments;
create policy "manual_points_insert" on app_nha_tien_tri.manual_point_adjustments
for insert with check (
  app_nha_tien_tri.can_manage_group_results(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists "manual_points_delete" on app_nha_tien_tri.manual_point_adjustments;
create policy "manual_points_delete" on app_nha_tien_tri.manual_point_adjustments
for delete using (app_nha_tien_tri.can_manage_group_results(workspace_id));

create or replace function app_nha_tien_tri.enforce_long_term_deadline()
returns trigger
language plpgsql
as $$
declare
  v_lock_at timestamptz;
begin
  select min(kickoff_at) into v_lock_at
  from app_nha_tien_tri.matches
  where workspace_id = new.workspace_id
    and stage <> 'group';

  if v_lock_at is null then
    select opening_kickoff_at into v_lock_at
    from app_nha_tien_tri.app_config
    where workspace_id = new.workspace_id;
  end if;

  if v_lock_at is null then
    raise exception 'Tournament long-term deadline is not configured';
  end if;
  if now() >= v_lock_at then
    raise exception 'Long-term prediction deadline has passed before play-off';
  end if;
  return new;
end;
$$;
