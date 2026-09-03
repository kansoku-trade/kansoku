import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { ArrowLeft } from 'lucide-react';
import { isDesktopRealtime } from '@web/lib/portTransport';
import { navigate } from '@web/lib/router';
import { ScrollArea } from '@web/ui';
import { useTitle } from '@web/lib/useTitle';
import { SETTINGS_SECTIONS, findSettingsSection } from './sections';
import type { SettingsSectionId } from './types';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';

const styles = stylex.create({
  page: {
    'margin': 0,
    'maxWidth': 'none',
    'padding': 0,
    'width': '100%',
    '@media (min-width: 1001px)': {
      height: '100cqh',
      minHeight: 0,
      overflow: 'hidden',
    },
  },
  pageDesktop: {
    '@media (min-width: 1001px)': {
      height: 'calc(100cqh - 40px)',
    },
  },
  viewport: {
    'height': 'auto',
    '@media (min-width: 1001px)': {
      height: '100%',
    },
  },
  content: {
    'margin': '0 auto',
    'maxWidth': '1024px',
    'padding': '0 20px',
    'width': '100%',
    '@media (max-width: 860px)': {
      paddingInline: '12px',
    },
  },
  shell: {
    'display': 'grid',
    'gridTemplateColumns': '200px minmax(0, 1fr)',
    '@media (max-width: 860px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  rail: {
    'borderRightColor': colors.border,
    'borderRightStyle': 'solid',
    'borderRightWidth': '1px',
    'minWidth': 0,
    '@media (max-width: 860px)': {
      borderBottomColor: colors.border,
      borderBottomStyle: 'solid',
      borderBottomWidth: '1px',
      borderRightWidth: 0,
    },
  },
  railInner: {
    'display': 'flex',
    'flexDirection': 'column',
    'gap': '1px',
    'padding': '20px 12px 20px 0',
    'position': 'sticky',
    'top': 0,
    '@media (max-width: 860px)': {
      backgroundColor: colors.backgroundCanvas,
      flexDirection: 'row',
      gap: '6px',
      overflowX: 'auto',
      padding: '10px 0',
      zIndex: 1,
    },
  },
  backLink: {
    'alignItems': 'center',
    'color': {
      'default': colors.textSecondary,
      ':hover': colors.textPrimary,
    },
    'display': 'inline-flex',
    'fontSize': fontSizes.control,
    'gap': '4px',
    'marginBottom': '8px',
    'paddingInline': '7px',
    '@media (max-width: 860px)': {
      display: 'none',
    },
  },
  railLink: {
    'alignItems': 'center',
    'backgroundColor': {
      'default': 'transparent',
      ':hover': colors.backgroundSurface,
    },
    'borderRadius': radii.default,
    'color': {
      'default': colors.textSecondary,
      ':hover': colors.textPrimary,
    },
    'display': 'flex',
    'fontSize': fontSizes.control,
    'gap': '8px',
    'outline': {
      ':focus-visible': colors.focusOutline,
    },
    'outlineOffset': '1px',
    'padding': '6px 7px',
    'textDecoration': 'none',
    'width': '100%',
    '@media (max-width: 860px)': {
      borderRadius: radii.full,
      flex: 'none',
      whiteSpace: 'nowrap',
      width: 'auto',
    },
  },
  railLinkActive: {
    backgroundColor: colors.backgroundElement,
    color: colors.textBright,
  },
  icon: {
    verticalAlign: '-2px',
  },
  railIcon: {
    flex: 'none',
  },
  railIconActive: {
    color: colors.accent,
  },
  pane: {
    'display': 'flex',
    'flexDirection': 'column',
    'gap': '12px',
    'minWidth': 0,
    'padding': '20px 0 60px 20px',
    '@media (max-width: 860px)': {
      padding: '14px 0 40px',
    },
  },
  paneBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '22px',
    maxWidth: '720px',
    minWidth: 0,
  },
  heading: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: 600,
    margin: '0 0 4px',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.base,
    marginBottom: '4px',
  },
  aboutLink: {
    fontSize: fontSizes.sm,
    marginTop: '24px',
    maxWidth: '720px',
    textAlign: 'center',
  },
  aboutLinkAnchor: {
    color: {
      'default': colors.textMuted,
      ':hover': colors.textPrimary,
    },
  },
});

function SettingsBackLink() {
  return (
    <a
      className={`settings-back-link ${stylex.props(styles.backLink).className}`}
      href="/"
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        if (window.history.length > 1) window.history.back();
        else navigate('/');
      }}
    >
      <ArrowLeft className={`icon ${stylex.props(styles.icon).className}`} size={13} /> 返回
    </a>
  );
}

function SettingsRail({ active }: { active: SettingsSectionId }) {
  return (
    <nav className={`settings-rail ${stylex.props(styles.rail).className}`} aria-label="设置分类">
      <div className={`settings-rail-inner ${stylex.props(styles.railInner).className}`}>
        <SettingsBackLink />
        {SETTINGS_SECTIONS.map(({ id, label, Icon }) => {
          const current = id === active;
          return (
            <a
              key={id}
              href={`/settings/${id}`}
              aria-current={current ? 'page' : undefined}
              {...stylex.props(styles.railLink, current && styles.railLinkActive)}
            >
              <Icon
                size={14}
                {...stylex.props(styles.railIcon, current && styles.railIconActive)}
              />
              {label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function SettingsPageScrollArea({ children }: { children: ReactNode }) {
  const pageStyle = stylex.props(styles.page, isDesktopRealtime() && styles.pageDesktop);
  return (
    <ScrollArea
      className={`page settings-page ${pageStyle.className}`}
      viewportClassName={`settings-page-viewport ${stylex.props(styles.viewport).className}`}
      contentClassName={`settings-page-content ${stylex.props(styles.content).className}`}
    >
      {children}
    </ScrollArea>
  );
}

export function SettingsPage({ section }: { section: SettingsSectionId }) {
  const active = findSettingsSection(section) ?? SETTINGS_SECTIONS[0];
  useTitle('设置');
  const { Pane } = active;

  return (
    <SettingsPageScrollArea>
      <div className={`settings-shell ${stylex.props(styles.shell).className}`}>
        <SettingsRail active={active.id} />
        <div className={`settings-pane ${stylex.props(styles.pane).className}`}>
          <div {...stylex.props(styles.paneBody)}>
            <h1 {...stylex.props(styles.heading)}>{active.label}</h1>
            <div className={`settings-pane-subtitle ${stylex.props(styles.subtitle).className}`}>
              {active.description}
            </div>
            <Pane />
          </div>
          <div className={`settings-about-link ${stylex.props(styles.aboutLink).className}`}>
            <a {...stylex.props(styles.aboutLinkAnchor)} href="/about">
              关于 Kansoku · 版本 {__APP_VERSION__}
            </a>
          </div>
        </div>
      </div>
    </SettingsPageScrollArea>
  );
}
