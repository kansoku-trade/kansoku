import { globalStyle } from '@vanilla-extract/css';
import { vars } from './theme.css';

globalStyle('.chart-panel', {
  minWidth: 0,
  borderRight: `1px solid ${vars.line}`,
});

globalStyle('.chart-toolbar', {
  height: '48px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '7px 10px',
  borderBottom: `1px solid ${vars.line}`,
});

globalStyle('.chart-toolbar strong, .chart-toolbar span', {
  display: 'block',
});

globalStyle('.chart-toolbar span', {
  color: vars.muted,
  fontSize: '9px',
});

globalStyle('.timeframe-tabs', {
  display: 'flex',
  border: `1px solid ${vars.lineStrong}`,
  borderRadius: '4px',
  overflow: 'hidden',
});

globalStyle('.timeframe-tabs button', {
  height: '28px',
  padding: '0 12px',
  border: 0,
  borderRight: `1px solid ${vars.lineStrong}`,
  background: '#fff',
  color: vars.muted,
  font: '11px inherit',
  cursor: 'pointer',
});

globalStyle('.timeframe-tabs button:last-child', {
  borderRight: 0,
});

globalStyle('.timeframe-tabs button.active', {
  background: '#e5e5e5',
  color: vars.text,
  fontWeight: 650,
});

globalStyle('.tv-chart', {
  height: '360px',
  position: 'relative',
  background: '#fff',
});

globalStyle('.chart-marker-tooltip', {
  position: 'absolute',
  pointerEvents: 'none',
  background: '#171717',
  color: '#fff',
  padding: '6px 8px',
  borderRadius: '4px',
  font: `10px ${vars.mono}`,
  lineHeight: 1.5,
  maxWidth: '240px',
  zIndex: 30,
  boxShadow: '0 6px 20px rgba(0,0,0,.18)',
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
  color: vars.muted,
  fontSize: '11px',
});

globalStyle('.chart-error', {
  color: vars.red,
});

globalStyle('.chart-legend', {
  height: '31px',
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  padding: '0 10px',
  borderTop: `1px solid ${vars.line}`,
  color: vars.muted,
  fontSize: '9px',
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

globalStyle('.chart-legend i.entry', { background: vars.blue });

globalStyle('.chart-legend i.target', { background: vars.green });

globalStyle('.chart-legend i.stop', { background: vars.red });

globalStyle('.chart-legend i.ema', { background: '#f59e0b' });

globalStyle('.chart-range', {
  marginLeft: 'auto !important',
  fontFamily: vars.mono,
});

globalStyle('.chart-panel', {
  '@media': {
    '(max-width:1050px)': {
      borderRight: 0,
      borderBottom: `1px solid ${vars.line}`,
    },
  },
});

globalStyle('.chart-toolbar', {
  '@media': {
    '(max-width:680px)': { height: 'auto', alignItems: 'flex-start', flexDirection: 'column' },
  },
});

globalStyle('.timeframe-tabs', {
  '@media': {
    '(max-width:680px)': { width: '100%' },
  },
});

globalStyle('.timeframe-tabs button', {
  '@media': {
    '(max-width:680px)': { flex: 1 },
  },
});

globalStyle('.tv-chart', {
  '@media': {
    '(max-width:680px)': { height: '330px' },
    print: { height: '300px' },
  },
});
