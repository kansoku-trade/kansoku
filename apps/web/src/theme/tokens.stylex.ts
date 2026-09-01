import * as stylex from '@stylexjs/stylex';

export const colors = stylex.defineVars({
  backgroundCanvas: '#0a0a0a',
  backgroundDeep: '#050505',
  backgroundSurface: '#141414',
  backgroundElement: '#1e1e1e',
  backgroundHover: '#262626',
  backgroundBackdrop: 'rgba(0, 0, 0, 0.6)',
  backgroundSunken: 'rgba(0, 0, 0, 0.2)',
  border: '#262626',
  borderStrong: '#3a3a3a',
  textBright: '#fff',
  textPrimary: '#e8e8e8',
  textSecondary: '#9a9a9a',
  textMuted: '#5c5c5c',
  accent: '#ffb000',
  focusBorder: '#7a7a7a',
  focusRing: '0 0 0 2px rgb(232 232 232 / 0.12)',
  focusOutline: '1px solid rgb(232 232 232 / 0.35)',
  up: '#26a69a',
  down: '#ef5350',
  ok: '#34c759',
});

export const fonts = stylex.defineConsts({
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
  ui: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif",
});

export const fontSizes = stylex.defineConsts({
  xs: '10px',
  sm: '11px',
  caption: '12px',
  control: '13px',
  base: '14px',
  md: '15px',
  lg: '16px',
  xl: '22px',
});

export const radii = stylex.defineConsts({
  default: '2px',
  md: '6px',
  lg: '10px',
  composer: '24px',
  userBubble: '16px 16px 4px 16px',
  full: '999px',
});

export const sizes = stylex.defineConsts({
  controlHeight: '30px',
  paneHeaderHeight: '44px',
  sidebarWidth: '340px',
});
