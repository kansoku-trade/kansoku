import { globalStyle } from '@vanilla-extract/css';
import { vars } from './theme.css';

globalStyle('.trade-sidebar', {
  background: '#fafafa',
  position: 'relative',
  minHeight: 0,
});

globalStyle('.trade-sidebar-scroll', {
  position: 'absolute',
  inset: 0,
  overflowY: 'auto',
  scrollbarWidth: 'thin',
});

globalStyle('.trade-sidebar section, .actions', {
  padding: '10px 12px',
  borderBottom: `1px solid ${vars.line}`,
});

globalStyle('.trade-sidebar h4', {
  margin: '0 0 8px',
  fontSize: '11px',
});

globalStyle('.facts', {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '7px 12px',
  margin: 0,
});

globalStyle('.facts div', {
  minWidth: 0,
});

globalStyle('.facts dt', {
  color: vars.muted,
  fontSize: '9px',
});

globalStyle('.facts dd', {
  margin: '1px 0 0',
  font: `600 11px ${vars.mono}`,
});

globalStyle('.rationale', {
  margin: '8px 0 0',
  paddingTop: '8px',
  borderTop: `1px solid ${vars.line}`,
  color: vars.muted,
  fontSize: '10px',
});

globalStyle('.actions', {
  padding: 0,
});

globalStyle('.actions summary', {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '9px 12px',
  cursor: 'pointer',
  fontSize: '10px',
  fontWeight: 650,
});

globalStyle('.actions summary span', {
  color: vars.muted,
});

globalStyle('.actions p', {
  margin: 0,
  padding: '0 12px 10px',
  color: vars.muted,
  fontSize: '10px',
});

globalStyle('.actions ol', {
  listStyle: 'none',
  margin: 0,
  padding: '0 12px 8px',
});

globalStyle('.actions li', {
  display: 'grid',
  gridTemplateColumns: '22px 58px 1fr',
  gap: '6px',
  padding: '5px 0',
  borderTop: `1px solid ${vars.line}`,
  fontSize: '9px',
});

globalStyle('.actions li > span, .actions li small', {
  color: vars.muted,
  fontFamily: vars.mono,
});

globalStyle('.audit-panel > summary', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '11px 12px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 650,
});

globalStyle('.audit-panel > summary small', {
  marginLeft: '8px',
  color: vars.muted,
  fontWeight: 400,
});

globalStyle('.audit-grid', {
  display: 'grid',
  gridTemplateColumns: 'repeat(3,1fr)',
  gap: '1px',
  background: vars.line,
  borderTop: `1px solid ${vars.line}`,
});

globalStyle('.audit-check', {
  display: 'grid',
  gridTemplateColumns: '20px 1fr',
  gap: '7px',
  padding: '8px',
  background: '#fff',
});

globalStyle('.audit-check i', {
  display: 'grid',
  placeItems: 'center',
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  background: '#e9f9f2',
  color: vars.green,
  fontStyle: 'normal',
  fontSize: '10px',
});

globalStyle('.audit-check.fail i', {
  background: '#fff0f0',
  color: vars.red,
});

globalStyle('.audit-check strong, .audit-check small, .audit-check em', {
  display: 'block',
});

globalStyle('.audit-check strong', {
  fontSize: '10px',
});

globalStyle('.audit-check small', {
  color: vars.muted,
  font: `8px ${vars.mono}`,
});

globalStyle('.audit-check em', {
  marginTop: '3px',
  color: vars.muted,
  fontSize: '9px',
  fontStyle: 'normal',
});

globalStyle('.trade-sidebar-scroll', {
  '@media': {
    '(max-width:1050px)': {
      position: 'static',
      overflow: 'visible',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
    },
    '(max-width:680px)': { display: 'block' },
  },
});

globalStyle('.audit-grid', {
  '@media': {
    '(max-width:1050px)': { gridTemplateColumns: 'repeat(2,1fr)' },
    '(max-width:680px)': { gridTemplateColumns: '1fr' },
  },
});

globalStyle('.audit-panel > summary small', {
  '@media': {
    '(max-width:680px)': { display: 'none' },
  },
});

globalStyle('.trade-sidebar-scroll', {
  '@media': {
    print: { position: 'static', overflow: 'visible' },
  },
});
