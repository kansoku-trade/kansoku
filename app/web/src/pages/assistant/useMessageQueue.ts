import { useCallback, useEffect, useRef, useState } from "react";
import { enqueueMessage, markQueueItemError, nextQueueAction, removeQueueItem, type QueueItem } from "./messageQueue.js";

let queueIdSeq = 0;

function nextQueueId(): string {
  queueIdSeq += 1;
  return `queued-${Date.now()}-${queueIdSeq}`;
}

export interface UseMessageQueueOptions {
  busy: boolean;
  onSend: (text: string) => Promise<{ ok: boolean; error?: string }>;
}

export interface MessageQueueState {
  queue: QueueItem[];
  enqueue: (text: string) => void;
  remove: (id: string) => void;
}

export function useMessageQueue({ busy, onSend }: UseMessageQueueOptions): MessageQueueState {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const wasBusyRef = useRef(busy);
  const flushingRef = useRef(false);
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  const enqueue = useCallback((text: string) => {
    setQueue((current) => enqueueMessage(current, text, nextQueueId()));
  }, []);

  const remove = useCallback((id: string) => {
    setQueue((current) => removeQueueItem(current, id));
  }, []);

  useEffect(() => {
    const prevBusy = wasBusyRef.current;
    wasBusyRef.current = busy;
    if (flushingRef.current) return;

    const action = nextQueueAction(prevBusy, busy, queueRef.current);
    const head = action.send;
    if (!head) return;

    flushingRef.current = true;
    onSendRef
      .current(head.text)
      .then((result) => {
        if (result.ok) {
          setQueue((latest) => removeQueueItem(latest, head.id));
        } else {
          setQueue((latest) => markQueueItemError(latest, head.id, result.error ?? "发送失败"));
        }
      })
      .catch((err) => {
        setQueue((latest) => markQueueItemError(latest, head.id, err instanceof Error ? err.message : "发送失败"));
      })
      .finally(() => {
        flushingRef.current = false;
      });
  }, [busy]);

  return { queue, enqueue, remove };
}
