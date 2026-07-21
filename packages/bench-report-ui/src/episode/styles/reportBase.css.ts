import { globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

globalStyle('.report', {
  width: 'min(1440px,calc(100% - 32px))',
  margin: '0 auto',
  border: `1px solid ${vars.border}`,
});

globalStyle('.report-header, .panel, .trade-case', {
  background: vars.bgSurface,
  border: `1px solid ${vars.border}`,
  borderLeft: 0,
  borderRight: 0,
});

globalStyle('.report > :first-child', {
  borderTop: 0,
});

globalStyle('.report > * + *', {
  marginTop: '8px',
});

globalStyle('.report > .case-details, .report > .audit-panel', {
  marginTop: '28px',
});

globalStyle('.report-header', {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  padding: '14px 16px',
});

globalStyle('.report-title', {
  minWidth: '260px',
});

globalStyle('.report-title h1', {
  fontSize: '18px',
  fontWeight: 600,
  letterSpacing: '-.02em',
});

globalStyle('.report-title p', {
  marginTop: '3px',
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontSize: vars.fsSm,
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
  border: `1px solid ${vars.border}`,
  borderRadius: vars.radius,
  background: vars.bgElement,
  color: vars.textSecondary,
  fontSize: vars.fsSm,
  whiteSpace: 'nowrap',
});

globalStyle('.audit-state', {
  fontWeight: 600,
});

globalStyle('.audit-state.pass', {
  color: vars.up,
  borderColor: vars.stateOkBorder,
  background: vars.stateOkBg,
});

globalStyle('.audit-state.fail', {
  color: vars.down,
  borderColor: vars.stateBadBorder,
  background: vars.stateBadBg,
});

globalStyle('.generated', {
  marginLeft: 'auto',
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
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
  borderBottom: `1px solid ${vars.border}`,
});

globalStyle('.panel-title h2', {
  fontSize: vars.fsMd,
  fontWeight: 600,
});

globalStyle('.panel-title > span', {
  color: vars.textMuted,
  fontSize: vars.fsSm,
});

globalStyle('.metrics', {
  display: 'grid',
  gridTemplateColumns: 'repeat(6,minmax(0,1fr))',
  gap: '1px',
  background: vars.border,
  borderBottom: `1px solid ${vars.border}`,
});

globalStyle('.metrics', {
  '@media': {
    '(max-width:1180px)': { gridTemplateColumns: 'repeat(4,minmax(0,1fr))' },
    '(max-width:860px)': { gridTemplateColumns: 'repeat(3,minmax(0,1fr))' },
    '(max-width:600px)': { gridTemplateColumns: 'repeat(2,minmax(0,1fr))' },
  },
});

globalStyle('.metric', {
  minWidth: 0,
  padding: '10px 12px',
  background: vars.bgSurface,
});

globalStyle('.metric > span, .metric small', {
  display: 'block',
  color: vars.textMuted,
  fontSize: vars.fsXs,
});

globalStyle('.metric strong', {
  display: 'block',
  margin: '4px 0 2px',
  fontFamily: vars.fontMono,
  fontSize: '18px',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-.03em',
});

globalStyle('.config-strip', {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(124px,1fr))',
  gap: '1px',
  background: vars.border,
});

globalStyle('.config-strip div', {
  minWidth: 0,
  padding: '8px 12px',
  background: vars.bgSurface,
});

globalStyle('.config-strip span, .config-strip strong', {
  display: 'block',
});

globalStyle('.config-strip span', {
  color: vars.textMuted,
  fontSize: vars.fsXs,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
});

globalStyle('.config-strip strong', {
  marginTop: '3px',
  fontFamily: vars.fontMono,
  fontSize: vars.fsSm,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
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
  padding: '8px 10px',
  background: vars.bgElement,
  borderBottom: `1px solid ${vars.border}`,
  color: vars.textMuted,
  fontSize: vars.fsXs,
  fontWeight: 500,
  textAlign: 'left',
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  whiteSpace: 'nowrap',
});

globalStyle('.compact-table td', {
  padding: '8px 10px',
  borderBottom: `1px solid ${vars.border}`,
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
});

globalStyle('.compact-table tbody tr:last-child td', {
  borderBottom: 0,
});

globalStyle('.compact-table tbody tr:hover', {
  background: vars.bgHover,
});

globalStyle('.compact-table strong, .compact-table small', {
  display: 'block',
});

globalStyle('.compact-table strong', {
  fontWeight: 600,
});

globalStyle('.compact-table small', {
  marginTop: '2px',
  color: vars.textMuted,
  fontSize: vars.fsXs,
});

globalStyle('.compact-table .mono', {
  fontVariantNumeric: 'tabular-nums',
});

globalStyle('.provenance-alias', {
  color: vars.textMuted,
  fontWeight: 400,
});

globalStyle('.filters', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 10px',
  borderBottom: `1px solid ${vars.border}`,
});

globalStyle('.filters .ui-input', {
  flex: 1,
  minWidth: '180px',
});

globalStyle('.filters > span', {
  marginLeft: 'auto',
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
  fontVariantNumeric: 'tabular-nums',
});

globalStyle('.case-row[hidden], .trade-case[hidden]', {
  display: 'none',
});

globalStyle('.status.positive', {
  color: vars.up,
  background: vars.stateOkBg,
  borderColor: vars.stateOkBorder,
});

globalStyle('.status.negative', {
  color: vars.down,
  background: vars.stateBadBg,
  borderColor: vars.stateBadBorder,
});

globalStyle('.case-details', {
  display: 'flex',
  flexDirection: 'column',
  gap: '28px',
});

globalStyle('.trade-case', {
  overflow: 'hidden',
  scrollMarginTop: '28px',
});

globalStyle('.case-head', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '10px 12px',
  borderBottom: `1px solid ${vars.border}`,
});

globalStyle('.case-head h3', {
  display: 'inline',
  marginRight: '8px',
  fontSize: vars.fsLg,
  fontWeight: 600,
});

globalStyle('.case-head > div > span', {
  color: vars.textMuted,
  fontSize: vars.fsSm,
});

globalStyle('.provenance-line', {
  display: 'block',
  marginTop: '3px',
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
});

globalStyle('.case-result', {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
});

globalStyle('.case-result strong', {
  fontFamily: vars.fontMono,
  fontSize: '17px',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
});

globalStyle('.case-layout', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) 330px',
});

globalStyle('.footer', {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '8px 12px',
  color: vars.textMuted,
  fontSize: vars.fsXs,
});

globalStyle('.footer a', {
  color: vars.textSecondary,
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
    '(max-width:680px)': { width: '100%', marginTop: '4px' },
  },
});

globalStyle('.filters', {
  '@media': {
    '(max-width:680px)': { flexWrap: 'wrap' },
  },
});

globalStyle('.filters .ui-input', {
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
    '(max-width:680px)': { display: 'block' },
  },
});
