import type { CanvasEntry } from '../../canvas/canvasEntries';
import { collectCanvasEntries } from '../../canvas/canvasEntries';
import { presentToolCall } from './toolSummary.js';
import { mergeTimeline, type TimelineEntry, type TranscriptInsert } from './transcriptTimeline.js';
import type { ChatLiveBeat, ChatLiveTool, ChatRow } from './useChatSession';

export interface PresentedTool {
  id: string;
  label: string;
  running: boolean;
  input?: string;
  output?: string;
}

export type TranscriptBlock =
  | { type: 'user'; row: ChatRow }
  | { type: 'assistant'; row: ChatRow; streaming?: boolean }
  | { type: 'error'; row: ChatRow }
  | { type: 'insert'; insert: TranscriptInsert }
  | { type: 'tool'; tool: PresentedTool }
  | { type: 'tool-group'; id: string; tools: PresentedTool[]; running: boolean; titles: string[] }
  | { type: 'worked'; id: string; durationMs: number; blocks: TranscriptBlock[] }
  | { type: 'canvases'; entries: CanvasEntry[] }
  | { type: 'reasoning'; text: string; streaming?: boolean }
  | { type: 'runtime'; startedAt: string }
  | { type: 'thinking' };

export function blockKey(block: TranscriptBlock, index: number): string {
  switch (block.type) {
    case 'user': {
      return block.row.id;
    }
    case 'assistant': {
      return block.row.id;
    }
    case 'error': {
      return block.row.id;
    }
    case 'insert': {
      return block.insert.id;
    }
    case 'tool': {
      return block.tool.id;
    }
    case 'tool-group': {
      return block.id;
    }
    case 'worked': {
      return block.id;
    }
    case 'canvases': {
      return `canvases:${block.entries.map((entry) => entry.slug).join(',')}`;
    }
    case 'reasoning': {
      return `reasoning:${index}`;
    }
    case 'runtime': {
      return `runtime:${block.startedAt}`;
    }
    case 'thinking': {
      return `thinking:${index}`;
    }
  }
}

export function formatWorkedDuration(ms: number): string {
  const sec = Math.floor(Math.max(0, ms) / 1000);
  if (sec < 1) return '跑了不到 1 秒';
  if (sec < 60) return `跑了 ${sec} 秒`;
  const minutes = Math.floor(sec / 60);
  const leftover = sec % 60;
  if (minutes < 60) {
    return leftover === 0 ? `跑了 ${minutes} 分` : `跑了 ${minutes} 分 ${leftover} 秒`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `跑了 ${hours} 小时` : `跑了 ${hours} 小时 ${rest} 分`;
}

export function formatRuntime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '运行中';
  return formatWorkedDuration(ms).replace(/^跑了/, '运行了');
}

function presentedTool(id: string, label: string, running: boolean, input?: string, output?: string): PresentedTool {
  return { id, label, running, input, output };
}

function toolFromRow(row: ChatRow): PresentedTool {
  return presentedTool(row.id, row.label ?? '', false, row.input, row.output);
}

function toolFromLive(tool: ChatLiveTool): PresentedTool {
  return presentedTool(tool.id, tool.label, tool.status === 'start', tool.input, tool.output);
}

function toolTitles(tools: PresentedTool[]): string[] {
  const titles: string[] = [];
  for (const tool of tools) {
    const title = presentToolCall(tool.label, tool.input).title;
    if (titles.at(-1) !== title) titles.push(title);
  }
  return titles;
}

function emitTools(tools: PresentedTool[]): TranscriptBlock[] {
  if (tools.length === 0) return [];
  if (tools.length === 1) return [{ type: 'tool', tool: tools[0] }];
  return [
    {
      type: 'tool-group',
      id: `group:${tools[0].id}:${tools[tools.length - 1].id}`,
      tools,
      running: tools.some((tool) => tool.running),
      titles: toolTitles(tools),
    },
  ];
}

function groupSequence(blocks: TranscriptBlock[]): TranscriptBlock[] {
  const out: TranscriptBlock[] = [];
  let pending: PresentedTool[] = [];
  const flush = () => {
    out.push(...emitTools(pending));
    pending = [];
  };
  for (const block of blocks) {
    if (block.type === 'tool') {
      pending.push(block.tool);
      continue;
    }
    flush();
    out.push(block);
  }
  flush();
  return out;
}

function parseTs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function turnDurationMs(user: ChatRow | undefined, entries: TimelineEntry[]): number {
  if (!user) return 0;
  const start = parseTs(user.ts);
  if (!Number.isFinite(start)) return 0;
  let end = start;
  for (const entry of entries) {
    const stamp = entry.kind === 'row' ? parseTs(entry.row.ts) : parseTs(entry.insert.ts);
    if (Number.isFinite(stamp) && stamp > end) end = stamp;
  }
  return Math.max(0, end - start);
}

function isUserEntry(entry: TimelineEntry): boolean {
  return entry.kind === 'row' && entry.row.kind === 'user';
}

function isAssistantText(entry: TimelineEntry): boolean {
  return entry.kind === 'row' && entry.row.kind === 'assistant' && Boolean(entry.row.text);
}

function isErrorEntry(entry: TimelineEntry): boolean {
  return entry.kind === 'row' && entry.row.kind === 'error';
}

function isToolEntry(entry: TimelineEntry): boolean {
  return entry.kind === 'row' && entry.row.kind === 'tool';
}

function isReasoningEntry(entry: TimelineEntry): boolean {
  return entry.kind === 'row' && entry.row.kind === 'thinking';
}

function splitTurns(timeline: TimelineEntry[]): { prefix: TimelineEntry[]; turns: TimelineEntry[][] } {
  const prefix: TimelineEntry[] = [];
  const turns: TimelineEntry[][] = [];
  let current: TimelineEntry[] | null = null;
  for (const entry of timeline) {
    if (isUserEntry(entry)) {
      if (current) turns.push(current);
      current = [entry];
      continue;
    }
    if (current) current.push(entry);
    else prefix.push(entry);
  }
  if (current) turns.push(current);
  return { prefix, turns };
}

function entryToBlocks(entry: TimelineEntry): TranscriptBlock[] {
  if (entry.kind === 'insert') return [{ type: 'insert', insert: entry.insert }];
  const { row } = entry;
  if (row.kind === 'user') return [{ type: 'user', row }];
  if (row.kind === 'assistant') return [{ type: 'assistant', row }];
  if (row.kind === 'thinking') return [{ type: 'reasoning', text: row.text ?? '' }];
  if (row.kind === 'tool') return [{ type: 'tool', tool: toolFromRow(row) }];
  return [{ type: 'error', row }];
}

function sequenceFromEntries(entries: TimelineEntry[]): TranscriptBlock[] {
  return groupSequence(entries.flatMap(entryToBlocks));
}

function canvasesFromRows(rows: ChatRow[], liveTools: ChatLiveTool[] = []): TranscriptBlock[] {
  const entries = collectCanvasEntries(rows, liveTools);
  return entries.length > 0 ? [{ type: 'canvases', entries }] : [];
}

function toolRowsFromEntries(entries: TimelineEntry[]): ChatRow[] {
  return entries.filter(isToolEntry).map((entry) => (entry as { kind: 'row'; row: ChatRow }).row);
}

function presentCompletedTurn(entries: TimelineEntry[]): TranscriptBlock[] {
  const userEntry = entries[0] && isUserEntry(entries[0]) ? entries[0] : undefined;
  const userRow = userEntry?.kind === 'row' ? userEntry.row : undefined;
  const rest = userEntry ? entries.slice(1) : entries;
  const errors = rest.filter(isErrorEntry);
  const reasoning = rest.filter(isReasoningEntry);
  const body = rest.filter((entry) => !isErrorEntry(entry) && !isReasoningEntry(entry));
  const hasTools = body.some(isToolEntry);
  let lastText: TimelineEntry | undefined;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    if (isAssistantText(body[i])) {
      lastText = body[i];
      break;
    }
  }
  const canvases = canvasesFromRows(toolRowsFromEntries(body));
  const errorBlocks = errors.flatMap(entryToBlocks);

  if (!hasTools) {
    return [
      ...(userRow ? [{ type: 'user' as const, row: userRow }] : []),
      ...sequenceFromEntries(reasoning),
      ...sequenceFromEntries(body),
      ...canvases,
      ...errorBlocks,
    ];
  }

  const fold = lastText ? body.filter((entry) => entry !== lastText) : body;
  const worked: TranscriptBlock[] =
    fold.length > 0 && userRow
      ? [
          {
            type: 'worked',
            id: `worked:${userRow.id}`,
            durationMs: turnDurationMs(userRow, rest),
            blocks: sequenceFromEntries(fold),
          },
        ]
      : fold.length > 0
        ? sequenceFromEntries(fold)
        : [];

  return [
    ...(userRow ? [{ type: 'user' as const, row: userRow }] : []),
    ...sequenceFromEntries(reasoning),
    ...worked,
    ...(lastText ? entryToBlocks(lastText) : []),
    ...canvases,
    ...errorBlocks,
  ];
}

function beatsToBlocks(beats: ChatLiveBeat[], streamText: string): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  for (const [index, beat] of beats.entries()) {
    if (beat.kind === 'text') {
      const streaming = index === beats.length - 1;
      blocks.push({
        type: 'assistant',
        streaming,
        row: {
          id: `live-text-${index}`,
          ts: '',
          kind: 'assistant',
          text: streaming ? streamText || beat.text : beat.text,
        },
      });
      continue;
    }
    if (beat.kind === 'reasoning') {
      blocks.push({
        type: 'reasoning',
        streaming: index === beats.length - 1,
        text: beat.text,
      });
      continue;
    }
    blocks.push({ type: 'tool', tool: toolFromLive(beat.tool) });
  }
  return groupSequence(blocks);
}

function fallbackLiveBlocks(liveTools: ChatLiveTool[], streamText: string): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = liveTools.map((tool) => ({
    type: 'tool' as const,
    tool: toolFromLive(tool),
  }));
  if (streamText) {
    blocks.push({
      type: 'assistant',
      streaming: true,
      row: { id: 'stream', ts: '', kind: 'assistant', text: streamText },
    });
  }
  return groupSequence(blocks);
}

function presentLiveTurn(
  entries: TimelineEntry[],
  liveBeats: ChatLiveBeat[] | undefined,
  liveTools: ChatLiveTool[],
  streamText: string,
): TranscriptBlock[] {
  const userEntry = entries[0] && isUserEntry(entries[0]) ? entries[0] : undefined;
  const userRow = userEntry?.kind === 'row' ? userEntry.row : undefined;
  const rest = userEntry ? entries.slice(1) : entries;
  const persisted = sequenceFromEntries(rest.filter((entry) => !isErrorEntry(entry)));
  const live =
    liveBeats && liveBeats.length > 0
      ? beatsToBlocks(liveBeats, streamText)
      : fallbackLiveBlocks(liveTools, streamText);
  const liveToolList =
    liveBeats && liveBeats.length > 0
      ? liveBeats.filter((beat): beat is { kind: 'tool'; tool: ChatLiveTool } => beat.kind === 'tool').map((beat) => beat.tool)
      : liveTools;
  const canvases = canvasesFromRows(toolRowsFromEntries(rest), liveToolList);
  const errors = rest.filter(isErrorEntry).flatMap(entryToBlocks);
  const blocks: TranscriptBlock[] = [
    ...(userRow ? [{ type: 'user' as const, row: userRow }] : []),
    ...(userRow ? [{ type: 'runtime' as const, startedAt: userRow.ts }] : []),
    ...persisted,
    ...live,
    ...canvases,
    ...errors,
  ].map((block) => (block.type === 'reasoning' ? { ...block, streaming: true } : block));
  const hasRunning = live.some(
    (block) =>
      (block.type === 'tool' && block.tool.running) || (block.type === 'tool-group' && block.running),
  );
  const hasText =
    live.some((block) => block.type === 'assistant' || block.type === 'reasoning') ||
    persisted.some((block) => block.type === 'assistant' || block.type === 'reasoning');
  if (!hasRunning && !hasText) blocks.push({ type: 'thinking' });
  return blocks;
}

export function presentTranscript(input: {
  rows: ChatRow[];
  inserts?: TranscriptInsert[];
  liveBeats?: ChatLiveBeat[];
  liveTools?: ChatLiveTool[];
  streamText?: string;
  busy?: boolean;
}): TranscriptBlock[] {
  const timeline = mergeTimeline(input.rows, input.inserts ?? []);
  const { prefix, turns } = splitTurns(timeline);
  const liveTools = input.liveTools ?? [];
  const streamText = input.streamText ?? '';
  const out: TranscriptBlock[] = [...sequenceFromEntries(prefix)];
  const lastIndex = turns.length - 1;

  for (const [index, turn] of turns.entries()) {
    const live = Boolean(input.busy) && index === lastIndex;
    if (live) {
      out.push(...presentLiveTurn(turn, input.liveBeats, liveTools, streamText));
      continue;
    }
    out.push(...presentCompletedTurn(turn));
  }

  if (input.busy && turns.length === 0) {
    out.push(...presentLiveTurn([], input.liveBeats, liveTools, streamText));
  }

  return out;
}
