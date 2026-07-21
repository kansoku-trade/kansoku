import { globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

globalStyle('.plotwrap', {
  position: 'sticky',
  top: '51px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

globalStyle('.plotpanel', {
  background: vars.bgSurface,
  border: `1px solid ${vars.border}`,
  padding: '14px',
});

globalStyle('.plotpanel .head', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '10px',
});

globalStyle('.plotpanel .head h3', {
  fontSize: vars.fsMd,
  fontWeight: 600,
});

globalStyle('.plotpanel .head .note', {
  fontSize: vars.fsSm,
  color: vars.textMuted,
});

globalStyle('.plotpanel svg', {
  width: '100%',
  height: 'auto',
  display: 'block',
});

globalStyle('.axlab', {
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
  fill: vars.textMuted,
  letterSpacing: '.04em',
});

globalStyle('.axtitle', {
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
  fill: vars.textSecondary,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
});

globalStyle('.gridln', {
  stroke: vars.border,
  strokeWidth: 1,
});

globalStyle('.gridln.dash', {
  strokeDasharray: '2 3',
  stroke: vars.gridLine,
});

globalStyle('.baseln', {
  stroke: vars.down,
  strokeWidth: 1.2,
  strokeDasharray: '4 3',
});

globalStyle('.baslab', {
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
  fill: vars.down,
  letterSpacing: '.04em',
});

globalStyle('.dot', {
  fill: vars.accent,
  stroke: vars.bgSurface,
  strokeWidth: 1.5,
  cursor: 'pointer',
  transition: 'r .12s',
});

globalStyle('.dot.sel', {
  fill: vars.textPrimary,
});

globalStyle('.dot.lead', {
  fill: vars.accent,
});

globalStyle('.dot.below', {
  fill: vars.textMuted,
  opacity: 0.7,
});

globalStyle('.dotlab', {
  fontFamily: 'inherit',
  fontSize: vars.fsXs,
  fill: vars.textSecondary,
  fontWeight: 500,
  pointerEvents: 'none',
});

globalStyle('.dotlab.sel', {
  fill: vars.textPrimary,
  fontWeight: 700,
});

globalStyle('.dotlab.dim', {
  fill: vars.textMuted,
});

globalStyle('.plotlegend', {
  marginTop: '10px',
  paddingTop: '10px',
  borderTop: `1px solid ${vars.border}`,
  display: 'flex',
  gap: '14px',
  fontSize: vars.fsSm,
  color: vars.textMuted,
  flexWrap: 'wrap',
});

globalStyle('.plotlegend span', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
});

globalStyle('.plotlegend .sw', {
  width: '8px',
  height: '8px',
  borderRadius: vars.radiusFull,
  background: vars.accent,
});

globalStyle('.plotlegend .sw.below', {
  background: vars.textMuted,
  opacity: 0.7,
});

globalStyle('.dot-tip', {
  display: 'grid',
  gap: '3px',
  marginTop: '5px',
});

globalStyle('.dot-tip div', {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '14px',
});

globalStyle('.dot-tip dt', {
  color: vars.textMuted,
});

globalStyle('.dot-tip dd', {
  fontFamily: vars.fontMono,
  fontVariantNumeric: 'tabular-nums',
});
