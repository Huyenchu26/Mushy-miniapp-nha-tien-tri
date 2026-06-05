import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DAILY_QUESTIONS, DATA_SOURCE, FIFA_RANKING_SOURCE, GROUPS, MATCHES, TEAM_META, TEAM_OPTIONS, TOP_SCORER_OPTIONS } from './lib/app/worldcup-data.js';
import { computeStandings, dailyPoints, isFinished, matchBasePoints, matchScoreBreakdown, outcome } from './lib/app/scoring.js';
import Select from './components/Select.jsx';
import { getContext } from './lib/context.js';
import { listMembers } from './lib/members.js';
import { db } from './lib/supabase.js';
import './App.css';

const DEFAULT_TAB = 'matches';
const LIVE_SCORE_POLL_MS = 120000;
const TABS = [
  { id: 'matches', label: 'Trận đấu' },
  { id: 'daily', label: 'Câu hỏi' },
  { id: 'leaderboard', label: 'BXH' },
  { id: 'results', label: 'Kết quả' },
  { id: 'rules', label: 'Luật' },
];
const PRIMARY_GROUP_FILTERS = ['A', 'B', 'C', 'D'];
const EXTRA_GROUP_FILTERS = Object.keys(GROUPS).filter((group) => !PRIMARY_GROUP_FILTERS.includes(group));

export default function App() {
  const [ctx, setCtx] = useState(null);
  const [ctxError, setCtxError] = useState('');
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);
  const [predictions, setPredictions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [longTermBet, setLongTermBet] = useState(null);
  const [liveScores, setLiveScores] = useState([]);
  const [liveSync, setLiveSync] = useState({ source: '', fetchedAt: '', error: '' });
  const [members, setMembers] = useState([]);
  const [groupFilter, setGroupFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const refreshGestureRef = useRef({ startY: 0, scrollY: 0 });
  const scope = useMemo(
    () => (ctx?.workspaceId ? { workspaceId: ctx.workspaceId, label: ctx.workspaceSlug || 'Mushy' } : null),
    [ctx?.workspaceId, ctx?.workspaceSlug]
  );

  useEffect(() => {
    try {
      const nextCtx = getContext();
      if (!nextCtx?.userId || !nextCtx?.workspaceId || !nextCtx?.token) {
        setCtxError('Thiếu Mushy context. Hãy mở app từ Mushy hoặc chạy npm run dev:setup để có token dev.');
      } else {
        setCtx(nextCtx);
      }
    } catch (err) {
      setCtxError(err.message || 'Không đọc được Mushy context.');
    }
  }, []);

  useEffect(() => {
    if (!ctx?.userId || !scope?.workspaceId) return;
    loadGameData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.userId, scope?.workspaceId]);

  useEffect(() => {
    if (!ctx?.token || !scope?.workspaceId) return undefined;

    let cancelled = false;
    async function syncLiveScores() {
      try {
        const payload = await fetchLiveScores(ctx.token, scope.workspaceId);
        if (cancelled) return;
        setLiveScores(payload.matches || []);
        setLiveSync({
          source: payload.source || '',
          fetchedAt: payload.fetchedAt || '',
          fallbackReason: payload.fallbackReason || '',
          error: '',
        });
      } catch (err) {
        if (cancelled) return;
        setLiveSync((current) => ({
          ...current,
          error: err.message || 'Không đồng bộ được tỉ số live.',
        }));
      }
    }

    syncLiveScores();
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') syncLiveScores();
    }, LIVE_SCORE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [ctx?.token, scope?.workspaceId]);

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
  const filteredMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return matchesWithLiveScores.filter((match) => {
      const groupOk = groupFilter === 'all' || match.group === groupFilter;
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
    try {
      const [predictionRows, answerRows, longTermRow, memberRows] = await Promise.all([
        fetchPredictions(scope.workspaceId),
        fetchDailyAnswers(scope.workspaceId),
        fetchLongTermBet(scope.workspaceId, ctx.userId),
        listMembers(scope.workspaceId),
      ]);
      setPredictions(predictionRows);
      setAnswers(answerRows);
      setLongTermBet(longTermRow);
      setMembers(ensureCurrentMember(memberRows, ctx));
    } catch (err) {
      setError(err.message || 'Không tải được dữ liệu game.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePrediction(match, draft) {
    setNotice('');
    setError('');
    try {
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

      const { error: upsertError } = await db.from('group_predictions').upsert(
        {
          workspace_id: scope.workspaceId,
          created_by: ctx.userId,
          match_no: match.matchNo,
          match_day: match.matchDay,
          home_pred: normalizeScore(draft.homePred),
          away_pred: normalizeScore(draft.awayPred),
          double_down: draft.doubleDown === true,
        },
        { onConflict: 'workspace_id,created_by,match_no' }
      );
      if (upsertError) throw upsertError;

      setPredictions(await fetchPredictions(scope.workspaceId));
      setNotice('Đã lưu dự đoán.');
    } catch (err) {
      setError(err.message || 'Không lưu được dự đoán.');
    }
  }

  async function handleSaveAnswer(question, answer) {
    setNotice('');
    setError('');
    try {
      if (Date.now() >= new Date(question.closesAt).getTime() || question.correctAnswer) {
        throw new Error('Câu hỏi này đã khóa.');
      }
      const cleanAnswer = String(answer || '').trim().replace(/\s+/g, ' ').slice(0, 280);
      if (!cleanAnswer) throw new Error('Bạn cần nhập câu trả lời.');

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
      setError(err.message || 'Không lưu được câu trả lời.');
    }
  }

  async function handleSaveLongTermBet(draft) {
    setNotice('');
    setError('');
    try {
      const champion = String(draft.champion || '').trim();
      const topScorer = String(draft.topScorer || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      const shockTeam = String(draft.shockTeam || '').trim();
      if (!champion || !topScorer || !shockTeam) {
        throw new Error('Bạn cần chọn đủ vô địch, vua phá lưới và đội gây sốc.');
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
      setError(err.message || 'Không lưu được dự đoán dài hạn.');
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
        {(notice || error || loading) && (
          <div className={`toast-line ${error ? 'error' : ''}`} role="status">
            {loading ? 'Đang tải dữ liệu...' : error || notice}
          </div>
        )}

        <LiveScorePanel liveScores={liveScores} liveSync={liveSync} />

        {activeTab === 'matches' && (
          <MatchesScreen
            matches={filteredMatches}
            predictionMap={predictionMap}
            dailyDoubleDownMap={dailyDoubleDownMap}
            groupFilter={groupFilter}
            query={query}
            onGroupFilter={setGroupFilter}
            onQuery={setQuery}
            onSave={handleSavePrediction}
            liveSync={liveSync}
          />
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
            predictions={predictions.filter((prediction) => prediction.createdBy === ctx?.userId)}
            answers={answers.filter((answer) => answer.createdBy === ctx?.userId)}
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
      </main>

      <nav className="tab-nav bottom-nav" aria-label="Điều hướng">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <footer className="app-footer">
        <span>Dữ liệu lịch: {DATA_SOURCE.label}</span>
        <a href={DATA_SOURCE.officialUrl} target="_blank" rel="noreferrer">FIFA</a>
        <span>BXH FIFA: {FIFA_RANKING_SOURCE.lastOfficialUpdate}</span>
        <a href={FIFA_RANKING_SOURCE.officialUrl} target="_blank" rel="noreferrer">Ranking</a>
      </footer>
    </div>
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
  predictionMap,
  dailyDoubleDownMap,
  groupFilter,
  query,
  onGroupFilter,
  onQuery,
  onSave,
  liveSync,
}) {
  const grouped = useMemo(() => groupByDate(matches), [matches]);
  const [showExtraGroups, setShowExtraGroups] = useState(false);
  const extraActive = EXTRA_GROUP_FILTERS.includes(groupFilter);

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Dự đoán tỉ số</p>
          <h2>72 trận vòng bảng</h2>
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
            className={showExtraGroups || extraActive ? 'active' : ''}
            onClick={() => setShowExtraGroups((value) => !value)}
          >
            {extraActive ? `+ Bảng ${groupFilter}` : '+ thêm'}
          </button>
        </div>
        {(showExtraGroups || extraActive) && (
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
                  dailyDoubleMatchNo={dailyDoubleDownMap.get(match.matchDay)}
                  onSave={onSave}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function LiveSyncStatus({ liveSync }) {
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
  const activeCount = scores.filter((score) => score.status === 'in_progress').length;
  const finishedCount = scores.filter((score) => score.status === 'finished').length;
  const fetchedLabel = liveSync?.fetchedAt ? formatRelativeSyncTime(liveSync.fetchedAt) : 'đang kết nối';
  const source = liveSync?.source ? sourceLabel(liveSync.source) : 'WorldCup26';
  const statusClass = liveSync?.error ? 'error' : activeCount > 0 ? 'active' : scores.length > 0 ? 'ready' : 'muted';
  const headline = liveSync?.error
    ? 'Chưa kết nối được nguồn tỉ số'
    : activeCount > 0
      ? `${activeCount} trận đang live`
      : scores.length > 0
        ? `${scores.length} trận đã đồng bộ`
        : 'Đang chờ dữ liệu trận';

  return (
    <section className={`live-score-panel ${statusClass}`} aria-label="Trạng thái live score">
      <div className="live-score-main">
        <span className="live-score-dot" aria-hidden="true" />
        <div>
          <p className="eyebrow">Live score</p>
          <h2>{headline}</h2>
          <p>
            Nguồn miễn phí: {source}
            {liveSync?.fallbackReason ? ' · ESPN fallback' : ''} · {fetchedLabel}
          </p>
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

function MatchCardPrototype({ match, prediction, dailyDoubleMatchNo, onSave }) {
  const locked = Date.now() >= new Date(match.kickoffAt).getTime();
  const finished = isFinished(match);
  const liveScore = shouldShowLiveScore(match) ? match.liveScore : null;
  const liveInProgress = liveScore?.status === 'in_progress';
  const liveFinished = liveScore?.status === 'finished';
  const isTodayMatchDay = match.matchDay === getLocalDateKey();
  const doubleDownReserved = !!dailyDoubleMatchNo && dailyDoubleMatchNo !== Number(match.matchNo);
  const [homePred, setHomePred] = useState(prediction?.homePred ?? 0);
  const [awayPred, setAwayPred] = useState(prediction?.awayPred ?? 0);
  const [doubleDown, setDoubleDown] = useState(prediction?.doubleDown ?? false);
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
  const canUseDoubleDown = !locked && isTodayMatchDay && !doubleDownReserved;

  function bumpScore(side, delta) {
    if (locked) return;
    const setter = side === 'home' ? setHomePred : setAwayPred;
    const current = side === 'home' ? homeScore : awayScore;
    setter(Math.max(0, Math.min(99, current + delta)));
  }

  return (
    <article className="match-card match-card--prototype">
      <div className="match-card-head">
        <span className="mstage">#{match.matchNo} · Vòng bảng · {match.group}</span>
        <span className={finished ? 'mtime done-time' : liveInProgress ? 'mtime live-time' : 'mtime'}>
          {finished ? 'Đã kết thúc' : liveInProgress ? liveLabel(liveScore) : formatTime(match.kickoffAt)}
        </span>
      </div>

      {finished || liveScore ? (
        <>
          <div className="fixture finished-fixture">
            <MatchTeam team={match.homeTeam} score={displayHomeScore} />
            <span className={liveInProgress ? 'ft-badge live-badge' : liveFinished ? 'ft-badge api-ft-badge' : 'ft-badge'}>
              {finished ? 'FT' : liveLabel(liveScore)}
            </span>
            <MatchTeam team={match.awayTeam} score={displayAwayScore} />
          </div>
          <div className="prediction-done">
            {finished && prediction ? (
              <>
                <span>Bạn dự <b>{prediction.homePred}-{prediction.awayPred}</b></span>
                <strong>
                  +{breakdown.total}đ{base === 5 ? ' tỉ số chính xác' : ''}{breakdown.upsetBonus ? ` · +${breakdown.upsetBonus} cửa dưới` : ''}
                </strong>
              </>
            ) : finished ? (
              <>
                <span>Chưa có dự đoán</span>
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
        </>
      ) : (
        <>
          <div className="fixture">
            <MatchTeam team={match.homeTeam} />
            <div className="score-stepper" aria-label="Dự đoán tỉ số">
              <div className="step-group">
                <button type="button" disabled={locked} onClick={() => bumpScore('home', -1)}>-</button>
                <span>{homeScore}</span>
                <button type="button" disabled={locked} onClick={() => bumpScore('home', 1)}>+</button>
              </div>
              <span className="score-sep">:</span>
              <div className="step-group">
                <button type="button" disabled={locked} onClick={() => bumpScore('away', -1)}>-</button>
                <span>{awayScore}</span>
                <button type="button" disabled={locked} onClick={() => bumpScore('away', 1)}>+</button>
              </div>
            </div>
            <MatchTeam team={match.awayTeam} />
          </div>

          <div className="match-actions compact-actions">
            <button
              type="button"
              className={`double-btn star-btn ${doubleDown ? 'active' : ''}`}
              disabled={!canUseDoubleDown}
              onClick={() => setDoubleDown((value) => !value)}
              title="Kèo tủ x2"
            >
              ★
            </button>
            <button type="button" className="primary-btn small" disabled={locked} onClick={() => onSave(match, { homePred: homeScore, awayPred: awayScore, doubleDown })}>
              Lưu dự đoán
            </button>
          </div>
          <p className="double-hint">
            {locked
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

function MatchTeam({ team, score = null }) {
  const meta = TEAM_META[team];
  return (
    <div className="match-team">
      <span className="match-flag" aria-label={`Cờ ${team}`}>
        {meta?.flagUrl ? <img src={meta.flagUrl} alt="" loading="lazy" /> : meta?.flag || team.slice(0, 2).toUpperCase()}
      </span>
      <strong>{displayTeamName(team)}</strong>
      {meta ? <small>FIFA #{meta.fifaRank}</small> : null}
      {score != null ? <b className="real-score">{score}</b> : null}
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
  return (
    <section className="score-history-panel" aria-label="Lịch sử cộng điểm">
      <div className="score-history-head">
        <div>
          <p className="section-label">Lịch sử cộng điểm</p>
          <h3>{total}đ</h3>
        </div>
        <div className="score-history-metrics" aria-label="Tóm tắt điểm">
          <span>{rank ? `#${rank}` : '-'}</span>
          <span>{predictedCount} đã dự</span>
          <span>{items.length} mục</span>
        </div>
      </div>

      <button className="secondary-btn score-history-toggle" type="button" onClick={onToggle} aria-expanded={isOpen}>
        {isOpen ? 'Ẩn lịch sử' : 'Xem lịch sử cộng điểm'}
      </button>

      {isOpen && (
        items.length === 0 ? (
          <p className="empty-state compact">Chưa có điểm cộng nào. Khi admin chốt kết quả, lịch sử sẽ hiện tại đây.</p>
        ) : (
          <div className="score-history-list">
            {items.map((item) => (
              <article key={item.key} className="score-history-row">
                <span className="score-history-type">{item.type}</span>
                <span className="score-history-copy">
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <b>+{item.points}đ</b>
              </article>
            ))}
          </div>
        )
      )}
    </section>
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
      if (!match || !isFinished(match)) return null;

      const breakdown = matchScoreBreakdown(prediction, match);
      if (breakdown.total <= 0) return null;

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
        type: upsetPoints ? 'Cửa dưới' : 'Trận',
        label: `#${match.matchNo} ${displayTeamName(match.homeTeam)} ${match.homeScore}-${match.awayScore} ${displayTeamName(match.awayTeam)}`,
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

function matchPointReason(base) {
  if (base === 5) return 'đúng tỉ số';
  if (base === 3) return 'đúng hiệu số';
  if (base === 2) return 'đúng kết quả';
  return '';
}

function RulesScreen() {
  return (
    <section className="screen rules">
      <p className="eyebrow">Luật chơi v1</p>
      <h2>Chơi nhẹ, thắng vui, có cớ ăn mừng.</h2>
      <div className="rules-grid">
        <Rule title="Điểm từng trận" body="Đúng tỉ số 5đ. Đúng đội thắng/hòa và đúng hiệu số 3đ. Chỉ đúng kết quả thắng/hòa/thua 2đ. Sai 0đ." />
        <Rule title="Bonus cửa dưới" body={`Nếu đoán đúng kết quả đội yếu hơn theo BXH FIFA tạo bất ngờ: chênh ${20}+ bậc được +1đ, ${40}+ bậc được +2đ. Hòa trước đội mạnh hơn ${30}+ bậc được +1đ.`} />
        <Rule title="Kèo tủ mỗi ngày" body="Mỗi người chỉ có 1 kèo tủ trong ngày thi đấu, và chỉ chọn được trong lượt trận của ngày đó." />
        <Rule title="Streak" body="Cứ 3 trận liên tiếp đúng tỉ số chính xác sẽ được cộng thêm 5đ." />
        <Rule title="Câu hỏi vui" body="Mỗi câu hỏi ngày thường có 2đ. Đây là phần kéo cả người không mê bóng đá vào chơi." />
        <Rule title="Chốt sổ" body="Dự đoán phải lưu trước giờ bóng lăn. Trễ trận nào thì trận đó 0đ, không phạt thêm." />
        <Rule title="Trao thưởng" body="Top 1, Top 2 và Top 3 sau 72 trận vòng bảng nhận thưởng theo kế hoạch của BTC." />
      </div>
    </section>
  );
}

function Rule({ title, body }) {
  return (
    <article className="rule-card">
      <h3>{title}</h3>
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

async function fetchLiveScores(token, workspaceId) {
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
  return {
    ...payload,
    matches: (payload.matches || []).map((match) => ({
      ...match,
      source: payload.source,
      fetchedAt: payload.fetchedAt,
    })),
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
      label: match.resultSource === 'worldcup26.ir' || match.resultSource === 'espn' || match.resultSource === 'api'
        ? 'FT API'
        : 'FT',
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

function liveLabel(liveScore) {
  if (!liveScore) return 'LIVE';
  if (liveScore.status === 'finished') return 'FT API';
  if (liveScore.status === 'in_progress') return liveScore.rawClock ? `LIVE ${liveScore.rawClock}` : 'LIVE';
  return 'LIVE';
}

function sourceLabel(source) {
  if (source === 'worldcup26.ir') return 'WorldCup26';
  if (source === 'espn') return 'ESPN';
  return source || 'live';
}
