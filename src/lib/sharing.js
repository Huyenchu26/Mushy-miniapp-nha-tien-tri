// Cross-workspace data sharing — client API + active scope state.
//
// Model (superapp mig 049 / project_cross_ws_sharing memory):
// - Workspace owner A gen mã 6 ký tự → ws follower B redeem → row được tạo
//   trong public.app_share_grants. Sau đó member của B có thể đọc + ghi
//   trực tiếp vào data có workspace_id = A.id (RLS qua public.can_access_app_data).
// - Multi-target: A có thể grant cho nhiều ws (B, C, D...). Re-share KHÔNG cho
//   phép (chỉ A grant). Follower KHÔNG delete được data của A.
// - "Active scope" = workspace user đang thao tác. Có thể là ws họ là member
//   trực tiếp, hoặc ws khác được share tới ws của họ. Mọi query/insert dùng
//   activeScope.workspaceId thay vì ctx.workspaceId.
//
// Use:
//   import { listAccessibleScopes, useActiveScope, generateShareCode,
//            redeemShareCode, listShareGrants, revokeShareGrant } from './sharing.js';
//
//   const scope = useActiveScope();           // React hook
//   db.from('tasks').select().eq('workspace_id', scope.workspaceId);

import { getPublicSupabase } from './supabase.js';
import { getContext } from './context.js';
import config from '../../mushy.config.json';
import React, { useEffect, useState, useSyncExternalStore } from 'react';

const APP_SLUG = config.slug;
const STORAGE_KEY_PREFIX = 'mushy.activeScope.';

// ╔════════════════════════════════════════════════════════════════╗
// ║ Server-side RPC wrappers                                       ║
// ╚════════════════════════════════════════════════════════════════╝

/**
 * Liệt kê mọi workspace user có thể "switch" vào trong mini-app này.
 *   - scopeKind='owner_member': ws user là member trực tiếp (data riêng)
 *   - scopeKind='follower':     ws X share data cho 1 ws của user
 *
 * @returns {Promise<Array<{
 *   workspaceId: string, workspaceName: string, workspaceSlug: string,
 *   scopeKind: 'owner_member'|'follower',
 *   viaFollowerWorkspaceId?: string, viaFollowerWorkspaceName?: string
 * }>>}
 */
export async function listAccessibleScopes() {
  const client = getPublicSupabase();
  const { data, error } = await client.rpc('list_accessible_workspaces', {
    p_app_slug: APP_SLUG,
  });
  if (error) throw new Error('listAccessibleScopes: ' + error.message);
  return (data || []).map((r) => ({
    workspaceId: r.workspace_id,
    workspaceName: r.workspace_name,
    workspaceSlug: r.workspace_slug,
    scopeKind: r.scope_kind,
    viaFollowerWorkspaceId: r.via_follower_workspace_id || undefined,
    viaFollowerWorkspaceName: r.via_follower_workspace_name || undefined,
  }));
}

/**
 * Gen mã share cho 1 ws owner. Caller phải là owner/admin của ws đó.
 * Mã 6 ký tự A-Z/2-9 (bỏ I/O/0/1), unique trong các mã chưa used.
 *
 * @param {{ ownerWorkspaceId?: string, expiresHours?: number }} [opts]
 *   ownerWorkspaceId default = ctx.workspaceId. expiresHours default = 24,
 *   0 = không hết hạn.
 * @returns {Promise<{ id: string, code: string, expiresAt: string|null }>}
 */
export async function generateShareCode({ ownerWorkspaceId, expiresHours = 24 } = {}) {
  const ctx = getContext();
  const wsId = ownerWorkspaceId || ctx.workspaceId;
  const client = getPublicSupabase();
  const { data, error } = await client.rpc('generate_app_share_code', {
    p_app_slug: APP_SLUG,
    p_owner_workspace_id: wsId,
    p_expires_hours: expiresHours,
  });
  if (error) throw new Error('generateShareCode: ' + error.message);
  return {
    id: data.id,
    code: data.code,
    expiresAt: data.expires_at,
    ownerWorkspaceId: data.owner_workspace_id,
  };
}

/**
 * Redeem mã share — tạo grant cho follower ws. Caller phải là owner/admin
 * của followerWorkspaceId. Trả grant info.
 *
 * @param {{ code: string, followerWorkspaceId?: string }} args
 *   followerWorkspaceId default = ctx.workspaceId.
 * @returns {Promise<{ id: string, ownerWorkspaceId: string, followerWorkspaceId: string }>}
 */
export async function redeemShareCode({ code, followerWorkspaceId } = {}) {
  if (!code) throw new Error('redeemShareCode: code required');
  const ctx = getContext();
  const wsId = followerWorkspaceId || ctx.workspaceId;
  const client = getPublicSupabase();
  const { data, error } = await client.rpc('redeem_app_share_code', {
    p_code: code.trim().toUpperCase(),
    p_follower_workspace_id: wsId,
  });
  if (error) throw new Error('redeemShareCode: ' + error.message);
  return {
    id: data.id,
    ownerWorkspaceId: data.owner_workspace_id,
    followerWorkspaceId: data.follower_workspace_id,
    grantedAt: data.granted_at,
  };
}

/**
 * Liệt kê grants liên quan tới 1 ws ở app này (cả phía owner + follower).
 *
 * @param {{ workspaceId?: string }} [opts] — default ctx.workspaceId
 * @returns {Promise<Array<{
 *   grantId: string, direction: 'as_owner'|'as_follower',
 *   ownerWorkspaceId: string, ownerWorkspaceName: string,
 *   followerWorkspaceId: string, followerWorkspaceName: string,
 *   grantedBy: string, grantedAt: string
 * }>>}
 */
export async function listShareGrants({ workspaceId } = {}) {
  const ctx = getContext();
  const wsId = workspaceId || ctx.workspaceId;
  const client = getPublicSupabase();
  const { data, error } = await client.rpc('list_app_share_grants', {
    p_app_slug: APP_SLUG,
    p_workspace_id: wsId,
  });
  if (error) throw new Error('listShareGrants: ' + error.message);
  return (data || []).map((r) => ({
    grantId: r.grant_id,
    direction: r.direction,
    ownerWorkspaceId: r.owner_workspace_id,
    ownerWorkspaceName: r.owner_workspace_name,
    followerWorkspaceId: r.follower_workspace_id,
    followerWorkspaceName: r.follower_workspace_name,
    grantedBy: r.granted_by,
    grantedAt: r.granted_at,
  }));
}

/**
 * Liệt kê ws user là owner hoặc admin (để chọn làm "nguồn share" hoặc
 * "đích nhận share"). Member thường KHÔNG xuất hiện ở đây — match với gate
 * role của RPC generate/redeem.
 *
 * ⚠️ PHẢI filter user_id = caller. RLS workspace_members (superapp mig 004)
 * cho phép xem workspace-mate (để hiện danh sách member ở UI khác) → query
 * không filter sẽ trả mọi admin/owner của mọi ws bạn ở, dẫn đến duplicate.
 *
 * @returns {Promise<Array<{ workspaceId: string, name: string, slug: string, role: 'owner'|'admin' }>>}
 */
export async function listMyAdminWorkspaces() {
  const ctx = getContext();
  if (!ctx.userId) return [];
  const client = getPublicSupabase();
  const { data, error } = await client
    .from('workspace_members')
    .select('role, workspaces!inner(id, name, slug, deleted_at)')
    .eq('user_id', ctx.userId)
    .in('role', ['owner', 'admin']);
  if (error) throw new Error('listMyAdminWorkspaces: ' + error.message);
  return (data || [])
    .filter((r) => r.workspaces && !r.workspaces.deleted_at)
    .map((r) => ({
      workspaceId: r.workspaces.id,
      name: r.workspaces.name,
      slug: r.workspaces.slug,
      role: r.role,
    }));
}

/**
 * Revoke 1 grant. Cho phép owner/admin của 1 trong 2 phía (owner ws hoặc
 * follower ws). Follower mất quyền truy cập tức thì.
 *
 * @param {string} grantId
 */
export async function revokeShareGrant(grantId) {
  if (!grantId) throw new Error('revokeShareGrant: grantId required');
  const client = getPublicSupabase();
  const { data, error } = await client.rpc('revoke_app_share', { p_grant_id: grantId });
  if (error) throw new Error('revokeShareGrant: ' + error.message);
  return data === true;
}

// ╔════════════════════════════════════════════════════════════════╗
// ║ Active scope — state management (localStorage per app)         ║
// ╚════════════════════════════════════════════════════════════════╝
//
// Persistance key: mushy.activeScope.{appSlug}.{userId}
// Value: { workspaceId, scopeKind, label } (label cached cho UX, server vẫn là source of truth)
//
// Default scope = ctx.workspaceId (ws user đang ở trong superapp shell).
// Khi user switch qua scope khác qua ScopeSwitcher, lưu lại để giữ across reload.

function storageKey() {
  const ctx = getContext();
  return STORAGE_KEY_PREFIX + APP_SLUG + '.' + (ctx.userId || 'anon');
}

function readStored() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey()) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(scope) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (scope == null) localStorage.removeItem(storageKey());
    else localStorage.setItem(storageKey(), JSON.stringify(scope));
  } catch { /* quota / private mode */ }
}

// Subscriber pattern cho useSyncExternalStore — đảm bảo mọi component dùng
// useActiveScope() re-render khi scope đổi.
const listeners = new Set();
function emitChange() { listeners.forEach((l) => l()); }
function subscribe(l) { listeners.add(l); return () => listeners.delete(l); }

let _cached = null; // { workspaceId, scopeKind, label }
function ensureCached() {
  if (_cached) return _cached;
  const stored = readStored();
  if (stored && stored.workspaceId) {
    _cached = stored;
    return _cached;
  }
  // Default: ctx.workspaceId (owner_member của chính user)
  const ctx = getContext();
  _cached = {
    workspaceId: ctx.workspaceId,
    scopeKind: 'owner_member',
    label: ctx.workspaceSlug || 'Riêng tôi',
  };
  return _cached;
}

/**
 * Đọc active scope hiện tại (không reactive). Dùng ngoài React component.
 * @returns {{ workspaceId: string, scopeKind: string, label: string }}
 */
export function getActiveScope() {
  return ensureCached();
}

/**
 * Set active scope. Default persist=true (write localStorage = user choice
 * stick across reload). Pass persist=false khi apply workspace default scope
 * lúc init — để mỗi lần load app fetch lại default từ server, không stick.
 *
 * @param {{ workspaceId: string, scopeKind: string, label: string }} scope
 * @param {{ persist?: boolean }} [opts]
 */
export function setActiveScope(scope, opts = {}) {
  if (!scope || !scope.workspaceId) throw new Error('setActiveScope: workspaceId required');
  _cached = { ...scope };
  if (opts.persist !== false) writeStored(_cached);
  emitChange();
}

/**
 * TRUE nếu user có manual choice trong localStorage (đã từng tap ScopeSwitcher
 * pick 1 scope). Dùng để quyết định có apply workspace default hay không.
 */
function hasStoredScope() {
  return !!readStored();
}

/**
 * Reset về ctx.workspaceId (ws default trong superapp shell).
 */
export function resetActiveScope() {
  _cached = null;
  writeStored(null);
  emitChange();
}

/**
 * React hook: subscribe vào active scope. Re-render khi scope đổi.
 * @returns {{ workspaceId: string, scopeKind: string, label: string }}
 */
export function useActiveScope() {
  return useSyncExternalStore(subscribe, ensureCached, ensureCached);
}

/**
 * React hook: fetch + cache danh sách scopes available (RAW — KHÔNG filter hidden).
 * Dùng cho admin UI quản lý hide (cần thấy cả hidden để unhide). Refetch
 * khi gọi refresh().
 *
 * @returns {{ scopes: Array, loading: boolean, error: Error|null, refresh: () => void }}
 */
export function useAccessibleScopes() {
  const [scopes, setScopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAccessibleScopes()
      .then((data) => { if (!cancelled) { setScopes(data); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [version]);
  return {
    scopes, loading, error,
    refresh: () => setVersion((v) => v + 1),
  };
}

/**
 * React hook: scopes VISIBLE (đã filter hidden) cho ScopeSwitcher.
 * Combine listAccessibleScopes + listHiddenScopes của ctx.workspaceId.
 *
 * @returns {{ scopes, hiddenIds: Set<string>, loading, error, refresh }}
 */
export function useVisibleScopes() {
  const [data, setData] = useState({ scopes: [], hiddenIds: new Set() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const ctx = getContext();
    Promise.all([listAccessibleScopes(), listHiddenScopes({ workspaceId: ctx.workspaceId })])
      .then(([scopes, hiddenArr]) => {
        if (cancelled) return;
        const hiddenIds = new Set(hiddenArr);
        // Filter mọi scope có workspace_id trong hidden list (kể cả own ws).
        // Default scope luôn unhidden bởi RPC gate ở mig 053.
        const visible = scopes.filter((s) => !hiddenIds.has(s.workspaceId));
        setData({ scopes: visible, hiddenIds });
        setError(null);
      })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [version]);
  return { ...data, loading, error, refresh: () => setVersion((v) => v + 1) };
}

// ╔════════════════════════════════════════════════════════════════╗
// ║ Workspace default scope (superapp mig 050)                      ║
// ╚════════════════════════════════════════════════════════════════╝
//
// Owner/admin của ws X set "khi mọi user của X mở mini-app này, mặc định
// load scope Y". Y phải = X HOẶC = 1 owner ws đã grant share cho X.
//
// Khi user mở app: nếu chưa có localStorage choice → load default từ server.
// Nếu user manual switch qua ScopeSwitcher → write localStorage → từ đó về sau
// dùng manual choice, KHÔNG follow default thay đổi.

/**
 * Đọc default scope của 1 ws cho mini-app này (qua RLS, mọi member đọc được).
 * @param {{ workspaceId?: string }} [opts] - default ctx.workspaceId
 * @returns {Promise<{ defaultOwnerWorkspaceId: string, setAt: string } | null>}
 */
export async function getWorkspaceDefaultScope({ workspaceId } = {}) {
  const ctx = getContext();
  const wsId = workspaceId || ctx.workspaceId;
  const client = getPublicSupabase();
  const { data, error } = await client
    .from('app_default_scopes')
    .select('default_owner_workspace_id, set_at')
    .eq('workspace_id', wsId)
    .eq('app_slug', APP_SLUG)
    .maybeSingle();
  if (error) throw new Error('getWorkspaceDefaultScope: ' + error.message);
  if (!data) return null;
  return {
    defaultOwnerWorkspaceId: data.default_owner_workspace_id,
    setAt: data.set_at,
  };
}

/**
 * Set default scope cho ws (owner/admin only — gate ở RPC).
 * defaultOwnerWorkspaceId phải = workspaceId HOẶC = ws đã grant cho workspaceId.
 *
 * @param {{ workspaceId?: string, defaultOwnerWorkspaceId: string }} args
 */
export async function setWorkspaceDefaultScope({ workspaceId, defaultOwnerWorkspaceId } = {}) {
  if (!defaultOwnerWorkspaceId) throw new Error('setWorkspaceDefaultScope: defaultOwnerWorkspaceId required');
  const ctx = getContext();
  const wsId = workspaceId || ctx.workspaceId;
  const client = getPublicSupabase();
  const { data, error } = await client.rpc('set_app_default_scope', {
    p_workspace_id: wsId,
    p_app_slug: APP_SLUG,
    p_default_owner_workspace_id: defaultOwnerWorkspaceId,
  });
  if (error) throw new Error('setWorkspaceDefaultScope: ' + error.message);
  return {
    defaultOwnerWorkspaceId: data.default_owner_workspace_id,
    setAt: data.set_at,
  };
}

/**
 * Ẩn 1 scope khỏi ScopeSwitcher của ws (owner/admin only). Scope phải ≠ default.
 * Grant không bị xoá — chỉ ẩn UI. Members vẫn còn tech quyền truy cập DB.
 *
 * @param {{ workspaceId?: string, hiddenOwnerWorkspaceId: string }} args
 */
export async function hideScope({ workspaceId, hiddenOwnerWorkspaceId } = {}) {
  if (!hiddenOwnerWorkspaceId) throw new Error('hideScope: hiddenOwnerWorkspaceId required');
  const ctx = getContext();
  const wsId = workspaceId || ctx.workspaceId;
  const client = getPublicSupabase();
  const { data, error } = await client.rpc('hide_app_scope', {
    p_workspace_id: wsId,
    p_app_slug: APP_SLUG,
    p_hidden_owner_workspace_id: hiddenOwnerWorkspaceId,
  });
  if (error) throw new Error('hideScope: ' + error.message);
  return data;
}

/**
 * Hiện lại 1 scope đã ẩn (owner/admin only).
 */
export async function unhideScope({ workspaceId, hiddenOwnerWorkspaceId } = {}) {
  if (!hiddenOwnerWorkspaceId) throw new Error('unhideScope: hiddenOwnerWorkspaceId required');
  const ctx = getContext();
  const wsId = workspaceId || ctx.workspaceId;
  const client = getPublicSupabase();
  const { data, error } = await client.rpc('unhide_app_scope', {
    p_workspace_id: wsId,
    p_app_slug: APP_SLUG,
    p_hidden_owner_workspace_id: hiddenOwnerWorkspaceId,
  });
  if (error) throw new Error('unhideScope: ' + error.message);
  return data === true;
}

/**
 * List scope đang ẩn của 1 ws (mọi member đọc được qua RLS — để
 * ScopeSwitcher filter).
 *
 * @returns {Promise<string[]>} array of hidden_owner_workspace_id
 */
export async function listHiddenScopes({ workspaceId } = {}) {
  const ctx = getContext();
  const wsId = workspaceId || ctx.workspaceId;
  const client = getPublicSupabase();
  const { data, error } = await client
    .from('app_hidden_scopes')
    .select('hidden_owner_workspace_id')
    .eq('workspace_id', wsId)
    .eq('app_slug', APP_SLUG);
  if (error) throw new Error('listHiddenScopes: ' + error.message);
  return (data || []).map((r) => r.hidden_owner_workspace_id);
}

/**
 * Bỏ default scope của 1 ws (owner/admin only).
 */
export async function unsetWorkspaceDefaultScope({ workspaceId } = {}) {
  const ctx = getContext();
  const wsId = workspaceId || ctx.workspaceId;
  const client = getPublicSupabase();
  const { data, error } = await client.rpc('unset_app_default_scope', {
    p_workspace_id: wsId,
    p_app_slug: APP_SLUG,
  });
  if (error) throw new Error('unsetWorkspaceDefaultScope: ' + error.message);
  return data === true;
}

/**
 * React hook: chạy 1 lần lúc App mount, apply workspace default scope nếu:
 *   - User chưa có manual choice trong localStorage
 *   - Server có set default cho ctx.workspaceId + app
 *   - Default scope vẫn còn truy cập được (có trong listAccessibleScopes)
 *
 * Gọi 1 lần ở top của App.jsx (sau khi getContext() OK).
 */
export function useDefaultScopeInitializer() {
  const initialized = React.useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    // User đã từng switch tay → tôn trọng, không override
    if (hasStoredScope()) return;
    let cancelled = false;
    (async () => {
      try {
        const def = await getWorkspaceDefaultScope();
        if (!def || cancelled) return;
        // Default = ctx.workspaceId thì khỏi làm gì (đã là default rồi)
        const ctx = getContext();
        if (def.defaultOwnerWorkspaceId === ctx.workspaceId) return;
        // Cross-check accessible scopes để lấy label + verify còn quyền
        const scopes = await listAccessibleScopes();
        if (cancelled) return;
        const target = scopes.find((s) => s.workspaceId === def.defaultOwnerWorkspaceId);
        if (!target) return; // grant đã bị revoke, fall back ctx.workspaceId
        setActiveScope({
          workspaceId: target.workspaceId,
          scopeKind: target.scopeKind,
          label: target.workspaceName,
        }, { persist: false }); // KHÔNG persist — mỗi load re-check server
      } catch {
        // Lỗi network/server → silently fall back ctx.workspaceId
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ╔════════════════════════════════════════════════════════════════╗
// ║ Role gating hooks (UX layer — DB cũng gate qua RPC)             ║
// ╚════════════════════════════════════════════════════════════════╝

/**
 * React hook: TRUE nếu user là owner/admin của ÍT NHẤT 1 workspace.
 * Dùng để hide nút "Quản lý chia sẻ" cho member thường — họ không thao tác
 * được gì trong modal (gen/redeem đều cần admin/owner ở 1 trong 2 phía).
 */
export function useIsAnyWorkspaceAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    listMyAdminWorkspaces()
      .then((ws) => { if (!cancelled) setIsAdmin(ws.length > 0); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, []);
  return isAdmin;
}

/**
 * React hook: TRUE nếu user là owner/admin của workspaceId (default = ctx.workspaceId).
 * Dùng để gate tab "Mặc định" trong modal — chỉ admin/owner ws hiện tại mới
 * set được default scope cho ws đó.
 */
export function useIsCurrentWorkspaceAdmin(workspaceId) {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const ctx = getContext();
    const targetWs = workspaceId || ctx.workspaceId;
    listMyAdminWorkspaces()
      .then((ws) => { if (!cancelled) setIsAdmin(ws.some((w) => w.workspaceId === targetWs)); })
      .catch(() => { if (!cancelled) setIsAdmin(false); });
    return () => { cancelled = true; };
  }, [workspaceId]);
  return isAdmin;
}
