-- =====================================================================
-- Nha Tien Tri - official answers for shared daily questions.
-- Submit through Admin Portal Migration Reviewer. Reviewer duplicates dev.
-- =====================================================================

alter table app_nha_tien_tri.app_config
  add column if not exists daily_question_answers jsonb not null default '{}'::jsonb;

