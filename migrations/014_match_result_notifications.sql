-- =====================================================================
-- Nha Tien Tri - match result push notification log.
-- Submit through Admin Portal Migration Reviewer. Reviewer duplicates dev.
-- =====================================================================

create table if not exists app_nha_tien_tri.match_result_notification_log (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  created_by         uuid not null references auth.users(id),
  match_no           int not null check (match_no between 1 and 104),
  target_user_id     uuid not null references auth.users(id) on delete cascade,
  result_status      text not null check (result_status in ('correct','wrong')),
  points             int not null default 0,
  notification_kind  text not null default 'match_result_scored',
  sent_at            timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (workspace_id, match_no, target_user_id, notification_kind)
);

create index if not exists idx_wc_match_result_notif_ws_match
  on app_nha_tien_tri.match_result_notification_log (workspace_id, match_no);
create index if not exists idx_wc_match_result_notif_user_time
  on app_nha_tien_tri.match_result_notification_log (workspace_id, target_user_id, sent_at desc);

grant select, insert on app_nha_tien_tri.match_result_notification_log to authenticated;
alter table app_nha_tien_tri.match_result_notification_log enable row level security;

drop policy if exists "match_result_notification_log_select" on app_nha_tien_tri.match_result_notification_log;
create policy "match_result_notification_log_select" on app_nha_tien_tri.match_result_notification_log
for select using (app_nha_tien_tri.can_manage_group_results(workspace_id));

drop policy if exists "match_result_notification_log_insert" on app_nha_tien_tri.match_result_notification_log;
create policy "match_result_notification_log_insert" on app_nha_tien_tri.match_result_notification_log
for insert with check (
  app_nha_tien_tri.can_manage_group_results(workspace_id)
  and created_by = auth.uid()
);
