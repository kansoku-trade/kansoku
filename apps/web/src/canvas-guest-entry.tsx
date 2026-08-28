import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadCanvasComponent } from './features/canvas/canvasRuntime';

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
      return <pre style={{ margin: 16, color: '#ef5350', whiteSpace: 'pre-wrap' }}>{this.state.error}</pre>;
    }
    return this.props.children;
  }
}

function report(message: { type: 'ok' } | { type: 'runtime-error'; issues: string[]; stage: 'compile' | 'runtime' }) {
  parent.postMessage(message, '*');
}

function renderIssues(issues: string[]): void {
  root.render(
    <pre style={{ margin: 16, color: '#ef5350', whiteSpace: 'pre-wrap' }}>{issues.join('\n')}</pre>,
  );
}

window.addEventListener('message', (event) => {
  const data = event.data as { type?: string; source?: string } | null;
  if (!data || data.type !== 'source' || typeof data.source !== 'string') return;
  const result = loadCanvasComponent(data.source);
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
