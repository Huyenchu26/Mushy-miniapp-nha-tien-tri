import { db } from '../supabase.js';
import { dateKeyInVietnamTimeZone } from './worldcup-data.js';

export async function fetchTournamentState(workspaceId) {
  const [matchesResult, configResult, longTermResult, adjustmentResult, legacyDailyQuestionResult] = await Promise.all([
    db.from('matches').select('*').eq('workspace_id', workspaceId).order('match_no'),
    db.from('app_config').select('*').eq('workspace_id', workspaceId).maybeSingle(),
    db.from('long_term_bets').select('*').eq('workspace_id', workspaceId),
    db.from('manual_point_adjustments').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: true }),
    db.from('daily_questions').select('q_date, correct_answer').eq('workspace_id', workspaceId).not('correct_answer', 'is', null),
  ]);
  let config = configResult.error ? null : toAppConfig(configResult.data);
  const legacyDailyQuestionAnswers = tolerateOptional(legacyDailyQuestionResult).reduce((answers, row) => {
    const dateKey = String(row.q_date || '').slice(0, 10);
    const answer = clean(row.correct_answer);
    if (dateKey && answer) answers[`q-${dateKey}`] = answer;
    return answers;
  }, {});
  if (!config && Object.keys(legacyDailyQuestionAnswers).length) {
    config = { dailyQuestionAnswers: legacyDailyQuestionAnswers };
  } else if (config) {
    config.dailyQuestionAnswers = {
      ...legacyDailyQuestionAnswers,
      ...(config.dailyQuestionAnswers || {}),
    };
  }

  return {
    matches: tolerateMissing(matchesResult).map(toRuntimeMatch),
    config,
    longTermBets: tolerateMissing(longTermResult).map(toLongTermBet),
    manualAdjustments: tolerateMissing(adjustmentResult).map(toManualPointAdjustment),
  };
}

export async function syncTournamentSchedule({ workspaceId, userId, matches }) {
  const rows = matches.map((match) => ({
    workspace_id: workspaceId,
    created_by: userId,
    match_no: match.matchNo,
    stage: toDbStage(match.stage),
    group_label: match.group || null,
    home_team: match.homeTeam,
    away_team: match.awayTeam,
    kickoff_at: match.kickoffAt,
    status: match.status === 'finished' ? 'finished' : 'scheduled',
    home_score: match.status === 'finished' ? match.homeScore : null,
    away_score: match.status === 'finished' ? match.awayScore : null,
  }));
  const { error } = await db.from('matches').upsert(rows, { onConflict: 'workspace_id,match_no' });
  if (error) throw error;
  await ensureTournamentConfig({ workspaceId, userId, openingKickoffAt: matches[0]?.kickoffAt });
}

export async function ensureTournamentConfig({ workspaceId, userId, openingKickoffAt }) {
  const { error } = await db.from('app_config').upsert({
    workspace_id: workspaceId,
    created_by: userId,
    opening_kickoff_at: openingKickoffAt,
  }, { onConflict: 'workspace_id' });
  if (error) throw error;
}

export async function saveOfficialMatch({ workspaceId, userId, match, result }) {
  const payload = {
    workspace_id: workspaceId,
    created_by: userId,
    match_no: match.matchNo,
    stage: toDbStage(match.stage),
    group_label: match.group || null,
    home_team: result.homeTeam || match.homeTeam,
    away_team: result.awayTeam || match.awayTeam,
    kickoff_at: result.kickoffAt || match.kickoffAt,
    home_score: Number(result.homeScore),
    away_score: Number(result.awayScore),
    status: 'finished',
    result_source: result.resultSource || 'btc_manual',
    finish_type: result.finishType || null,
    status_detail: result.statusDetail || '',
    confirmed_at: new Date().toISOString(),
    confirmed_by: userId,
  };
  const { error } = await db.from('matches').upsert(payload, { onConflict: 'workspace_id,match_no' });
  if (error) throw error;
  await writeAudit({ workspaceId, userId, action: 'official_result_saved', entityType: 'match', entityKey: String(match.matchNo), afterData: payload });
}

export async function fetchMatchResultNotificationLogs({ workspaceId, matchNo, kind = 'match_result_scored' }) {
  const { data, error } = await db
    .from('match_result_notification_log')
    .select('target_user_id, notification_kind')
    .eq('workspace_id', workspaceId)
    .eq('match_no', Number(matchNo))
    .eq('notification_kind', kind);
  if (isMissingNotificationLogTable(error)) return null;
  if (error) throw error;
  return data || [];
}

export async function insertMatchResultNotificationLogs({ workspaceId, userId, rows }) {
  if (!rows?.length) return 0;
  const payload = rows.map((row) => ({
    workspace_id: workspaceId,
    created_by: userId,
    match_no: Number(row.matchNo),
    target_user_id: row.targetUserId,
    result_status: row.resultStatus,
    points: Number(row.points || 0),
    notification_kind: row.kind || 'match_result_scored',
  }));
  const { error } = await db
    .from('match_result_notification_log')
    .upsert(payload, { onConflict: 'workspace_id,match_no,target_user_id,notification_kind', ignoreDuplicates: true });
  if (isMissingNotificationLogTable(error)) return 0;
  if (error) throw error;
  return payload.length;
}

export async function saveTournamentConfig({ workspaceId, userId, config }) {
  const dailyQuestionAnswers = await mergeLatestDailyQuestionAnswers(
    workspaceId,
    config.dailyQuestionAnswers
  );
  const payload = {
    workspace_id: workspaceId,
    created_by: userId,
    opening_kickoff_at: config.openingKickoffAt,
    champion_actual: clean(config.championActual),
    top_scorer_actual: clean(config.topScorerActual),
    young_player_actual: clean(config.youngPlayerActual),
    golden_ball_actual: clean(config.goldenBallActual),
    daily_question_answers: dailyQuestionAnswers,
    predictions_hidden_until_kickoff: config.predictionsHiddenUntilKickoff !== false,
    reminders_enabled: config.remindersEnabled !== false,
  };
  const { error } = await db.from('app_config').upsert(payload, { onConflict: 'workspace_id' });
  if (error) throw error;
  await writeAudit({ workspaceId, userId, action: 'tournament_config_saved', entityType: 'config', entityKey: workspaceId, afterData: payload });
}

export async function saveDailyQuestionAnswer({ workspaceId, userId, question, answer, config = {}, matches = [] }) {
  const cleanAnswer = clean(answer);
  if (!cleanAnswer) throw new Error('Daily question answer is required.');

  try {
    const dailyQuestionAnswers = await mergeLatestDailyQuestionAnswers(workspaceId, {
      ...(config?.dailyQuestionAnswers || {}),
      [question.key]: cleanAnswer,
    });
    const payload = {
      workspace_id: workspaceId,
      created_by: userId,
      opening_kickoff_at: config?.openingKickoffAt || matches[0]?.kickoffAt || null,
      daily_question_answers: dailyQuestionAnswers,
    };
    const { error } = await db.from('app_config').upsert(payload, { onConflict: 'workspace_id' });
    if (error) throw error;
    await writeAudit({
      workspaceId,
      userId,
      action: 'daily_question_answer_saved',
      entityType: 'daily_question',
      entityKey: question.key,
      afterData: payload,
    });
    return { storage: 'app_config' };
  } catch (error) {
    if (!isDailyQuestionConfigUnavailable(error)) throw error;
  }

  await saveLegacyDailyQuestionAnswer({ workspaceId, userId, question, answer: cleanAnswer });
  await writeAudit({
    workspaceId,
    userId,
    action: 'daily_question_answer_saved',
    entityType: 'daily_question',
    entityKey: question.key,
    afterData: { questionKey: question.key, answer: cleanAnswer, storage: 'daily_questions' },
  });
  return { storage: 'daily_questions' };
}

export async function fetchMissingPredictionUserIds(workspaceId, matchNo) {
  const { data, error } = await db.rpc('list_missing_prediction_users', {
    p_workspace_id: workspaceId,
    p_match_no: Number(matchNo),
  });
  if (error) throw error;
  return (data || []).map((row) => row.user_id).filter(Boolean);
}

export async function saveManualPointAdjustment({ workspaceId, userId, targetUserId, deltaPoints, reason }) {
  const payload = {
    workspace_id: workspaceId,
    created_by: userId,
    target_user_id: targetUserId,
    delta_points: Number(deltaPoints),
    reason: clean(reason) || null,
  };
  const { data, error } = await db.from('manual_point_adjustments').insert(payload).select('*').single();
  if (error) throw error;
  await writeAudit({
    workspaceId,
    userId,
    action: 'manual_points_adjusted',
    entityType: 'leaderboard',
    entityKey: targetUserId,
    afterData: payload,
  });
  return toManualPointAdjustment(data);
}

export async function resetTodayTriviaAnswers({ workspaceId, userId, dateKey }) {
  const { count, error } = await db
    .from('group_daily_answers')
    .delete({ count: 'exact' })
    .eq('workspace_id', workspaceId)
    .like('question_key', `trivia-${dateKey}-%`);
  if (error) throw error;

  await writeAudit({
    workspaceId,
    userId,
    action: 'today_trivia_answers_reset',
    entityType: 'daily_answers',
    entityKey: dateKey,
    afterData: { dateKey, deletedCount: count || 0 },
  });
  return count || 0;
}

export async function resetWorkspaceLeaderboardData({ workspaceId, userId }) {
  const [answers, predictions, longTerm] = await Promise.all([
    db.from('group_daily_answers').delete({ count: 'exact' }).eq('workspace_id', workspaceId),
    db.from('group_predictions').delete({ count: 'exact' }).eq('workspace_id', workspaceId),
    db.from('long_term_bets').delete({ count: 'exact' }).eq('workspace_id', workspaceId),
  ]);

  const error = answers.error || predictions.error || longTerm.error;
  if (error) throw error;

  const summary = {
    groupDailyAnswers: answers.count || 0,
    groupPredictions: predictions.count || 0,
    longTermBets: longTerm.count || 0,
  };
  await writeAudit({
    workspaceId,
    userId,
    action: 'workspace_leaderboard_reset',
    entityType: 'workspace',
    entityKey: workspaceId,
    afterData: summary,
  });
  return summary;
}

function writeAudit({ workspaceId, userId, action, entityType, entityKey, afterData }) {
  return db.from('admin_audit_log').insert({
    workspace_id: workspaceId,
    created_by: userId,
    action,
    entity_type: entityType,
    entity_key: entityKey,
    after_data: afterData,
  }).then(({ error }) => {
    if (!error) return;
    if (isMissingAuditLogTable(error) || isPermissionDenied(error)) {
      console.warn('Admin audit log skipped', error.message || error);
      return;
    }
    throw error;
  });
}

function tolerateMissing(result) {
  if (!result.error) return result.data || [];
  if (isMissingTable(result.error)) return [];
  throw result.error;
}

function tolerateOptional(result) {
  if (!result.error) return result.data || [];
  if (isMissingTable(result.error) || result.error.code === '42501' || /permission denied|violates row-level security/i.test(result.error.message || '')) return [];
  throw result.error;
}

function isMissingNotificationLogTable(error) {
  return isMissingTable(error) || /match_result_notification_log/i.test(error?.message || '');
}

function isMissingAuditLogTable(error) {
  return isMissingTable(error) || /admin_audit_log/i.test(error?.message || '');
}

function isPermissionDenied(error) {
  return error?.code === '42501' || /permission denied|violates row-level security/i.test(error?.message || '');
}

function isDailyQuestionConfigUnavailable(error) {
  const message = String(error?.message || '').toLowerCase();
  return isMissingTable(error)
    || error?.code === '42703'
    || error?.code === 'PGRST204'
    || (message.includes('app_config') && message.includes('does not exist'))
    || (message.includes('daily_question_answers') && (message.includes('column') || message.includes('schema cache')));
}

function isMissingTable(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || message.includes('does not exist')
    || (message.includes('could not find the table') && message.includes('schema cache'));
}

async function saveLegacyDailyQuestionAnswer({ workspaceId, userId, question, answer }) {
  const payload = {
    created_by: userId,
    prompt: question.prompt,
    options: question.options || null,
    correct_answer: answer,
    points: question.points || 2,
    closes_at: question.closesAt || null,
  };
  const updateResult = await db
    .from('daily_questions')
    .update(payload)
    .eq('workspace_id', workspaceId)
    .eq('q_date', question.date)
    .select('id');
  if (updateResult.error) throw updateResult.error;
  if (updateResult.data?.length) return;

  const { error } = await db.from('daily_questions').insert({
    ...payload,
    workspace_id: workspaceId,
    q_date: question.date,
  });
  if (error) throw error;
}

async function mergeLatestDailyQuestionAnswers(workspaceId, incomingAnswers) {
  const incoming = sanitizeDailyQuestionAnswers(incomingAnswers);
  const { data, error } = await db
    .from('app_config')
    .select('daily_question_answers')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;

  const latest = sanitizeDailyQuestionAnswers(data?.daily_question_answers);
  return { ...latest, ...incoming };
}

function toRuntimeMatch(row) {
  return {
    id: row.id,
    matchNo: Number(row.match_no),
    stage: fromDbStage(row.stage),
    group: row.group_label,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    kickoffAt: row.kickoff_at,
    matchDay: dateKeyInVietnamTimeZone(row.kickoff_at),
    homeScore: row.home_score,
    awayScore: row.away_score,
    status: row.status,
    resultSource: row.result_source || '',
    finishType: row.finish_type || null,
    statusDetail: row.status_detail || '',
    confirmedAt: row.confirmed_at || null,
  };
}

function toAppConfig(row) {
  if (!row) return null;
  return {
    openingKickoffAt: row.opening_kickoff_at,
    championActual: row.champion_actual || '',
    topScorerActual: row.top_scorer_actual || '',
    youngPlayerActual: row.young_player_actual || '',
    goldenBallActual: row.golden_ball_actual || '',
    shockTeamActual: row.shock_team_actual || '',
    dailyQuestionAnswers: row.daily_question_answers && typeof row.daily_question_answers === 'object'
      ? row.daily_question_answers
      : {},
    predictionsHiddenUntilKickoff: row.predictions_hidden_until_kickoff !== false,
    remindersEnabled: row.reminders_enabled !== false,
  };
}

function sanitizeDailyQuestionAnswers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, answer]) => [String(key || '').trim(), clean(answer)])
      .filter(([key, answer]) => key && answer)
  );
}

function toLongTermBet(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    champion: row.champion || '',
    topScorer: row.top_scorer || '',
    youngPlayer: row.young_player || '',
    goldenBall: row.golden_ball || '',
    shockTeam: row.shock_team || '',
  };
}

function toManualPointAdjustment(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    targetUserId: row.target_user_id,
    deltaPoints: Number(row.delta_points || 0),
    reason: row.reason || '',
    createdAt: row.created_at,
  };
}

function toDbStage(stage) {
  return ({ round32: 'r32', round16: 'r16', quarter: 'qf', semi: 'sf' })[stage] || stage;
}

function fromDbStage(stage) {
  return ({ r32: 'round32', r16: 'round16', qf: 'quarter', sf: 'semi' })[stage] || stage;
}

function clean(value) {
  const next = String(value || '').trim();
  return next || null;
}
