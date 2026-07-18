import { useEffect, useState } from "react";
import type { CockpitComment } from "@kansoku/shared/types";
import { marketDate } from "@kansoku/shared/time";
import { useQuery } from "@web/apiHooks";
import { client } from "@web/client";
import { subscribeChannel } from "@web/wsHub";

interface CommentEnvelope {
  type: "init" | "comment";
  comments?: CockpitComment[];
  comment?: CockpitComment;
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
        }
      },
      () => {},
    );
    return off;
  }, [symbol, live]);

  return { comments, error, loaded: streamLoaded || !loading };
}
