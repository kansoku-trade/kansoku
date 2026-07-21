import { globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

globalStyle('.top', {
  borderBottom: `1px solid ${vars.border}`,
  background: vars.bgSurface,
  position: 'sticky',
  top: 0,
  zIndex: 10,
});

globalStyle('.top .inner', {
  maxWidth: '1440px',
  margin: '0 auto',
  padding: '10px 24px',
  display: 'flex',
  alignItems: 'center',
  gap: '24px',
});

globalStyle('.brand', {
  fontWeight: 700,
  fontSize: '14px',
  letterSpacing: '-.02em',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

globalStyle('.brand::before', {
  content: '""',
  width: '6px',
  height: '6px',
  background: vars.accent,
  borderRadius: '1px',
});

globalStyle('.brand span', {
  color: vars.textMuted,
  fontWeight: 400,
});

globalStyle('.top .r', {
  marginLeft: 'auto',
  display: 'flex',
  gap: '14px',
  fontSize: vars.fsSm,
  color: vars.textMuted,
  alignItems: 'center',
});

globalStyle('.top .r kbd', {
  fontFamily: vars.fontMono,
  fontSize: vars.fsXs,
  border: `1px solid ${vars.border}`,
  borderRadius: vars.radius,
  padding: '2px 6px',
  background: vars.bgElement,
  color: vars.textSecondary,
});

globalStyle('.page', {
  maxWidth: '1440px',
  margin: '0 auto',
  padding: '20px 24px 60px',
});

globalStyle('.mstrip', {
  display: 'flex',
  alignItems: 'baseline',
  gap: '18px',
  padding: '6px 0 18px',
  flexWrap: 'wrap',
});

globalStyle('.mstrip h1', {
  fontSize: vars.fsXl,
  fontWeight: 600,
  letterSpacing: '-.02em',
});

globalStyle('.mstrip .sub', {
  color: vars.textMuted,
  fontSize: vars.fsMd,
});

globalStyle('.mstrip .kvs', {
  marginLeft: 'auto',
  display: 'flex',
  gap: '1px',
  fontSize: vars.fsSm,
  color: vars.textSecondary,
  border: `1px solid ${vars.border}`,
  borderRadius: vars.radius,
  background: vars.border,
  overflow: 'hidden',
});

globalStyle('.mstrip .kvs span', {
  padding: '6px 12px',
  background: vars.bgSurface,
  whiteSpace: 'nowrap',
});

globalStyle('.mstrip .kvs b', {
  color: vars.textPrimary,
  fontWeight: 500,
  marginLeft: '6px',
  fontFamily: vars.fontMono,
  fontVariantNumeric: 'tabular-nums',
});

globalStyle('.foot', {
  marginTop: '20px',
  padding: '14px 0',
  fontSize: vars.fsSm,
  color: vars.textMuted,
  display: 'flex',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '12px',
});

globalStyle('.foot a', {
  color: vars.textSecondary,
  textDecoration: 'none',
});

globalStyle('.foot a:hover', {
  textDecoration: 'underline',
});
