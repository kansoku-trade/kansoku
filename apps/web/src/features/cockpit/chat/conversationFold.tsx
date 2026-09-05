import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  isFoldOpen,
  subscribeConversation,
  toggleFold,
  type ConversationKind,
} from './conversationStore.js';

function parseConversationKey(key: string): { kind: ConversationKind; id: string } {
  const index = key.indexOf(':');
  return { kind: key.slice(0, index) as ConversationKind, id: key.slice(index + 1) };
}

const ConversationKeyContext = createContext<string | null>(null);
const NOOP_SUBSCRIBE = () => () => {};

export function ConversationKeyProvider({
  conversationKey,
  children,
}: {
  conversationKey?: string;
  children: ReactNode;
}) {
  return (
    <ConversationKeyContext.Provider value={conversationKey ?? null}>
      {children}
    </ConversationKeyContext.Provider>
  );
}

export function useConversationFold(foldId: string, defaultOpen = false): [boolean, () => void] {
  const key = useContext(ConversationKeyContext);
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  useEffect(() => {
    if (key) return;
    setLocalOpen(defaultOpen);
  }, [key, defaultOpen]);
  const parsed = key ? parseConversationKey(key) : null;
  const open = useSyncExternalStore(
    parsed ? (listener) => subscribeConversation(parsed.kind, parsed.id, listener) : NOOP_SUBSCRIBE,
    () => (parsed ? isFoldOpen(parsed.kind, parsed.id, foldId, defaultOpen) : localOpen),
  );
  if (!parsed) {
    return [localOpen, () => setLocalOpen((current) => !current)];
  }
  return [open, () => toggleFold(parsed.kind, parsed.id, foldId, defaultOpen)];
}
