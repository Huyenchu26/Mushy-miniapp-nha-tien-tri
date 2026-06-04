// Helper gọi superapp's mini-proxy gateway cho privileged op.
//
// CRUD bình thường → vẫn dùng `db.from(...)` (anon + user JWT + RLS).
// Privileged op (push, cross-user query, …) → qua đây.
//
// Sao không gọi thẳng send-push? Vì send-push yêu cầu service_role auth,
// mini-app không được cấp service_role. mini-proxy verify membership bằng
// user JWT rồi forward với service_role nội bộ.
//
// Usage:
//   import { mushyApi } from './lib/mushy-api.js';
//   await mushyApi.push({ title: 'Hello', body: 'Hi' });
//
//   // Gửi chỉ cho 1 số user trong workspace
//   await mushyApi.push({ title, body, userIds: ['uuid1', 'uuid2'] });
//
//   // Deep link payload — Shell open mini-app khi tap noti.
//   // `workspaceId` được auto-inject từ ctx (Shell cần verify membership +
//   // lookup workspace metadata trước khi mở app). `appSlug` BẮT BUỘC nếu
//   // muốn deeplink vào mini-app — thiếu sẽ chỉ về Mushy home.
//   // Convention khớp `superapp/lib/notification-router.js`.
//   await mushyApi.push({
//     title, body,
//     data: {
//       appSlug: 'lunch-plan',  // BẮT BUỘC cho deeplink
//       screen: 'detail',        // optional — Shell pass qua query
//       recordId: '...',         // optional
//     },
//   });

import config from '../../mushy.config.json';
import { getContext } from './context.js';
import { getActiveScope } from './sharing.js';

const BASE = `${config.supabase.url}/functions/v1/mini-proxy`;

async function call(action, payload) {
  const ctx = getContext();
  // workspaceId trong body = active scope (ws user đang thao tác). Khi user
  // đang xem data ws shared, active scope = owner ws → mini-proxy mở rộng
  // recipients sang followers; membership check chấp nhận caller là member
  // của 1 ws follower có grant tới active scope (superapp mig 049).
  const activeWsId = getActiveScope().workspaceId;
  if (!ctx.token) throw new Error('mushy-api: missing token in context');
  if (!activeWsId) throw new Error('mushy-api: missing active scope workspaceId');

  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Supabase Edge gateway require Authorization với JWT format hợp lệ. Đẩy
      // anon (HS256) vào đây — gateway happy. KHÔNG đặt user JWT (ES256/RS256)
      // ở Authorization vì gateway reject UNAUTHORIZED_INVALID_JWT_FORMAT kể
      // cả khi function deploy --no-verify-jwt (gateway vẫn JWKS-check kid).
      Authorization: `Bearer ${config.supabase.anonKey}`,
      apikey: config.supabase.anonKey,
      // User identity thật — function đọc + verify qua admin.auth.getUser.
      'X-Mushy-User-Token': ctx.token,
    },
    body: JSON.stringify({ action, workspaceId: activeWsId, ...payload }),
  });

  const json = await res.json().catch(() => ({ error: `non-JSON ${res.status}` }));
  if (!res.ok) {
    const err = new Error(`mini-proxy ${action}: ${json.error || res.statusText}`);
    err.status = res.status;
    err.detail = json;
    throw err;
  }
  return json;
}

export const mushyApi = {
  /**
   * Gửi push notification tới members của workspace hiện tại.
   * @param {object} opts
   * @param {string} opts.title
   * @param {string} opts.body
   * @param {object} [opts.data] - Deep link payload Shell đọc khi user tap noti.
   *   `workspaceId` auto-inject từ ctx (Shell cần để verify membership + switch
   *   workspace trước khi mở app). Thêm `appSlug` để mở thẳng mini-app, `screen`
   *   + `recordId` để pass qua query params. Override `workspaceId` nếu push
   *   cross-workspace (rare).
   *
   *   ⚠️ **`data.kind` (RECOMMENDED)** — event-type slug để user mute granular.
   *   Vd: `{ kind: 'answer_to_asker' }`, `{ kind: 'comment_reply' }`,
   *       `{ kind: 'deadline_reminder' }`. Snake_case, semantic, stable.
   *   Superapp lưu vào `user_notifications.kind` + cho phép user mute riêng
   *   từng kind (Settings → Thông báo). KHÔNG truyền `kind` → default
   *   'generic' → user chỉ mute được nguyên app, không phân loại event.
   * @param {string[]} [opts.userIds] - chỉ gửi cho subset members
   * @returns {Promise<{sent: number, tokens: number, cleaned: number, tickets: any[]}>}
   */
  push({ title, body, data = {}, userIds }) {
    return call('push', {
      title,
      body,
      // Deep link: data.workspaceId = active scope (owner ws khi user đang xem
      // data shared). Recipient là member của owner ws → tap noti → shell mở
      // mini-app trong scope đó OK. Recipient là member của follower ws → shell
      // không switch sang owner ws (user không phải member) → fall back sang
      // home ws + open app slug (active scope tự sync lại qua localStorage).
      data: { workspaceId: getActiveScope().workspaceId, ...data },
      userIds,
    });
  },
};
