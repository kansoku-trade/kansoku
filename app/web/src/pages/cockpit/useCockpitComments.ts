import { useEffect, useState } from "react";
import type { CockpitComment, Notice } from "../../../../shared/types";
import { marketDate } from "../../../../shared/time";
import { useQuery } from "../../apiHooks";
import { client } from "../../client";
import { maybeNotify, requestNotificationPermissionOnce } from "../../lib/notifications";
import { subscribeChannel } from "../../wsHub";

interface CommentEnvelope {
  type: "init" | "comment" | "notice";
  comments?: CockpitComment[];
  comment?: CockpitComment;
  notice?: Notice;
}

const commentKey = (comment: CockpitComment): string => `${comment.ts}\u0000${comment.text}`;

const mergeComments = (current: CockpitComment[], incoming: CockpitComment[]): CockpitComment[] => {
  const byKey = new Map(current.map((comment) => [commentKey(comment), comment]));
  incoming.forEach((comment) => byKey.set(commentKey(comment), comment));
  return [...byKey.values()].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
};

export function useCockpitComments(
  symbol: string,
  date?: string,
): {
  comments: CockpitComment[];
  error: string | null;
  loaded: boolean;
} {
  const live = !date || date === marketDate();
  const [comments, setComments] = useState<CockpitComment[]>([]);
  const [streamLoaded, setStreamLoaded] = useState(false);
  const commentsKey = date ? `symbols.comments:${symbol}:${date}` : `symbols.comments:${symbol}`;
  const { data: initialComments, error, loading } = useQuery<CockpitComment[]>(commentsKey, () =>
    client.symbols.comments({ sym: symbol, date }),
  );

  useEffect(() => {
    requestNotificationPermissionOnce();
  }, []);

  useEffect(() => {
    setComments([]);
    setStreamLoaded(false);
  }, [symbol, date]);

  useEffect(() => {
    if (initialComments) setComments((prev) => mergeComments(prev, initialComments));
  }, [initialComments]);

  useEffect(() => {
    if (!live) return;
    const off = subscribeChannel(
      { kind: "comments", symbol },
      (payload) => {
        const env = payload as CommentEnvelope;
        if (env.type === "init" && env.comments) {
          setComments((prev) => mergeComments(prev, env.comments ?? []));
          setStreamLoaded(true);
        } else if (env.type === "comment" && env.comment) {
          const c = env.comment;
          setComments((prev) => mergeComments(prev, [c]));
          maybeNotify({ type: "comment", live: true, symbol: c.symbol, level: c.level, text: c.text });
        } else if (env.type === "notice" && env.notice) {
          maybeNotify({ type: "notice", live: true, notice: env.notice });
        }
      },
      () => {},
    );
    return off;
  }, [symbol, live]);

  return { comments, error, loaded: streamLoaded || !loading };
}
