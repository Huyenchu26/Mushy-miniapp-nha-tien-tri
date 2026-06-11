import React, { useEffect, useMemo, useState } from 'react';
import Select from './Select.jsx';
import { useDialog } from './Dialog.jsx';
import { mushyApi } from '../lib/mushy-api.js';
import { track } from '../lib/analytics.js';
import { TEAM_META, TEAM_OPTIONS, TOP_SCORER_OPTIONS, dateKeyInVietnamTimeZone } from '../lib/app/worldcup-data.js';
import { buildDailyRecap, nearestReminderMatch } from '../lib/app/engagement.js';
import {
  fetchMissingPredictionUserIds,
  saveManualPointAdjustment,
  saveOfficialMatch,
  saveTournamentConfig,
  syncTournamentSchedule,
} from '../lib/app/tournament-service.js';

export default function TournamentAdmin({ open, onClose, ctx, workspaceId, matches, members = [], standings, config, canManage = false, onChanged }) {
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
  const [youngPlayerActual, setYoungPlayerActual] = useState('');
  const [goldenBallActual, setGoldenBallActual] = useState('');
  const [adjustUserId, setAdjustUserId] = useState('');
  const [adjustMode, setAdjustMode] = useState('add');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
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
    setYoungPlayerActual(config?.youngPlayerActual || '');
    setGoldenBallActual(config?.goldenBallActual || '');
  }, [config]);

  useEffect(() => {
    if (!hypeMatchNo && hotMatchFallback?.matchNo) setHypeMatchNo(String(hotMatchFallback.matchNo));
  }, [hotMatchFallback?.matchNo, hypeMatchNo]);

  const options = matches.map((match) => ({
    value: String(match.matchNo),
    label: `#${match.matchNo} · ${match.homeTeam} - ${match.awayTeam}`,
  }));
  const hypeOptions = hypeMatches.map((match) => ({
    value: String(match.matchNo),
    label: `#${match.matchNo} · ${match.homeTeam} - ${match.awayTeam} · ${formatAdminTime(match.kickoffAt)}`,
  }));
  const teamOptions = useMemo(() => TEAM_OPTIONS.map((team) => ({
    value: team,
    label: `${TEAM_META[team]?.viName || team} · FIFA #${TEAM_META[team]?.fifaRank ?? '-'}`,
    icon: null,
  })), []);
  const playerOptions = useMemo(() => TOP_SCORER_OPTIONS.map((player) => ({
    value: player.value || player.name,
    label: `${player.label || player.name}${player.nationality ? ` · ${player.nationality}` : ''}`,
    icon: null,
    subLabel: player.nationality || player.team || '',
  })), []);
  const memberOptions = useMemo(() => buildMemberOptions({ members, standings, ctx }), [members, standings, ctx]);

  useEffect(() => {
    if (!adjustUserId && memberOptions[0]?.value) setAdjustUserId(memberOptions[0].value);
  }, [adjustUserId, memberOptions]);

  if (!open || !canManage) return null;

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
      'Các đáp án này sẽ được dùng để chấm điểm vô địch, vua phá lưới, cầu thủ trẻ xuất sắc nhất và Quả bóng vàng WORLD CUP.',
      { danger: true, confirmLabel: 'Lưu đáp án', cancelLabel: 'Huỷ' }
    ).then((ok) => ok && run('config', async () => {
      await saveTournamentConfig({ workspaceId, userId: ctx.userId, config: {
        openingKickoffAt: config?.openingKickoffAt || matches[0]?.kickoffAt,
        championActual,
        topScorerActual,
        youngPlayerActual,
        goldenBallActual,
        predictionsHiddenUntilKickoff: true,
        remindersEnabled: true,
      } });
      track('tournament_answers_saved');
    }, 'Đã lưu đáp án dài hạn và cấu hình giải.'));
  }

  function handleManualAdjustment() {
    const target = memberOptions.find((option) => option.value === adjustUserId);
    const amount = Math.trunc(Number(adjustAmount));
    if (!target) return dialog.error('Chưa chọn người chơi', 'Chọn một thành viên trước khi cộng/trừ điểm.');
    if (!Number.isInteger(amount) || amount <= 0) return dialog.error('Điểm chưa hợp lệ', 'Nhập số điểm nguyên lớn hơn 0.');
    const signedPoints = adjustMode === 'subtract' ? -amount : amount;
    const confirmLabel = signedPoints > 0 ? 'Cộng điểm' : 'Trừ điểm';
    const reason = normalizePushText(adjustReason, 180);

    return dialog.confirm(
      `${confirmLabel} cho ${target.label}?`,
      `${signedPoints > 0 ? '+' : ''}${signedPoints} điểm${reason ? ` · ${reason}` : ''}. Thao tác này sẽ được lưu vào lịch sử admin.`,
      { danger: signedPoints < 0, confirmLabel, cancelLabel: 'Huỷ' }
    ).then((ok) => ok && run('manual-points', async () => {
      await saveManualPointAdjustment({
        workspaceId,
        userId: ctx.userId,
        targetUserId: adjustUserId,
        deltaPoints: signedPoints,
        reason,
      });
      setAdjustAmount('');
      setAdjustReason('');
      track('manual_points_adjusted', { delta_points: signedPoints });
    }, `Đã ${signedPoints > 0 ? 'cộng' : 'trừ'} ${Math.abs(signedPoints)} điểm cho ${target.label}.`));
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
            <Select value={championActual} onChange={setChampionActual} options={teamOptions} placeholder="Đội vô địch" />
            <Select value={topScorerActual} onChange={setTopScorerActual} options={playerOptions} placeholder="Vua phá lưới" />
            <Select value={youngPlayerActual} onChange={setYoungPlayerActual} options={playerOptions} placeholder="Cầu thủ trẻ xuất sắc nhất" />
            <Select value={goldenBallActual} onChange={setGoldenBallActual} options={playerOptions} placeholder="Quả bóng vàng WORLD CUP" />
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

          <article className="admin-card admin-score-adjust-card">
            <h3>Sửa điểm cá nhân</h3>
            <p>Chọn thành viên, nhập số điểm rồi xác nhận cộng hoặc trừ. Mỗi lần chỉnh sẽ được ghi audit.</p>
            <Select value={adjustUserId} onChange={setAdjustUserId} options={memberOptions} placeholder="Chọn người chơi" />
            <div className="admin-toggle-row" role="group" aria-label="Kiểu sửa điểm">
              <button type="button" className={adjustMode === 'add' ? 'active' : ''} onClick={() => setAdjustMode('add')}>Cộng điểm</button>
              <button type="button" className={adjustMode === 'subtract' ? 'active' : ''} onClick={() => setAdjustMode('subtract')}>Trừ điểm</button>
            </div>
            <input type="number" min="1" step="1" value={adjustAmount} onChange={(event) => setAdjustAmount(event.target.value)} placeholder="Số điểm" />
            <textarea value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} placeholder="Lý do chỉnh điểm" rows={3} maxLength={180} />
            <button type="button" className="primary-btn" disabled={!!busy || !memberOptions.length} onClick={handleManualAdjustment}>
              {busy === 'manual-points' ? 'Đang lưu...' : adjustMode === 'subtract' ? 'Trừ điểm' : 'Cộng điểm'}
            </button>
          </article>
        </div>
      </section>
    </div>
  );
}

function buildMemberOptions({ members = [], standings = [], ctx }) {
  const byId = new Map();
  for (const member of members) {
    if (!member?.user_id) continue;
    byId.set(member.user_id, {
      value: member.user_id,
      label: member.full_name || `Người chơi ${String(member.user_id).slice(0, 4)}`,
    });
  }
  for (const row of standings) {
    if (!row?.participantId || byId.has(row.participantId)) continue;
    byId.set(row.participantId, {
      value: row.participantId,
      label: row.displayName || `Người chơi ${String(row.participantId).slice(0, 4)}`,
    });
  }
  if (ctx?.userId && !byId.has(ctx.userId)) {
    byId.set(ctx.userId, {
      value: ctx.userId,
      label: ctx.fullName || `Người chơi ${String(ctx.userId).slice(0, 4)}`,
    });
  }
  return [...byId.values()].sort((a, b) => String(a.label).localeCompare(String(b.label), 'vi'));
}

function getLocalDateKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

function getMatchDateKey(match) {
  return match?.matchDay || dateKeyInVietnamTimeZone(match?.kickoffAt);
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
