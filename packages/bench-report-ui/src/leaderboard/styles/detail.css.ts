import { globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

globalStyle('.detailcard', {
  background: vars.bgSurface,
  border: `1px solid ${vars.border}`,
  padding: '14px 16px',
});

globalStyle('.detail h4', {
  fontSize: vars.fsMd,
  fontWeight: 600,
  letterSpacing: '-.01em',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '2px',
});

globalStyle('.detail .did', {
  fontFamily: vars.fontMono,
  fontSize: vars.fsSm,
  color: vars.textMuted,
  marginBottom: '12px',
});

globalStyle('.detailgrid', {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '6px 20px',
});

globalStyle('.drow', {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: vars.fsBase,
  padding: '5px 0',
  borderBottom: `1px dotted ${vars.border}`,
});

globalStyle('.drow .k', {
  color: vars.textMuted,
});

globalStyle('.drow .v', {
  fontFamily: vars.fontMono,
  fontVariantNumeric: 'tabular-nums',
  color: vars.textPrimary,
  fontWeight: 500,
});

globalStyle('.drow .v.positive', {
  color: vars.up,
});

globalStyle('.drow .v.negative', {
  color: vars.down,
});

globalStyle('.dsec', {
  gridColumn: 'span 2',
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: vars.accent,
  paddingTop: '10px',
  marginTop: '6px',
  borderTop: `1px solid ${vars.border}`,
});

globalStyle('.dsec:first-of-type', {
  paddingTop: 0,
  marginTop: 0,
  borderTop: 0,
});
