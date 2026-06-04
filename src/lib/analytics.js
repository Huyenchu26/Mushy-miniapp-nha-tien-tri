// PostHog analytics wrapper cho mini-app Mushy.
//
// - Init lazy: lần đầu gọi track()/initAnalytics() mới load posthog-js + connect.
// - Auto identify từ getContext() → distinct_id = userId. Mọi event tự gắn
//   workspace_id / app_slug / role / workspace_slug / dev_mode để PostHog
//   dashboard breakdown được mà không phải truyền lại mỗi event.
// - DEV (npm run dev local hoặc Vite DEV mode) → SKIP hoàn toàn, không bẩn data.
//   Chỉ bắn event khi chạy trong Shell (production native) hoặc Vercel preview/prod.
// - Group analytics: mọi event auto-associate với group 'workspace' = workspace_id
//   → dashboard có thể aggregate metric per-workspace (DAU per ws, retention ws…).
// - Shell cũng init PostHog với cùng project key + cùng userId → 1 user thống nhất
//   giữa native shell và mọi mini-app (không phải merge sau).
//
// Cấu hình: VITE_POSTHOG_KEY + VITE_POSTHOG_HOST trong .env (xem .env.example).
// Thiếu key → silent no-op (mini-app vẫn chạy bình thường).

import { getContext } from './context.js';
import config from '../../mushy.config.json';

// PostHog project key cho Mushy — PUBLIC key (phc_*) như Supabase anon key,
// commit OK. Override qua VITE_POSTHOG_KEY env var nếu cần PostHog project riêng.
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || 'phc_tkZg9VXN6p96cCdm9vpETEr2C7Vivd2PfpqFrA4Aym8d';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com';

// Chỉ tắt khi user chạy `npm run dev` local (Vite DEV server). Build production
// hoặc preview Vercel → enabled. Có thể override bằng VITE_POSTHOG_DEBUG=1 để
// test analytics local nếu cần.
const FORCE_ENABLE = import.meta.env.VITE_POSTHOG_DEBUG === '1';
const ENABLED = !!POSTHOG_KEY && (!import.meta.env.DEV || FORCE_ENABLE);

let _posthog = null;
let _initPromise = null;
let _superProps = null;

async function loadPosthog() {
  if (_posthog) return _posthog;
  const mod = await import('posthog-js');
  _posthog = mod.default || mod;
  return _posthog;
}

function buildSuperProps(ctx) {
  // Properties auto-gắn vào MỌI event. Không gồm userId — userId là distinct_id riêng.
  return {
    app_slug:       ctx.appSlug || _readSlugFromConfig(),
    workspace_id:   ctx.workspaceId || null,
    workspace_slug: ctx.workspaceSlug || null,
    role:           ctx.role || null,
    is_app_owner:   !!ctx.isAppOwner,
    user_dev_mode:  !!ctx.userDevMode,
    shell_version:  ctx.shellVersion || null,
    platform:       ctx.platform || (typeof window !== 'undefined' && window.ReactNativeWebView ? 'webview' : 'browser'),
  };
}

function _readSlugFromConfig() {
  // Fallback khi ctx chưa có appSlug (vd browser dev — Shell chưa inject).
  return config?.slug || null;
}

/**
 * Init PostHog lazy. Idempotent — gọi nhiều lần OK. Tự gọi lần đầu khi
 * trackEvent()/screenView() chạy nên thường KHÔNG cần gọi tay.
 *
 * Trả Promise resolve khi xong (caller có thể await để chắc init xong trước
 * khi bắn loạt event đầu).
 */
export function initAnalytics() {
  if (!ENABLED) return Promise.resolve(false);
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    let ctx;
    try { ctx = getContext(); } catch { ctx = {}; }

    const posthog = await loadPosthog();

    // Bootstrap distinctID + super props NGAY khi init — không chờ `loaded` callback.
    // Lý do (bug fix 2026-05-30): `loaded` chạy async sau khi PostHog hoàn tất
    // network/storage handshake. Trước đây register super props trong `loaded`
    // → mọi event fire TRƯỚC khi loaded xong (vd `app_opened` từ setTimeout(0))
    // không có super props (`app_slug`, `workspace_id`, …) → breakdown PostHog
    // theo `app_slug` chỉ thấy "shell" vì mini-app events thiếu prop này.
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false,        // bắn screen_view tay (SPA, history thường không trigger)
      capture_pageleave: true,        // tự bắn $pageleave khi unload → tính time-on-page
      disable_session_recording: true,
      person_profiles: 'identified_only', // KHÔNG tạo profile cho anonymous → tiết kiệm MAU quota
      // bootstrap: gắn distinctID + isIdentifiedID NGAY tại init → mọi event sau
      // điểm này (kể cả khi PostHog chưa load xong storage) tự có distinctID đúng
      // = userId Supabase, không bị anonymous → identified merge race.
      bootstrap: ctx.userId ? {
        distinctID: ctx.userId,
        isIdentifiedID: true,
      } : undefined,
    });

    // Register super props + identify NGAY (synchronous). PostHog queue method
    // calls internally cho tới khi script ready — gọi trước `loaded` an toàn.
    _superProps = buildSuperProps(ctx);
    posthog.register(_superProps);

    if (ctx.userId) {
      posthog.identify(ctx.userId, {
        email: ctx.email || undefined,
        workspace_id: ctx.workspaceId || undefined,
        role: ctx.role || undefined,
      });
    }
    if (ctx.workspaceId) {
      posthog.group('workspace', ctx.workspaceId, {
        name: ctx.workspaceName || ctx.workspaceSlug || undefined,
        slug: ctx.workspaceSlug || undefined,
      });
    }

    // app_opened SAU khi super props + identify đã register → event đầu tiên
    // mang đủ app_slug/workspace_id/role để breakdown PostHog hoạt động.
    try { posthog.capture('app_opened'); } catch { /* ignore */ }

    // Auto-bắn error khi window throw. KHÔNG over-capture stack-trace (privacy);
    // chỉ message + filename + line để debug rough.
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (e) => {
        try {
          posthog.capture('error', {
            error_message: String(e?.message || 'unknown'),
            error_source: e?.filename || null,
            error_line: e?.lineno || null,
          });
        } catch { /* ignore */ }
      });
      window.addEventListener('unhandledrejection', (e) => {
        try {
          posthog.capture('error', {
            error_message: String(e?.reason?.message || e?.reason || 'unhandled rejection'),
            error_type: 'unhandled_promise',
          });
        } catch { /* ignore */ }
      });
    }

    return true;
  })();

  return _initPromise;
}

/**
 * Bắn event tuỳ ý. Auto-init lần đầu. No-op nếu thiếu key hoặc DEV mode.
 *
 * @param {string} event — tên event snake_case (vd 'note_created', 'screen_view').
 * @param {object} [props] — properties bổ sung. Đã sẵn có super props (app_slug,
 *   workspace_id, role…) — chỉ truyền cái RIÊNG event này cần.
 */
export function trackEvent(event, props = {}) {
  if (!ENABLED) return;
  initAnalytics().then(() => {
    if (!_posthog) return;
    try { _posthog.capture(event, props); } catch (e) { console.warn('[analytics] capture failed:', e?.message); }
  });
}

/**
 * Bắn screen view. SPA navigation thường không trigger pageview → gọi tay
 * mỗi khi đổi route/screen.
 *
 * @param {string} name — tên screen (vd 'home', 'detail', 'settings').
 * @param {object} [props] — properties bổ sung (vd record_id).
 */
export function trackScreen(name, props = {}) {
  trackEvent('screen_view', { screen_name: name, ...props });
}

/**
 * Reset analytics state — gọi khi logout hoặc switch workspace để PostHog
 * không gán event mới vào user/workspace cũ. Identify lại sau đó.
 */
export function resetAnalytics() {
  if (!_posthog) return;
  try { _posthog.reset(); } catch { /* ignore */ }
  _initPromise = null;
  _superProps = null;
}

/**
 * Re-identify khi context đổi (vd switch workspace, refresh token). Idempotent.
 * Gọi sau khi getContext() trả giá trị mới.
 */
export function refreshIdentity() {
  if (!ENABLED || !_posthog) return;
  let ctx;
  try { ctx = getContext(); } catch { return; }
  if (ctx.userId) {
    _posthog.identify(ctx.userId, {
      workspace_id: ctx.workspaceId || undefined,
      role: ctx.role || undefined,
    });
  }
  if (ctx.workspaceId) {
    _posthog.group('workspace', ctx.workspaceId, {
      name: ctx.workspaceName || ctx.workspaceSlug || undefined,
      slug: ctx.workspaceSlug || undefined,
    });
  }
  _superProps = buildSuperProps(ctx);
  _posthog.register(_superProps);
}

// Convenience: short alias
export const track = trackEvent;
