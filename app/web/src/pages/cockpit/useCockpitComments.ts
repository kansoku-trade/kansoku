import { useEffect, useState } from "react";
import type { CockpitComment } from "../../../../shared/types";
import { useQuery } from "../../apiHooks";

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

export function useCockpitComments(symbol: string): {
  comments: CockpitComment[];
  error: string | null;
  loaded: boolean;
} {
  const [comments, setComments] = useState<CockpitComment[]>([]);
  const [streamLoaded, setStreamLoaded] = useState(false);
  const commentsUrl = `/api/symbols/${encodeURIComponent(symbol)}/comments`;
  const { data: initialComments, error, loading } = useQuery<CockpitComment[]>(commentsUrl);

  useEffect(() => {
    setComments([]);
    setStreamLoaded(false);
  }, [symbol]);

  useEffect(() => {
    if (initialComments) setComments((prev) => mergeComments(prev, initialComments));
  }, [initialComments]);

  useEffect(() => {
    let cancelled = false;
    const es = new EventSource(`/api/stream/comments/${encodeURIComponent(symbol)}`);
    es.onmessage = (e) => {
      if (cancelled) return;
      let env: CommentEnvelope;
      try {
        env = JSON.parse(e.data) as CommentEnvelope;
      } catch {
        return;
      }
      if (env.type === "init" && env.comments) {
        setComments((prev) => mergeComments(prev, env.comments ?? []));
        setStreamLoaded(true);
      } else if (env.type === "comment" && env.comment) {
        const c = env.comment;
        setComments((prev) => mergeComments(prev, [c]));
      }
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [symbol]);

  return { comments, error, loaded: streamLoaded || !loading };
}
