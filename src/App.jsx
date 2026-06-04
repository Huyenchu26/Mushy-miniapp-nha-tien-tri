import React, { useEffect, useMemo, useState } from 'react';
import { DAILY_QUESTIONS, DATA_SOURCE, GROUPS, MATCHES } from './lib/app/worldcup-data.js';
import { computeStandings, dailyPoints, isFinished, matchBasePoints, matchPoints } from './lib/app/scoring.js';
import { getContext } from './lib/context.js';
import { listMembers } from './lib/members.js';
import { db } from './lib/supabase.js';
import './App.css';

const DEFAULT_TAB = 'matches';
const TABS = [
  { id: 'matches', label: 'Trận đấu' },
  { id: 'daily', label: 'Câu hỏi' },
  { id: 'leaderboard', label: 'BXH' },
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
  const [members, setMembers] = useState([]);
  const [groupFilter, setGroupFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
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
  const standings = useMemo(
    () => buildStandings({ members, predictions, answers }),
    [members, predictions, answers]
  );
  const currentStanding = standings.find((row) => row.participantId === ctx?.userId);
  const filteredMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return MATCHES.filter((match) => {
      const groupOk = groupFilter === 'all' || match.group === groupFilter;
      const queryOk =
        !needle ||
        match.homeTeam.toLowerCase().includes(needle) ||
        match.awayTeam.toLowerCase().includes(needle);
      return groupOk && queryOk;
    });
  }, [groupFilter, query]);

  async function loadGameData() {
    setLoading(true);
    setError('');
    try {
      const [predictionRows, answerRows, memberRows] = await Promise.all([
        fetchPredictions(scope.workspaceId),
        fetchDailyAnswers(scope.workspaceId),
        listMembers(scope.workspaceId),
      ]);
      setPredictions(predictionRows);
      setAnswers(answerRows);
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

  if (ctxError) {
    return <SetupScreen error={ctxError} />;
  }

  return (
    <div className="wc-app">
      <header className="topbar">
        <button className="brand-lockup" type="button" onClick={() => setActiveTab('matches')}>
          <span className="brand-mark">26</span>
          <span>
            <strong>Nhà Tiên Tri</strong>
            <small>World Cup 2026</small>
          </span>
        </button>
        <div className="player-chip">
          <span>{ctx?.workspaceSlug || scope?.label || 'Mushy'}</span>
          <button type="button" onClick={loadGameData} disabled={loading}>
            Làm mới
          </button>
        </div>
      </header>

      <main>
        <section className="hero-band">
          <div className="hero-copy">
            <p className="eyebrow">Vòng bảng · 72 trận · Top 1/2/3 có thưởng</p>
            <h1>Dự tỉ số nhanh, giữ kèo tủ mỗi ngày, leo BXH cùng cả công ty.</h1>
            <div className="hero-stats" aria-label="Tóm tắt điểm">
              <Stat label="Hạng của bạn" value={currentStanding ? `#${currentStanding.rank}` : '-'} />
              <Stat label="Điểm" value={currentStanding?.total ?? 0} />
              <Stat label="Đã dự" value={predictionMap.size} />
            </div>
          </div>
          <img className="hero-photo" src="/mushy.png" alt="Linh vật Mushy tiên tri World Cup" />
        </section>

        {(notice || error || loading) && (
          <div className={`toast-line ${error ? 'error' : ''}`} role="status">
            {loading ? 'Đang tải dữ liệu...' : error || notice}
          </div>
        )}

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
          />
        )}
        {activeTab === 'daily' && (
          <DailyScreen questions={DAILY_QUESTIONS} answerMap={answerMap} onSave={handleSaveAnswer} />
        )}
        {activeTab === 'leaderboard' && (
          <LeaderboardScreen standings={standings} currentParticipantId={ctx?.userId} onRefresh={loadGameData} />
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

function MatchesScreen({ matches, predictionMap, dailyDoubleDownMap, groupFilter, query, onGroupFilter, onQuery, onSave }) {
  const grouped = useMemo(() => groupByDate(matches), [matches]);
  const [showExtraGroups, setShowExtraGroups] = useState(false);
  const extraActive = EXTRA_GROUP_FILTERS.includes(groupFilter);

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Dự đoán tỉ số</p>
          <h2>72 trận vòng bảng</h2>
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
                <MatchCard
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

function MatchCard({ match, prediction, dailyDoubleMatchNo, onSave }) {
  const locked = Date.now() >= new Date(match.kickoffAt).getTime();
  const isTodayMatchDay = match.matchDay === getLocalDateKey();
  const doubleDownReserved = !!dailyDoubleMatchNo && dailyDoubleMatchNo !== Number(match.matchNo);
  const [homePred, setHomePred] = useState(prediction?.homePred ?? 0);
  const [awayPred, setAwayPred] = useState(prediction?.awayPred ?? 0);
  const [doubleDown, setDoubleDown] = useState(prediction?.doubleDown ?? false);
  const base = matchBasePoints(prediction, match);
  const points = matchPoints(prediction, match);

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
          {prediction ? <strong>{points}đ{base === 5 ? ' · exact' : ''}</strong> : <strong>0đ</strong>}
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

function DailyScreen({ questions, answerMap, onSave }) {
  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Không cần giỏi bóng đá</p>
          <h2>Câu hỏi vui mỗi ngày</h2>
        </div>
      </div>
      <div className="question-list">
        {questions.map((question) => (
          <QuestionCard key={question.key} question={question} answer={answerMap.get(question.key)} onSave={onSave} />
        ))}
      </div>
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

function LeaderboardScreen({ standings, currentParticipantId, onRefresh }) {
  const podium = standings.slice(0, 3);

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Giải thưởng cuối vòng bảng</p>
          <h2>Bảng xếp hạng</h2>
        </div>
        <button className="secondary-btn" type="button" onClick={onRefresh}>Làm mới</button>
      </div>

      <div className="podium">
        {podium.map((row) => (
          <article key={row.participantId} className={`podium-card rank-${row.rank}`}>
            <span>#{row.rank}</span>
            <h3>{row.displayName}</h3>
            <strong>{row.total}đ</strong>
          </article>
        ))}
      </div>

      <div className="leaderboard-table">
        {standings.length === 0 ? (
          <p className="empty-state">Chưa có dự đoán nào. Mọi người mở app từ Mushy là chơi được ngay.</p>
        ) : (
          standings.map((row) => (
            <div key={row.participantId} className={`leader-row ${row.participantId === currentParticipantId ? 'me' : ''}`}>
              <span className="rank">#{row.rank}</span>
              <strong>{row.displayName}</strong>
              <span>{row.matchPts} trận</span>
              <span>{row.streakPts} streak</span>
              <span>{row.dailyPts} vui</span>
              <b>{row.total}đ</b>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function RulesScreen() {
  return (
    <section className="screen rules">
      <p className="eyebrow">Luật chơi v1</p>
      <h2>Chơi nhẹ, thắng vui, có cớ ăn mừng.</h2>
      <div className="rules-grid">
        <Rule title="Điểm từng trận" body="Đúng tỉ số 5đ. Đúng đội thắng/hòa và đúng hiệu số 3đ. Chỉ đúng kết quả thắng/hòa/thua 2đ. Sai 0đ." />
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

function Stat({ label, value }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function TeamRow({ team }) {
  return (
    <div className="team-row">
      <span className="team-dot">{team.slice(0, 2).toUpperCase()}</span>
      <strong>{team}</strong>
    </div>
  );
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

function buildStandings({ members, predictions, answers }) {
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
  });
}

function computeStandingsForUsers({ participants, predictions, dailyAnswers }) {
  return computeStandings({ participants, predictions, dailyAnswers, matches: MATCHES, questions: DAILY_QUESTIONS });
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

function normalizeScore(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 99) {
    throw new Error('Tỉ số phải là số từ 0 đến 99.');
  }
  return number;
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

function getLocalDateKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function shortTeam(team) {
  return team.length > 12 ? `${team.slice(0, 12)}...` : team;
}
