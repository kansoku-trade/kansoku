import { useEffect, useMemo, useState } from "react";
import type { CockpitComment } from "../../../../shared/types";

export interface AiUnreadBadgeState {
  unread: number;
  latestAlert: CockpitComment | null;
}

export function useAiUnreadBadge(
  sym: string,
  comments: CockpitComment[],
  commentsLoaded: boolean,
  activeTab: string,
): AiUnreadBadgeState {
  const warnAlertCount = comments.reduce((n, c) => (c.level === "warn" || c.level === "alert" ? n + 1 : n), 0);
  const [readCount, setReadCount] = useState<number | null>(null);
  useEffect(() => {
    setReadCount(null);
  }, [sym]);
  useEffect(() => {
    if (commentsLoaded && readCount === null) setReadCount(warnAlertCount);
  }, [commentsLoaded, readCount, warnAlertCount]);
  useEffect(() => {
    if (activeTab === "ai") setReadCount(warnAlertCount);
  }, [activeTab, warnAlertCount]);
  const unread = activeTab === "ai" || readCount === null ? 0 : Math.max(0, warnAlertCount - readCount);

  const latestAlert = useMemo(() => {
    for (let i = comments.length - 1; i >= 0; i--) {
      const c = comments[i];
      if (c.level === "warn" || c.level === "alert") return c;
    }
    return null;
  }, [comments]);

  return { unread, latestAlert };
}
