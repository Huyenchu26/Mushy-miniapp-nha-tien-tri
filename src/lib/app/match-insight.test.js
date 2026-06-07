import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MATCH_INSIGHT_MODELS,
  buildMatchInsightPrompt,
  getFamousPlayersForMatch,
  parseMatchInsightResponse,
  validateMatchInsightSummary,
} from './match-insight.js';

const franceCanada = {
  matchNo: 1,
  stage: 'group',
  group: 'I',
  homeTeam: 'France',
  awayTeam: 'Canada',
  kickoffAt: '2026-06-12T19:00:00Z',
};

test('match insight model order starts with MiniMax and keeps configured fallbacks', () => {
  assert.deepEqual(MATCH_INSIGHT_MODELS, [
    'minimax/minimax-m2-her',
    'qwen/qwen3.7-plus',
    'deepseek/deepseek-v4-flash',
  ]);
});

test('famous player lookup returns only curated players for match teams', () => {
  assert.deepEqual(getFamousPlayersForMatch(franceCanada), ['Kylian Mbappe']);
  assert.deepEqual(getFamousPlayersForMatch({
    homeTeam: 'Canada',
    awayTeam: 'Qatar',
  }), []);
});

test('prompt includes match context and only supplied famous players', () => {
  const prompt = buildMatchInsightPrompt({
    match: franceCanada,
    playersToMention: ['Kylian Mbappe'],
  });
  assert.match(prompt, /France/);
  assert.match(prompt, /Canada/);
  assert.match(prompt, /Kylian Mbappe/);
  assert.doesNotMatch(prompt, /Lionel Messi/);
  assert.match(prompt, /khong goi y ti so/i);
});

test('parser accepts plain JSON and fenced JSON', () => {
  assert.equal(parseMatchInsightResponse('{"summary":"Phap nhinh hon, nhung Canada khong de bat nat."}'), 'Phap nhinh hon, nhung Canada khong de bat nat.');
  const fenced = `\`\`\`json
{"summary":"Tran nay cang, ai mat bong truoc la bi soi."}
\`\`\``;
  assert.equal(parseMatchInsightResponse(fenced), 'Tran nay cang, ai mat bong truoc la bi soi.');
});

test('validator accepts short safe insight with allowed famous player alias', () => {
  const result = validateMatchInsightSummary(
    'Phap nhinh hon nho chieu sau doi hinh, nhung Canada khong phai doi dung yen cho nguoi ta da tap. Mbappe la diem no ro nhat o nhung pha tang toc.',
    ['Kylian Mbappe']
  );
  assert.equal(result.ok, true);
});

test('validator rejects score predictions, keo tu, betting language, and non-curated famous players', () => {
  assert.equal(validateMatchInsightSummary('Phap co the thang 2-1 neu Canada so ho.', ['Kylian Mbappe']).ok, false);
  assert.equal(validateMatchInsightSummary('Tran nay nen bat keo tu vi cua Phap sang.', ['Kylian Mbappe']).ok, false);
  assert.equal(validateMatchInsightSummary('Day la keo ca cuoc ngon cho nguoi thich mao hiem.', ['Kylian Mbappe']).ok, false);
  assert.equal(validateMatchInsightSummary('Messi se la tam diem du day la tran Phap vs Canada.', ['Kylian Mbappe']).ok, false);
});
