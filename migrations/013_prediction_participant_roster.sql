-- =====================================================================
-- Nha Tien Tri World Cup 2026 - public participant roster for match cards.
--
-- Returns only who has submitted a prediction for each match, not the score.
-- This lets match cards show participation before the viewer saves their own
-- pick while keeping group_predictions score visibility policy unchanged.
-- =====================================================================

create or replace function app_nha_tien_tri.list_group_prediction_participants(
  p_workspace_id uuid
)
returns table (
  match_no int,
  user_id uuid,
  predicted_at timestamptz
)
language sql
security definer
stable
set search_path = app_nha_tien_tri, public
as $$
  select
    gp.match_no,
    gp.created_by as user_id,
    max(coalesce(gp.updated_at, gp.created_at)) as predicted_at
  from app_nha_tien_tri.group_predictions gp
  where gp.workspace_id = p_workspace_id
    and auth.uid() is not null
    and public.can_access_app_data(p_workspace_id, 'nha-tien-tri')
  group by gp.match_no, gp.created_by;
$$;

revoke all on function app_nha_tien_tri.list_group_prediction_participants(uuid) from public;
grant execute on function app_nha_tien_tri.list_group_prediction_participants(uuid) to authenticated;
