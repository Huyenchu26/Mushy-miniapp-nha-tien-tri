import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bell, BookOpen, CalendarDays, ClipboardCheck, Flame, Home, MessagesSquare, Minus, PenLine, Plus, Scale, Star, Target, Trophy } from 'lucide-react';
import { DAILY_QUESTIONS, DATA_SOURCE, FIFA_RANKING_SOURCE, GROUPS, MATCHES, TEAM_META, TEAM_OPTIONS, TOP_SCORER_OPTIONS, dateKeyInVietnamTimeZone } from './lib/app/worldcup-data.js';
import {
  MOCK_SCORE_STEP_MS,
  buildMockLiveScorePayload,
  createMockContext,
  createMockLongTermBet,
  isMockContext,
  mergeMockMembers,
  mergeMockPredictions,
} from './lib/app/mock-simulation.js';
import { computeStandings, dailyPoints, filterCompetitionWindow, isFinished, matchBasePoints, matchScoreBreakdown, normalizeAnswer, outcome } from './lib/app/scoring.js';
import { ALL_SCORING_QUESTIONS, getTriviaQuestionForUserDate, triviaStreak } from './lib/app/quiz-data.js';
import { selectInsightWarmupMatches } from './lib/app/match-insight.js';
import Select from './components/Select.jsx';
import TournamentAdmin from './components/TournamentAdmin.jsx';
import { getContext } from './lib/context.js';
import { listMembers } from './lib/members.js';
import { mushyApi } from './lib/mushy-api.js';
import { subscribeToTable } from './lib/realtime.js';
import { db } from './lib/supabase.js';
import { track, trackScreen } from './lib/analytics.js';
import { fetchTournamentState, syncTournamentSchedule } from './lib/app/tournament-service.js';
import {
  fetchDailyAnswers,
  fetchLongTermBet,
  fetchMatchRoomMessages,
  fetchPredictions,
  insertMatchRoomMessage,
  mapRoomMessage,
} from './lib/app/game-repository.js';
import './App.css';

const DEFAULT_TAB = 'matches';
const LIVE_SCORE_POLL_MS = 3 * 60 * 1000;
const LIVE_SCORE_ACTIVE_POLL_MS = 30 * 1000;
const APP_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const PREDICTION_LOCK_BEFORE_MS = 15 * 60 * 1000;
const DOUBLE_DOWN_OPEN_BEFORE_MS = 24 * 60 * 60 * 1000;
const ROOM_POLL_FALLBACK_MS = 30000;
const TOURNAMENT_POLL_FALLBACK_MS = 60000;
const TOURNAMENT_REALTIME_DEBOUNCE_MS = 400;
const MATCH_CLOCK_TICK_MS = 30000;
const LIVE_MATCH_FALLBACK_MS = 2.5 * 60 * 60 * 1000;
const CHAT_REPEAT_WINDOW_MS = 45000;
const CHAT_REPEAT_LIMIT = 2;
const MATCH_INSIGHT_WARMUP_DELAY_MS = 1500;
const MATCH_INSIGHT_WARMUP_LIMIT = 3;
const FEATURED_PLAYER_NAMES = [
  'Lionel Messi',
  'Mbappe',
  'Cristiano Ronaldo',
  'Neymar Jr',
  'Lamine Yamal',
  'Kane',
  'Vinicius Junior',
  'Bellingham',
  'Mohamed Salah',
  'Haaland',
  'De Bruyne',
  'Heung-Min Son',
];
const FEATURED_PLAYER_ORDER = new Map(FEATURED_PLAYER_NAMES.map((name, index) => [normalizeAnswer(name), index]));

function SoccerBallIcon({ size = 15 }) {
  return (
    <span
      style={{
        fontSize: `${size}px`,
        lineHeight: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      ⚽
    </span>
  );
}

const TABS = [
  { id: 'matches', label: 'Trang chủ', shortLabel: 'Trang chủ', icon: Home },
  { id: 'results', label: 'Trận đấu', shortLabel: 'Trận đấu', icon: SoccerBallIcon },
  { id: 'daily', label: 'Dự đoán', shortLabel: 'Dự đoán', icon: PenLine },
  { id: 'leaderboard', label: 'Bảng xếp hạng', shortLabel: 'BXH', icon: Trophy },
  { id: 'rules', label: 'Luật chơi', shortLabel: 'Luật chơi', icon: BookOpen },
];
const PRIMARY_GROUP_FILTERS = ['A', 'B', 'C', 'D'];
const EXTRA_GROUP_FILTERS = Object.keys(GROUPS).filter((group) => !PRIMARY_GROUP_FILTERS.includes(group));
const KNOCKOUT_FILTERS = [
  { id: 'round32', label: '1/16' },
  { id: 'round16', label: '1/8' },
  { id: 'quarter', label: 'T\u1ee9 k\u1ebft' },
  { id: 'semi', label: 'B\u00e1n k\u1ebft' },
  { id: 'third', label: 'H\u1ea1ng ba' },
  { id: 'final', label: 'Chung k\u1ebft' },
];
const ROAST_COPY = {
  win: [
    '🐔 Mấy con gà biết gì',
    '😎 Ôi thế mà lại hay',
    '🧠 Trình là gì mà trình ai chấm',
    '🤏 Chưa tày đâu',
    '🛡️ Thua thế nào được',
    '🎶 Na ná na Anh Phùng Thanh Độ',
    '😏 Tưởng dư lào',
    '🎮 Game là dễ',
    '👑 Vua chúa',
    '🔥 Ôi gà điên',
    '🧊 Hết vị',
  ],
  lose: [
    '🏜️ Sa mạc lời',
    '💸 Mua tài',
    '🏋️ Còng cả lưng',
    '🙂 Chúc bạn may mắn lần sau',
    '🧳 +1 vali',
    '🧳 Hành lý đang xếp',
    '🕖 7 giờ kém 10',
    '👑 Sunday the king play',
    '📺 Check VAR',
    '📕 Bay sổ đỏ',
    '🏚️ Mất nhà',
  ],
  draw: [
    '🎤 Hòa Minzy',
    '⚖️ Hòa đại nhân',
    '⚔️ 2 thần đằng',
    '💧 H2HOHO',
    '🍗 Khô gà nè',
    '🍜 Mỳ 2 trứng',
    '🕊️ Hòa bình ơi',
    '🥲 Hòa ơi là hòa',
  ],
};

export default function App() {
  const localSimulation = isLocalSimulationEnabled();
  const forceLocalMock = isForcedLocalMockEnabled();
  const [ctx, setCtx] = useState(null);
  const [ctxError, setCtxError] = useState('');
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);
  const [predictions, setPredictions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [longTermBet, setLongTermBet] = useState(null);
  const [allLongTermBets, setAllLongTermBets] = useState([]);
  const [manualAdjustments, setManualAdjustments] = useState([]);
  const [officialMatches, setOfficialMatches] = useState([]);
  const [appConfig, setAppConfig] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [roomMatch, setRoomMatch] = useState(null);
  const [roomMessages, setRoomMessages] = useState([]);
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [roomRealtimeState, setRoomRealtimeState] = useState('idle');
  const [spamBlockedUntil, setSpamBlockedUntil] = useState(0);
  const [liveScores, setLiveScores] = useState([]);
  const [nowMs, setNowMs] = useState(Date.now());
  const [liveSync, setLiveSync] = useState({ source: '', fetchedAt: '', error: '' });
  const [aiInsightsEnabled, setAiInsightsEnabled] = useState(false);
  const [matchInsights, setMatchInsights] = useState({});
  const [members, setMembers] = useState([]);
  const [groupFilter, setGroupFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [error, setError] = useState('');
  const [editingPredictionMatch, setEditingPredictionMatch] = useState(null);
  const [showMyPredictions, setShowMyPredictions] = useState(false);
  const [myPredictionsTab, setMyPredictionsTab] = useState('scored'); // 'scored' | 'pending'
  const [deepLinkRevision, setDeepLinkRevision] = useState(0);

  const addToast = (message, type = 'success') => {
    if (!message) return;
    if (message.startsWith('DEV mock')) {
      console.log(message);
      return;
    }
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const setNotice = (msg) => {
    if (!msg) return;
    const type = msg.includes('Bạn cần lưu dự đoán') ? 'warning' : 'success';
    addToast(msg, type);
  };
  const refreshGestureRef = useRef({ startY: 0, scrollY: 0 });
  const activeTabScrollRef = useRef(DEFAULT_TAB);
  const chatSendTimesRef = useRef([]);
  const chatRepeatRef = useRef([]);
  const tournamentRefreshTimerRef = useRef(null);
  const matchInsightRequestsRef = useRef(new Map());
  const matchInsightWarmupKeyRef = useRef('');
  const deepLinkHandledRef = useRef('');
  const scope = useMemo(
    () => (ctx?.workspaceId ? { workspaceId: ctx.workspaceId, label: ctx.workspaceSlug || 'Mushy' } : null),
    [ctx?.workspaceId, ctx?.workspaceSlug]
  );
  const todayKey = getLocalDateKey();
  const todayTriviaQuestion = useMemo(
    () => getTriviaQuestionForUserDate(todayKey, ctx?.userId),
    [ctx?.userId, todayKey]
  );
  const tournamentMatches = useMemo(() => mergeTournamentMatches(MATCHES, officialMatches), [officialMatches]);
  const dailyQuestions = useMemo(
    () => applyDailyQuestionAnswers(DAILY_QUESTIONS, appConfig?.dailyQuestionAnswers),
    [appConfig?.dailyQuestionAnswers]
  );
  const canManageTournament = isMushyAdmin(ctx);

  useEffect(() => {
    if (!canManageTournament || typeof window === 'undefined') return undefined;

    function openAdminFromLocation() {
      const params = new URLSearchParams(window.location.search);
      if (params.get('admin') === '1' || window.location.hash === '#admin') {
        setAdminOpen(true);
      }
    }

    openAdminFromLocation();
    window.addEventListener('hashchange', openAdminFromLocation);
    return () => window.removeEventListener('hashchange', openAdminFromLocation);
  }, [canManageTournament]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    function refreshDeepLink() {
      setDeepLinkRevision((value) => value + 1);
    }

    function refreshWhenVisible() {
      if (document.visibilityState !== 'hidden') refreshDeepLink();
    }

    window.addEventListener('focus', refreshDeepLink);
    window.addEventListener('popstate', refreshDeepLink);
    window.addEventListener('hashchange', refreshDeepLink);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshDeepLink);
      window.removeEventListener('popstate', refreshDeepLink);
      window.removeEventListener('hashchange', refreshDeepLink);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (activeTabScrollRef.current === activeTab) return;
    activeTabScrollRef.current = activeTab;

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }, [activeTab]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), MATCH_CLOCK_TICK_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    try {
      if (forceLocalMock) {
        setCtx(createMockContext());
        setNotice('DEV mock: forced local simulation is running.');
        return;
      }
      const nextCtx = getContext();
      if (!nextCtx?.userId || !nextCtx?.workspaceId || !nextCtx?.token) {
        if (localSimulation) {
          setCtx(createMockContext());
          setNotice('DEV mock: local simulation is running.');
          return;
        }
        setCtxError('Thiếu Mushy context. Hãy mở app từ Mushy hoặc chạy npm run dev:setup để có token dev.');
      } else {
        setCtx(nextCtx);
      }
    } catch (err) {
      if (localSimulation) {
        setCtx(createMockContext());
        setNotice('DEV mock: local simulation is running.');
        return;
      }
      setCtxError(err.message || 'Không đọc được Mushy context.');
    }
  }, [forceLocalMock, localSimulation]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/match-insight-status')
      .then((response) => response.ok ? response.json() : { enabled: false })
      .then((payload) => {
        if (!cancelled) setAiInsightsEnabled(Boolean(payload?.enabled));
      })
      .catch(() => {
        if (!cancelled) setAiInsightsEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ctx?.userId || !scope?.workspaceId) return;
    loadGameData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.userId, scope?.workspaceId]);

  useEffect(() => {
    if (!ctx?.userId || !scope?.workspaceId) return undefined;
    if (localSimulation && isMockContext(ctx)) return undefined;

    const scheduleRefresh = () => {
      if (tournamentRefreshTimerRef.current) {
        window.clearTimeout(tournamentRefreshTimerRef.current);
      }
      tournamentRefreshTimerRef.current = window.setTimeout(() => {
        tournamentRefreshTimerRef.current = null;
        refreshTournamentState({ silent: true });
      }, TOURNAMENT_REALTIME_DEBOUNCE_MS);
    };

    const unsubscribers = [
      subscribeToTable('matches', scope.workspaceId, scheduleRefresh),
      subscribeToTable('long_term_bets', scope.workspaceId, scheduleRefresh),
    ];
    const interval = window.setInterval(() => {
      refreshTournamentState({ silent: true });
    }, TOURNAMENT_POLL_FALLBACK_MS);

    return () => {
      if (tournamentRefreshTimerRef.current) {
        window.clearTimeout(tournamentRefreshTimerRef.current);
        tournamentRefreshTimerRef.current = null;
      }
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.userId, scope?.workspaceId, localSimulation]);

  useEffect(() => {
    if (!aiInsightsEnabled || !ctx?.token || !scope?.workspaceId) return undefined;
    if (localSimulation && isMockContext(ctx)) return undefined;

    const warmupKey = `${ctx.userId}:${scope.workspaceId}`;
    if (matchInsightWarmupKeyRef.current === warmupKey) return undefined;
    matchInsightWarmupKeyRef.current = warmupKey;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const matches = selectInsightWarmupMatches(tournamentMatches, Date.now(), MATCH_INSIGHT_WARMUP_LIMIT);
      for (const match of matches) {
        if (cancelled) break;
        try {
          const payload = await requestMatchInsight(match.matchNo);
          if (cancelled || !payload?.summary) continue;
          setMatchInsights((rows) => ({
            ...rows,
            [Number(match.matchNo)]: toMatchInsightState(payload),
          }));
        } catch {
          // Warmup is best-effort; users can retry from the match card.
        }
      }
    }, MATCH_INSIGHT_WARMUP_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiInsightsEnabled, ctx?.token, ctx?.userId, scope?.workspaceId, localSimulation, tournamentMatches]);

  useEffect(() => {
    if (!roomMatch || !scope?.workspaceId) return;
    loadRoomMessages(roomMatch.matchNo);
    setRoomRealtimeState(localSimulation && isMockContext(ctx) ? 'mock-live' : 'listening');
    let unsubscribe = null;
    if (!(localSimulation && isMockContext(ctx))) {
      unsubscribe = subscribeToTable('match_room_messages', scope.workspaceId, (payload) => {
        const nextRow = payload?.new || payload?.old;
        if (Number(nextRow?.match_no) !== Number(roomMatch.matchNo)) return;
        setRoomRealtimeState('live');
        setRoomMessages((rows) => mergeRoomRealtimePayload(rows, payload));
      });
    }
    const interval = window.setInterval(() => {
      loadRoomMessages(roomMatch.matchNo, { silent: true });
    }, ROOM_POLL_FALLBACK_MS);
    return () => {
      if (unsubscribe) unsubscribe();
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomMatch?.matchNo, scope?.workspaceId, ctx?.userId, localSimulation]);

  useEffect(() => {
    if (!ctx?.token || !scope?.workspaceId) return undefined;

    let cancelled = false;
    let timer = null;
    async function syncLiveScores() {
      const syncPlan = getLiveScoreSyncPlan(tournamentMatches, Date.now());
      if (!localSimulation && !syncPlan.shouldFetch) {
        if (!cancelled) {
          setLiveSync({
            source: 'schedule',
            fetchedAt: '',
            nextMatchAt: syncPlan.nextMatchAt,
            nextFetchAt: syncPlan.nextFetchAt,
            error: '',
          });
        }
        return syncPlan.waitMs;
      }

      try {
        const payload = await fetchLiveScores(ctx.token, scope.workspaceId, { useMock: localSimulation });
        if (cancelled) return;
        setLiveScores(payload.matches || []);
        setLiveSync({
          source: payload.source || '',
          fetchedAt: payload.fetchedAt || '',
          fallbackReason: payload.fallbackReason || '',
          nextMatchAt: syncPlan.nextMatchAt,
          nextFetchAt: syncPlan.nextFetchAt,
          error: '',
        });
        track('live_score_synced', { source: payload.source || 'unknown', match_count: payload.matches?.length || 0 });
      } catch (err) {
        if (cancelled) return;
        setLiveSync((current) => ({
          ...current,
          error: err.message || 'Không đồng bộ được tỉ số live.',
        }));
      }
      return localSimulation ? MOCK_SCORE_STEP_MS : LIVE_SCORE_POLL_MS;
    }

    async function scheduleSync() {
      if (cancelled) return;
      const waitMs = await syncLiveScores();
      if (cancelled) return;
      timer = window.setTimeout(scheduleSync, waitMs || LIVE_SCORE_POLL_MS);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') return;
      if (timer) window.clearTimeout(timer);
      scheduleSync();
    }

    scheduleSync();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timer) window.clearTimeout(timer);
    };
  }, [ctx?.token, scope?.workspaceId, localSimulation, tournamentMatches]);

  const predictionMap = useMemo(
    () => new Map(predictions.filter((p) => p.createdBy === ctx?.userId).map((p) => [Number(p.matchNo), p])),
    [predictions, ctx?.userId]
  );
  const dailyDoubleDownMap = useMemo(() => {
    const map = new Map();
    predictions
      .filter((p) => p.createdBy === ctx?.userId && p.doubleDown)
      .forEach((prediction) => map.set(prediction.matchDay, Number(prediction.matchNo)));
    return map;
  }, [predictions, ctx?.userId]);
  const answerMap = useMemo(
    () => new Map(answers.filter((a) => a.createdBy === ctx?.userId).map((a) => [a.questionKey, a])),
    [answers, ctx?.userId]
  );
  const matchesWithOfficialScores = useMemo(
    () => applyAutomaticScores(tournamentMatches, liveScores),
    [tournamentMatches, liveScores]
  );
  const matchesWithLiveScores = useMemo(
    () => applyLiveScores(matchesWithOfficialScores, liveScores, nowMs),
    [matchesWithOfficialScores, liveScores, nowMs]
  );
  const standings = useMemo(
    () => buildStandings({
      members,
      predictions,
      answers,
      matches: matchesWithOfficialScores,
      questions: [...dailyQuestions, ...ALL_SCORING_QUESTIONS],
      longTermBets: allLongTermBets,
      appConfig,
      manualAdjustments,
    }),
    [members, predictions, answers, matchesWithOfficialScores, dailyQuestions, allLongTermBets, appConfig, manualAdjustments]
  );
  const standingsByMode = useMemo(() => {
    const result = { total: standings };
    for (const mode of ['week', 'stage']) {
      const window = filterCompetitionWindow({
        matches: matchesWithOfficialScores,
        predictions,
        answers,
        questions: [...dailyQuestions, ...ALL_SCORING_QUESTIONS],
        mode,
      });
      result[mode] = buildStandings({
        members,
        predictions: window.predictions,
        answers: window.answers,
        matches: window.matches,
        questions: window.questions,
        longTermBets: [],
        appConfig: null,
      });
    }
    return result;
  }, [standings, members, predictions, answers, matchesWithOfficialScores, dailyQuestions]);
  const currentStanding = standings.find((row) => row.participantId === ctx?.userId);
  const currentUserPredictions = useMemo(
    () => predictions.filter((prediction) => prediction.createdBy === ctx?.userId),
    [predictions, ctx?.userId]
  );
  const currentUserAnswers = useMemo(
    () => answers.filter((answer) => answer.createdBy === ctx?.userId),
    [answers, ctx?.userId]
  );
  const currentTriviaAnswer = useMemo(
    () => findTriviaAnswerForDate(currentUserAnswers, todayKey),
    [currentUserAnswers, todayKey]
  );
  const activeTriviaQuestion = useMemo(() => {
    if (!currentTriviaAnswer || currentTriviaAnswer.questionKey === todayTriviaQuestion?.key) {
      return todayTriviaQuestion;
    }
    return getScoringQuestionByKey(currentTriviaAnswer.questionKey) || todayTriviaQuestion;
  }, [currentTriviaAnswer, todayTriviaQuestion]);
  const scoreHistory = useMemo(
    () => buildScoreHistory({
      predictions: currentUserPredictions,
      answers: currentUserAnswers,
      matches: matchesWithOfficialScores,
      questions: [...dailyQuestions, ...ALL_SCORING_QUESTIONS],
      currentStanding
    }),
    [currentUserPredictions, currentUserAnswers, matchesWithOfficialScores, dailyQuestions, currentStanding]
  );
  const pointNotifications = useMemo(
    () => buildPointNotifications({
      predictions: currentUserPredictions,
      answers: currentUserAnswers,
      matches: matchesWithOfficialScores,
      questions: [...dailyQuestions, ...ALL_SCORING_QUESTIONS],
    }),
    [currentUserPredictions, currentUserAnswers, matchesWithOfficialScores, dailyQuestions]
  );
  const filteredMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return matchesWithLiveScores.filter((match) => {
      const groupOk = groupFilter === 'all' || match.group === groupFilter || match.stage === groupFilter;
      const queryOk =
        !needle ||
        match.homeTeam.toLowerCase().includes(needle) ||
        match.awayTeam.toLowerCase().includes(needle) ||
        displayTeamName(match.homeTeam).toLowerCase().includes(needle) ||
        displayTeamName(match.awayTeam).toLowerCase().includes(needle);
      return groupOk && queryOk;
    });
  }, [groupFilter, query, matchesWithLiveScores]);

  async function loadGameData() {
    setLoading(true);
    setError('');
    if (localSimulation && isMockContext(ctx)) {
      setPredictions(mergeMockPredictions([], ctx, scope.workspaceId));
      setAnswers([]);
      setLongTermBet(createMockLongTermBet(ctx, scope.workspaceId));
      setAllLongTermBets([createMockLongTermBet(ctx, scope.workspaceId)]);
      setManualAdjustments([]);
      setOfficialMatches([]);
      setAppConfig({
        openingKickoffAt: getLongTermLockAt(tournamentMatches),
        championActual: '',
        topScorerActual: '',
        youngPlayerActual: '',
        goldenBallActual: '',
      });
      setMembers(mergeMockMembers([], ctx));
      setNotice('DEV mock: sample predictions and 6 match scores loaded.');
      setLoading(false);
      return;
    }

    try {
      const [predictionRows, answerRows, longTermRow, memberRows, tournamentState] = await Promise.all([
        fetchPredictions(scope.workspaceId),
        fetchDailyAnswers(scope.workspaceId),
        localSimulation ? Promise.resolve(null) : fetchLongTermBet(scope.workspaceId, ctx.userId),
        listMembers(scope.workspaceId),
        fetchTournamentState(scope.workspaceId),
      ]);
      setPredictions(localSimulation ? mergeMockPredictions(predictionRows, ctx, scope.workspaceId) : predictionRows);
      setAnswers(answerRows);
      setLongTermBet(longTermRow || (localSimulation ? createMockLongTermBet(ctx, scope.workspaceId) : null));
      let nextTournamentState = tournamentState;
      if (isMushyAdmin(ctx) && tournamentState.matches.length === 0) {
        await syncTournamentSchedule({ workspaceId: scope.workspaceId, userId: ctx.userId, matches: MATCHES });
        nextTournamentState = await fetchTournamentState(scope.workspaceId);
      }
      applyTournamentState(nextTournamentState);
      const ensuredMembers = ensureCurrentMember(memberRows, ctx);
      setMembers(localSimulation ? mergeMockMembers(ensuredMembers, ctx) : ensuredMembers);
    } catch (err) {
      if (localSimulation) {
        setPredictions(mergeMockPredictions([], ctx, scope.workspaceId));
        setAnswers([]);
        setLongTermBet(createMockLongTermBet(ctx, scope.workspaceId));
        setAllLongTermBets([createMockLongTermBet(ctx, scope.workspaceId)]);
        setManualAdjustments([]);
        setMembers(mergeMockMembers([], ctx));
        setNotice('DEV mock: DB unavailable, using local sample data.');
        return;
      }
      setError(err.message || 'Không tải được dữ liệu game.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePrediction(match, draft) {
    try {
      const nextPrediction = {
        workspaceId: scope.workspaceId,
        createdBy: ctx.userId,
        matchNo: match.matchNo,
        matchDay: match.matchDay,
        homePred: normalizeScore(draft.homePred),
        awayPred: normalizeScore(draft.awayPred),
        doubleDown: draft.doubleDown === true,
      };

      if (isPredictionLocked(match)) {
        throw new Error('Trận này đã khóa dự đoán trước giờ bóng lăn 15 phút.');
      }

      if (draft.doubleDown) {
        if (!isDoubleDownWindowOpen(match)) {
          throw new Error('Kèo tủ chỉ mở trong 1 ngày trước khi trận đấu diễn ra.');
        }
        const existingDailyDouble = predictions.find(
          (prediction) =>
            prediction.createdBy === ctx.userId &&
            prediction.doubleDown &&
            prediction.matchDay === match.matchDay &&
            Number(prediction.matchNo) !== Number(match.matchNo)
        );
        if (existingDailyDouble) {
          throw new Error(`Ngày ${formatDate(match.matchDay)} đã có kèo tủ ở trận #${existingDailyDouble.matchNo}.`);
        }
      }

      if (localSimulation && isMockContext(ctx)) {
        setPredictions((rows) => upsertLocalPrediction(rows, nextPrediction));
        setNotice('DEV mock: saved prediction locally.');
        return true;
      }

      const { error: upsertError } = await db.from('group_predictions').upsert(
        {
          workspace_id: scope.workspaceId,
          created_by: ctx.userId,
          match_no: match.matchNo,
          match_day: match.matchDay,
          home_pred: nextPrediction.homePred,
          away_pred: nextPrediction.awayPred,
          double_down: nextPrediction.doubleDown,
        },
        { onConflict: 'workspace_id,created_by,match_no' }
      );
      if (upsertError) {
        if (localSimulation && isAuthError(upsertError)) {
          setPredictions((rows) => upsertLocalPrediction(rows, nextPrediction));
          setNotice('DEV local: token hết hạn, đã lưu dự đoán tạm trên máy.');
          return true;
        }
        throw upsertError;
      }

      setPredictions((rows) => upsertLocalPrediction(rows, nextPrediction));
      setPredictions(await fetchPredictions(scope.workspaceId));
      setNotice('Đã lưu dự đoán.');
      track('prediction_saved', { match_no: match.matchNo, double_down: nextPrediction.doubleDown });
      return true;
    } catch (err) {
      addToast(err.message || 'Không lưu được dự đoán.', 'error');
      return false;
    }
  }

  async function handleLoadMatchInsight(match) {
    const matchNo = Number(match?.matchNo);
    if (!matchNo) return;
    const current = matchInsights[matchNo];
    if (current?.loading || current?.summary) return;

    if (localSimulation && isMockContext(ctx)) {
      setMatchInsights((rows) => ({
        ...rows,
        [matchNo]: {
          loading: false,
          error: '',
          summary: mockMatchInsightSummary(match),
        },
      }));
      return;
    }

    if (!ctx?.token || !scope?.workspaceId) return;

    setMatchInsights((rows) => ({
      ...rows,
      [matchNo]: { ...(rows[matchNo] || {}), loading: true, error: '' },
    }));

    try {
      const payload = await requestMatchInsight(matchNo);

      setMatchInsights((rows) => ({
        ...rows,
        [matchNo]: toMatchInsightState(payload),
      }));
    } catch {
      setMatchInsights((rows) => ({
        ...rows,
        [matchNo]: {
          ...(rows[matchNo] || {}),
          loading: false,
          error: 'AI đang nghỉ giải lao, thử lại sau.',
        },
      }));
    }
  }

  function requestMatchInsight(matchNo) {
    const key = Number(matchNo);
    const activeRequest = matchInsightRequestsRef.current.get(key);
    if (activeRequest) return activeRequest;

    const request = fetch('/api/match-insight', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.token}`,
        'X-Workspace-Id': scope.workspaceId,
        'X-Home-Workspace-Id': ctx.workspaceId || scope.workspaceId,
      },
      body: JSON.stringify({ matchNo: key }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'match_insight_failed');
        return payload;
      })
      .finally(() => {
        matchInsightRequestsRef.current.delete(key);
      });

    matchInsightRequestsRef.current.set(key, request);
    return request;
  }

  function applyTournamentState(nextTournamentState) {
    setAllLongTermBets(nextTournamentState.longTermBets || []);
    setManualAdjustments(nextTournamentState.manualAdjustments || []);
    setOfficialMatches(nextTournamentState.matches || []);
    setAppConfig(nextTournamentState.config);

    const ownLongTermBet = (nextTournamentState.longTermBets || [])
      .find((row) => row.createdBy === ctx?.userId);
    if (ownLongTermBet) setLongTermBet(ownLongTermBet);
  }

  async function refreshTournamentState({ silent = false } = {}) {
    if (!scope?.workspaceId || (localSimulation && isMockContext(ctx))) return;
    try {
      const nextTournamentState = await fetchTournamentState(scope.workspaceId);
      applyTournamentState(nextTournamentState);
    } catch (err) {
      if (!silent) {
        setError(err.message || 'Khong tai duoc du lieu giai dau.');
      } else {
        console.warn('Tournament realtime refresh failed', err);
      }
    }
  }

  async function handleSaveAnswer(question, answer) {
    try {
      const existingAnswer = answers.find(
        (row) => row.createdBy === ctx.userId && row.questionKey === question.key
      );
      if (question.kind === 'trivia' && existingAnswer) {
        throw new Error('Hỏi vui chỉ được trả lời một lần.');
      }
      const existingTriviaAnswerForDate = question.kind === 'trivia'
        ? answers.find((row) => row.createdBy === ctx.userId && isTriviaQuestionKeyForDate(row.questionKey, question.date))
        : null;
      if (existingTriviaAnswerForDate) {
        throw new Error('Hỏi vui hôm nay chỉ được trả lời một lần.');
      }
      if (Date.now() >= new Date(question.closesAt).getTime() || (question.correctAnswer && question.kind !== 'trivia')) {
        throw new Error('Câu hỏi này đã khóa.');
      }
      const cleanAnswer = String(answer || '').trim().replace(/\s+/g, ' ').slice(0, 280);
      if (!cleanAnswer) throw new Error('Bạn cần nhập câu trả lời.');

      if (localSimulation && isMockContext(ctx)) {
        setAnswers((rows) => upsertLocalAnswer(rows, {
          workspaceId: scope.workspaceId,
          createdBy: ctx.userId,
          questionKey: question.key,
          answer: cleanAnswer,
        }));
        setNotice('DEV mock: saved answer locally.');
        return;
      }

      const payload = {
        workspace_id: scope.workspaceId,
        created_by: ctx.userId,
        question_key: question.key,
        answer: cleanAnswer,
      };
      const query = question.kind === 'trivia'
        ? db.from('group_daily_answers').insert(payload)
        : db.from('group_daily_answers').upsert(payload, { onConflict: 'workspace_id,created_by,question_key' });
      const { error: upsertError } = await query;
      if (upsertError) throw upsertError;

      setAnswers(await fetchDailyAnswers(scope.workspaceId));
      setNotice('Đã lưu câu trả lời.');
      track('daily_answer_saved', { question_key: question.key });
    } catch (err) {
      addToast(err.message || 'Không lưu được câu trả lời.', 'error');
    }
  }

  async function handleSaveLongTermBet(draft) {
    try {
      const champion = String(draft.champion || '').trim();
      const topScorer = cleanPlayerAnswer(draft.topScorer);
      const youngPlayer = cleanPlayerAnswer(draft.youngPlayer);
      const goldenBall = cleanPlayerAnswer(draft.goldenBall);
      if (!champion || !topScorer || !youngPlayer || !goldenBall) {
        throw new Error('Bạn cần chọn đủ vô địch, vua phá lưới, cầu thủ trẻ xuất sắc nhất và Quả bóng vàng WORLD CUP.');
      }
      const longTermLockAt = getLongTermLockAt(tournamentMatches, appConfig);
      if (longTermLockAt && Date.now() >= new Date(longTermLockAt).getTime()) {
        throw new Error('Dự đoán dài hạn đã khóa trước vòng play-off.');
      }

      if (localSimulation && isMockContext(ctx)) {
        setLongTermBet({
          id: `${ctx.userId}-long-term-local`,
          workspaceId: scope.workspaceId,
          createdBy: ctx.userId,
          champion,
          topScorer,
          youngPlayer,
          goldenBall,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setNotice('DEV mock: saved long-term bet locally.');
        return;
      }

      const { error: upsertError } = await db.from('long_term_bets').upsert(
        {
          workspace_id: scope.workspaceId,
          created_by: ctx.userId,
          champion,
          top_scorer: topScorer,
          young_player: youngPlayer,
          golden_ball: goldenBall,
        },
        { onConflict: 'workspace_id,created_by' }
      );
      if (upsertError) throw upsertError;

      const nextBet = await fetchLongTermBet(scope.workspaceId, ctx.userId);
      setLongTermBet(nextBet);
      setAllLongTermBets((rows) => [...rows.filter((row) => row.createdBy !== ctx.userId), nextBet]);
      setNotice('Đã lưu dự đoán dài hạn.');
      track('long_term_saved');
    } catch (err) {
      addToast(err.message || 'Không lưu được dự đoán dài hạn.', 'error');
    }
  }

  function handleOpenPredictionRoom(match) {
    setRoomMatch(match);
    setRoomError('');
    if (localSimulation && isMockContext(ctx)) {
      setRoomMessages(createMockRoomMessages({ match, members, ctx, workspaceId: scope?.workspaceId }));
      setRoomRealtimeState('mock-live');
    }
  }

  async function loadRoomMessages(matchNo, { silent = false } = {}) {
    if (!scope?.workspaceId) return;
    if (localSimulation && isMockContext(ctx)) {
      if (!silent) setRoomLoading(false);
      setRoomError('');
      return;
    }
    if (!silent) setRoomLoading(true);
    setRoomError('');
    try {
      const rows = await fetchMatchRoomMessages(scope.workspaceId, matchNo);
      setRoomMessages(rows);
    } catch (err) {
      setRoomError(roomStorageErrorMessage(err));
    } finally {
      if (!silent) setRoomLoading(false);
    }
  }

  async function handleSendRoomMessage({ kind = 'chat', body = '', emoji = null }) {
    if (!roomMatch || !scope?.workspaceId || !ctx?.userId) return false;
    const now = Date.now();
    const cleanBody = String(body || '').trim().replace(/\s+/g, ' ').slice(0, 280);
    if (!cleanBody) return false;
    const repeatKey = `${kind}:${normalizeChatRepeatKey(cleanBody)}`;
    const recentRepeats = chatRepeatRef.current.filter((item) => now - item.time <= CHAT_REPEAT_WINDOW_MS);
    const sameRepeatCount = recentRepeats.filter((item) => item.key === repeatKey).length;
    if (sameRepeatCount >= CHAT_REPEAT_LIMIT) {
      const blockedUntil = now + 15000;
      chatRepeatRef.current = recentRepeats;
      setSpamBlockedUntil(blockedUntil);
      setRoomError('Một câu giống hệt chỉ được lặp tối đa 2 lần trong phòng. Đổi câu cà khịa rồi gửi tiếp nhé.');
      return false;
    }
    if (spamBlockedUntil > now) {
      setRoomError(`Bạn gửi hơi sung. Chờ ${Math.ceil((spamBlockedUntil - now) / 1000)}s rồi cà khịa tiếp.`);
      return false;
    }

    const recent = chatSendTimesRef.current.filter((time) => now - time <= 1000);
    if (recent.length >= 3) {
      const blockedUntil = now + 20000;
      chatSendTimesRef.current = recent;
      setSpamBlockedUntil(blockedUntil);
      setRoomError('Bạn gửi 3 tin quá nhanh. Phòng khóa chat của bạn 20s để chống spam.');
      return false;
    }

    const optimisticMessage = {
      id: `local-${ctx.userId}-${roomMatch.matchNo}-${now}`,
      workspaceId: scope.workspaceId,
      createdBy: ctx.userId,
      matchNo: roomMatch.matchNo,
      kind,
      body: cleanBody,
      emoji,
      createdAt: new Date(now).toISOString(),
      optimistic: true,
    };

    chatSendTimesRef.current = [...recent, now];
    chatRepeatRef.current = [...recentRepeats, { key: repeatKey, time: now }];
    setRoomMessages((rows) => [...rows, optimisticMessage]);
    setRoomError('');

    if (localSimulation && isMockContext(ctx)) {
      const saved = {
        ...optimisticMessage,
        id: `mock-room-${roomMatch.matchNo}-${now}`,
        optimistic: false,
      };
      window.setTimeout(() => {
        setRoomRealtimeState('mock-live');
        setRoomMessages((rows) => rows.map((row) => (row.id === optimisticMessage.id ? saved : row)));
      }, 120);
      return true;
    }

    try {
      const saved = await insertMatchRoomMessage({
        workspaceId: scope.workspaceId,
        createdBy: ctx.userId,
        matchNo: roomMatch.matchNo,
        kind,
        body: cleanBody,
        emoji,
      });
      setRoomMessages((rows) => rows.map((row) => (row.id === optimisticMessage.id ? saved : row)));
      if (kind === 'chat') {
        notifyMentionedRoomMembers({
          body: cleanBody,
          members,
          currentUserId: ctx.userId,
          senderName: memberDisplayName(new Map(members.map((member) => [member.user_id, member])), ctx.userId),
          match: roomMatch,
        });
      }
      return true;
    } catch (err) {
      setRoomMessages((rows) => rows.map((row) => (row.id === optimisticMessage.id ? { ...row, failed: true } : row)));
      setRoomError(roomStorageErrorMessage(err));
      return false;
    }
  }

  useEffect(() => {
    trackScreen(roomMatch ? 'prediction_room' : activeTab, roomMatch ? { match_no: roomMatch.matchNo } : {});
  }, [activeTab, roomMatch?.matchNo]);

  useEffect(() => {
    if (loading) return;
    const params = getCurrentDeepLinkParams();
    const deepLink = parseDeepLinkParams(params);
    const { signature, screen, kind, matchNo, target } = deepLink;
    if (!signature || deepLinkHandledRef.current === signature) return;

    const shouldOpenRoom = target === 'room' || screen === 'room' || kind === 'chat_mention';
    if (screen === 'leaderboard') {
      deepLinkHandledRef.current = signature;
      setActiveTab('leaderboard');
    }
    if (shouldOpenRoom && matchNo) {
      const match = matchesWithLiveScores.find((item) => Number(item.matchNo) === matchNo);
      if (!match) return;
      deepLinkHandledRef.current = signature;
      setActiveTab('matches');
      handleOpenPredictionRoom(match);
      return;
    }
    if (screen === 'match' && matchNo) {
      deepLinkHandledRef.current = signature;
      setActiveTab('matches');
      window.setTimeout(() => document.getElementById(`match-card-${matchNo}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  }, [loading, matchesWithLiveScores, predictionMap, deepLinkRevision]);

  if (ctxError) {
    return <SetupScreen error={ctxError} />;
  }

  function handleRefreshTouchStart(event) {
    refreshGestureRef.current = {
      startY: event.touches?.[0]?.clientY || 0,
      scrollY: window.scrollY || document.documentElement.scrollTop || 0,
    };
  }

  function handleRefreshTouchEnd(event) {
    const endY = event.changedTouches?.[0]?.clientY || 0;
    const distance = refreshGestureRef.current.startY - endY;
    if (loading || refreshGestureRef.current.scrollY > 12 || distance < 110) return;
    loadGameData();
  }



  return (
    <div className="wc-app" onTouchStart={handleRefreshTouchStart} onTouchEnd={handleRefreshTouchEnd}>
      <main>
        {roomMatch ? (
          <PredictionRoomScreen
            match={roomMatch}
            prediction={predictionMap.get(Number(roomMatch.matchNo))}
            predictions={predictions}
            members={members}
            messages={roomMessages}
            loading={roomLoading}
            error={roomError}
            realtimeState={roomRealtimeState}
            spamBlockedUntil={spamBlockedUntil}
            currentUserId={ctx?.userId}
            onBack={() => {
              setRoomMatch(null);
              setRoomMessages([]);
              setRoomError('');
              setRoomRealtimeState('idle');
            }}
            onSend={handleSendRoomMessage}
            onEditPrediction={setEditingPredictionMatch}
            aiInsightsEnabled={aiInsightsEnabled || localSimulation}
            aiInsight={matchInsights?.[Number(roomMatch.matchNo)]}
            onLoadInsight={handleLoadMatchInsight}
          />
        ) : showMyPredictions ? (
          <MyPredictionsScreen
            items={scoreHistory}
            onBack={() => {
              setShowMyPredictions(false);
              setMyPredictionsTab('scored');
            }}
            onEditPrediction={setEditingPredictionMatch}
            onOpenRoom={handleOpenPredictionRoom}
            currentStanding={currentStanding}
            predictedCount={predictionMap.size}
            activeTab={myPredictionsTab}
            onTabChange={setMyPredictionsTab}
          />
        ) : (
          <>
            {activeTab === 'matches' && (
              <PromoHero
                notifications={pointNotifications}
                totalScore={currentStanding?.total ?? 0}
                userId={ctx?.userId}
                canManage={canManageTournament}
                onOpenAdmin={() => setAdminOpen(true)}
              />
            )}

            {(error || loading) && (
              <div className={`toast-line ${error ? 'error' : ''}`} role="status">
                {loading ? 'Đang tải dữ liệu...' : error}
              </div>
            )}

            {activeTab === 'matches' && (
              <MatchesScreen
                matches={filteredMatches}
                allMatches={matchesWithLiveScores}
                predictions={predictions}
                predictionMap={predictionMap}
                answerMap={answerMap}
                dailyDoubleDownMap={dailyDoubleDownMap}
                dailyQuestions={dailyQuestions}
                triviaQuestion={activeTriviaQuestion}
                groupFilter={groupFilter}
                query={query}
                onGroupFilter={setGroupFilter}
                onQuery={setQuery}
                onSave={handleSavePrediction}
                onOpenRoom={handleOpenPredictionRoom}
                onOpenDaily={() => setActiveTab('daily')}
                onOpenLeaderboard={() => setActiveTab('leaderboard')}
                liveSync={liveSync}
                aiInsightsEnabled={aiInsightsEnabled || localSimulation}
                matchInsights={matchInsights}
                onLoadMatchInsight={handleLoadMatchInsight}
                onEditPrediction={setEditingPredictionMatch}
              />
            )}
            {activeTab === 'matches' && (
              <>
                <TopPredictors standings={standings} />
                <RewardBanner onOpenRules={() => setActiveTab('rules')} />
              </>
            )}
            {activeTab === 'daily' && (
              <DailyScreen
                questions={dailyQuestions}
                triviaQuestion={activeTriviaQuestion}
                userId={ctx?.userId}
                answerMap={answerMap}
                answers={currentUserAnswers}
                longTermBet={longTermBet}
                longTermLocked={Date.now() >= new Date(getLongTermLockAt(tournamentMatches, appConfig)).getTime()}
                onSave={handleSaveAnswer}
                onSaveLongTerm={handleSaveLongTermBet}
              />
            )}
            {activeTab === 'leaderboard' && (
              <LeaderboardScreen
                standings={standings}
                standingsByMode={standingsByMode}
                currentParticipantId={ctx?.userId}
                currentStanding={currentStanding}
                predictedCount={predictionMap.size}
                scoreHistory={scoreHistory}
                matches={matchesWithOfficialScores}
                onShowMyPredictions={() => setShowMyPredictions(true)}
              />
            )}
            {activeTab === 'results' && (
              <ResultsScreen
                matches={matchesWithLiveScores}
                liveSync={liveSync}
              />
            )}
            {activeTab === 'rules' && <RulesScreen />}
          </>
        )}
      </main>

      <nav className="tab-nav bottom-nav" aria-label="Điều hướng">
        {TABS.map((tab) => {
          const effectiveActiveTab = roomMatch ? 'matches' : showMyPredictions ? 'leaderboard' : activeTab;
          const isActive = effectiveActiveTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={isActive ? 'active' : ''}
              onClick={() => {
                setRoomMatch(null);
                setRoomMessages([]);
                setRoomError('');
                setRoomRealtimeState('idle');
                setShowMyPredictions(false);
                setMyPredictionsTab('scored');
                setActiveTab(tab.id);
              }}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="tab-icon" aria-hidden="true">
                <tab.icon size={15} strokeWidth={2.5} />
              </span>
              <span className="tab-label">{tab.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {!roomMatch && !showMyPredictions && <footer className="app-footer">
        <span>Dữ liệu lịch: {DATA_SOURCE.label}</span>
        <a href={DATA_SOURCE.officialUrl} target="_blank" rel="noreferrer">FIFA</a>
        <span>BXH FIFA: {FIFA_RANKING_SOURCE.lastOfficialUpdate}</span>
        <a href={FIFA_RANKING_SOURCE.officialUrl} target="_blank" rel="noreferrer">Ranking</a>
      </footer>}

      <TournamentAdmin
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        ctx={ctx}
        workspaceId={scope?.workspaceId}
        matches={matchesWithOfficialScores}
        dailyQuestions={dailyQuestions}
        members={members}
        standings={standings}
        config={appConfig}
        canManage={canManageTournament}
        onChanged={loadGameData}
      />

      {editingPredictionMatch && (
        <PredictionEditModal
          match={editingPredictionMatch}
          prediction={predictionMap.get(Number(editingPredictionMatch.matchNo))}
          dailyDoubleMatchNo={dailyDoubleDownMap.get(editingPredictionMatch.matchDay)}
          onClose={() => setEditingPredictionMatch(null)}
          onSave={handleSavePrediction}
        />
      )}

      {/* Toast notifications */}
      <div className="toast-container" aria-live="assertive">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item ${toast.type}`} role="alert">
            <span className="toast-icon">
              {toast.type === 'success' && '✅'}
              {toast.type === 'error' && '❌'}
              {toast.type === 'warning' && '⚠️'}
            </span>
            <span className="toast-message">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotificationBell({ notifications = [], totalScore = 0, userId }) {
  const [open, setOpen] = useState(false);
  const storageKey = useMemo(() => `nha-tien-tri.point-notifications.seen.${userId || 'anon'}`, [userId]);
  const notificationKeys = useMemo(() => notifications.map((item) => item.key).filter(Boolean), [notifications]);
  const notificationKeySignature = notificationKeys.join('|');
  const [seenKeys, setSeenKeys] = useState(() => readSeenNotificationKeys(storageKey));
  const wrapRef = useRef(null);
  const unreadCount = notificationKeys.filter((key) => !seenKeys.has(key)).length;
  const countLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  useEffect(() => {
    setSeenKeys(readSeenNotificationKeys(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (!open || notificationKeys.length === 0) return;
    const next = new Set([...readSeenNotificationKeys(storageKey), ...notificationKeys]);
    setSeenKeys(next);
    writeSeenNotificationKeys(storageKey, next);
  }, [open, notificationKeySignature, storageKey]);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (wrapRef.current?.contains(event.target)) return;
      setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="hero-notification" aria-label="Thông báo">
      <button
        className="notify-btn"
        type="button"
        aria-label="Thông báo điểm cộng trừ"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell aria-hidden="true" size={25} strokeWidth={2.7} />
        {unreadCount > 0 ? <span className="notify-badge" aria-hidden="true">{countLabel}</span> : null}
      </button>
      {open && <PointNotificationPanel items={notifications} totalScore={totalScore} />}
    </div>
  );
}

function PointNotificationPanel({ items, totalScore }) {
  return (
    <aside className="point-notification-panel" aria-label="Thông báo biến động điểm">
      <div className="point-notification-head">
        <div>
          <p className="section-label">Điểm +/-</p>
          <h3>{totalScore}đ</h3>
        </div>
        <span>{items.length} cập nhật</span>
      </div>

      {items.length === 0 ? (
        <p className="point-notification-empty">Chưa có biến động điểm. Khi trận FT hoặc câu hỏi chốt đáp án, bảng này sẽ báo ngay.</p>
      ) : (
        <div className="point-notification-list">
          {items.slice(0, 6).map((item) => (
            <article key={item.key} className={`point-notification-row ${item.status === 'saved' ? 'saved' : item.points > 0 ? 'plus' : 'zero'}`}>
              <span className="point-notification-icon" aria-hidden="true">{item.icon}</span>
              <span className="point-notification-copy">
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <b>{item.status === 'saved' ? 'OK' : formatPointDelta(item.points)}</b>
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}

function readSeenNotificationKeys(storageKey) {
  if (typeof window === 'undefined') return new Set();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function writeSeenNotificationKeys(storageKey, keys) {
  if (typeof window === 'undefined') return;
  try {
    const list = [...keys].filter(Boolean).slice(-120);
    window.localStorage.setItem(storageKey, JSON.stringify(list));
  } catch {
    // localStorage can fail in restricted WebViews; the badge will simply reset next session.
  }
}

function PromoHero({ notifications, totalScore, userId, canManage = false, onOpenAdmin }) {
  return (
    <div className="promo-hero-shell">
      <div className="hero-actions">
        {canManage ? (
          <button type="button" className="hero-admin-btn" onClick={onOpenAdmin} aria-label="Mở trung tâm quản lý">
            <Scale aria-hidden="true" size={18} strokeWidth={2.5} />
            <span>Quản lý</span>
          </button>
        ) : null}
        <NotificationBell notifications={notifications} totalScore={totalScore} userId={userId} />
      </div>
      <section className="promo-hero" aria-label="Dự đoán nhận quà">
        <div className="confetti-layer" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="promo-copy">
          <h2>Dự đoán cực hay</h2>
          <strong>Rinh quà mỗi ngày!</strong>
        </div>
        <div className="goal-scene" aria-hidden="true">
          <div className="goal-net" />
          <div className="hero-ball">⚽</div>
        </div>
      </section>
    </div>
  );
}

function TopPredictors({ standings }) {
  const fallback = [
    { participantId: 'sample-1', displayName: 'Minh Anh', total: 1250, rank: 1 },
    { participantId: 'sample-2', displayName: 'Hoàng Nam', total: 1120, rank: 2 },
    { participantId: 'sample-3', displayName: 'Phương Linh', total: 980, rank: 3 },
  ];
  const rows = (standings || []).slice(0, 3);
  const podium = rows.length >= 3 ? rows : fallback;

  return (
    <section className="top-predictors" aria-label="Top dự đoán">
      <div className="top-predictors-head">
        <h2>Top dự đoán hôm nay</h2>
        <span aria-hidden="true">🏆</span>
      </div>
      <div className="top-predictors-row">
        {podium.map((row, index) => (
          <article key={row.participantId || row.id || index} className={`predictor-chip rank-${index + 1}`}>
            <b>{index + 1}</b>
            <span className="predictor-avatar" aria-hidden="true">{index === 0 ? '🍄' : index === 1 ? '👦' : '👧'}</span>
            <div>
              <strong>{row.displayName || row.name || `Người chơi ${index + 1}`}</strong>
              <small>{Number(row.total || row.points || 0).toLocaleString('vi-VN')} điểm</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RewardBanner({ onOpenRules }) {
  return (
    <section className="reward-banner">
      <span aria-hidden="true">🎁</span>
      <strong>Dự đoán đúng - Nhận quà khủng!</strong>
      <button type="button" onClick={onOpenRules} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        Xem thể lệ <ArrowRight size={16} />
      </button>
    </section>
  );
}

function SetupScreen({ error }) {
  return (
    <main className="join-layout">
      <section className="join-copy">
        <p className="eyebrow">Mushy mini-app</p>
        <h1>Mở app này từ Mushy để vào sân.</h1>
        <p>
          Người chơi không cần đăng ký tài khoản riêng. App dùng tài khoản và workspace Mushy
          hiện tại để lưu dự đoán, tính điểm và xếp hạng.
        </p>
        <div className="join-photo-wrap">
          <img src="/mushy.png" alt="Linh vật Mushy tiên tri World Cup" />
        </div>
      </section>
      <section className="join-panel">
        <span className="brand-mark">26</span>
        <h2>Chưa có context</h2>
        <p className="form-error">{error}</p>
      </section>
    </main>
  );
}

function MatchesScreen({
  matches,
  allMatches,
  predictions,
  predictionMap,
  answerMap,
  dailyDoubleDownMap,
  dailyQuestions,
  triviaQuestion,
  groupFilter,
  query,
  onGroupFilter,
  onQuery,
  onSave,
  onOpenRoom,
  onOpenDaily,
  onOpenLeaderboard,
  liveSync,
  aiInsightsEnabled,
  matchInsights,
  onLoadMatchInsight,
  onEditPrediction,
}) {
  const grouped = useMemo(() => groupByDate(matches), [matches]);
  const todayKey = getLocalDateKey();
  const dayPages = useMemo(() => grouped.map(([date, dayMatches]) => {
    const openMatches = dayMatches.filter((match) => !hasUnknownTeam(match) && !isPredictionLocked(match));
    const predictedCount = dayMatches.filter((match) => predictionMap.has(Number(match.matchNo))).length;
    const pendingCount = openMatches.filter((match) => !predictionMap.has(Number(match.matchNo))).length;
    return {
      date,
      matches: dayMatches,
      openCount: openMatches.length,
      predictedCount,
      pendingCount,
    };
  }), [grouped, predictionMap]);
  const [selectedDate, setSelectedDate] = useState('');
  const effectiveSelectedDate = dayPages.some((page) => page.date === selectedDate)
    ? selectedDate
    : pickDefaultMatchDay(dayPages, todayKey);
  const selectedPage = dayPages.find((page) => page.date === effectiveSelectedDate) || null;
  const selectedIndex = selectedPage ? dayPages.findIndex((page) => page.date === selectedPage.date) : -1;
  const selectedDayStatus = selectedPage ? getDayPageStatusText(selectedPage, todayKey) : '';
  const roastMap = useMemo(
    () => buildRoastMap(matches, predictionMap),
    [matches, predictionMap]
  );
  const predictionCountByMatch = useMemo(() => {
    const map = new Map();
    for (const prediction of predictions || []) {
      const matchNo = Number(prediction.matchNo);
      map.set(matchNo, (map.get(matchNo) || 0) + 1);
    }
    return map;
  }, [predictions]);
  const [showExtraGroups, setShowExtraGroups] = useState(false);
  const extraActive = EXTRA_GROUP_FILTERS.includes(groupFilter);
  const knockoutActive = KNOCKOUT_FILTERS.some((round) => round.id === groupFilter);
  const moreLabel = extraActive
    ? `+ Bảng ${groupFilter}`
    : knockoutActive
      ? KNOCKOUT_FILTERS.find((round) => round.id === groupFilter)?.label || '+ thêm'
      : '+ thêm';

  useEffect(() => {
    if (!dayPages.length) {
      if (selectedDate) setSelectedDate('');
      return;
    }

    if (selectedDate !== effectiveSelectedDate) {
      setSelectedDate(effectiveSelectedDate);
    }
  }, [dayPages, effectiveSelectedDate, selectedDate]);

  function focusMatch(match) {
    if (!match) return;
    setSelectedDate(match.matchDay);
    window.setTimeout(() => {
      document.getElementById(`match-card-${match.matchNo}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 90);
  }

  function handleDayChange(nextIndex) {
    const nextPage = dayPages[nextIndex];
    if (nextPage) setSelectedDate(nextPage.date);
  }

  function handleDayPrimaryAction() {
    if (!selectedPage) return;
    const nextPendingMatch = selectedPage.matches.find(
      (match) => !hasUnknownTeam(match) && !isPredictionLocked(match) && !predictionMap.has(Number(match.matchNo))
    );
    const visibleMatch = nextPendingMatch
      || selectedPage.matches.find((match) => !hasUnknownTeam(match))
      || selectedPage.matches[0];
    focusMatch(visibleMatch);
  }

  return (
    <section className="screen">
      <TodayChecklist
        matches={allMatches || matches}
        predictionMap={predictionMap}
        answerMap={answerMap}
        dailyDoubleDownMap={dailyDoubleDownMap}
        dailyQuestions={dailyQuestions}
        triviaQuestion={triviaQuestion}
        onGroupFilter={onGroupFilter}
        onQuery={onQuery}
        onFocusMatch={focusMatch}
        onOpenDaily={onOpenDaily}
        onOpenLeaderboard={onOpenLeaderboard}
      />

      <div className="screen-heading">
        <div>
          <p className="eyebrow">Dự đoán tỉ số</p>
          <h2>Trận đấu sắp tới</h2>
          <LiveSyncStatus liveSync={liveSync} />
        </div>
        <div className="search-pill">
          <span>Tìm</span>
          <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Đội bóng..." />
        </div>
      </div>

      <div className="group-filter-wrap" role="group" aria-label="Lọc bảng">
        <div className="chip-row">
          <button
            type="button"
            className={groupFilter === 'all' ? 'active' : ''}
            onClick={() => onGroupFilter('all')}
          >
            Tất cả
          </button>
          {PRIMARY_GROUP_FILTERS.map((group) => (
            <button
              key={group}
              type="button"
              className={groupFilter === group ? 'active' : ''}
              onClick={() => onGroupFilter(group)}
            >
              Bảng {group}
            </button>
          ))}
          <button
            type="button"
            className={showExtraGroups || extraActive || knockoutActive ? 'active' : ''}
            onClick={() => setShowExtraGroups((value) => !value)}
          >
            {moreLabel}
          </button>
        </div>
        {(showExtraGroups || extraActive || knockoutActive) && (
          <div className="chip-row extra-groups">
            {EXTRA_GROUP_FILTERS.map((group) => (
              <button
                key={group}
                type="button"
                className={groupFilter === group ? 'active' : ''}
                onClick={() => onGroupFilter(group)}
              >
                Bảng {group}
              </button>
            ))}
            {KNOCKOUT_FILTERS.map((round) => (
              <button
                key={round.id}
                type="button"
                className={groupFilter === round.id ? 'active' : ''}
                onClick={() => onGroupFilter(round.id)}
              >
                {round.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedPage ? (
        <section className="day-pager" aria-label="Phân trang trận đấu theo ngày">
          <div className="day-pager-head">
            <button
              type="button"
              className="day-nav-btn"
              disabled={selectedIndex <= 0}
              onClick={() => handleDayChange(selectedIndex - 1)}
              aria-label="Ngày trước"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ArrowLeft size={18} />
            </button>
            <div className="day-pager-copy">
              <p>Ngày {selectedIndex + 1}/{dayPages.length}</p>
              <h3>{formatDate(selectedPage.date)}</h3>
              <span>
                {selectedPage.matches.length} trận · {selectedPage.predictedCount}/{selectedPage.matches.length} đã dự · {selectedDayStatus}
              </span>
            </div>
            <button
              type="button"
              className="day-nav-btn"
              disabled={selectedIndex >= dayPages.length - 1}
              onClick={() => handleDayChange(selectedIndex + 1)}
              aria-label="Ngày sau"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ArrowRight size={18} />
            </button>
          </div>

          <div className="day-chip-row" role="tablist" aria-label="Danh sách ngày thi đấu">
            {dayPages.map((page, index) => {
              const active = page.date === selectedPage.date;
              return (
                <button
                  key={page.date}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={active ? 'active' : ''}
                  onClick={() => setSelectedDate(page.date)}
                >
                  <span>{getDayChipLabel(page.date, index, todayKey)}</span>
                  <strong>{formatShortDate(page.date)}</strong>
                  <small>{page.pendingCount > 0 ? `${page.pendingCount} chưa dự` : `${page.predictedCount}/${page.matches.length} đã dự`}</small>
                </button>
              );
            })}
          </div>

          <button type="button" className="secondary-btn day-pager-jump" onClick={handleDayPrimaryAction}>
            {selectedPage.pendingCount > 0 ? 'Dự trận chưa làm' : selectedPage.date < todayKey ? 'Xem trận ngày này' : 'Xem lịch ngày này'}
          </button>
        </section>
      ) : (
        <p className="empty-state match-empty-state">Không có trận nào khớp bộ lọc hiện tại.</p>
      )}

      {selectedPage ? (
        <div className="match-days">
          <section className="match-day" id={`match-day-${selectedPage.date}`} key={selectedPage.date}>
            <div className="date-header">
              <h3>{formatDate(selectedPage.date)}</h3>
              <span>{selectedPage.matches.length} trận</span>
            </div>
            <div className="match-grid">
              {selectedPage.matches.map((match) => (
                <MatchCardPrototype
                  key={match.matchNo}
                  match={match}
                  prediction={predictionMap.get(match.matchNo)}
                  predictionCount={predictionCountByMatch.get(Number(match.matchNo)) || 0}
                  roastText={roastMap.get(Number(match.matchNo))}
                  dailyDoubleMatchNo={dailyDoubleDownMap.get(match.matchDay)}
                  aiInsightsEnabled={aiInsightsEnabled}
                  aiInsight={matchInsights?.[Number(match.matchNo)]}
                  onSave={onSave}
                  onOpenRoom={onOpenRoom}
                  onLoadInsight={onLoadMatchInsight}
                  onEditPrediction={onEditPrediction}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function TodayChecklist({
  matches = [],
  predictionMap = new Map(),
  answerMap = new Map(),
  dailyDoubleDownMap = new Map(),
  dailyQuestions = DAILY_QUESTIONS,
  triviaQuestion = null,
  onGroupFilter,
  onQuery,
  onFocusMatch,
  onOpenDaily,
  onOpenLeaderboard,
}) {
  const today = getLocalDateKey();
  const todayMatches = useMemo(
    () => matches
      .filter((match) => match.matchDay === today && !hasUnknownTeam(match))
      .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime()),
    [matches, today]
  );
  const openTodayMatches = todayMatches.filter((match) => !isPredictionLocked(match));
  const predictedToday = todayMatches.filter((match) => predictionMap.has(Number(match.matchNo)));
  const pendingMatches = openTodayMatches.filter((match) => !predictionMap.has(Number(match.matchNo)));
  const nextLockMatch = openTodayMatches[0] || null;
  const nextActionMatch = pendingMatches[0] || null;
  const nextScheduleMatch = matches
    .filter((match) => !hasUnknownTeam(match) && !isPredictionLocked(match))
    .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime())[0] || null;
  const todayQuestion = dailyQuestions.find((question) => question.date === today);
  const dailyAnswered = todayQuestion ? answerMap.has(todayQuestion.key) : false;
  const dailyLocked = todayQuestion ? Date.now() >= new Date(todayQuestion.closesAt).getTime() || !!todayQuestion.correctAnswer : false;
  const triviaAnswered = triviaQuestion ? answerMap.has(triviaQuestion.key) : false;
  const triviaLocked = triviaQuestion ? Date.now() >= new Date(triviaQuestion.closesAt).getTime() : false;
  const doubleDownUsed = !!dailyDoubleDownMap.get(today);
  const hasMatchesToday = todayMatches.length > 0;
  const hasQuestionTask = !!todayQuestion || !!triviaQuestion;
  const noTasksToday = !hasMatchesToday && !hasQuestionTask;
  const allMatchesDone = hasMatchesToday && pendingMatches.length === 0;
  const allQuestionTasksDone = (!todayQuestion || dailyAnswered || dailyLocked)
    && (!triviaQuestion || triviaAnswered || triviaLocked);
  const checklistDone = (!hasMatchesToday || allMatchesDone)
    && (doubleDownUsed || !openTodayMatches.length)
    && allQuestionTasksDone;
  const checklistTaskCount = (hasMatchesToday ? todayMatches.length : 0)
    + (openTodayMatches.length ? 1 : 0)
    + (todayQuestion ? 1 : 0)
    + (triviaQuestion ? 1 : 0);
  const checklistDoneCount = (hasMatchesToday ? predictedToday.length : 0)
    + (openTodayMatches.length ? Number(doubleDownUsed) : 0)
    + (todayQuestion ? Number(dailyAnswered || dailyLocked) : 0)
    + (triviaQuestion ? Number(triviaAnswered || triviaLocked) : 0);

  function scrollToMatch(match) {
    if (!match) return;
    onGroupFilter?.('all');
    onQuery?.('');
    window.setTimeout(() => onFocusMatch?.(match), 0);
  }

  function openQuestionTask() {
    if (todayQuestion || triviaQuestion) {
      onOpenDaily?.();
    }
  }

  return (
    <section className={`today-checklist ${checklistDone && !noTasksToday ? 'done' : ''}`} aria-label="Checklist hôm nay">
      <div className="today-checklist-head">
        <div>
          <p className="eyebrow">Checklist hôm nay</p>
          <h2>{noTasksToday ? 'Chưa có nhiệm vụ hôm nay' : checklistDone ? 'Xong việc hôm nay rồi' : hasMatchesToday ? `${pendingMatches.length} việc cần xử lý` : 'Còn câu hỏi cần làm'}</h2>
        </div>
        <span>{checklistDoneCount}/{checklistTaskCount || 0} nhiệm vụ</span>
      </div>

      <div className="today-checklist-items">
        <ChecklistItem
          icon="🗓"
          tone={hasMatchesToday && allMatchesDone ? 'ok' : 'todo'}
          label={hasMatchesToday ? `Đã dự ${predictedToday.length}/${todayMatches.length} trận hôm nay` : 'Hôm nay chưa có trận cần dự đoán'}
          onClick={() => scrollToMatch(nextActionMatch || todayMatches[0] || nextScheduleMatch)}
        />
        <ChecklistItem
          icon="⏰"
          tone={nextLockMatch && timeUntilMs(getPredictionLockAt(nextLockMatch)) <= 60 * 60 * 1000 ? 'warn' : 'neutral'}
          label={nextLockMatch
            ? `${displayTeamName(nextLockMatch.homeTeam)} - ${displayTeamName(nextLockMatch.awayTeam)} khóa sau ${formatTimeUntil(getPredictionLockAt(nextLockMatch))}`
            : hasMatchesToday ? 'Các trận hôm nay đã khóa hoặc đã xong' : nextScheduleMatch
              ? `Trận tiếp theo: ${displayTeamName(nextScheduleMatch.homeTeam)} - ${displayTeamName(nextScheduleMatch.awayTeam)} · ${formatTime(nextScheduleMatch.kickoffAt)}`
              : 'Trận gần nhất sẽ hiện khi có lịch'}
          onClick={() => scrollToMatch(nextLockMatch || nextScheduleMatch || todayMatches[0])}
        />
        <ChecklistItem
          icon="★"
          tone={doubleDownUsed ? 'ok' : openTodayMatches.length ? 'todo' : 'neutral'}
          label={doubleDownUsed ? 'Kèo tủ x2: Đã dùng' : openTodayMatches.length ? 'Kèo tủ x2: Chưa dùng' : 'Kèo tủ x2: Chưa mở hôm nay'}
          onClick={() => scrollToMatch(nextActionMatch || nextLockMatch || nextScheduleMatch)}
        />
        <ChecklistItem
          icon="?"
          tone={(!todayQuestion || dailyAnswered || dailyLocked) && (!triviaQuestion || triviaAnswered || triviaLocked) ? 'ok' : 'todo'}
          label={todayQuestion || triviaQuestion
            ? todayQuestion && triviaQuestion
              ? `Câu hỏi: ${Number(dailyAnswered || dailyLocked) + Number(triviaAnswered || triviaLocked)}/2 đã xong`
              : todayQuestion
                ? (dailyAnswered ? 'Câu hỏi ngày: Đã trả lời' : dailyLocked ? 'Câu hỏi ngày: Đã khóa' : 'Câu hỏi ngày: Chưa trả lời')
                : (triviaAnswered ? 'Hỏi vui hôm nay: Đã trả lời' : triviaLocked ? 'Hỏi vui hôm nay: Đã khóa' : 'Hỏi vui hôm nay: Chưa trả lời')
            : 'Câu hỏi ngày: Chưa có'}
          onClick={openQuestionTask}
        />
      </div>
    </section>
  );
}

function ChecklistItem({ icon, label, tone = 'neutral', onClick }) {
  const content = (
    <>
      <span aria-hidden="true">{icon}</span>
      <strong>{label}</strong>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={`today-checklist-item ${tone}`} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={`today-checklist-item ${tone}`}>{content}</div>;
}

function LiveSyncStatus({ liveSync }) {
  if (liveSync?.source === 'schedule') {
    const nextLabel = liveSync.nextMatchAt ? formatDateTime(liveSync.nextMatchAt) : '';
    return <p className="live-sync muted">Live score đang nghỉ, sẽ bật lại trước trận tiếp theo{nextLabel ? `: ${nextLabel}` : ''}.</p>;
  }

  if (!liveSync?.source && !liveSync?.error) {
    return <p className="live-sync muted">Live score sẽ tự đồng bộ mỗi 2 phút.</p>;
  }

  if (liveSync.error) {
    return <p className="live-sync error">Live score tạm chưa kết nối.</p>;
  }

  const fetchedLabel = liveSync.fetchedAt ? formatRelativeSyncTime(liveSync.fetchedAt) : 'vừa xong';
  return (
    <p className="live-sync">
      Live score: {sourceLabel(liveSync.source)} · {fetchedLabel}
      {liveSync.fallbackReason ? ' · fallback' : ''}
    </p>
  );
}

function LiveScorePanel({ liveScores, liveSync }) {
  const scores = Array.isArray(liveScores) ? liveScores : [];
  const waitingForSchedule = liveSync?.source === 'schedule';
  const activeCount = scores.filter(isLiveInProgress).length;
  const finishedCount = scores.filter((score) => score.status === 'finished').length;
  const fetchedLabel = liveSync?.fetchedAt ? formatRelativeSyncTime(liveSync.fetchedAt) : 'đang kết nối';
  const source = liveSync?.source ? sourceLabel(liveSync.source) : 'WorldCup26';
  const statusClass = liveSync?.error ? 'error' : activeCount > 0 ? 'active' : scores.length > 0 ? 'ready' : 'muted';
  const headline = liveSync?.error
    ? 'Chưa kết nối được nguồn tỉ số'
    : waitingForSchedule
      ? 'Chờ trận tiếp theo'
      : activeCount > 0
        ? `${activeCount} trận đang live`
        : scores.length > 0
          ? `${scores.length} trận đã đồng bộ`
          : 'Đang chờ dữ liệu trận';

  const syncDetail = waitingForSchedule
    ? `Không gọi API ngoài giờ trận · bật lại ${liveSync?.nextFetchAt ? formatRelativeSyncTime(liveSync.nextFetchAt) : 'trước trận'}`
    : `Nguồn miễn phí: ${source}${liveSync?.fallbackReason ? ' · ESPN fallback' : ''} · ${fetchedLabel}`;
  return (
    <section className={`live-score-panel ${statusClass}`} aria-label="Trạng thái live score">
      <div className="live-score-main">
        <span className="live-score-dot" aria-hidden="true" />
        <div>
          <p className="eyebrow">Live score</p>
          <h2>{headline}</h2>
          <p>{syncDetail}</p>
        </div>
      </div>
      <div className="live-score-metrics" aria-label="Thống kê live score">
        <span><strong>{activeCount}</strong> live</span>
        <span><strong>{finishedCount}</strong> FT API</span>
        <span><strong>{scores.length}</strong> trận</span>
      </div>
    </section>
  );
}

function PredictionScoreEditor({ match, homeScore, awayScore, locked, onBumpScore, className = '' }) {
  return (
    <div className={`fixture prediction-fixture ${className}`}>
      <div className="prediction-side">
        <MatchTeam team={match.homeTeam} />
        <ScorePicker
          score={homeScore}
          locked={locked}
          ariaLabel={`Dự đoán tỉ số ${displayTeamName(match.homeTeam)}`}
          onDecrease={() => onBumpScore?.('home', -1)}
          onIncrease={() => onBumpScore?.('home', 1)}
        />
      </div>
      <span className="score-vs" aria-hidden="true">
        <ColonIcon size={16}/>
      </span>
      <div className="prediction-side">
        <MatchTeam team={match.awayTeam} />
        <ScorePicker
          score={awayScore}
          locked={locked}
          ariaLabel={`Dự đoán tỉ số ${displayTeamName(match.awayTeam)}`}
          onDecrease={() => onBumpScore?.('away', -1)}
          onIncrease={() => onBumpScore?.('away', 1)}
        />
      </div>
    </div>
  );
}

function MatchAiInsightBox({ match, aiInsight, aiInsightsEnabled, onLoadInsight }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!aiInsightsEnabled || !match) return null;

  const finished = isFinished(match);
  const liveScore = shouldShowLiveScore(match) ? match.liveScore : null;
  if (finished || liveScore || hasKickoffStarted(match)) return null;

  const handleToggle = (event) => {
    event.stopPropagation();
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && !aiInsight?.summary && !aiInsight?.loading) {
      onLoadInsight?.(match);
    }
  };

  return (
    <div
      className={`prediction-done match-ai-box ${isOpen ? 'expanded' : 'collapsed'}`}
      onClick={handleToggle}
    >
      <div className="match-ai-box-header">
        <strong>
          <span>🤖</span> Nhận định AI
        </strong>
        <span>
          {isOpen ? 'Ẩn ▲' : 'Xem ▼'}
        </span>
      </div>
      {isOpen && (
        <div className="match-ai-box-content" onClick={(e) => e.stopPropagation()}>
          {aiInsight?.loading ? (
            <span>AI đang soi trận, chờ chút...</span>
          ) : aiInsight?.error ? (
            <span style={{ color: 'var(--danger-v3, #c13515)' }}>{aiInsight.error}</span>
          ) : aiInsight?.summary ? (
            <p>{aiInsight.summary}</p>
          ) : (
            <span>Bấm để nghe AI đọc vị trận này.</span>
          )}
        </div>
      )}
    </div>
  );
}

function MatchCardPrototype({
  match,
  prediction,
  predictionCount = 0,
  roastText,
  dailyDoubleMatchNo,
  aiInsightsEnabled,
  aiInsight,
  onSave,
  onOpenRoom,
  onLoadInsight,
  onEditPrediction,
}) {
  const teamsKnown = !hasUnknownTeam(match);
  const locked = isPredictionLocked(match) || !teamsKnown;
  const finished = isFinished(match);
  const kickoffStarted = hasKickoffStarted(match);
  const liveScore = shouldShowLiveScore(match) ? match.liveScore : null;
  const liveInProgress = isLiveInProgress(liveScore);
  const liveFinished = liveScore?.status === 'finished';
  const doubleDownReserved = !!dailyDoubleMatchNo && dailyDoubleMatchNo !== Number(match.matchNo);
  const [homePred, setHomePred] = useState(prediction?.homePred ?? 0);
  const [awayPred, setAwayPred] = useState(prediction?.awayPred ?? 0);
  const [doubleDown, setDoubleDown] = useState(prediction?.doubleDown ?? false);
  const [saving, setSaving] = useState(false);
  const [editingPrediction, setEditingPrediction] = useState(false);
  const base = matchBasePoints(prediction, match);
  const breakdown = matchScoreBreakdown(prediction, match);
  const displayHomeScore = finished ? match.homeScore : liveScore?.homeScore;
  const displayAwayScore = finished ? match.awayScore : liveScore?.awayScore;

  useEffect(() => {
    setHomePred(prediction?.homePred ?? 0);
    setAwayPred(prediction?.awayPred ?? 0);
    setDoubleDown(prediction?.doubleDown ?? false);
  }, [prediction?.homePred, prediction?.awayPred, prediction?.doubleDown]);

  useEffect(() => {
    setEditingPrediction(false);
  }, [match.matchNo, prediction?.id]);

  const homeScore = normalizeDraftScore(homePred);
  const awayScore = normalizeDraftScore(awayPred);
  const doubleDownWindowOpen = isDoubleDownWindowOpen(match);
  const canUseDoubleDown = teamsKnown && !locked && doubleDownWindowOpen && !doubleDownReserved;
  const canOpenRoom = teamsKnown;
  const draftIsSaved = !!prediction
    && Number(prediction.homePred) === homeScore
    && Number(prediction.awayPred) === awayScore
    && !!prediction.doubleDown === !!doubleDown;
  const showPredictionEditor = !prediction || editingPrediction || !draftIsSaved;
  const predictionButtonLabel = saving
    ? 'Đang lưu...'
    : prediction && draftIsSaved && !editingPrediction
      ? 'Vào phòng dự đoán'
      : prediction
        ? 'Cập nhật dự đoán'
        : 'Lưu dự đoán';
  const socialLine = buildMatchSocialLine({
    prediction,
    predictionCount,
    homeScore,
    awayScore,
    doubleDown,
    draftIsSaved,
    locked,
    teamsKnown,
  });
  const doubleHintText = !teamsKnown
    ? 'Chờ xác định đội.'
    : locked
      ? 'Đã khóa trước giờ bóng lăn 15 phút.'
      : doubleDownReserved
        ? `Kèo tủ x2 đã dùng ở trận #${dailyDoubleMatchNo}.`
        : doubleDownWindowOpen
          ? 'Mỗi ngày chỉ 1 kèo tủ.'
          : 'Kèo tủ chỉ mở trong 1 ngày trước khi trận đấu diễn ra.';

  function bumpScore(side, delta) {
    if (locked) return;
    const setter = side === 'home' ? setHomePred : setAwayPred;
    const current = side === 'home' ? homeScore : awayScore;
    setter(Math.max(0, Math.min(99, current + delta)));
  }

  async function handleSaveClick() {
    if (locked || saving) return;
    setSaving(true);
    try {
      const saved = await onSave(match, { homePred: homeScore, awayPred: awayScore, doubleDown });
      if (saved) setEditingPrediction(false);
    } finally {
      setSaving(false);
    }
  }

  async function handlePrimaryActionClick() {
    if (prediction && draftIsSaved && !editingPrediction) {
      onOpenRoom?.(match);
      return;
    }
    await handleSaveClick();
  }

  return (
    <article
      id={`match-card-${match.matchNo}`}
      className="match-card match-card--prototype"
    >
      <div className="match-card-head">
        <span className="mstage">#{match.matchNo} · {matchStageLabel(match)}</span>
        <span className={finished ? 'mtime done-time' : liveInProgress ? 'mtime live-time' : 'mtime'}>
          {finished ? 'Đã kết thúc' : liveInProgress ? liveLabel(liveScore) : formatTime(match.kickoffAt)}
        </span>
      </div>

      {finished || liveScore ? (
        <>
          <div className="fixture finished-fixture">
            <MatchTeam team={match.homeTeam} score={displayHomeScore} />
            <span className={liveInProgress ? 'ft-badge live-badge' : liveFinished ? 'ft-badge api-ft-badge' : 'ft-badge'}>
              {finished ? finalStatusLabel(match) : liveLabel(liveScore)}
            </span>
            <MatchTeam team={match.awayTeam} score={displayAwayScore} />
          </div>
          <div className={`prediction-done ${prediction ? predictionDoneTone(base) : 'zero'}`}>
            {finished && prediction ? (
              <>
                <span>{roastText || predictionRoast(base, match, prediction)}</span>
                <small>Bạn dự <b>{prediction.homePred}-{prediction.awayPred}</b></small>
                <strong>{matchPointSummary(base, breakdown)}</strong>
              </>
            ) : finished ? (
              <>
                <span>Không xuống tay, bảng điểm cũng không nể nang.</span>
                <strong>+0đ</strong>
              </>
            ) : (
              <>
                <span>
                  {prediction
                    ? <>Bạn dự <b>{prediction.homePred}-{prediction.awayPred}</b></>
                    : liveScore?.clockFallback
                      ? 'Trận đã bắt đầu'
                      : 'Trận đang có tỉ số live tạm'}
                </span>
                <strong className="pending-score">Chưa chấm điểm đến khi nguồn tỉ số báo FT</strong>
              </>
            )}
          </div>
          <div className="match-actions" style={{ marginTop: '8px' }}>
            <button
              type="button"
              className="primary-btn small room-action-btn room-ready"
              style={{ gridColumn: '1 / -1' }}
              disabled={!canOpenRoom}
              onClick={(event) => {
                event.stopPropagation();
                onOpenRoom?.(match);
              }}
            >
              Vào phòng dự đoán
            </button>
          </div>
        </>
      ) : showPredictionEditor ? (
        <>
          <PredictionScoreEditor
            match={match}
            homeScore={homeScore}
            awayScore={awayScore}
            locked={locked}
            onBumpScore={bumpScore}
          />

          <MatchAiInsightBox
            match={match}
            aiInsight={aiInsight}
            aiInsightsEnabled={aiInsightsEnabled && teamsKnown}
            onLoadInsight={onLoadInsight}
          />

          <div className="match-actions compact-actions">
            <button
              type="button"
              className={`double-btn star-btn ${doubleDown ? 'active' : ''}`}
              disabled={!canUseDoubleDown}
              aria-label={doubleDown ? 'Bỏ kèo tủ x2' : 'Chọn kèo tủ x2'}
              aria-pressed={doubleDown}
              onClick={(event) => {
                event.stopPropagation();
                setDoubleDown((value) => !value);
              }}
              title={`Kèo tủ x2 · ${doubleHintText}`}
            >
              ★
            </button>
            <button
              type="button"
              className={`primary-btn small room-action-btn ${draftIsSaved ? 'room-ready' : prediction ? 'dirty' : ''}`}
              disabled={saving || (!draftIsSaved && locked)}
              onClick={(event) => {
                event.stopPropagation();
                handlePrimaryActionClick();
              }}
            >
              {predictionButtonLabel}
            </button>
            <button
              type="button"
              className="secondary-btn small"
              disabled={!canOpenRoom}
              onClick={(event) => {
                event.stopPropagation();
                onOpenRoom?.(match);
              }}
            >
              Phòng dự đoán
            </button>
          </div>
          <p className="double-hint">
            {!teamsKnown
              ? 'Chờ xác định đội.'
              : locked
                ? 'Đã khóa dự đoán'
                : doubleDownReserved
                  ? `Ngày này đã chọn kèo tủ trận #${dailyDoubleMatchNo}.`
                  : doubleDownWindowOpen
                    ? 'Mỗi ngày chỉ 1 kèo tủ.'
                    : 'Kèo tủ chỉ mở trong 1 ngày trước khi trận đấu diễn ra.'}
          </p>
        </>
      ) : (
        <>
          <div className="fixture finished-fixture saved-fixture">
            <MatchTeam team={match.homeTeam} />
            <span className="ft-badge saved-pick-badge">VS</span>
            <MatchTeam team={match.awayTeam} />
          </div>
          <div className="prediction-done pending">
            <span>Bạn đã lưu dự đoán</span>
            <small>Bạn dự <b>{prediction.homePred}-{prediction.awayPred}</b>{prediction.doubleDown ? ' · kèo tủ x2' : ''}</small>
            <strong>{kickoffStarted ? 'Chờ chốt kết quả' : 'Chờ trận đấu diễn ra'}</strong>
          </div>
          <MatchAiInsightBox
            match={match}
            aiInsight={aiInsight}
            aiInsightsEnabled={aiInsightsEnabled && teamsKnown}
            onLoadInsight={onLoadInsight}
          />
          <div className="match-actions compact-actions saved-actions">
            <button
              type="button"
              className="secondary-btn small"
              disabled={locked}
              onClick={(event) => {
                event.stopPropagation();
                onEditPrediction?.(match);
              }}
            >
              Sửa dự đoán
            </button>
            <button
              type="button"
              className="primary-btn small room-action-btn room-ready"
              onClick={(event) => {
                event.stopPropagation();
                onOpenRoom?.(match);
              }}
            >
              Vào phòng dự đoán
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function PredictionRoomScreen({
  match,
  prediction,
  predictions = [],
  members = [],
  messages = [],
  loading,
  error,
  realtimeState,
  spamBlockedUntil,
  currentUserId,
  onBack,
  onSend,
  onEditPrediction,
  aiInsightsEnabled,
  aiInsight,
  onLoadInsight,
}) {
  const [draft, setDraft] = useState('');
  const [mentionCursor, setMentionCursor] = useState(0);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [predictionFaction, setPredictionFaction] = useState('mine');
  const [showPredictionSheet, setShowPredictionSheet] = useState(false);
  const [activityLimit, setActivityLimit] = useState(3);
  const chatFeedRef = useRef(null);
  const chatInputRef = useRef(null);
  const wasChatNearBottomRef = useRef(true);
  const matchPredictions = useMemo(
    () => predictions
      .filter((item) => Number(item.matchNo) === Number(match.matchNo))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))),
    [predictions, match.matchNo]
  );
  const memberMap = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const mentionMembers = useMemo(
    () => members
      .map((member) => ({ ...member, mentionLabel: mentionMemberLabel(member) }))
      .filter((member) => member.mentionLabel)
      .sort((a, b) => a.mentionLabel.localeCompare(b.mentionLabel, 'vi')),
    [members]
  );
  const mentionableMembers = useMemo(
    () => mentionMembers
      .filter((member) => member.user_id !== currentUserId)
      .sort((a, b) => a.mentionLabel.localeCompare(b.mentionLabel, 'vi')),
    [currentUserId, mentionMembers]
  );
  const activeMention = useMemo(() => getActiveMentionToken(draft, mentionCursor), [draft, mentionCursor]);
  const mentionSuggestions = useMemo(
    () => filterMentionMembers(mentionableMembers, activeMention?.query || '').slice(0, 5),
    [activeMention, mentionableMembers]
  );
  const showMentionSuggestions = !!activeMention && mentionSuggestions.length > 0;
  const split = useMemo(() => buildPredictionSplit(match, matchPredictions), [match, matchPredictions]);
  const myFaction = prediction ? predictedOutcomeKey(prediction) : 'all';
  const activeFaction = predictionFaction === 'mine' ? myFaction : predictionFaction;
  const factionTabs = useMemo(
    () => [
      { key: 'all', label: 'Tất cả', count: matchPredictions.length },
      ...split.map((item) => ({ key: item.key, label: item.label, count: item.count })),
    ],
    [matchPredictions.length, split]
  );
  const visiblePredictions = useMemo(
    () => activeFaction === 'all'
      ? matchPredictions
      : matchPredictions.filter((item) => predictedOutcomeKey(item) === activeFaction),
    [activeFaction, matchPredictions]
  );
  const roomActivityItems = useMemo(
    () => buildRoomPredictionItems({ match, predictions: matchPredictions, memberMap }),
    [match, matchPredictions, memberMap]
  );
  const visibleActivityItems = roomActivityItems.length <= 4
    ? roomActivityItems
    : roomActivityItems.slice(0, activityLimit);
  const canExpandActivity = roomActivityItems.length > 4 && activityLimit < roomActivityItems.length;
  const canCollapseActivity = roomActivityItems.length > 4 && !canExpandActivity && activityLimit > 3;
  const cooldownLeft = Math.max(0, Math.ceil((Number(spamBlockedUntil || 0) - Date.now()) / 1000));

  useEffect(() => {
    setActivityLimit(3);
  }, [match.matchNo]);

  useEffect(() => {
    const feed = chatFeedRef.current;
    if (!feed) return;
    const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
    const shouldStickToBottom = nearBottom || wasChatNearBottomRef.current;
    if (shouldStickToBottom) {
      window.requestAnimationFrame(() => {
        feed.scrollTop = feed.scrollHeight;
        wasChatNearBottomRef.current = true;
      });
    } else {
      wasChatNearBottomRef.current = false;
    }
  }, [messages.length]);

  useEffect(() => {
    wasChatNearBottomRef.current = true;
  }, [match.matchNo]);

  useEffect(() => {
    setActiveMentionIndex(0);
  }, [activeMention?.query, mentionSuggestions.length]);

  function handleChatScroll() {
    const feed = chatFeedRef.current;
    if (!feed) return;
    wasChatNearBottomRef.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  }

  function syncMentionCursor(element) {
    setMentionCursor(element?.selectionStart ?? draft.length);
  }

  function insertMention(member) {
    if (!activeMention) return;
    const mentionText = `@${member.mentionLabel}`;
    const suffix = draft.slice(mentionCursor);
    const spacer = suffix.length === 0 || !/^\s/.test(suffix) ? ' ' : '';
    const nextDraft = `${draft.slice(0, activeMention.start)}${mentionText}${spacer}${suffix}`;
    const nextCursor = activeMention.start + mentionText.length + spacer.length;
    setDraft(nextDraft);
    setMentionCursor(nextCursor);
    setActiveMentionIndex(0);
    window.requestAnimationFrame(() => {
      chatInputRef.current?.focus();
      chatInputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function sendChat() {
    const body = draft.trim();
    if (!body || sending || cooldownLeft > 0) return;
    setSending(true);
    try {
      const ok = await onSend({ kind: 'chat', body });
      if (ok) {
        setDraft('');
        setMentionCursor(0);
      }
    } finally {
      setSending(false);
    }
  }

  const finished = isFinished(match);
  const liveScore = shouldShowLiveScore(match) ? match.liveScore : null;
  const started = finished || liveScore;

  return (
    <section className="prediction-room screen" aria-label={`Phòng dự đoán trận ${match.matchNo}`}>
      <div className="room-head">
        <button type="button" className="room-back" onClick={onBack} aria-label="Quay lại danh sách trận">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="section-label">Phòng dự đoán</p>
          <h2>#{match.matchNo} {displayTeamName(match.homeTeam)} vs {displayTeamName(match.awayTeam)}</h2>
        </div>
      </div>

      <div className="room-status-card">
        <MatchRoomStatus match={match} />
      </div>

      <MatchAiInsightBox
        match={match}
        aiInsight={aiInsight}
        aiInsightsEnabled={aiInsightsEnabled}
        onLoadInsight={onLoadInsight}
      />

      {!started && (
        <div className="room-prematch-controls" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            className="secondary-btn small"
            style={{ width: '100%', minHeight: '38px', borderRadius: '12px', justifyContent: 'center', fontWeight: 'bold' }}
            onClick={() => onEditPrediction?.(match)}
          >
            {prediction ? '✍️ Sửa dự đoán' : '✍️ Dự đoán tỉ số'}
          </button>
        </div>
      )}

      <div className="room-section room-history-compact">
        <div className="room-section-head">
          <h3>Phe phái & Dự đoán</h3>
          <span>{prediction ? `Bạn: ${prediction.homePred}-${prediction.awayPred}` : 'Chưa có kèo'}</span>
        </div>
        
        <div className="prediction-split-bar" aria-label="Tỉ lệ phe dự đoán" style={{ marginTop: '8px' }}>
          {split.map((item) => (
            <span
              key={item.key}
              className={`split-segment ${item.key}`}
              style={{ width: `${item.percent}%` }}
              title={`${item.label}: ${item.percent}%`}
            />
          ))}
        </div>
        
        <div className="prediction-split-legend" style={{ marginBottom: '14px' }}>
          {split.map((item) => (
            <span key={item.key} className={item.key}>
              <i aria-hidden="true" />
              {item.label} <b>{item.percent}%</b>
            </span>
          ))}
        </div>

        <div style={{ borderTop: '1px solid rgba(245, 54, 87, 0.08)', margin: '12px 0 10px' }} />

        <button
          type="button"
          className="prediction-history-row"
          aria-expanded={showPredictionSheet}
          onClick={() => setShowPredictionSheet((value) => !value)}
        >
          <strong>Xem toàn bộ · {matchPredictions.length} người</strong>
        </button>
        
        <div className="room-activity-list" aria-label="Dự đoán tỉ số gần nhất" style={{ marginTop: '8px' }}>
          {visibleActivityItems.length === 0 ? (
            <p className="room-empty compact">Chưa có dự đoán trong phòng.</p>
          ) : visibleActivityItems.map((item) => (
            <article key={item.id} className={`room-activity-item ${item.type}`}>
              <i title={item.name}>{item.initials}</i>
              <span>
                <b>{item.name}</b>
                <small>{item.label} · {formatRoomTime(item.createdAt)}</small>
              </span>
              <strong>{item.body}</strong>
            </article>
          ))}
        </div>
        
        {canExpandActivity ? (
          <button
            type="button"
            className="show-more-predictions room-more-btn"
            onClick={() => setActivityLimit((value) => Math.min(value + 4, roomActivityItems.length))}
          >
            Hiện thêm
          </button>
        ) : canCollapseActivity ? (
          <button type="button" className="show-more-predictions room-more-btn" onClick={() => setActivityLimit(3)}>
            Đóng hết
          </button>
        ) : null}
      </div>

      <div className="room-chat">
        <div className="room-section-head">
          <h3>Cà khịa trực tiếp</h3>
        </div>

        <p className="room-realtime-chip">{roomRealtimeLabel(realtimeState)}</p>
        <div className="reaction-row" aria-label="Thả cảm xúc nhanh">
          {['😂', '🔥', '😭', '🤝'].map((emoji) => (
            <button key={emoji} type="button" disabled={cooldownLeft > 0} onClick={() => onSend({ kind: 'reaction', body: emoji, emoji })}>
              {emoji}
            </button>
          ))}
        </div>

        <div className="chat-feed" ref={chatFeedRef} onScroll={handleChatScroll}>
          {messages.length === 0 ? (
            <p className="room-empty">{error || 'Chưa có ai gáy. Bạn mở bát đi.'}</p>
          ) : messages.map((message) => (
            <article key={message.id} className={`chat-message ${message.createdBy === currentUserId ? 'mine' : ''} ${message.failed ? 'failed' : ''}`}>
              <span>{memberDisplayName(memberMap, message.createdBy)}</span>
              <p>{message.kind === 'reaction' ? `${message.emoji || message.body}` : renderChatMessageBody(message.body, mentionMembers)}</p>
              <small>{message.failed ? 'Chưa gửi được' : formatRoomTime(message.createdAt)}</small>
            </article>
          ))}
        </div>

        {error && messages.length > 0 ? <p className="room-error">{error}</p> : null}
        {cooldownLeft > 0 ? <p className="room-error">Chống spam: chờ khoảng {cooldownLeft}s.</p> : null}

        <div className="chat-compose">
          <div className="chat-input-wrap">
            {showMentionSuggestions ? (
              <div className="mention-menu" role="listbox" aria-label="Gợi ý mention thành viên">
                {mentionSuggestions.map((member, index) => (
                  <button
                    key={member.user_id}
                    type="button"
                    className={index === activeMentionIndex ? 'active' : ''}
                    role="option"
                    aria-selected={index === activeMentionIndex}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertMention(member);
                    }}
                  >
                    {member.avatar_url ? <img src={member.avatar_url} alt="" loading="lazy" /> : <i>{initialsFromName(member.mentionLabel)}</i>}
                    <span>{member.mentionLabel}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <input
              ref={chatInputRef}
              value={draft}
              maxLength={280}
              placeholder={mentionableMembers.length ? 'Gõ @ để mention thành viên...' : 'Cà khịa văn minh, đau nhưng vui...'}
              onChange={(event) => {
                setDraft(event.target.value);
                syncMentionCursor(event.target);
              }}
              onClick={(event) => syncMentionCursor(event.target)}
              onSelect={(event) => syncMentionCursor(event.target)}
              onKeyUp={(event) => syncMentionCursor(event.target)}
              onKeyDown={(event) => {
                if (showMentionSuggestions && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                  event.preventDefault();
                  setActiveMentionIndex((value) => {
                    const delta = event.key === 'ArrowDown' ? 1 : -1;
                    return (value + delta + mentionSuggestions.length) % mentionSuggestions.length;
                  });
                  return;
                }
                if (showMentionSuggestions && (event.key === 'Enter' || event.key === 'Tab')) {
                  event.preventDefault();
                  insertMention(mentionSuggestions[activeMentionIndex] || mentionSuggestions[0]);
                  return;
                }
                if (showMentionSuggestions && event.key === 'Escape') {
                  event.preventDefault();
                  setMentionCursor(0);
                  return;
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  sendChat();
                }
              }}
            />
          </div>
          <button type="button" disabled={!draft.trim() || cooldownLeft > 0 || sending} onClick={sendChat}>
            {sending ? '...' : 'Gửi'}
          </button>
        </div>
      </div>
      {showPredictionSheet && (
        <PredictionHistorySheet
          match={match}
          memberMap={memberMap}
          predictions={matchPredictions}
          factionTabs={factionTabs}
          initialFaction={activeFaction}
          currentUserId={currentUserId}
          onClose={() => setShowPredictionSheet(false)}
        />
      )}
    </section>
  );
}

function PredictionHistorySheet({ match, memberMap, predictions, factionTabs, initialFaction, currentUserId, onClose }) {
  const [activeFaction, setActiveFaction] = useState(initialFaction || 'all');
  const [visibleLimit, setVisibleLimit] = useState(6);
  const activeLabel = factionTabs.find((tab) => tab.key === activeFaction)?.label || 'Tất cả';
  const visiblePredictions = activeFaction === 'all'
    ? predictions
    : predictions.filter((item) => predictedOutcomeKey(item) === activeFaction);
  const limitedPredictions = visiblePredictions.slice(0, visibleLimit);

  return (
    <div className="prediction-sheet-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="prediction-sheet" role="dialog" aria-modal="true" aria-label="Danh sách dự đoán">
        <div className="prediction-sheet-head">
          <div>
            <p className="section-label">Danh sách dự đoán</p>
            <h3>{activeLabel} · {visiblePredictions.length} người</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng danh sách">×</button>
        </div>
        <div className="prediction-faction-tabs sheet-tabs" aria-label="Lọc dự đoán theo phe">
          {factionTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={activeFaction === tab.key ? 'active' : ''}
              onClick={() => {
                setActiveFaction(tab.key);
                setVisibleLimit(6);
              }}
            >
              {tab.label}
              <b>{tab.count}</b>
            </button>
          ))}
        </div>
        <div className="prediction-sheet-list">
          {limitedPredictions.map((item) => (
            <article key={`${item.createdBy}-${item.matchNo}-sheet`} className={item.createdBy === currentUserId ? 'mine' : ''}>
              <span>{memberDisplayName(memberMap, item.createdBy)}</span>
              <b>{item.homePred}-{item.awayPred}</b>
              <small>{item.doubleDown ? 'Kèo tủ x2' : predictionOutcomeLabel(match, item)}</small>
            </article>
          ))}
        </div>
        {visibleLimit < visiblePredictions.length ? (
          <button
            type="button"
            className="show-more-predictions"
            onClick={() => setVisibleLimit((value) => Math.min(value + 6, visiblePredictions.length))}
          >
            Hiện thêm
          </button>
        ) : null}
      </section>
    </div>
  );
}

function MatchRoomStatus({ match }) {
  const liveScore = shouldShowLiveScore(match) ? match.liveScore : null;
  const finished = isFinished(match);
  const liveInProgress = isLiveInProgress(liveScore);
  const homeScore = finished ? match.homeScore : liveScore?.homeScore;
  const awayScore = finished ? match.awayScore : liveScore?.awayScore;
  const status = finished ? finalStatusLabel(match) : liveInProgress ? liveLabel(liveScore) : 'Chưa bắt đầu';
  const hasStarted = finished || liveInProgress;
  const homeScorers = teamScorersText(match, 'home', homeScore, hasStarted);
  const awayScorers = teamScorersText(match, 'away', awayScore, hasStarted);
  const goalTimeline = extractGoalTimeline(match);

  return (
    <div className="room-scoreboard">
      <div className={`room-status-pill ${liveInProgress ? 'live' : finished ? 'done' : ''}`}>{status}</div>
      <div className="room-scoreline">
        <div className="room-team home">
          <TeamFlag team={match.homeTeam} className="room-team-flag" />
          <strong>{displayTeamName(match.homeTeam)}</strong>
          <small>Ghi bàn: {homeScorers}</small>
        </div>
        <div className="room-score">
          <b>{homeScore ?? '-'}</b>
          <span>:</span>
          <b>{awayScore ?? '-'}</b>
        </div>
        <div className="room-team away">
          <TeamFlag team={match.awayTeam} className="room-team-flag" />
          <strong>{displayTeamName(match.awayTeam)}</strong>
          <small>Ghi bàn: {awayScorers}</small>
        </div>
      </div>
      {hasStarted ? (
        <div className="goal-timeline" aria-label="Diễn biến ghi bàn">
          <span />
          {goalTimeline.length > 0 ? (
            <p>{goalTimeline.join(' · ')}</p>
          ) : (
            <p>Đang chờ cập nhật cầu thủ ghi bàn</p>
          )}
        </div>
      ) : (
        <small className="room-kickoff">Bắt đầu {formatTime(match.kickoffAt)}</small>
      )}
    </div>
  );
}

function teamScorersText(match, side, score, hasStarted) {
  const scorers = extractTeamScorers(match, side);
  if (scorers.length > 0) return scorers.join(', ');
  if (!hasStarted) return 'chờ trận';
  if (Number(score || 0) > 0) return 'chưa cập nhật';
  return 'chưa ghi bàn';
}

function extractTeamScorers(match, side) {
  const sideKeys = side === 'home'
    ? ['homeScorers', 'homeGoalScorers']
    : ['awayScorers', 'awayGoalScorers'];
  const direct = sideKeys.flatMap((key) => normalizeScorerList(match?.[key] || match?.liveScore?.[key]));
  if (direct.length > 0) return direct;

  const teamName = side === 'home' ? match?.homeTeam : match?.awayTeam;
  const goals = [
    ...(Array.isArray(match?.goals) ? match.goals : []),
    ...(Array.isArray(match?.goalScorers) ? match.goalScorers : []),
    ...(Array.isArray(match?.liveScore?.goals) ? match.liveScore.goals : []),
    ...(Array.isArray(match?.liveScore?.goalScorers) ? match.liveScore.goalScorers : []),
  ];
  return goals
    .filter((goal) => {
      const goalSide = String(goal?.side || goal?.homeAway || goal?.teamSide || '').toLowerCase();
      const goalTeam = String(goal?.team || goal?.teamName || '').toLowerCase();
      return goalSide === side || canonicalTeamName(goalTeam) === canonicalTeamName(teamName);
    })
    .map(formatGoalScorer)
    .filter(Boolean);
}

function extractGoalTimeline(match) {
  const goals = [
    ...(Array.isArray(match?.goals) ? match.goals : []),
    ...(Array.isArray(match?.goalScorers) ? match.goalScorers : []),
    ...(Array.isArray(match?.liveScore?.goals) ? match.liveScore.goals : []),
    ...(Array.isArray(match?.liveScore?.goalScorers) ? match.liveScore.goalScorers : []),
  ];
  const seen = new Set();
  return goals
    .map((goal) => {
      const name = formatGoalScorer(goal);
      if (!name) return '';
      const side = String(goal?.side || goal?.homeAway || goal?.teamSide || '').toLowerCase();
      const team = side === 'home'
        ? displayTeamName(match?.homeTeam)
        : side === 'away'
          ? displayTeamName(match?.awayTeam)
          : displayTeamName(goal?.team || goal?.teamName || '');
      const label = team ? `${team}: ${name}` : name;
      const key = canonicalTeamName(label);
      if (seen.has(key)) return '';
      seen.add(key);
      return label;
    })
    .filter(Boolean);
}

function normalizeScorerList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(formatGoalScorer).filter(Boolean);
  return String(value).split(/[,;]+/).map((item) => item.trim()).filter(Boolean);
}

function formatGoalScorer(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  const name = value.name || value.player || value.scorer || value.playerName || '';
  const minute = value.minute || value.time || value.clock || '';
  if (!name) return '';
  return minute ? `${name} ${minute}'` : String(name);
}

function MatchTeam({ team, score = null }) {
  const meta = TEAM_META[team];
  const fullName = displayTeamName(team);
  const compactName = compactTeamName(team);
  return (
    <div className="match-team">
      <span className="match-flag" aria-label={`Cờ ${fullName}`}>
        {meta?.flagUrl ? <img src={meta.flagUrl} alt="" loading="lazy" /> : meta?.flag || team.slice(0, 2).toUpperCase()}
      </span>
      <strong title={fullName}>{compactName}</strong>
      {Number.isInteger(meta?.fifaRank) ? <small>FIFA #{meta.fifaRank}</small> : null}
      {score != null ? <b className="real-score">{score}</b> : null}
    </div>
  );
}

const ColonIcon = ({size=24}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide lucide-divide-icon lucide-divide"
    >
      <circle cx="12" cy="6" r="1" />
      <circle cx="12" cy="18" r="1" />
    </svg>
  );
};


function ScorePicker({ score, locked, ariaLabel, onDecrease, onIncrease }) {
  return (
    <div className="score-stepper score-stepper--side" aria-label={ariaLabel}>
      <button type="button" disabled={locked} onClick={onDecrease} aria-label="Giảm tỉ số">
        <Minus size={16} />
      </button>
      <span className="score-value">{score}</span>
      <button type="button" disabled={locked} onClick={onIncrease} aria-label="Tăng tỉ số">
        <Plus size={16} />
      </button>
    </div>
  );
}

function MatchCard({ match, prediction, dailyDoubleMatchNo, onSave }) {
  const locked = isPredictionLocked(match);
  const doubleDownReserved = !!dailyDoubleMatchNo && dailyDoubleMatchNo !== Number(match.matchNo);
  const doubleDownWindowOpen = isDoubleDownWindowOpen(match);
  const [homePred, setHomePred] = useState(prediction?.homePred ?? 0);
  const [awayPred, setAwayPred] = useState(prediction?.awayPred ?? 0);
  const [doubleDown, setDoubleDown] = useState(prediction?.doubleDown ?? false);
  const base = matchBasePoints(prediction, match);
  const breakdown = matchScoreBreakdown(prediction, match);

  useEffect(() => {
    setHomePred(prediction?.homePred ?? 0);
    setAwayPred(prediction?.awayPred ?? 0);
    setDoubleDown(prediction?.doubleDown ?? false);
  }, [prediction?.homePred, prediction?.awayPred, prediction?.doubleDown]);

  return (
    <article className="match-card">
      <div className="match-meta">
        <span>#{match.matchNo} · Bảng {match.group}</span>
        <strong>{formatTime(match.kickoffAt)}</strong>
      </div>
      <div className="teams">
        <TeamRow team={match.homeTeam} />
        <span className="versus">vs</span>
        <TeamRow team={match.awayTeam} />
      </div>

      {isFinished(match) ? (
        <div className="result-line">
          <span>Kết quả 90': {match.homeScore} - {match.awayScore}</span>
          {prediction ? (
            <strong>
              {breakdown.total}đ{base === 5 ? ' · exact' : ''}{breakdown.upsetBonus ? ` · +${breakdown.upsetBonus} cửa dưới` : ''}
            </strong>
          ) : <strong>0đ</strong>}
        </div>
      ) : (
        <div className="lock-line">{locked ? 'Đã khóa dự đoán' : 'Chưa bóng lăn'}</div>
      )}

      <div className="score-editor">
        <label>
          {shortTeam(match.homeTeam)}
          <input type="number" min="0" max="99" value={homePred} disabled={locked} onChange={(event) => setHomePred(event.target.value)} />
        </label>
        <span>-</span>
        <label>
          {shortTeam(match.awayTeam)}
          <input type="number" min="0" max="99" value={awayPred} disabled={locked} onChange={(event) => setAwayPred(event.target.value)} />
        </label>
      </div>

      <div className="match-actions">
        <button
          type="button"
          className={`double-btn ${doubleDown ? 'active' : ''}`}
          disabled={locked || !doubleDownWindowOpen || doubleDownReserved}
          onClick={() => setDoubleDown((value) => !value)}
        >
          Kèo tủ x2
        </button>
        <button type="button" className="primary-btn small" disabled={locked} onClick={() => onSave(match, { homePred, awayPred, doubleDown })}>
          Lưu
        </button>
      </div>
      {!locked && (
        <p className="double-hint">
          {doubleDownReserved
            ? `Ngày này đã chọn kèo tủ trận #${dailyDoubleMatchNo}.`
            : doubleDownWindowOpen
              ? 'Mỗi ngày chỉ 1 kèo tủ.'
              : 'Kèo tủ chỉ mở trong 1 ngày trước khi trận đấu diễn ra.'}
        </p>
      )}
    </article>
  );
}

function DailyScreen({ questions, triviaQuestion, userId, answerMap, answers, longTermBet, longTermLocked, onSave, onSaveLongTerm }) {
  const today = getLocalDateKey();
  const tomorrow = addDaysToDateKey(today, 1);
  const [expandedQuestionKey, setExpandedQuestionKey] = useState(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const { todayQuestions, upcomingQuestions, historyQuestions } = useMemo(() => {
    const sorted = [...questions].sort((a, b) => `${a.date || ''}-${a.key}`.localeCompare(`${b.date || ''}-${b.key}`));
    return {
      todayQuestions: sorted.filter((question) => question.date === today),
      upcomingQuestions: sorted.filter((question) => question.date === tomorrow),
      historyQuestions: sorted.filter((question) => question.date < today).reverse(),
    };
  }, [questions, today, tomorrow]);
  const availableQuestions = useMemo(
    () => questions.filter((question) => question.date <= today),
    [questions, today]
  );
  const answeredCount = availableQuestions.filter((question) => answerMap.has(question.key)).length;
  const pendingCount = availableQuestions.filter((question) => getDailyQuestionState(question, answerMap.get(question.key)).state === 'pending').length;
  const openTodayCount = todayQuestions.filter((question) => getDailyQuestionState(question, answerMap.get(question.key)).state === 'open').length;
  const visibleHistoryQuestions = showAllHistory ? historyQuestions : historyQuestions.slice(0, 6);
  const streak = triviaStreak(answers, getLocalDateKey(), userId);

  function toggleQuestion(questionKey) {
    setExpandedQuestionKey((current) => (current === questionKey ? null : questionKey));
  }

  function renderQuestionCard(question, origin = 'history') {
    const answer = answerMap.get(question.key);
    const { state } = getDailyQuestionState(question, answer);
    const forceExpanded = origin === 'today' && state === 'open';
    const expanded = forceExpanded || expandedQuestionKey === question.key;
    return (
      <QuestionCard
        key={question.key}
        question={question}
        answer={answer}
        onSave={onSave}
        displayMode={expanded ? 'expanded' : 'compact'}
        isToggleable={!forceExpanded}
        onToggle={() => toggleQuestion(question.key)}
      />
    );
  }

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Câu hỏi dự đoán</p>
          <h2>Câu hỏi hôm nay và ngày mai</h2>
        </div>
      </div>
      {triviaQuestion ? (
        <TriviaCard
          question={triviaQuestion}
          answer={answerMap.get(triviaQuestion.key)}
          streak={streak}
          onSave={onSave}
        />
      ) : null}
      <div className="daily-question-board">
        <div className="daily-question-overview" aria-label="Tổng quan câu hỏi dự đoán">
          <div className="daily-question-stat primary">
            <span>Hôm nay</span>
            <strong>{openTodayCount ? `${openTodayCount} câu mở` : todayQuestions.length ? 'Đã gọn' : 'Không có'}</strong>
          </div>
          <div className="daily-question-stat">
            <span>Đã trả lời</span>
            <strong>{answeredCount}/{availableQuestions.length || 0}</strong>
          </div>
          <div className="daily-question-stat">
            <span>Chờ kết quả</span>
            <strong>{pendingCount}</strong>
          </div>
        </div>

        <DailyQuestionGroup
          title="Thử thách hôm nay"
          subtitle=""
          count={todayQuestions.length}
          emptyText="Hôm nay chưa có câu hỏi dự đoán."
        >
          {todayQuestions.map((question) => renderQuestionCard(question, 'today'))}
        </DailyQuestionGroup>

        <DailyQuestionGroup
          title="Sắp mở"
          subtitle="Xem trước ngày mai, tap để mở nếu muốn chuẩn bị đáp án."
          count={upcomingQuestions.length}
          emptyText="Chưa có câu hỏi cho ngày mai."
        >
          {upcomingQuestions.map((question) => renderQuestionCard(question, 'upcoming'))}
        </DailyQuestionGroup>

        <DailyQuestionGroup
          title="Lịch sử câu hỏi"
          subtitle="Các ngày cũ được thu gọn thành timeline, tap từng dòng để xem chi tiết."
          count={historyQuestions.length}
          emptyText="Chưa có lịch sử câu hỏi."
        >
          {visibleHistoryQuestions.map((question) => renderQuestionCard(question, 'history'))}
          {historyQuestions.length > 6 ? (
            <button type="button" className="history-toggle-btn" onClick={() => setShowAllHistory((value) => !value)}>
              {showAllHistory ? 'Thu gọn lịch sử' : `Xem thêm ${historyQuestions.length - 6} câu cũ`}
            </button>
          ) : null}
        </DailyQuestionGroup>
      </div>
      <LongTermBetCard bet={longTermBet} locked={longTermLocked} onSave={onSaveLongTerm} />
    </section>
  );
}

function DailyQuestionGroup({ title, subtitle, count, emptyText, children }) {
  const hasContent = React.Children.count(children) > 0;
  return (
    <section className="daily-question-section">
      <div className="daily-question-section__header">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <span>{count}</span>
      </div>
      <div className="question-list">
        {hasContent ? children : <p className="empty-state compact">{emptyText}</p>}
      </div>
    </section>
  );
}

function TriviaCard({ question, answer, streak, onSave }) {
  const [draft, setDraft] = useState(answer?.answer || '');
  const [loading, setLoading] = useState(false);
  const answered = Boolean(answer);
  const isCorrect = answered && dailyPoints(answer, question) > 0;
  const expired = Date.now() >= new Date(question.closesAt).getTime();

  useEffect(() => setDraft(answer?.answer || ''), [answer?.answer]);

  async function handleSaveClick() {
    if (loading || !draft || expired) return;
    setLoading(true);
    try {
      await onSave(question, draft);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className={`trivia-card ${answered ? (isCorrect ? 'is-correct' : 'is-wrong') : ''}`}>
      <div className="trivia-card__topline">
        <span className="trivia-card__label">Hỏi vui hôm nay</span>
        <span className="trivia-card__points">+{question.points}đ</span>
      </div>
      <div className="trivia-card__meta">
        <span>{question.category}</span>
        <span>{difficultyLabel(question.difficulty)}</span>
        <span>Chuỗi đúng: {streak} ngày</span>
      </div>
      <h3>{question.prompt}</h3>
      <div className="trivia-options" role="group" aria-label="Các đáp án hỏi vui">
        {question.options.map((option) => {
          const selected = draft === option;
          const correct = answered && option === question.correctAnswer;
          const wrong = answered && selected && !correct;
          return (
            <button
              key={option}
              type="button"
              disabled={answered || expired}
              className={`${selected ? 'is-selected' : ''} ${correct ? 'is-answer' : ''} ${wrong ? 'is-missed' : ''}`}
              onClick={() => setDraft(option)}
            >
              <span>{option}</span>
              {correct ? <strong>Đúng</strong> : null}
            </button>
          );
        })}
      </div>
      {answered ? (
        <div className="trivia-reveal" role="status">
          <strong>{isCorrect ? `Chính xác, bạn nhận +${question.points}đ` : 'Chưa đúng rồi, mai phục thù tiếp nhé'}</strong>
          <p>{isCorrect ? question.explanation : `${question.wrongCopy} ${question.explanation} Quay lại ngày mai để thử câu mới.`}</p>
        </div>
      ) : (
        <div className="trivia-card__footer">
          <span>{expired ? 'Câu hỏi hôm nay đã đóng' : 'Chọn kỹ nhé, không được đổi đáp án.'}</span>
          <button type="button" className="primary-btn small" disabled={!draft || expired || loading} onClick={handleSaveClick}>
            {loading ? 'Đang lưu...' : 'Chốt đáp án'}
          </button>
        </div>
      )}
    </article>
  );
}

function QuestionCard({ question, answer, onSave, displayMode = 'expanded', isToggleable = false, onToggle }) {
  const optionItems = useMemo(() => normalizeQuestionOptions(question.options), [question.options]);
  const { hasOfficialAnswer, answered, expired, points, isCorrect, state } = getDailyQuestionState(question, answer);
  const locked = expired || hasOfficialAnswer || answered;
  const [draft, setDraft] = useState(answer?.answer || '');
  const [loading, setLoading] = useState(false);
  const compact = displayMode === 'compact';
  const answerLabel = questionAnswerLabel(answer?.answer, optionItems);
  const officialAnswerLabel = questionAnswerLabel(question.correctAnswer, optionItems);
  const footerText = questionFooterText({ answerLabel, officialAnswerLabel, answered, expired, hasOfficialAnswer });
  const resultText = questionResultText({ officialAnswerLabel, answered, expired, hasOfficialAnswer, isCorrect, points });
  const summaryText = questionSummaryText({ answerLabel, officialAnswerLabel, answered, expired, hasOfficialAnswer, isCorrect, points, question });

  useEffect(() => setDraft(answer?.answer || ''), [answer?.answer]);

  async function handleSaveClick() {
    if (loading || locked || !draft) return;
    setLoading(true);
    try {
      await onSave(question, draft);
    } finally {
      setLoading(false);
    }
  }

  const answerControls = optionItems.length ? (
    <div className="option-grid">
      {optionItems.map((option) => {
        const selected = normalizeAnswer(draft) === normalizeAnswer(option.value);
        const correct = hasOfficialAnswer && normalizeAnswer(option.value) === normalizeAnswer(question.correctAnswer);
        const missed = hasOfficialAnswer && selected && !correct;
        return (
          <button
            key={option.value}
            type="button"
            disabled={locked}
            className={`${selected ? 'active' : ''} ${correct ? 'is-answer' : ''} ${missed ? 'is-missed' : ''}`}
            onClick={() => setDraft(option.value)}
          >
            <span>{option.label}</span>
            {correct ? <strong>Đáp án</strong> : null}
          </button>
        );
      })}
    </div>
  ) : (
    <input className="answer-input" disabled={locked} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Nhập câu trả lời của bạn" />
  );

  const detailBody = (
    <>
      {answerControls}

      {resultText ? (
        <div className={`question-result ${state}`} role="status">
          {resultText}
        </div>
      ) : null}

      <div className="question-footer">
        <span>{footerText}</span>
        {hasOfficialAnswer ? <strong className={`question-score ${isCorrect ? 'ok' : 'miss'}`}>+{points}đ</strong> : null}
        <button type="button" className="primary-btn small" disabled={locked || !draft || loading} onClick={handleSaveClick}>
          {loading ? 'Đang lưu...' : answered ? 'Đã trả lời' : 'Chốt câu trả lời'}
        </button>
      </div>
    </>
  );

  if (compact) {
    return (
      <article className={`question-card daily-question-card compact ${state}`}>
        <button type="button" className="daily-question-summary" onClick={onToggle} aria-expanded="false">
          <span className={`question-timeline-dot ${state}`} aria-hidden="true" />
          <span className="question-summary-main">
            <span className="question-card-meta">
              <span className="date-chip">{formatDate(question.date)}</span>
              <span className={`question-status-pill ${state}`}>{questionStatusLabel(state)}</span>
            </span>
            <strong>{question.prompt}</strong>
            <span>{summaryText}</span>
          </span>
          <span className="question-summary-action" aria-hidden="true">
            <Plus size={16} />
          </span>
        </button>
      </article>
    );
  }

  return (
    <article className={`question-card daily-question-card expanded ${state}`}>
      <div className="question-card-headline">
        <div>
          <div className="question-card-meta">
            <span className="date-chip">{formatDate(question.date)}</span>
            <span className={`question-status-pill ${state}`}>{questionStatusLabel(state)}</span>
          </div>
          <h3>{question.prompt}</h3>
          <p>Khóa trả lời: {formatTime(question.closesAt)} · Đúng +{question.points || 2}đ</p>
        </div>
        {isToggleable ? (
          <button type="button" className="question-collapse-btn" onClick={onToggle}>
            <Minus size={15} />
            Thu gọn
          </button>
        ) : null}
      </div>

      {detailBody}
    </article>
  );
}

function getDailyQuestionState(question, answer) {
  const hasOfficialAnswer = !!question.correctAnswer;
  const answered = !!answer;
  const expired = Date.now() >= new Date(question.closesAt).getTime();
  const points = dailyPoints(answer, question);
  const isCorrect = hasOfficialAnswer && answered && points > 0;
  const state = hasOfficialAnswer ? (isCorrect ? 'correct' : 'wrong') : answered ? 'pending' : expired ? 'locked' : 'open';
  return { hasOfficialAnswer, answered, expired, points, isCorrect, state };
}

function normalizeQuestionOptions(options = []) {
  return (options || []).map((option) => (
    typeof option === 'string'
      ? { value: option, label: option }
      : { value: option.value, label: option.label || option.value }
  )).filter((option) => option.value);
}

function questionAnswerLabel(value, options = []) {
  if (!value) return '';
  const match = options.find((option) => normalizeAnswer(option.value) === normalizeAnswer(value));
  return match?.label || value;
}

function questionStatusLabel(state) {
  if (state === 'correct') return 'Đúng';
  if (state === 'wrong') return 'Sai';
  if (state === 'pending') return 'Chờ kết quả';
  if (state === 'locked') return 'Đã khóa';
  return 'Đang mở';
}

function questionFooterText({ answerLabel, officialAnswerLabel, answered, expired, hasOfficialAnswer }) {
  if (hasOfficialAnswer && answered) return `Bạn trả lời: ${answerLabel} · Đáp án: ${officialAnswerLabel}`;
  if (hasOfficialAnswer) return `Đáp án: ${officialAnswerLabel}`;
  if (answered) return 'Chờ kết quả';
  if (expired) return 'Đã khóa, bạn chưa trả lời';
  return 'Chọn 1 câu trả lời';
}

function questionResultText({ officialAnswerLabel, answered, expired, hasOfficialAnswer, isCorrect, points }) {
  if (hasOfficialAnswer && answered) {
    return isCorrect
      ? `Bạn đúng, nhận +${points}đ.`
      : `Bạn chưa đúng. Đáp án là ${officialAnswerLabel}.`;
  }
  if (hasOfficialAnswer) return `Câu hỏi đã chốt đáp án: ${officialAnswerLabel}.`;
  if (answered) return '';
  if (expired) return 'Câu hỏi đã khóa và bạn chưa trả lời.';
  return '';
}

function questionSummaryText({ answerLabel, officialAnswerLabel, answered, expired, hasOfficialAnswer, isCorrect, points, question }) {
  if (hasOfficialAnswer) {
    if (!answered) return `Đáp án: ${officialAnswerLabel || 'đang cập nhật'} · Bạn chưa trả lời`;
    if (isCorrect) return `Bạn chọn ${answerLabel} · Chính xác +${points}đ`;
    return `Bạn chọn ${answerLabel} · Đáp án: ${officialAnswerLabel || 'đang cập nhật'}`;
  }
  if (answered) return `Bạn chọn ${answerLabel || 'đáp án đã lưu'} · Chờ kết quả`;
  if (expired) return `Đã khóa lúc ${formatTime(question.closesAt)} · Chưa trả lời`;
  return `Khóa lúc ${formatTime(question.closesAt)} · Đúng +${question.points || 2}đ`;
}

function LongTermBetCard({ bet, locked, onSave }) {
  const [champion, setChampion] = useState(bet?.champion || '');
  const [topScorer, setTopScorer] = useState(cleanPlayerDisplayValue(bet?.topScorer));
  const [youngPlayer, setYoungPlayer] = useState(cleanPlayerDisplayValue(bet?.youngPlayer));
  const [goldenBall, setGoldenBall] = useState(cleanPlayerDisplayValue(bet?.goldenBall));
  const teamOptions = useMemo(
    () => TEAM_OPTIONS.map((team) => ({
      value: team,
      label: `${displayTeamName(team)} · FIFA #${TEAM_META[team]?.fifaRank ?? '-'}`,
      icon: null,
    })),
    []
  );
  const scorerOptions = useMemo(
    () => TOP_SCORER_OPTIONS.map((player) => ({
      value: player.value || player.name,
      label: player.label || player.name,
      icon: null,
      meta: player.nationality || player.team || '',
      searchText: player.searchText || `${player.name || ''} ${player.nationality || ''}`,
      featuredRank: getFeaturedPlayerRank(player),
    })),
    []
  );
  const longTermChanged = normalizeAnswer(champion) !== normalizeAnswer(bet?.champion)
    || normalizeAnswer(topScorer) !== normalizeAnswer(bet?.topScorer)
    || normalizeAnswer(youngPlayer) !== normalizeAnswer(bet?.youngPlayer)
    || normalizeAnswer(goldenBall) !== normalizeAnswer(bet?.goldenBall);
  const longTermReady = !!champion && !!topScorer.trim() && !!youngPlayer.trim() && !!goldenBall.trim();
  const saveDisabled = locked || !longTermChanged || !longTermReady;
  const footerLabel = locked
    ? 'Đã khóa trước vòng play-off'
    : !longTermReady
      ? 'Chọn đủ 4 mục để lưu'
      : bet && !longTermChanged
        ? 'Đã lưu, chưa có thay đổi'
        : bet
          ? 'Có thay đổi chưa lưu'
          : 'Chưa lưu dự đoán dài hạn';

  useEffect(() => {
    setChampion(bet?.champion || '');
    setTopScorer(cleanPlayerDisplayValue(bet?.topScorer));
    setYoungPlayer(cleanPlayerDisplayValue(bet?.youngPlayer));
    setGoldenBall(cleanPlayerDisplayValue(bet?.goldenBall));
  }, [bet?.champion, bet?.topScorer, bet?.youngPlayer, bet?.goldenBall]);

  return (
    <article className="question-card long-term-card">
      <div>
        <span className="date-chip">Dài hạn</span>
        <h3>Dự đoán dài hạn</h3>
        <p>Chọn trước giải. Đúng vô địch +20đ, vua phá lưới +10đ, cầu thủ trẻ +10đ, Quả bóng vàng +10đ.</p>
      </div>

      <div className="long-term-fields">
        <label>
          <span>Vô địch</span>
          <Select value={champion} onChange={setChampion} options={teamOptions} placeholder="Chọn đội vô địch" disabled={locked} />
        </label>
        <label>
          <span>Vua phá lưới</span>
          <TopScorerCombobox
            value={topScorer}
            onChange={setTopScorer}
            options={scorerOptions}
            placeholder="Nhập hoặc chọn cầu thủ"
            disabled={locked}
          />
        </label>
        <label>
          <span>Cầu thủ trẻ xuất sắc nhất</span>
          <TopScorerCombobox
            value={youngPlayer}
            onChange={setYoungPlayer}
            options={scorerOptions}
            placeholder="Nhập hoặc chọn cầu thủ trẻ"
            disabled={locked}
          />
        </label>
        <label>
          <span>Quả bóng vàng WORLD CUP</span>
          <TopScorerCombobox
            value={goldenBall}
            onChange={setGoldenBall}
            options={scorerOptions}
            placeholder="Nhập hoặc chọn cầu thủ"
            disabled={locked}
          />
        </label>
      </div>

      <div className="question-footer">
        <span>{footerLabel}</span>
        <button type="button" className="primary-btn small" disabled={saveDisabled} onClick={() => onSave({ champion, topScorer, youngPlayer, goldenBall })}>
          {locked ? 'Đã khóa' : bet && !longTermChanged ? 'Đã lưu' : 'Lưu'}
        </button>
      </div>
    </article>
  );
}

function TopScorerCombobox({ value, onChange, options = [], placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [showFreeTextWarning, setShowFreeTextWarning] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const needle = normalizeAnswer(value);
  const normalizedOptions = useMemo(
    () => options.map((option) => typeof option === 'string' ? { value: option, label: option } : option),
    [options]
  );
  const filteredOptions = useMemo(() => {
    const source = needle ? normalizedOptions : normalizedOptions
      .filter((option) => Number.isFinite(option.featuredRank))
      .sort((left, right) => left.featuredRank - right.featuredRank);
    const ranked = source.filter((option) => (
      normalizeAnswer([
        option.value,
        option.label,
        option.meta,
        option.searchText,
      ].filter(Boolean).join(' ')).includes(needle)
    ));
    return (needle ? ranked : source).slice(0, 10);
  }, [needle, normalizedOptions]);
  const exactMatch = normalizedOptions.some((option) => (
    normalizeAnswer(option.value) === needle || normalizeAnswer(option.label) === needle
  ));

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
        setShowFreeTextWarning(true);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
    if (!value || exactMatch) setShowFreeTextWarning(false);
  }, [needle]);

  function pick(option) {
    onChange(option.value);
    setOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(event) {
    if (disabled) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => Math.min(filteredOptions.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter' && open && filteredOptions[highlight]) {
      event.preventDefault();
      pick(filteredOptions[highlight]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="top-scorer-combobox" ref={wrapRef}>
      <input
        ref={inputRef}
        className="answer-input top-scorer-input"
        value={value}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setShowFreeTextWarning(false);
        }}
        onBlur={() => {
          window.setTimeout(() => setShowFreeTextWarning(true), 120);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setShowFreeTextWarning(false);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="top-scorer-options"
      />
      {open && !disabled ? (
        <div className="top-scorer-panel" id="top-scorer-options" role="listbox">
          {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={index === highlight ? 'active' : ''}
              onMouseEnter={() => setHighlight(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(option);
              }}
            >
              {option.icon ? <span className="top-scorer-option-icon" aria-hidden="true">{option.icon}</span> : null}
              <span className="top-scorer-option-copy">
                <strong>{option.label}</strong>
                {option.meta ? <small>{option.meta}</small> : null}
              </span>
            </button>
          )) : (
            <p>Không có gợi ý phù hợp. Bạn vẫn có thể tự nhập tên.</p>
          )}
        </div>
      ) : null}
      {value && !exactMatch && showFreeTextWarning && !open ? (
        <small className="field-hint scorer-free-text">Tên này chưa có trong gợi ý, vẫn có thể lưu.</small>
      ) : null}
    </div>
  );
}

function ResultsScreen({ matches, liveSync }) {
  const groupTables = useMemo(() => buildFootballGroupTables(matches), [matches]);
  const [selectedGroup, setSelectedGroup] = useState('A');
  const activeGroup = groupTables.find((group) => group.group === selectedGroup) || groupTables[0];
  const activeScoreStates = activeGroup.matches.map(getMatchScoreState);
  const liveCount = activeScoreStates.filter((state) => state.kind === 'live').length;
  const scoredCount = activeScoreStates.filter((state) => state.hasScore).length;

  return (
    <section className="screen results-screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Bảng đấu</p>
          <h2>Bảng xếp hạng bóng đá</h2>
          <LiveSyncStatus liveSync={liveSync} />
        </div>
      </div>

      <section className="football-board">
        <div className="football-board-top">
          <div>
            <p className="section-label">Bảng {activeGroup.group}</p>
            <h3>Cục diện bảng {activeGroup.group}</h3>
            <p>{activeGroup.finishedCount}/{activeGroup.matches.length} trận FT · {liveCount} live · {scoredCount} có tỉ số</p>
          </div>
          <div className="football-leaders" aria-label="Hai vị trí dẫn đầu">
            {activeGroup.rows.slice(0, 2).map((row) => (
              <span key={row.team}>
                <b>{row.rank}</b>
                {displayTeamName(row.team)}
                <strong>{row.points}đ</strong>
              </span>
            ))}
          </div>
        </div>

        <div className="group-picker" role="tablist" aria-label="Chọn bảng đấu">
          {groupTables.map((group) => (
            <button
              key={group.group}
              type="button"
              className={group.group === activeGroup.group ? 'active' : ''}
              role="tab"
              aria-selected={group.group === activeGroup.group}
              onClick={() => setSelectedGroup(group.group)}
            >
              {group.group}
            </button>
          ))}
        </div>

        <FootballStandingTable rows={activeGroup.rows} />

        <div className="fixtures-panel">
          <div className="fixtures-panel-head">
            <h4>Lịch & tỉ số bảng {activeGroup.group}</h4>
            <span>{activeGroup.matches.length} trận</span>
          </div>
          <div className="group-match-list">
            {activeGroup.matches.map((match) => (
              <FootballMatchRow key={match.matchNo} match={match} />
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}

function FootballStandingTable({ rows }) {
  return (
    <div className="football-table-wrap">
      <table className="football-table">
        <thead>
          <tr>
            <th>Đội</th>
            <th>Hiệu số</th>
            <th>Điểm</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.team} className={index < 2 ? 'qualify-row' : ''}>
              <td>
                <span className="table-team">
                  <span className="table-rank">{row.rank}</span>
                  <span className="team-dot small" aria-hidden="true">
                    {TEAM_META[row.team]?.flagUrl ? <img src={TEAM_META[row.team].flagUrl} alt="" loading="lazy" /> : TEAM_META[row.team]?.flag || row.team.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>{displayTeamName(row.team)}</strong>
                    <small>{row.played} trận · {row.won}T {row.drawn}H {row.lost}B{row.liveMatches > 0 ? ' · LIVE tạm' : ''}</small>
                  </span>
                </span>
              </td>
              <td>{formatGoalDifference(row.goalDifference)}</td>
              <td><strong>{row.points}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FootballMatchRow({ match }) {
  const scoreState = getMatchScoreState(match);
  return (
    <article className={`football-match-row ${scoreState.kind}`}>
      <FootballFixtureTeam team={match.homeTeam} side="home" />
      <span className="football-match-score">
        {scoreState.hasScore ? `${scoreState.homeScore} - ${scoreState.awayScore}` : '-'}
      </span>
      <FootballFixtureTeam team={match.awayTeam} side="away" />
      <span className="football-match-status">{scoreState.label}</span>
    </article>
  );
}

function FootballFixtureTeam({ team, side }) {
  const meta = TEAM_META[team];
  const flag = (
    <span className="team-dot fixture-flag" aria-hidden="true">
      {meta?.flagUrl ? <img src={meta.flagUrl} alt="" loading="lazy" /> : meta?.flag || team.slice(0, 2).toUpperCase()}
    </span>
  );

  return (
    <span className={`football-match-team fixture-team ${side}`}>
      {side === 'home' ? null : flag}
      <span className="fixture-team-name">{displayTeamName(team)}</span>
      {side === 'home' ? flag : null}
    </span>
  );
}

function LeaderboardScreen({
  standings,
  standingsByMode,
  currentParticipantId,
  currentStanding,
  predictedCount,
  scoreHistory = [],
  matches = [],
  onShowMyPredictions,
}) {
  const [rankMode, setRankMode] = useState('total');
  const rows = standingsByMode?.[rankMode] || standings;
  const selectedStanding = rows.find((row) => row.participantId === currentParticipantId) || currentStanding;
  const modeCopy = getLeaderboardModeCopy(rankMode, matches);
  const pendingCount = useMemo(() => scoreHistory.filter((item) => item.status === 'saved').length, [scoreHistory]);

  return (
    <section className="screen bxh-screen">
      <section className="bxh-section">
        <div className="leader-modes" role="tablist" aria-label="Chế độ bảng xếp hạng">
          {[
            ['total', 'Tổng'],
            ['week', 'Theo tuần'],
            ['stage', 'Theo vòng'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={rankMode === mode ? 'active' : ''}
              onClick={() => setRankMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="leader-mode-copy">{modeCopy}</p>

        <div className="leader-list">
          {rows.length === 0 ? (
            <p className="empty-state">Chưa có dự đoán nào. Mọi người mở app từ Mushy là chơi được ngay.</p>
          ) : rows.map((row) => (
            <article key={row.participantId} className={`lb-row ${row.participantId === currentParticipantId ? 'me' : ''}`}>
              <span className={`lb-rank ${row.rank <= 3 ? `top-${row.rank}` : ''}`}>{row.rank}</span>
              <span className="lb-avatar">{initials(row.displayName)}</span>
              <span className="lb-person">
                <strong>{row.displayName}</strong>
                <small>{leaderSubtitle(row)}</small>
              </span>
              <b>{row.total}đ</b>
            </article>
          ))}
        </div>
      </section>

      <ScoreHistoryPanel
        rank={selectedStanding?.rank}
        total={selectedStanding?.total ?? 0}
        predictedCount={predictedCount}
        pendingCount={pendingCount}
        onShowAll={onShowMyPredictions}
      />

      <section>
        <p className="section-label fun-awards-label">Giải vui dự kiến</p>
        <div className="fun-awards">
          <Award icon="🃏" title="Thánh phán bừa" body="Lên top nhờ những kèo không ai dám nghĩ tới." />
          <Award icon="🎯" title="Thủy chung" body="Dự đủ mọi trận, không bỏ lịch nào." />
          <Award icon="🚀" title="Vua nước rút" body="Bùng nổ ở nửa sau vòng bảng." />
        </div>
      </section>
    </section>
  );
}

function getLeaderboardModeCopy(mode, matches = []) {
  if (mode === 'week') {
    const { start, end } = getCurrentWeekRange();
    return `Chỉ tính các trận và câu hỏi trong tuần này (${formatDate(start)} - ${formatDate(end)}).`;
  }
  if (mode === 'stage') {
    const stage = currentTournamentStage(matches);
    return `Chỉ tính điểm ở ${stage}.`;
  }
  return 'Tổng điểm toàn giải, gồm trận đấu, câu hỏi, streak và dự đoán dài hạn đã chốt.';
}

function getCurrentWeekRange(date = new Date()) {
  const start = new Date(date);
  const day = start.getDay() || 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function currentTournamentStage(matches = []) {
  const now = Date.now();
  const started = matches
    .filter((match) => new Date(match.kickoffAt).getTime() <= now)
    .sort((a, b) => new Date(b.kickoffAt) - new Date(a.kickoffAt));
  const next = matches
    .filter((match) => new Date(match.kickoffAt).getTime() > now)
    .sort((a, b) => new Date(a.kickoffAt) - new Date(b.kickoffAt));
  const match = started[0] || next[0];
  return match ? matchStageLabel(match).toLowerCase() : 'giai đoạn hiện tại';
}

function ScoreHistoryPanel({ rank, total, predictedCount, pendingCount, onShowAll }) {
  return (
    <section className="score-history-panel" aria-label="Dự đoán của tôi">
      <div className="score-history-head">
        <div>
          <p className="section-label">Dự đoán của tôi</p>
          <h3>{total}đ</h3>
        </div>
        <div className="score-history-metrics" aria-label="Tóm tắt điểm">
          <span>{rank ? `#${rank}` : '-'}</span>
          <span>{predictedCount} đã dự</span>
          <span>{pendingCount} chờ kết quả</span>
        </div>
      </div>

      <button className="secondary-btn score-history-toggle" type="button" onClick={onShowAll}>
        Xem tất cả dự đoán
      </button>
    </section>
  );
}

function ScoreHistoryMatchLabel({ item }) {
  return (
    <strong className="score-history-match-label">
      <span className="score-history-match-no">#{item.matchNo}</span>
      <TeamFlag team={item.homeTeam} className="score-history-flag" />
      <span>{displayTeamName(item.homeTeam)}</span>
      <span className="score-history-result">
        {item.status === 'saved' ? '-' : `${item.homeScore}-${item.awayScore}`}
      </span>
      <TeamFlag team={item.awayTeam} className="score-history-flag" />
      <span>{displayTeamName(item.awayTeam)}</span>
    </strong>
  );
}

function TeamFlag({ team, className = '' }) {
  const meta = TEAM_META[team];
  return (
    <span className={className} aria-label={`Cờ ${displayTeamName(team)}`}>
      {meta?.flagUrl ? <img src={meta.flagUrl} alt="" loading="lazy" /> : meta?.flag || team.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Award({ icon, title, body }) {
  return (
    <article className="award-row">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{body}</small>
      </div>
    </article>
  );
}

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

function leaderSubtitle(row) {
  const manual = row.manualPts ? ` · ${row.manualPts > 0 ? '+' : ''}${row.manualPts} admin` : '';
  return `${row.matchPts} trận · ${row.upsetPts} cửa dưới · ${row.streakPts} streak · ${row.dailyPts} vui · ${row.longTermPts || 0} dài hạn${manual}`;
}

function findTriviaAnswerForDate(answers = [], dateKey) {
  return answers.find((answer) => isTriviaQuestionKeyForDate(answer.questionKey, dateKey)) || null;
}

function isTriviaQuestionKeyForDate(questionKey, dateKey) {
  return String(questionKey || '').startsWith(`trivia-${dateKey}-`);
}

function getScoringQuestionByKey(questionKey) {
  return ALL_SCORING_QUESTIONS.find((question) => question.key === questionKey) || null;
}

function buildScoreHistory({
  predictions = [],
  answers = [],
  matches = [],
  questions = [...DAILY_QUESTIONS, ...ALL_SCORING_QUESTIONS],
  currentStanding = null,
}) {
  const matchesByNo = new Map(matches.map((match) => [Number(match.matchNo), match]));
  const questionsByKey = new Map(questions.map((question) => [question.key, question]));

  const matchItems = predictions
    .map((prediction) => {
      const match = matchesByNo.get(Number(prediction.matchNo));
      if (!match) return null;
      if (!isFinished(match)) {
        return {
          key: `notify-saved-match-${prediction.matchNo}`,
          sortKey: prediction.updatedAt || prediction.createdAt || match.kickoffAt,
          kind: 'match',
          status: 'saved',
          type: formatDate(match.matchDay || match.kickoffAt),
          matchNo: match.matchNo,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeScore: prediction.homePred,
          awayScore: prediction.awayPred,
          label: 'Đã lưu dự đoán',
          detail: `Bạn dự ${prediction.homePred}-${prediction.awayPred}${prediction.doubleDown ? ' · kèo tủ x2' : ''}`,
          points: 0,
          match,
          prediction,
        };
      }

      const breakdown = matchScoreBreakdown(prediction, match);

      const upsetPoints = breakdown.upsetBonus * breakdown.multiplier;
      const detailParts = [
        `Dự ${prediction.homePred}-${prediction.awayPred}`,
        matchPointReason(breakdown.base),
        upsetPoints ? `+${upsetPoints}đ cửa dưới` : '',
        prediction.doubleDown ? 'kèo tủ x2' : '',
      ].filter(Boolean);

      return {
        key: `match-${prediction.matchNo}`,
        sortKey: match.kickoffAt,
        kind: 'match',
        status: breakdown.total > 0 ? 'scored' : 'zero',
        type: formatDate(match.matchDay || match.kickoffAt),
        matchNo: match.matchNo,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        detail: detailParts.join(' · '),
        points: breakdown.total,
      };
    })
    .filter(Boolean);

  const dailyItems = answers
    .map((answer) => {
      const question = questionsByKey.get(answer.questionKey);
      const points = dailyPoints(answer, question);
      if (!question || points <= 0) return null;

      return {
        key: `daily-${answer.questionKey}`,
        sortKey: question.date,
        type: 'Câu hỏi',
        label: question.prompt,
        detail: `Bạn trả lời: ${answer.answer}`,
        points,
      };
    })
    .filter(Boolean);

  const items = [...matchItems, ...dailyItems].sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));

  if ((currentStanding?.streakPts || 0) > 0) {
    items.unshift({
      key: 'streak-bonus',
      sortKey: 'streak',
      type: 'Streak',
      label: 'Chuỗi đúng tỉ số',
      detail: 'Cứ 3 trận liên tiếp đúng tỉ số được cộng thêm 5đ.',
      points: currentStanding.streakPts,
    });
  }

  if ((currentStanding?.longTermPts || 0) > 0) {
    const breakdown = currentStanding.longTermBreakdown || {};
    const hits = [
      breakdown.champion ? 'vô địch' : '',
      breakdown.topScorer ? 'vua phá lưới' : '',
      breakdown.youngPlayer ? 'cầu thủ trẻ' : '',
      breakdown.goldenBall ? 'Quả bóng vàng' : '',
    ].filter(Boolean);
    items.unshift({
      key: 'long-term-bonus',
      sortKey: 'zz-long-term',
      type: 'Dài hạn',
      label: 'Dự đoán dài hạn đã chốt',
      detail: `Đúng ${hits.join(', ')}.`,
      points: currentStanding.longTermPts,
    });
  }

  return items;
}

function buildPointNotifications({
  predictions = [],
  answers = [],
  matches = [],
  questions = [...DAILY_QUESTIONS, ...ALL_SCORING_QUESTIONS],
}) {
  const matchesByNo = new Map(matches.map((match) => [Number(match.matchNo), match]));
  const questionsByKey = new Map(questions.map((question) => [question.key, question]));

  const matchItems = predictions
    .map((prediction) => {
      const match = matchesByNo.get(Number(prediction.matchNo));
      if (!match || !isFinished(match)) return null;

      const breakdown = matchScoreBreakdown(prediction, match);
      const points = Number(breakdown.total || 0);
      const label = points > 0
        ? `${predictionRoast(breakdown.base, match, prediction)}`
        : stablePick(ROAST_COPY.lose, `notify:${match.matchNo}:${prediction.homePred}:${prediction.awayPred}`);
      const detail = `#${match.matchNo} ${displayTeamName(match.homeTeam)} ${match.homeScore}-${match.awayScore} ${displayTeamName(match.awayTeam)} · Bạn dự ${prediction.homePred}-${prediction.awayPred}`;

      return {
        key: `notify-match-${prediction.matchNo}`,
        sortKey: match.resultFetchedAt || match.kickoffAt,
        icon: points > 0 ? '📈' : '📉',
        label,
        detail: points > 0 ? `${detail} · ${matchPointSummary(breakdown.base, breakdown)}` : detail,
        points,
      };
    })
    .filter(Boolean);

  const answerItems = answers
    .map((answer) => {
      const question = questionsByKey.get(answer.questionKey);
      if (!question?.correctAnswer) return null;
      const points = dailyPoints(answer, question);

      return {
        key: `notify-daily-${answer.questionKey}`,
        sortKey: question.date,
        icon: points > 0 ? '✅' : '🧩',
        label: points > 0 ? 'Câu hỏi vui ăn điểm' : 'Câu hỏi vui chưa thương bạn',
        detail: `${question.prompt} · Bạn trả lời: ${answer.answer}`,
        points,
      };
    })
    .filter(Boolean);

  return [...matchItems, ...answerItems]
    .sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));
}

function matchPointReason(base) {
  if (base === 5) return 'đúng tỉ số';
  if (base === 3) return 'đúng hiệu số';
  if (base === 2) return 'đúng kết quả';
  return '';
}

function formatPointDelta(points) {
  const value = Number(points || 0);
  return value > 0 ? `+${value}đ` : '0đ';
}

function predictionDoneTone(base) {
  if (base == null) return 'pending';
  if (base === 5) return 'exact';
  if (base > 0) return 'good';
  return 'zero';
}

function buildMatchSocialLine({
  prediction,
  predictionCount = 0,
  homeScore,
  awayScore,
  doubleDown,
  draftIsSaved,
  locked,
  teamsKnown,
}) {
  const countLabel = `${predictionCount} người đã dự đoán`;
  if (!teamsKnown) return `${countLabel} · Chờ xác định đội`;
  if (!prediction) {
    return locked
      ? `Đã khóa dự đoán · ${countLabel}`
      : `${countLabel} · Lưu dự đoán để xem phe`;
  }

  const savedScore = `${prediction.homePred}-${prediction.awayPred}`;
  const draftScore = `${homeScore}-${awayScore}`;
  if (!draftIsSaved) {
    const doubleChanged = !!prediction.doubleDown !== !!doubleDown;
    const changeLabel = savedScore === draftScore && doubleChanged
      ? 'Đang đổi kèo tủ'
      : `Đang sửa từ ${savedScore} sang ${draftScore}`;
    return `${changeLabel} · ${countLabel}`;
  }

  return `Bạn đã lưu ${savedScore}${prediction.doubleDown ? ' · kèo tủ x2' : ''} · ${countLabel}`;
}

function predictionRoast(base, match, prediction) {
  const actualOutcome = outcome(Number(match?.homeScore), Number(match?.awayScore));
  const tone = base > 0 && actualOutcome === 0 ? 'draw' : base > 0 ? 'win' : 'lose';
  const seed = `${match?.matchNo || 'x'}:${prediction?.homePred ?? '-'}:${prediction?.awayPred ?? '-'}:${base}:${tone}`;
  return stablePick(ROAST_COPY[tone], seed);
}

function buildPredictionSplit(match, predictions = []) {
  const total = Math.max(1, predictions.length);
  const counts = predictions.reduce((acc, prediction) => {
    const key = predictedOutcomeKey(prediction);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { home: 0, draw: 0, away: 0 });

  return [
    { key: 'home', label: displayTeamName(match.homeTeam), count: counts.home },
    { key: 'draw', label: 'Hòa', count: counts.draw },
    { key: 'away', label: displayTeamName(match.awayTeam), count: counts.away },
  ].map((item) => ({
    ...item,
    percent: predictions.length ? Math.round((item.count / total) * 100) : 0,
  }));
}

function predictedOutcomeKey(prediction) {
  const home = Number(prediction?.homePred || 0);
  const away = Number(prediction?.awayPred || 0);
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

function predictionOutcomeLabel(match, prediction) {
  const key = predictedOutcomeKey(prediction);
  if (key === 'home') return `Tin ${displayTeamName(match.homeTeam)} thắng`;
  if (key === 'away') return `Tin ${displayTeamName(match.awayTeam)} thắng`;
  return 'Tin hòa';
}

function memberDisplayName(memberMap, userId) {
  const member = memberMap.get(userId);
  return member?.full_name || member?.email || `Người chơi ${String(userId || '').slice(0, 4)}`;
}

function mentionMemberLabel(member) {
  return String(member?.full_name || member?.email || '')
    .replace(/^@+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getActiveMentionToken(text, cursor) {
  const safeCursor = Math.max(0, Math.min(Number(cursor) || 0, text.length));
  const beforeCursor = text.slice(0, safeCursor);
  const start = beforeCursor.lastIndexOf('@');
  if (start < 0) return null;
  if (start > 0 && !/\s/.test(beforeCursor[start - 1])) return null;

  const query = beforeCursor.slice(start + 1);
  if (query.length > 32) return null;
  if (/[\s,!?;:()[\]{}]/.test(query)) return null;
  return { start, query };
}

function normalizeMentionSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function filterMentionMembers(members, query) {
  const needle = normalizeMentionSearch(query);
  if (!needle) return members;
  return members
    .map((member) => {
      const label = normalizeMentionSearch(member.mentionLabel);
      const score = label.startsWith(needle) ? 0 : label.includes(needle) ? 1 : 2;
      return { member, score };
    })
    .filter((item) => item.score < 2)
    .sort((a, b) => a.score - b.score || a.member.mentionLabel.localeCompare(b.member.mentionLabel, 'vi'))
    .map((item) => item.member);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderChatMessageBody(body, members) {
  const text = String(body || '');
  const labels = [...new Set(members.map((member) => member.mentionLabel).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  if (!labels.length) return text;

  const matcher = new RegExp(`@(${labels.map(escapeRegExp).join('|')})(?=$|\\s|[.,!?;:)\\]])`, 'gi');
  const parts = [];
  let lastIndex = 0;

  for (const match of text.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    parts.push(<mark key={`${index}-${match[0]}`} className="chat-mention">{match[0]}</mark>);
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length ? parts : text;
}

function findMentionedMembers(body, members, currentUserId) {
  const text = String(body || '');
  if (!text) return [];

  const labelMap = new Map();
  members.forEach((member) => {
    const label = mentionMemberLabel(member);
    if (!label || member.user_id === currentUserId) return;
    const key = normalizeMentionSearch(label);
    const rows = labelMap.get(key) || [];
    rows.push({ ...member, mentionLabel: label });
    labelMap.set(key, rows);
  });

  const labels = [...labelMap.keys()].sort((a, b) => b.length - a.length);
  if (!labels.length) return [];

  const mentioned = new Map();
  const matcher = new RegExp(`@(${labels.map(escapeRegExp).join('|')})(?=$|\\s|[.,!?;:)\\]])`, 'gi');
  for (const match of text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().matchAll(matcher)) {
    const key = normalizeMentionSearch(match[1]);
    (labelMap.get(key) || []).forEach((member) => mentioned.set(member.user_id, member));
  }
  return [...mentioned.values()];
}

function notifyMentionedRoomMembers({ body, members, currentUserId, senderName, match }) {
  const mentionedMembers = findMentionedMembers(body, members, currentUserId);
  if (!mentionedMembers.length) return;

  const userIds = mentionedMembers.map((member) => member.user_id);
  const title = `${senderName || 'Có người'} nhắc bạn trong phòng dự đoán`;
  const shortBody = `${displayTeamName(match.homeTeam)} vs ${displayTeamName(match.awayTeam)}: ${truncateText(body, 90)}`;
  void mushyApi.push({
    title,
    body: shortBody,
    userIds,
    data: {
      appSlug: 'nha-tien-tri',
      kind: 'chat_mention',
      screen: 'match',
      recordId: `room:${match.matchNo}`,
      target: 'room',
      matchNo: String(match.matchNo),
    },
  }).catch((err) => {
    console.warn('[room-chat] mention push failed', err);
  });
}

function truncateText(value, maxLength) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function buildRoomPredictionItems({ match, predictions = [], memberMap = new Map() }) {
  return predictions.map((prediction) => {
    const name = memberDisplayName(memberMap, prediction.createdBy);
    const dateVal = prediction.updatedAt || prediction.createdAt || new Date();
    return {
      id: `prediction-${prediction.createdBy}-${prediction.matchNo}`,
      type: 'prediction',
      userId: prediction.createdBy,
      name,
      initials: initialsFromName(name),
      label: 'Dự đoán',
      body: `${prediction.homePred}-${prediction.awayPred}`,
      createdAt: dateVal,
      sortAt: dateVal,
    };
  })
    .sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime())
    .map((item) => ({
      ...item,
      body: String(item.body || predictionOutcomeLabel(match, item)).slice(0, 42),
    }));
}

function initialsFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (!parts.length) return '?';
  const letters = parts.length === 1
    ? parts[0].slice(0, 2)
    : `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`;
  return letters.toUpperCase();
}

function createMockRoomMessages({ match, members = [], ctx, workspaceId }) {
  const now = Date.now();
  const fallbackMembers = [
    { user_id: ctx?.userId, full_name: 'Bạn' },
    { user_id: 'mock-lan', full_name: 'Lan Exact' },
    { user_id: 'mock-minh', full_name: 'Minh Chill' },
    { user_id: 'mock-bao', full_name: 'Bao Upset' },
  ];
  const uniqueMembers = [];
  const seen = new Set();
  for (const member of [...members, ...fallbackMembers]) {
    const userId = member?.user_id;
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    uniqueMembers.push(member);
    if (uniqueMembers.length >= 4) break;
  }

  const sampleBodies = [
    'Tỉ số này thơm quá.',
    'Phe này đang đông dần rồi.',
    'Chờ VAR chốt số phận.',
    'Ai ngược cửa vào đây nói chuyện.',
  ];

  return uniqueMembers.map((member, index) => ({
    id: `mock-room-${match.matchNo}-${member.user_id}`,
    workspaceId,
    createdBy: member.user_id,
    matchNo: match.matchNo,
    kind: 'chat',
    body: sampleBodies[index] || 'Có mặt trong phòng.',
    emoji: null,
    createdAt: new Date(now - (uniqueMembers.length - index) * 45000).toISOString(),
  }));
}

function formatRoomTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function buildRoastMap(matches = [], predictionMap = new Map()) {
  const map = new Map();
  const recentByTone = new Map();
  const orderedMatches = [...matches].sort((a, b) => Number(a.matchNo) - Number(b.matchNo));

  for (const match of orderedMatches) {
    const prediction = predictionMap.get(Number(match.matchNo));
    if (!prediction || !isFinished(match)) continue;

    const base = matchBasePoints(prediction, match);
    const actualOutcome = outcome(Number(match.homeScore), Number(match.awayScore));
    const tone = base > 0 && actualOutcome === 0 ? 'draw' : base > 0 ? 'win' : 'lose';
    const items = ROAST_COPY[tone] || [];
    const seed = `${match.matchNo}:${prediction.homePred}:${prediction.awayPred}:${base}:${tone}`;
    const recent = recentByTone.get(tone) || [];
    const text = stablePickAvoiding(items, seed, recent);

    map.set(Number(match.matchNo), text);
    recentByTone.set(tone, [text, ...recent].slice(0, 3));
  }

  return map;
}

function matchPointSummary(base, breakdown) {
  const basePoints = Number(base || 0);
  if (!breakdown || basePoints <= 0) return '+0đ · Sai thì nhận, nhưng vẫn còn trận sau để phục thù.';

  const parts = [`+${basePoints}đ ${matchPointReason(basePoints)}`];
  if (breakdown.upsetBonus) parts.push(`+${breakdown.upsetBonus}đ cửa dưới`);
  if (!breakdown.upsetBonus && breakdown.multiplier <= 1) return parts[0];
  if (breakdown.multiplier > 1) parts.push(`x${breakdown.multiplier} kèo tủ`);
  return `${parts.join(' · ')} = +${breakdown.total}đ`;
}

function stablePick(items, seed) {
  if (!items?.length) return '';
  let hash = 0;
  for (let index = 0; index < String(seed).length; index += 1) {
    hash = (hash * 31 + String(seed).charCodeAt(index)) | 0;
  }
  return items[Math.abs(hash) % items.length];
}

function stablePickAvoiding(items, seed, recent = []) {
  if (!items?.length) return '';
  const avoid = new Set(recent);
  const first = stablePick(items, seed);
  if (!avoid.has(first) || avoid.size >= items.length) return first;

  const startIndex = items.indexOf(first);
  for (let offset = 1; offset < items.length; offset += 1) {
    const candidate = items[(startIndex + offset) % items.length];
    if (!avoid.has(candidate)) return candidate;
  }

  return first;
}

function RulesScreen() {
  const rules = [
    {
      icon: Target,
      title: 'Điểm từng trận',
      body: 'Đúng tỉ số 5đ. Đúng đội thắng/hòa và đúng hiệu số 3đ. Chỉ đúng kết quả thắng/hòa/thua 2đ. Sai 0đ.',
    },
    {
      icon: Scale,
      title: 'Bonus cửa dưới',
      body: `Nếu đoán đúng kết quả đội yếu hơn theo BXH FIFA tạo bất ngờ: chênh ${20}+ bậc được +1đ, ${40}+ bậc được +2đ. Hòa trước đội mạnh hơn ${30}+ bậc được +1đ.`,
    },
    {
      icon: Star,
      title: 'Kèo tủ trước trận',
      body: 'Mỗi người có 1 kèo tủ x2 mỗi ngày. Kèo tủ chỉ mở trong 1 ngày trước khi trận đấu diễn ra và tự khóa trước giờ bóng lăn 15 phút.',
    },
    {
      icon: Flame,
      title: 'Streak',
      body: 'Streak là điểm thưởng theo chuỗi trận: cứ 3 trận liên tiếp đoán đúng tỉ số chính xác thì cộng thêm 5đ. Điểm này chạy theo từng trận, không phải kết quả dự đoán trước giải.',
    },
    {
      icon: Trophy,
      title: 'BXH dài hạn',
      body: 'Dài hạn là nhóm kèo chọn trước vòng play-off như đội vô địch, vua phá lưới, cầu thủ trẻ xuất sắc nhất và Quả bóng vàng World Cup. Điểm chỉ được cộng khi BTC nhập kết quả chính thức, khác với streak là bonus phát sinh từ từng trận.',
    },
    {
      icon: BookOpen,
      title: 'Câu hỏi vui',
      body: 'Mỗi câu hỏi ngày thường có 2đ. Đây là phần kéo cả người không mê bóng đá vào chơi.',
    },
    {
      icon: ClipboardCheck,
      title: 'Chốt sổ',
      body: 'Dự đoán phải lưu trước giờ bóng lăn 15 phút. Trễ trận nào thì trận đó 0đ, không phạt thêm.',
    },
    {
      icon: Trophy,
      title: 'Trao thưởng',
      body: 'Top 1, Top 2 và Top 3 sau 72 trận vòng bảng nhận thưởng theo kế hoạch của BTC.',
    },
  ];

  return (
    <section className="screen rules">
      <p className="eyebrow">Luật chơi v1</p>
      <h2>Chơi nhẹ, thắng vui, có cớ ăn mừng.</h2>
      <div className="rules-grid">
        {rules.map((rule) => <Rule key={rule.title} {...rule} />)}
      </div>
    </section>
  );
}

function Rule({ icon: Icon, title, body }) {
  return (
    <article className="rule-card">
      <h3>
        <span className="rule-icon" aria-hidden="true">
          <Icon size={18} strokeWidth={2.6} />
        </span>
        {title}
      </h3>
      <p>{body}</p>
    </article>
  );
}

function TeamRow({ team }) {
  const meta = TEAM_META[team];
  return (
    <div className="team-row">
      <span className="team-dot" aria-label={`Cờ ${team}`}>
        {meta?.flagUrl ? <img src={meta.flagUrl} alt="" loading="lazy" /> : meta?.flag || team.slice(0, 2).toUpperCase()}
      </span>
      <span className="team-copy">
        <strong>{displayTeamName(team)}</strong>
        {meta ? <small>FIFA #{meta.fifaRank} · {meta.fifaCode}</small> : null}
      </span>
    </div>
  );
}

async function fetchLiveScores(token, workspaceId, { useMock = false } = {}) {
  if (useMock) return normalizeLiveScorePayload(buildMockLiveScorePayload());

  const response = await fetch('/api/live-scores', {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Workspace-Id': workspaceId,
    },
  });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const detail = contentType.includes('application/json') ? await response.json().catch(() => null) : null;
    throw new Error(detail?.error || 'Không tải được live score.');
  }
  if (!contentType.includes('application/json')) {
    throw new Error('Endpoint live score chưa sẵn sàng trong môi trường dev này.');
  }

  const payload = await response.json();
  return normalizeLiveScorePayload(payload);
}

function normalizeLiveScorePayload(payload) {
  return {
    ...payload,
    matches: (payload.matches || []).map((match) => ({
      ...match,
      source: match.source || payload.source,
      fetchedAt: match.fetchedAt || payload.fetchedAt,
    })),
  };
}

function getLiveScoreSyncPlan(matches = [], nowMs = Date.now()) {
  const scheduledMatches = matches
    .map((match) => {
      const kickoffMs = new Date(match.kickoffAt).getTime();
      if (!Number.isFinite(kickoffMs)) return null;
      return {
        matchAt: match.kickoffAt,
        kickoffMs,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.kickoffMs - b.kickoffMs);
  const nextMatch = scheduledMatches.find((item) => nowMs <= item.kickoffMs) || scheduledMatches[scheduledMatches.length - 1] || null;
  const activeMatch = scheduledMatches.find((item) => nowMs >= item.kickoffMs && nowMs <= item.kickoffMs + LIVE_MATCH_FALLBACK_MS);
  const nextMatchSoon = nextMatch?.kickoffMs && nextMatch.kickoffMs - nowMs <= PREDICTION_LOCK_BEFORE_MS;
  const waitMs = activeMatch || nextMatchSoon ? LIVE_SCORE_ACTIVE_POLL_MS : LIVE_SCORE_POLL_MS;

  return {
    shouldFetch: true,
    waitMs,
    nextMatchAt: nextMatch?.matchAt || '',
    nextFetchAt: new Date(nowMs + waitMs).toISOString(),
  };
}

function buildStandings({
  members,
  predictions,
  answers,
  matches,
  questions = [...DAILY_QUESTIONS, ...ALL_SCORING_QUESTIONS],
  longTermBets = [],
  appConfig = null,
  manualAdjustments = [],
}) {
  const memberMap = new Map(members.map((member) => [member.user_id, member]));
  const userIds = new Set([
    ...members.map((member) => member.user_id),
    ...predictions.map((prediction) => prediction.createdBy),
    ...answers.map((answer) => answer.createdBy),
    ...longTermBets.map((bet) => bet.createdBy),
    ...manualAdjustments.map((adjustment) => adjustment.targetUserId),
  ]);

  const participants = [...userIds].map((userId) => ({
    id: userId,
    displayName: memberMap.get(userId)?.full_name || `Người chơi ${String(userId).slice(0, 4)}`,
  }));

  return computeStandingsForUsers({
    participants,
    predictions: predictions.map((prediction) => ({ ...prediction, participantId: prediction.createdBy })),
    dailyAnswers: answers.map((answer) => ({ ...answer, participantId: answer.createdBy })),
    matches,
    questions,
    longTermBets: longTermBets.map((bet) => ({ ...bet, participantId: bet.createdBy })),
    appConfig,
    manualAdjustments: manualAdjustments.map((adjustment) => ({ ...adjustment, participantId: adjustment.targetUserId })),
  });
}

function computeStandingsForUsers({
  participants,
  predictions,
  dailyAnswers,
  matches,
  questions = [...DAILY_QUESTIONS, ...ALL_SCORING_QUESTIONS],
  longTermBets = [],
  appConfig = null,
  manualAdjustments = [],
}) {
  return computeStandings({
    participants,
    predictions,
    dailyAnswers,
    matches,
    questions,
    longTermBets,
    appConfig,
    manualAdjustments,
  });
}

function mergeTournamentMatches(staticMatches, persistedMatches) {
  const persistedByNo = new Map((persistedMatches || []).map((match) => [Number(match.matchNo), match]));
  return staticMatches.map((match) => {
    const persisted = persistedByNo.get(Number(match.matchNo));
    if (!persisted) return match;
    return {
      ...match,
      ...persisted,
      group: persisted.group || match.group,
      stageLabel: match.stageLabel,
      matchDay: dateKeyInAppTimeZone(persisted.kickoffAt || match.kickoffAt),
    };
  });
}

function applyDailyQuestionAnswers(questions, answers = {}) {
  if (!answers || typeof answers !== 'object') return questions;
  return questions.map((question) => {
    const answer = answers[question.key];
    return answer ? { ...question, correctAnswer: answer } : question;
  });
}

function ensureCurrentMember(memberRows, ctx) {
  if (!ctx?.userId || memberRows.some((member) => member.user_id === ctx.userId)) return memberRows;
  return [
    ...memberRows,
    {
      user_id: ctx.userId,
      full_name: 'Bạn',
      role: ctx.role,
    },
  ];
}

function normalizeChatRepeatKey(body) {
  return String(body || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function mergeRoomRealtimePayload(rows, payload) {
  const eventType = String(payload?.eventType || '').toUpperCase();
  const nextRow = payload?.new ? mapRoomMessage(payload.new) : null;
  const oldRow = payload?.old ? mapRoomMessage(payload.old) : null;
  const targetId = nextRow?.id || oldRow?.id;
  if (!targetId) return rows;

  if (eventType === 'DELETE') {
    return rows.filter((row) => row.id !== targetId);
  }

  if (!nextRow) return rows;
  const withoutLocalEcho = rows.filter((row) => {
    const sameUser = row.createdBy === nextRow.createdBy;
    const sameBody = normalizeChatRepeatKey(row.body) === normalizeChatRepeatKey(nextRow.body);
    const sameKind = row.kind === nextRow.kind;
    const sameMatch = Number(row.matchNo) === Number(nextRow.matchNo);
    return !(row.optimistic && sameUser && sameBody && sameKind && sameMatch);
  });
  const found = withoutLocalEcho.some((row) => row.id === targetId);
  const merged = found
    ? withoutLocalEcho.map((row) => (row.id === targetId ? nextRow : row))
    : [...withoutLocalEcho, nextRow];
  return merged.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function roomRealtimeLabel(state) {
  if (state === 'live') return 'Realtime vừa cập nhật';
  if (state === 'listening') return 'Realtime đang nghe';
  if (state === 'mock-live') return 'Realtime mock';
  return 'Polling dự phòng';
}

function upsertLocalPrediction(rows, draft) {
  const next = {
    id: `${draft.createdBy}-${draft.matchNo}-local`,
    workspaceId: draft.workspaceId,
    createdBy: draft.createdBy,
    matchNo: draft.matchNo,
    matchDay: draft.matchDay,
    homePred: draft.homePred,
    awayPred: draft.awayPred,
    doubleDown: draft.doubleDown,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return [
    ...rows.filter((row) => !(row.createdBy === draft.createdBy && Number(row.matchNo) === Number(draft.matchNo))),
    next,
  ].sort((a, b) => Number(a.matchNo) - Number(b.matchNo));
}

function upsertLocalAnswer(rows, draft) {
  const next = {
    id: `${draft.createdBy}-${draft.questionKey}-local`,
    workspaceId: draft.workspaceId,
    createdBy: draft.createdBy,
    questionKey: draft.questionKey,
    answer: draft.answer,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return [
    ...rows.filter((row) => !(row.createdBy === draft.createdBy && row.questionKey === draft.questionKey)),
    next,
  ];
}

function applyAutomaticScores(matches, liveScores) {
  const liveByPair = buildLiveScorePairMap(liveScores);
  return matches.map((match) => {
    const liveScore = findLiveScoreForMatch(match, liveByPair);
    if (!liveScore || liveScore.status !== 'finished') return match;
    return {
      ...match,
      status: 'finished',
      homeScore: normalizeLiveScoreValue(liveScore.homeScore),
      awayScore: normalizeLiveScoreValue(liveScore.awayScore),
      resultSource: liveScore.source || 'api',
      resultFetchedAt: liveScore.fetchedAt || '',
      finishType: liveScore.finishType || null,
      statusDetail: liveScore.statusDetail || '',
      rawClock: liveScore.rawClock || '',
      period: liveScore.period || null,
      goals: liveScore.goals || liveScore.goalScorers || [],
      goalScorers: liveScore.goalScorers || liveScore.goals || [],
      homeScorers: liveScore.homeScorers || liveScore.homeGoalScorers || [],
      awayScorers: liveScore.awayScorers || liveScore.awayGoalScorers || [],
      homeGoalScorers: liveScore.homeGoalScorers || liveScore.homeScorers || [],
      awayGoalScorers: liveScore.awayGoalScorers || liveScore.awayScorers || [],
    };
  });
}

function applyLiveScores(matches, liveScores, nowMs = Date.now()) {
  const liveByPair = buildLiveScorePairMap(liveScores);
  return matches.map((match) => {
    if (isFinished(match)) return { ...match, liveScore: null };
    const liveScore = findLiveScoreForMatch(match, liveByPair) || clockBasedLiveScore(match, nowMs);
    return { ...match, liveScore };
  });
}

function clockBasedLiveScore(match, nowMs = Date.now()) {
  if (!match?.kickoffAt || hasUnknownTeam(match)) return null;
  const kickoffMs = new Date(match.kickoffAt).getTime();
  if (!Number.isFinite(kickoffMs)) return null;
  if (nowMs < kickoffMs || nowMs > kickoffMs + LIVE_MATCH_FALLBACK_MS) return null;
  return {
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeScore: null,
    awayScore: null,
    status: 'in_progress',
    rawClock: '',
    clockFallback: true,
  };
}

function buildLiveScorePairMap(liveScores) {
  const liveByPair = new Map();
  for (const liveScore of liveScores || []) {
    if (!isUsefulLiveScore(liveScore)) continue;
    liveByPair.set(matchPairKey(liveScore.homeTeam, liveScore.awayTeam), liveScore);
  }
  return liveByPair;
}

function findLiveScoreForMatch(match, liveByPair) {
  const direct = liveByPair.get(matchPairKey(match.homeTeam, match.awayTeam));
  if (direct) return direct;

  const reverse = liveByPair.get(matchPairKey(match.awayTeam, match.homeTeam));
  if (!reverse) return null;
  return {
    ...reverse,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeScore: reverse.awayScore,
    awayScore: reverse.homeScore,
    reversed: true,
  };
}

function buildFootballGroupTables(matches) {
  return Object.entries(GROUPS).map(([group, teams]) => {
    const rowsByTeam = new Map(teams.map((team) => [team, createFootballRow(team)]));
    const groupMatches = matches
      .filter((match) => match.group === group)
      .slice()
      .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());

    for (const match of groupMatches) {
      const scoreState = getMatchScoreState(match);
      if (!scoreState.countsInTable) continue;

      const home = rowsByTeam.get(match.homeTeam);
      const away = rowsByTeam.get(match.awayTeam);
      if (!home || !away) continue;

      applyFootballResult(home, away, scoreState.homeScore, scoreState.awayScore, scoreState.kind === 'live');
    }

    const rows = [...rowsByTeam.values()]
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return displayTeamName(a.team).localeCompare(displayTeamName(b.team), 'vi');
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));

    return {
      group,
      rows,
      matches: groupMatches,
      finishedCount: groupMatches.filter(isFinished).length,
    };
  });
}

function createFootballRow(team) {
  return {
    team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    liveMatches: 0,
  };
}

function applyFootballResult(home, away, homeScore, awayScore, isLive) {
  home.played += 1;
  away.played += 1;
  home.goalsFor += homeScore;
  home.goalsAgainst += awayScore;
  away.goalsFor += awayScore;
  away.goalsAgainst += homeScore;
  home.goalDifference = home.goalsFor - home.goalsAgainst;
  away.goalDifference = away.goalsFor - away.goalsAgainst;
  if (isLive) {
    home.liveMatches += 1;
    away.liveMatches += 1;
  }

  const result = outcome(homeScore, awayScore);
  if (result === 1) {
    home.won += 1;
    away.lost += 1;
    home.points += 3;
  } else if (result === -1) {
    away.won += 1;
    home.lost += 1;
    away.points += 3;
  } else {
    home.drawn += 1;
    away.drawn += 1;
    home.points += 1;
    away.points += 1;
  }
}

function getMatchScoreState(match) {
  if (isFinished(match)) {
    return {
      kind: 'final',
      hasScore: true,
      countsInTable: true,
      homeScore: normalizeLiveScoreValue(match.homeScore),
      awayScore: normalizeLiveScoreValue(match.awayScore),
      label: finalStatusLabel(match),
    };
  }

  const liveScore = shouldShowLiveScore(match) ? match.liveScore : null;
  if (liveScore) {
    if (liveScore.clockFallback) {
      return {
        kind: 'live',
        hasScore: false,
        countsInTable: false,
        homeScore: null,
        awayScore: null,
        label: liveLabel(liveScore),
      };
    }
    const kind = liveScore.status === 'finished' ? 'final' : 'live';
    return {
      kind,
      hasScore: true,
      countsInTable: kind === 'final' || kind === 'live',
      homeScore: normalizeLiveScoreValue(liveScore.homeScore),
      awayScore: normalizeLiveScoreValue(liveScore.awayScore),
      label: liveLabel(liveScore),
    };
  }

  return {
    kind: 'scheduled',
    hasScore: false,
    countsInTable: false,
    homeScore: null,
    awayScore: null,
    label: formatTime(match.kickoffAt),
  };
}

function normalizeLiveScoreValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function isUsefulLiveScore(liveScore) {
  if (!liveScore) return false;
  const homeScore = Number(liveScore.homeScore || 0);
  const awayScore = Number(liveScore.awayScore || 0);
  return liveScore.status !== 'scheduled' || homeScore > 0 || awayScore > 0;
}

function shouldShowLiveScore(match) {
  return !!match?.liveScore && !isFinished(match) && isUsefulLiveScore(match.liveScore);
}

function matchPairKey(homeTeam, awayTeam) {
  return `${canonicalTeamName(homeTeam)}::${canonicalTeamName(awayTeam)}`;
}

function canonicalTeamName(team) {
  return String(team || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function normalizeScore(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 99) {
    throw new Error('Tỉ số phải là số từ 0 đến 99.');
  }
  return number;
}

function cleanPlayerAnswer(value) {
  return cleanPlayerDisplayValue(value).slice(0, 120);
}

function cleanPlayerDisplayValue(value) {
  return String(value || '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function getFeaturedPlayerRank(player) {
  const keys = [
    player?.name,
    player?.label,
    String(player?.searchText || '').replace(/\bJr\b\.?/gi, 'Junior'),
  ];
  for (const key of keys) {
    const rank = FEATURED_PLAYER_ORDER.get(normalizeAnswer(key));
    if (Number.isFinite(rank)) return rank;
  }
  return null;
}

function normalizeDraftScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(99, Math.trunc(number)));
}

function groupByDate(matches) {
  const map = new Map();
  for (const match of matches) {
    const bucket = map.get(match.matchDay) || [];
    bucket.push(match);
    map.set(match.matchDay, bucket);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function pickDefaultMatchDay(dayPages, todayKey = getLocalDateKey()) {
  if (!dayPages.length) return '';
  const todayPage = dayPages.find((page) => page.date === todayKey);
  if (todayPage) return todayPage.date;
  const futurePendingPage = dayPages.find((page) => page.date > todayKey && page.pendingCount > 0);
  if (futurePendingPage) return futurePendingPage.date;
  const futurePage = dayPages.find((page) => page.date > todayKey);
  if (futurePage) return futurePage.date;
  return dayPages[dayPages.length - 1]?.date || '';
}

function formatDate(value) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: APP_TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
}

function getDayChipLabel(dateKey, index, todayKey = getLocalDateKey()) {
  if (dateKey === todayKey) return 'Hôm nay';
  if (dateKey === addDaysToDateKey(todayKey, 1)) return 'Ngày mai';
  if (dateKey === addDaysToDateKey(todayKey, -1)) return 'Hôm qua';
  return `Ngày ${index + 1}`;
}

function getDayPageStatusText(page, todayKey = getLocalDateKey()) {
  if (!page) return '';
  if (page.pendingCount > 0) return `${page.pendingCount} trận chưa dự`;
  if (page.openCount > 0) return 'Đã đủ dự đoán';
  if (page.date < todayKey) return 'Đã qua hoặc đã khóa';
  return 'Chưa mở dự đoán';
}

function difficultyLabel(value) {
  if (value === 'hard') return 'Khó · 3đ';
  if (value === 'medium') return 'Vừa · 2đ';
  return 'Dễ · 1đ';
}

function formatTime(value) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDateTime(value) {
  return formatTime(value);
}

function timeUntilMs(value) {
  return new Date(value).getTime() - Date.now();
}

function formatTimeUntil(value) {
  const diffMs = Math.max(0, timeUntilMs(value));
  const totalMinutes = Math.max(1, Math.ceil(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes} phút`;
  if (minutes === 0) return `${hours} giờ`;
  return `${hours} giờ ${minutes} phút`;
}

function formatRelativeSyncTime(value) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatGoalDifference(value) {
  const number = Number(value || 0);
  if (number > 0) return `+${number}`;
  return String(number);
}

function getLocalDateKey(date = new Date()) {
  return dateKeyInAppTimeZone(date);
}

function dateKeyInAppTimeZone(value = new Date()) {
  return dateKeyInVietnamTimeZone(value);
}

function addDaysToDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function getLongTermLockAt(matches = [], appConfig = null) {
  const configured = appConfig?.longTermLockAt || appConfig?.playoffKickoffAt;
  if (configured) return configured;
  const playoffMatch = [...matches]
    .filter((match) => match?.kickoffAt && match.stage !== 'group')
    .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime())[0];
  const fallbackAfterGroups = [...matches]
    .filter((match) => match?.kickoffAt && Number(match.matchNo) > 72)
    .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime())[0];
  return playoffMatch?.kickoffAt || fallbackAfterGroups?.kickoffAt || matches[0]?.kickoffAt || '';
}

function getPredictionLockAt(match) {
  const kickoffMs = new Date(match?.kickoffAt).getTime();
  if (!Number.isFinite(kickoffMs)) return new Date(0);
  return new Date(kickoffMs - PREDICTION_LOCK_BEFORE_MS);
}

function isPredictionLocked(match, nowMs = Date.now()) {
  return nowMs >= getPredictionLockAt(match).getTime();
}

function hasKickoffStarted(match, nowMs = Date.now()) {
  const kickoffMs = new Date(match?.kickoffAt).getTime();
  return Number.isFinite(kickoffMs) && nowMs >= kickoffMs;
}

function isDoubleDownWindowOpen(match, nowMs = Date.now()) {
  const kickoffMs = new Date(match?.kickoffAt).getTime();
  if (!Number.isFinite(kickoffMs)) return false;
  return nowMs >= kickoffMs - DOUBLE_DOWN_OPEN_BEFORE_MS
    && nowMs < kickoffMs - PREDICTION_LOCK_BEFORE_MS;
}

function isMushyAdmin(ctx) {
  return ctx?.role === 'owner' || ctx?.role === 'admin';
}

function shortTeam(team) {
  const name = displayTeamName(team);
  return name.length > 12 ? `${name.slice(0, 12)}...` : name;
}

function displayTeamName(team) {
  return TEAM_META[team]?.viName || team;
}

function compactTeamName(team) {
  const fullName = displayTeamName(team);
  const overrides = {
    'Bosnia and Herzegovina': 'Bosna & H.',
    'Korea Republic': 'Hàn Quốc',
    'South Africa': 'Nam Phi',
    'United States': 'Hoa Kỳ',
    'Saudi Arabia': 'Saudi Arabia',
    'Côte d’Ivoire': 'Bờ Biển Ngà',
    'Cote d’Ivoire': 'Bờ Biển Ngà',
    'United Arab Emirates': 'UAE',
  };
  return overrides[team] || overrides[fullName] || (fullName.length > 14 ? `${fullName.slice(0, 12)}...` : fullName);
}

function matchStageLabel(match) {
  if (match?.stage === 'group') return `Vòng bảng · ${match.group}`;
  return match?.stageLabel || KNOCKOUT_FILTERS.find((round) => round.id === match?.stage)?.label || 'Knock-out';
}

function hasUnknownTeam(match) {
  return match?.homeTeam === 'Unknown' || match?.awayTeam === 'Unknown';
}

function isLiveInProgress(liveScore) {
  return ['in_progress', 'extra_time', 'penalties'].includes(liveScore?.status);
}

function finalStatusLabel(match) {
  if (match?.finishType === 'penalties') return 'PEN';
  if (match?.finishType === 'aet') return 'AET';
  return 'FT';
}

function liveLabel(liveScore) {
  if (!liveScore) return 'LIVE';
  if (liveScore.status === 'finished') return finalStatusLabel(liveScore);
  if (liveScore.status === 'extra_time') return liveScore.rawClock ? `ET ${liveScore.rawClock}` : 'ET';
  if (liveScore.status === 'penalties') return liveScore.rawClock ? `PEN ${liveScore.rawClock}` : 'PEN';
  if (liveScore.clockFallback) return 'Đang diễn ra';
  if (liveScore.status === 'in_progress') return liveScore.rawClock ? `LIVE ${liveScore.rawClock}` : 'LIVE';
  return 'LIVE';
}

function sourceLabel(source) {
  if (source === 'local-mock') return 'DEV mock';
  if (source === 'worldcup26.ir') return 'WorldCup26';
  if (source === 'worldcup26.ir+espn') return 'WorldCup26 + ESPN';
  if (source === 'espn') return 'ESPN';
  return source || 'live';
}

function toMatchInsightState(payload) {
  return {
    loading: false,
    error: '',
    summary: payload?.summary || '',
    model: payload?.model || '',
    cached: payload?.cached === true,
  };
}

function mockMatchInsightSummary(match) {
  const home = displayTeamName(match?.homeTeam);
  const away = displayTeamName(match?.awayTeam);
  const homeRank = TEAM_META[match?.homeTeam]?.fifaRank;
  const awayRank = TEAM_META[match?.awayTeam]?.fifaRank;
  const rankLine = homeRank && awayRank
    ? `FIFA #${homeRank} vs #${awayRank}`
    : 'DEV mock';
  const favorite = homeRank && awayRank
    ? homeRank <= awayRank ? home : away
    : home;

  return `${home} gặp ${away} (${rankLine}). Mock AI nghiêng nhẹ về ${favorite}, nhưng kèo này vẫn đáng xem vì chỉ số phong độ trong dev có thể đảo chiều bất cứ lúc nào.`;
}

function getCurrentDeepLinkParams() {
  if (typeof window === 'undefined') return new URLSearchParams();

  const params = new URLSearchParams(window.location.search);
  const hash = String(window.location.hash || '').replace(/^#\??/, '');
  if (hash.includes('=')) {
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }
  return params;
}

function parseDeepLinkParams(params) {
  const recordId = params.get('recordId') || params.get('record_id') || params.get('id') || '';
  const targetFromRecord = /^room[:_-]?\d+$/i.test(recordId) ? 'room' : '';
  return {
    signature: params.toString(),
    screen: params.get('screen') || '',
    kind: params.get('kind') || '',
    target: params.get('target') || params.get('view') || params.get('open') || targetFromRecord,
    matchNo: parseDeepLinkMatchNo(params, recordId),
  };
}

function parseDeepLinkMatchNo(params, recordId = '') {
  const candidates = [
    params.get('matchNo'),
    params.get('match_no'),
    params.get('match'),
    recordId,
    params.get('record_id'),
    params.get('id'),
  ];

  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    const match = text.match(/^(?:room|match)?[:_-]?(\d+)$/i);
    if (match) return Number(match[1]);
  }
  return 0;
}

function isLocalSimulationEnabled() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const value = params.get('mock');
  return value !== '0' && value !== 'false';
}

function isForcedLocalMockEnabled() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('mock') === 'force';
}

function isAuthError(error) {
  const status = Number(error?.status || error?.code);
  const message = String(error?.message || '').toLowerCase();
  return status === 401 || message.includes('jwt') || message.includes('unauthorized');
}

function roomStorageErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (isAuthError(error)) return 'Token local đã hết hạn. Chạy npm run dev:token để chat lưu thật vào Supabase.';
  if (message.includes('match_room_messages') || message.includes('relation') || message.includes('does not exist')) {
    return 'Chưa có bảng chat. Hãy submit migration 005_match_room_messages.sql qua Admin Portal.';
  }
  return error?.message || 'Không kết nối được phòng dự đoán.';
}

function PredictionEditModal({ match, prediction, dailyDoubleMatchNo, onClose, onSave }) {
  const [homePred, setHomePred] = useState(prediction?.homePred ?? 0);
  const [awayPred, setAwayPred] = useState(prediction?.awayPred ?? 0);
  const [doubleDown, setDoubleDown] = useState(prediction?.doubleDown ?? false);
  const [saving, setSaving] = useState(false);

  const locked = isPredictionLocked(match);
  const teamsKnown = !hasUnknownTeam(match);
  const doubleDownReserved = !!dailyDoubleMatchNo && dailyDoubleMatchNo !== Number(match.matchNo);
  const doubleDownWindowOpen = isDoubleDownWindowOpen(match);
  const canUseDoubleDown = teamsKnown && !locked && doubleDownWindowOpen && !doubleDownReserved;

  const homeScore = normalizeDraftScore(homePred);
  const awayScore = normalizeDraftScore(awayPred);

  const doubleHintText = !teamsKnown
    ? 'Chờ xác định đội.'
    : locked
      ? 'Đã khóa trước giờ bóng lăn 15 phút.'
      : doubleDownReserved
        ? `Kèo tủ x2 đã dùng ở trận #${dailyDoubleMatchNo}.`
        : doubleDownWindowOpen
          ? 'Mỗi ngày chỉ 1 kèo tủ.'
          : 'Kèo tủ chỉ mở trong 1 ngày trước khi trận đấu diễn ra.';

  function bumpScore(side, delta) {
    if (locked) return;
    const setter = side === 'home' ? setHomePred : setAwayPred;
    const current = side === 'home' ? homeScore : awayScore;
    setter(Math.max(0, Math.min(99, current + delta)));
  }

  async function handleSaveClick() {
    if (locked || saving) return;
    setSaving(true);
    try {
      const ok = await onSave(match, { homePred: homeScore, awayPred: awayScore, doubleDown });
      if (ok) {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-scrim dialog-scrim" onClick={onClose}>
      <div className="modal-card prediction-edit-card" onClick={(e) => e.stopPropagation()}>
        <div className="prediction-edit-header">
          <h3>Sửa dự đoán</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="prediction-edit-match-info">
          <span>#{match.matchNo} · {matchStageLabel(match)}</span>
          <strong>{formatTime(match.kickoffAt)}</strong>
        </div>

        <PredictionScoreEditor
          match={match}
          homeScore={homeScore}
          awayScore={awayScore}
          locked={locked}
          onBumpScore={bumpScore}
          className="edit-fixture"
        />

        <div className="prediction-edit-options">
          <button
            type="button"
            className={`double-btn star-btn ${doubleDown ? 'active' : ''}`}
            disabled={!canUseDoubleDown}
            aria-label={doubleDown ? 'Bỏ kèo tủ x2' : 'Chọn kèo tủ x2'}
            aria-pressed={doubleDown}
            onClick={() => setDoubleDown((value) => !value)}
            title={`Kèo tủ x2 · ${doubleHintText}`}
          >
            ★ Kèo tủ x2
          </button>
          <p className="double-hint" style={{ marginTop: '8px', color: 'var(--muted)' }}>
            {doubleHintText}
          </p>
        </div>

        <div className="form-actions">
          <button type="button" className="mushy-btn mushy-btn--ghost" onClick={onClose} style={{ flex: 1 }}>
            Hủy
          </button>
          <button
            type="button"
            className="mushy-btn mushy-btn--primary"
            disabled={saving || locked}
            onClick={handleSaveClick}
            style={{ flex: 1 }}
          >
            {saving ? 'Đang lưu...' : 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MyPredictionsScreen({ items, onBack, onEditPrediction, onOpenRoom, currentStanding, predictedCount, activeTab, onTabChange }) {
  const subTab = activeTab || 'scored';
  const setSubTab = onTabChange;

  const pendingItems = useMemo(() => items.filter((item) => item.status === 'saved'), [items]);
  const scoredItems = useMemo(() => items.filter((item) => item.status !== 'saved'), [items]);

  const total = currentStanding?.total ?? 0;
  const rank = currentStanding?.rank;

  return (
    <section className="screen my-predictions-screen">
      <div className="my-predictions-header-card">
        <div className="my-predictions-header-top">
          <button type="button" className="room-back" onClick={onBack} aria-label="Quay lại" style={{ margin: 0 }}>
            <ArrowLeft size={20} />
          </button>
          <div className="my-predictions-title-group">
            <p className="section-label" style={{ padding: 0 }}>BXH</p>
            <h2 style={{ margin: 0 }}>Dự đoán của tôi</h2>
          </div>
        </div>

        <div className="score-history-head" style={{ borderTop: '1px solid var(--wc-line)', paddingTop: '12px', marginTop: '12px' }}>
          <div>
            <p className="section-label" style={{ padding: 0 }}>Tổng điểm</p>
            <h3>{total}đ</h3>
          </div>
          <div className="score-history-metrics" aria-label="Tóm tắt điểm">
            <span>{rank ? `#${rank}` : '-'}</span>
            <span>{predictedCount} đã dự</span>
            <span>{pendingItems.length} chờ kết quả</span>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--wc-line)', paddingTop: '16px', marginTop: '16px' }}>
          <div className="leader-modes" role="tablist" aria-label="Phân loại dự đoán">
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'scored'}
              className={subTab === 'scored' ? 'active' : ''}
              onClick={() => setSubTab('scored')}
            >
              Đã tính điểm ({scoredItems.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'pending'}
              className={subTab === 'pending' ? 'active' : ''}
              onClick={() => setSubTab('pending')}
            >
              Chờ kết quả ({pendingItems.length})
            </button>
          </div>

          <div className="predictions-list">
            {subTab === 'pending' ? (
              pendingItems.length === 0 ? (
                <p className="empty-state compact" style={{ padding: '40px 20px' }}>
                  Không có trận đấu nào đang chờ kết quả.
                </p>
              ) : (
                <div className="score-history-list" style={{ marginTop: '12px' }}>
                  {pendingItems.map((item) => (
                    <article key={item.key} className="score-history-row saved">
                      <span className="score-history-type">{item.type}</span>
                      <span className="score-history-copy">
                        {item.kind === 'match' ? (
                          <ScoreHistoryMatchLabel item={item} />
                        ) : (
                          <strong>{item.label}</strong>
                        )}
                        <small>{item.detail}</small>
                      </span>
                      <div className="score-history-actions">
                        {item.kind === 'match' && !isPredictionLocked(item.match) && (
                          <button
                            type="button"
                            className="score-history-edit-btn"
                            onClick={() => onEditPrediction?.(item.match)}
                            aria-label="Sửa dự đoán"
                          >
                            <PenLine size={16} strokeWidth={2.5} />
                          </button>
                        )}
                        {item.kind === 'match' && (
                          <button
                            type="button"
                            className="score-history-edit-btn"
                            onClick={() => onOpenRoom?.(item.match)}
                            aria-label="Phòng cà khịa"
                          >
                            <MessagesSquare size={16} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )
            ) : (
              scoredItems.length === 0 ? (
                <p className="empty-state compact" style={{ padding: '40px 20px' }}>
                  Chưa có dự đoán nào được tính điểm.
                </p>
              ) : (
                <div className="score-history-list" style={{ marginTop: '12px' }}>
                  {scoredItems.map((item) => (
                    <article key={item.key} className={`score-history-row ${item.status === 'zero' ? 'zero' : ''}`}>
                      <span className="score-history-type">{item.type}</span>
                      <span className="score-history-copy">
                        {item.kind === 'match' ? (
                          <ScoreHistoryMatchLabel item={item} />
                        ) : (
                          <strong>{item.label}</strong>
                        )}
                        <small>{item.detail}</small>
                      </span>
                      <b className={item.points > 0 ? '' : 'zero-pts'}>{item.points > 0 ? `+${item.points}đ` : '+0đ'}</b>
                    </article>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
