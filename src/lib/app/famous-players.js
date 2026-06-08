export const FAMOUS_PLAYERS_BY_TEAM = Object.freeze({
  Argentina: ['Lionel Messi'],
  Belgium: ['Kevin De Bruyne'],
  Brazil: ['Vinicius Junior'],
  Colombia: ['Luis Diaz'],
  Croatia: ['Luka Modric'],
  Egypt: ['Mohamed Salah'],
  England: ['Harry Kane', 'Jude Bellingham'],
  France: ['Kylian Mbappe'],
  Germany: ['Jamal Musiala'],
  Netherlands: ['Virgil van Dijk'],
  Norway: ['Erling Haaland', 'Martin Odegaard'],
  Portugal: ['Cristiano Ronaldo'],
  Spain: ['Lamine Yamal', 'Pedri'],
  Uruguay: ['Federico Valverde'],
});

export const GLOBAL_FAMOUS_PLAYER_NAMES = Object.freeze(
  Object.values(FAMOUS_PLAYERS_BY_TEAM).flat()
);

export function playerMentionTokens(players = []) {
  return [...new Set(players.flatMap((name) => {
    const clean = String(name || '').trim();
    if (!clean) return [];
    const parts = clean.split(/\s+/);
    return [clean, parts[parts.length - 1]].map(normalizePlayerToken).filter(Boolean);
  }))];
}

export function normalizePlayerToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}
