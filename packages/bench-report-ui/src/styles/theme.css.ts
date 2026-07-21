import { createGlobalTheme, globalStyle } from '@vanilla-extract/css';

export const vars = createGlobalTheme(':root', {
  bgCanvas: '#0a0a0a',
  bgSurface: '#141414',
  bgElement: '#1e1e1e',
  bgHover: '#262626',
  border: '#262626',
  borderStrong: '#3a3a3a',
  gridLine: '#1d1d1d',
  textPrimary: '#e8e8e8',
  textSecondary: '#9a9a9a',
  textMuted: '#5c5c5c',
  accent: '#ffb000',
  up: '#26a69a',
  down: '#ef5350',
  ok: '#34c759',
  focusBorder: '#7a7a7a',
  focusRing: '0 0 0 2px rgb(232 232 232 / 0.12)',
  stateOkBg: 'rgb(38 166 154 / 0.12)',
  stateOkBorder: 'rgb(38 166 154 / 0.35)',
  stateBadBg: 'rgb(239 83 80 / 0.12)',
  stateBadBorder: 'rgb(239 83 80 / 0.35)',
  kindData: '#60a5fa',
  kindObserve: '#fbbf24',
  kindDecision: '#a78bfa',
  kindDecisionBg: 'rgb(167 139 250 / 0.12)',
  kindManage: '#34d399',
  fontUi: '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Helvetica Neue",sans-serif',
  fontMono: 'ui-monospace,"SF Mono",Menlo,Consolas,monospace',
  fsXs: '10px',
  fsSm: '11px',
  fsBase: '12px',
  fsMd: '13px',
  fsLg: '15px',
  fsXl: '20px',
  radius: '2px',
  radiusMd: '6px',
  radiusLg: '10px',
  radiusFull: '999px',
  controlH: '28px',
});

globalStyle(':root', {
  colorScheme: 'dark',
});

globalStyle('*', {
  boxSizing: 'border-box',
  margin: 0,
  padding: 0,
});

globalStyle('html', {
  scrollBehavior: 'smooth',
  WebkitFontSmoothing: 'antialiased',
  textRendering: 'optimizeLegibility',
});

globalStyle('body', {
  background: vars.bgCanvas,
  color: vars.textPrimary,
  fontFamily: vars.fontUi,
  fontSize: vars.fsMd,
  lineHeight: 1.45,
  letterSpacing: '-.005em',
});

globalStyle('a', {
  color: 'inherit',
});

globalStyle('.mono, .num', {
  fontFamily: vars.fontMono,
  fontVariantNumeric: 'tabular-nums lining-nums',
  letterSpacing: 0,
});

globalStyle('.positive', {
  color: `${vars.up} !important`,
});

globalStyle('.negative', {
  color: `${vars.down} !important`,
});

globalStyle('.neutral', {
  color: vars.textPrimary,
});

globalStyle('.entry-text', {
  color: vars.kindData,
});

globalStyle('.muted', {
  color: vars.textMuted,
});

globalStyle(':focus-visible', {
  outline: `1px solid ${vars.focusBorder}`,
  outlineOffset: '1px',
});
