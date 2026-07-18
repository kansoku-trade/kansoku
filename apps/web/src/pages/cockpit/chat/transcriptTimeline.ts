import type { ReactNode } from 'react';
import type { ChatRow } from './useChatSession';

export interface TranscriptInsert {
  id: string;
  ts: string;
  node: ReactNode;
}

export type TimelineEntry =
  { kind: 'row'; row: ChatRow } | { kind: 'insert'; insert: TranscriptInsert };

function parseTime(ts: string): number {
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? Infinity : parsed;
}

export function mergeTimeline(rows: ChatRow[], inserts: TranscriptInsert[]): TimelineEntry[] {
  const sortedInserts = inserts
    .map((insert, index) => ({ insert, index, time: parseTime(insert.ts) }))
    .sort((a, b) => a.time - b.time || a.index - b.index);

  const result: TimelineEntry[] = [];
  let pointer = 0;

  for (const row of rows) {
    const rowTime = parseTime(row.ts);
    while (pointer < sortedInserts.length && sortedInserts[pointer].time < rowTime) {
      result.push({ kind: 'insert', insert: sortedInserts[pointer].insert });
      pointer++;
    }
    result.push({ kind: 'row', row });
  }

  while (pointer < sortedInserts.length) {
    result.push({ kind: 'insert', insert: sortedInserts[pointer].insert });
    pointer++;
  }

  return result;
}
