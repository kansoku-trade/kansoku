import { globalStyle } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

globalStyle('.ui-select', {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  height: vars.controlH,
  minWidth: '116px',
  padding: '0 8px',
  border: `1px solid ${vars.border}`,
  borderRadius: vars.radius,
  background: vars.bgElement,
  color: vars.textPrimary,
  fontFamily: 'inherit',
  fontSize: vars.fsSm,
  cursor: 'pointer',
});

globalStyle('.ui-select:hover', {
  background: vars.bgHover,
  borderColor: vars.borderStrong,
});

globalStyle('.ui-select[data-popup-open]', {
  borderColor: vars.borderStrong,
});

globalStyle('.ui-select-icon', {
  display: 'flex',
  color: vars.textMuted,
});

globalStyle('.ui-select-positioner', {
  zIndex: 40,
});

globalStyle('.ui-select-popup', {
  minWidth: 'var(--anchor-width)',
  maxHeight: 'var(--available-height)',
  overflowY: 'auto',
  padding: '3px',
  border: `1px solid ${vars.borderStrong}`,
  borderRadius: vars.radius,
  background: vars.bgElement,
  boxShadow: '0 8px 28px rgb(0 0 0 / 0.55)',
});

globalStyle('.ui-select-item', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  height: '26px',
  padding: '0 7px',
  borderRadius: vars.radius,
  color: vars.textSecondary,
  fontSize: vars.fsSm,
  cursor: 'pointer',
  outline: 'none',
});

globalStyle('.ui-select-item[data-highlighted]', {
  background: vars.bgHover,
  color: vars.textPrimary,
});

globalStyle('.ui-select-item[data-selected]', {
  color: vars.textPrimary,
});

globalStyle('.ui-select-check', {
  display: 'flex',
  color: vars.accent,
});

globalStyle('.ui-input', {
  height: vars.controlH,
  padding: '0 9px',
  border: `1px solid ${vars.border}`,
  borderRadius: vars.radius,
  background: vars.bgElement,
  color: vars.textPrimary,
  fontFamily: 'inherit',
  fontSize: vars.fsSm,
  outline: 'none',
});

globalStyle('.ui-input::placeholder', {
  color: vars.textMuted,
});

globalStyle('.ui-input:hover', {
  borderColor: vars.borderStrong,
});

globalStyle('.ui-input:focus', {
  borderColor: vars.focusBorder,
  boxShadow: vars.focusRing,
});

globalStyle('.ui-toggle-group', {
  display: 'inline-flex',
  gap: '1px',
  padding: '1px',
  border: `1px solid ${vars.border}`,
  borderRadius: vars.radius,
  background: vars.bgCanvas,
});

globalStyle('.ui-toggle', {
  height: '24px',
  padding: '0 11px',
  border: 0,
  borderRadius: '1px',
  background: 'transparent',
  color: vars.textSecondary,
  fontFamily: 'inherit',
  fontSize: vars.fsSm,
  cursor: 'pointer',
});

globalStyle('.ui-toggle:hover', {
  color: vars.textPrimary,
});

globalStyle('.ui-toggle[data-pressed]', {
  background: vars.bgHover,
  color: vars.textPrimary,
  fontWeight: 600,
});

globalStyle('.ui-tip', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '3px',
  borderBottom: `1px dotted ${vars.textMuted}`,
  cursor: 'help',
});

globalStyle('.ui-tip-positioner', {
  zIndex: 50,
});

globalStyle('.ui-tip-popup', {
  maxWidth: '260px',
  padding: '6px 9px',
  border: `1px solid ${vars.borderStrong}`,
  borderRadius: vars.radius,
  background: vars.bgElement,
  color: vars.textPrimary,
  fontSize: vars.fsSm,
  lineHeight: 1.5,
  boxShadow: '0 8px 28px rgb(0 0 0 / 0.55)',
});

globalStyle('.ui-scroll', {
  position: 'relative',
  overflow: 'hidden',
});

globalStyle('.ui-scroll-viewport', {
  height: '100%',
  overscrollBehavior: 'contain',
});

globalStyle('.ui-scroll-bar', {
  display: 'flex',
  opacity: 0,
  transition: 'opacity .15s',
  background: 'rgb(255 255 255 / 0.04)',
});

globalStyle('.ui-scroll-bar[data-orientation="vertical"]', {
  width: '7px',
  margin: '2px',
});

globalStyle('.ui-scroll-bar[data-orientation="horizontal"]', {
  height: '7px',
  margin: '2px',
});

globalStyle('.ui-scroll-bar[data-hovering], .ui-scroll-bar[data-scrolling]', {
  opacity: 1,
});

globalStyle('.ui-scroll-thumb', {
  flex: 1,
  borderRadius: vars.radiusFull,
  background: vars.borderStrong,
});

globalStyle('.ui-disclosure-trigger', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
  width: '100%',
  border: 0,
  background: 'transparent',
  color: 'inherit',
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
});

globalStyle('.ui-disclosure-chevron', {
  display: 'flex',
  color: vars.textMuted,
  transition: 'transform .15s',
});

globalStyle('.ui-disclosure-trigger[data-panel-open] .ui-disclosure-chevron', {
  transform: 'rotate(180deg)',
});

globalStyle('.ui-moretext-clamp', {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

globalStyle('.ui-moretext-toggle', {
  marginTop: '3px',
  border: 0,
  padding: 0,
  background: 'transparent',
  color: vars.textSecondary,
  fontFamily: 'inherit',
  fontSize: vars.fsXs,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  cursor: 'pointer',
});

globalStyle('.ui-moretext-toggle:hover', {
  color: vars.textPrimary,
});
