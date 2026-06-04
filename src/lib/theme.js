// Mushy design tokens — JS export.
// Synced với superapp v3.0 (2026-05-31). Dùng khi cần tham chiếu màu/font
// trong JSX inline style hoặc logic (vd: animated chart, conditional color).
// Mọi class CSS đã được lib/theme.css import sẵn — chỉ dùng file này khi
// cần value động.
//
// Backward compat: token cũ KHÔNG xoá (mini-app legacy vẫn dùng pill button).
// Token mới v3 add thêm — opt-in.

export const colors = {
  // === Brand ===
  brand: '#E63946',                       // primary CTA, accent
  brandPressed: '#C92A39',
  brandSoft: '#FFE4E7',                   // tint nhạt cho badge/highlight
  brandWash: 'rgba(230, 57, 70, 0.07)',   // app icon container bg (v3)
  pink: '#FF6B81',
  pinkSoft: '#FFB3C1',

  // === Text — v3 dùng 3 shade fg / fgSecondary / muted ===
  ink: '#0F0F12',
  text: '#1A1A1F',
  fgSecondary: '#3C3C43',                 // v3 — secondary text (subtitles, labels)
  muted: '#6B6770',                       // legacy (caption/placeholder)
  mutedV3: '#8E8E93',                     // v3 muted iOS palette — opt-in mới
  // Placeholder mờ ~50% so với muted (2026-05-22).
  placeholder: 'rgba(107, 103, 112, 0.5)',
  hairline: 'rgba(15, 15, 18, 0.08)',
  hairlineStrong: 'rgba(15, 15, 18, 0.10)', // v3 — input border default

  // === Surfaces ===
  bg: '#FFF7F8',
  surface: '#FFFFFF',
  surfaceMuted: '#FBEEF0',

  // === Status — v3 dùng iOS palette (đồng nhất với superapp) ===
  success: '#34C759',                     // v3 (was #10B981)
  warn: '#FF9500',                        // v3 (was #F59E0B)
  danger: '#FF3B30',                      // v3 — khác brand red, dùng cho error toast
  info: '#007AFF',                        // v3 — new

  // === Legacy status (giữ cho compat) ===
  successLegacy: '#10B981',
  warnLegacy: '#F59E0B',
  dangerLegacy: '#E63946',
};

// Radii — v3 dùng rounded rect r14/r16 cho button/card, KHÔNG pill nữa cho
// CTA. Legacy pill (999) giữ cho badge/avatar pill. Mini-app dev chọn:
//   - radii.card (16) cho card mới — v3
//   - radii.button (999) — legacy pill, vẫn work
//   - radii.buttonV3 (14) — rounded rect — opt-in v3
export const radii = {
  xs: 6,
  sm: 8,
  md: 12,
  list: 14,
  lg: 16,
  xl: 16,
  hero: 20,
  modal: 24,
  card: 20,                  // legacy mini-app
  cardV3: 16,                // superapp v3
  button: 999,               // legacy pill
  buttonV3: 14,              // v3 rounded rect
  input: 999,                // legacy pill
  inputV3: 12,               // v3 rounded
  tile: 14,
  appIcon: 14,
  pill: 999,
};

export const space = {
  x0: 0, x1: 4, x2: 8, x3: 12, x4: 16, x5: 20, x6: 24, x7: 32, x8: 40, x9: 56,
};

// Fonts — v3 thêm Plus Jakarta Sans cho display (heading lớn, hero, stat
// numbers). Body giữ Be Vietnam Pro. Mini-app dev opt-in display khi có
// heading lớn / hero — bình thường body đủ.
export const fonts = {
  // Legacy + body (mọi mini-app vẫn dùng)
  body: "'Be Vietnam Pro', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",

  // v3 display (mới)
  display: "'Plus Jakarta Sans', 'Be Vietnam Pro', system-ui, sans-serif",
};

// Typography scale — v3 (size, lineHeight, weight). Match design-tokens.json
// + superapp lib/theme.js typeScale.
export const typeScale = {
  xs:   { size: 11, lineHeight: 14, weight: '500' },
  sm:   { size: 13, lineHeight: 18, weight: '400' },
  base: { size: 15, lineHeight: 22, weight: '400' },
  md:   { size: 17, lineHeight: 24, weight: '600' },
  lg:   { size: 20, lineHeight: 26, weight: '700' },
  xl:   { size: 24, lineHeight: 30, weight: '800' },
  xxl:  { size: 32, lineHeight: 38, weight: '800' },
};

// Shadow tokens — v3 nhẹ hơn legacy. Dùng cho inline style (CSS dùng
// --shadow-card đã có).
export const shadow = {
  card: '0 2px 12px rgba(15, 15, 18, 0.06)',
  cardElevated: '0 8px 32px rgba(15, 15, 18, 0.10)',
  button: '0 4px 12px rgba(201, 42, 57, 0.30)',
  press: '0 1px 6px rgba(15, 15, 18, 0.04)',
};
