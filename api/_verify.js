// Helper dùng chung cho các Vercel Function:
// verify JWT từ Authorization header, trả về { userId, workspaceId, role, token }.
//
// KHÔNG dùng service_role — anon key + user JWT đủ:
//   - auth.getUser(token) verify signature qua /auth/v1/user (anon được phép).
//   - RLS trên workspace_members cho user đọc membership của chính họ.
//
// → Mini-app dev KHÔNG bao giờ cần SUPABASE_SERVICE_ROLE_KEY. Privileged ops
//   (push, cross-user query) đi qua superapp's mini-proxy gateway — xem
//   src/lib/mushy-api.js.
//
// Cross-workspace sharing (superapp mig 049):
//   Frontend gửi 2 header:
//     - X-Workspace-Id      = active scope (ws data đang thao tác — owner ws A)
//     - X-Home-Workspace-Id = ws user là member trực tiếp (= ctx.workspaceId)
//   _verify check: user phải là member trực tiếp của HOME ws, và nếu active
//   != home thì phải có app_share_grants(owner=active, follower=home, app=slug).
//   Role trả về = role ở HOME ws (user giữ role gốc khi thao tác scope shared).
//
//   Back-compat: nếu thiếu X-Home-Workspace-Id (mini-app cũ chưa update),
//   coi home = active (single-scope behavior, không support follower).
//
// Dùng:
//   import { verifyRequest } from './_verify.js';
//   export default async function handler(req, res) {
//     const ctx = await verifyRequest(req);
//     if (!ctx) return res.status(401).json({ error: 'unauthorized' });
//     ...
//   }

import { createClient } from '@supabase/supabase-js';
// JSON import attribute — Vercel bundler traces ESM imports, đảm bảo
// mushy.config.json được include vào deployment. Node 20.10+/22 hỗ trợ `with`.
import config from '../mushy.config.json' with { type: 'json' };

const SUPABASE_URL = config.supabase.url;
const ANON_KEY = config.supabase.anonKey;
const APP_SLUG = config.slug;

export async function verifyRequest(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const workspaceId = req.headers['x-workspace-id']; // active scope (target data ws)
  const homeWorkspaceId = req.headers['x-home-workspace-id'] || workspaceId; // back-compat
  if (!token || !workspaceId) return null;

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: u, error } = await client.auth.getUser(token);
  if (error || !u?.user) return null;

  // 1. User phải là member trực tiếp của HOME ws — đây là nơi lookup role.
  const { data: homeMember } = await client
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', homeWorkspaceId)
    .eq('user_id', u.user.id)
    .maybeSingle();
  if (!homeMember) return null;

  // 2. Active scope = home → user thao tác data của chính ws họ. Done.
  if (workspaceId === homeWorkspaceId) {
    return { userId: u.user.id, workspaceId, role: homeMember.role, token };
  }

  // 3. Active ≠ home → user đang thao tác data ws khác qua share.
  //    Verify có grant active → home cho app này.
  const { data: grant } = await client
    .from('app_share_grants')
    .select('id')
    .eq('owner_workspace_id', workspaceId)
    .eq('follower_workspace_id', homeWorkspaceId)
    .eq('app_slug', APP_SLUG)
    .maybeSingle();
  if (!grant) return null;

  // Role giữ từ home ws — follower thao tác trên data shared vẫn dùng role
  // họ có ở ws gốc (admin ở home → vẫn có quyền approve khi viết vào A; member
  // ở home → vẫn cần approve). Match logic App.jsx về isAdmin cho follower scope.
  return { userId: u.user.id, workspaceId, role: homeMember.role, token };
}
