import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { persister } from '@web/lib/queryClient';
import { Button } from '@web/ui';
import { colors, fonts, fontSizes, radii } from '../../theme/tokens.stylex';

const styles = stylex.create({
  root: {
    alignItems: 'center',
    backgroundColor: colors.backgroundCanvas,
    display: 'flex',
    height: '100%',
    justifyContent: 'center',
    minHeight: 0,
    overflowY: 'auto',
    padding: '32px 24px',
  },
  panel: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    boxShadow: `inset 2px 0 0 ${colors.down}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: '520px',
    padding: '16px',
    width: '100%',
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.lg,
    fontWeight: 600,
  },
  message: {
    color: colors.down,
    fontFamily: fonts.mono,
    fontSize: fontSizes.base,
    lineHeight: 1.6,
    overflowWrap: 'anywhere',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  stack: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    paddingTop: '10px',
  },
  stackSummary: {
    color: colors.textSecondary,
    cursor: 'pointer',
    fontSize: fontSizes.sm,
  },
  stackBody: {
    backgroundColor: colors.backgroundCanvas,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
    margin: '10px 0 0',
    maxHeight: '220px',
    overflow: 'auto',
    padding: '10px',
    whiteSpace: 'pre',
  },
  reset: {
    'alignSelf': 'flex-start',
    'backgroundColor': 'transparent',
    'borderWidth': 0,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'fontFamily': 'inherit',
    'fontSize': fontSizes.sm,
    'padding': 0,
    'textAlign': 'left',
    'textDecoration': 'underline',
    'textUnderlineOffset': '2px',
    ':hover': {
      color: colors.textSecondary,
    },
    ':disabled': {
      color: colors.textMuted,
      cursor: 'default',
      opacity: 0.5,
    },
  },
});

interface Described {
  title: string;
  message: string;
  stack: string | null;
}

function describe(error: unknown): Described {
  if (isRouteErrorResponse(error))
    return {
      title: error.status === 404 ? '这个页面不存在' : `这个页面打不开（${error.status}）`,
      message: error.statusText || String(error.data ?? ''),
      stack: null,
    };
  if (error instanceof Error)
    return { title: '这个页面崩了', message: error.message, stack: error.stack ?? null };
  return { title: '这个页面崩了', message: String(error), stack: null };
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  // react-router's own hook, not lib/router's navigate: this module is pulled in while the route
  // table is still being built, and reaching back into lib/router closes an import cycle.
  const navigate = useNavigate();
  const { title, message, stack } = describe(error);
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);

  const report = [
    `Kansoku ${__APP_VERSION__}`,
    window.location.pathname + window.location.search,
    message,
    stack ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  const copy = () => {
    void navigator.clipboard.writeText(report).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  // The crash that made this screen worth building came from a persisted query snapshot written by
  // an older release, and reloading alone restores the very same snapshot — so the one escape hatch
  // that actually ends that loop belongs here, in front of whoever is stuck in it.
  const clearCache = () => {
    setClearing(true);
    void Promise.resolve(persister.removeClient()).finally(() => window.location.reload());
  };

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.title)}>{title}</div>
        <div {...stylex.props(styles.message)}>{message}</div>
        <div {...stylex.props(styles.actions)}>
          <Button accent onClick={() => void navigate('/')}>
            回首页
          </Button>
          <Button onClick={() => window.location.reload()}>重新加载</Button>
          <Button state={copied ? 'done' : undefined} onClick={copy}>
            {copied ? '已复制' : '复制详情'}
          </Button>
        </div>
        {stack && (
          <details {...stylex.props(styles.stack)}>
            <summary {...stylex.props(styles.stackSummary)}>技术细节</summary>
            <pre {...stylex.props(styles.stackBody)}>{stack}</pre>
          </details>
        )}
        <button {...stylex.props(styles.reset)} disabled={clearing} onClick={clearCache}>
          还是打不开？清掉本地缓存再重开 —— 只丢掉缓存的行情和列表，你的数据不动
        </button>
      </div>
    </div>
  );
}
