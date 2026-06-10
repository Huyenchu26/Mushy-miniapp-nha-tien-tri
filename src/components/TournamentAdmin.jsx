import React, { useEffect, useMemo, useState } from 'react';
import Select from './Select.jsx';
import { useDialog } from './Dialog.jsx';
import { mushyApi } from '../lib/mushy-api.js';
import { track } from '../lib/analytics.js';
import { buildDailyRecap, nearestReminderMatch } from '../lib/app/engagement.js';
import {
  fetchMissingPredictionUserIds,
  resetTodayTriviaAnswers,
  resetWorkspaceLeaderboardData,
  saveOfficialMatch,
  saveTournamentConfig,
  syncTournamentSchedule,
} from '../lib/app/tournament-service.js';

export default function TournamentAdmin({ open, onClose, ctx, workspaceId, matches, standings, config, canManage = false, onChanged }) {
  const dialog = useDialog();
  const upcoming = useMemo(() => nearestReminderMatch(matches), [matches]);
  const todayKey = getLocalDateKey();
  const todayMatches = useMemo(
    () => matches
      .filter((match) => getMatchDateKey(match) === todayKey && !hasUnknownTeam(match))
      .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime()),
    [matches, todayKey]
  );
  const hypeMatches = useMemo(
    () => matches
      .filter((match) => !hasUnknownTeam(match))
      .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime()),
    [matches]
  );
  const [matchNo, setMatchNo] = useState(String(upcoming?.matchNo || matches[0]?.matchNo || ''));
  const [hypeMatchNo, setHypeMatchNo] = useState('');
  const [hypeTitle, setHypeTitle] = useState('Kèo hot hôm nay');
  const [hypeBody, setHypeBody] = useState('');
  const selected = matches.find((match) => String(match.matchNo) === String(matchNo));
  const hotMatchFallback = todayMatches[0] || upcoming || hypeMatches[0] || null;
  const hotMatch = hypeMatches.find((match) => String(match.matchNo) === String(hypeMatchNo)) || hotMatchFallback;
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

  useEffect(() => {
    if (!hypeMatchNo && hotMatchFallback?.matchNo) setHypeMatchNo(String(hotMatchFallback.matchNo));
  }, [hotMatchFallback?.matchNo, hypeMatchNo]);

  if (!open || !canManage) return null;

  const options = matches.map((match) => ({
    value: String(match.matchNo),
    label: `#${match.matchNo} · ${match.homeTeam} - ${match.awayTeam}`,
  }));
  const hypeOptions = hypeMatches.map((match) => ({
    value: String(match.matchNo),
    label: `#${match.matchNo} · ${match.homeTeam} - ${match.awayTeam} · ${formatAdminTime(match.kickoffAt)}`,
  }));

  async function run(key, action, success) {
    setBusy(key);
    try {
      const result = await action();
      await onChanged?.();
      await dialog.success('Đã cập nhật', typeof success === 'function' ? success(result) : success);
    } catch (error) {
      await dialog.error('Không thể cập nhật', error.message || 'Có lỗi xảy ra.');
    } finally {
      setBusy('');
    }
  }

  function handleSync() {
    return dialog.confirm(
      'Đồng bộ lịch 104 trận?',
      'Thao tác này ghi lịch static vào bảng runtime để bật privacy, knock-out và snapshot.',
      { confirmLabel: 'Đồng bộ', cancelLabel: 'Huỷ' }
    ).then((ok) => ok && run('sync', async () => {
      await syncTournamentSchedule({ workspaceId, userId: ctx.userId, matches });
      track('tournament_schedule_synced', { match_count: matches.length });
    }, 'Đã đồng bộ lịch 104 trận và mốc khóa giải.'));
  }

  function handleResult() {
    if (!selected || homeScore === '' || awayScore === '') return dialog.error('Thiếu tỷ số', 'Nhập đủ tỷ số hai đội.');
    return dialog.confirm(
      `Chốt kết quả trận #${selected.matchNo}?`,
      `${homeTeam} ${homeScore}-${awayScore} ${awayTeam}. Kết quả này sẽ trở thành snapshot chính thức để chấm điểm.`,
      { danger: true, confirmLabel: 'Chốt FT', cancelLabel: 'Huỷ' }
    ).then((ok) => ok && run('result', async () => {
      await saveOfficialMatch({ workspaceId, userId: ctx.userId, match: selected, result: { homeTeam, awayTeam, homeScore, awayScore } });
      track('official_result_saved', { match_no: selected.matchNo });
    }, `Đã chốt kết quả trận #${selected.matchNo}.`));
  }

  function handleConfig() {
    return dialog.confirm(
      'Lưu đáp án dài hạn?',
      'Các đáp án này sẽ được dùng để chấm điểm vô địch, vua phá lưới và đội gây sốc.',
      { danger: true, confirmLabel: 'Lưu đáp án', cancelLabel: 'Huỷ' }
    ).then((ok) => ok && run('config', async () => {
      await saveTournamentConfig({ workspaceId, userId: ctx.userId, config: {
        openingKickoffAt: config?.openingKickoffAt || matches[0]?.kickoffAt,
        championActual, topScorerActual, shockTeamActual,
        predictionsHiddenUntilKickoff: true,
        remindersEnabled: true,
      } });
      track('tournament_answers_saved');
    }, 'Đã lưu đáp án dài hạn và cấu hình giải.'));
  }

  function handleReminder() {
    if (!upcoming) return dialog.info('Không có trận sắp tới', 'Hiện chưa có trận hợp lệ để nhắc.');
    return dialog.confirm(
      `Nhắc người chưa dự trận #${upcoming.matchNo}?`,
      `Push chỉ gửi tới thành viên chưa dự ${upcoming.homeTeam} - ${upcoming.awayTeam}.`,
      { confirmLabel: 'Gửi nhắc', cancelLabel: 'Huỷ' }
    ).then((ok) => ok && run('reminder', async () => {
      const userIds = await fetchMissingPredictionUserIds(workspaceId, upcoming.matchNo);
      if (!userIds.length) throw new Error('Mọi thành viên đã dự trận gần nhất.');
      await mushyApi.push({
        title: 'Nhà Tiên Tri nhắc nhẹ',
        body: `Bạn chưa dự ${upcoming.homeTeam} - ${upcoming.awayTeam}. Vào chốt trước giờ bóng lăn.`,
        userIds,
        data: { appSlug: 'nha-tien-tri', kind: 'deadline_reminder', screen: 'match', matchNo: String(upcoming.matchNo) },
      });
      track('deadline_reminder_sent', { match_no: upcoming.matchNo, recipient_count: userIds.length });
    }, `Đã nhắc người chưa dự trận #${upcoming.matchNo}.`));
  }

  function handleRecap() {
    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const body = buildDailyRecap(standings, matches, dateKey);
    return dialog.confirm(
      'Gửi recap ngày?',
      body,
      { confirmLabel: 'Gửi recap', cancelLabel: 'Huỷ' }
    ).then((ok) => ok && run('recap', async () => {
      await mushyApi.push({
        title: 'Tổng kết Nhà Tiên Tri', body,
        data: { appSlug: 'nha-tien-tri', kind: 'daily_recap', screen: 'leaderboard' },
      });
      track('daily_recap_sent');
    }, 'Đã gửi tổng kết ngày tới workspace.'));
  }

  function handleHypePush() {
    if (!hotMatch) return dialog.info('Không có trận để gửi', 'Chưa tìm thấy trận phù hợp trong lịch.');
    const title = normalizePushText(hypeTitle, 60) || 'Kèo hot hôm nay';
    const body = normalizePushText(hypeBody, 240);
    if (!body) return dialog.error('Thiếu nội dung', 'Nhập nội dung kích war trước khi gửi.');

    return dialog.confirm(
      `Gửi kích war trận #${hotMatch.matchNo}?`,
      `${title}\n\n${body}`,
      { confirmLabel: 'Gửi noti', cancelLabel: 'Huỷ' }
    ).then((ok) => ok && run('hype', async () => {
      await mushyApi.push({
        title,
        body,
        data: {
          appSlug: 'nha-tien-tri',
          kind: 'daily_match_hype',
          screen: 'match',
          matchNo: String(hotMatch.matchNo),
        },
      });
      track('daily_match_hype_sent', { match_no: hotMatch.matchNo });
    }, `Đã gửi kích war trận #${hotMatch.matchNo} tới workspace.`));
  }

  function handleResetTodayTrivia() {
    return dialog.confirm(
      'Reset Hỏi vui hôm nay?',
      `Xoá toàn bộ câu trả lời Hỏi vui ngày ${todayKey} trong workspace hiện tại. Người chơi có thể trả lời lại câu hôm nay.`,
      { danger: true, confirmLabel: 'Reset Hỏi vui', cancelLabel: 'Huỷ' }
    ).then((ok) => ok && run('reset-trivia', async () => {
      const deletedCount = await resetTodayTriviaAnswers({ workspaceId, userId: ctx.userId, dateKey: todayKey });
      track('today_trivia_answers_reset', { date_key: todayKey, deleted_count: deletedCount });
      return deletedCount;
    }, (deletedCount) => `Đã xoá ${deletedCount} câu trả lời Hỏi vui hôm nay.`));
  }

  function handleResetLeaderboard() {
    return dialog.confirm(
      'Reset toàn bộ leaderboard workspace?',
      'Xoá dự đoán trận, câu trả lời và dự đoán dài hạn của workspace hiện tại. Thao tác này đưa điểm leaderboard của workspace về gần 0 và không thể hoàn tác từ app.',
      { danger: true, confirmLabel: 'Reset leaderboard', cancelLabel: 'Huỷ' }
    ).then((ok) => ok && run('reset-leaderboard', async () => {
      const summary = await resetWorkspaceLeaderboardData({ workspaceId, userId: ctx.userId });
      track('workspace_leaderboard_reset', summary);
      return summary;
    }, (summary) => (
      `Đã xoá ${summary.groupDailyAnswers} câu trả lời, ${summary.groupPredictions} dự đoán trận và ${summary.longTermBets} dự đoán dài hạn.`
    )));
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
            <div className="admin-hype-box">
              <b>Kích war trận hot</b>
              <small>{todayMatches.length ? `${todayMatches.length} trận hôm nay · có thể chọn bất kỳ trận nào` : 'Có thể gửi bất cứ lúc nào'}</small>
              <Select value={String(hotMatch?.matchNo || hypeMatchNo)} onChange={setHypeMatchNo} options={hypeOptions} placeholder="Chọn trận hot" />
              <input value={hypeTitle} onChange={(e) => setHypeTitle(e.target.value)} placeholder="Tiêu đề noti" maxLength={60} />
              <textarea
                value={hypeBody}
                onChange={(e) => setHypeBody(e.target.value)}
                placeholder="VD: Tây Ban Nha đang hụt hơi trước WC 2026? La Roja bước vào trận tổng duyệt cuối cùng..."
                maxLength={240}
                rows={4}
              />
              <button type="button" className="primary-btn" disabled={!!busy || !hypeMatches.length} onClick={handleHypePush}>{busy === 'hype' ? 'Đang gửi...' : 'Gửi kích war'}</button>
            </div>
            <button type="button" className="secondary-btn" disabled={!!busy} onClick={handleReminder}>Nhắc deadline</button>
            <button type="button" className="secondary-btn" disabled={!!busy} onClick={handleRecap}>Gửi recap ngày</button>
          </article>

          <article className="admin-card admin-danger-zone">
            <h3>Reset dữ liệu workspace</h3>
            <p>Chạy trực tiếp trong workspace hiện tại, có filter <code>workspace_id</code> và đi qua RLS. Không dùng tab Migrations.</p>
            <button type="button" className="secondary-btn danger" disabled={!!busy} onClick={handleResetTodayTrivia}>
              {busy === 'reset-trivia' ? 'Đang reset...' : 'Reset Hỏi vui hôm nay'}
            </button>
            <button type="button" className="secondary-btn danger" disabled={!!busy} onClick={handleResetLeaderboard}>
              {busy === 'reset-leaderboard' ? 'Đang reset...' : 'Reset leaderboard workspace'}
            </button>
          </article>
        </div>
      </section>
    </div>
  );
}

function getLocalDateKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

function getMatchDateKey(match) {
  return match?.matchDay || String(match?.kickoffAt || '').slice(0, 10);
}

function hasUnknownTeam(match) {
  return match?.homeTeam === 'Unknown' || match?.awayTeam === 'Unknown';
}

function formatAdminTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

function normalizePushText(value, maxLength) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…` : text;
}
