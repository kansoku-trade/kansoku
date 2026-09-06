import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { formatRuntime } from './presentTranscript.js';
import { turnHeaderStyles } from './TurnHeader.js';

export function TurnRuntime({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = now - Date.parse(startedAt);
  return (
    <div className={`chat-runtime ${stylex.props(turnHeaderStyles.row).className}`}>
      <span>{formatRuntime(elapsed)}</span>
      <span className={stylex.props(turnHeaderStyles.rule).className} aria-hidden="true" />
    </div>
  );
}
