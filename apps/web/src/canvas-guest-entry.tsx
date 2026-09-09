import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { runCompiledCanvas } from './features/canvas/canvasRuntime';

const root = createRoot(document.getElementById('root')!);

class GuestBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError(error.message);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <pre style={{ margin: 0, padding: 16, color: '#ef5350', whiteSpace: 'pre-wrap' }}>
          {this.state.error}
        </pre>
      );
    }
    return this.props.children;
  }
}

function report(
  message:
    { type: 'ok' } | { type: 'runtime-error'; issues: string[]; stage: 'compile' | 'runtime' },
) {
  parent.postMessage(message, '*');
}

const host = document.getElementById('root')!;
let lastHeight = 0;

function reportHeight(): void {
  const height = Math.ceil(
    Math.max(
      host.scrollHeight,
      host.getBoundingClientRect().height,
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    ),
  );
  if (height === lastHeight) return;
  lastHeight = height;
  parent.postMessage({ type: 'height', height }, '*');
}

new ResizeObserver(reportHeight).observe(host);

function renderIssues(issues: string[]): void {
  root.render(
    <pre style={{ margin: 0, padding: 16, color: '#ef5350', whiteSpace: 'pre-wrap' }}>
      {issues.join('\n')}
    </pre>,
  );
}

window.addEventListener('message', (event) => {
  const message = event.data as {
    type?: string;
    code?: string;
    data?: Record<string, unknown>;
  } | null;
  if (!message || message.type !== 'code' || typeof message.code !== 'string') return;
  const result = runCompiledCanvas(message.code, message.data ?? {});
  if (!result.ok) {
    renderIssues(result.issues);
    report({ type: 'runtime-error', issues: result.issues, stage: 'compile' });
    return;
  }
  const CanvasApp = result.Component;
  root.render(
    <GuestBoundary
      onError={(message) => report({ type: 'runtime-error', issues: [message], stage: 'runtime' })}
    >
      <CanvasApp />
    </GuestBoundary>,
  );
  report({ type: 'ok' });
});

parent.postMessage({ type: 'ready' }, '*');
