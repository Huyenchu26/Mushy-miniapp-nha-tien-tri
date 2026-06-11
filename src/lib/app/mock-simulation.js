import { MATCHES } from './worldcup-data.js';

export const MOCK_SCORE_STEP_MS = 10000;

const MOCK_STARTED_AT = Date.now();
const MOCK_WORKSPACE_ID = '00000000-0000-4000-8000-000000000026';
const MOCK_USER_ID = '00000000-0000-4000-8000-000000000001';

const MOCK_PLAYER_ROWS = [
  { user_id: 'mock-lan', full_name: 'Lan Exact', role: 'member' },
  { user_id: 'mock-minh', full_name: 'Minh Chill', role: 'member' },
  { user_id: 'mock-bao', full_name: 'Bao Upset', role: 'member' },
];

const FINAL_SCORES = {
  1: [2, 1],
  2: [1, 1],
  3: [3, 0],
  4: [2, 1],
  5: [1, 2],
  6: [2, 2],
};

const LIVE_STATES = {
  4: [
    { homeScore: 1, awayScore: 0, minute: 61 },
    { homeScore: 1, awayScore: 1, minute: 74 },
    { homeScore: 2, awayScore: 1, minute: 89 },
  ],
  5: [
    { homeScore: 0, awayScore: 1, minute: 54 },
    { homeScore: 0, awayScore: 1, minute: 68 },
    { homeScore: 1, awayScore: 2, minute: 86 },
  ],
  6: [
    { homeScore: 1, awayScore: 1, minute: 47 },
    { homeScore: 2, awayScore: 1, minute: 71 },
    { homeScore: 2, awayScore: 2, minute: 88 },
  ],
};

const PLAYER_PREDICTIONS = {
  current: [
    [1, 2, 1, false],
    [2, 1, 0, false],
    [3, 2, 0, false],
    [4, 2, 1, true],
    [5, 0, 1, false],
    [6, 2, 2, false],
  ],
  'mock-lan': [
    [1, 2, 1, false],
    [2, 1, 1, false],
    [3, 3, 0, false],
    [4, 1, 0, false],
    [5, 1, 2, true],
    [6, 1, 1, false],
  ],
  'mock-minh': [
    [1, 1, 0, false],
    [2, 2, 2, false],
    [3, 2, 1, false],
    [4, 2, 0, true],
    [5, 0, 2, false],
    [6, 2, 1, false],
  ],
  'mock-bao': [
    [1, 0, 1, false],
    [2, 0, 0, false],
    [3, 1, 0, false],
    [4, 1, 1, false],
    [5, 1, 2, false],
    [6, 3, 3, true],
  ],
};

export function isMockContext(ctx) {
  return ctx?.mock === true;
}

export function createMockContext() {
  return {
    token: 'dev-mock-token',
    workspaceId: MOCK_WORKSPACE_ID,
    workspaceSlug: 'dev-mock',
    userId: MOCK_USER_ID,
    role: 'admin',
    mock: true,
  };
}

export function getMockSimulationStep(nowMs = Date.now(), startedAt = MOCK_STARTED_AT) {
  const elapsed = Math.max(0, nowMs - startedAt);
  return Math.min(3, Math.floor(elapsed / MOCK_SCORE_STEP_MS));
}

export function buildMockLiveScorePayload({
  nowMs = Date.now(),
  step = getMockSimulationStep(nowMs),
} = {}) {
  return {
    source: 'local-mock',
    sourceUrl: 'local-simulation',
    fetchedAt: new Date(nowMs).toISOString(),
    fallbackReason: '',
    matches: MATCHES.slice(0, 6).map((match) => toMockLiveScore(match, step, nowMs)),
  };
}

export function createMockMembers(ctx = createMockContext()) {
  return [
    {
      user_id: ctx.userId || MOCK_USER_ID,
      full_name: 'Ban (mock)',
      role: ctx.role || 'admin',
    },
    ...MOCK_PLAYER_ROWS,
  ];
}

export function createMockPredictions(ctx = createMockContext(), workspaceId = ctx.workspaceId || MOCK_WORKSPACE_ID) {
  const currentUserId = ctx.userId || MOCK_USER_ID;
  const rows = [
    ...rowsForPlayer('current', currentUserId, workspaceId),
    ...MOCK_PLAYER_ROWS.flatMap((player) => rowsForPlayer(player.user_id, player.user_id, workspaceId)),
  ];
  return rows;
}

export function createMockLongTermBet(ctx = createMockContext(), workspaceId = ctx.workspaceId || MOCK_WORKSPACE_ID) {
  return {
    id: `${ctx.userId || MOCK_USER_ID}-long-term-mock`,
    workspaceId,
    createdBy: ctx.userId || MOCK_USER_ID,
    champion: 'France',
    topScorer: 'Mbappe · Pháp',
    youngPlayer: 'Lamine Yamal · Tây Ban Nha',
    goldenBall: 'Mbappe · Pháp',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function mergeMockMembers(memberRows = [], ctx = createMockContext()) {
  const byId = new Map(memberRows.map((member) => [member.user_id, member]));
  for (const member of createMockMembers(ctx)) {
    if (!byId.has(member.user_id)) byId.set(member.user_id, member);
  }
  return [...byId.values()];
}

export function mergeMockPredictions(predictionRows = [], ctx = createMockContext(), workspaceId = ctx.workspaceId || MOCK_WORKSPACE_ID) {
  const byKey = new Map(predictionRows.map((prediction) => [predictionKey(prediction), prediction]));
  for (const prediction of createMockPredictions(ctx, workspaceId)) {
    const key = predictionKey(prediction);
    if (!byKey.has(key)) byKey.set(key, prediction);
  }
  return [...byKey.values()].sort((a, b) => Number(a.matchNo) - Number(b.matchNo));
}

function rowsForPlayer(playerKey, userId, workspaceId) {
  return (PLAYER_PREDICTIONS[playerKey] || []).map(([matchNo, homePred, awayPred, doubleDown]) => {
    const match = MATCHES.find((item) => Number(item.matchNo) === Number(matchNo));
    return {
      id: `${userId}-${matchNo}-mock`,
      workspaceId,
      createdBy: userId,
      matchNo,
      matchDay: match?.matchDay || '',
      homePred,
      awayPred,
      doubleDown,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });
}

function toMockLiveScore(match, step, nowMs) {
  const state = scoreStateFor(match, step, nowMs);
  return {
    externalId: `mock-${match.matchNo}`,
    matchNo: match.matchNo,
    stage: match.stage,
    group: match.group,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    status: state.status,
    minute: state.minute,
    rawClock: state.rawClock,
  };
}

function scoreStateFor(match, step, nowMs) {
  const matchNo = Number(match.matchNo);
  const kickoffMs = new Date(match.kickoffAt).getTime();
  if (!Number.isFinite(kickoffMs) || nowMs < kickoffMs) {
    return {
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled',
      minute: 0,
      rawClock: '',
    };
  }

  const elapsedMinutes = Math.floor((nowMs - kickoffMs) / 60000);
  if (elapsedMinutes >= 105) {
    const [homeScore, awayScore] = FINAL_SCORES[matchNo];
    return {
      homeScore,
      awayScore,
      status: 'finished',
      minute: 90,
      rawClock: 'FT',
    };
  }

  const liveStates = LIVE_STATES[matchNo] || [];
  const liveIndex = Math.max(0, Math.min(step, liveStates.length - 1));
  const state = liveStates[liveIndex] || { homeScore: 0, awayScore: 0, minute: Math.max(1, Math.min(90, elapsedMinutes + 1)) };
  return {
    ...state,
    status: 'in_progress',
    rawClock: `${state.minute}'`,
  };
}

function predictionKey(prediction) {
  return `${prediction.createdBy}:${Number(prediction.matchNo)}`;
}
