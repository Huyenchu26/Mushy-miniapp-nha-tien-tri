import { DAILY_QUESTIONS, MATCHES, TEAM_META } from './worldcup-data.js';

export const SCORE_RULES = {
  exact: 5,
  diff: 3,
  outcome: 2,
  upsetGap1: 20,
  upsetGap2: 40,
  upsetBonus1: 1,
  upsetBonus2: 2,
  drawUpsetGap: 30,
  drawUpsetBonus: 1,
  streakEvery: 3,
  streakBonus: 5,
};

export function outcome(home, away) {
  if (home > away) return 1;
  if (home < away) return -1;
  return 0;
}

export function normalizeAnswer(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function matchBasePoints(prediction, match) {
  if (!prediction || !isFinished(match)) return null;

  const predictedHome = Number(prediction.homePred);
  const predictedAway = Number(prediction.awayPred);
  const actualHome = Number(match.homeScore);
  const actualAway = Number(match.awayScore);

  if (predictedHome === actualHome && predictedAway === actualAway) {
    return SCORE_RULES.exact;
  }

  const predictedOutcome = outcome(predictedHome, predictedAway);
  const actualOutcome = outcome(actualHome, actualAway);
  if (predictedOutcome !== actualOutcome) return 0;

  const predictedDiff = predictedHome - predictedAway;
  const actualDiff = actualHome - actualAway;
  if (predictedDiff === actualDiff) return SCORE_RULES.diff;

  return SCORE_RULES.outcome;
}

export function matchPoints(prediction, match) {
  const base = matchBasePoints(prediction, match);
  if (base == null) return 0;
  const subtotal = base + matchUpsetBonus(prediction, match, base);
  return subtotal * (prediction.doubleDown ? 2 : 1);
}

export function matchScoreBreakdown(prediction, match) {
  const base = matchBasePoints(prediction, match);
  const upsetBonus = matchUpsetBonus(prediction, match, base);
  const multiplier = prediction?.doubleDown ? 2 : 1;
  return {
    base: base ?? 0,
    upsetBonus,
    multiplier,
    total: base == null ? 0 : (base + upsetBonus) * multiplier,
  };
}

export function matchUpsetBonus(prediction, match, knownBase = undefined) {
  const base = knownBase === undefined ? matchBasePoints(prediction, match) : knownBase;
  if (!prediction || !isFinished(match) || !base) return 0;

  const homeRank = TEAM_META[match.homeTeam]?.fifaRank;
  const awayRank = TEAM_META[match.awayTeam]?.fifaRank;
  if (!Number.isFinite(homeRank) || !Number.isFinite(awayRank)) return 0;

  const actualOutcome = outcome(Number(match.homeScore), Number(match.awayScore));
  if (actualOutcome === 0) {
    const gap = Math.abs(homeRank - awayRank);
    return gap >= SCORE_RULES.drawUpsetGap ? SCORE_RULES.drawUpsetBonus : 0;
  }

  const winnerRank = actualOutcome === 1 ? homeRank : awayRank;
  const loserRank = actualOutcome === 1 ? awayRank : homeRank;
  const weakerWonGap = winnerRank - loserRank;
  if (weakerWonGap >= SCORE_RULES.upsetGap2) return SCORE_RULES.upsetBonus2;
  if (weakerWonGap >= SCORE_RULES.upsetGap1) return SCORE_RULES.upsetBonus1;
  return 0;
}

export function streakBonus(predictionsByMatchNo, matches = MATCHES) {
  let exactRun = 0;
  let bonus = 0;

  for (const match of finishedMatches(matches)) {
    const prediction = predictionsByMatchNo.get(Number(match.matchNo));
    const base = matchBasePoints(prediction, match);
    if (base === SCORE_RULES.exact) {
      exactRun += 1;
      if (exactRun % SCORE_RULES.streakEvery === 0) bonus += SCORE_RULES.streakBonus;
    } else {
      exactRun = 0;
    }
  }

  return bonus;
}

export function dailyPoints(answer, question) {
  if (!answer || !question?.correctAnswer) return 0;
  if (normalizeAnswer(answer.answer) !== normalizeAnswer(question.correctAnswer)) return 0;
  return Number(question.points || 2);
}

export function computeStandings({
  participants = [],
  predictions = [],
  dailyAnswers = [],
  matches = MATCHES,
  questions = DAILY_QUESTIONS,
} = {}) {
  const matchesByNo = new Map(matches.map((match) => [Number(match.matchNo), match]));
  const questionsByKey = new Map(questions.map((question) => [question.key, question]));
  const predictionsByParticipant = groupBy(predictions, (prediction) => prediction.participantId);
  const answersByParticipant = groupBy(dailyAnswers, (answer) => answer.participantId);

  const rows = participants.map((participant) => {
    const participantPredictions = predictionsByParticipant.get(participant.id) || [];
    const participantAnswers = answersByParticipant.get(participant.id) || [];
    const predictionMap = new Map(
      participantPredictions.map((prediction) => [Number(prediction.matchNo), prediction])
    );

    let matchPts = 0;
    let upsetPts = 0;
    let exactCount = 0;
    let finishedPredicted = 0;

    for (const prediction of participantPredictions) {
      const match = matchesByNo.get(Number(prediction.matchNo));
      if (!match || !isFinished(match)) continue;
      const base = matchBasePoints(prediction, match);
      const breakdown = matchScoreBreakdown(prediction, match);
      if (base != null) finishedPredicted += 1;
      if (base === SCORE_RULES.exact) exactCount += 1;
      matchPts += breakdown.total;
      upsetPts += breakdown.upsetBonus * breakdown.multiplier;
    }

    const streakPts = streakBonus(predictionMap, matches);
    const dailyPts = participantAnswers.reduce((sum, answer) => {
      const question = questionsByKey.get(answer.questionKey);
      return sum + dailyPoints(answer, question);
    }, 0);

    return {
      participantId: participant.id,
      displayName: participant.displayName,
      total: matchPts + streakPts + dailyPts,
      matchPts,
      upsetPts,
      streakPts,
      dailyPts,
      predictedCount: participantPredictions.length,
      exactCount,
      finishedPredicted,
      joinedAt: participant.createdAt,
    };
  });

  return rows
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.exactCount !== a.exactCount) return b.exactCount - a.exactCount;
      if (b.predictedCount !== a.predictedCount) return b.predictedCount - a.predictedCount;
      return String(a.displayName).localeCompare(String(b.displayName), 'vi');
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function isFinished(match) {
  return (
    match?.status === 'finished' &&
    Number.isFinite(Number(match.homeScore)) &&
    Number.isFinite(Number(match.awayScore))
  );
}

export function finishedMatches(matches = MATCHES) {
  return matches
    .filter(isFinished)
    .slice()
    .sort((a, b) => Number(a.matchNo) - Number(b.matchNo));
}

export function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key) || [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return map;
}
