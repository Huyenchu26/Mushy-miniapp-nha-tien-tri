-- =====================================================================
-- Nha Tien Tri World Cup 2026 - match prediction room messages.
--
-- Slug: nha-tien-tri -> schema app_nha_tien_tri.
-- The Mushy migration reviewer duplicates this migration to the dev schema.
-- Submit via Admin Portal Migration Reviewer, do not run directly in SQL Editor.
-- =====================================================================

-- @realtime
create table if not exists app_nha_tien_tri.match_room_messages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references auth.users(id),
  match_no      int not null check (match_no between 1 and 72),
  kind          text not null default 'chat' check (kind in ('chat', 'reaction', 'challenge')),
  body          text not null check (char_length(body) between 1 and 280),
  emoji         text check (emoji is null or char_length(emoji) between 1 and 8),
  created_at    timestamptz not null default now()
);

create index if not exists idx_wc_match_room_messages_workspace
  on app_nha_tien_tri.match_room_messages (workspace_id);
create index if not exists idx_wc_match_room_messages_match_time
  on app_nha_tien_tri.match_room_messages (workspace_id, match_no, created_at desc);
create index if not exists idx_wc_match_room_messages_user_time
  on app_nha_tien_tri.match_room_messages (workspace_id, created_by, created_at desc);

grant select, insert, update, delete on app_nha_tien_tri.match_room_messages to authenticated;
alter table app_nha_tien_tri.match_room_messages enable row level security;

drop policy if exists "match_room_messages_select" on app_nha_tien_tri.match_room_messages;
create policy "match_room_messages_select" on app_nha_tien_tri.match_room_messages
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "match_room_messages_insert" on app_nha_tien_tri.match_room_messages;
create policy "match_room_messages_insert" on app_nha_tien_tri.match_room_messages
for insert with check (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
);

drop policy if exists "match_room_messages_update" on app_nha_tien_tri.match_room_messages;
create policy "match_room_messages_update" on app_nha_tien_tri.match_room_messages
for update using (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
) with check (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
);

drop policy if exists "match_room_messages_delete" on app_nha_tien_tri.match_room_messages;
create policy "match_room_messages_delete" on app_nha_tien_tri.match_room_messages
for delete using (
  public.is_owner_workspace_member(workspace_id)
  or created_by = auth.uid()
);
