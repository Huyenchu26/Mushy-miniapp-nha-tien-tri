### 1. Overview & Status
- **Objective:** Mini-app du doan World Cup 2026 cho Mushy workspace, gom du doan ti so tran dau, cau hoi theo ngay, du doan dai han, phong binh luan, bang xep hang, admin operations, va live score.
- **System Status:** `[ IN PROGRESS ]`

### 2. Environment & External Services
- **Tech Stack:** JavaScript, React 18, Vite 5, Supabase JS v2, Vercel Serverless Functions, Lucide React, PostHog.
- **External Services:**
  - `Supabase` (DB schema app-specific, auth via injected JWT, realtime, RLS-backed storage/queries)
  - `Vercel Functions` (API surface in `api/` for auth-verified server-side logic)
  - `OpenRouter` (AI match insight generation in `api/match-insight.js`; requires `OPENROUTER_API_KEY`)
  - `worldcup26.ir` (primary free live-score source in `api/live-scores.js`)
  - `ESPN scoreboard API` (fallback live-score source in `api/live-scores.js`)
  - `PostHog` (analytics wrapper in `src/lib/analytics.js`; local dev skips by default)
- **Env Variables (No Secrets):** [`VITE_APP_ENV`, `VITE_USE_R2`, `VITE_DEV_TOKEN`, `VITE_DEV_WORKSPACE_ID`, `VITE_DEV_USER_ID`, `VITE_DEV_ROLE`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_POSTHOG_DEBUG`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_SITE_URL`, `OPENROUTER_APP_TITLE`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`]

### 3. Entry Point & Testing
- **Entry File:** `src/main.jsx`
- **Run/Test Cmd:** `npm run dev`, `npm run build`, `npm test`

### 4. Architecture & Flow
- **Core Flow:** `Mushy Shell/App Context -> src/lib/context.js -> src/App.jsx -> Supabase app schema/API routes -> UI state / scoreboard / room / admin tools`
- **Data Flow:** `Static match + quiz datasets -> runtime merge with Supabase matches/app_config/predictions -> optional live-score enrichment -> scoring/leaderboard/prediction room render -> persist updates back to Supabase`
- **Rules:** Query app data through schema-scoped `db`; use workspace-scoped reads/writes; admin tools flow through `src/components/TournamentAdmin.jsx` + `src/lib/app/tournament-service.js`; long-term predictions now lock before playoff via `getLongTermLockAt()` in `src/App.jsx`; live score polling is currently every 3 minutes from `src/App.jsx`; tests exist for scoring/quiz/AI parsing but `npm test` is currently blocked in this environment by `spawn EPERM`.

### 5. Progress (State: Implemented vs Planned)
**✅ Completed (Implemented):**
- Main mini-app shell, tab navigation, match cards, daily questions, long-term card, leaderboard, rules, and prediction room are implemented in `src/App.jsx`.
- Supabase runtime state loading and admin tournament sync/config/result flows are implemented in `src/lib/app/tournament-service.js` and `src/components/TournamentAdmin.jsx`.
- Serverless live score proxy with primary/fallback providers is implemented in `api/live-scores.js`.
- Match AI insight generation, cache, quota, and validation are implemented in `api/match-insight.js` and `src/lib/app/match-insight.js`.
- Core schema/migrations for predictions, results, room messages, AI insights, tournament ops, and visibility rules exist in `migrations/002_nha_tien_tri_schema.sql` through `migrations/008_prediction_room_visibility.sql`.
- Recent UI changes include responsive notification bell handling, saved-prediction card state, compact team labels, and custom select behavior in `src/App.jsx`, `src/App.css`, and `src/components/Select.jsx`.

**🚧 Intention / In Progress (WIP & Planned):**
- UI is still being actively trimmed and refined in `src/App.jsx` / `src/App.css`; current worktree has uncommitted frontend changes.
- `work.md` did not previously exist; this file is the first formal handoff snapshot.
- Automated tests need rerun in an environment that allows Node test child-process spawning; current `npm test` result is inconclusive for application correctness.
- Long-term playoff lock currently lives in frontend helper logic `src/App.jsx`; if the rule must be DB-enforced, `src/lib/app/tournament-service.js` plus migrations may need follow-up.

### 6. Changelog
*(Keep only the 5-10 most recent changes. Always replace YYYY-MM-DD with the actual current date)*
- `[2026-06-11]` [IN PROGRESS] Added `work.md` handoff context based on current repo inspection and command verification.
- `[2026-06-11]` [IN PROGRESS] Frontend iteration in `src/App.jsx` and `src/App.css` removed the hero CTA button and continued trimming non-essential UI text/actions.
- `[2026-06-11]` [IN PROGRESS] Notification bell sizing/placement was made more responsive in `src/App.css` to reduce mobile overflow risk.
- `[2026-06-11]` [IN PROGRESS] Long-term prediction locking was shifted to pre-playoff timing in `src/App.jsx` via `getLongTermLockAt()`.
- `[2026-06-11]` [IN PROGRESS] Saved prediction cards and compact team-name rendering were updated in `src/App.jsx` and `src/App.css`.
- `[2026-06-11]` [STABLE] `npm run build` completed successfully.
- `[2026-06-11]` [IN PROGRESS] `npm test` failed due to environment-level `spawn EPERM`, affecting `src/lib/app/scoring.test.js`, `src/lib/app/match-insight.test.js`, and `src/lib/app/quiz-data.test.js`.

### 7. Current Focus
- **Problem:** The repo is mid-iteration on prediction-card and room UI polish, and automated test execution is currently blocked by environment permissions rather than assertion failures.
- **Next Action:** Continue UI cleanup in `src/App.jsx` / `src/App.css`, then rerun `npm test` in a shell that permits Node child-process spawning and verify long-term playoff lock behavior against real match data.
