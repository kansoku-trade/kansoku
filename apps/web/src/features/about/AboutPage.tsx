import { ArrowLeft } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { CREDITS } from '@kansoku/shared/credits';
import { LICENSE_TEXT } from '@kansoku/shared/licenseText';
import { navigate } from '@web/lib/router';
import { Card, SectionTitle } from '@web/ui';
import { useTitle } from '@web/lib/useTitle';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: '24px 20px 60px',
  },
  hero: {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    margin: '24px 0 20px',
    textAlign: 'center',
  },
  heading: {
    margin: '8px 0 0',
  },
  icon: {
    borderRadius: '16px',
  },
  version: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  copyright: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  links: {
    fontSize: fontSizes.sm,
    marginTop: '6px',
  },
  backLink: {
    alignItems: 'center',
    color: {
      'default': colors.textSecondary,
      ':hover': colors.textPrimary,
    },
    display: 'inline-flex',
    fontSize: fontSizes.sm,
    gap: '4px',
    marginBottom: '8px',
  },
  card: {
    marginBottom: '14px',
  },
  licenseSummary: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    margin: '8px 0',
  },
  summary: {
    color: {
      'default': colors.textSecondary,
      ':hover': colors.textPrimary,
    },
    cursor: 'pointer',
    fontSize: fontSizes.sm,
    userSelect: 'none',
  },
  licenseText: {
    backgroundColor: colors.backgroundSunken,
    borderRadius: '8px',
    fontSize: fontSizes.xs,
    lineHeight: 1.5,
    marginTop: '10px',
    maxHeight: '360px',
    overflow: 'auto',
    padding: '12px',
    whiteSpace: 'pre-wrap',
  },
  credits: {
    fontSize: fontSizes.xs,
    listStyle: 'none',
    margin: '10px 0 0',
    maxHeight: '360px',
    overflow: 'auto',
    padding: 0,
  },
  credit: {
    alignItems: 'baseline',
    display: 'flex',
    gap: '8px',
    padding: '3px 2px',
  },
  creditName: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  creditVersion: {
    color: colors.textMuted,
  },
  creditLicense: {
    color: colors.textSecondary,
    minWidth: '90px',
    textAlign: 'right',
  },
});

function AboutBackLink() {
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
      <ArrowLeft className="icon" size={13} /> 返回
    </a>
  );
}

export function AboutPage() {
  useTitle('关于');
  const rootProps = stylex.props(styles.root);

  return (
    <div {...rootProps} className={`page ${rootProps.className}`}>
      <AboutBackLink />
      <div {...stylex.props(styles.hero)}>
        <img
          {...stylex.props(styles.icon)}
          src="/brand/kansoku-icon.svg"
          alt="Kansoku"
          width={72}
          height={72}
        />
        <h1 {...stylex.props(styles.heading)}>Kansoku</h1>
        <div {...stylex.props(styles.version)}>版本 {__APP_VERSION__}</div>
        <div {...stylex.props(styles.copyright)}>© 2026 Innei · AGPL-3.0 + Commons Clause</div>
        <div {...stylex.props(styles.links)}>
          <a href="https://github.com/Innei/kansoku" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </div>

      <Card {...stylex.props(styles.card)}>
        <SectionTitle>许可证</SectionTitle>
        <p {...stylex.props(styles.licenseSummary)}>
          本软件按 AGPL-3.0 授权，并附加 Commons Clause
          条款：允许使用、修改和分发，但禁止把本软件本体作为收费产品或收费服务出售。
        </p>
        <details>
          <summary {...stylex.props(styles.summary)}>查看完整许可证文本</summary>
          <pre {...stylex.props(styles.licenseText)}>{LICENSE_TEXT}</pre>
        </details>
      </Card>

      <Card {...stylex.props(styles.card)}>
        <SectionTitle>第三方开源组件</SectionTitle>
        <details>
          <summary {...stylex.props(styles.summary)}>共 {CREDITS.length} 个组件</summary>
          <ul {...stylex.props(styles.credits)}>
            {CREDITS.map((entry) => (
              <li key={`${entry.name}@${entry.version}`} {...stylex.props(styles.credit)}>
                <span {...stylex.props(styles.creditName)}>{entry.name}</span>
                <span {...stylex.props(styles.creditVersion)}>{entry.version}</span>
                <span {...stylex.props(styles.creditLicense)}>{entry.license}</span>
              </li>
            ))}
          </ul>
        </details>
      </Card>
    </div>
  );
}
