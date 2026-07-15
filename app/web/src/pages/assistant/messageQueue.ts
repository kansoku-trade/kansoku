export interface QueueItem {
  id: string;
  text: string;
  error: string | null;
}

export function enqueueMessage(queue: QueueItem[], text: string, id: string): QueueItem[] {
  return [...queue, { id, text, error: null }];
}

export function removeQueueItem(queue: QueueItem[], id: string): QueueItem[] {
  return queue.filter((item) => item.id !== id);
}

export function markQueueItemError(queue: QueueItem[], id: string, error: string): QueueItem[] {
  return queue.map((item) => (item.id === id ? { ...item, error } : item));
}

export function popQueueHead(queue: QueueItem[]): { head: QueueItem | null; rest: QueueItem[] } {
  if (queue.length === 0) return { head: null, rest: queue };
  const [head, ...rest] = queue;
  return { head, rest };
}

export function canAutoSend(queue: QueueItem[]): boolean {
  const head = queue[0];
  return Boolean(head) && head.error === null;
}

export interface QueueAction {
  send: QueueItem | null;
  queue: QueueItem[];
}

export function nextQueueAction(prevBusy: boolean, busy: boolean, queue: QueueItem[]): QueueAction {
  const becameIdle = prevBusy && !busy;
  if (!becameIdle || !canAutoSend(queue)) return { send: null, queue };
  const { head } = popQueueHead(queue);
  return { send: head, queue };
}

export function decideSubmitAction(busy: boolean, queueLength: number): "send" | "enqueue" {
  return busy || queueLength > 0 ? "enqueue" : "send";
}
