import React, { useEffect, useMemo, useState } from 'react';
import Select from './Select.jsx';
import { useDialog } from './Dialog.jsx';
import { mushyApi } from '../lib/mushy-api.js';
import { track } from '../lib/analytics.js';
import { buildDailyRecap, nearestReminderMatch } from '../lib/app/engagement.js';
import {
  fetchMissingPredictionUserIds,
  saveOfficialMatch,
  saveTournamentConfig,
  syncTournamentSchedule,
} from '../lib/app/tournament-service.js';

export default function TournamentAdmin({ open, onClose, ctx, workspaceId, matches, standings, config, onChanged }) {
  const dialog = useDialog();
  const upcoming = useMemo(() => nearestReminderMatch(matches), [matches]);
  const [matchNo, setMatchNo] = useState(String(upcoming?.matchNo || matches[0]?.matchNo || ''));
  const selected = matches.find((match) => String(match.matchNo) === String(matchNo));
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [championActual, setChampionActual] = useState('');
  const [topScorerActual, setTopScorerActual] = useState('');
  const [shockTeamActual, setShockTeamActual] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    setHomeScore(selected?.homeScore ?? '');
    setAwayScore(selected?.awayScore ?? '');
    setHomeTeam(selected?.homeTeam || '');
    setAwayTeam(selected?.awayTeam || '');
  }, [selected?.matchNo, selected?.homeScore, selected?.awayScore, selected?.homeTeam, selected?.awayTeam]);

  useEffect(() => {
    setChampionActual(config?.championActual || '');
    setTopScorerActual(config?.topScorerActual || '');
    setShockTeamActual(config?.shockTeamActual || '');
  }, [config]);

  if (!open) return null;

  const options = matches.map((match) => ({
    value: String(match.matchNo),
    label: `#${match.matchNo} · ${match.homeTeam} - ${match.awayTeam}`,
  }));

  async function run(key, action, success) {
    setBusy(key);
    try {
      await action();
      await onChanged?.();
      await dialog.success('Đã cập nhật', success);
    } catch (error) {
      await dialog.error('Không thể cập nhật', error.message || 'Có lỗi xảy ra.');
    } finally {
      setBusy('');
    }
  }

  function handleSync() {
    return run('sync', async () => {
      await syncTournamentSchedule({ workspaceId, userId: ctx.userId, matches });
      track('tournament_schedule_synced', { match_count: matches.length });
    }, 'Đã đồng bộ lịch 104 trận và mốc khóa giải.');
  }

  function handleResult() {
    if (!selected || homeScore === '' || awayScore === '') return dialog.error('Thiếu tỷ số', 'Nhập đủ tỷ số hai đội.');
    return run('result', async () => {
      await saveOfficialMatch({ workspaceId, userId: ctx.userId, match: selected, result: { homeTeam, awayTeam, homeScore, awayScore } });
      track('official_result_saved', { match_no: selected.matchNo });
    }, `Đã chốt kết quả trận #${selected.matchNo}.`);
  }

  function handleConfig() {
    return run('config', async () => {
      await saveTournamentConfig({ workspaceId, userId: ctx.userId, config: {
        openingKickoffAt: config?.openingKickoffAt || matches[0]?.kickoffAt,
        championActual, topScorerActual, shockTeamActual,
        predictionsHiddenUntilKickoff: true,
        remindersEnabled: true,
      } });
      track('tournament_answers_saved');
    }, 'Đã lưu đáp án dài hạn và cấu hình giải.');
  }

  function handleReminder() {
    if (!upcoming) return dialog.info('Không có trận sắp tới', 'Hiện chưa có trận hợp lệ để nhắc.');
    return run('reminder', async () => {
      const userIds = await fetchMissingPredictionUserIds(workspaceId, upcoming.matchNo);
      if (!userIds.length) throw new Error('Mọi thành viên đã dự trận gần nhất.');
      await mushyApi.push({
        title: 'Nhà Tiên Tri nhắc nhẹ',
        body: `Bạn chưa dự ${upcoming.homeTeam} - ${upcoming.awayTeam}. Vào chốt trước giờ bóng lăn.`,
        userIds,
        data: { appSlug: 'nha-tien-tri', kind: 'deadline_reminder', screen: 'match', matchNo: String(upcoming.matchNo) },
      });
      track('deadline_reminder_sent', { match_no: upcoming.matchNo, recipient_count: userIds.length });
    }, `Đã nhắc người chưa dự trận #${upcoming.matchNo}.`);
  }

  function handleRecap() {
    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const body = buildDailyRecap(standings, matches, dateKey);
    return run('recap', async () => {
      await mushyApi.push({
        title: 'Tổng kết Nhà Tiên Tri', body,
        data: { appSlug: 'nha-tien-tri', kind: 'daily_recap', screen: 'leaderboard' },
      });
      track('daily_recap_sent');
    }, 'Đã gửi tổng kết ngày tới workspace.');
  }

  return (
    <div className="admin-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="admin-panel" role="dialog" aria-modal="true" aria-label="Trung tâm điều hành giải">
        <header><div><span className="date-chip">BTC</span><h2>Trung tâm điều hành</h2></div><button type="button" className="secondary-btn" onClick={onClose}>Đóng</button></header>

        <div className="admin-grid">
          <article className="admin-card">
            <h3>Lịch và dữ liệu chuẩn</h3>
            <p>Đồng bộ lịch static vào bảng runtime để bật privacy, knock-out và snapshot.</p>
            <button type="button" className="primary-btn" disabled={!!busy} onClick={handleSync}>{busy === 'sync' ? 'Đang đồng bộ...' : 'Đồng bộ 104 trận'}</button>
          </article>

          <article className="admin-card admin-result-card">
            <h3>Chốt kết quả chính thức</h3>
            <Select value={matchNo} onChange={setMatchNo} options={options} placeholder="Chọn trận" />
            <div className="admin-team-fields"><input value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} aria-label="Đội nhà" /><input value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} aria-label="Đội khách" /></div>
            <div className="admin-score-fields"><input type="number" min="0" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} aria-label="Tỷ số đội nhà" /><span>:</span><input type="number" min="0" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} aria-label="Tỷ số đội khách" /></div>
            <button type="button" className="primary-btn" disabled={!!busy} onClick={handleResult}>{busy === 'result' ? 'Đang chốt...' : 'Chốt snapshot FT'}</button>
          </article>

          <article className="admin-card">
            <h3>Đáp án dài hạn</h3>
            <input value={championActual} onChange={(e) => setChampionActual(e.target.value)} placeholder="Đội vô địch" />
            <input value={topScorerActual} onChange={(e) => setTopScorerActual(e.target.value)} placeholder="Vua phá lưới" />
            <input value={shockTeamActual} onChange={(e) => setShockTeamActual(e.target.value)} placeholder="Đội gây sốc" />
            <button type="button" className="primary-btn" disabled={!!busy} onClick={handleConfig}>{busy === 'config' ? 'Đang lưu...' : 'Lưu và chấm điểm'}</button>
          </article>

          <article className="admin-card">
            <h3>Tương tác</h3>
            <p>Nhắc riêng người chưa dự trận gần nhất hoặc gửi recap workspace.</p>
            <button type="button" className="secondary-btn" disabled={!!busy} onClick={handleReminder}>Nhắc deadline</button>
            <button type="button" className="secondary-btn" disabled={!!busy} onClick={handleRecap}>Gửi recap ngày</button>
          </article>
        </div>
      </section>
    </div>
  );
}
