export function buildDailyRecap(standings = [], matches = [], dateKey = '') {
  const finishedToday = matches.filter((match) => match.status === 'finished' && match.matchDay === dateKey);
  const leader = standings[0];
  const exactLeader = standings.slice().sort((a, b) => b.exactCount - a.exactCount)[0];
  const parts = [`${finishedToday.length} trận đã chốt hôm nay.`];
  if (leader) parts.push(`${leader.displayName} đang dẫn đầu với ${leader.total}đ.`);
  if (exactLeader?.exactCount) parts.push(`${exactLeader.displayName} có ${exactLeader.exactCount} lần exact.`);
  return parts.join(' ');
}

export function nearestReminderMatch(matches = [], nowMs = Date.now()) {
  return matches
    .filter((match) => match.homeTeam !== 'Unknown' && match.awayTeam !== 'Unknown')
    .filter((match) => new Date(match.kickoffAt).getTime() > nowMs)
    .sort((a, b) => new Date(a.kickoffAt) - new Date(b.kickoffAt))[0] || null;
}
