### 1. Overview & Status
- **Objective:** Mini-app du doan World Cup 2026 cho Mushy workspace: du doan ti so, cau hoi theo ngay, cau do vui, du doan dai han, phong binh luan, BXH, admin operations, va live score.
- **System Status:** `[ IN PROGRESS ]`

### 2. Environment & External Services
- **Tech Stack:** JavaScript, React 18, Vite 5, Supabase JS v2, Vercel Serverless Functions, Lucide React, PostHog.
- **External Services:**
  - `Supabase` (app schema, auth via injected JWT, realtime, RLS-backed queries)
  - `Vercel Functions` (API routes in `api/`)
  - `OpenRouter` (AI match insight generation in `api/match-insight.js`)
  - `worldcup26.ir` (primary live-score source in `api/live-scores.js`)
  - `ESPN scoreboard API` (fallback live-score source in `api/live-scores.js`)
  - `PostHog` (analytics wrapper in `src/lib/analytics.js`)
- **Env Variables (No Secrets):** [`VITE_APP_ENV`, `VITE_USE_R2`, `VITE_DEV_TOKEN`, `VITE_DEV_WORKSPACE_ID`, `VITE_DEV_USER_ID`, `VITE_DEV_ROLE`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_POSTHOG_DEBUG`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_SITE_URL`, `OPENROUTER_APP_TITLE`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`]

### 3. Entry Point & Testing
- **Entry File:** `src/main.jsx`
- **Run/Test Cmd:** `npm run dev`, `npm run build`, `npm test`

### 4. Architecture & Flow
- **Core Flow:** `Mushy Shell/App Context -> src/lib/context.js -> src/App.jsx -> Supabase app schema/API routes -> UI state / scoreboard / room / admin tools`
- **Data Flow:** `Static match + quiz datasets -> merge with Supabase matches/app_config/predictions/answers/manual adjustments -> optional live-score enrichment -> scoring/leaderboard/prediction room render -> persist updates back to Supabase`
- **Rules:** Query app data through schema-scoped `db`; use workspace-scoped reads/writes; admin tools flow through `src/components/TournamentAdmin.jsx` + `src/lib/app/tournament-service.js`; long-term predictions lock before playoff via `getLongTermLockAt()` in `src/App.jsx`; daily question answers score only after question lock time; realtime tables require Admin Portal migration reviewer marker handling.

### 5. Progress (State: Implemented vs Planned)
**Completed (Implemented):**
- Main mini-app shell, tab navigation, match cards, daily questions, long-term card, leaderboard, rules, prediction room, and admin panel are implemented in `src/App.jsx` and `src/components/TournamentAdmin.jsx`.
- Supabase runtime loading and admin tournament sync/config/result flows are implemented in `src/lib/app/tournament-service.js`.
- Live score fallback merges primary WorldCup26 data with ESPN per match in `api/live-scores.js`, with per-match source labels consumed by `src/App.jsx`.
- Daily question match days now derive from the old pre-kickoff lock point and lock at `00:00` Vietnam time for the match day in `src/lib/app/worldcup-data.js`.
- Daily question scoring waits until lock time before revealing BTC answers or adding `dailyPts` to BXH in `src/lib/app/scoring.js` and `src/App.jsx`.
- Tournament realtime refresh now re-fetches player daily answers when `app_config` or `group_daily_answers` changes in `src/App.jsx`; fallback polling also refreshes answers.
- Migration `migrations/012_group_daily_answers_realtime.sql` enables reviewer-managed realtime publication for player daily answer changes.

**Intention / In Progress (WIP & Planned):**
- Submit `migrations/012_group_daily_answers_realtime.sql` through the Mushy Admin Portal reviewer before `group_daily_answers` emits realtime events in shared environments.
- Confirm `migrations/011_app_config_realtime.sql` has been applied in the target environment for instant BTC answer sync; `src/App.jsx` still has 60s polling fallback.
- Investigate the remaining `npm test` failure in `local mock simulation covers six matches and recalculates standings`, where mock payload returns 0 matches instead of 6.

### 6. Changelog
*(Keep only the 5-10 most recent changes. Always replace YYYY-MM-DD with the actual current date)*
- `[2026-06-12]` [IN PROGRESS] Added ESPN per-match live-score fallback and active-match polling updates in `api/live-scores.js` and `src/App.jsx`.
- `[2026-06-12]` [IN PROGRESS] Fixed daily question lock display to `00:00` Vietnam match day while preserving old question keys in `src/lib/app/worldcup-data.js`.
- `[2026-06-12]` [IN PROGRESS] Synced BTC daily answer changes into leaderboard recomputation through `src/App.jsx`, `src/lib/app/scoring.js`, and `migrations/012_group_daily_answers_realtime.sql`.
- `[2026-06-12]` [IN PROGRESS] `npm run build` passed; browser verification passed for daily question cards/admin card/mobile overflow; `npm test` has 25/26 passing with one unrelated mock live-score assertion failure.
- `[2026-06-11]` [IN PROGRESS] Added long-term player-award fields, expanded player suggestions, admin manual point adjustments, compact standings columns, and migration `migrations/009_long_term_players_and_manual_points.sql`.
- `[2026-06-11]` [STABLE] Updated `src/lib/app/worldcup-data.js` to generate player suggestions from 48 World Cup squads and sort team dropdown options.
- `[2026-06-11]` [STABLE] Browser verification passed for long-term form, player suggestions, standings columns, and admin panel after `npm run build`.

### 7. Current Focus
- **Problem:** Code-level build/browser verification is passing, but `migrations/012_group_daily_answers_realtime.sql` must be submitted before player-answer realtime works in DB-backed shared environments; `npm test` still has one unrelated mock live-score assertion failure.
- **Next Action:** Submit migration 012 through Admin Portal, confirm migration 011 is applied, then investigate `buildMockLiveScorePayload` returning 0 matches in `src/lib/app/scoring.test.js`.
