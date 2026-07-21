import { globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

globalStyle('.chart-panel', {
  minWidth: 0,
  borderRight: `1px solid ${vars.border}`,
});

globalStyle('.chart-toolbar', {
  height: '48px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '7px 10px',
  borderBottom: `1px solid ${vars.border}`,
});

globalStyle('.chart-toolbar strong, .chart-toolbar > div > span', {
  display: 'block',
});

globalStyle('.chart-toolbar strong', {
  fontSize: vars.fsBase,
  fontWeight: 600,
});

globalStyle('.chart-toolbar > div > span', {
  marginTop: '2px',
  color: vars.textMuted,
  fontSize: vars.fsXs,
});

globalStyle('.tv-chart', {
  height: '360px',
  position: 'relative',
  background: vars.bgSurface,
});

globalStyle('.chart-marker-tooltip', {
  position: 'absolute',
  pointerEvents: 'none',
  background: vars.bgElement,
  border: `1px solid ${vars.borderStrong}`,
  color: vars.textPrimary,
  padding: '6px 8px',
  borderRadius: vars.radius,
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
  lineHeight: 1.5,
  maxWidth: '240px',
  zIndex: 30,
  boxShadow: '0 8px 28px rgb(0 0 0 / 0.55)',
  display: 'none',
  whiteSpace: 'normal',
});

globalStyle('.chart-marker-tooltip div', {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

globalStyle('.chart-loading, .chart-error', {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  color: vars.textMuted,
  fontSize: vars.fsSm,
});

globalStyle('.chart-error', {
  color: vars.down,
});

globalStyle('.chart-legend', {
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  padding: '0 10px',
  borderTop: `1px solid ${vars.border}`,
  color: vars.textMuted,
  fontSize: vars.fsXs,
});

globalStyle('.chart-legend span', {
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
});

globalStyle('.chart-legend i', {
  display: 'block',
  width: '14px',
  height: '2px',
});

globalStyle('.chart-legend i.entry', { background: vars.textPrimary });

globalStyle('.chart-legend i.target', { background: vars.up });

globalStyle('.chart-legend i.stop', { background: vars.down });

globalStyle('.chart-legend i.ema', { background: '#facc15' });

globalStyle('.chart-range', {
  marginLeft: 'auto !important',
  fontFamily: vars.fontMono,
  fontVariantNumeric: 'tabular-nums',
});

globalStyle('.chart-panel', {
  '@media': {
    '(max-width:1050px)': {
      borderRight: 0,
      borderBottom: `1px solid ${vars.border}`,
    },
  },
});

globalStyle('.chart-toolbar', {
  '@media': {
    '(max-width:680px)': { height: 'auto', alignItems: 'flex-start', flexDirection: 'column' },
  },
});

globalStyle('.tv-chart', {
  '@media': {
    '(max-width:680px)': { height: '330px' },
  },
});
