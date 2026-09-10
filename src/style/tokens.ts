/**
 * Design tokens (JS mirror).
 *
 * Single source of truth for compile-time values is `src/uni.scss` (`$yp-*`),
 * exposed at runtime as CSS variables (`--yp-*`, see `src/style/index.scss`).
 * This file mirrors the color values for the few places that need a JS string:
 * component props such as `uv-tabs line-color`, `uv-switch active-color`,
 * `uv-loading-icon color`, canvas drawing. Keep the three in sync.
 *
 * Prefer UnoCSS classes (`text-primary`, `bg-card`, …) or CSS variables over
 * these constants whenever a class or `var(--yp-*)` is accepted.
 */
export const tokens = {
  primary: '#2456C9',
  primaryDark: '#1A43A3',
  primaryLight: '#E9EFFC',
  primaryDisabled: '#A3B7E9',

  success: '#15803D',
  successDark: '#166534',
  successLight: '#E8F8EE',
  warning: '#B45309',
  warningDark: '#92400E',
  warningLight: '#FFF4E0',
  error: '#CF2222',
  errorDark: '#A81B1B',
  errorLight: '#FDECEC',
  info: '#5B6B82',
  infoDark: '#475569',
  infoLight: '#EFF2F6',

  /** 北大红 / 元培米色 — identity only (logo, wordmark, 元气值 numbers); never for actions or status. */
  brand: '#9A0000',
  brandLight: '#F9F2E8',

  text1: '#1F2329',
  text2: '#4E5969',
  text3: '#666E7A',
  text4: '#C9CDD4',
  textInverse: '#FFFFFF',

  bgPage: '#F5F6F8',
  bgCard: '#FFFFFF',
  bgFill: '#F2F3F5',
  bgFillActive: '#E5E6EB',
  mask: 'rgba(0, 0, 0, 0.45)',

  border: '#E5E6EB',
  borderLight: '#F2F3F5',
} as const

export type TokenName = keyof typeof tokens
