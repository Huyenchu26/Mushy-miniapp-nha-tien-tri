import {
  FAMOUS_PLAYERS_BY_TEAM,
  GLOBAL_FAMOUS_PLAYER_NAMES,
  normalizePlayerToken,
  playerMentionTokens,
} from './famous-players.js';
import { TEAM_META } from './worldcup-data.js';

export const MATCH_INSIGHT_MODELS = Object.freeze([
  'deepseek/deepseek-v4-flash',
  'qwen/qwen3.7-plus',
]);

export function selectInsightWarmupMatches(matches, now = Date.now(), limit = 3) {
  const safeLimit = Math.max(0, Math.min(10, Number(limit) || 0));
  return [...(matches || [])]
    .filter((match) => {
      const kickoffAt = Date.parse(match?.kickoffAt || '');
      return Number.isFinite(kickoffAt)
        && kickoffAt > now
        && match?.homeTeam
        && match?.awayTeam
        && match.homeTeam !== 'Unknown'
        && match.awayTeam !== 'Unknown';
    })
    .sort((left, right) => Date.parse(left.kickoffAt) - Date.parse(right.kickoffAt))
    .slice(0, safeLimit);
}

const BANNED_PATTERNS = [
  /\b\d+\s*[-:]\s*\d+\b/,
  /\bkeo\s*tu\b/i,
  /\bx2\b/i,
  /\bdouble\s*down\b/i,
  /\bca\s*cuoc\b/i,
  /\bdat\s*cuoc\b/i,
  /\bbet(?:ting)?\b/i,
  /\bodds?\b/i,
  /kèo/i,
  /\b(?:cam|cầm|bat|bắt|theo|choi|chơi|an|ăn)\s+keo\b/i,
  /\bti\s*le\s*cuoc\b/i,
  /\bty\s*le\s*cuoc\b/i,
  /\bgoi\s*y\s*ti\s*so\b/i,
  /\bdu\s*doan\s*ti\s*so\b/i,
  /3\s*(?:điểm|diem)/i,
  /\bba\s*(?:điểm|diem)\b/i,
  /giành\s+(?:trọn\s+)?3\s*(?:điểm|diem)/i,
  /có\s+3\s*(?:điểm|diem)/i,
  /sẽ\s+(?:thắng|thang|hạ|ha|đè|de|ăn|an)\b/i,
];

const VIETNAMESE_DIACRITIC_PATTERN = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

const ANALYSIS_ANGLES = Object.freeze([
  'độ lệch sức mạnh và bài kiểm tra bản lĩnh của đội cửa dưới',
  'nhịp nhập cuộc, áp lực bảng đấu và đội nào dễ mất kiên nhẫn',
  'khả năng kéo trận vào thế giằng co thay vì đá theo kịch bản một chiều',
  'điểm nóng chuyển trạng thái và chiều sâu đội hình ở cuối trận',
]);

export function getFamousPlayersForMatch(match) {
  const teams = [match?.homeTeam, match?.awayTeam].filter(Boolean);
  return [...new Set(teams.flatMap((team) => FAMOUS_PLAYERS_BY_TEAM[team] || []))];
}

export function buildMatchInsightPrompt({ match, playersToMention = [] }) {
  const homeMeta = TEAM_META[match?.homeTeam] || {};
  const awayMeta = TEAM_META[match?.awayTeam] || {};
  const homeRank = TEAM_META[match?.homeTeam]?.fifaRank ?? null;
  const awayRank = TEAM_META[match?.awayTeam]?.fifaRank ?? null;
  const hasRankPair = Number.isInteger(homeRank) && Number.isInteger(awayRank);
  const rankGap = hasRankPair ? Math.abs(homeRank - awayRank) : null;
  const favoriteTeam = hasRankPair ? (homeRank < awayRank ? match?.homeTeam : match?.awayTeam) : null;
  const underdogTeam = hasRankPair ? (homeRank < awayRank ? match?.awayTeam : match?.homeTeam) : null;
  const context = {
    matchNo: Number(match?.matchNo),
    homeTeam: match?.homeTeam || '',
    homeTeamVi: homeMeta.viName || match?.homeTeam || '',
    awayTeam: match?.awayTeam || '',
    awayTeamVi: awayMeta.viName || match?.awayTeam || '',
    group: match?.group || null,
    stage: match?.stage || 'group',
    kickoffAt: match?.kickoffAt || '',
    fifaRanks: {
      [match?.homeTeam || 'home']: homeRank,
      [match?.awayTeam || 'away']: awayRank,
    },
    rankGap,
    favoriteTeam,
    underdogTeam,
    analysisAngle: matchInsightAngle(match),
    playersToMention,
  };

  return [
    'Viết nhận định trận đấu World Cup 2026 bằng tiếng Việt có dấu.',
    'Tone vui, cà khịa nhẹ, giống chat nhóm nội bộ, nhưng vẫn bám dữ liệu trận.',
    'Chỉ viết 2-4 câu ngắn. Câu đầu bắt buộc nhắc rõ cả hai đội trong match_context.',
    'Không dùng mẫu chung áp cho mọi trận; phải dựa vào bảng/vòng, thứ hạng FIFA, rankGap và analysisAngle.',
    'Không gợi ý tỉ số, không nhắc kèo tủ, không nhắc x2, không dùng ngôn ngữ cá cược.',
    'Không kết luận đội nào thắng/hòa/thua, không viết kiểu có 3 điểm hay chắc thắng.',
    'Chỉ được nhắc cầu thủ trong playersToMention. Nếu playersToMention rỗng, bỏ qua cầu thủ.',
    'Trả về JSON đúng dạng {"summary":"..."} và không thêm field khác.',
    '<match_context>',
    JSON.stringify(context),
    '</match_context>',
  ].join('\n');
}

export function parseMatchInsightResponse(raw) {
  const clean = stripCodeFence(String(raw || '').trim());
  const parsedSummary = parseSummaryJson(clean) || parseSummaryJson(extractFirstJsonObject(clean));
  return normalizeInsightText(parsedSummary || clean);
}

export function validateMatchInsightSummary(summary, playersToMention = [], options = {}) {
  const clean = normalizeInsightText(summary);
  if (clean.length < 20) return { ok: false, reason: 'too_short' };
  if (clean.length > 700) return { ok: false, reason: 'too_long' };
  if (/^\s*[-*]\s+/m.test(clean)) return { ok: false, reason: 'list_format' };

  if (!VIETNAMESE_DIACRITIC_PATTERN.test(clean)) {
    return { ok: false, reason: 'missing_vietnamese_diacritics' };
  }
  if (/[{}]/.test(clean)) return { ok: false, reason: 'invalid_json_leak' };

  const normalized = normalizePlayerToken(clean);
  if (options?.match && !mentionsBothMatchTeams(normalized, options.match)) {
    return { ok: false, reason: 'missing_match_teams' };
  }

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

  const sentenceCount = clean.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean).length;
  if (sentenceCount < 2) return { ok: false, reason: 'too_few_sentences' };
  if (sentenceCount > 4) return { ok: false, reason: 'too_many_sentences' };

  return { ok: true, summary: clean };
}

export function normalizeInsightText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function matchInsightAngle(match) {
  const index = Math.abs(Number(match?.matchNo) || 0) % ANALYSIS_ANGLES.length;
  return ANALYSIS_ANGLES[index];
}

function mentionsBothMatchTeams(normalizedSummary, match) {
  if (!match?.homeTeam || !match?.awayTeam || match.homeTeam === 'Unknown' || match.awayTeam === 'Unknown') {
    return true;
  }
  return containsAnyToken(normalizedSummary, teamMentionTokens(match.homeTeam))
    && containsAnyToken(normalizedSummary, teamMentionTokens(match.awayTeam));
}

function containsAnyToken(normalizedSummary, tokens) {
  return tokens.some((token) => token && normalizedSummary.includes(token));
}

function teamMentionTokens(team) {
  const meta = TEAM_META[team] || {};
  return [team, meta.viName, meta.fifaCode]
    .map(normalizePlayerToken)
    .filter(Boolean);
}

function stripCodeFence(value) {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseSummaryJson(value) {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value);
    return typeof parsed?.summary === 'string' ? parsed.summary : '';
  } catch {
    return '';
  }
}

function extractFirstJsonObject(value) {
  const start = value.indexOf('{');
  if (start < 0) return '';

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return value.slice(start, index + 1);
  }
  return '';
}
