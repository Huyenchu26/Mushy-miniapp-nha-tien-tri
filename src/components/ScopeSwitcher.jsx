// Scope switcher — header dropdown để user chọn ws đang thao tác trong
// mini-app. Cần khi mini-app opt-in cross-workspace sharing (xem
// src/lib/sharing.js + superapp mig 049).
//
// 3 loại scope:
//   - owner_member: ws user là member trực tiếp (data riêng của ws đó)
//   - follower:     ws X share data sang 1 ws của user — user thao tác trên data của X
//
// API:
//   <ScopeSwitcher />     ← render gọn ở góc header
//   <ScopeSwitcher onManageGrants={() => ...} />
//
// Khi mini-app KHÔNG opt-in sharing: chỉ 1 scope (ctx.workspaceId) → component
// auto-collapse thành label chỉ-đọc, không hiển thị dropdown.

import React, { useEffect, useRef, useState } from 'react';
import {
  useActiveScope, setActiveScope, useVisibleScopes, useIsAnyWorkspaceAdmin,
} from '../lib/sharing.js';

const PANEL_MAX_H = 360;
const PANEL_GAP = 6;

export default function ScopeSwitcher({ onManageGrants }) {
  const active = useActiveScope();
  // Dùng useVisibleScopes (đã filter hidden via mig 051) — admin có thể ẩn
  // scope từ ShareManageModal tab "Ẩn scope".
  const { scopes, loading, error, refresh } = useVisibleScopes();
  const isAnyAdmin = useIsAnyWorkspaceAdmin();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState('down');
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  // Click ngoài đóng
  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Esc đóng
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Auto direction (down/up)
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDirection(spaceBelow < PANEL_MAX_H + PANEL_GAP + 24 && rect.top > spaceBelow ? 'up' : 'down');
  }, [open]);

  // Tự refresh khi mở dropdown (grants có thể đổi từ phía khác)
  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pick(scope) {
    setActiveScope({
      workspaceId: scope.workspaceId,
      scopeKind: scope.scopeKind,
      label: scope.workspaceName,
    });
    setOpen(false);
  }

  // Label hiển thị: nếu là follower, kèm "(từ Team X)"
  const activeLabel = active.label || active.workspaceId.slice(0, 8);
  const activeBadge = active.scopeKind === 'follower' ? '⇆ Chia sẻ' : null;

  // LUÔN click được để mở dropdown — kể cả khi single scope, vì dropdown
  // chứa entry point "⚙ Quản lý chia sẻ" (gen/redeem code). Disable theo
  // hasMultiple gây chicken-and-egg: user chưa nhận share → không vào được
  // modal để nhận share.
  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="mushy-btn mushy-btn--ghost"
        style={{
          padding: '8px 14px',
          fontSize: 14,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ fontWeight: 600 }}>{activeLabel}</span>
        {activeBadge && (
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              background: 'var(--brand)',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            {activeBadge}
          </span>
        )}
        <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            [direction === 'down' ? 'top' : 'bottom']: `calc(100% + ${PANEL_GAP}px)`,
            right: 0,
            minWidth: 260,
            maxHeight: PANEL_MAX_H,
            overflowY: 'auto',
            background: '#fff',
            borderRadius: 14,
            boxShadow: '0 10px 28px rgba(15,15,18,.18)',
            padding: 6,
            zIndex: 50,
          }}
        >
          {loading && (
            <div style={{ padding: 12, fontSize: 13, opacity: 0.7 }}>Đang tải scopes…</div>
          )}
          {error && (
            <div style={{ padding: 12, fontSize: 13, color: 'var(--brand)' }}>
              Lỗi: {error.message}
            </div>
          )}
          {!loading && !error && scopes.map((s) => {
            const isActive = s.workspaceId === active.workspaceId;
            return (
              <button
                key={s.workspaceId + ':' + s.scopeKind}
                type="button"
                onClick={() => pick(s)}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: isActive ? 'var(--bg)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 14,
                }}
              >
                <span style={{ fontSize: 16, lineHeight: '20px' }}>
                  {s.scopeKind === 'owner_member' ? '🏠' : '⇆'}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{s.workspaceName}</div>
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                    {s.scopeKind === 'owner_member'
                      ? 'Workspace của bạn'
                      : `Chia sẻ qua ${s.viaFollowerWorkspaceName || '—'}`}
                  </div>
                </span>
                {isActive && (
                  <span style={{ fontSize: 13, color: 'var(--brand)', fontWeight: 700 }}>✓</span>
                )}
              </button>
            );
          })}
          {onManageGrants && isAnyAdmin && (
            <button
              type="button"
              onClick={() => { setOpen(false); onManageGrants(); }}
              style={{
                display: 'block', width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--ink)',
                marginTop: 4,
                borderTop: '1px dashed rgba(15,15,18,.08)',
                textAlign: 'center',
              }}
            >
              ⚙ Quản lý chia sẻ
            </button>
          )}
        </div>
      )}
    </div>
  );
}
