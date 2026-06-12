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
  champion: 20,
  topScorer: 10,
  youngPlayer: 10,
  goldenBall: 10,
};

export function outcome(home, away) {
  if (home > away) return 1;
  if (home < away) return -1;
  return 0;
}

export function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[()·.,]/g, ' ')
    .replace(/[-_]/g, ' ')
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

export function dailyAnswerResult(answer, question, now = new Date()) {
  const answered = !!answer;
  const scorable = question?.kind === 'trivia'
    ? !!question.correctAnswer
    : isQuestionScorable(question, now);
  const rawPoints = dailyPoints(answer, question);
  const correct = scorable && rawPoints > 0;
  const points = scorable ? rawPoints : 0;
  return {
    answered,
    scorable,
    correct,
    points,
    scoreText: points > 0 ? `+${points}đ` : '0đ',
    status: scorable ? (correct ? 'scored' : 'zero') : answered ? 'saved' : 'open',
  };
}

export function isQuestionScorable(question, now = new Date()) {
  if (!question?.correctAnswer) return false;
  if (!question.closesAt) return true;
  const closeMs = new Date(question.closesAt).getTime();
  if (!Number.isFinite(closeMs)) return true;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Number.isFinite(nowMs) && nowMs >= closeMs;
}

export function longTermPoints(bet, config) {
  if (!bet || !config) return { total: 0, champion: 0, topScorer: 0, youngPlayer: 0, goldenBall: 0 };
  const champion = matchesAnswer(bet.champion, config.championActual) ? SCORE_RULES.champion : 0;
  const topScorer = matchesAnswer(bet.topScorer, config.topScorerActual) ? SCORE_RULES.topScorer : 0;
  const youngPlayer = matchesAnswer(bet.youngPlayer, config.youngPlayerActual) ? SCORE_RULES.youngPlayer : 0;
  const goldenBall = matchesAnswer(bet.goldenBall, config.goldenBallActual) ? SCORE_RULES.goldenBall : 0;
  return { total: champion + topScorer + youngPlayer + goldenBall, champion, topScorer, youngPlayer, goldenBall };
}

export function filterCompetitionWindow({ matches = MATCHES, predictions = [], answers = [], questions = DAILY_QUESTIONS, mode = 'total', now = new Date() } = {}) {
  if (mode === 'total') return { matches, predictions, answers, questions };

  const selectedMatches = matches.filter((match) => mode === 'week'
    ? isSameIsoWeek(new Date(match.kickoffAt), now)
    : normalizeStage(match.stage) === currentStage(matches, now));
  const matchNos = new Set(selectedMatches.map((match) => Number(match.matchNo)));
  const selectedQuestions = mode === 'week'
    ? questions.filter((question) => isSameIsoWeek(parseQuestionWindowDate(question.date || question.closesAt), now))
    : [];
  const questionKeys = new Set(selectedQuestions.map((question) => question.key));
  return {
    matches: selectedMatches,
    predictions: predictions.filter((prediction) => matchNos.has(Number(prediction.matchNo))),
    answers: answers.filter((answer) => questionKeys.has(answer.questionKey)),
    questions: selectedQuestions,
  };
}

export function computeStandings({
  participants = [],
  predictions = [],
  dailyAnswers = [],
  matches = MATCHES,
  questions = DAILY_QUESTIONS,
  longTermBets = [],
  appConfig = null,
  manualAdjustments = [],
  includeLongTerm = true,
  now = new Date(),
} = {}) {
  const matchesByNo = new Map(matches.map((match) => [Number(match.matchNo), match]));
  const questionsByKey = new Map(questions.map((question) => [question.key, question]));
  const predictionsByParticipant = groupBy(predictions, (prediction) => prediction.participantId);
  const answersByParticipant = groupBy(dailyAnswers, (answer) => answer.participantId);
  const betsByParticipant = new Map(longTermBets.map((bet) => [bet.participantId, bet]));
  const manualPointsByParticipant = groupManualPoints(manualAdjustments);

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
      return sum + dailyAnswerResult(answer, question, now).points;
    }, 0);
    const longTerm = includeLongTerm
      ? longTermPoints(betsByParticipant.get(participant.id), appConfig)
      : { total: 0, champion: 0, topScorer: 0, youngPlayer: 0, goldenBall: 0 };
    const manualPts = manualPointsByParticipant.get(participant.id) || 0;

    return {
      participantId: participant.id,
      displayName: participant.displayName,
      total: matchPts + streakPts + dailyPts + longTerm.total + manualPts,
      matchPts,
      upsetPts,
      streakPts,
      dailyPts,
      manualPts,
      longTermPts: longTerm.total,
      longTermBreakdown: longTerm,
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

function matchesAnswer(value, actual) {
  const normalizedActual = normalizeAnswer(actual);
  if (!normalizedActual) return false;
  const normalizedValue = normalizeAnswer(value);
  if (normalizedValue === normalizedActual) return true;
  return answerCore(value) === answerCore(actual);
}

function answerCore(value) {
  return normalizeAnswer(String(value || '').split(/[·(]/)[0]);
}

function groupManualPoints(adjustments = []) {
  const map = new Map();
  for (const adjustment of adjustments) {
    const participantId = adjustment.participantId || adjustment.targetUserId;
    if (!participantId) continue;
    map.set(participantId, (map.get(participantId) || 0) + Number(adjustment.deltaPoints || 0));
  }
  return map;
}

function parseQuestionWindowDate(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0));
  }
  return new Date(value);
}

function normalizeStage(stage) {
  return ({ r32: 'round32', r16: 'round16', qf: 'quarter', sf: 'semi' })[stage] || stage;
}

function currentStage(matches, now) {
  const started = matches
    .filter((match) => new Date(match.kickoffAt).getTime() <= now.getTime())
    .sort((a, b) => new Date(b.kickoffAt) - new Date(a.kickoffAt));
  return normalizeStage(started[0]?.stage || 'group');
}

function isSameIsoWeek(left, right) {
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false;
  const a = isoWeekKey(left);
  const b = isoWeekKey(right);
  return a === b;
}

function isoWeekKey(date) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
  return `${value.getUTCFullYear()}-${week}`;
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
