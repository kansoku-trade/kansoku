export const theme = {
  bgCanvas: "#0a0a0a",
  bgSurface: "#141414",
  bgElement: "#1e1e1e",
  border: "#262626",
  gridLine: "#1d1d1d",
  borderStrong: "#3a3a3a",
  textPrimary: "#e8e8e8",
  textSecondary: "#9a9a9a",
  textMuted: "#5c5c5c",
  accent: "#facc15",
  up: "#26a69a",
  down: "#ef5350",
  fontMono: "ui-monospace, 'SF Mono', Menlo, monospace",
} as const;

export const seriesPalette = [theme.accent, theme.textPrimary, theme.up, theme.down, theme.textSecondary] as const;
