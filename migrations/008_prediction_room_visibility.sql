-- =====================================================================
-- Nha Tien Tri World Cup 2026 - prediction room visibility.
--
-- Problem:
--   Migration 007 made group_predictions_select private until kickoff.
--   That protects picks, but it also makes the production prediction room
--   look empty because RLS filters out other members' rows.
--
-- Fix:
--   Keep cross-workspace access scoped by public.can_access_app_data.
--   Let a user see other picks for a match after they have submitted their
--   own pick for that same match. Rows also stay visible after prediction
--   lock, so historical rooms work even for users who did not play.
-- =====================================================================

create or replace function app_nha_tien_tri.has_group_prediction_for_match(
  p_workspace_id uuid,
  p_match_no int
)
returns boolean
language sql
security definer
stable
set search_path = app_nha_tien_tri, public
as $$
  select exists (
    select 1
    from app_nha_tien_tri.group_predictions gp
    where gp.workspace_id = p_workspace_id
      and gp.match_no = p_match_no
      and gp.created_by = auth.uid()
  );
$$;

grant execute on function app_nha_tien_tri.has_group_prediction_for_match(uuid, int)
to authenticated;

drop policy if exists "group_predictions_select" on app_nha_tien_tri.group_predictions;
create policy "group_predictions_select" on app_nha_tien_tri.group_predictions
for select using (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and (
    created_by = auth.uid()
    or app_nha_tien_tri.has_group_prediction_for_match(workspace_id, match_no)
    or exists (
      select 1
      from app_nha_tien_tri.matches m
      where m.workspace_id = group_predictions.workspace_id
        and m.match_no = group_predictions.match_no
        and now() >= m.kickoff_at - interval '15 minutes'
    )
  )
);
