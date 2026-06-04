import { DAILY_QUESTIONS, GROUPS, MATCHES, TEAM_META } from './worldcup-data.js';

export function validateWorldCupData({
  matches = MATCHES,
  questions = DAILY_QUESTIONS,
  groups = GROUPS,
  previousMatches = null,
} = {}) {
  const errors = [];
  const warnings = [];
  const expectedTeams = new Set(Object.values(groups).flat());
  const metaTeams = new Set(Object.keys(TEAM_META));
  const matchNos = new Set();

  if (matches.length !== 72) errors.push(`Expected 72 group matches, found ${matches.length}.`);

  for (const match of matches) {
    const label = `Match ${match.matchNo || '?'}`;
    if (!Number.isInteger(match.matchNo)) errors.push(`${label}: matchNo must be an integer.`);
    if (matchNos.has(match.matchNo)) errors.push(`${label}: duplicate matchNo.`);
    matchNos.add(match.matchNo);

    if (!groups[match.group]) errors.push(`${label}: unknown group ${match.group}.`);
    if (!expectedTeams.has(match.homeTeam)) errors.push(`${label}: unknown home team ${match.homeTeam}.`);
    if (!expectedTeams.has(match.awayTeam)) errors.push(`${label}: unknown away team ${match.awayTeam}.`);
    if (!TEAM_META[match.homeTeam]) errors.push(`${label}: missing TEAM_META for ${match.homeTeam}.`);
    if (!TEAM_META[match.awayTeam]) errors.push(`${label}: missing TEAM_META for ${match.awayTeam}.`);
    if (match.homeTeam === match.awayTeam) errors.push(`${label}: team cannot play itself.`);
    if (match.stage !== 'group') errors.push(`${label}: stage must be group for v1.`);
    if (!isValidDate(match.kickoffAt)) errors.push(`${label}: invalid kickoffAt.`);

    if (match.status === 'finished') {
      if (!isScore(match.homeScore) || !isScore(match.awayScore)) {
        errors.push(`${label}: finished matches must have valid scores.`);
      }
    } else if (match.status !== 'scheduled') {
      errors.push(`${label}: status must be scheduled or finished.`);
    }
  }

  for (let no = 1; no <= 72; no += 1) {
    if (!matchNos.has(no)) errors.push(`Missing matchNo ${no}.`);
  }

  for (const [group, teams] of Object.entries(groups)) {
    const groupMatches = matches.filter((match) => match.group === group);
    if (groupMatches.length !== 6) errors.push(`Group ${group}: expected 6 matches, found ${groupMatches.length}.`);
    for (const team of teams) {
      const count = groupMatches.filter((match) => match.homeTeam === team || match.awayTeam === team).length;
      if (count !== 3) errors.push(`Group ${group}: ${team} should play 3 matches, found ${count}.`);
    }
  }

  for (const team of expectedTeams) {
    if (!metaTeams.has(team)) errors.push(`${team}: missing TEAM_META entry.`);
    const rank = TEAM_META[team]?.fifaRank;
    if (!Number.isInteger(rank) || rank < 1) errors.push(`${team}: invalid FIFA rank.`);
  }

  for (const question of questions) {
    if (!question.key) errors.push('Daily question missing key.');
    if (!question.prompt || question.prompt.length > 280) {
      errors.push(`${question.key}: prompt is required and must be <= 280 chars.`);
    }
    if (!isValidDate(question.closesAt)) errors.push(`${question.key}: invalid closesAt.`);
  }

  if (previousMatches) {
    const previousByNo = new Map(previousMatches.map((match) => [Number(match.matchNo), match]));
    for (const match of matches) {
      const previous = previousByNo.get(Number(match.matchNo));
      if (!previous) continue;
      if (previous.status === 'finished' && match.status !== 'finished') {
        errors.push(`Match ${match.matchNo}: cannot revert finished status.`);
      }
      if (previous.status === 'finished' && (!isScore(match.homeScore) || !isScore(match.awayScore))) {
        errors.push(`Match ${match.matchNo}: cannot remove score from a finished match.`);
      }
      const deltaMinutes = Math.abs(new Date(match.kickoffAt) - new Date(previous.kickoffAt)) / 60000;
      if (deltaMinutes > 15) {
        warnings.push(`Match ${match.matchNo}: kickoff changed by ${Math.round(deltaMinutes)} minutes.`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function isValidDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isScore(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 99;
}
