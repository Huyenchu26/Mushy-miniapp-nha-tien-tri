import { verifyRequest } from './_verify.js';

const PRIMARY_SOURCE = 'worldcup26.ir';
const ESPN_SOURCE = 'espn';
const MERGED_SOURCE = 'worldcup26.ir+espn';
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
    if (isTournamentWindow(fetchedAt)) {
      const fallback = await fetchFromEspn(fetchedAt);
      if (fallback.ok) {
        const merged = mergeLiveScoreSources(primary.value.matches, fallback.value.matches);
        if (merged.usedFallback) {
          return sendLiveScores(res, {
            ...primary.value,
            source: MERGED_SOURCE,
            sourceUrl: `${PRIMARY_URL} + ${fallback.value.sourceUrl}`,
            fallbackReason: merged.reason,
            fallbackMatchCount: merged.fallbackMatchCount,
            goalDetailSource: merged.goalDetailCount > 0 ? fallback.value.source : '',
            matches: merged.matches,
          });
        }
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
        source: PRIMARY_SOURCE,
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
    const urls = buildEspnScoreboardUrls(fetchedAt);
    const responses = await Promise.allSettled(urls.map((url) => fetchJson(url)));
    const eventsById = new Map();
    const errors = [];

    responses.forEach((result, index) => {
      if (result.status !== 'fulfilled') {
        errors.push(result.reason?.message || `${urls[index]} fetch failed`);
        return;
      }

      const events = Array.isArray(result.value?.events) ? result.value.events : [];
      for (const event of events) {
        const id = String(event?.id || event?.uid || `${event?.shortName || ''}-${event?.date || ''}`);
        if (id && !eventsById.has(id)) eventsById.set(id, event);
      }
    });

    const events = [...eventsById.values()];
    if (!events.length) {
      throw new Error(errors.length ? `espn returned no events (${errors.join('; ')})` : 'espn returned no events');
    }
    const matches = await Promise.all(events.map((event) => normalizeEspnEventWithSummary(event)));

    return {
      ok: true,
      value: {
        source: ESPN_SOURCE,
        sourceUrl: urls.join(', '),
        fetchedAt,
        matches: matches.filter(Boolean),
      },
    };
  } catch (err) {
    return { ok: false, error: err.message || 'espn fetch failed' };
  }
}

function buildEspnScoreboardUrls(fetchedAt) {
  const base = new Date(fetchedAt);
  const dayMs = 24 * 60 * 60 * 1000;
  return [-1, 0, 1].map((offset) => {
    const date = new Date(base.getTime() + offset * dayMs);
    const dateKey = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('');
    return `${ESPN_SCOREBOARD_URL}?dates=${dateKey}`;
  });
}

async function normalizeEspnEventWithSummary(event) {
  const base = normalizeEspnEvent(event);
  if (!base) return null;
  const inlineGoals = normalizeEspnGoalDetails(event?.competitions?.[0]?.details, event);
  if (inlineGoals.length > 0) {
    return withGoalDetails(base, inlineGoals);
  }
  if (!shouldFetchEspnSummary(base)) return base;

  try {
    const summary = await fetchJson(`https://site.web.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${encodeURIComponent(event.id)}`);
    const details = summary?.header?.competitions?.[0]?.details || [];
    const goals = normalizeEspnGoalDetails(details, event);
    return withGoalDetails(base, goals);
  } catch {
    return base;
  }
}

function withGoalDetails(match, goals) {
  return {
    ...match,
    goals,
    goalScorers: goals,
    homeScorers: goals.filter((goal) => goal.side === 'home'),
    awayScorers: goals.filter((goal) => goal.side === 'away'),
    homeGoalScorers: goals.filter((goal) => goal.side === 'home'),
    awayGoalScorers: goals.filter((goal) => goal.side === 'away'),
  };
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
    source: PRIMARY_SOURCE,
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

function mergeLiveScoreSources(primaryMatches, fallbackMatches) {
  const fallbackByPair = new Map();
  let fallbackMatchCount = 0;
  let goalDetailCount = 0;
  for (const match of fallbackMatches || []) {
    fallbackByPair.set(matchPairKey(match.homeTeam, match.awayTeam), match);
  }

  const matches = (primaryMatches || []).map((match) => {
    const fallback = findFallbackMatch(match, fallbackByPair);
    if (!fallback) return match;

    if (shouldUseFallbackMatch(match, fallback)) {
      fallbackMatchCount += 1;
      return {
        ...fallback,
        fallbackFrom: match.source || PRIMARY_SOURCE,
        primaryStatus: match.status,
      };
    }

    if (hasGoalDetails(match) || !hasGoalDetails(fallback)) return match;
    goalDetailCount += 1;
    return {
      ...match,
      goalDetailSource: fallback.source || ESPN_SOURCE,
      goals: fallback.goals || fallback.goalScorers || [],
      goalScorers: fallback.goalScorers || fallback.goals || [],
      homeScorers: fallback.homeScorers || fallback.homeGoalScorers || [],
      awayScorers: fallback.awayScorers || fallback.awayGoalScorers || [],
      homeGoalScorers: fallback.homeGoalScorers || fallback.homeScorers || [],
      awayGoalScorers: fallback.awayGoalScorers || fallback.awayScorers || [],
    };
  });

  for (const match of fallbackMatches || []) {
    const alreadyInPrimary = hasPrimaryPair(primaryMatches, match);
    if (alreadyInPrimary || !hasUsefulLiveScore(match)) continue;
    fallbackMatchCount += 1;
    matches.push(match);
  }

  return {
    matches,
    fallbackMatchCount,
    goalDetailCount,
    usedFallback: fallbackMatchCount > 0 || goalDetailCount > 0,
    reason: fallbackMatchCount > 0
      ? `espn filled ${fallbackMatchCount} stale or missing match${fallbackMatchCount > 1 ? 'es' : ''}`
      : `espn filled goal details for ${goalDetailCount} match${goalDetailCount > 1 ? 'es' : ''}`,
  };
}

function hasPrimaryPair(primaryMatches, match) {
  const directKey = matchPairKey(match.homeTeam, match.awayTeam);
  const reverseKey = matchPairKey(match.awayTeam, match.homeTeam);
  return (primaryMatches || []).some((primary) => {
    const primaryKey = matchPairKey(primary.homeTeam, primary.awayTeam);
    return primaryKey === directKey || primaryKey === reverseKey;
  });
}

function findFallbackMatch(primary, fallbackByPair) {
  const direct = fallbackByPair.get(matchPairKey(primary.homeTeam, primary.awayTeam));
  if (direct) return direct;

  const reverse = fallbackByPair.get(matchPairKey(primary.awayTeam, primary.homeTeam));
  if (!reverse) return null;
  return {
    ...reverse,
    homeTeam: primary.homeTeam,
    awayTeam: primary.awayTeam,
    homeScore: reverse.awayScore,
    awayScore: reverse.homeScore,
    reversed: true,
  };
}

function shouldUseFallbackMatch(primary, fallback) {
  if (!fallback || !hasUsefulLiveScore(fallback)) return false;

  const primaryRank = liveStatusRank(primary);
  const fallbackRank = liveStatusRank(fallback);
  const primaryScoreTotal = scoreTotal(primary);
  const fallbackScoreTotal = scoreTotal(fallback);

  if (primaryRank === 0 && fallbackRank > 0) return true;
  if (fallbackRank > primaryRank && (fallbackScoreTotal > 0 || fallbackRank >= 3)) return true;
  if (primaryRank <= 1 && primaryScoreTotal === 0 && fallbackScoreTotal > 0) return true;
  return false;
}

function liveStatusRank(match) {
  if (match?.status === 'finished') return 3;
  if (match?.status === 'extra_time' || match?.status === 'penalties') return 2;
  if (match?.status === 'in_progress') return 1;
  return 0;
}

function scoreTotal(match) {
  return Number(match?.homeScore || 0) + Number(match?.awayScore || 0);
}

function hasUsefulLiveScore(match) {
  return match?.status !== 'scheduled' || scoreTotal(match) > 0;
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
    source: ESPN_SOURCE,
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
      const participantAthlete = detail?.participants?.find((item) => item?.athlete)?.athlete;
      const involvedAthlete = Array.isArray(detail?.athletesInvolved) ? detail.athletesInvolved[0] : null;
      const scorer = participantAthlete || involvedAthlete || {};
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
