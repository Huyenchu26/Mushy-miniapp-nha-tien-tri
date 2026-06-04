// Queue đơn giản: insert vào job_queue, subscribe broadcast `job_completed`.
//
// Pattern:
//   const jobId = await enqueue('process_image', { objectKey });
//   onJob(jobId, (result) => { ... });
//
// Backend: Edge Function poll job_queue → xử lý → broadcast `job_completed`
// với payload { jobId, status, result }.

import { getSupabase } from './supabase.js';
import { getActiveScope } from './sharing.js';
import { subscribeBroadcast } from './realtime.js';
import config from '../../mushy.config.json';

const slug = config.slug;

export async function enqueue(jobType, payload) {
  // workspace_id = active scope (ws đang thao tác) — khi user xem data shared,
  // job được enqueue dưới owner ws → backend worker xử lý + broadcast về owner
  // ws → mọi member của owner + follower ws đều nhận event qua subscribeToTable.
  const wsId = getActiveScope().workspaceId;
  const { data, error } = await getSupabase()
    .from('job_queue')
    .insert({
      workspace_id: wsId,
      app_slug: slug,
      job_type: jobType,
      payload,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export function onJob(jobId, callback) {
  const wsId = getActiveScope().workspaceId;
  return subscribeBroadcast('job_completed', wsId, (payload) => {
    if (payload.jobId === jobId) callback(payload);
  });
}
