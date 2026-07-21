import { globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

globalStyle('.chart-legend i.decision', { background: vars.kindDecision });

globalStyle('.process-panel', {
  borderTop: `1px solid ${vars.border}`,
  background: vars.bgCanvas,
});

globalStyle('.process-head', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '9px 10px',
  borderBottom: `1px solid ${vars.border}`,
});

globalStyle('.process-head > div:first-child strong, .process-head > div:first-child span', {
  display: 'block',
});

globalStyle('.process-head > div:first-child strong', {
  fontSize: vars.fsBase,
  fontWeight: 600,
});

globalStyle('.process-head > div:first-child span', {
  marginTop: '2px',
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
});

globalStyle('.process-head > div:last-child', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

globalStyle('.process-score, .process-reset', {
  height: '25px',
  padding: '0 9px',
  border: `1px solid ${vars.border}`,
  borderRadius: vars.radius,
  background: vars.bgElement,
  color: vars.textSecondary,
  fontFamily: 'inherit',
  fontSize: vars.fsXs,
});

globalStyle('.process-score', {
  display: 'inline-flex',
  alignItems: 'center',
});

globalStyle('.process-score.pass', {
  color: vars.up,
  borderColor: vars.stateOkBorder,
  background: vars.stateOkBg,
});

globalStyle('.process-score.fail', {
  color: vars.down,
  borderColor: vars.stateBadBorder,
  background: vars.stateBadBg,
});

globalStyle('.process-reset', {
  cursor: 'pointer',
});

globalStyle('.process-reset:hover', {
  background: vars.bgHover,
  color: vars.textPrimary,
});

globalStyle('.process-rail', {
  padding: '10px 10px 4px',
});

globalStyle('.process-track', {
  display: 'flex',
  gap: '16px',
  paddingBottom: '6px',
});

globalStyle('.process-node', {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  flex: '0 0 178px',
  minHeight: '104px',
  padding: '9px 10px',
  border: `1px solid ${vars.border}`,
  borderTop: `3px solid ${vars.textMuted}`,
  borderRadius: vars.radius,
  background: vars.bgSurface,
  color: vars.textPrimary,
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
});

globalStyle('.process-node::after', {
  content: '""',
  position: 'absolute',
  top: '46px',
  left: 'calc(100% + 1px)',
  width: '16px',
  height: '1px',
  background: vars.borderStrong,
});

globalStyle('.process-track > :last-child .process-node::after', {
  display: 'none',
});

globalStyle('.process-node:hover', {
  borderColor: vars.borderStrong,
  background: vars.bgElement,
});

globalStyle('.process-node.active', {
  borderColor: vars.kindDecision,
  background: vars.kindDecisionBg,
});

globalStyle('.process-node.data', { borderTopColor: vars.kindData });
globalStyle('.process-node.observe', { borderTopColor: vars.kindObserve });
globalStyle('.process-node.decision', { borderTopColor: vars.kindDecision });
globalStyle('.process-node.manage', { borderTopColor: vars.kindManage });

globalStyle('.process-node.warning', {
  borderTopColor: vars.down,
});

globalStyle('.process-node.warning .process-bar', {
  color: vars.down,
});

globalStyle('.process-node.error', {
  borderColor: vars.down,
  borderTopColor: vars.down,
});

globalStyle('.process-index', {
  position: 'absolute',
  top: '7px',
  right: '8px',
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
});

globalStyle('.process-bar', {
  display: 'block',
  color: vars.kindDecision,
  fontFamily: vars.fontMono,
  fontSize: vars.fsSm,
  fontWeight: 600,
});

globalStyle('.process-node strong, .process-node em', {
  display: 'block',
});

globalStyle('.process-node strong', {
  marginTop: '6px',
  fontSize: vars.fsBase,
  fontWeight: 600,
});

globalStyle('.process-node small', {
  display: '-webkit-box',
  WebkitLineClamp: 4,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  marginTop: '3px',
  color: vars.textSecondary,
  fontSize: vars.fsSm,
  lineHeight: 1.45,
});

globalStyle('.process-node em', {
  marginTop: 'auto',
  paddingTop: '8px',
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
  fontStyle: 'normal',
});

globalStyle('.process-checks', {
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  minHeight: '32px',
  padding: '6px 10px',
  borderTop: `1px solid ${vars.border}`,
  background: vars.bgSurface,
  overflowX: 'auto',
});

globalStyle('.process-checks .ui-tip', {
  borderBottom: 0,
});

globalStyle('.process-checks span', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  whiteSpace: 'nowrap',
  fontSize: vars.fsXs,
  color: vars.textSecondary,
});

globalStyle('.process-checks i', {
  display: 'grid',
  placeItems: 'center',
  width: '15px',
  height: '15px',
  borderRadius: vars.radiusFull,
  fontStyle: 'normal',
});

globalStyle('.process-checks .pass i', {
  color: vars.up,
  background: vars.stateOkBg,
});

globalStyle('.process-checks .fail i', {
  color: vars.down,
  background: vars.stateBadBg,
});

globalStyle('.process-empty', {
  padding: '12px',
  color: vars.textMuted,
  fontSize: vars.fsSm,
});

globalStyle('.process-head', {
  '@media': {
    '(max-width:680px)': { alignItems: 'flex-start', flexDirection: 'column' },
  },
});

globalStyle('.process-head > div:last-child', {
  '@media': {
    '(max-width:680px)': { width: '100%', justifyContent: 'space-between' },
  },
});

globalStyle('.process-node', {
  '@media': {
    '(max-width:680px)': { flexBasis: '164px' },
  },
});

globalStyle('.process-tip strong', {
  display: 'block',
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
  color: vars.textMuted,
});

globalStyle('.process-tip p', {
  marginTop: '4px',
});
