import {
  FAMOUS_PLAYERS_BY_TEAM,
  GLOBAL_FAMOUS_PLAYER_NAMES,
  normalizePlayerToken,
  playerMentionTokens,
} from './famous-players.js';
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

  const normalized = normalizePlayerToken(clean);
  if (BANNED_PATTERNS.some((pattern) => pattern.test(clean) || pattern.test(normalized))) {
    return { ok: false, reason: 'banned_content' };
  }

  const allowedTokens = new Set(playerMentionTokens(playersToMention));
  const globalTokens = playerMentionTokens(GLOBAL_FAMOUS_PLAYER_NAMES);
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
