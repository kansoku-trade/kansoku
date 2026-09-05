import { errorMessage } from '@web/lib/api';
import { trackFeatureUsed } from '@web/lib/analytics';
import { subscribeChannel } from '@web/lib/ws/wsHub';
import { applyLiveBeat } from './liveBeats.js';
import type {
  ChatLiveBeat,
  ChatLiveTool,
  ChatRow,
  ChatSessionInfo,
  ChatUsage,
} from './useChatSession.js';

export type ConversationKind = 'chart' | 'research' | 'assistant';

export interface ChatSendResult {
  ok: boolean;
  error?: string;
}

export interface ConversationAdapter {
  fetchChat: (id: string) => Promise<{
    session: ChatSessionInfo | null;
    messages: ChatRow[];
    busy: boolean;
    partial: string;
    usage?: ChatUsage;
  }>;
  send: (
    id: string,
    text: string,
    options?: { replaceLast?: boolean },
  ) => Promise<{ status: number; body: unknown }>;
  abort: (id: string) => Promise<unknown>;
  channel: (id: string) => Parameters<typeof subscribeChannel>[0];
  suggest: ((id: string) => Promise<{ suggestions: string[] }>) | null;
}

export interface ConversationSnapshot {
  session: ChatSessionInfo | null;
  rows: ChatRow[];
  busy: boolean;
  aborting: boolean;
  streamText: string;
  liveBeats: ChatLiveBeat[];
  liveTools: ChatLiveTool[];
  hint: string | null;
  loaded: boolean;
  suggestions: string[];
  usage: ChatUsage | null;
}

type ChatWsEvent =
  | { event: 'delta'; text: string }
  | { event: 'reasoning'; text: string }
  | { event: 'tool'; label: string; status: 'start' | 'end'; input?: string; output?: string }
  | { event: 'title'; title: string }
  | { event: 'done' }
  | { event: 'aborted' }
  | { event: 'error'; message: string };

type ChatWsEnvelope =
  { type: 'init'; busy: boolean; partial: string } | { type: 'event'; event: ChatWsEvent };

const STREAM_SETTLE_MS = 800;
const EMPTY_TOOLS: ChatLiveTool[] = [];
const EMPTY_BEATS: ChatLiveBeat[] = [];

export const EMPTY_CONVERSATION: ConversationSnapshot = {
  session: null,
  rows: [],
  busy: false,
  aborting: false,
  streamText: '',
  liveBeats: EMPTY_BEATS,
  liveTools: EMPTY_TOOLS,
  hint: null,
  loaded: false,
  suggestions: [],
  usage: null,
};

interface Slot extends Omit<ConversationSnapshot, 'liveTools'> {
  kind: ConversationKind;
  id: string;
  viewers: number;
  folds: Map<string, boolean>;
  toolSeq: number;
  errorSeq: number;
  requestSeq: number;
  sendPending: boolean;
  suggestionsRequested: boolean;
  unsubWs: (() => void) | null;
  settleTimer: ReturnType<typeof setTimeout> | null;
  connectedOnce: boolean;
  snapshot: ConversationSnapshot;
}

const slots = new Map<string, Slot>();
const listeners = new Map<string, Set<() => void>>();
let adapters: Record<ConversationKind, ConversationAdapter> | null = null;

export const conversationKey = (kind: ConversationKind, id: string) => `${kind}:${id}`;

export function bindConversationAdapters(next: Record<ConversationKind, ConversationAdapter>): void {
  adapters = next;
}
export const setConversationAdaptersForTests = bindConversationAdapters;
function adapterOf(kind: ConversationKind): ConversationAdapter {
  const adapter = adapters?.[kind];
  if (!adapter) throw new Error(`conversation adapter missing for ${kind}`);
  return adapter;
}

export function lastUserRow(rows: readonly ChatRow[]): ChatRow | undefined {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row?.kind === 'user' && row.text?.trim()) return row;
  }
}

export const usageFromEnvelope = (env: { usage?: ChatUsage }): ChatUsage | null =>
  env.usage ?? null;

const isErrorBody = (value: unknown): value is { error: string; hint?: string } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { error?: unknown }).error === 'string';

function liveToolsOf(beats: ChatLiveBeat[]): ChatLiveTool[] {
  const tools = beats
    .filter((beat): beat is { kind: 'tool'; tool: ChatLiveTool } => beat.kind === 'tool')
    .map((beat) => beat.tool);
  return tools.length === 0 ? EMPTY_TOOLS : tools;
}

function buildSnapshot(slot: Slot): ConversationSnapshot {
  return {
    session: slot.session,
    rows: slot.rows,
    busy: slot.busy,
    aborting: slot.aborting,
    streamText: slot.streamText,
    liveBeats: slot.liveBeats,
    liveTools: liveToolsOf(slot.liveBeats),
    hint: slot.hint,
    loaded: slot.loaded,
    suggestions: slot.suggestions,
    usage: slot.usage,
  };
}

function emit(key: string): void {
  const slot = slots.get(key);
  if (slot) slot.snapshot = buildSnapshot(slot);
  const set = listeners.get(key);
  if (!set) return;
  for (const listener of set) listener();
}

function dispose(key: string): void {
  const slot = slots.get(key);
  if (!slot) return;
  if (slot.settleTimer) clearTimeout(slot.settleTimer);
  slot.unsubWs?.();
  slots.delete(key);
  emit(key);
}

function disposeIfIdle(key: string): void {
  const slot = slots.get(key);
  if (!slot) return;
  if (slot.viewers === 0 && !slot.busy) dispose(key);
}

function getSlot(kind: ConversationKind, id: string): Slot | undefined {
  return slots.get(conversationKey(kind, id));
}

export function getConversationSnapshot(
  kind: ConversationKind,
  id: string,
): ConversationSnapshot | null {
  return getSlot(kind, id)?.snapshot ?? null;
}

export function subscribeConversation(
  kind: ConversationKind,
  id: string,
  listener: () => void,
): () => void {
  const key = conversationKey(kind, id);
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

export function isFoldOpen(
  kind: ConversationKind,
  id: string,
  foldId: string,
  defaultOpen: boolean,
): boolean {
  const stored = getSlot(kind, id)?.folds.get(foldId);
  return stored ?? defaultOpen;
}

export function toggleFold(
  kind: ConversationKind,
  id: string,
  foldId: string,
  defaultOpen: boolean,
): void {
  const slot = getSlot(kind, id);
  if (!slot) return;
  const current = slot.folds.get(foldId) ?? defaultOpen;
  slot.folds.set(foldId, !current);
  emit(conversationKey(kind, id));
}

function reload(slot: Slot, markError?: string, after?: () => void): void {
  const seq = ++slot.requestSeq;
  const key = conversationKey(slot.kind, slot.id);
  adapterOf(slot.kind)
    .fetchChat(slot.id)
    .then((env) => {
      if (slot.requestSeq !== seq || slot.sendPending) {
        after?.();
        return;
      }
      slot.session = env.session;
      slot.rows = markError
        ? [
            ...env.messages,
            {
              id: `error-${slot.id}-${slot.errorSeq++}`,
              ts: new Date().toISOString(),
              kind: 'error',
              text: markError,
            },
          ]
        : env.messages;
      slot.busy = env.busy;
      slot.streamText = env.busy ? env.partial : '';
      slot.usage = usageFromEnvelope(env);
      slot.loaded = true;
      if (slot.hint === '对话记录加载失败') slot.hint = null;
      emit(key);
      after?.();
      disposeIfIdle(key);
    })
    .catch(() => {
      after?.();
      if (slot.requestSeq !== seq || slot.sendPending) return;
      slot.loaded = true;
      slot.hint = '对话记录加载失败';
      emit(key);
    });
}

function handlePayload(slot: Slot, payload: unknown): void {
  const env = payload as ChatWsEnvelope;
  if (env.type !== 'init' && env.type !== 'event') return;
  const key = conversationKey(slot.kind, slot.id);
  if (env.type === 'init') {
    slot.busy = env.busy;
    slot.streamText = env.busy ? env.partial : '';
    const hasTools = slot.liveBeats.some((beat) => beat.kind === 'tool');
    if (!(env.busy && hasTools)) {
      slot.liveBeats = env.busy && env.partial ? [{ kind: 'text', text: env.partial }] : [];
    }
    emit(key);
    disposeIfIdle(key);
    return;
  }
  const evt = env.event;
  const clearLive = () => {
    slot.liveBeats = [];
    slot.streamText = '';
    emit(key);
    disposeIfIdle(key);
  };
  if (evt.event === 'delta' || evt.event === 'reasoning' || evt.event === 'tool') {
    slot.busy = true;
    if (evt.event === 'delta') slot.streamText += evt.text;
    let toolId = `tool-${slot.toolSeq}`;
    if (evt.event === 'tool' && evt.status === 'start') {
      slot.streamText = '';
      toolId = `tool-${slot.toolSeq++}`;
    }
    slot.liveBeats = applyLiveBeat(slot.liveBeats, evt, toolId);
    emit(key);
    return;
  }
  if (evt.event === 'title') {
    slot.session = slot.session ? { ...slot.session, title: evt.title } : slot.session;
    emit(key);
    return;
  }
  if (evt.event === 'aborted') {
    slot.busy = false;
    slot.aborting = false;
    reload(slot, undefined, clearLive);
    return;
  }
  const markError = evt.event === 'done' ? undefined : evt.message;
  if (slot.settleTimer) clearTimeout(slot.settleTimer);
  slot.settleTimer = setTimeout(() => {
    slot.settleTimer = null;
    slot.aborting = false;
    slot.suggestionsRequested = false;
    reload(slot, markError, () => {
      slot.busy = false;
      clearLive();
    });
  }, STREAM_SETTLE_MS);
}

function attachWs(slot: Slot): void {
  const adapter = adapterOf(slot.kind);
  slot.unsubWs = subscribeChannel(
    adapter.channel(slot.id),
    (payload) => handlePayload(slot, payload),
    (connected) => {
      if (!connected) return;
      if (slot.connectedOnce) reload(slot);
      slot.connectedOnce = true;
    },
  );
}

function createSlot(kind: ConversationKind, id: string): Slot {
  const slot: Slot = {
    kind, id, viewers: 0, folds: new Map(), toolSeq: 0, errorSeq: 0, requestSeq: 0,
    sendPending: false, suggestionsRequested: false, unsubWs: null, settleTimer: null,
    connectedOnce: false, snapshot: EMPTY_CONVERSATION, session: null, rows: [],
    busy: false, aborting: false, streamText: '', liveBeats: [], hint: null,
    loaded: false, suggestions: [], usage: null,
  };
  slot.snapshot = buildSnapshot(slot);
  return slot;
}

export function acquire(kind: ConversationKind, id: string): void {
  const key = conversationKey(kind, id);
  let slot = slots.get(key);
  if (slot) {
    slot.viewers += 1;
    return;
  }
  slot = createSlot(kind, id);
  slot.viewers = 1;
  slots.set(key, slot);
  attachWs(slot);
  reload(slot);
  emit(key);
}

export function release(kind: ConversationKind, id: string): void {
  const key = conversationKey(kind, id);
  const slot = slots.get(key);
  if (!slot) return;
  slot.viewers = Math.max(0, slot.viewers - 1);
  disposeIfIdle(key);
}

export async function sendConversation(
  kind: ConversationKind,
  id: string,
  text: string,
  options?: { replaceLast?: boolean },
): Promise<ChatSendResult> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: '内容不能为空' };
  const slot = getSlot(kind, id);
  if (!slot) return { ok: false, error: '会话不存在' };
  const key = conversationKey(kind, id);
  const adapter = adapterOf(kind);
  const optimisticId = `optimistic-${Date.now()}`;
  const replaceLast = options?.replaceLast === true;
  trackFeatureUsed('ai_chat', { surface: kind });
  slot.sendPending = true;
  slot.hint = null;
  slot.busy = true;
  slot.liveBeats = [];
  slot.suggestions = [];
  if (!replaceLast) {
    slot.rows = [
      ...slot.rows,
      {
        id: optimisticId,
        ts: new Date().toISOString(),
        kind: 'user',
        text: trimmed,
        optimistic: true,
      },
    ];
  } else {
    const last = lastUserRow(slot.rows);
    if (last) {
      const lastIndex = slot.rows.lastIndexOf(last);
      const kept = slot.rows.slice(0, lastIndex + 1);
      slot.rows =
        last.text === trimmed ? kept : [...kept.slice(0, lastIndex), { ...last, text: trimmed }];
    }
  }
  emit(key);
  const fail = (message: string): ChatSendResult => {
    slot.busy = false;
    slot.hint = message;
    if (replaceLast) reload(slot, message);
    else slot.rows = slot.rows.filter((row) => row.id !== optimisticId);
    slot.sendPending = false;
    emit(key);
    disposeIfIdle(key);
    return { ok: false, error: message };
  };
  try {
    const result = await adapter.send(id, trimmed, options);
    if (result.status === 202) {
      slot.sendPending = false;
      return { ok: true };
    }
    const message = isErrorBody(result.body)
      ? result.body.hint
        ? `${result.body.error} (${result.body.hint})`
        : result.body.error
      : `HTTP ${result.status}`;
    return fail(message);
  } catch (err) {
    return fail(errorMessage(err));
  }
}

export async function abortConversation(kind: ConversationKind, id: string): Promise<void> {
  const slot = getSlot(kind, id);
  if (!slot) return;
  slot.aborting = true;
  emit(conversationKey(kind, id));
  try {
    await adapterOf(kind).abort(id);
  } catch {
    slot.aborting = false;
    emit(conversationKey(kind, id));
  }
}

export function retryLastConversation(kind: ConversationKind, id: string): Promise<ChatSendResult> {
  const lastUser = lastUserRow(getSlot(kind, id)?.rows ?? []);
  if (!lastUser?.text) return Promise.resolve({ ok: false, error: '没有可重试的问题' });
  return sendConversation(kind, id, lastUser.text, { replaceLast: true });
}

export function replaceLastConversation(
  kind: ConversationKind,
  id: string,
  text: string,
): Promise<ChatSendResult> {
  return sendConversation(kind, id, text, { replaceLast: true });
}

export function ensureSuggestions(kind: ConversationKind, id: string): void {
  const slot = getSlot(kind, id);
  if (!slot || slot.suggestionsRequested) return;
  slot.suggestionsRequested = true;
  const adapter = adapterOf(kind);
  if (!adapter.suggest) return;
  const seq = slot.requestSeq;
  adapter
    .suggest(id)
    .then((res) => {
      if (slot.requestSeq !== seq) return;
      slot.suggestions = res.suggestions;
      emit(conversationKey(kind, id));
    })
    .catch(() => {
      slot.suggestions = [];
      emit(conversationKey(kind, id));
    });
}

export function resetConversationStoreForTests(): void {
  for (const key of Array.from(slots.keys())) dispose(key);
  listeners.clear();
}
