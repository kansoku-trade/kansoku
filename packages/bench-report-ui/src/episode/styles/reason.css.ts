import { globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

globalStyle('.reason-empty', {
  padding: '12px',
  color: vars.textMuted,
  fontSize: vars.fsSm,
});

globalStyle('.reason-table', {
  minWidth: '720px',
});

globalStyle('.trade-ledger ol, .actions ol', {
  listStyle: 'none',
});

globalStyle('.trade-ledger li, .actions li', {
  borderBottom: `1px solid ${vars.border}`,
});

globalStyle('.trade-ledger li:last-child, .actions li:last-child', {
  borderBottom: 0,
});

globalStyle('.ledger-hint', {
  padding: '8px 12px 0',
  color: vars.textMuted,
  fontSize: vars.fsXs,
  lineHeight: 1.5,
});

globalStyle('.tl-select, .ac-select', {
  display: 'block',
  width: '100%',
  padding: '9px 12px',
  border: 0,
  borderLeft: '2px solid transparent',
  background: 'transparent',
  color: 'inherit',
  fontFamily: 'inherit',
  textAlign: 'left',
});

globalStyle('button.tl-select, button.ac-select', {
  cursor: 'pointer',
});

globalStyle('button.tl-select:hover, button.ac-select:hover', {
  background: vars.bgSurface,
});

globalStyle('.tl-select.active, .ac-select.active', {
  background: vars.kindDecisionBg,
  borderLeftColor: vars.kindDecision,
});

globalStyle('.tl-head', {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '10px',
});

globalStyle('.tl-head strong:first-child', {
  fontSize: vars.fsBase,
  fontWeight: 600,
});

globalStyle('.tl-head strong:last-child', {
  fontFamily: vars.fontMono,
  fontSize: vars.fsBase,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
});

globalStyle('.tl-bars', {
  display: 'block',
  marginTop: '3px',
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
});

globalStyle('.tl-prices', {
  display: 'grid',
  gridTemplateColumns: 'repeat(4,1fr)',
  gap: '8px',
  padding: '0 12px 9px',
});

globalStyle('.tl-prices dt', {
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
});

globalStyle('.tl-prices dd', {
  marginTop: '1px',
  fontFamily: vars.fontMono,
  fontSize: vars.fsSm,
  fontVariantNumeric: 'tabular-nums',
});

globalStyle('.tl-reason, .ac-reason', {
  padding: '0 12px 10px',
  color: vars.textSecondary,
  fontSize: vars.fsSm,
  lineHeight: 1.55,
});

globalStyle('.tl-reason b', {
  display: 'inline-block',
  marginBottom: '3px',
  color: vars.kindDecision,
  fontSize: vars.fsXs,
});

globalStyle('.ac-select', {
  display: 'grid',
  gridTemplateColumns: '24px minmax(0,1fr)',
  gap: '8px',
});

globalStyle('.ac-step', {
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
});

globalStyle('.ac-body strong, .ac-body em', {
  display: 'block',
});

globalStyle('.ac-body strong', {
  fontSize: vars.fsSm,
  fontWeight: 600,
});

globalStyle('.ac-body em', {
  marginTop: '3px',
  color: vars.textMuted,
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
  fontStyle: 'normal',
});

globalStyle('.ac-reason', {
  paddingLeft: '46px',
});
