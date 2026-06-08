import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BookOpen, ClipboardCheck, Flame, Scale, Star, Target, Trophy } from 'lucide-react';
import { DAILY_QUESTIONS, DATA_SOURCE, FIFA_RANKING_SOURCE, GROUPS, MATCHES, TEAM_META, TEAM_OPTIONS, TOP_SCORER_OPTIONS } from './lib/app/worldcup-data.js';
import {
  MOCK_SCORE_STEP_MS,
  buildMockLiveScorePayload,
  createMockContext,
  createMockLongTermBet,
  isMockContext,
  mergeMockMembers,
  mergeMockPredictions,
} from './lib/app/mock-simulation.js';
import { computeStandings, dailyPoints, isFinished, matchBasePoints, matchScoreBreakdown, outcome } from './lib/app/scoring.js';
import Select from './components/Select.jsx';
import { getContext } from './lib/context.js';
import { listMembers } from './lib/members.js';
import { subscribeToTable } from './lib/realtime.js';
import { db } from './lib/supabase.js';
import './App.css';

const DEFAULT_TAB = 'matches';
const LIVE_SCORE_POLL_MS = 120000;
const LIVE_SCORE_IDLE_CHECK_MS = 900000;
const LIVE_SCORE_PREMATCH_MS = 2 * 60 * 60 * 1000;
const LIVE_SCORE_POSTMATCH_MS = 4 * 60 * 60 * 1000;
const ROOM_POLL_FALLBACK_MS = 30000;
const CHAT_REPEAT_WINDOW_MS = 45000;
const CHAT_REPEAT_LIMIT = 2;
const TABS = [
  { id: 'matches', label: 'Trang chủ', shortLabel: 'Trang chủ', icon: '⌂' },
  { id: 'results', label: 'Trận đấu', shortLabel: 'Trận đấu', icon: '⚽' },
  { id: 'daily', label: 'Dự đoán', shortLabel: 'Dự đoán', icon: '●' },
  { id: 'leaderboard', label: 'Bảng xếp hạng', shortLabel: 'BXH', icon: '♕' },
  { id: 'rules', label: 'Luật chơi', shortLabel: 'Luật chơi', icon: '↺' },
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
  const [roomMatch, setRoomMatch] = useState(null);
  const [roomMessages, setRoomMessages] = useState([]);
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [roomRealtimeState, setRoomRealtimeState] = useState('idle');
  const [spamBlockedUntil, setSpamBlockedUntil] = useState(0);
  const [liveScores, setLiveScores] = useState([]);
  const [liveSync, setLiveSync] = useState({ source: '', fetchedAt: '', error: '' });
  const [members, setMembers] = useState([]);
  const [groupFilter, setGroupFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [error, setError] = useState('');

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
  const chatSendTimesRef = useRef([]);
  const chatRepeatRef = useRef([]);
  const scope = useMemo(
    () => (ctx?.workspaceId ? { workspaceId: ctx.workspaceId, label: ctx.workspaceSlug || 'Mushy' } : null),
    [ctx?.workspaceId, ctx?.workspaceSlug]
  );

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
    if (!ctx?.userId || !scope?.workspaceId) return;
    loadGameData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.userId, scope?.workspaceId]);

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
      const syncPlan = getLiveScoreSyncPlan(MATCHES, Date.now());
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
      const waitMs = document.visibilityState === 'hidden'
        ? LIVE_SCORE_IDLE_CHECK_MS
        : await syncLiveScores();
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
  }, [ctx?.token, scope?.workspaceId, localSimulation]);

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
    () => applyAutomaticScores(MATCHES, liveScores),
    [liveScores]
  );
  const matchesWithLiveScores = useMemo(
    () => applyLiveScores(matchesWithOfficialScores, liveScores),
    [matchesWithOfficialScores, liveScores]
  );
  const standings = useMemo(
    () => buildStandings({ members, predictions, answers, matches: matchesWithOfficialScores }),
    [members, predictions, answers, matchesWithOfficialScores]
  );
  const currentStanding = standings.find((row) => row.participantId === ctx?.userId);
  const currentUserPredictions = useMemo(
    () => predictions.filter((prediction) => prediction.createdBy === ctx?.userId),
    [predictions, ctx?.userId]
  );
  const currentUserAnswers = useMemo(
    () => answers.filter((answer) => answer.createdBy === ctx?.userId),
    [answers, ctx?.userId]
  );
  const pointNotifications = useMemo(
    () => buildPointNotifications({
      predictions: currentUserPredictions,
      answers: currentUserAnswers,
      matches: matchesWithOfficialScores,
    }),
    [currentUserPredictions, currentUserAnswers, matchesWithOfficialScores]
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
      setMembers(mergeMockMembers([], ctx));
      setNotice('DEV mock: sample predictions and 6 match scores loaded.');
      setLoading(false);
      return;
    }

    try {
      const [predictionRows, answerRows, longTermRow, memberRows] = await Promise.all([
        fetchPredictions(scope.workspaceId),
        fetchDailyAnswers(scope.workspaceId),
        localSimulation ? Promise.resolve(null) : fetchLongTermBet(scope.workspaceId, ctx.userId),
        listMembers(scope.workspaceId),
      ]);
      setPredictions(localSimulation ? mergeMockPredictions(predictionRows, ctx, scope.workspaceId) : predictionRows);
      setAnswers(answerRows);
      setLongTermBet(longTermRow || (localSimulation ? createMockLongTermBet(ctx, scope.workspaceId) : null));
      const ensuredMembers = ensureCurrentMember(memberRows, ctx);
      setMembers(localSimulation ? mergeMockMembers(ensuredMembers, ctx) : ensuredMembers);
    } catch (err) {
      if (localSimulation) {
        setPredictions(mergeMockPredictions([], ctx, scope.workspaceId));
        setAnswers([]);
        setLongTermBet(createMockLongTermBet(ctx, scope.workspaceId));
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

      if (Date.now() >= new Date(match.kickoffAt).getTime()) {
        throw new Error('Trận này đã khóa dự đoán.');
      }

      if (draft.doubleDown) {
        if (match.matchDay !== getLocalDateKey()) {
          throw new Error('Kèo tủ chỉ mở trong ngày thi đấu của trận đó.');
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
      return true;
    } catch (err) {
      addToast(err.message || 'Không lưu được dự đoán.', 'error');
      return false;
    }
  }

  async function handleSaveAnswer(question, answer) {
    try {
      if (Date.now() >= new Date(question.closesAt).getTime() || question.correctAnswer) {
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

      const { error: upsertError } = await db.from('group_daily_answers').upsert(
        {
          workspace_id: scope.workspaceId,
          created_by: ctx.userId,
          question_key: question.key,
          answer: cleanAnswer,
        },
        { onConflict: 'workspace_id,created_by,question_key' }
      );
      if (upsertError) throw upsertError;

      setAnswers(await fetchDailyAnswers(scope.workspaceId));
      setNotice('Đã lưu câu trả lời.');
    } catch (err) {
      addToast(err.message || 'Không lưu được câu trả lời.', 'error');
    }
  }

  async function handleSaveLongTermBet(draft) {
    try {
      const champion = String(draft.champion || '').trim();
      const topScorer = String(draft.topScorer || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      const shockTeam = String(draft.shockTeam || '').trim();
      if (!champion || !topScorer || !shockTeam) {
        throw new Error('Bạn cần chọn đủ vô địch, vua phá lưới và đội gây sốc.');
      }

      if (localSimulation && isMockContext(ctx)) {
        setLongTermBet({
          id: `${ctx.userId}-long-term-local`,
          workspaceId: scope.workspaceId,
          createdBy: ctx.userId,
          champion,
          topScorer,
          shockTeam,
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
          shock_team: shockTeam,
        },
        { onConflict: 'workspace_id,created_by' }
      );
      if (upsertError) throw upsertError;

      const nextBet = await fetchLongTermBet(scope.workspaceId, ctx.userId);
      setLongTermBet(nextBet);
      setNotice('Đã lưu dự đoán dài hạn.');
    } catch (err) {
      addToast(err.message || 'Không lưu được dự đoán dài hạn.', 'error');
    }
  }

  function handleOpenPredictionRoom(match) {
    const prediction = predictionMap.get(Number(match.matchNo));
    if (!prediction) {
      setNotice('Bạn cần lưu dự đoán trước khi vào phòng trận này.');
      return;
    }
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
      return true;
    } catch (err) {
      setRoomMessages((rows) => rows.map((row) => (row.id === optimisticMessage.id ? { ...row, failed: true } : row)));
      setRoomError(roomStorageErrorMessage(err));
      return false;
    }
  }

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
          />
        ) : (
          <>
            <PromoHero
              onStart={() => setActiveTab('daily')}
              notifications={pointNotifications}
              totalScore={currentStanding?.total ?? 0}
            />

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
                groupFilter={groupFilter}
                query={query}
                onGroupFilter={setGroupFilter}
                onQuery={setQuery}
                onSave={handleSavePrediction}
                onOpenRoom={handleOpenPredictionRoom}
                onOpenDaily={() => setActiveTab('daily')}
                onOpenLeaderboard={() => setActiveTab('leaderboard')}
                liveSync={liveSync}
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
                questions={DAILY_QUESTIONS}
                answerMap={answerMap}
                longTermBet={longTermBet}
                onSave={handleSaveAnswer}
                onSaveLongTerm={handleSaveLongTermBet}
              />
            )}
            {activeTab === 'leaderboard' && (
              <LeaderboardScreen
                standings={standings}
                currentParticipantId={ctx?.userId}
                currentStanding={currentStanding}
                predictedCount={predictionMap.size}
                predictions={currentUserPredictions}
                answers={currentUserAnswers}
                matches={matchesWithOfficialScores}
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

      {!roomMatch && <nav className="tab-nav bottom-nav" aria-label="Điều hướng">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
            aria-label={tab.label}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="tab-label">{tab.shortLabel}</span>
          </button>
        ))}
      </nav>}

      {!roomMatch && <footer className="app-footer">
        <span>Dữ liệu lịch: {DATA_SOURCE.label}</span>
        <a href={DATA_SOURCE.officialUrl} target="_blank" rel="noreferrer">FIFA</a>
        <span>BXH FIFA: {FIFA_RANKING_SOURCE.lastOfficialUpdate}</span>
        <a href={FIFA_RANKING_SOURCE.officialUrl} target="_blank" rel="noreferrer">Ranking</a>
      </footer>}

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

function NotificationBell({ notifications = [], totalScore = 0 }) {
  const [open, setOpen] = useState(false);
  const countLabel = notifications.length > 9 ? '9+' : String(notifications.length);

  return (
    <div className="hero-notification" aria-label="Thông báo">
      <button
        className="notify-btn"
        type="button"
        aria-label="Thông báo điểm cộng trừ"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell aria-hidden="true" size={25} strokeWidth={2.7} />
        <span className="notify-badge" aria-hidden="true">{countLabel}</span>
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

function PromoHero({ onStart, notifications, totalScore }) {
  return (
    <div className="promo-hero-shell">
      <NotificationBell notifications={notifications} totalScore={totalScore} />
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
          <button type="button" onClick={onStart}>Tham gia ngay <span>→</span></button>
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
      <button type="button" onClick={onOpenRules}>Xem thể lệ →</button>
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
  groupFilter,
  query,
  onGroupFilter,
  onQuery,
  onSave,
  onOpenRoom,
  onOpenDaily,
  onOpenLeaderboard,
  liveSync,
}) {
  const grouped = useMemo(() => groupByDate(matches), [matches]);
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

  return (
    <section className="screen">
      <TodayChecklist
        matches={allMatches || matches}
        predictionMap={predictionMap}
        answerMap={answerMap}
        dailyDoubleDownMap={dailyDoubleDownMap}
        onGroupFilter={onGroupFilter}
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

      <div className="match-days">
        {grouped.map(([date, dayMatches]) => (
          <section className="match-day" key={date}>
            <div className="date-header">
              <h3>{formatDate(date)}</h3>
              <span>{dayMatches.length} trận</span>
            </div>
            <div className="match-grid">
              {dayMatches.map((match) => (
                <MatchCardPrototype
                  key={match.matchNo}
                  match={match}
                  prediction={predictionMap.get(match.matchNo)}
                  predictionCount={predictionCountByMatch.get(Number(match.matchNo)) || 0}
                  roastText={roastMap.get(Number(match.matchNo))}
                  dailyDoubleMatchNo={dailyDoubleDownMap.get(match.matchDay)}
                  onSave={onSave}
                  onOpenRoom={onOpenRoom}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function TodayChecklist({
  matches = [],
  predictionMap = new Map(),
  answerMap = new Map(),
  dailyDoubleDownMap = new Map(),
  onGroupFilter,
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
  const openTodayMatches = todayMatches.filter((match) => Date.now() < new Date(match.kickoffAt).getTime());
  const predictedToday = todayMatches.filter((match) => predictionMap.has(Number(match.matchNo)));
  const pendingMatches = openTodayMatches.filter((match) => !predictionMap.has(Number(match.matchNo)));
  const nextLockMatch = openTodayMatches[0] || null;
  const nextActionMatch = pendingMatches[0] || null;
  const nextScheduleMatch = matches
    .filter((match) => !hasUnknownTeam(match) && Date.now() < new Date(match.kickoffAt).getTime())
    .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime())[0] || null;
  const todayQuestion = DAILY_QUESTIONS.find((question) => question.date === today);
  const dailyAnswered = todayQuestion ? answerMap.has(todayQuestion.key) : false;
  const dailyLocked = todayQuestion ? Date.now() >= new Date(todayQuestion.closesAt).getTime() || !!todayQuestion.correctAnswer : false;
  const doubleDownUsed = !!dailyDoubleDownMap.get(today);
  const hasMatchesToday = todayMatches.length > 0;
  const noTasksToday = !hasMatchesToday && !todayQuestion;
  const allMatchesDone = hasMatchesToday && pendingMatches.length === 0;
  const checklistDone = (!hasMatchesToday || allMatchesDone)
    && (doubleDownUsed || !openTodayMatches.length)
    && (!todayQuestion || dailyAnswered || dailyLocked);

  const primaryLabel = nextActionMatch
    ? pendingMatches.length > 1
      ? `Dự tiếp ${pendingMatches.length} trận`
      : 'Dự trận gần nhất'
    : todayQuestion && !dailyAnswered && !dailyLocked
      ? 'Trả lời câu hỏi'
      : noTasksToday
        ? 'Xem lịch trận'
      : checklistDone
        ? 'Xem BXH'
        : 'Xem trận hôm nay';

  function scrollToMatch(match) {
    if (!match) return;
    onGroupFilter?.('all');
    window.requestAnimationFrame(() => {
      document.getElementById(`match-card-${match.matchNo}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }

  function handlePrimaryAction() {
    if (nextActionMatch) {
      scrollToMatch(nextActionMatch);
      return;
    }

    if (todayQuestion && !dailyAnswered && !dailyLocked) {
      onOpenDaily?.();
      return;
    }

    if (checklistDone) {
      if (noTasksToday) {
        scrollToMatch(nextScheduleMatch);
        return;
      }
      onOpenLeaderboard?.();
      return;
    }

    scrollToMatch(todayMatches[0] || nextScheduleMatch);
  }

  return (
    <section className={`today-checklist ${checklistDone && !noTasksToday ? 'done' : ''}`} aria-label="Checklist hôm nay">
      <div className="today-checklist-head">
        <div>
          <p className="eyebrow">Checklist hôm nay</p>
          <h2>{noTasksToday ? 'Chưa có nhiệm vụ hôm nay' : checklistDone ? 'Xong việc hôm nay rồi' : hasMatchesToday ? `${pendingMatches.length} việc cần xử lý` : 'Chưa có trận hôm nay'}</h2>
        </div>
        <span>{predictedToday.length}/{todayMatches.length || 0} đã dự đoán</span>
      </div>

      <div className="today-checklist-items">
        <ChecklistItem
          icon="✓"
          tone={hasMatchesToday && allMatchesDone ? 'ok' : 'todo'}
          label={hasMatchesToday ? `Đã dự ${predictedToday.length}/${todayMatches.length} trận hôm nay` : 'Hôm nay chưa có trận cần dự'}
        />
        <ChecklistItem
          icon="⏰"
          tone={nextLockMatch && timeUntilMs(nextLockMatch.kickoffAt) <= 60 * 60 * 1000 ? 'warn' : 'neutral'}
          label={nextLockMatch
            ? `${displayTeamName(nextLockMatch.homeTeam)} - ${displayTeamName(nextLockMatch.awayTeam)} khóa sau ${formatTimeUntil(nextLockMatch.kickoffAt)}`
            : hasMatchesToday ? 'Các trận hôm nay đã khóa hoặc đã xong' : 'Trận gần nhất sẽ hiện khi tới ngày thi đấu'}
        />
        <ChecklistItem
          icon="★"
          tone={doubleDownUsed ? 'ok' : openTodayMatches.length ? 'todo' : 'neutral'}
          label={doubleDownUsed ? 'Kèo tủ x2: Đã dùng' : openTodayMatches.length ? 'Kèo tủ x2: Chưa dùng' : 'Kèo tủ x2: Chưa mở hôm nay'}
        />
        <ChecklistItem
          icon="?"
          tone={!todayQuestion || dailyAnswered || dailyLocked ? 'ok' : 'todo'}
          label={!todayQuestion ? 'Câu hỏi ngày: Chưa có' : dailyAnswered ? 'Câu hỏi ngày: Đã trả lời' : dailyLocked ? 'Câu hỏi ngày: Đã khóa' : 'Câu hỏi ngày: Chưa trả lời'}
        />
      </div>

      <div className="today-checklist-actions">
        <button type="button" className="primary-btn small" onClick={handlePrimaryAction}>
          {primaryLabel}
        </button>
        {todayQuestion && !dailyAnswered && !dailyLocked && nextActionMatch ? (
          <button type="button" className="secondary-btn" onClick={onOpenDaily}>
            Câu hỏi ngày
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ChecklistItem({ icon, label, tone = 'neutral' }) {
  return (
    <div className={`today-checklist-item ${tone}`}>
      <span aria-hidden="true">{icon}</span>
      <strong>{label}</strong>
    </div>
  );
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

function MatchCardPrototype({ match, prediction, predictionCount = 0, roastText, dailyDoubleMatchNo, onSave, onOpenRoom }) {
  const teamsKnown = !hasUnknownTeam(match);
  const locked = Date.now() >= new Date(match.kickoffAt).getTime() || !teamsKnown;
  const finished = isFinished(match);
  const liveScore = shouldShowLiveScore(match) ? match.liveScore : null;
  const liveInProgress = isLiveInProgress(liveScore);
  const liveFinished = liveScore?.status === 'finished';
  const isTodayMatchDay = match.matchDay === getLocalDateKey();
  const doubleDownReserved = !!dailyDoubleMatchNo && dailyDoubleMatchNo !== Number(match.matchNo);
  const [homePred, setHomePred] = useState(prediction?.homePred ?? 0);
  const [awayPred, setAwayPred] = useState(prediction?.awayPred ?? 0);
  const [doubleDown, setDoubleDown] = useState(prediction?.doubleDown ?? false);
  const [saving, setSaving] = useState(false);
  const base = matchBasePoints(prediction, match);
  const breakdown = matchScoreBreakdown(prediction, match);
  const displayHomeScore = finished ? match.homeScore : liveScore?.homeScore;
  const displayAwayScore = finished ? match.awayScore : liveScore?.awayScore;

  useEffect(() => {
    setHomePred(prediction?.homePred ?? 0);
    setAwayPred(prediction?.awayPred ?? 0);
    setDoubleDown(prediction?.doubleDown ?? false);
  }, [prediction?.homePred, prediction?.awayPred, prediction?.doubleDown]);

  const homeScore = normalizeDraftScore(homePred);
  const awayScore = normalizeDraftScore(awayPred);
  const canUseDoubleDown = teamsKnown && !locked && isTodayMatchDay && !doubleDownReserved;
  const canOpenRoom = !!prediction;
  const draftIsSaved = !!prediction
    && Number(prediction.homePred) === homeScore
    && Number(prediction.awayPred) === awayScore
    && !!prediction.doubleDown === !!doubleDown;
  const predictionButtonLabel = saving
    ? 'Đang lưu...'
    : prediction && draftIsSaved
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
      ? 'Đã khóa dự đoán.'
      : doubleDownReserved
        ? `Kèo tủ x2 đã dùng ở trận #${dailyDoubleMatchNo}.`
        : isTodayMatchDay
          ? 'Mỗi ngày chỉ 1 kèo tủ.'
          : 'Kèo tủ chỉ mở đúng ngày thi đấu.';

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
      await onSave(match, { homePred: homeScore, awayPred: awayScore, doubleDown });
    } finally {
      setSaving(false);
    }
  }

  async function handlePrimaryActionClick() {
    if (prediction && draftIsSaved) {
      onOpenRoom?.(match);
      return;
    }
    await handleSaveClick();
  }

  function handleCardOpen(event) {
    if (event.target.closest('button')) return;
    onOpenRoom?.(match);
  }

  function handleCardKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpenRoom?.(match);
  }

  return (
    <article
      id={`match-card-${match.matchNo}`}
      className={`match-card match-card--prototype ${canOpenRoom ? 'has-room' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={canOpenRoom ? `Mở phòng dự đoán trận ${match.matchNo}` : `Trận ${match.matchNo}, lưu dự đoán để mở phòng`}
      onClick={handleCardOpen}
      onKeyDown={handleCardKeyDown}
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
                  {prediction ? <>Bạn dự <b>{prediction.homePred}-{prediction.awayPred}</b></> : 'Trận đang có tỉ số live tạm'}
                </span>
                <strong className="pending-score">Chưa chấm điểm đến khi nguồn tỉ số báo FT</strong>
              </>
            )}
          </div>
          <p className="match-social-line">{socialLine}</p>
        </>
      ) : (
        <>
          <div className="fixture prediction-fixture">
            <div className="prediction-side">
              <MatchTeam team={match.homeTeam} />
              <ScorePicker
                score={homeScore}
                locked={locked}
                ariaLabel={`Dự đoán tỉ số ${displayTeamName(match.homeTeam)}`}
                onDecrease={() => bumpScore('home', -1)}
                onIncrease={() => bumpScore('home', 1)}
              />
            </div>
            <span className="score-vs" aria-hidden="true">:</span>
            <div className="prediction-side">
              <MatchTeam team={match.awayTeam} />
              <ScorePicker
                score={awayScore}
                locked={locked}
                ariaLabel={`Dự đoán tỉ số ${displayTeamName(match.awayTeam)}`}
                onDecrease={() => bumpScore('away', -1)}
                onIncrease={() => bumpScore('away', 1)}
              />
            </div>
          </div>

          <div className="match-actions compact-actions">
            <button
              type="button"
              className={`double-btn star-btn ${doubleDown ? 'active' : ''}`}
              disabled={!canUseDoubleDown}
              onClick={(event) => {
                event.stopPropagation();
                setDoubleDown((value) => !value);
              }}
              title="Kèo tủ x2"
            >
              ★
            </button>
            <button
              type="button"
              className={`primary-btn small save-prediction-btn ${draftIsSaved ? 'saved' : ''}`}
              disabled={locked || saving}
              onClick={(event) => {
                event.stopPropagation();
                handleSaveClick();
              }}
            >
              {saving ? 'Đang lưu...' : draftIsSaved ? 'Đã lưu' : 'Lưu dự đoán'}
            </button>
          </div>
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
          <p className="match-social-line">{socialLine}</p>
          <p className="double-hint double-hint-clean">{doubleHintText}</p>
          <p className="double-hint">
            {!teamsKnown
              ? 'Chờ xác định đội.'
              : locked
              ? 'Đã khóa dự đoán'
              : doubleDownReserved
                ? `Ngày này đã chọn kèo tủ trận #${dailyDoubleMatchNo}.`
                : isTodayMatchDay
                  ? 'Mỗi ngày chỉ 1 kèo tủ.'
                  : 'Kèo tủ chỉ mở đúng ngày thi đấu.'}
          </p>
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
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [predictionFaction, setPredictionFaction] = useState('mine');
  const [showPredictionSheet, setShowPredictionSheet] = useState(false);
  const [activityLimit, setActivityLimit] = useState(3);
  const chatFeedRef = useRef(null);
  const matchPredictions = useMemo(
    () => predictions
      .filter((item) => Number(item.matchNo) === Number(match.matchNo))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))),
    [predictions, match.matchNo]
  );
  const memberMap = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
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
  const sameFactionCount = myFaction === 'all'
    ? 0
    : matchPredictions.filter((item) => predictedOutcomeKey(item) === myFaction).length;
  const roomActivityItems = useMemo(
    () => buildRoomPredictionItems({ match, predictions: matchPredictions, memberMap }),
    [match, matchPredictions, memberMap]
  );
  const visibleActivityItems = roomActivityItems.slice(0, activityLimit);
  const canExpandActivity = activityLimit < roomActivityItems.length;
  const canCollapseActivity = !canExpandActivity && activityLimit > 3;
  const cooldownLeft = Math.max(0, Math.ceil((Number(spamBlockedUntil || 0) - Date.now()) / 1000));

  useEffect(() => {
    setActivityLimit(3);
  }, [match.matchNo]);

  useEffect(() => {
    const feed = chatFeedRef.current;
    if (!feed) return;
    feed.scrollTop = feed.scrollHeight;
  }, [messages.length]);

  async function sendChat() {
    if (sending || cooldownLeft > 0) return;
    setSending(true);
    try {
      const ok = await onSend({ kind: 'chat', body: draft });
      if (ok) setDraft('');
    } finally {
      setSending(false);
    }
  }

  function sendChallenge() {
    if (cooldownLeft > 0) return;
    const score = prediction ? `${prediction.homePred}-${prediction.awayPred}` : 'kèo này';
    onSend({
      kind: 'challenge',
      body: `Thách kèo tay đôi: ai dám ngược cửa dự đoán ${displayTeamName(match.homeTeam)} ${score} ${displayTeamName(match.awayTeam)}?`,
    });
  }

  return (
      <section className="prediction-room screen" aria-label={`Phòng dự đoán trận ${match.matchNo}`}>
        <div className="room-head">
          <button type="button" className="room-back" onClick={onBack} aria-label="Quay lại danh sách trận">
            ←
          </button>
          <div>
            <p className="section-label">Phòng dự đoán</p>
            <h2>#{match.matchNo} {displayTeamName(match.homeTeam)} vs {displayTeamName(match.awayTeam)}</h2>
          </div>
        </div>

        <div className="room-status-card">
          <MatchRoomStatus match={match} />
        </div>

        <div className="room-section">
          <div className="room-section-head">
            <h3>Phe nào đông</h3>
            <span>{matchPredictions.length} dự đoán</span>
          </div>
          <div className="prediction-split-bar" aria-label="Tỉ lệ phe dự đoán">
            {split.map((item) => (
              <span
                key={item.key}
                className={`split-segment ${item.key}`}
                style={{ width: `${item.percent}%` }}
                title={`${item.label}: ${item.percent}%`}
              />
            ))}
          </div>
          <div className="prediction-split-legend">
            {split.map((item) => (
              <span key={item.key} className={item.key}>
                <i aria-hidden="true" />
                {item.label} <b>{item.percent}%</b>
              </span>
            ))}
          </div>
        </div>

        <div className="room-section room-history-compact">
          <div className="room-section-head">
            <h3>Lịch sử dự đoán</h3>
            <span>{prediction ? `Bạn: ${prediction.homePred}-${prediction.awayPred}` : 'Chưa có kèo'}</span>
          </div>
          <button type="button" className="prediction-history-row" onClick={() => setShowPredictionSheet(true)}>
            <span className="history-row-main">Cùng phe: <b>{sameFactionCount}</b> người</span>
            <strong>Xem danh sách</strong>
          </button>
          <div className="room-activity-list" aria-label="Dự đoán tỉ số gần nhất">
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
            <span>{loading ? 'Đang tải...' : `${messages.length} tin`}</span>
          </div>

          <p className="room-realtime-chip">{roomRealtimeLabel(realtimeState)}</p>
          <div className="reaction-row" aria-label="Thả cảm xúc nhanh">
            {['😂', '🔥', '😭', '🤝'].map((emoji) => (
              <button key={emoji} type="button" disabled={cooldownLeft > 0} onClick={() => onSend({ kind: 'reaction', body: emoji, emoji })}>
                {emoji}
              </button>
            ))}
            <button type="button" className="challenge-btn" disabled={cooldownLeft > 0} onClick={sendChallenge}>Thách kèo</button>
          </div>

          <div className="chat-feed" ref={chatFeedRef}>
            {messages.length === 0 ? (
              <p className="room-empty">{error || 'Chưa có ai gáy. Bạn mở bát đi.'}</p>
            ) : messages.slice(-30).map((message) => (
              <article key={message.id} className={`chat-message ${message.createdBy === currentUserId ? 'mine' : ''} ${message.failed ? 'failed' : ''}`}>
                <span>{memberDisplayName(memberMap, message.createdBy)}</span>
                <p>{message.kind === 'reaction' ? `${message.emoji || message.body}` : message.body}</p>
                <small>{message.failed ? 'Chưa gửi được' : formatRoomTime(message.createdAt)}{message.kind === 'challenge' ? ' · thách kèo' : ''}</small>
              </article>
            ))}
          </div>

          {error && messages.length > 0 ? <p className="room-error">{error}</p> : null}
          {cooldownLeft > 0 ? <p className="room-error">Chống spam: chờ khoảng {cooldownLeft}s.</p> : null}

          <div className="chat-compose">
            <input
              value={draft}
              maxLength={280}
              placeholder="Cà khịa văn minh, đau nhưng vui..."
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') sendChat();
              }}
            />
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
          <p>Đang chờ cập nhật cầu thủ ghi bàn</p>
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
  return (
    <div className="match-team">
      <span className="match-flag" aria-label={`Cờ ${team}`}>
        {meta?.flagUrl ? <img src={meta.flagUrl} alt="" loading="lazy" /> : meta?.flag || team.slice(0, 2).toUpperCase()}
      </span>
      <strong>{displayTeamName(team)}</strong>
      {Number.isInteger(meta?.fifaRank) ? <small>FIFA #{meta.fifaRank}</small> : null}
      {score != null ? <b className="real-score">{score}</b> : null}
    </div>
  );
}

function ScorePicker({ score, locked, ariaLabel, onDecrease, onIncrease }) {
  return (
    <div className="score-stepper score-stepper--side" aria-label={ariaLabel}>
      <button type="button" disabled={locked} onClick={onDecrease} aria-label="Giảm tỉ số">-</button>
      <span className="score-value">{score}</span>
      <button type="button" disabled={locked} onClick={onIncrease} aria-label="Tăng tỉ số">+</button>
    </div>
  );
}

function MatchCard({ match, prediction, dailyDoubleMatchNo, onSave }) {
  const locked = Date.now() >= new Date(match.kickoffAt).getTime();
  const isTodayMatchDay = match.matchDay === getLocalDateKey();
  const doubleDownReserved = !!dailyDoubleMatchNo && dailyDoubleMatchNo !== Number(match.matchNo);
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
          disabled={locked || !isTodayMatchDay || doubleDownReserved}
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
            : isTodayMatchDay
              ? 'Mỗi ngày chỉ 1 kèo tủ.'
              : 'Kèo tủ chỉ mở đúng ngày thi đấu.'}
        </p>
      )}
    </article>
  );
}

function DailyScreen({ questions, answerMap, longTermBet, onSave, onSaveLongTerm }) {
  const visibleQuestions = useMemo(() => {
    const today = getLocalDateKey();
    const tomorrow = getLocalDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    return questions.filter((question) => question.date === today || question.date === tomorrow);
  }, [questions]);

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Không cần giỏi bóng đá</p>
          <h2>Câu hỏi hôm nay và ngày mai</h2>
        </div>
      </div>
      <div className="question-list">
        {visibleQuestions.length === 0 ? (
          <p className="empty-state">Chưa có câu hỏi cho hôm nay hoặc ngày mai.</p>
        ) : visibleQuestions.map((question) => (
          <QuestionCard key={question.key} question={question} answer={answerMap.get(question.key)} onSave={onSave} />
        ))}
      </div>
      <LongTermBetCard bet={longTermBet} onSave={onSaveLongTerm} />
    </section>
  );
}

function QuestionCard({ question, answer, onSave }) {
  const locked = Date.now() >= new Date(question.closesAt).getTime() || !!question.correctAnswer;
  const [draft, setDraft] = useState(answer?.answer || '');
  const points = dailyPoints(answer, question);

  useEffect(() => setDraft(answer?.answer || ''), [answer?.answer]);

  return (
    <article className="question-card">
      <div>
        <span className="date-chip">{formatDate(question.date)}</span>
        <h3>{question.prompt}</h3>
        <p>Khóa: {formatTime(question.closesAt)}</p>
      </div>

      {question.options?.length ? (
        <div className="option-grid">
          {question.options.map((option) => (
            <button key={option} type="button" disabled={locked} className={draft === option ? 'active' : ''} onClick={() => setDraft(option)}>
              {option}
            </button>
          ))}
        </div>
      ) : (
        <input className="answer-input" disabled={locked} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Nhập câu trả lời của bạn" />
      )}

      <div className="question-footer">
        <span>{answer ? `Đã chọn: ${answer.answer}` : locked ? 'Chưa trả lời' : 'Chọn 1 đáp án'}</span>
        {question.correctAnswer ? <strong>{points}đ</strong> : null}
        <button type="button" className="primary-btn small" disabled={locked || !draft} onClick={() => onSave(question, draft)}>
          Lưu
        </button>
      </div>
    </article>
  );
}

function LongTermBetCard({ bet, onSave }) {
  const [champion, setChampion] = useState(bet?.champion || '');
  const [topScorer, setTopScorer] = useState(bet?.topScorer || '');
  const [shockTeam, setShockTeam] = useState(bet?.shockTeam || '');
  const teamOptions = useMemo(
    () => TEAM_OPTIONS.map((team) => ({
      value: team,
      label: `${displayTeamName(team)} · FIFA #${TEAM_META[team]?.fifaRank ?? '-'}`,
      icon: TEAM_META[team]?.flag || null,
    })),
    []
  );
  const scorerOptions = useMemo(() => TOP_SCORER_OPTIONS.map((player) => player.label), []);

  useEffect(() => {
    setChampion(bet?.champion || '');
    setTopScorer(bet?.topScorer || '');
    setShockTeam(bet?.shockTeam || '');
  }, [bet?.champion, bet?.topScorer, bet?.shockTeam]);

  return (
    <article className="question-card long-term-card">
      <div>
        <span className="date-chip">Dài hạn</span>
        <h3>Dự đoán dài hạn</h3>
        <p>Chọn trước giải. Đúng vô địch +20đ, vua phá lưới +10đ, đội gây sốc +10đ.</p>
      </div>

      <div className="long-term-fields">
        <label>
          <span>Vô địch</span>
          <Select value={champion} onChange={setChampion} options={teamOptions} placeholder="Chọn đội vô địch" />
        </label>
        <label>
          <span>Vua phá lưới</span>
          <input
            className="answer-input"
            list="top-scorer-suggestions"
            value={topScorer}
            onChange={(event) => setTopScorer(event.target.value)}
            placeholder="Nhập hoặc chọn cầu thủ"
          />
          <datalist id="top-scorer-suggestions">
            {scorerOptions.map((label) => <option key={label} value={label} />)}
          </datalist>
        </label>
        <label>
          <span>Đội gây sốc</span>
          <small className="field-hint">Đội bị đánh giá thấp nhưng đi sâu hơn kỳ vọng, tạo bất ngờ lớn so với BXH FIFA và tương quan bảng đấu.</small>
          <Select value={shockTeam} onChange={setShockTeam} options={teamOptions} placeholder="Chọn đội gây sốc" />
        </label>
      </div>

      <div className="question-footer">
        <span>{bet ? 'Đã lưu dự đoán dài hạn' : 'Chưa lưu dự đoán dài hạn'}</span>
        <button type="button" className="primary-btn small" onClick={() => onSave({ champion, topScorer, shockTeam })}>
          Lưu
        </button>
      </div>
    </article>
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
            <th>Tr</th>
            <th>T</th>
            <th>H</th>
            <th>B</th>
            <th>HS</th>
            <th>Đ</th>
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
                    <small>{row.won}T {row.drawn}H {row.lost}B{row.liveMatches > 0 ? ' · LIVE tạm' : ''}</small>
                  </span>
                </span>
              </td>
              <td>{row.played}</td>
              <td>{row.won}</td>
              <td>{row.drawn}</td>
              <td>{row.lost}</td>
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
      <span className="football-match-time">#{match.matchNo} · {formatTime(match.kickoffAt)}</span>
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
  currentParticipantId,
  currentStanding,
  predictedCount,
  predictions,
  answers,
  matches,
}) {
  const [rankMode, setRankMode] = useState('total');
  const [showHistory, setShowHistory] = useState(false);
  const scoreHistory = useMemo(
    () => buildScoreHistory({ predictions, answers, matches, currentStanding }),
    [predictions, answers, matches, currentStanding]
  );
  const rows = standings;

  return (
    <section className="screen">
      <ScoreHistoryPanel
        items={scoreHistory}
        rank={currentStanding?.rank}
        total={currentStanding?.total ?? 0}
        predictedCount={predictedCount}
        isOpen={showHistory}
        onToggle={() => setShowHistory((value) => !value)}
      />

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

      <p className="section-label fun-awards-label">Giải vui dự kiến</p>
      <div className="fun-awards">
        <Award icon="🃏" title="Thánh phán bừa" body="Lên top nhờ những kèo không ai dám nghĩ tới." />
        <Award icon="🎯" title="Thủy chung" body="Dự đủ mọi trận, không bỏ lịch nào." />
        <Award icon="🚀" title="Vua nước rút" body="Bùng nổ ở nửa sau vòng bảng." />
      </div>
    </section>
  );
}

function ScoreHistoryPanel({ items, rank, total, predictedCount, isOpen, onToggle }) {
  const pendingItems = items.filter((item) => item.status === 'saved');
  const scoredItems = items.filter((item) => item.status !== 'saved');
  const totalItems = items.length;

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
          <span>{pendingItems.length} chờ kết quả</span>
        </div>
      </div>

      <button className="secondary-btn score-history-toggle" type="button" onClick={onToggle} aria-expanded={isOpen}>
        {isOpen ? 'Ẩn danh sách' : 'Xem tất cả dự đoán'}
      </button>

      {isOpen && (
        totalItems === 0 ? (
          <p className="empty-state compact">Chưa có dự đoán nào. Hãy vào Trang chủ để đặt kèo trận nào đó đi!</p>
        ) : (
          <div className="score-history-list">
            {pendingItems.length > 0 && (
              <>
                <p className="score-history-section-label">Chờ kết quả ({pendingItems.length} trận)</p>
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
                    <span className="score-history-pending-badge">Chờ</span>
                  </article>
                ))}
              </>
            )}
            {scoredItems.length > 0 && (
              <>
                <p className="score-history-section-label">Đã tính điểm ({scoredItems.length} mục)</p>
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
              </>
            )}
          </div>
        )
      )}
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
  return `${row.matchPts} trận · ${row.upsetPts} cửa dưới · ${row.streakPts} streak · ${row.dailyPts} vui`;
}

function buildScoreHistory({ predictions = [], answers = [], matches = [], currentStanding = null }) {
  const matchesByNo = new Map(matches.map((match) => [Number(match.matchNo), match]));
  const questionsByKey = new Map(DAILY_QUESTIONS.map((question) => [question.key, question]));

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

  return items;
}

function buildPointNotifications({ predictions = [], answers = [], matches = [] }) {
  const matchesByNo = new Map(matches.map((match) => [Number(match.matchNo), match]));
  const questionsByKey = new Map(DAILY_QUESTIONS.map((question) => [question.key, question]));

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

function buildRoomPredictionItems({ match, predictions = [], memberMap = new Map() }) {
  return predictions.map((prediction) => {
    const name = memberDisplayName(memberMap, prediction.createdBy);
    return {
      id: `prediction-${prediction.createdBy}-${prediction.matchNo}`,
      type: 'prediction',
      userId: prediction.createdBy,
      name,
      initials: initialsFromName(name),
      label: 'Dự đoán',
      body: `${prediction.homePred}-${prediction.awayPred}`,
      createdAt: prediction.updatedAt || prediction.createdAt,
      sortAt: prediction.updatedAt || prediction.createdAt,
    };
  })
    .filter((item) => Number.isFinite(new Date(item.sortAt).getTime()))
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
      title: 'Kèo tủ mỗi ngày',
      body: 'Mỗi người chỉ có 1 kèo tủ trong ngày thi đấu, và chỉ chọn được trong lượt trận của ngày đó.',
    },
    {
      icon: Flame,
      title: 'Streak',
      body: 'Cứ 3 trận liên tiếp đúng tỉ số chính xác sẽ được cộng thêm 5đ.',
    },
    {
      icon: BookOpen,
      title: 'Câu hỏi vui',
      body: 'Mỗi câu hỏi ngày thường có 2đ. Đây là phần kéo cả người không mê bóng đá vào chơi.',
    },
    {
      icon: ClipboardCheck,
      title: 'Chốt sổ',
      body: 'Dự đoán phải lưu trước giờ bóng lăn. Trễ trận nào thì trận đó 0đ, không phạt thêm.',
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
      source: payload.source,
      fetchedAt: payload.fetchedAt,
    })),
  };
}

function getLiveScoreSyncPlan(matches = [], nowMs = Date.now()) {
  const windows = matches
    .map((match) => {
      const kickoffMs = new Date(match.kickoffAt).getTime();
      if (!Number.isFinite(kickoffMs)) return null;
      return {
        matchAt: match.kickoffAt,
        startsAt: kickoffMs - LIVE_SCORE_PREMATCH_MS,
        endsAt: kickoffMs + LIVE_SCORE_POSTMATCH_MS,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startsAt - b.startsAt);

  const activeWindow = windows.find((windowItem) => nowMs >= windowItem.startsAt && nowMs <= windowItem.endsAt);
  if (activeWindow) {
    return {
      shouldFetch: true,
      waitMs: LIVE_SCORE_POLL_MS,
      nextMatchAt: activeWindow.matchAt,
      nextFetchAt: new Date(nowMs + LIVE_SCORE_POLL_MS).toISOString(),
    };
  }

  const nextWindow = windows.find((windowItem) => nowMs < windowItem.startsAt);
  if (!nextWindow) {
    return {
      shouldFetch: false,
      waitMs: LIVE_SCORE_IDLE_CHECK_MS,
      nextMatchAt: '',
      nextFetchAt: '',
    };
  }

  const waitUntilWindow = Math.max(60000, nextWindow.startsAt - nowMs);
  return {
    shouldFetch: false,
    waitMs: Math.min(waitUntilWindow, LIVE_SCORE_IDLE_CHECK_MS),
    nextMatchAt: nextWindow.matchAt,
    nextFetchAt: new Date(nextWindow.startsAt).toISOString(),
  };
}

async function fetchPredictions(workspaceId) {
  const { data, error } = await db
    .from('group_predictions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('match_no', { ascending: true });
  if (error) throw error;
  return (data || []).map(toPrediction);
}

async function fetchDailyAnswers(workspaceId) {
  const { data, error } = await db
    .from('group_daily_answers')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(toDailyAnswer);
}

async function fetchMatchRoomMessages(workspaceId, matchNo) {
  const { data, error } = await db
    .from('match_room_messages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('match_no', matchNo)
    .order('created_at', { ascending: true })
    .limit(80);
  if (error) throw error;
  return (data || []).map(toRoomMessage);
}

async function insertMatchRoomMessage({ workspaceId, createdBy, matchNo, kind, body, emoji }) {
  const { data, error } = await db
    .from('match_room_messages')
    .insert({
      workspace_id: workspaceId,
      created_by: createdBy,
      match_no: matchNo,
      kind,
      body,
      emoji,
    })
    .select('*')
    .single();
  if (error) throw error;
  return toRoomMessage(data);
}

async function fetchLongTermBet(workspaceId, userId) {
  if (!workspaceId || !userId) return null;
  const { data, error } = await db
    .from('long_term_bets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('created_by', userId)
    .maybeSingle();
  if (error?.code === '42P01' || /long_term_bets|does not exist/i.test(error?.message || '')) return null;
  if (error) throw error;
  return data ? toLongTermBet(data) : null;
}

function buildStandings({ members, predictions, answers, matches }) {
  const memberMap = new Map(members.map((member) => [member.user_id, member]));
  const userIds = new Set([
    ...members.map((member) => member.user_id),
    ...predictions.map((prediction) => prediction.createdBy),
    ...answers.map((answer) => answer.createdBy),
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
  });
}

function computeStandingsForUsers({ participants, predictions, dailyAnswers, matches }) {
  return computeStandings({ participants, predictions, dailyAnswers, matches, questions: DAILY_QUESTIONS });
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

function toPrediction(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    matchNo: row.match_no,
    matchDay: row.match_day,
    homePred: row.home_pred,
    awayPred: row.away_pred,
    doubleDown: row.double_down,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDailyAnswer(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    questionKey: row.question_key,
    answer: row.answer,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toLongTermBet(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    champion: row.champion || '',
    topScorer: row.top_scorer || '',
    shockTeam: row.shock_team || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRoomMessage(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    matchNo: row.match_no,
    kind: row.kind || 'chat',
    body: row.body || '',
    emoji: row.emoji || null,
    createdAt: row.created_at,
  };
}

function normalizeChatRepeatKey(body) {
  return String(body || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function mergeRoomRealtimePayload(rows, payload) {
  const eventType = String(payload?.eventType || '').toUpperCase();
  const nextRow = payload?.new ? toRoomMessage(payload.new) : null;
  const oldRow = payload?.old ? toRoomMessage(payload.old) : null;
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
    };
  });
}

function applyLiveScores(matches, liveScores) {
  const liveByPair = buildLiveScorePairMap(liveScores);
  return matches.map((match) => {
    if (isFinished(match)) return { ...match, liveScore: null };
    const liveScore = findLiveScoreForMatch(match, liveByPair);
    return { ...match, liveScore };
  });
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

function formatDate(value) {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat('vi-VN', {
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
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function shortTeam(team) {
  const name = displayTeamName(team);
  return name.length > 12 ? `${name.slice(0, 12)}...` : name;
}

function displayTeamName(team) {
  return TEAM_META[team]?.viName || team;
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
  if (liveScore.status === 'in_progress') return liveScore.rawClock ? `LIVE ${liveScore.rawClock}` : 'LIVE';
  return 'LIVE';
}

function sourceLabel(source) {
  if (source === 'local-mock') return 'DEV mock';
  if (source === 'worldcup26.ir') return 'WorldCup26';
  if (source === 'espn') return 'ESPN';
  return source || 'live';
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
