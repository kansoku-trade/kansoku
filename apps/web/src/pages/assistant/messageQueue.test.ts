import { describe, expect, it } from "vitest";
import {
  canAutoSend,
  decideSubmitAction,
  enqueueMessage,
  markQueueItemError,
  nextQueueAction,
  popQueueHead,
  removeQueueItem,
} from "./messageQueue.js";

describe("messageQueue", () => {
  it("enqueues a message with no error", () => {
    const queue = enqueueMessage([], "hello", "q1");
    expect(queue).toEqual([{ id: "q1", text: "hello", error: null }]);
  });

  it("appends to the end of an existing queue", () => {
    const queue = enqueueMessage([{ id: "q1", text: "a", error: null }], "b", "q2");
    expect(queue.map((item) => item.id)).toEqual(["q1", "q2"]);
  });

  it("removes an item by id", () => {
    const queue = [
      { id: "q1", text: "a", error: null },
      { id: "q2", text: "b", error: null },
    ];
    expect(removeQueueItem(queue, "q1")).toEqual([{ id: "q2", text: "b", error: null }]);
  });

  it("removing a missing id is a no-op", () => {
    const queue = [{ id: "q1", text: "a", error: null }];
    expect(removeQueueItem(queue, "missing")).toEqual(queue);
  });

  it("marks an item with an error", () => {
    const queue = [{ id: "q1", text: "a", error: null }];
    expect(markQueueItemError(queue, "q1", "网络错误")).toEqual([{ id: "q1", text: "a", error: "网络错误" }]);
  });

  it("pops the head and returns the rest", () => {
    const queue = [
      { id: "q1", text: "a", error: null },
      { id: "q2", text: "b", error: null },
    ];
    const { head, rest } = popQueueHead(queue);
    expect(head).toEqual({ id: "q1", text: "a", error: null });
    expect(rest).toEqual([{ id: "q2", text: "b", error: null }]);
  });

  it("popping an empty queue returns null head", () => {
    expect(popQueueHead([])).toEqual({ head: null, rest: [] });
  });

  it("canAutoSend is true only when the head has no error", () => {
    expect(canAutoSend([])).toBe(false);
    expect(canAutoSend([{ id: "q1", text: "a", error: null }])).toBe(true);
    expect(canAutoSend([{ id: "q1", text: "a", error: "boom" }])).toBe(false);
  });
});

describe("nextQueueAction", () => {
  it("sends exactly the head item on a busy-to-idle transition", () => {
    const queue = [
      { id: "q1", text: "a", error: null },
      { id: "q2", text: "b", error: null },
    ];
    const action = nextQueueAction(true, false, queue);
    expect(action.send).toEqual({ id: "q1", text: "a", error: null });
    expect(action.queue).toBe(queue);
  });

  it("does not send when still busy", () => {
    const queue = [{ id: "q1", text: "a", error: null }];
    expect(nextQueueAction(true, true, queue).send).toBeNull();
    expect(nextQueueAction(false, true, queue).send).toBeNull();
  });

  it("does not send when the head is stuck with an error", () => {
    const queue = [{ id: "q1", text: "a", error: "网络错误" }];
    expect(nextQueueAction(true, false, queue).send).toBeNull();
  });

  it("does not send when there was no busy transition", () => {
    const queue = [{ id: "q1", text: "a", error: null }];
    expect(nextQueueAction(false, false, queue).send).toBeNull();
  });

  it("does not double-send across repeated calls once the transition is consumed", () => {
    const queue = [{ id: "q1", text: "a", error: null }];
    const first = nextQueueAction(true, false, queue);
    expect(first.send).toEqual({ id: "q1", text: "a", error: null });
    const second = nextQueueAction(false, false, queue);
    expect(second.send).toBeNull();
  });

  it("returns null when the queue is empty", () => {
    expect(nextQueueAction(true, false, []).send).toBeNull();
  });
});

describe("decideSubmitAction", () => {
  it("sends immediately when idle and the queue is empty", () => {
    expect(decideSubmitAction(false, 0)).toBe("send");
  });

  it("enqueues while busy", () => {
    expect(decideSubmitAction(true, 0)).toBe("enqueue");
  });

  it("enqueues when idle but items are already queued", () => {
    expect(decideSubmitAction(false, 1)).toBe("enqueue");
  });
});

describe("allowInputWhileBusy submit → auto-send → remaining survive", () => {
  it("enqueues while busy, auto-sends the head on turn end, and keeps the rest queued", () => {
    let queue: ReturnType<typeof enqueueMessage> = [];

    expect(decideSubmitAction(true, queue.length)).toBe("enqueue");
    queue = enqueueMessage(queue, "第一条", "q1");

    expect(decideSubmitAction(true, queue.length)).toBe("enqueue");
    queue = enqueueMessage(queue, "第二条", "q2");

    const action = nextQueueAction(true, false, queue);
    expect(action.send).toEqual({ id: "q1", text: "第一条", error: null });

    queue = removeQueueItem(queue, action.send!.id);
    expect(queue).toEqual([{ id: "q2", text: "第二条", error: null }]);

    const secondRound = nextQueueAction(true, false, queue);
    expect(secondRound.send).toEqual({ id: "q2", text: "第二条", error: null });
  });
});
