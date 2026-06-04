-- =====================================================================
-- Mini-app "Nhà Tiên Tri" (dự đoán World Cup 2026) — slug: nha-tien-tri → schema app_nha_tien_tri
--
-- Migration Reviewer tự duplicate sang schema dev. File này chỉ ref
-- schema production canonical `app_nha_tien_tri`.
-- ⚠️ Submit qua Admin Portal Migration Reviewer, KHÔNG chạy thẳng SQL Editor.
--
-- 6 bảng: matches, predictions, long_term_bets, daily_questions,
--         daily_answers, app_config.
-- Mỗi bảng: workspace_id + created_by + RLS 4 policy theo convention template
-- (can_access_app_data cho select/insert/update, is_owner_workspace_member
--  cho delete). App slug LITERAL 'nha-tien-tri' trong policy.
-- =====================================================================

-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ Helper: trigger updated_at dùng chung cho mọi bảng                ║
-- ╚═══════════════════════════════════════════════════════════════════╝
create or replace function app_nha_tien_tri.set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ─────────────────────────────────────────────────────────────────────
-- 1) matches — 104 trận của giải (admin nạp lịch + nhập kết quả 90')
-- ─────────────────────────────────────────────────────────────────────
-- @realtime
create table if not exists app_nha_tien_tri.matches (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references auth.users(id),
  match_no      int  not null check (match_no between 1 and 104),
  stage         text not null check (stage in ('group','r32','r16','qf','sf','third','final')),
  group_label   text,                              -- 'A'..'L' (chỉ vòng bảng)
  home_team     text not null check (char_length(home_team) between 1 and 60),
  away_team     text not null check (char_length(away_team) between 1 and 60),
  kickoff_at    timestamptz not null,
  home_score    int check (home_score >= 0),       -- tỉ số 90' chính thức
  away_score    int check (away_score >= 0),
  status        text not null default 'scheduled' check (status in ('scheduled','finished')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, match_no)
);

create index if not exists idx_wc_matches_ws       on app_nha_tien_tri.matches (workspace_id);
create index if not exists idx_wc_matches_ws_kick  on app_nha_tien_tri.matches (workspace_id, kickoff_at);

grant select, insert, update, delete on app_nha_tien_tri.matches to authenticated;
alter table app_nha_tien_tri.matches enable row level security;

drop policy if exists "matches_select" on app_nha_tien_tri.matches;
create policy "matches_select" on app_nha_tien_tri.matches
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "matches_insert" on app_nha_tien_tri.matches;
create policy "matches_insert" on app_nha_tien_tri.matches
for insert with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "matches_update" on app_nha_tien_tri.matches;
create policy "matches_update" on app_nha_tien_tri.matches
for update using (public.can_access_app_data(workspace_id, 'nha-tien-tri'))
with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "matches_delete" on app_nha_tien_tri.matches;
create policy "matches_delete" on app_nha_tien_tri.matches
for delete using (public.is_owner_workspace_member(workspace_id));

drop trigger if exists trg_wc_matches_updated on app_nha_tien_tri.matches;
create trigger trg_wc_matches_updated before update on app_nha_tien_tri.matches
  for each row execute function app_nha_tien_tri.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 2) predictions — dự đoán tỉ số mỗi trận của từng người chơi
-- ─────────────────────────────────────────────────────────────────────
-- @realtime
create table if not exists app_nha_tien_tri.predictions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references auth.users(id),
  match_id      uuid not null references app_nha_tien_tri.matches(id) on delete cascade,
  home_pred     int  not null check (home_pred between 0 and 99),
  away_pred     int  not null check (away_pred between 0 and 99),
  double_down   boolean not null default false,    -- "kèo tủ" x2 (1 trận/vòng)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, created_by, match_id)
);

create index if not exists idx_wc_pred_ws        on app_nha_tien_tri.predictions (workspace_id);
create index if not exists idx_wc_pred_ws_match  on app_nha_tien_tri.predictions (workspace_id, match_id);
create index if not exists idx_wc_pred_ws_user   on app_nha_tien_tri.predictions (workspace_id, created_by);

grant select, insert, update, delete on app_nha_tien_tri.predictions to authenticated;
alter table app_nha_tien_tri.predictions enable row level security;

drop policy if exists "predictions_select" on app_nha_tien_tri.predictions;
create policy "predictions_select" on app_nha_tien_tri.predictions
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "predictions_insert" on app_nha_tien_tri.predictions;
create policy "predictions_insert" on app_nha_tien_tri.predictions
for insert with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "predictions_update" on app_nha_tien_tri.predictions;
create policy "predictions_update" on app_nha_tien_tri.predictions
for update using (public.can_access_app_data(workspace_id, 'nha-tien-tri'))
with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "predictions_delete" on app_nha_tien_tri.predictions;
create policy "predictions_delete" on app_nha_tien_tri.predictions
for delete using (public.is_owner_workspace_member(workspace_id));

drop trigger if exists trg_wc_pred_updated on app_nha_tien_tri.predictions;
create trigger trg_wc_pred_updated before update on app_nha_tien_tri.predictions
  for each row execute function app_nha_tien_tri.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 3) long_term_bets — cược dài hạn khoá từ đầu giải (1 dòng/người)
-- ─────────────────────────────────────────────────────────────────────
-- @realtime
create table if not exists app_nha_tien_tri.long_term_bets (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references auth.users(id),
  champion      text check (char_length(champion)  <= 60),  -- Vô địch (20đ)
  top_scorer    text check (char_length(top_scorer) <= 80), -- Vua phá lưới (10đ)
  shock_team    text check (char_length(shock_team) <= 60), -- Đội gây sốc (10đ)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, created_by)
);

create index if not exists idx_wc_ltb_ws on app_nha_tien_tri.long_term_bets (workspace_id);

grant select, insert, update, delete on app_nha_tien_tri.long_term_bets to authenticated;
alter table app_nha_tien_tri.long_term_bets enable row level security;

drop policy if exists "long_term_bets_select" on app_nha_tien_tri.long_term_bets;
create policy "long_term_bets_select" on app_nha_tien_tri.long_term_bets
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "long_term_bets_insert" on app_nha_tien_tri.long_term_bets;
create policy "long_term_bets_insert" on app_nha_tien_tri.long_term_bets
for insert with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "long_term_bets_update" on app_nha_tien_tri.long_term_bets;
create policy "long_term_bets_update" on app_nha_tien_tri.long_term_bets
for update using (public.can_access_app_data(workspace_id, 'nha-tien-tri'))
with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "long_term_bets_delete" on app_nha_tien_tri.long_term_bets;
create policy "long_term_bets_delete" on app_nha_tien_tri.long_term_bets
for delete using (public.is_owner_workspace_member(workspace_id));

drop trigger if exists trg_wc_ltb_updated on app_nha_tien_tri.long_term_bets;
create trigger trg_wc_ltb_updated before update on app_nha_tien_tri.long_term_bets
  for each row execute function app_nha_tien_tri.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 4) daily_questions — câu đố vui mỗi ngày (admin tạo + chốt đáp án)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists app_nha_tien_tri.daily_questions (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  created_by     uuid not null references auth.users(id),
  q_date         date not null,
  prompt         text not null check (char_length(prompt) between 1 and 280),
  options        jsonb,                              -- optional: ["Chẵn","Lẻ"]
  correct_answer text,                               -- null = chưa chốt
  points         int  not null default 2 check (points between 1 and 20),
  closes_at      timestamptz,                        -- hết hạn trả lời
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_wc_dq_ws      on app_nha_tien_tri.daily_questions (workspace_id);
create index if not exists idx_wc_dq_ws_date on app_nha_tien_tri.daily_questions (workspace_id, q_date desc);

grant select, insert, update, delete on app_nha_tien_tri.daily_questions to authenticated;
alter table app_nha_tien_tri.daily_questions enable row level security;

drop policy if exists "daily_questions_select" on app_nha_tien_tri.daily_questions;
create policy "daily_questions_select" on app_nha_tien_tri.daily_questions
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "daily_questions_insert" on app_nha_tien_tri.daily_questions;
create policy "daily_questions_insert" on app_nha_tien_tri.daily_questions
for insert with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "daily_questions_update" on app_nha_tien_tri.daily_questions;
create policy "daily_questions_update" on app_nha_tien_tri.daily_questions
for update using (public.can_access_app_data(workspace_id, 'nha-tien-tri'))
with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "daily_questions_delete" on app_nha_tien_tri.daily_questions;
create policy "daily_questions_delete" on app_nha_tien_tri.daily_questions
for delete using (public.is_owner_workspace_member(workspace_id));

drop trigger if exists trg_wc_dq_updated on app_nha_tien_tri.daily_questions;
create trigger trg_wc_dq_updated before update on app_nha_tien_tri.daily_questions
  for each row execute function app_nha_tien_tri.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 5) daily_answers — trả lời câu đố vui của người chơi
-- ─────────────────────────────────────────────────────────────────────
-- @realtime
create table if not exists app_nha_tien_tri.daily_answers (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  created_by    uuid not null references auth.users(id),
  question_id   uuid not null references app_nha_tien_tri.daily_questions(id) on delete cascade,
  answer        text not null check (char_length(answer) between 1 and 280),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, created_by, question_id)
);

create index if not exists idx_wc_da_ws    on app_nha_tien_tri.daily_answers (workspace_id);
create index if not exists idx_wc_da_ws_q  on app_nha_tien_tri.daily_answers (workspace_id, question_id);

grant select, insert, update, delete on app_nha_tien_tri.daily_answers to authenticated;
alter table app_nha_tien_tri.daily_answers enable row level security;

drop policy if exists "daily_answers_select" on app_nha_tien_tri.daily_answers;
create policy "daily_answers_select" on app_nha_tien_tri.daily_answers
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "daily_answers_insert" on app_nha_tien_tri.daily_answers;
create policy "daily_answers_insert" on app_nha_tien_tri.daily_answers
for insert with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "daily_answers_update" on app_nha_tien_tri.daily_answers;
create policy "daily_answers_update" on app_nha_tien_tri.daily_answers
for update using (public.can_access_app_data(workspace_id, 'nha-tien-tri'))
with check (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "daily_answers_delete" on app_nha_tien_tri.daily_answers;
create policy "daily_answers_delete" on app_nha_tien_tri.daily_answers
for delete using (public.is_owner_workspace_member(workspace_id));

drop trigger if exists trg_wc_da_updated on app_nha_tien_tri.daily_answers;
create trigger trg_wc_da_updated before update on app_nha_tien_tri.daily_answers
  for each row execute function app_nha_tien_tri.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 6) app_config — cấu hình giải + đáp án cược dài hạn (1 dòng/workspace)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists app_nha_tien_tri.app_config (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  created_by         uuid not null references auth.users(id),
  opening_kickoff_at timestamptz,            -- mốc khoá cược dài hạn (giờ trận khai mạc)
  champion_actual    text,                   -- đáp án Vô địch (BTC chốt cuối giải)
  top_scorer_actual  text,                   -- đáp án Vua phá lưới
  shock_team_actual  text,                   -- đáp án Đội gây sốc
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
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

drop trigger if exists trg_wc_cfg_updated on app_nha_tien_tri.app_config;
create trigger trg_wc_cfg_updated before update on app_nha_tien_tri.app_config
  for each row execute function app_nha_tien_tri.set_updated_at();
