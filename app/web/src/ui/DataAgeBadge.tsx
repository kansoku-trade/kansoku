import { useEffect, useState } from "react";
import { Badge } from "./Badge";

export function formatDataAge(ageMs: number): string {
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 60) return "数据为刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `数据为 ${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `数据为 ${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `数据为 ${days} 天前`;
}

export function DataAgeBadge({ at, className }: { at: number | null | undefined; className?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (at == null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [at]);

  if (at == null) return null;

  return (
    <Badge tone="muted" className={`data-age-badge${className ? ` ${className}` : ""}`}>
      {formatDataAge(now - at)}
    </Badge>
  );
}
