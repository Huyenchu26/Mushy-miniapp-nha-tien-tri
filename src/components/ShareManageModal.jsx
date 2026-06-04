// Modal "Quản lý chia sẻ" — 3 tab: Tạo mã / Nhận mã / Đang chia sẻ.
//
// Render khi user bấm "⚙ Quản lý chia sẻ" trong ScopeSwitcher dropdown.
//
// Gate role ở UI: chỉ ws user là owner/admin mới xuất hiện trong dropdown
// "nguồn"/"đích". Member thường mở modal sẽ thấy thông báo "Cần owner/admin".
// (DB cũng gate qua RPC — đây là layer UX, không phải security.)
//
// API:
//   <ShareManageModal open={open} onClose={() => setOpen(false)} />

import React, { useEffect, useState, useMemo } from 'react';
import Select from './Select.jsx';
import { useDialog } from './Dialog.jsx';
import { getContext } from '../lib/context.js';
import {
  generateShareCode,
  redeemShareCode,
  listShareGrants,
  revokeShareGrant,
  listMyAdminWorkspaces,
  listAccessibleScopes,
  getWorkspaceDefaultScope,
  setWorkspaceDefaultScope,
  unsetWorkspaceDefaultScope,
  listHiddenScopes,
  hideScope,
  unhideScope,
  useAccessibleScopes,
  useActiveScope,
  useIsCurrentWorkspaceAdmin,
} from '../lib/sharing.js';

const BASE_TABS = [
  { id: 'gen', label: '🔗 Tạo mã' },
  { id: 'redeem', label: '📥 Nhận mã' },
  { id: 'list', label: '📋 Đang chia sẻ' },
];
const ADMIN_TABS = [
  { id: 'default', label: '⚙ Mặc định' },
  { id: 'hide', label: '👁 Ẩn scope' },
];

const EXPIRE_OPTIONS = [
  { value: '1',   label: '1 giờ' },
  { value: '24',  label: '24 giờ (1 ngày)' },
  { value: '168', label: '168 giờ (1 tuần)' },
  { value: '0',   label: 'Không hết hạn' },
];

export default function ShareManageModal({ open, onClose }) {
  const [tab, setTab] = useState('gen');
  const [adminWs, setAdminWs] = useState([]);
  const [loadingAdminWs, setLoadingAdminWs] = useState(true);
  const dialog = useDialog();
  const activeScope = useActiveScope();
  // Tab Default + Hide chỉ hiện cho owner/admin của ws hiện tại (ctx.workspaceId)
  const isCurrentWsAdmin = useIsCurrentWorkspaceAdmin();
  const tabs = isCurrentWsAdmin ? [...BASE_TABS, ...ADMIN_TABS] : BASE_TABS;
  const { refresh: refreshScopes } = useAccessibleScopes();

  useEffect(() => {
    if (!open) return;
    setLoadingAdminWs(true);
    listMyAdminWorkspaces()
      .then(setAdminWs)
      .catch((e) => dialog.error('Không lấy được danh sách workspace', e.message))
      .finally(() => setLoadingAdminWs(false));
  }, [open]);

  if (!open) return null;

  const hasAdminWs = adminWs.length > 0;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 520, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, flex: 1 }}>
            Quản lý chia sẻ data
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
              opacity: 0.6, padding: 4,
            }}
            aria-label="Đóng"
          >×</button>
        </div>

        {!loadingAdminWs && !hasAdminWs && (
          <div
            style={{
              padding: 14, background: 'var(--bg)', borderRadius: 12,
              fontSize: 13, color: 'var(--ink)', marginBottom: 12,
            }}
          >
            ⚠️ Bạn không phải owner/admin của workspace nào. Chỉ owner/admin
            mới được tạo mã share hoặc nhận share. Nhờ admin workspace bạn cần.
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: '8px 4px',
                fontSize: 13,
                fontWeight: tab === t.id ? 700 : 500,
                background: tab === t.id ? 'var(--brand)' : 'transparent',
                color: tab === t.id ? '#fff' : 'var(--ink)',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'gen' && (
          <GenerateTab adminWs={adminWs} disabled={!hasAdminWs} dialog={dialog} />
        )}
        {tab === 'redeem' && (
          <RedeemTab
            adminWs={adminWs}
            disabled={!hasAdminWs}
            defaultWsId={activeScope.workspaceId}
            dialog={dialog}
            onRedeemed={refreshScopes}
          />
        )}
        {tab === 'list' && (
          <ListTab activeScope={activeScope} dialog={dialog} onChanged={refreshScopes} />
        )}
        {tab === 'default' && isCurrentWsAdmin && (
          <DefaultScopeTab dialog={dialog} />
        )}
        {tab === 'hide' && isCurrentWsAdmin && (
          <HideScopeTab dialog={dialog} onChanged={refreshScopes} />
        )}
      </div>
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════╗
// ║ Tab 1 — Tạo mã chia sẻ                                          ║
// ╚════════════════════════════════════════════════════════════════╝
function GenerateTab({ adminWs, disabled, dialog }) {
  const activeScope = useActiveScope();
  // Default = active scope nếu user là admin của nó, không thì ws đầu tiên
  const defaultWsId = useMemo(() => {
    if (adminWs.find((w) => w.workspaceId === activeScope.workspaceId)) {
      return activeScope.workspaceId;
    }
    return adminWs[0]?.workspaceId || '';
  }, [adminWs, activeScope.workspaceId]);

  const [wsId, setWsId] = useState(defaultWsId);
  const [expires, setExpires] = useState('24');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { setWsId(defaultWsId); }, [defaultWsId]);

  async function onGenerate() {
    if (!wsId) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await generateShareCode({
        ownerWorkspaceId: wsId,
        expiresHours: parseInt(expires, 10),
      });
      setResult(r);
    } catch (e) {
      await dialog.error('Tạo mã thất bại', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(result.code);
      await dialog.success('Đã copy', `Mã ${result.code} đã copy vào clipboard.`);
    } catch {
      await dialog.info('Mã chia sẻ', result.code);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0 }}>
        Tạo mã 6 ký tự để workspace khác nhập vào và đọc + ghi data của bạn cho mini-app này.
      </p>

      <label className="mushy-label">Workspace nguồn (data của bạn)</label>
      <Select
        value={wsId}
        onChange={setWsId}
        disabled={disabled || loading}
        options={adminWs.map((w) => ({ value: w.workspaceId, label: `${w.name} (${w.role})` }))}
        placeholder={disabled ? 'Không có workspace nào bạn là admin/owner' : '— Chọn —'}
      />

      <label className="mushy-label" style={{ marginTop: 12 }}>Thời hạn mã</label>
      <Select
        value={expires}
        onChange={setExpires}
        disabled={disabled || loading}
        options={EXPIRE_OPTIONS}
      />

      <button
        type="button"
        className="mushy-btn mushy-btn--primary mushy-btn--block"
        style={{ marginTop: 16 }}
        disabled={disabled || loading || !wsId}
        onClick={onGenerate}
      >
        {loading ? 'Đang tạo…' : 'Tạo mã'}
      </button>

      {result && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: 'var(--bg)',
            borderRadius: 14,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>MÃ CHIA SẺ</div>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: 4,
              fontFamily: 'monospace',
              color: 'var(--brand)',
              marginBottom: 10,
            }}
          >
            {result.code}
          </div>
          {result.expiresAt && (
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 10 }}>
              Hết hạn: {new Date(result.expiresAt).toLocaleString('vi-VN')}
            </div>
          )}
          <button type="button" className="mushy-btn mushy-btn--ghost" onClick={onCopy}>
            📋 Copy
          </button>
        </div>
      )}
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════╗
// ║ Tab 2 — Nhận mã chia sẻ                                         ║
// ╚════════════════════════════════════════════════════════════════╝
function RedeemTab({ adminWs, disabled, defaultWsId, dialog, onRedeemed }) {
  // Default = active scope nếu user là admin của nó, không thì ws đầu tiên
  const initialWsId = useMemo(() => {
    if (adminWs.find((w) => w.workspaceId === defaultWsId)) return defaultWsId;
    return adminWs[0]?.workspaceId || '';
  }, [adminWs, defaultWsId]);

  const [wsId, setWsId] = useState(initialWsId);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { setWsId(initialWsId); }, [initialWsId]);

  async function onRedeem() {
    if (!wsId || !code.trim()) return;
    setLoading(true);
    try {
      await redeemShareCode({ code: code.trim(), followerWorkspaceId: wsId });
      await dialog.success(
        'Đã nhận chia sẻ',
        `Workspace của bạn giờ đọc + ghi được data của workspace nguồn. Đóng dialog và switch scope ở header để vào.`,
      );
      setCode('');
      onRedeemed?.();
    } catch (e) {
      await dialog.error('Nhận mã thất bại', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0 }}>
        Nhập mã 6 ký tự bạn nhận được. Workspace bạn chọn sẽ đọc + ghi được data của workspace tạo mã.
      </p>

      <label className="mushy-label">Workspace nhận (bạn sẽ thao tác từ đây)</label>
      <Select
        value={wsId}
        onChange={setWsId}
        disabled={disabled || loading}
        options={adminWs.map((w) => ({ value: w.workspaceId, label: `${w.name} (${w.role})` }))}
        placeholder={disabled ? 'Không có workspace nào bạn là admin/owner' : '— Chọn —'}
      />

      <label className="mushy-label" style={{ marginTop: 12 }}>Mã chia sẻ</label>
      <input
        type="text"
        className="mushy-input"
        placeholder="VD: ABC234"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
        disabled={disabled || loading}
        maxLength={10}
        style={{
          fontFamily: 'monospace',
          fontSize: 18,
          letterSpacing: 2,
          textAlign: 'center',
        }}
      />

      <button
        type="button"
        className="mushy-btn mushy-btn--primary mushy-btn--block"
        style={{ marginTop: 16 }}
        disabled={disabled || loading || !wsId || code.trim().length < 4}
        onClick={onRedeem}
      >
        {loading ? 'Đang nhận…' : 'Nhận chia sẻ'}
      </button>
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════╗
// ║ Tab 3 — Đang chia sẻ (list grants + revoke)                     ║
// ╚════════════════════════════════════════════════════════════════╝
function ListTab({ activeScope, dialog, onChanged }) {
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setLoading(true);
    listShareGrants({ workspaceId: activeScope.workspaceId })
      .then(setGrants)
      .catch((e) => dialog.error('Không lấy được danh sách share', e.message))
      .finally(() => setLoading(false));
  }, [activeScope.workspaceId, version]);

  async function onRevoke(grant) {
    const ok = await dialog.confirm(
      'Thu hồi chia sẻ?',
      grant.direction === 'as_owner'
        ? `Workspace "${grant.followerWorkspaceName}" sẽ mất quyền đọc + ghi data ngay lập tức.`
        : `Bạn sẽ mất quyền truy cập data của "${grant.ownerWorkspaceName}". Data ở yên không bị xoá.`,
      { danger: true, confirmLabel: 'Thu hồi', cancelLabel: 'Huỷ' },
    );
    if (!ok) return;
    try {
      await revokeShareGrant(grant.grantId);
      setVersion((v) => v + 1);
      onChanged?.();
    } catch (e) {
      await dialog.error('Thu hồi thất bại', e.message);
    }
  }

  if (loading) {
    return <div style={{ padding: 16, fontSize: 13, opacity: 0.6 }}>Đang tải…</div>;
  }

  const asOwner = grants.filter((g) => g.direction === 'as_owner');
  const asFollower = grants.filter((g) => g.direction === 'as_follower');

  if (grants.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: 13, opacity: 0.7, textAlign: 'center' }}>
        Workspace <b>{activeScope.label}</b> chưa share / nhận share gì.
      </div>
    );
  }

  return (
    <div>
      {asOwner.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>
            Bạn đang share OUT ({asOwner.length})
          </div>
          {asOwner.map((g) => (
            <GrantRow key={g.grantId} grant={g} label={g.followerWorkspaceName} sub="đang xem data của bạn" onRevoke={onRevoke} />
          ))}
        </>
      )}
      {asFollower.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 }}>
            Bạn đang follow IN ({asFollower.length})
          </div>
          {asFollower.map((g) => (
            <GrantRow key={g.grantId} grant={g} label={g.ownerWorkspaceName} sub="bạn đang xem data của họ" onRevoke={onRevoke} />
          ))}
        </>
      )}
    </div>
  );
}

function GrantRow({ grant, label, sub, onRevoke }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: 'var(--bg)',
        borderRadius: 12,
        marginBottom: 6,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
          {sub} · từ {new Date(grant.grantedAt).toLocaleDateString('vi-VN')}
        </div>
      </div>
      <button
        type="button"
        className="mushy-btn mushy-btn--danger"
        style={{ padding: '6px 12px', fontSize: 12 }}
        onClick={() => onRevoke(grant)}
      >
        Thu hồi
      </button>
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════╗
// ║ Tab 4 — Default scope cho workspace hiện tại (owner/admin only) ║
// ╚════════════════════════════════════════════════════════════════╝
function DefaultScopeTab({ dialog }) {
  const ctx = getContext();
  const [scopes, setScopes] = useState([]); // option list: ctx ws + ws shared TO ctx ws
  const [currentDefault, setCurrentDefault] = useState(null); // workspaceId or null
  const [picked, setPicked] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [all, def] = await Promise.all([
        listAccessibleScopes(),
        getWorkspaceDefaultScope({ workspaceId: ctx.workspaceId }),
      ]);
      // Default options chỉ gồm: ctx.workspaceId (data riêng) + ws follower (ctx WS được share TO)
      const usable = all.filter(
        (s) =>
          s.workspaceId === ctx.workspaceId ||
          (s.scopeKind === 'follower' && s.viaFollowerWorkspaceId === ctx.workspaceId),
      );
      setScopes(usable);
      setCurrentDefault(def?.defaultOwnerWorkspaceId || null);
      setPicked(def?.defaultOwnerWorkspaceId || ctx.workspaceId);
    } catch (e) {
      await dialog.error('Không tải được', e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  async function onSave() {
    if (!picked) return;
    setSaving(true);
    try {
      await setWorkspaceDefaultScope({
        workspaceId: ctx.workspaceId,
        defaultOwnerWorkspaceId: picked,
      });
      await dialog.success(
        'Đã set default',
        'Mọi user của workspace này khi mở mini-app sẽ load scope đó đầu tiên (trừ khi họ đã tự switch tay).',
      );
      await refresh();
    } catch (e) {
      await dialog.error('Set default thất bại', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function onUnset() {
    const ok = await dialog.confirm(
      'Bỏ default scope?',
      'Mọi user của workspace sẽ load scope của workspace của họ khi mở app.',
      { danger: true, confirmLabel: 'Bỏ', cancelLabel: 'Huỷ' },
    );
    if (!ok) return;
    setSaving(true);
    try {
      await unsetWorkspaceDefaultScope({ workspaceId: ctx.workspaceId });
      await refresh();
    } catch (e) {
      await dialog.error('Bỏ default thất bại', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 16, fontSize: 13, opacity: 0.6 }}>Đang tải…</div>;
  }

  return (
    <div>
      <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0 }}>
        Set workspace nào mọi user của ws hiện tại sẽ thấy đầu tiên khi mở mini-app. Nếu user đã tự switch tay 1 lần, lựa chọn của họ sẽ override default.
      </p>

      <label className="mushy-label">Scope mặc định</label>
      <Select
        value={picked}
        onChange={setPicked}
        disabled={saving}
        options={scopes.map((s) => ({
          value: s.workspaceId,
          label:
            s.workspaceId === ctx.workspaceId
              ? `🏠 ${s.workspaceName} (data riêng)`
              : `⇆ ${s.workspaceName} (share)`,
        }))}
        placeholder="— Chọn scope —"
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          className="mushy-btn mushy-btn--primary"
          style={{ flex: 1 }}
          disabled={saving || !picked || picked === currentDefault}
          onClick={onSave}
        >
          {saving ? 'Đang lưu…' : (currentDefault ? 'Cập nhật' : 'Set default')}
        </button>
        {currentDefault && (
          <button
            type="button"
            className="mushy-btn mushy-btn--ghost"
            disabled={saving}
            onClick={onUnset}
          >
            Bỏ default
          </button>
        )}
      </div>

      {currentDefault && (
        <div
          style={{
            marginTop: 14,
            padding: 10,
            background: 'var(--bg)',
            borderRadius: 10,
            fontSize: 12,
            opacity: 0.75,
          }}
        >
          Default hiện tại: <b>{scopes.find((s) => s.workspaceId === currentDefault)?.workspaceName || currentDefault.slice(0, 8)}</b>
        </div>
      )}
    </div>
  );
}

// ╔════════════════════════════════════════════════════════════════╗
// ║ Tab 5 — Ẩn / hiện scope (owner/admin only)                      ║
// ╚════════════════════════════════════════════════════════════════╝
function HideScopeTab({ dialog, onChanged }) {
  const ctx = getContext();
  const [scopes, setScopes] = useState([]); // accessible scopes (raw + status hidden)
  const [hiddenIds, setHiddenIds] = useState(new Set());
  const [defaultId, setDefaultId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    setLoading(true);
    try {
      const [scopesList, hiddenArr, defObj] = await Promise.all([
        listAccessibleScopes(),
        listHiddenScopes({ workspaceId: ctx.workspaceId }),
        getWorkspaceDefaultScope({ workspaceId: ctx.workspaceId }),
      ]);
      // Candidates: follower scopes (ws khác share tới ctx ws) + own ws scope.
      // Mig 053 cho phép hide own ws (vd B pure follower của A, ẩn B để chỉ
      // hiện A trong switcher).
      const candidates = scopesList.filter(
        (s) => (s.scopeKind === 'follower' && s.viaFollowerWorkspaceId === ctx.workspaceId)
            || (s.scopeKind === 'owner_member' && s.workspaceId === ctx.workspaceId),
      );
      setScopes(candidates);
      setHiddenIds(new Set(hiddenArr));
      setDefaultId(defObj?.defaultOwnerWorkspaceId || null);
    } catch (e) {
      await dialog.error('Không tải được', e.message);
    } finally { setLoading(false); }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  async function toggle(scope) {
    const isHidden = hiddenIds.has(scope.workspaceId);
    const isDefault = defaultId === scope.workspaceId;
    if (!isHidden && isDefault) {
      await dialog.error(
        'Không thể ẩn',
        'Scope này đang là default. Đổi default sang scope khác (tab Mặc định) trước khi ẩn.',
      );
      return;
    }
    setBusyId(scope.workspaceId);
    try {
      if (isHidden) {
        await unhideScope({ workspaceId: ctx.workspaceId, hiddenOwnerWorkspaceId: scope.workspaceId });
      } else {
        await hideScope({ workspaceId: ctx.workspaceId, hiddenOwnerWorkspaceId: scope.workspaceId });
      }
      await refresh();
      onChanged?.();
    } catch (e) {
      await dialog.error(isHidden ? 'Hiện lại thất bại' : 'Ẩn thất bại', e.message);
    } finally { setBusyId(null); }
  }

  if (loading) {
    return <div style={{ padding: 16, fontSize: 13, opacity: 0.6 }}>Đang tải…</div>;
  }
  if (scopes.length === 0) {
    return (
      <p style={{ fontSize: 13, opacity: 0.7, textAlign: 'center', padding: '12px 0' }}>
        Workspace của bạn chưa nhận share từ ws khác. Không có scope nào để ẩn.
      </p>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0 }}>
        Ẩn / hiện scope cho members của workspace này trong ScopeSwitcher. Hidden scope vẫn còn share grant — chỉ ẩn UI. Default scope không thể ẩn.
      </p>
      {scopes.map((s) => {
        const isHidden = hiddenIds.has(s.workspaceId);
        const isDefault = defaultId === s.workspaceId;
        const busy = busyId === s.workspaceId;
        return (
          <div key={s.workspaceId} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', background: 'var(--bg)', borderRadius: 12,
            marginBottom: 6,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{s.workspaceName}</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                {s.scopeKind === 'owner_member' ? 'Workspace của bạn' : 'Chia sẻ từ ws khác'}
                {isDefault && ' · ⭐ Default'}
                {isHidden && ' · 🙈 Đang ẩn'}
              </div>
            </div>
            <button
              type="button"
              className={`mushy-btn ${isHidden ? 'mushy-btn--primary' : 'mushy-btn--ghost'}`}
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={() => toggle(s)}
              disabled={busy || (!isHidden && isDefault)}
              title={!isHidden && isDefault ? 'Đổi default trước khi ẩn' : ''}
            >
              {busy ? <span className="mushy-spinner" /> : (isHidden ? 'Hiện lại' : 'Ẩn')}
            </button>
          </div>
        );
      })}
    </div>
  );
}

