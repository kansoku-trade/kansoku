import { useEffect, useState } from "react";
import type { CockpitComment } from "../../../../shared/types";
import { api } from "../../api";

interface CommentEnvelope {
  type: "init" | "comment";
  comments?: CockpitComment[];
  comment?: CockpitComment;
}

export function useCockpitComments(symbol: string): {
  comments: CockpitComment[];
  error: string | null;
  loaded: boolean;
} {
  const [comments, setComments] = useState<CockpitComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setComments([]);
    setError(null);
    setLoaded(false);
    let cancelled = false;

    api<CockpitComment[]>(`/api/symbols/${encodeURIComponent(symbol)}/comments`)
      .then((d) => {
        if (!cancelled) {
          setComments(d);
          setLoaded(true);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoaded(true);
        }
      });

    const es = new EventSource(`/api/stream/comments/${encodeURIComponent(symbol)}`);
    es.onmessage = (e) => {
      let env: CommentEnvelope;
      try {
        env = JSON.parse(e.data) as CommentEnvelope;
      } catch {
        return;
      }
      if (env.type === "init" && env.comments) {
        setComments(env.comments);
        setLoaded(true);
      } else if (env.type === "comment" && env.comment) {
        const c = env.comment;
        setComments((prev) => (prev.some((p) => p.ts === c.ts && p.text === c.text) ? prev : [...prev, c]));
      }
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [symbol]);

  return { comments, error, loaded };
}
