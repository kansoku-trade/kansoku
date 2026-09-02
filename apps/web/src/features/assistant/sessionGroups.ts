import type { AssistantSessionMeta } from '@kansoku/core/contract/index';

export type SessionGroupKey = 'today' | 'yesterday' | 'week' | 'earlier';

export interface SessionGroup {
  key: SessionGroupKey;
  label: string;
  sessions: AssistantSessionMeta[];
}

const GROUP_ORDER: SessionGroupKey[] = ['today', 'yesterday', 'week', 'earlier'];
const GROUP_LABELS: Record<SessionGroupKey, string> = {
  today: '今天',
  yesterday: '昨天',
  week: '本周',
  earlier: '更早',
};
const DAY_MS = 24 * 60 * 60 * 1000;
const UNTITLED = '新对话';

export function sessionGroupKey(updatedAt: string, now: Date): SessionGroupKey {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return 'earlier';
  if (t >= startOfToday.getTime()) return 'today';
  if (t >= startOfToday.getTime() - DAY_MS) return 'yesterday';
  if (t >= startOfToday.getTime() - 6 * DAY_MS) return 'week';
  return 'earlier';
}

export function groupSessionsByRecency(
  sessions: AssistantSessionMeta[],
  now: Date = new Date(),
): SessionGroup[] {
  const buckets = new Map<SessionGroupKey, AssistantSessionMeta[]>();
  for (const session of sessions) {
    const key = sessionGroupKey(session.updatedAt, now);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(session);
    else buckets.set(key, [session]);
  }
  return GROUP_ORDER.flatMap((key) => {
    const bucket = buckets.get(key);
    return bucket ? [{ key, label: GROUP_LABELS[key], sessions: bucket }] : [];
  });
}

export function sessionDisplayTitle(session: Pick<AssistantSessionMeta, 'title' | 'preview'>): string {
  return session.title === UNTITLED && session.preview ? session.preview : session.title;
}

export function isBlankSession(session: Pick<AssistantSessionMeta, 'messageCount' | 'busy'>): boolean {
  return session.messageCount === 0 && !session.busy;
}
