import { verifyRequest } from './_verify.js';

const PRIMARY_URL = 'https://worldcup26.ir/get/games';
const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const FETCH_TIMEOUT_MS = 6500;

const TEAM_ALIASES = new Map([
  ['south korea', 'Korea Republic'],
  ['korea republic', 'Korea Republic'],
  ['czech republic', 'Czechia'],
  ['czechia', 'Czechia'],
  ['ivory coast', "Cote d'Ivoire"],
  ["cote d'ivoire", "Cote d'Ivoire"],
  ['cote d ivoire', "Cote d'Ivoire"],
  ['curacao', 'Curacao'],
  ['cape verde', 'Cabo Verde'],
  ['cabo verde', 'Cabo Verde'],
  ['democratic republic of the congo', 'Congo DR'],
  ['dr congo', 'Congo DR'],
  ['congo dr', 'Congo DR'],
  ['united states', 'United States'],
  ['usa', 'United States'],
  ['usmnt', 'United States'],
]);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const ctx = await verifyRequest(req);
  if (!ctx) return res.status(401).json({ error: 'unauthorized' });

  const fetchedAt = new Date().toISOString();
  const primary = await fetchFromWorldCup26(fetchedAt);
  if (primary.ok) {
    if (isTournamentWindow(fetchedAt) && (!hasUsefulLiveScores(primary.value.matches) || missingGoalDetails(primary.value.matches))) {
      const fallback = await fetchFromEspn(fetchedAt);
      if (fallback.ok && hasUsefulLiveScores(fallback.value.matches)) {
        if (hasUsefulLiveScores(primary.value.matches)) {
          return sendLiveScores(res, {
            ...primary.value,
            goalDetailSource: fallback.value.source,
            matches: mergeGoalDetails(primary.value.matches, fallback.value.matches),
          });
        }
        return sendLiveScores(res, {
          ...fallback.value,
          fallbackReason: 'worldcup26 returned no active scores',
        });
      }
    }
    return sendLiveScores(res, primary.value);
  }

  const fallback = await fetchFromEspn(fetchedAt);
  if (fallback.ok) {
    return sendLiveScores(res, {
      ...fallback.value,
      fallbackReason: primary.error,
    });
  }

  return res.status(502).json({
    error: 'live_scores_unavailable',
    primaryError: primary.error,
    fallbackError: fallback.error,
    fetchedAt,
  });
}

function sendLiveScores(res, payload) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
  return res.status(200).json(payload);
}

async function fetchFromWorldCup26(fetchedAt) {
  try {
    const payload = await fetchJson(PRIMARY_URL);
    const games = Array.isArray(payload?.games) ? payload.games : [];
    if (!games.length) throw new Error('worldcup26 returned no games');

    return {
      ok: true,
      value: {
        source: 'worldcup26.ir',
        sourceUrl: PRIMARY_URL,
        fetchedAt,
        matches: games.map(normalizeWorldCup26Game).filter(Boolean),
      },
    };
  } catch (err) {
    return { ok: false, error: err.message || 'worldcup26 fetch failed' };
  }
}

async function fetchFromEspn(fetchedAt) {
  try {
    const payload = await fetchJson(ESPN_SCOREBOARD_URL);
    const events = Array.isArray(payload?.events) ? payload.events : [];
    if (!events.length) throw new Error('espn returned no events');
    const matches = await Promise.all(events.map((event) => normalizeEspnEventWithSummary(event)));

    return {
      ok: true,
      value: {
        source: 'espn',
        sourceUrl: ESPN_SCOREBOARD_URL,
        fetchedAt,
        matches: matches.filter(Boolean),
      },
    };
  } catch (err) {
    return { ok: false, error: err.message || 'espn fetch failed' };
  }
}

async function normalizeEspnEventWithSummary(event) {
  const base = normalizeEspnEvent(event);
  if (!base) return null;
  if (!shouldFetchEspnSummary(base)) return base;

  try {
    const summary = await fetchJson(`https://site.web.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${encodeURIComponent(event.id)}`);
    const details = summary?.header?.competitions?.[0]?.details || [];
    const goals = normalizeEspnGoalDetails(details, event);
    return {
      ...base,
      goals,
      goalScorers: goals,
      homeScorers: goals.filter((goal) => goal.side === 'home'),
      awayScorers: goals.filter((goal) => goal.side === 'away'),
    };
  } catch {
    return base;
  }
}

function shouldFetchEspnSummary(match) {
  const homeScore = Number(match?.homeScore || 0);
  const awayScore = Number(match?.awayScore || 0);
  return match?.status !== 'scheduled' || homeScore > 0 || awayScore > 0;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MushyMiniApp-NhaTienTri/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeWorldCup26Game(game) {
  const homeScore = parseScore(game.home_score);
  const awayScore = parseScore(game.away_score);
  const homeTeam = normalizeTeamName(game.home_team_name_en || game.home_team_label);
  const awayTeam = normalizeTeamName(game.away_team_name_en || game.away_team_label);
  if (!homeTeam || !awayTeam) return null;
  const statusText = [
    game.status,
    game.status_label,
    game.match_status,
    game.time_elapsed,
    game.type,
  ].filter(Boolean).join(' ');

  return {
    externalId: String(game.id || game._id || ''),
    matchNo: parseIntOrNull(game.id),
    stage: String(game.type || '').toLowerCase(),
    group: game.group || null,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    status: normalizeWorldCup26Status(game),
    finishType: normalizeFinishType(statusText),
    statusDetail: statusText || null,
    minute: normalizeMinute(game.time_elapsed),
    rawClock: normalizeRawClock(game.time_elapsed),
  };
}

function isTournamentWindow(value) {
  const time = new Date(value).getTime();
  return time >= Date.parse('2026-06-11T00:00:00Z') && time <= Date.parse('2026-07-20T23:59:59Z');
}

function hasUsefulLiveScores(matches) {
  return (matches || []).some((match) => {
    const homeScore = Number(match.homeScore || 0);
    const awayScore = Number(match.awayScore || 0);
    return match.status !== 'scheduled' || homeScore > 0 || awayScore > 0;
  });
}

function normalizeWorldCup26Status(game) {
  const elapsed = String(game.time_elapsed || '').toLowerCase();
  const statusText = [
    game.status,
    game.status_label,
    game.match_status,
    game.time_elapsed,
    game.type,
  ].filter(Boolean).join(' ').toLowerCase();
  if (String(game.finished).toUpperCase() === 'TRUE') return 'finished';
  if (!elapsed || elapsed === 'notstarted') return 'scheduled';
  if (isPenaltyText(statusText)) return 'penalties';
  if (isExtraTimeText(statusText)) return 'extra_time';
  return 'in_progress';
}

function missingGoalDetails(matches) {
  return (matches || []).some((match) => {
    const scoreTotal = Number(match?.homeScore || 0) + Number(match?.awayScore || 0);
    if (scoreTotal <= 0) return false;
    return !hasGoalDetails(match);
  });
}

function hasGoalDetails(match) {
  return [
    match?.goals,
    match?.goalScorers,
    match?.homeScorers,
    match?.awayScorers,
    match?.homeGoalScorers,
    match?.awayGoalScorers,
  ].some((value) => Array.isArray(value) && value.length > 0);
}

function mergeGoalDetails(primaryMatches, fallbackMatches) {
  const fallbackByPair = new Map();
  for (const match of fallbackMatches || []) {
    fallbackByPair.set(matchPairKey(match.homeTeam, match.awayTeam), match);
  }
  return (primaryMatches || []).map((match) => {
    if (hasGoalDetails(match)) return match;
    const fallback = fallbackByPair.get(matchPairKey(match.homeTeam, match.awayTeam));
    if (!fallback || !hasGoalDetails(fallback)) return match;
    return {
      ...match,
      goals: fallback.goals || fallback.goalScorers || [],
      goalScorers: fallback.goalScorers || fallback.goals || [],
      homeScorers: fallback.homeScorers || fallback.homeGoalScorers || [],
      awayScorers: fallback.awayScorers || fallback.awayGoalScorers || [],
      homeGoalScorers: fallback.homeGoalScorers || fallback.homeScorers || [],
      awayGoalScorers: fallback.awayGoalScorers || fallback.awayScorers || [],
    };
  });
}

function normalizeEspnEvent(event) {
  const competition = event?.competitions?.[0];
  const competitors = competition?.competitors || [];
  const home = competitors.find((item) => item.homeAway === 'home');
  const away = competitors.find((item) => item.homeAway === 'away');
  const homeTeam = normalizeTeamName(home?.team?.displayName || home?.team?.name);
  const awayTeam = normalizeTeamName(away?.team?.displayName || away?.team?.name);
  if (!homeTeam || !awayTeam) return null;

  const status = competition?.status || event?.status;
  const statusDetail = [
    status?.type?.shortDetail,
    status?.type?.detail,
    status?.displayClock,
  ].filter(Boolean).join(' ');
  return {
    externalId: String(event.id || competition?.id || ''),
    matchNo: null,
    stage: event?.season?.slug || null,
    group: null,
    homeTeam,
    awayTeam,
    homeScore: parseScore(home?.score),
    awayScore: parseScore(away?.score),
    status: normalizeEspnStatus(status),
    finishType: normalizeFinishType(statusDetail),
    statusDetail: statusDetail || null,
    period: status?.period || null,
    minute: normalizeMinute(status?.displayClock),
    rawClock: status?.displayClock || status?.type?.shortDetail || null,
  };
}

function normalizeEspnGoalDetails(details, event) {
  const detailRows = Array.isArray(details) ? details : details ? [details] : [];
  const competition = event?.competitions?.[0];
  const competitors = competition?.competitors || [];
  const home = competitors.find((item) => item.homeAway === 'home');
  const away = competitors.find((item) => item.homeAway === 'away');
  const homeId = String(home?.team?.id || home?.id || '');
  const awayId = String(away?.team?.id || away?.id || '');
  const homeTeam = normalizeTeamName(home?.team?.displayName || home?.team?.name);
  const awayTeam = normalizeTeamName(away?.team?.displayName || away?.team?.name);

  return detailRows
    .filter((detail) => detail?.scoringPlay === true)
    .map((detail) => {
      const teamId = String(detail?.team?.id || '');
      const teamName = normalizeTeamName(detail?.team?.displayName || detail?.team?.name);
      const side = teamId && teamId === homeId
        ? 'home'
        : teamId && teamId === awayId
          ? 'away'
          : canonicalTeamName(teamName) === canonicalTeamName(homeTeam)
            ? 'home'
            : canonicalTeamName(teamName) === canonicalTeamName(awayTeam)
              ? 'away'
              : '';
      const scorer = detail?.participants?.find((item) => item?.athlete)?.athlete || {};
      const name = scorer.displayName || scorer.shortName || '';
      const minute = detail?.clock?.displayValue || detail?.clock?.value || '';
      return {
        side,
        team: teamName,
        name,
        player: name,
        minute: normalizeGoalMinute(minute),
        rawClock: String(minute || ''),
        ownGoal: detail?.ownGoal === true,
        penaltyKick: detail?.penaltyKick === true,
      };
    })
    .filter((goal) => goal.side && goal.name);
}

function normalizeEspnStatus(status) {
  const state = status?.type?.state;
  const completed = status?.type?.completed === true;
  const statusText = [
    status?.type?.shortDetail,
    status?.type?.detail,
    status?.displayClock,
  ].filter(Boolean).join(' ').toLowerCase();
  if (completed || state === 'post') return 'finished';
  if (state === 'in' && isPenaltyText(statusText)) return 'penalties';
  if (state === 'in' && isExtraTimeText(statusText)) return 'extra_time';
  if (state === 'in') return 'in_progress';
  return 'scheduled';
}

function normalizeFinishType(value) {
  const text = String(value || '').toLowerCase();
  if (isPenaltyText(text)) return 'penalties';
  if (isExtraTimeText(text)) return 'aet';
  return null;
}

function isPenaltyText(text) {
  return /\b(pen|pens|penalties|penalty|shootout|shoot-out)\b/i.test(String(text || ''));
}

function isExtraTimeText(text) {
  return /\b(aet|after extra|extra time|hi[eệ]p ph[uụ]|et)\b/i.test(String(text || ''));
}

function normalizeTeamName(value) {
  const clean = String(value || '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  return TEAM_ALIASES.get(canonicalTeamName(clean)) || clean;
}

function canonicalTeamName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function matchPairKey(homeTeam, awayTeam) {
  return `${canonicalTeamName(homeTeam)}::${canonicalTeamName(awayTeam)}`;
}

function parseScore(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function parseIntOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeMinute(value) {
  const text = String(value || '');
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function normalizeRawClock(value) {
  const text = String(value || '').trim();
  return text && text.toLowerCase() !== 'notstarted' ? text : null;
}

function normalizeGoalMinute(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/\d+(?:\+\d+)?/);
  return match ? match[0] : text.replace(/'/g, '');
}
