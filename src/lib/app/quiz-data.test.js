import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRIVIA_QUESTIONS,
  getTriviaQuestionForUserDate,
  getTriviaQuestionsForDate,
  triviaStreak,
} from './quiz-data.js';

test('trivia selector is stable per user and date', () => {
  const first = getTriviaQuestionForUserDate('2026-06-08', 'user-a');
  const second = getTriviaQuestionForUserDate('2026-06-08', 'user-a');

  assert.ok(first);
  assert.equal(first.key, second.key);
  assert.equal(first.date, '2026-06-08');
});

test('trivia scoring bank includes every curated question for each date', () => {
  const questionsForDate = getTriviaQuestionsForDate('2026-06-08');

  assert.ok(questionsForDate.length > 1);
  assert.equal(
    TRIVIA_QUESTIONS.filter((question) => question.date === '2026-06-08').length,
    questionsForDate.length
  );
});

test('trivia user schedule avoids early repeats across the question bank', () => {
  const firstWeekSourceIds = Array.from({ length: 7 }, (_, dayIndex) => {
    const date = `2026-06-${String(8 + dayIndex).padStart(2, '0')}`;
    return getTriviaQuestionForUserDate(date, 'user-a')?.sourceId;
  });

  assert.equal(new Set(firstWeekSourceIds).size, firstWeekSourceIds.length);
});

test('trivia streak follows the user-specific scheduled question', () => {
  const userId = 'user-a';
  const firstQuestion = getTriviaQuestionForUserDate('2026-06-08', userId);
  const secondQuestion = getTriviaQuestionForUserDate('2026-06-09', userId);
  const answers = [
    { questionKey: firstQuestion.key, answer: firstQuestion.correctAnswer },
    { questionKey: secondQuestion.key, answer: secondQuestion.correctAnswer },
  ];

  assert.equal(triviaStreak(answers, '2026-06-09', userId), 2);
});
