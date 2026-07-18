import { useCallback, useEffect, useMemo, useState } from "react";
import type { AssistantSessionMeta } from "@kansoku/core/contract/index";
import { useQuery } from "@web/apiHooks";
import { client } from "@web/client";

export interface AssistantSessionsState {
  sessions: AssistantSessionMeta[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  create: (title?: string) => Promise<AssistantSessionMeta>;
  remove: (id: string) => Promise<void>;
}

export function mergeOptimisticSessions(
  sessions: AssistantSessionMeta[],
  pending: AssistantSessionMeta[],
): AssistantSessionMeta[] {
  const missing = pending.filter((session) => !sessions.some((existing) => existing.id === session.id));
  return missing.length ? [...missing, ...sessions] : sessions;
}

export function useAssistantSessions(): AssistantSessionsState {
  const {
    data,
    error,
    loading,
    reload: refresh,
  } = useQuery<AssistantSessionMeta[]>("assistant.sessions", () => client.assistant.listSessions().then((res) => res.sessions));

  const [pending, setPending] = useState<AssistantSessionMeta[]>([]);

  useEffect(() => {
    if (!data) return;
    setPending((prev) => prev.filter((session) => !data.some((existing) => existing.id === session.id)));
  }, [data]);

  const sessions = useMemo(() => mergeOptimisticSessions(data ?? [], pending), [data, pending]);

  const create = useCallback(
    async (title?: string): Promise<AssistantSessionMeta> => {
      const { session } = await client.assistant.createSession({ title });
      setPending((prev) => [session, ...prev]);
      refresh();
      return session;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await client.assistant.deleteSession({ id });
      refresh();
    },
    [refresh],
  );

  return {
    sessions,
    loading,
    error,
    refresh,
    create,
    remove,
  };
}
