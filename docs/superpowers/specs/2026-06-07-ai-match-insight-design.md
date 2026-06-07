# AI Match Insight Design

## Summary

Add an AI match insight feature to the `Nha Tien Tri` home match cards. The feature gives a short Vietnamese match preview with a fun, lightly teasing tone. It is not a betting advisor, does not suggest scores, and does not mention keo tu.

The insight is shared by the workspace: each `(workspace_id, match_no)` gets one generated text, cached in the database and reused by all users.

## Goals

- Let users tap `Nhan dinh AI` on a match card in the Trang chu tab.
- Generate 2-4 short Vietnamese sentences about the match context.
- Use OpenRouter server-side with MiniMax as the primary model.
- Mention famous players only when they are present in an app-curated list.
- Cache the generated insight per workspace and match.
- Hide the button when `OPENROUTER_API_KEY` is not configured.

## Non-Goals

- Do not suggest a predicted score.
- Do not recommend keo tu, double down, or leaderboard strategy.
- Do not use gambling language or betting odds.
- Do not read or send user names, chat messages, workspace names, or private group discussion to OpenRouter.
- Do not allow refresh/regeneration in the MVP.
- Do not add live internet sports research in the MVP.

## User Experience

On each `MatchCardPrototype`, render a compact `Nhan dinh AI` button only when the server status endpoint says AI is enabled.

When a user taps the button:

1. If the insight is already loaded in client state, expand the card panel and show it.
2. If not loaded, call the match insight API with the match number.
3. If the API returns a cached insight, show it.
4. If no cache exists, the API generates, stores, and returns the insight.
5. If OpenRouter fails after AI is enabled, show a small inline message: `AI dang nghi giai lao, thu lai sau.`

The panel stays inside the match card. It should not open a modal and should not block saving predictions.

## Content Rules

The generated text must follow these rules:

- Vietnamese.
- Fun and lightly teasing, aligned with the current app copy.
- 2-4 sentences.
- No score prediction.
- No keo tu advice.
- No gambling or betting phrasing.
- No invented player names.
- Only mention players provided in `playersToMention`.
- If `playersToMention` is empty, omit player commentary entirely.
- No markdown tables, bullet lists, or long analysis.

Example with a famous player:

```text
Phap vao tran voi cua tren ro rang nho chieu sau doi hinh va thu hang FIFA tot hon, nhung Canada khong phai doi dung yen cho nguoi ta da tap. Diem nong nam o kha nang Phap ep hai bien trong 30 phut dau. Cau thu dang chu y: Mbappe la diem no ro nhat, chi can mot pha tang toc la hang thu ben kia bat dau tim oxy.
```

Example without famous players:

```text
Hai doi khong qua lech ve nhiem do tran dau, nhung chenh lech FIFA rank van cho thay doi cua tren co loi the kinh nghiem. Diem dang xem la ai kiem soat duoc nhip bong som, vi tran nay chi can mot pha mat bong sai cho la ca phong du doan se co nguoi len tieng ngay.
```

## Data Model

Add one app-specific table through a normal Admin Portal migration:

```sql
create table if not exists app_nha_tien_tri.match_ai_insights (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  match_no int not null check (match_no between 1 and 104),
  provider text not null default 'openrouter',
  model text not null,
  summary text not null check (char_length(summary) between 20 and 700),
  players_mentioned text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (workspace_id, match_no)
);
```

Policies follow the Mushy mini-app pattern:

- `select`: `public.can_access_app_data(workspace_id, 'nha-tien-tri')`
- `insert`: same access check and `created_by = auth.uid()`
- `update`: same access check and `created_by = auth.uid()`; no MVP endpoint will call it
- `delete`: `public.is_owner_workspace_member(workspace_id)`; no MVP endpoint will call it

The API writes the row using the authenticated user's JWT, not service role.

## API Design

### `GET /api/match-insight-status`

Returns:

```json
{ "enabled": true }
```

Rules:

- `enabled` is true only when `OPENROUTER_API_KEY` is set.
- This endpoint does not expose the key or model details.
- It is unauthenticated because it reveals only feature availability.

### `POST /api/match-insight`

Request body:

```json
{ "matchNo": 1 }
```

Headers:

- `Authorization: Bearer <token>`
- `X-Workspace-Id: <active workspace id>`
- `X-Home-Workspace-Id: <home workspace id>` when available

Flow:

1. Verify request with `api/_verify.js`.
2. Validate `matchNo` is an integer from 1 to 104.
3. Look up cached `match_ai_insights` row by `workspace_id` and `match_no`.
4. If found, return it.
5. Build match context from server-side static World Cup data.
6. Build `playersToMention` from app-curated famous player data.
7. Call OpenRouter.
8. Validate response length and forbidden content.
9. Insert row with unique `(workspace_id, match_no)`.
10. On insert race, re-read and return the existing row.

Response:

```json
{
  "matchNo": 1,
  "summary": "...",
  "model": "minimax/minimax-m2-her",
  "cached": true
}
```

## OpenRouter Configuration

Use OpenRouter's chat completions endpoint server-side.

Primary model:

```text
minimax/minimax-m2-her
```

Fallback order:

```text
minimax/minimax-m2-her
qwen/qwen3.7-plus
deepseek/deepseek-v4-flash
```

Environment variables:

- `OPENROUTER_API_KEY`
- optional `OPENROUTER_SITE_URL`
- optional `OPENROUTER_APP_TITLE`

Request settings:

- `max_tokens`: 180
- `temperature`: 0.75
- Request `response_format: { "type": "json_object" }`.
- If OpenRouter/provider rejects `response_format`, retry once without it and still parse/validate the returned text.
- Use direct `fetch` and send OpenRouter `models` in priority order:
  `['minimax/minimax-m2-her', 'qwen/qwen3.7-plus', 'deepseek/deepseek-v4-flash']`.

## Famous Player Data

Add app-specific curated data in `src/lib/app/famous-players.js`:

```js
export const FAMOUS_PLAYERS_BY_TEAM = {
  Argentina: ['Lionel Messi'],
  France: ['Kylian Mbappe'],
  Portugal: ['Cristiano Ronaldo'],
};
```

The initial list should be intentionally small and only include globally recognizable players. If a team is not listed, the AI receives no player names for that team.

## Privacy And Safety

Only send:

- match number
- home team
- away team
- group or stage
- kickoff time bucket if useful
- FIFA ranks
- curated famous players

Never send:

- user names
- chat messages
- workspace name
- user prediction values
- leaderboard position
- private workspace metadata

Prompt injection risk is low because user-authored text is not sent. The API still validates output so the model cannot add score predictions, betting advice, or invented player names.

## Error Handling

- Missing `OPENROUTER_API_KEY`: status endpoint returns disabled; frontend hides the button.
- Invalid match number: API returns 400.
- Unauthorized request: API returns 401.
- OpenRouter error: API returns a safe error; frontend shows `AI dang nghi giai lao, thu lai sau.`
- Model returns invalid content: API rejects it and returns the same safe error.
- Cache insert race: API re-reads the cached row and returns it.

## Testing

Unit or focused tests:

- famous-player lookup returns only curated names.
- output validator rejects score predictions.
- output validator rejects keo tu or betting phrasing.
- output validator rejects non-curated player names.
- match number validation accepts 1-104 and rejects other values.

Manual/browser checks:

- Button is hidden when status endpoint returns disabled.
- Button appears when status endpoint returns enabled.
- First click shows loading and then insight text.
- Second click for the same match uses cached text.
- Match cards without famous players do not show invented player names.
- Prediction save controls still work independently.

## Implementation Scope

This is a single-feature implementation. It touches:

- `api/match-insight-status.js`
- `api/match-insight.js`
- one migration for `match_ai_insights`
- app-specific famous player data
- `src/App.jsx` match card state and UI
- `src/App.css` for the compact insight panel

It does not require changing shared template infrastructure.
