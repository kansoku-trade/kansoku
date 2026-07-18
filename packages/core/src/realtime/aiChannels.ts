import type { ProChannel } from "@kansoku/pro-api";
import type { CockpitComment } from "@kansoku/shared/types";
import { listAnalystRuns, onAnalystRunChange } from "../ai/analyst.js";
import { assistantChatTurnState, onAssistantChatEvent } from "../ai/assistantChat.js";
import { type ChatEvent, chatTurnState, onChatEvent } from "../ai/chat.js";
import { listComments, onAnyComment, onComment } from "../ai/comments.js";
import { onAnyNotice } from "../ai/notices.js";
import { easternDate } from "../services/session.js";
import { normalizeSymbol } from "../services/symbol.utils.js";

async function attachComments(symbol: string, push: (envelope: string) => void): Promise<() => void> {
  const buffered: CockpitComment[] = [];
  let ready = false;
  const unsubComment = onComment(symbol, (comment) => {
    if (ready) push(JSON.stringify({ type: "comment", comment }));
    else buffered.push(comment);
  });
  const comments = await listComments(symbol, easternDate());
  push(JSON.stringify({ type: "init", comments }));
  const seen = new Set(comments.map((c) => `${c.ts} ${c.text}`));
  for (const comment of buffered) {
    if (seen.has(`${comment.ts} ${comment.text}`)) continue;
    push(JSON.stringify({ type: "comment", comment }));
  }
  ready = true;
  return unsubComment;
}

function attachNotifications(push: (envelope: string) => void): () => void {
  const unsubComment = onAnyComment((comment) => push(JSON.stringify({ type: "comment", comment })));
  const unsubNotice = onAnyNotice((notice) => push(JSON.stringify({ type: "notice", notice })));
  return () => {
    unsubComment();
    unsubNotice();
  };
}

function attachAnalystRuns(push: (envelope: string) => void): () => void {
  const unsub = onAnalystRunChange((symbol, status) => push(JSON.stringify({ type: "update", symbol, status })));
  push(JSON.stringify({ type: "init", runs: listAnalystRuns() }));
  return unsub;
}

function attachConversation(
  key: string,
  push: (envelope: string) => void,
  subscribe: (key: string, listener: (event: ChatEvent) => void) => () => void,
  turnState: (key: string) => { busy: boolean; partial: string },
): () => void {
  const unsub = subscribe(key, (event) => push(JSON.stringify({ type: "event", event })));
  const { busy, partial } = turnState(key);
  push(JSON.stringify({ type: "init", busy, partial }));
  return unsub;
}

function stringField(raw: Record<string, unknown>, field: string, maxLength?: number): string | null {
  const value = raw[field];
  if (typeof value !== "string" || !value) return null;
  if (maxLength != null && value.length > maxLength) return null;
  return value;
}

const commentsChannel: ProChannel = {
  kind: "comments",
  parse: (raw) => {
    const symbol = stringField(raw, "symbol");
    return symbol ? { symbol } : null;
  },
  attach: (msg, push) => attachComments(normalizeSymbol(msg.symbol as string), push),
};

const notificationsChannel: ProChannel = {
  kind: "notifications",
  parse: () => ({}),
  attach: (_msg, push) => attachNotifications(push),
};

const analystRunsChannel: ProChannel = {
  kind: "analyst-runs",
  parse: () => ({}),
  attach: (_msg, push) => attachAnalystRuns(push),
};

const chatChannel: ProChannel = {
  kind: "chat",
  parse: (raw) => {
    const id = stringField(raw, "id");
    return id ? { id } : null;
  },
  attach: (msg, push) => attachConversation(msg.id as string, push, onChatEvent, chatTurnState),
};

const assistantChatChannel: ProChannel = {
  kind: "assistant-chat",
  parse: (raw) => {
    const id = stringField(raw, "id");
    return id ? { id } : null;
  },
  attach: (msg, push) => attachConversation(msg.id as string, push, onAssistantChatEvent, assistantChatTurnState),
};

export const coreAiChannels: ProChannel[] = [
  commentsChannel,
  notificationsChannel,
  analystRunsChannel,
  chatChannel,
  assistantChatChannel,
];
