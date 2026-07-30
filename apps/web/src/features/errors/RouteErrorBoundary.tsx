import { useState } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { persister } from '@web/lib/queryClient';
import { Button } from '@web/ui';

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
    <div className="route-error">
      <div className="route-error-panel">
        <div className="route-error-title">{title}</div>
        <div className="route-error-message">{message}</div>
        <div className="route-error-actions">
          <Button accent onClick={() => void navigate('/')}>
            回首页
          </Button>
          <Button onClick={() => window.location.reload()}>重新加载</Button>
          <Button state={copied ? 'done' : undefined} onClick={copy}>
            {copied ? '已复制' : '复制详情'}
          </Button>
        </div>
        {stack && (
          <details className="route-error-stack">
            <summary className="route-error-stack-summary">技术细节</summary>
            <pre className="route-error-stack-body">{stack}</pre>
          </details>
        )}
        <button className="route-error-reset" disabled={clearing} onClick={clearCache}>
          还是打不开？清掉本地缓存再重开 —— 只丢掉缓存的行情和列表，你的数据不动
        </button>
      </div>
    </div>
  );
}
