import { createClient } from '@supabase/supabase-js';
import { verifyRequest } from './_verify.js';
import config from '../mushy.config.json' with { type: 'json' };
import {
  MATCH_INSIGHT_MODELS,
  buildMatchInsightPrompt,
  getFamousPlayersForMatch,
  parseMatchInsightResponse,
  validateMatchInsightSummary,
} from '../src/lib/app/match-insight.js';
import { MATCHES } from '../src/lib/app/worldcup-data.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DAILY_GENERATION_LIMIT = 100;
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
  if (cached.error) return res.status(503).json({ error: 'cache_unavailable' });
  if (cached.row) return res.status(200).json(formatInsight(cached.row, true));

  const quota = await hasGenerationQuota(client, ctx.workspaceId, ctx.userId);
  if (quota.error) return res.status(503).json({ error: 'quota_unavailable' });
  if (!quota.ok) return res.status(429).json({ error: 'daily_ai_quota_exceeded' });

  const playersToMention = getFamousPlayersForMatch(match);
  const prompt = buildMatchInsightPrompt({ match, playersToMention });

  let generated;
  try {
    generated = await generateInsight(prompt, playersToMention);
  } catch {
    return res.status(502).json({ error: 'ai_generation_failed' });
  }

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
      if (raced.row) return res.status(200).json(formatInsight(raced.row, true));
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
  if (error) return { row: null, error };
  return { row: data || null, error: null };
}

async function hasGenerationQuota(client, workspaceId, userId) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count, error } = await client
    .from('match_ai_insights')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('created_by', userId)
    .gte('created_at', startOfDay.toISOString());

  if (error) return { ok: false, error };
  return { ok: (count || 0) < DAILY_GENERATION_LIMIT, error: null };
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

  let lastError = null;
  for (const model of MATCH_INSIGHT_MODELS) {
    try {
      return await callOpenRouter(messages, playersToMention, model, true);
    } catch (err) {
      if (err.status === 400) {
        try {
          return await callOpenRouter(messages, playersToMention, model, false);
        } catch (retryError) {
          lastError = retryError;
          continue;
        }
      }
      lastError = err;
    }
  }
  throw lastError || new Error('openrouter_no_model_available');
}

async function callOpenRouter(messages, playersToMention, model, useJsonFormat) {
  const body = {
    model,
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
    model: payload?.model || model,
  };
}
