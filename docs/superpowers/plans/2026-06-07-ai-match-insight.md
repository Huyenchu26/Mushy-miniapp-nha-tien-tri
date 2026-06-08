# AI Match Insight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cached OpenRouter MiniMax-powered `Nhan dinh AI` panel on home match cards, with strict no-score/no-keo-tu/no-betting content rules.

**Architecture:** Serverless APIs verify Mushy JWTs, read/write cached insights in the app schema, and call OpenRouter only on cache misses. App-specific helper modules own famous-player lookup, prompt creation, parsing, and validation so API and tests stay small. React state in `App.jsx` controls feature availability, per-match loading/error/summary state, and renders the compact panel inside each match card.

**Tech Stack:** Vite + React 18, Vercel Serverless Functions, Supabase JS with anon + user JWT, OpenRouter Chat Completions, Node `node:test`.

---

## Branch And Scope

- Work on branch `dev`.
- Do not push or merge to `main` during this implementation.
- Do not edit shared template infrastructure under `src/lib/*` except app-specific files in `src/lib/app/*`.
- Do not add `SUPABASE_SERVICE_ROLE_KEY`.
- Submit the migration through Admin Portal; do not run SQL directly in Supabase SQL Editor.

## File Structure

- Create `src/lib/app/famous-players.js`: small curated famous-player list and mention token helpers.
- Create `src/lib/app/match-insight.js`: model constants, prompt builder, response parser, output validator.
- Create `src/lib/app/match-insight.test.js`: focused tests for player lookup and validator behavior.
- Modify `package.json`: run all app tests with Node's test runner.
- Create `migrations/006_match_ai_insights.sql`: cached insight table with RLS.
- Create `api/match-insight-status.js`: feature availability endpoint.
- Create `api/match-insight.js`: authenticated cache/read/generate endpoint.
- Modify `src/App.jsx`: status fetch, insight handler, props, button, and panel.
- Modify `src/App.css`: compact button/panel styles.

---

### Task 1: App-Specific AI Helper Modules

**Files:**
- Create: `src/lib/app/famous-players.js`
- Create: `src/lib/app/match-insight.js`
- Create: `src/lib/app/match-insight.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `src/lib/app/match-insight.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MATCH_INSIGHT_MODELS,
  buildMatchInsightPrompt,
  getFamousPlayersForMatch,
  parseMatchInsightResponse,
  validateMatchInsightSummary,
} from './match-insight.js';

const franceCanada = {
  matchNo: 1,
  stage: 'group',
  group: 'I',
  homeTeam: 'France',
  awayTeam: 'Canada',
  kickoffAt: '2026-06-12T19:00:00Z',
};

test('match insight model order starts with MiniMax and keeps configured fallbacks', () => {
  assert.deepEqual(MATCH_INSIGHT_MODELS, [
    'minimax/minimax-m2-her',
    'qwen/qwen3.7-plus',
    'deepseek/deepseek-v4-flash',
  ]);
});

test('famous player lookup returns only curated players for match teams', () => {
  assert.deepEqual(getFamousPlayersForMatch(franceCanada), ['Kylian Mbappe']);
  assert.deepEqual(getFamousPlayersForMatch({
    homeTeam: 'Canada',
    awayTeam: 'Qatar',
  }), []);
});

test('prompt includes match context and only supplied famous players', () => {
  const prompt = buildMatchInsightPrompt({
    match: franceCanada,
    playersToMention: ['Kylian Mbappe'],
  });
  assert.match(prompt, /France/);
  assert.match(prompt, /Canada/);
  assert.match(prompt, /Kylian Mbappe/);
  assert.doesNotMatch(prompt, /Lionel Messi/);
  assert.match(prompt, /khong goi y ti so/i);
});

test('parser accepts plain JSON and fenced JSON', () => {
  assert.equal(parseMatchInsightResponse('{"summary":"Phap nhinh hon, nhung Canada khong de bat nat."}'), 'Phap nhinh hon, nhung Canada khong de bat nat.');
  const fenced = `\`\`\`json
{"summary":"Tran nay cang, ai mat bong truoc la bi soi."}
\`\`\``;
  assert.equal(parseMatchInsightResponse(fenced), 'Tran nay cang, ai mat bong truoc la bi soi.');
});

test('validator accepts short safe insight with allowed famous player alias', () => {
  const result = validateMatchInsightSummary(
    'Phap nhinh hon nho chieu sau doi hinh, nhung Canada khong phai doi dung yen cho nguoi ta da tap. Mbappe la diem no ro nhat o nhung pha tang toc.',
    ['Kylian Mbappe']
  );
  assert.equal(result.ok, true);
});

test('validator rejects score predictions, keo tu, betting language, and non-curated famous players', () => {
  assert.equal(validateMatchInsightSummary('Phap co the thang 2-1 neu Canada so ho.', ['Kylian Mbappe']).ok, false);
  assert.equal(validateMatchInsightSummary('Tran nay nen bat keo tu vi cua Phap sang.', ['Kylian Mbappe']).ok, false);
  assert.equal(validateMatchInsightSummary('Day la keo ca cuoc ngon cho nguoi thich mao hiem.', ['Kylian Mbappe']).ok, false);
  assert.equal(validateMatchInsightSummary('Messi se la tam diem du day la tran Phap vs Canada.', ['Kylian Mbappe']).ok, false);
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
node --test src/lib/app/match-insight.test.js
```

Expected: FAIL because `src/lib/app/match-insight.js` does not exist.

- [ ] **Step 3: Create famous-player curated data**

Create `src/lib/app/famous-players.js`:

```js
export const FAMOUS_PLAYERS_BY_TEAM = Object.freeze({
  Argentina: ['Lionel Messi'],
  Belgium: ['Kevin De Bruyne'],
  Brazil: ['Vinicius Junior'],
  Colombia: ['Luis Diaz'],
  Croatia: ['Luka Modric'],
  Egypt: ['Mohamed Salah'],
  England: ['Harry Kane', 'Jude Bellingham'],
  France: ['Kylian Mbappe'],
  Germany: ['Jamal Musiala'],
  Netherlands: ['Virgil van Dijk'],
  Norway: ['Erling Haaland', 'Martin Odegaard'],
  Portugal: ['Cristiano Ronaldo'],
  Spain: ['Lamine Yamal', 'Pedri'],
  Uruguay: ['Federico Valverde'],
});

export const GLOBAL_FAMOUS_PLAYER_NAMES = Object.freeze(
  Object.values(FAMOUS_PLAYERS_BY_TEAM).flat()
);

export function playerMentionTokens(players = []) {
  return [...new Set(players.flatMap((name) => {
    const clean = String(name || '').trim();
    if (!clean) return [];
    const parts = clean.split(/\s+/);
    return [clean, parts[parts.length - 1]].map(normalizePlayerToken).filter(Boolean);
  }))];
}

export function normalizePlayerToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}
```

- [ ] **Step 4: Create match insight helpers**

Create `src/lib/app/match-insight.js`:

```js
import { FAMOUS_PLAYERS_BY_TEAM, GLOBAL_FAMOUS_PLAYER_NAMES, normalizePlayerToken, playerMentionTokens } from './famous-players.js';
import { TEAM_META } from './worldcup-data.js';

export const MATCH_INSIGHT_MODELS = Object.freeze([
  'minimax/minimax-m2-her',
  'qwen/qwen3.7-plus',
  'deepseek/deepseek-v4-flash',
]);

const BANNED_PATTERNS = [
  /\b\d+\s*[-:]\s*\d+\b/,
  /\bkeo\s*tu\b/i,
  /\bx2\b/i,
  /\bdouble\s*down\b/i,
  /\bca\s*cuoc\b/i,
  /\bdat\s*cuoc\b/i,
  /\bbet(?:ting)?\b/i,
  /\bodds?\b/i,
  /\bti\s*le\s*cuoc\b/i,
  /\bty\s*le\s*cuoc\b/i,
  /\bgoi\s*y\s*ti\s*so\b/i,
  /\bdu\s*doan\s*ti\s*so\b/i,
];

export function getFamousPlayersForMatch(match) {
  const teams = [match?.homeTeam, match?.awayTeam].filter(Boolean);
  return [...new Set(teams.flatMap((team) => FAMOUS_PLAYERS_BY_TEAM[team] || []))];
}

export function buildMatchInsightPrompt({ match, playersToMention = [] }) {
  const homeRank = TEAM_META[match?.homeTeam]?.fifaRank ?? null;
  const awayRank = TEAM_META[match?.awayTeam]?.fifaRank ?? null;
  const context = {
    matchNo: Number(match?.matchNo),
    homeTeam: match?.homeTeam || '',
    awayTeam: match?.awayTeam || '',
    group: match?.group || null,
    stage: match?.stage || 'group',
    kickoffAt: match?.kickoffAt || '',
    fifaRanks: {
      [match?.homeTeam || 'home']: homeRank,
      [match?.awayTeam || 'away']: awayRank,
    },
    playersToMention,
  };

  return [
    'Viet nhan dinh tran dau World Cup 2026 bang tieng Viet khong dau hoac co dau deu duoc.',
    'Tone vui, ca khia nhe, giong chat nhom noi bo.',
    'Chi viet 2-4 cau ngan.',
    'Khong goi y ti so, khong nhac keo tu, khong nhac x2, khong dung ngon ngu ca cuoc.',
    'Chi duoc nhac cau thu trong playersToMention. Neu playersToMention rong, bo qua cau thu.',
    'Tra ve JSON dung dang {"summary":"..."} va khong them field khac.',
    '<match_context>',
    JSON.stringify(context),
    '</match_context>',
  ].join('\n');
}

export function parseMatchInsightResponse(raw) {
  const clean = stripCodeFence(String(raw || '').trim());
  try {
    const parsed = JSON.parse(clean);
    return normalizeInsightText(parsed?.summary || '');
  } catch {
    return normalizeInsightText(clean);
  }
}

export function validateMatchInsightSummary(summary, playersToMention = []) {
  const clean = normalizeInsightText(summary);
  if (clean.length < 20) return { ok: false, reason: 'too_short' };
  if (clean.length > 700) return { ok: false, reason: 'too_long' };
  if (/^\s*[-*]\s+/m.test(clean)) return { ok: false, reason: 'list_format' };

  const sentenceCount = clean.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean).length;
  if (sentenceCount > 4) return { ok: false, reason: 'too_many_sentences' };

  if (BANNED_PATTERNS.some((pattern) => pattern.test(clean))) {
    return { ok: false, reason: 'banned_content' };
  }

  const allowedTokens = new Set(playerMentionTokens(playersToMention));
  const globalTokens = playerMentionTokens(GLOBAL_FAMOUS_PLAYER_NAMES);
  const normalized = normalizePlayerToken(clean);
  for (const token of globalTokens) {
    if (normalized.includes(token) && !allowedTokens.has(token)) {
      return { ok: false, reason: 'non_curated_player' };
    }
  }

  return { ok: true, summary: clean };
}

export function normalizeInsightText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripCodeFence(value) {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}
```

- [ ] **Step 5: Update test script**

Modify `package.json`:

```json
"test": "node --test src/lib/app/scoring.test.js src/lib/app/match-insight.test.js"
```

- [ ] **Step 6: Run tests and commit helper work**

Run:

```powershell
npm test
```

Expected: PASS for `scoring.test.js` and `match-insight.test.js`.

Commit:

```powershell
git add package.json src/lib/app/famous-players.js src/lib/app/match-insight.js src/lib/app/match-insight.test.js
git commit -m "feat: add match insight helpers"
```

---

### Task 2: Cached Insight Migration

**Files:**
- Create: `migrations/006_match_ai_insights.sql`

- [ ] **Step 1: Write the migration**

Create `migrations/006_match_ai_insights.sql`:

```sql
-- =====================================================================
-- Nha Tien Tri World Cup 2026 - cached AI match insights.
--
-- Slug: nha-tien-tri -> schema app_nha_tien_tri.
-- The Mushy migration reviewer duplicates this migration to the dev schema.
-- Submit via Admin Portal Migration Reviewer, do not run directly in SQL Editor.
-- =====================================================================

create table if not exists app_nha_tien_tri.match_ai_insights (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  created_by        uuid not null references auth.users(id),
  match_no          int not null check (match_no between 1 and 104),
  provider          text not null default 'openrouter',
  model             text not null,
  summary           text not null check (char_length(summary) between 20 and 700),
  players_mentioned text[] not null default '{}',
  created_at        timestamptz not null default now(),
  unique (workspace_id, match_no)
);

create index if not exists idx_wc_match_ai_insights_workspace
  on app_nha_tien_tri.match_ai_insights (workspace_id);

create index if not exists idx_wc_match_ai_insights_match
  on app_nha_tien_tri.match_ai_insights (workspace_id, match_no);

grant select, insert, update, delete on app_nha_tien_tri.match_ai_insights to authenticated;
alter table app_nha_tien_tri.match_ai_insights enable row level security;

drop policy if exists "match_ai_insights_select" on app_nha_tien_tri.match_ai_insights;
create policy "match_ai_insights_select" on app_nha_tien_tri.match_ai_insights
for select using (public.can_access_app_data(workspace_id, 'nha-tien-tri'));

drop policy if exists "match_ai_insights_insert" on app_nha_tien_tri.match_ai_insights;
create policy "match_ai_insights_insert" on app_nha_tien_tri.match_ai_insights
for insert with check (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
);

drop policy if exists "match_ai_insights_update" on app_nha_tien_tri.match_ai_insights;
create policy "match_ai_insights_update" on app_nha_tien_tri.match_ai_insights
for update using (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
) with check (
  public.can_access_app_data(workspace_id, 'nha-tien-tri')
  and created_by = auth.uid()
);

drop policy if exists "match_ai_insights_delete" on app_nha_tien_tri.match_ai_insights;
create policy "match_ai_insights_delete" on app_nha_tien_tri.match_ai_insights
for delete using (public.is_owner_workspace_member(workspace_id));
```

- [ ] **Step 2: Inspect migration text**

Run:

```powershell
Get-Content migrations\006_match_ai_insights.sql
```

Expected: SQL references only `app_nha_tien_tri`, not `_dev`, and does not touch `public`, `storage`, or service-role concepts except allowed workspace/auth references.

- [ ] **Step 3: Commit migration**

Commit:

```powershell
git add migrations/006_match_ai_insights.sql
git commit -m "feat: add match insight cache migration"
```

---

### Task 3: Serverless OpenRouter API

**Files:**
- Create: `api/match-insight-status.js`
- Create: `api/match-insight.js`

- [ ] **Step 1: Create feature status endpoint**

Create `api/match-insight-status.js`:

```js
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  return res.status(200).json({ enabled: Boolean(process.env.OPENROUTER_API_KEY) });
}
```

- [ ] **Step 2: Create authenticated match insight endpoint**

Create `api/match-insight.js`:

```js
import { createClient } from '@supabase/supabase-js';
import { verifyRequest } from './_verify.js';
import config from '../mushy.config.json' with { type: 'json' };
import { getFamousPlayersForMatch, buildMatchInsightPrompt, parseMatchInsightResponse, validateMatchInsightSummary, MATCH_INSIGHT_MODELS } from '../src/lib/app/match-insight.js';
import { MATCHES } from '../src/lib/app/worldcup-data.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const schemaSlug = config.slug.replace(/-/g, '_');
const appSchema = process.env.VERCEL_ENV === 'production'
  ? `app_${schemaSlug}`
  : `app_${schemaSlug}_dev`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const ctx = await verifyRequest(req);
  if (!ctx) return res.status(401).json({ error: 'unauthorized' });

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({ error: 'ai_disabled' });
  }

  const matchNo = Number(req.body?.matchNo);
  if (!Number.isInteger(matchNo) || matchNo < 1 || matchNo > 104) {
    return res.status(400).json({ error: 'invalid_match_no' });
  }

  const match = MATCHES.find((item) => Number(item.matchNo) === matchNo);
  if (!match) return res.status(404).json({ error: 'match_not_found' });

  const client = createAppClient(ctx.token);
  const cached = await readCachedInsight(client, ctx.workspaceId, matchNo);
  if (cached) return res.status(200).json(formatInsight(cached, true));

  const playersToMention = getFamousPlayersForMatch(match);
  const prompt = buildMatchInsightPrompt({ match, playersToMention });
  const generated = await generateInsight(prompt, playersToMention);

  const row = {
    workspace_id: ctx.workspaceId,
    created_by: ctx.userId,
    match_no: matchNo,
    provider: 'openrouter',
    model: generated.model,
    summary: generated.summary,
    players_mentioned: playersToMention,
  };

  const { data, error } = await client
    .from('match_ai_insights')
    .insert(row)
    .select('match_no, summary, model, players_mentioned, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      const raced = await readCachedInsight(client, ctx.workspaceId, matchNo);
      if (raced) return res.status(200).json(formatInsight(raced, true));
    }
    return res.status(500).json({ error: 'cache_write_failed' });
  }

  return res.status(200).json(formatInsight(data, false));
}

function createAppClient(token) {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: appSchema },
  });
}

async function readCachedInsight(client, workspaceId, matchNo) {
  const { data, error } = await client
    .from('match_ai_insights')
    .select('match_no, summary, model, players_mentioned, created_at')
    .eq('workspace_id', workspaceId)
    .eq('match_no', matchNo)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function formatInsight(row, cached) {
  return {
    matchNo: Number(row.match_no),
    summary: row.summary,
    model: row.model,
    playersMentioned: row.players_mentioned || [],
    cached,
  };
}

async function generateInsight(prompt, playersToMention) {
  const messages = [
    {
      role: 'system',
      content: [
        'Ban la AI binh luan vien cua mini-game du doan bong da noi bo.',
        'Viet ngan, vui, ca khia nhe, khong doc hai.',
        'Cam goi y ti so, cam keo tu, cam x2, cam ngon ngu ca cuoc.',
        'Chi nhac cau thu neu ten nam trong playersToMention.',
      ].join(' '),
    },
    { role: 'user', content: prompt },
  ];

  try {
    return await callOpenRouter(messages, playersToMention, true);
  } catch (err) {
    if (err.status === 400) return await callOpenRouter(messages, playersToMention, false);
    throw err;
  }
}

async function callOpenRouter(messages, playersToMention, useJsonFormat) {
  const body = {
    models: MATCH_INSIGHT_MODELS,
    messages,
    max_tokens: 180,
    temperature: 0.75,
  };
  if (useJsonFormat) body.response_format = { type: 'json_object' };

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://nha-tien-tri.mini.mushy-app.com',
      'X-Title': process.env.OPENROUTER_APP_TITLE || 'Mushy Nha Tien Tri',
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  if (!response.ok) {
    const error = new Error(`openrouter_${response.status}`);
    error.status = response.status;
    error.detail = rawText;
    throw error;
  }

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error('openrouter_invalid_json');
  }

  const content = payload?.choices?.[0]?.message?.content || '';
  const summary = parseMatchInsightResponse(content);
  const validation = validateMatchInsightSummary(summary, playersToMention);
  if (!validation.ok) throw new Error(`invalid_ai_summary:${validation.reason}`);

  return {
    summary: validation.summary,
    model: payload?.model || MATCH_INSIGHT_MODELS[0],
  };
}
```

- [ ] **Step 3: Run tests and build**

Run:

```powershell
npm test
npm run build
```

Expected: tests PASS and Vite build completes. If build fails because JSON import attributes are unsupported in the API bundle, keep the existing `_verify.js` style and use the same Node/Vercel syntax already present there.

- [ ] **Step 4: Commit API work**

Commit:

```powershell
git add api/match-insight-status.js api/match-insight.js
git commit -m "feat: add match insight api"
```

---

### Task 4: React State And Match Card UI

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add state near existing App state**

In `App()` after `const [liveSync, setLiveSync] = useState(...)`, add:

```js
  const [aiInsightsEnabled, setAiInsightsEnabled] = useState(false);
  const [matchInsights, setMatchInsights] = useState({});
```

- [ ] **Step 2: Add status fetch effect**

After the context-loading `useEffect`, add:

```js
  useEffect(() => {
    let cancelled = false;
    fetch('/api/match-insight-status')
      .then((response) => response.ok ? response.json() : { enabled: false })
      .then((payload) => {
        if (!cancelled) setAiInsightsEnabled(Boolean(payload?.enabled));
      })
      .catch(() => {
        if (!cancelled) setAiInsightsEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
```

- [ ] **Step 3: Add loader handler in `App()`**

Add this function near `handleSavePrediction`:

```js
  async function handleLoadMatchInsight(match) {
    const matchNo = Number(match?.matchNo);
    if (!matchNo || !ctx?.token || !scope?.workspaceId) return;
    const current = matchInsights[matchNo];
    if (current?.loading || current?.summary) return;

    setMatchInsights((rows) => ({
      ...rows,
      [matchNo]: { ...(rows[matchNo] || {}), loading: true, error: '' },
    }));

    try {
      const response = await fetch('/api/match-insight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.token}`,
          'X-Workspace-Id': scope.workspaceId,
          'X-Home-Workspace-Id': ctx.workspaceId || scope.workspaceId,
        },
        body: JSON.stringify({ matchNo }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'match_insight_failed');

      setMatchInsights((rows) => ({
        ...rows,
        [matchNo]: {
          loading: false,
          error: '',
          summary: payload.summary || '',
          model: payload.model || '',
          cached: payload.cached === true,
        },
      }));
    } catch {
      setMatchInsights((rows) => ({
        ...rows,
        [matchNo]: {
          ...(rows[matchNo] || {}),
          loading: false,
          error: 'AI dang nghi giai lao, thu lai sau.',
        },
      }));
    }
  }
```

- [ ] **Step 4: Pass props from App to MatchesScreen**

Where `MatchesScreen` is rendered, add:

```jsx
                aiInsightsEnabled={aiInsightsEnabled && !(localSimulation && isMockContext(ctx))}
                matchInsights={matchInsights}
                onLoadMatchInsight={handleLoadMatchInsight}
```

- [ ] **Step 5: Extend `MatchesScreen` props and pass to cards**

In `function MatchesScreen({ ... })`, add these props:

```js
  aiInsightsEnabled,
  matchInsights,
  onLoadMatchInsight,
```

In `MatchCardPrototype`, add:

```jsx
                  aiInsightsEnabled={aiInsightsEnabled}
                  aiInsight={matchInsights?.[Number(match.matchNo)]}
                  onLoadInsight={onLoadMatchInsight}
```

- [ ] **Step 6: Extend `MatchCardPrototype` props and render AI UI**

Change the signature:

```js
function MatchCardPrototype({
  match,
  prediction,
  roastText,
  dailyDoubleMatchNo,
  aiInsightsEnabled,
  aiInsight,
  onSave,
  onOpenRoom,
  onLoadInsight,
}) {
```

Add local panel state after `saving`:

```js
  const [insightOpen, setInsightOpen] = useState(false);
```

Add a click handler before `return`:

```js
  function handleInsightClick(event) {
    event.stopPropagation();
    setInsightOpen(true);
    if (!aiInsight?.summary && !aiInsight?.loading) {
      onLoadInsight?.(match);
    }
  }
```

Render inside the card before `</article>`:

```jsx
      {aiInsightsEnabled && teamsKnown ? (
        <div className="match-ai">
          <button type="button" className="match-ai-btn" onClick={handleInsightClick}>
            Nhan dinh AI
          </button>
          {insightOpen ? (
            <div className={`match-ai-panel ${aiInsight?.error ? 'error' : ''}`}>
              {aiInsight?.loading ? (
                <p>AI dang soi keo bong, cho chut...</p>
              ) : aiInsight?.error ? (
                <p>{aiInsight.error}</p>
              ) : aiInsight?.summary ? (
                <p>{aiInsight.summary}</p>
              ) : (
                <p>Bam de nghe AI doc vi tran nay.</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
```

- [ ] **Step 7: Run tests and build**

Run:

```powershell
npm test
npm run build
```

Expected: tests PASS and Vite build completes.

- [ ] **Step 8: Commit UI state work**

Commit:

```powershell
git add src/App.jsx
git commit -m "feat: show ai match insight on cards"
```

---

### Task 5: Match Insight Styling

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Add compact AI panel styles**

Add near the existing `.match-actions` / `.double-hint` styles:

```css
.match-ai {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}

.match-ai-btn {
  width: fit-content;
  border: 1px solid rgba(230, 57, 70, 0.18);
  background: rgba(230, 57, 70, 0.08);
  color: var(--brand);
  border-radius: 12px;
  padding: 8px 11px;
  font: 800 12px/1 var(--font-body);
  cursor: pointer;
}

.match-ai-btn:hover {
  background: rgba(230, 57, 70, 0.13);
}

.match-ai-panel {
  border: 1px solid rgba(15, 15, 18, 0.08);
  background: #fff;
  border-radius: 12px;
  padding: 10px 12px;
  color: var(--fg-secondary);
  font-size: 12px;
  line-height: 1.55;
}

.match-ai-panel p {
  margin: 0;
}

.match-ai-panel.error {
  border-color: rgba(255, 59, 48, 0.22);
  background: rgba(255, 59, 48, 0.06);
  color: var(--danger-v3);
}
```

- [ ] **Step 2: Check mobile CSS does not override panel badly**

Run:

```powershell
rg -n "match-card--prototype|match-ai|double-hint|match-actions" src\App.css
```

Expected: `.match-ai` rules are present once, and no mobile rule forces text overlap.

- [ ] **Step 3: Run build and commit CSS**

Run:

```powershell
npm run build
```

Expected: Vite build completes.

Commit:

```powershell
git add src/App.css
git commit -m "style: add ai match insight panel"
```

---

### Task 6: End-To-End Verification

**Files:**
- No new source files unless fixing failures found by verification.

- [ ] **Step 1: Run automated verification**

Run:

```powershell
npm test
npm run build
```

Expected: tests PASS and Vite build completes.

- [ ] **Step 2: Start dev server on dev branch**

Run:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

Expected: Vite serves `http://127.0.0.1:5173/`.

- [ ] **Step 3: Verify disabled status without key**

Temporarily run without `OPENROUTER_API_KEY` in the local shell and open:

```text
http://localhost:5173
```

Expected: match cards do not show `Nhan dinh AI`.

- [ ] **Step 4: Verify enabled status with key**

Set `OPENROUTER_API_KEY` in the shell running Vite/Vercel local API support, then reload:

```powershell
$env:OPENROUTER_API_KEY='sk-or-v1-redacted'
```

Expected: `Nhan dinh AI` appears on known-team match cards. Do not commit the key.

- [ ] **Step 5: Verify API behavior after migration is available**

After submitting `migrations/006_match_ai_insights.sql` through Admin Portal, click `Nhan dinh AI` on a France, Argentina, or Portugal match.

Expected:

- first click shows loading, then 2-4 sentence summary.
- summary does not include a score prediction.
- summary does not mention keo tu, x2, or betting.
- famous player names appear only for teams in `FAMOUS_PLAYERS_BY_TEAM`.
- second click for the same match returns cached text.

- [ ] **Step 6: Browser visual check**

Use the Browser plugin when available, otherwise Playwright/agent-browser fallback if available.

Required checks:

- page identity is `http://localhost:5173`.
- page is not blank.
- no Vite error overlay.
- no relevant console errors.
- screenshot of first viewport shows no overlap.
- clicking `Nhan dinh AI` expands only the current card and does not open the prediction room.

- [ ] **Step 7: Final implementation commit if verification fixes were needed**

If verification required fixes, commit them:

```powershell
git add src/App.jsx src/App.css src/lib/app/match-insight.js src/lib/app/famous-players.js api/match-insight.js api/match-insight-status.js
git commit -m "fix: verify ai match insight flow"
```

If no fixes were needed, do not create an empty commit.
