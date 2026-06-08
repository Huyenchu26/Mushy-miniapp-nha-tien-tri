import quizBank from '../../../World Cup 2026/quiz_questions.json';

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
  return TRIVIA_QUESTIONS.find((question) => question.date === dateKey) || null;
}

export function triviaStreak(answers = [], throughDate) {
  const answersByKey = new Map(answers.map((answer) => [answer.questionKey, answer]));
  const eligible = TRIVIA_QUESTIONS
    .filter((question) => question.date <= throughDate)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  let streak = 0;
  for (const question of eligible) {
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
  let index = 0;

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const source = curatedQuestions[index % curatedQuestions.length];
    schedule.push({
      key: `trivia-${date}-${source.id}`,
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
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    index += 1;
  }

  return schedule;
}

function dateAtUtcMidnight(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
