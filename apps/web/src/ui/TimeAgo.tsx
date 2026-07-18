import { useEffect, useState } from 'react';

interface TimeAgoProps {
  since: string | null | undefined;
  format?: 'ago' | 'duration';
}

// The clock must be state the render reads: React Compiler memoizes render
// output by consumed values, so a write-only tick never refreshes the label.
export function TimeAgo({ since, format = 'ago' }: TimeAgoProps) {
  const tickMs = format === 'duration' ? 1000 : 30_000;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!since) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(timer);
  }, [since, tickMs]);

  if (!since) return null;
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  if (format === 'ago') return <>{formatAgo(seconds)}</>;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return <>{m > 0 ? `${m}分${s}秒` : `${s}秒`}</>;
}

export function formatAgo(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
