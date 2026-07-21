import { globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

globalStyle('.trade-sidebar', {
  background: vars.bgCanvas,
  position: 'relative',
  minHeight: 0,
});

globalStyle('.trade-sidebar-scroll', {
  position: 'absolute',
  inset: 0,
});

globalStyle('.trade-sidebar-inner', {
  height: '100%',
});

globalStyle('.trade-sidebar section', {
  borderBottom: `1px solid ${vars.border}`,
});

globalStyle('.trade-sidebar section > h4, .trade-sidebar .ui-disclosure-trigger', {
  position: 'sticky',
  top: 0,
  zIndex: 2,
  padding: '9px 12px',
  background: vars.bgElement,
  borderBottom: `1px solid ${vars.border}`,
  color: vars.textSecondary,
  fontSize: vars.fsXs,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
});

globalStyle('.trade-sidebar h4 span', {
  marginLeft: '6px',
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontWeight: 400,
  letterSpacing: 0,
});

globalStyle('.facts', {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px 14px',
  padding: '10px 12px',
});

globalStyle('.facts div', {
  minWidth: 0,
});

globalStyle('.facts dt', {
  color: vars.textMuted,
  fontSize: vars.fsXs,
});

globalStyle('.facts dd', {
  marginTop: '3px',
  fontFamily: vars.fontMono,
  fontSize: vars.fsBase,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
});

globalStyle('.decision-reason', {
  margin: '0 12px 11px',
  paddingTop: '9px',
  borderTop: `1px solid ${vars.border}`,
  color: vars.textSecondary,
  fontSize: vars.fsSm,
  lineHeight: 1.55,
});

globalStyle('.decision-reason b', {
  display: 'inline-block',
  marginBottom: '3px',
  color: vars.kindDecision,
  fontSize: vars.fsXs,
});

globalStyle('.audit-panel .ui-disclosure-trigger', {
  padding: '11px 12px',
  fontSize: vars.fsBase,
  fontWeight: 600,
});

globalStyle('.audit-panel .ui-disclosure-trigger small', {
  marginLeft: '8px',
  color: vars.textMuted,
  fontWeight: 400,
});

globalStyle('.audit-panel strong', {
  marginLeft: 'auto',
  marginRight: '10px',
  fontFamily: vars.fontMono,
  fontVariantNumeric: 'tabular-nums',
});

globalStyle('.audit-grid', {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
  gap: '1px',
  background: vars.border,
  borderTop: `1px solid ${vars.border}`,
});

globalStyle('.audit-check', {
  display: 'grid',
  gridTemplateColumns: '20px 1fr',
  gap: '8px',
  padding: '9px 10px',
  background: vars.bgSurface,
});

globalStyle('.audit-check i', {
  display: 'grid',
  placeItems: 'center',
  width: '18px',
  height: '18px',
  borderRadius: vars.radiusFull,
  background: vars.stateOkBg,
  color: vars.up,
  fontStyle: 'normal',
  fontSize: vars.fsXs,
});

globalStyle('.audit-check.fail i', {
  background: vars.stateBadBg,
  color: vars.down,
});

globalStyle('.audit-check strong, .audit-check small, .audit-check em', {
  display: 'block',
});

globalStyle('.audit-check strong', {
  fontSize: vars.fsSm,
  fontWeight: 600,
});

globalStyle('.audit-check small', {
  marginTop: '2px',
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
});

globalStyle('.audit-check em', {
  marginTop: '4px',
  color: vars.textSecondary,
  fontSize: vars.fsXs,
  fontStyle: 'normal',
  lineHeight: 1.5,
});

globalStyle('.trade-sidebar-scroll', {
  '@media': {
    '(max-width:1050px)': { position: 'static' },
  },
});

globalStyle('.trade-sidebar-inner', {
  '@media': {
    '(max-width:1050px)': { height: 'auto' },
  },
});

globalStyle('.audit-panel .ui-disclosure-trigger small', {
  '@media': {
    '(max-width:680px)': { display: 'none' },
  },
});
