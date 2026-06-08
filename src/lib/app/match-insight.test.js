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

test('match insight model order uses DeepSeek Flash with Qwen fallback', () => {
  assert.deepEqual(MATCH_INSIGHT_MODELS, [
    'deepseek/deepseek-v4-flash',
    'qwen/qwen3.7-plus',
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
  assert.match(prompt, /Không gợi ý tỉ số/i);
  assert.match(prompt, /không kết luận đội nào thắng/i);
  assert.match(prompt, /tiếng Việt có dấu/i);
  assert.match(prompt, /không dùng mẫu chung/i);
  assert.match(prompt, /analysisAngle/i);
  assert.match(prompt, /rankGap/i);
});

test('parser accepts plain JSON and fenced JSON', () => {
  assert.equal(parseMatchInsightResponse('{"summary":"Phap nhinh hon, nhung Canada khong de bat nat."}'), 'Phap nhinh hon, nhung Canada khong de bat nat.');
  const fenced = `\`\`\`json
{"summary":"Tran nay cang, ai mat bong truoc la bi soi."}
\`\`\``;
  assert.equal(parseMatchInsightResponse(fenced), 'Tran nay cang, ai mat bong truoc la bi soi.');
  assert.equal(
    parseMatchInsightResponse('{"summary":"Mexico có lợi thế sân nhà, còn Nam Phi đủ lì để phá nhịp."} Nhưng tôi thêm chữ ngoài JSON.'),
    'Mexico có lợi thế sân nhà, còn Nam Phi đủ lì để phá nhịp.'
  );
});

test('validator accepts short safe insight with allowed famous player alias', () => {
  const result = validateMatchInsightSummary(
    'Pháp nhỉnh hơn nhờ chiều sâu đội hình, nhưng Canada không phải đội đứng yên cho người ta đá tập. Mbappe là điểm nổ rõ nhất ở những pha tăng tốc.',
    ['Kylian Mbappe'],
    { match: franceCanada }
  );
  assert.equal(result.ok, true);
});

test('validator rejects score predictions, keo tu, betting language, non-curated famous players, and generic output', () => {
  assert.equal(validateMatchInsightSummary('Phap co the thang 2-1 neu Canada so ho.', ['Kylian Mbappe']).ok, false);
  assert.equal(validateMatchInsightSummary('Tran nay nen bat keo tu vi cua Phap sang.', ['Kylian Mbappe']).ok, false);
  assert.equal(validateMatchInsightSummary('Day la keo ca cuoc ngon cho nguoi thich mao hiem.', ['Kylian Mbappe']).ok, false);
  assert.equal(validateMatchInsightSummary('Messi se la tam diem du day la tran Phap vs Canada.', ['Kylian Mbappe']).ok, false);
  assert.equal(validateMatchInsightSummary('Phap nhinh hon nho chieu sau doi hinh, nhung Canada khong phai doi dung yen cho nguoi ta da tap.', ['Kylian Mbappe']).reason, 'missing_vietnamese_diacritics');
  assert.equal(validateMatchInsightSummary('Trận này đội mạnh hơn có lợi thế, nhưng đội yếu hơn vẫn đủ sức gây khó chịu nếu nhập cuộc lì lợm.', ['Kylian Mbappe'], { match: franceCanada }).reason, 'missing_match_teams');
  assert.equal(validateMatchInsightSummary('Pháp vs Senegal có nhịp trận căng, nhưng câu này lại lỡ nói cầm kèo nổ súng.', ['Kylian Mbappe'], { match: { homeTeam: 'France', awayTeam: 'Senegal' } }).reason, 'banned_content');
  assert.equal(validateMatchInsightSummary('Hà Lan vs Thụy Điển có vẻ lệch trình, Hà Lan sẽ nhẹ nhàng có 3 điểm nếu nhập cuộc gọn.', [], { match: { homeTeam: 'Netherlands', awayTeam: 'Sweden' } }).reason, 'banned_content');
  assert.equal(validateMatchInsightSummary('Mexico vs Nam Phi có nhịp nhập cuộc căng, đội nào mất kiên nhẫn sẽ lâm nguy!', [], { match: { homeTeam: 'Mexico', awayTeam: 'South Africa' } }).reason, 'too_few_sentences');
});
