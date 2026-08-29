import * as stylex from '@stylexjs/stylex';
import { Button, Card } from '../../ui';
import type { CredentialsGetResult } from '../settings/desktopCredentials';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';

const INSTALL_URL = 'https://open.longbridge.com/docs/cli/install';

const styles = stylex.create({
  card: {
    maxWidth: '480px',
    width: '100%',
  },
  heading: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: 600,
    marginBottom: '10px',
  },
  explainer: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 1.6,
    marginBottom: '14px',
  },
  cliCommand: {
    backgroundColor: colors.backgroundElement,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    margin: '0 0 14px',
    overflowX: 'auto',
    padding: '12px 14px',
  },
  welcome: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 1.6,
    marginBottom: '14px',
  },
  actions: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
    marginTop: '12px',
  },
  testResult: {
    fontSize: fontSizes.sm,
  },
  testResultFail: {
    color: colors.down,
  },
});

export function StepLongbridge({
  status,
  onRecheck,
}: {
  status: CredentialsGetResult | null;
  onRecheck: () => void;
}) {
  const state = status?.state ?? 'cli_missing';
  const title =
    state === 'cli_missing'
      ? '安装 Longbridge CLI'
      : state === 'login_required'
        ? '登录长桥账号'
        : '修复登录状态';
  const command =
    state === 'cli_missing'
      ? 'curl -fsSL https://open.longbridge.com/longbridge/longbridge-terminal/install | sh'
      : 'longbridge auth login';
  const explanation =
    state === 'cli_missing'
      ? 'Kansoku 使用本机 Longbridge CLI 获取行情和账户数据。安装完成后请返回这里重新检测。'
      : state === 'login_required'
        ? 'CLI 已安装，但尚未登录。请在终端执行登录命令，并在浏览器中完成授权。'
        : 'CLI 的登录文件无法读取或已经失效。请重新登录；如果问题持续，请升级 Longbridge CLI。';

  return (
    <Card className={`onboarding-card ${stylex.props(styles.card).className}`}>
      <p {...stylex.props(styles.welcome)}>
        欢迎使用 Kansoku —— 先连上行情数据，再配一下 AI，就能开始了。
      </p>
      <h1 className={stylex.props(styles.heading).className}>{title}</h1>
      <p className={`onboarding-explainer ${stylex.props(styles.explainer).className}`}>
        {explanation}
      </p>
      <pre className={`onboarding-cli-command ${stylex.props(styles.cliCommand).className}`}>
        <code>{command}</code>
      </pre>
      {status?.cliPath && (
        <p className={`onboarding-explainer ${stylex.props(styles.explainer).className}`}>
          已找到：{status.cliPath}
        </p>
      )}
      {status?.lastError && (
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(styles.testResult, styles.testResultFail).className}`}
        >
          {status.lastError}
        </div>
      )}
      <div className={`settings-cred-actions ${stylex.props(styles.actions).className}`}>
        <Button onClick={() => window.open(INSTALL_URL, '_blank', 'noopener,noreferrer')}>
          查看安装说明
        </Button>
        <Button accent onClick={onRecheck}>
          重新检测
        </Button>
      </div>
    </Card>
  );
}
