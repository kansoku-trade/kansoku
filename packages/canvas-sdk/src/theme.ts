export const theme = {
  bgCanvas: '#0a0a0a',
  bgSurface: '#141414',
  bgElement: '#1e1e1e',
  bgHover: '#262626',
  border: '#262626',
  gridLine: '#1d1d1d',
  borderStrong: '#3a3a3a',
  textPrimary: '#e8e8e8',
  textSecondary: '#9a9a9a',
  textMuted: '#5c5c5c',
  accent: '#ffb000',
  up: '#26a69a',
  down: '#ef5350',
  fontMono: "ui-monospace, 'SF Mono', Menlo, monospace",
  fontUi: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', sans-serif",
  radius: 2,
} as const;

export const type = {
  title: 16,
  section: 13,
  body: 13,
  caption: 12,
  small: 11,
  stat: 22,
  lineHeight: 1.6,
} as const;

// 组件只管内边距；外边距归零，兄弟间距由父级 gap 决定。
export const space = {
  flow: 16,
  section: 12,
  grid: 10,
  cardY: 10,
  cardX: 12,
  cellY: 7,
  cellX: 12,
} as const;

export const seriesPalette = [
  theme.accent,
  theme.textPrimary,
  theme.up,
  theme.down,
  theme.textSecondary,
] as const;
