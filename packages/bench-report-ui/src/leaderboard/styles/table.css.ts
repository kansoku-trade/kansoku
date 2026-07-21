import { globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

globalStyle('.shell', {
  border: `1px solid ${vars.border}`,
});

globalStyle('.shell > * + *', {
  marginTop: '10px',
});

globalStyle('.shell > :first-child', {
  borderTop: 0,
});

globalStyle('.panel, .plotpanel, .detailcard', {
  borderLeft: 0,
  borderRight: 0,
});

globalStyle('.grid', {
  display: 'grid',
  gridTemplateColumns: '1fr 440px',
  gap: '10px',
  alignItems: 'start',
});

globalStyle('.grid', {
  '@media': {
    '(max-width:1180px)': { gridTemplateColumns: '1fr' },
  },
});

globalStyle('.plotwrap', {
  '@media': {
    '(max-width:1180px)': { position: 'static' },
  },
});

globalStyle('.panel', {
  background: vars.bgSurface,
  border: `1px solid ${vars.border}`,
  overflow: 'hidden',
});

globalStyle('.panelhead', {
  padding: '11px 14px',
  borderBottom: `1px solid ${vars.border}`,
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
});

globalStyle('.panelhead h3', {
  fontSize: vars.fsMd,
  fontWeight: 600,
  letterSpacing: '-.005em',
});

globalStyle('.panelhead .desc', {
  fontSize: vars.fsSm,
  color: vars.textMuted,
});

globalStyle('.panelhead .r', {
  marginLeft: 'auto',
  fontSize: vars.fsSm,
  color: vars.textMuted,
  fontFamily: vars.fontMono,
});

globalStyle('.tblwrap', {
  overflowX: 'auto',
});

globalStyle('.tbl', {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: vars.fsMd,
});

globalStyle('.tbl thead th', {
  position: 'sticky',
  top: 0,
  background: vars.bgElement,
  zIndex: 5,
  fontWeight: 500,
  fontSize: vars.fsXs,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: vars.textMuted,
  textAlign: 'right',
  padding: '9px 12px',
  borderBottom: `1px solid ${vars.border}`,
  whiteSpace: 'nowrap',
  userSelect: 'none',
});

globalStyle('.tbl thead th:first-child', {
  width: '42px',
  textAlign: 'center',
});

globalStyle('.tbl thead th:nth-child(2)', {
  textAlign: 'left',
});

globalStyle('.tbl thead th.sorted', {
  color: vars.textPrimary,
});

globalStyle('.tbl thead th.sorted::after', {
  content: '" ↓"',
  color: vars.accent,
});

globalStyle('.tbl tbody td', {
  padding: '0 12px',
  borderBottom: `1px solid ${vars.border}`,
  height: '44px',
  textAlign: 'right',
  verticalAlign: 'middle',
});

globalStyle('.tbl tbody td:first-child', {
  textAlign: 'center',
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontSize: vars.fsBase,
  fontWeight: 500,
});

globalStyle('.tbl tbody td:nth-child(2)', {
  textAlign: 'left',
});

globalStyle('.tbl tbody tr', {
  cursor: 'pointer',
});

globalStyle('.tbl tbody tr:hover', {
  background: vars.bgHover,
});

globalStyle('.tbl tbody tr.sel', {
  background: vars.bgElement,
  boxShadow: `inset 2px 0 0 ${vars.accent}`,
});

globalStyle('.tbl tbody tr.sel td:first-child', {
  color: vars.accent,
  fontWeight: 700,
});

globalStyle('.mname', {
  fontWeight: 600,
  fontSize: vars.fsMd,
  letterSpacing: '-.01em',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
});

globalStyle('.mvend', {
  display: 'inline-block',
  fontSize: vars.fsXs,
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  background: vars.bgElement,
  padding: '1px 6px',
  borderRadius: vars.radius,
  border: `1px solid ${vars.border}`,
  fontWeight: 400,
});

globalStyle('.total', {
  fontFamily: vars.fontMono,
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 600,
  fontSize: vars.fsMd,
  color: vars.textPrimary,
});

globalStyle('.delta', {
  display: 'inline-block',
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
  padding: '1px 5px',
  borderRadius: vars.radius,
  marginLeft: '6px',
});

globalStyle('.delta.pos', {
  color: vars.up,
  background: vars.stateOkBg,
});

globalStyle('.delta.neg', {
  color: vars.down,
  background: vars.stateBadBg,
});

globalStyle('.bar', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: '120px',
  justifyContent: 'flex-end',
});

globalStyle('.bartrack', {
  width: '60px',
  height: '4px',
  background: vars.bgHover,
  borderRadius: vars.radiusFull,
  overflow: 'hidden',
  position: 'relative',
});

globalStyle('.bartrack i', {
  display: 'block',
  height: '100%',
  background: vars.accent,
});

globalStyle('.bartrack.e i', {
  background: vars.textSecondary,
});

globalStyle('.bartrack.muted i', {
  background: vars.textMuted,
});

globalStyle('.btag', {
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
  color: vars.textMuted,
  border: `1px solid ${vars.border}`,
  borderRadius: vars.radius,
  padding: '1px 5px',
  background: vars.bgElement,
});

globalStyle('tr.base', {
  background: vars.bgCanvas,
});

globalStyle('tr.base .mname', {
  fontWeight: 500,
  color: vars.textSecondary,
  fontSize: vars.fsBase,
});

globalStyle('tr.base td:first-child', {
  color: vars.textMuted,
});

globalStyle('tr.base .total', {
  color: vars.textMuted,
});

globalStyle('tr.passline td', {
  height: 0,
  padding: 0,
  borderTop: `1px dashed ${vars.down}`,
  borderBottom: 0,
  position: 'relative',
});

globalStyle('tr.passline td::after', {
  content: 'attr(data-label)',
  position: 'absolute',
  right: '12px',
  top: '-9px',
  background: vars.bgSurface,
  padding: '0 8px',
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
  letterSpacing: '.08em',
  color: vars.down,
});
