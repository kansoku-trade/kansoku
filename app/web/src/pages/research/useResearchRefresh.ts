import { useCallback, useEffect, useRef, useState } from "react";
import type { ResearchRefreshTask } from "../../../../packages/core/src/contract";
import { errorMessage } from "../../api";
import { useQuery } from "../../apiHooks";
import { client } from "../../client";
import { subscribeChannel } from "../../wsHub";

type RefreshEnvelope =
  | { type: "init"; task: ResearchRefreshTask | null }
  | { type: "task"; task: ResearchRefreshTask };

export function useResearchRefresh(path: string, onProposalReady: () => void, enabled = true) {
  const query = useQuery<ResearchRefreshTask | null>(
    enabled ? `research.refresh:${path}` : null,
    () => client.research.getRefresh({ path }),
    { cache: false },
  );
  const [liveTask, setLiveTask] = useState<ResearchRefreshTask | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const seenProposalRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let connectedOnce = false;
    return subscribeChannel(
      { kind: "research-refresh", path },
      (payload) => {
        const envelope = payload as RefreshEnvelope;
        if (envelope.type === "init" || envelope.type === "task") setLiveTask(envelope.task);
      },
      (connected) => {
        if (!connected) return;
        if (connectedOnce) query.reload();
        connectedOnce = true;
      },
    );
  }, [path, enabled, query.reload]);

  const task = liveTask ?? query.data;
  const proposalId = task?.status === "completed" ? task.report?.proposalId ?? null : null;
  useEffect(() => {
    if (!proposalId || seenProposalRef.current === proposalId) return;
    seenProposalRef.current = proposalId;
    onProposalReady();
  }, [onProposalReady, proposalId]);

  const start = useCallback(async () => {
    setPending(true);
    setActionError(null);
    try {
      const next = await client.research.startRefresh({ path });
      setLiveTask(next);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }, [path]);

  const abort = useCallback(async () => {
    setPending(true);
    setActionError(null);
    try {
      const next = await client.research.abortRefresh({ path });
      setLiveTask(next);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }, [path]);

  return {
    task,
    loading: query.loading && liveTask === null,
    pending,
    error: actionError ?? query.error,
    start,
    abort,
  };
}
