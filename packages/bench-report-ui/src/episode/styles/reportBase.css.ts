import { globalStyle } from '@vanilla-extract/css';
import { vars } from './theme.css';

globalStyle('.report', {
  width: 'min(1440px,calc(100% - 32px))',
  margin: '0 auto',
  border: `1px solid ${vars.line}`,
});

globalStyle('.report-header, .panel, .trade-case', {
  background: vars.panel,
  border: `1px solid ${vars.line}`,
  borderLeft: 0,
  borderRight: 0,
});

globalStyle('.report > :first-child', {
  borderTop: 0,
});

globalStyle('.report > * + *', {
  marginTop: '10px',
});

globalStyle('.report-header', {
  display: 'flex',
  alignItems: 'center',
  gap: '18px',
  padding: '14px 16px',
});

globalStyle('.report-title', {
  minWidth: '260px',
});

globalStyle('.report-title h1', {
  fontSize: '18px',
  margin: 0,
});

globalStyle('.report-title p', {
  margin: '2px 0 0',
  color: vars.muted,
  font: `11px ${vars.mono}`,
});

globalStyle('.header-meta', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flex: 1,
  flexWrap: 'wrap',
});

globalStyle('.chip, .status', {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '24px',
  padding: '3px 8px',
  border: `1px solid ${vars.line}`,
  borderRadius: '4px',
  background: vars.soft,
  fontSize: '11px',
  whiteSpace: 'nowrap',
});

globalStyle('.audit-state', {
  fontWeight: 650,
});

globalStyle('.audit-state.pass', {
  color: vars.green,
  borderColor: '#a7d8c7',
  background: '#f0fdf8',
});

globalStyle('.audit-state.fail', {
  color: vars.red,
  borderColor: '#efb4b4',
  background: '#fff5f5',
});

globalStyle('.generated', {
  marginLeft: 'auto',
  color: vars.muted,
  font: `10px ${vars.mono}`,
  whiteSpace: 'nowrap',
});

globalStyle('.summary', {
  padding: 0,
  overflow: 'hidden',
});

globalStyle('.panel-title', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '10px 12px',
  borderBottom: `1px solid ${vars.line}`,
});

globalStyle('.panel-title h2', {
  fontSize: '13px',
  margin: 0,
});

globalStyle('.panel-title span', {
  color: vars.muted,
  fontSize: '11px',
});

globalStyle('.metrics', {
  display: 'grid',
  gridTemplateColumns: 'repeat(6,1fr)',
  borderBottom: `1px solid ${vars.line}`,
});

globalStyle('.metric', {
  minWidth: 0,
  padding: '10px 12px',
  borderRight: `1px solid ${vars.line}`,
});

globalStyle('.metric:nth-child(6n)', {
  borderRight: 0,
});

globalStyle('.metric span, .metric small', {
  display: 'block',
  color: vars.muted,
  fontSize: '10px',
});

globalStyle('.metric strong', {
  display: 'block',
  margin: '3px 0 1px',
  font: `600 18px ${vars.mono}`,
  letterSpacing: '-.03em',
});

globalStyle('.config-strip', {
  display: 'flex',
  gap: 0,
  overflow: 'auto',
});

globalStyle('.config-strip div', {
  flex: 1,
  minWidth: '112px',
  padding: '8px 12px',
  borderRight: `1px solid ${vars.line}`,
});

globalStyle('.config-strip div:last-child', {
  border: 0,
});

globalStyle('.config-strip span, .config-strip strong', {
  display: 'block',
});

globalStyle('.config-strip span', {
  color: vars.muted,
  fontSize: '9px',
  textTransform: 'uppercase',
  letterSpacing: '.04em',
});

globalStyle('.config-strip strong', {
  marginTop: '2px',
  font: `600 11px ${vars.mono}`,
});

globalStyle('.table-scroll', {
  overflow: 'auto',
});

globalStyle('.compact-table', {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '880px',
});

globalStyle('.compact-table th', {
  padding: '7px 10px',
  background: vars.soft,
  borderBottom: `1px solid ${vars.line}`,
  color: vars.muted,
  fontSize: '9px',
  textAlign: 'left',
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  whiteSpace: 'nowrap',
});

globalStyle('.compact-table td', {
  padding: '8px 10px',
  borderBottom: '1px solid #f5f5f5',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
});

globalStyle('.compact-table tbody tr:last-child td', {
  borderBottom: 0,
});

globalStyle('.compact-table tbody tr:hover', {
  background: '#fafafa',
});

globalStyle('.compact-table strong, .compact-table small', {
  display: 'block',
});

globalStyle('.compact-table small', {
  color: vars.muted,
  fontSize: '9px',
});

globalStyle('.filters', {
  display: 'flex',
  gap: '6px',
  padding: '8px 10px',
  borderBottom: `1px solid ${vars.line}`,
});

globalStyle('.filters select, .filters input', {
  height: '30px',
  padding: '0 9px',
  border: `1px solid ${vars.lineStrong}`,
  borderRadius: '4px',
  background: '#fff',
  color: vars.text,
  font: '11px inherit',
  outline: 'none',
});

globalStyle('.filters select:focus, .filters input:focus', {
  borderColor: vars.blue,
  boxShadow: '0 0 0 2px #dbeafe',
});

globalStyle('.filters input', {
  flex: 1,
  minWidth: '180px',
});

globalStyle('.filters > span', {
  alignSelf: 'center',
  marginLeft: 'auto',
  color: vars.muted,
  font: `10px ${vars.mono}`,
});

globalStyle('.case-row[hidden], .trade-case[hidden]', {
  display: 'none',
});

globalStyle('.status.positive', {
  background: '#eefbf5',
  borderColor: '#b4e2d0',
});

globalStyle('.status.negative', {
  background: '#fff3f3',
  borderColor: '#efb8b8',
});

globalStyle('.trade-case', {
  overflow: 'hidden',
  scrollMarginTop: '10px',
});

globalStyle('.case-head', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '10px 12px',
  borderBottom: `1px solid ${vars.line}`,
});

globalStyle('.case-head h3', {
  display: 'inline',
  margin: '0 8px 0 0',
  fontSize: '15px',
});

globalStyle('.case-head > div > span', {
  color: vars.muted,
  fontSize: '10px',
});

globalStyle('.case-result', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
});

globalStyle('.case-result strong', {
  font: `650 17px ${vars.mono}`,
});

globalStyle('.case-layout', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) 310px',
});

globalStyle('.footer', {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '6px 12px',
  color: vars.muted,
  fontSize: '9px',
});

globalStyle('.footer a', {
  color: vars.blue,
});

globalStyle('.metrics', {
  '@media': {
    '(max-width:1050px)': {
      gridTemplateColumns: 'repeat(3,1fr)',
    },
    '(max-width:680px)': {
      gridTemplateColumns: 'repeat(2,1fr)',
    },
  },
});

globalStyle('.metric:nth-child(3n)', {
  '@media': {
    '(max-width:1050px)': { borderRight: 0 },
    '(max-width:680px)': { borderRight: `1px solid ${vars.line}` },
  },
});

globalStyle('.case-layout', {
  '@media': {
    '(max-width:1050px)': { gridTemplateColumns: '1fr' },
  },
});

globalStyle('.report', {
  '@media': {
    '(max-width:680px)': { width: '100%', margin: 0 },
  },
});

globalStyle('.report-header, .panel, .trade-case', {
  '@media': {
    '(max-width:680px)': { borderLeft: 0, borderRight: 0 },
  },
});

globalStyle('.report-header', {
  '@media': {
    '(max-width:680px)': { display: 'block' },
  },
});

globalStyle('.header-meta', {
  '@media': {
    '(max-width:680px)': { marginTop: '8px' },
  },
});

globalStyle('.generated', {
  '@media': {
    '(max-width:680px)': { width: '100%', margin: '2px 0 0' },
  },
});

globalStyle('.metric:nth-child(2n)', {
  '@media': {
    '(max-width:680px)': { borderRight: 0 },
  },
});

globalStyle('.filters', {
  '@media': {
    '(max-width:680px)': { flexWrap: 'wrap' },
  },
});

globalStyle('.filters select', {
  '@media': {
    '(max-width:680px)': { flex: 1 },
  },
});

globalStyle('.filters input', {
  '@media': {
    '(max-width:680px)': { order: 2, flexBasis: '100%' },
  },
});

globalStyle('.case-head', {
  '@media': {
    '(max-width:680px)': { alignItems: 'flex-start' },
  },
});

globalStyle('.case-head > div > span', {
  '@media': {
    '(max-width:680px)': { display: 'block', marginTop: '2px' },
  },
});

globalStyle('.case-result', {
  '@media': {
    '(max-width:680px)': { alignItems: 'flex-end', flexDirection: 'column', gap: '4px' },
  },
});

globalStyle('.footer', {
  '@media': {
    '(max-width:680px)': { padding: '8px 10px', display: 'block' },
  },
});

globalStyle('body', {
  '@media': {
    print: { background: '#fff' },
  },
});

globalStyle('.report', {
  '@media': {
    print: { width: '100%', margin: 0 },
  },
});

globalStyle('.filters', {
  '@media': {
    print: { display: 'none' },
  },
});

globalStyle('.panel, .trade-case, .report-header', {
  '@media': {
    print: { breakInside: 'avoid' },
  },
});
