import quizBank from '../../../World Cup 2026/quiz_questions.json' with { type: 'json' };

const QUIZ_START_DATE = '2026-06-08';
const QUIZ_END_DATE = '2026-07-19';
const CURATED_QUESTION_IDS = [
  1, 2, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 18, 19, 22, 24, 25, 29,
  30, 31, 33, 35, 38, 41, 43, 44,
];

const POINTS_BY_DIFFICULTY = {
  easy: 1,
  medium: 2,
  hard: 3,
};

const curatedQuestions = quizBank.questions.filter((question) =>
  CURATED_QUESTION_IDS.includes(Number(question.id))
);

export const TRIVIA_QUESTIONS = buildTriviaSchedule();
export const ALL_SCORING_QUESTIONS = TRIVIA_QUESTIONS;

export function getTriviaQuestionForDate(dateKey) {
  return getTriviaQuestionForUserDate(dateKey, 'default');
}

export function getTriviaQuestionForUserDate(dateKey, userId = 'guest') {
  const dayIndex = daysBetween(QUIZ_START_DATE, dateKey);
  if (!curatedQuestions.length || dayIndex < 0 || dateKey > QUIZ_END_DATE) return null;

  const source = curatedQuestions[getTriviaSourceIndex(userId, dayIndex)];
  return toTriviaQuestion(source, dateKey);
}

export function getTriviaQuestionsForDate(dateKey) {
  return TRIVIA_QUESTIONS.filter((question) => question.date === dateKey);
}

export function triviaStreak(answers = [], throughDate, userId = 'guest') {
  const answersByKey = new Map(answers.map((answer) => [answer.questionKey, answer]));
  let streak = 0;

  for (
    let cursor = dateAtUtcMidnight(throughDate), start = dateAtUtcMidnight(QUIZ_START_DATE);
    cursor >= start;
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  ) {
    const date = cursor.toISOString().slice(0, 10);
    const question = getTriviaQuestionForUserDate(date, userId);
    if (!question) break;

    const answer = answersByKey.get(question.key);
    if (!answer || normalize(answer.answer) !== normalize(question.correctAnswer)) break;
    streak += 1;
  }

  return streak;
}

function buildTriviaSchedule() {
  if (!curatedQuestions.length) return [];

  const schedule = [];
  let cursor = dateAtUtcMidnight(QUIZ_START_DATE);
  const end = dateAtUtcMidnight(QUIZ_END_DATE);

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    for (const source of curatedQuestions) {
      schedule.push(toTriviaQuestion(source, date));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return schedule;
}

function toTriviaQuestion(source, date) {
  return {
    key: `trivia-${date}-${source.id}`,
    sourceId: Number(source.id),
    kind: 'trivia',
    date,
    prompt: source.question,
    options: source.options,
    correctAnswer: source.answer,
    points: POINTS_BY_DIFFICULTY[source.difficulty] || 1,
    category: source.category,
    difficulty: source.difficulty,
    explanation: source.explanation,
    wrongCopy: source.taunt_wrong,
    closesAt: `${date}T16:59:59Z`,
  };
}

function dateAtUtcMidnight(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function daysBetween(startDateKey, endDateKey) {
  const start = dateAtUtcMidnight(startDateKey);
  const end = dateAtUtcMidnight(endDateKey);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return -1;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getTriviaSourceIndex(userId, dayIndex) {
  const total = curatedQuestions.length;
  const seed = stableHash(userId || 'guest');
  const offset = seed % total;
  const stride = pickCoprimeStride(seed, total);
  return (offset + dayIndex * stride) % total;
}

function pickCoprimeStride(seed, total) {
  if (total <= 1) return 1;

  let stride = (Math.floor(seed / total) % (total - 1)) + 1;
  while (greatestCommonDivisor(stride, total) !== 1) {
    stride = (stride % (total - 1)) + 1;
  }
  return stride;
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
