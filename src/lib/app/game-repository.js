import { db } from '../supabase.js';

export async function fetchPredictions(workspaceId) {
  const { data, error } = await db.from('group_predictions').select('*')
    .eq('workspace_id', workspaceId).order('match_no', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapPrediction);
}

export async function fetchPredictionParticipants(workspaceId) {
  if (!workspaceId) return [];
  const { data, error } = await db.rpc('list_group_prediction_participants', {
    p_workspace_id: workspaceId,
  });
  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (error.code === '42883' || error.code === 'PGRST202' || message.includes('list_group_prediction_participants')) {
      return null;
    }
    throw error;
  }
  return (data || []).map(mapPredictionParticipant);
}

export async function fetchDailyAnswers(workspaceId) {
  const { data, error } = await db.from('group_daily_answers').select('*')
    .eq('workspace_id', workspaceId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapDailyAnswer);
}

export async function fetchMatchRoomMessages(workspaceId, matchNo) {
  const { data, error } = await db.from('match_room_messages').select('*')
    .eq('workspace_id', workspaceId).eq('match_no', matchNo)
    .order('created_at', { ascending: false }).limit(120);
  if (error) throw error;
  return [...(data || [])].reverse().map(mapRoomMessage);
}

export async function insertMatchRoomMessage({ workspaceId, createdBy, matchNo, kind, body, emoji }) {
  const { data, error } = await db.from('match_room_messages').insert({
    workspace_id: workspaceId, created_by: createdBy, match_no: matchNo, kind, body, emoji,
  }).select('*').single();
  if (error) throw error;
  return mapRoomMessage(data);
}

export async function fetchLongTermBet(workspaceId, userId) {
  if (!workspaceId || !userId) return null;
  const { data, error } = await db.from('long_term_bets').select('*')
    .eq('workspace_id', workspaceId).eq('created_by', userId).maybeSingle();
  if (error?.code === '42P01' || /long_term_bets|does not exist/i.test(error?.message || '')) return null;
  if (error) throw error;
  return data ? mapLongTermBet(data) : null;
}

export function mapPrediction(row) {
  return {
    id: row.id, workspaceId: row.workspace_id, createdBy: row.created_by,
    matchNo: row.match_no, matchDay: row.match_day,
    homePred: row.home_pred, awayPred: row.away_pred, doubleDown: row.double_down,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function mapPredictionParticipant(row) {
  return {
    matchNo: row.match_no,
    createdBy: row.user_id,
    predictedAt: row.predicted_at,
  };
}

export function mapDailyAnswer(row) {
  return {
    id: row.id, workspaceId: row.workspace_id, createdBy: row.created_by,
    questionKey: row.question_key, answer: row.answer,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function mapLongTermBet(row) {
  return {
    id: row.id, workspaceId: row.workspace_id, createdBy: row.created_by,
    champion: row.champion || '',
    topScorer: row.top_scorer || '',
    youngPlayer: row.young_player || '',
    goldenBall: row.golden_ball || '',
    shockTeam: row.shock_team || '',
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function mapRoomMessage(row) {
  return {
    id: row.id, workspaceId: row.workspace_id, createdBy: row.created_by,
    matchNo: row.match_no, kind: row.kind || 'chat', body: row.body || '', emoji: row.emoji || null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
