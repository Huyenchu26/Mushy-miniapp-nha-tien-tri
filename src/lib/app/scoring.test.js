import assert from 'node:assert/strict';
import test from 'node:test';
import { computeStandings, dailyPoints, filterCompetitionWindow, longTermPoints, matchBasePoints, matchPoints, matchUpsetBonus, streakBonus } from './scoring.js';
import { validateWorldCupData } from './data-validation.js';
import { DAILY_QUESTIONS, MATCHES } from './worldcup-data.js';
import { buildMockLiveScorePayload, createMockMembers, createMockPredictions } from './mock-simulation.js';
import { buildDailyRecap, nearestReminderMatch } from './engagement.js';

const finishedMatch = {
  matchNo: 1,
  status: 'finished',
  homeScore: 2,
  awayScore: 1,
};

test('matchBasePoints scores exact, diff, outcome, and wrong predictions', () => {
  assert.equal(matchBasePoints({ homePred: 2, awayPred: 1 }, finishedMatch), 5);
  assert.equal(matchBasePoints({ homePred: 3, awayPred: 2 }, finishedMatch), 3);
  assert.equal(matchBasePoints({ homePred: 1, awayPred: 0 }, finishedMatch), 3);
  assert.equal(matchBasePoints({ homePred: 4, awayPred: 2 }, finishedMatch), 2);
  assert.equal(matchBasePoints({ homePred: 1, awayPred: 1 }, finishedMatch), 0);
});

test('draw predictions use exact, draw outcome, and wrong branches', () => {
  const draw = { matchNo: 2, status: 'finished', homeScore: 1, awayScore: 1 };
  assert.equal(matchBasePoints({ homePred: 1, awayPred: 1 }, draw), 5);
  assert.equal(matchBasePoints({ homePred: 2, awayPred: 2 }, draw), 3);
  assert.equal(matchBasePoints({ homePred: 2, awayPred: 1 }, draw), 0);
});

test('double-down doubles match points only', () => {
  assert.equal(matchPoints({ homePred: 2, awayPred: 1, doubleDown: true }, finishedMatch), 10);
  assert.equal(matchPoints({ homePred: 4, awayPred: 2, doubleDown: true }, finishedMatch), 4);
});

test('underdog bonus rewards correct upsets without changing base scoring', () => {
  const upset = {
    matchNo: 7,
    homeTeam: 'Haiti',
    awayTeam: 'Brazil',
    status: 'finished',
    homeScore: 1,
    awayScore: 0,
  };

  assert.equal(matchBasePoints({ homePred: 1, awayPred: 0 }, upset), 5);
  assert.equal(matchUpsetBonus({ homePred: 1, awayPred: 0 }, upset), 2);
  assert.equal(matchPoints({ homePred: 1, awayPred: 0, doubleDown: false }, upset), 7);
  assert.equal(matchPoints({ homePred: 1, awayPred: 0, doubleDown: true }, upset), 14);
  assert.equal(matchUpsetBonus({ homePred: 0, awayPred: 1 }, upset), 0);
});

test('draw upset bonus rewards correctly predicted draws against much stronger teams', () => {
  const draw = {
    matchNo: 29,
    homeTeam: 'Brazil',
    awayTeam: 'Haiti',
    status: 'finished',
    homeScore: 1,
    awayScore: 1,
  };

  assert.equal(matchBasePoints({ homePred: 0, awayPred: 0 }, draw), 3);
  assert.equal(matchUpsetBonus({ homePred: 0, awayPred: 0 }, draw), 1);
  assert.equal(matchPoints({ homePred: 0, awayPred: 0, doubleDown: false }, draw), 4);
});

test('streak bonus adds 5 points for every 3 consecutive exact scores', () => {
  const matches = [1, 2, 3, 4, 5, 6].map((matchNo) => ({
    matchNo,
    status: 'finished',
    homeScore: 1,
    awayScore: 0,
  }));
  const predictions = new Map(matches.map((match) => [match.matchNo, { homePred: 1, awayPred: 0 }]));
  assert.equal(streakBonus(predictions, matches), 10);

  predictions.set(4, { homePred: 0, awayPred: 0 });
  assert.equal(streakBonus(predictions, matches), 5);
});

test('daily points compare answers case-insensitively', () => {
  assert.equal(dailyPoints({ answer: '  co ' }, { correctAnswer: 'Co', points: 2 }), 2);
  assert.equal(dailyPoints({ answer: 'Có' }, { correctAnswer: 'Co', points: 2 }), 2);
  assert.equal(dailyPoints({ answer: 'Khong' }, { correctAnswer: 'Không', points: 2 }), 2);
  assert.equal(dailyPoints({ answer: 'khong' }, { correctAnswer: 'Co', points: 2 }), 0);
});

test('daily answer points are applied only after the question lock time', () => {
  const participants = [{ id: 'p1', displayName: 'Lan' }];
  const dailyAnswers = [{ participantId: 'p1', questionKey: 'q-test', answer: 'Co' }];
  const questions = [{
    key: 'q-test',
    correctAnswer: 'Co',
    closesAt: '2026-06-12T17:00:00.000Z',
    points: 2,
  }];

  const beforeLock = computeStandings({
    participants,
    dailyAnswers,
    questions,
    matches: [],
    now: new Date('2026-06-12T16:59:00.000Z'),
  });
  assert.equal(beforeLock[0].dailyPts, 0);

  const afterLock = computeStandings({
    participants,
    dailyAnswers,
    questions,
    matches: [],
    now: new Date('2026-06-12T17:00:00.000Z'),
  });
  assert.equal(afterLock[0].dailyPts, 2);
});

test('long-term picks score only after matching answers are configured', () => {
  assert.deepEqual(longTermPoints({
    champion: 'France',
    topScorer: '🇫🇷 Kylian Mbappe · Pháp',
    youngPlayer: 'Lamine Yamal',
    goldenBall: 'Neymar Junior',
  }, {
    championActual: 'france',
    topScorerActual: 'Kylian Mbappe',
    youngPlayerActual: '🇪🇸 Lamine Yamal · Tây Ban Nha',
    goldenBallActual: '',
  }), { total: 40, champion: 20, topScorer: 10, youngPlayer: 10, goldenBall: 0 });
});

test('weekly and stage windows filter matches and predictions for real leaderboard modes', () => {
  const matches = [
    { matchNo: 1, stage: 'group', kickoffAt: '2026-06-12T10:00:00Z' },
    { matchNo: 2, stage: 'group', kickoffAt: '2026-06-20T10:00:00Z' },
    { matchNo: 73, stage: 'round32', kickoffAt: '2026-06-29T10:00:00Z' },
  ];
  const predictions = matches.map((match) => ({ matchNo: match.matchNo }));
  const weekly = filterCompetitionWindow({ matches, predictions, mode: 'week', now: new Date('2026-06-12T12:00:00Z') });
  assert.deepEqual(weekly.matches.map((match) => match.matchNo), [1]);
  const stage = filterCompetitionWindow({ matches, predictions, mode: 'stage', now: new Date('2026-06-30T12:00:00Z') });
  assert.deepEqual(stage.matches.map((match) => match.matchNo), [73]);
});

test('computeStandings ranks by total, exact count, then predicted count', () => {
  const matches = [
    { matchNo: 1, status: 'finished', homeScore: 2, awayScore: 1 },
    { matchNo: 2, status: 'finished', homeScore: 0, awayScore: 0 },
    { matchNo: 3, status: 'finished', homeScore: 1, awayScore: 0 },
  ];
  const participants = [
    { id: 'p1', displayName: 'Lan' },
    { id: 'p2', displayName: 'Minh' },
  ];
  const predictions = [
    { participantId: 'p1', matchNo: 1, homePred: 2, awayPred: 1, doubleDown: false },
    { participantId: 'p1', matchNo: 2, homePred: 1, awayPred: 1, doubleDown: false },
    { participantId: 'p2', matchNo: 1, homePred: 3, awayPred: 2, doubleDown: true },
  ];

  const standings = computeStandings({ participants, predictions, matches, dailyAnswers: [] });
  assert.equal(standings[0].displayName, 'Lan');
  assert.equal(standings[0].total, 8);
  assert.equal(standings[1].total, 6);
});

test('manual point adjustments are included in standings totals', () => {
  const standings = computeStandings({
    participants: [{ id: 'p1', displayName: 'Lan' }],
    predictions: [],
    dailyAnswers: [],
    matches: [],
    manualAdjustments: [
      { participantId: 'p1', deltaPoints: 5 },
      { participantId: 'p1', deltaPoints: -2 },
    ],
  });

  assert.equal(standings[0].manualPts, 3);
  assert.equal(standings[0].total, 3);
});

test('local mock simulation covers six matches and recalculates standings', () => {
  const payload = buildMockLiveScorePayload({ nowMs: Date.parse('2026-06-05T00:00:00Z'), step: 3 });
  assert.equal(payload.matches.length, 6);
  assert.equal(payload.matches.filter((match) => match.status === 'finished').length, 6);

  const ctx = { userId: 'test-user', workspaceId: 'test-workspace', role: 'admin' };
  const participants = createMockMembers(ctx).map((member) => ({
    id: member.user_id,
    displayName: member.full_name,
  }));
  const predictions = createMockPredictions(ctx, ctx.workspaceId).map((prediction) => ({
    ...prediction,
    participantId: prediction.createdBy,
  }));
  const standings = computeStandings({
    participants,
    predictions,
    dailyAnswers: [],
    matches: applyMockFinishedScores(MATCHES, payload.matches),
  });

  assert.equal(standings.length, 4);
  assert.ok(standings[0].total > 0);
  assert.ok(standings.some((row) => row.participantId === ctx.userId && row.finishedPredicted === 6));
});

test('static World Cup data is internally consistent', () => {
  const result = validateWorldCupData({ matches: MATCHES, questions: DAILY_QUESTIONS });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('engagement helpers choose the nearest future match and build a data-backed recap', () => {
  const reminder = nearestReminderMatch([
    { matchNo: 2, homeTeam: 'France', awayTeam: 'Canada', kickoffAt: '2026-06-12T12:00:00Z' },
    { matchNo: 1, homeTeam: 'Mexico', awayTeam: 'South Africa', kickoffAt: '2026-06-11T12:00:00Z' },
  ], Date.parse('2026-06-10T12:00:00Z'));
  assert.equal(reminder.matchNo, 1);
  assert.match(buildDailyRecap([{ displayName: 'Lan', total: 12, exactCount: 2 }], [
    { status: 'finished', matchDay: '2026-06-11' },
  ], '2026-06-11'), /Lan đang dẫn đầu với 12đ/);
});

function applyMockFinishedScores(matches, liveScores) {
  const liveByNo = new Map(liveScores.map((score) => [Number(score.matchNo), score]));
  return matches.map((match) => {
    const liveScore = liveByNo.get(Number(match.matchNo));
    if (!liveScore || liveScore.status !== 'finished') return match;
    return {
      ...match,
      status: 'finished',
      homeScore: liveScore.homeScore,
      awayScore: liveScore.awayScore,
    };
  });
}
