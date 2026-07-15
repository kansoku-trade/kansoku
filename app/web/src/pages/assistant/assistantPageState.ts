import type { AssistantSessionMeta } from "../../../../packages/core/src/contract";

export function resolveActiveSessionId(requestedId: string | null, sessions: AssistantSessionMeta[]): string | null {
  if (requestedId && sessions.some((session) => session.id === requestedId)) return requestedId;
  return sessions[0]?.id ?? null;
}
