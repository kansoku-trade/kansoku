import type { ChatLiveTool, ChatRow } from '../cockpit/chat/useChatSession';

export interface CanvasEntry {
  slug: string;
  title: string;
}

function toolKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseInput(input?: string): { path?: string; slug?: string; title?: string } | null {
  if (!input) return null;
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    return {
      path: typeof record.path === 'string' ? record.path : undefined,
      slug: typeof record.slug === 'string' ? record.slug : undefined,
      title: typeof record.title === 'string' ? record.title : undefined,
    };
  } catch {
    return null;
  }
}

function slugFromCanvasPath(path?: string): string | null {
  return (
    path?.match(/(?:^|\/)journal\/canvases\/([a-z0-9]+(?:-[a-z0-9]+)*)\.canvas\.tsx$/)?.[1] ?? null
  );
}

function parseSavedOutput(output?: string): CanvasEntry | null {
  if (!output) return null;
  const match = output.match(/saved slug=([a-z0-9]+(?:-[a-z0-9]+)*) title=(.+)$/m);
  if (!match) return null;
  return { slug: match[1], title: match[2].trim() };
}

function parseEditedOutput(output?: string): CanvasEntry[] {
  if (!output) return [];
  return [...output.matchAll(/^edited path=\S+ slug=([a-z0-9]+(?:-[a-z0-9]+)*) title=(.+)$/gm)].map(
    (match) => ({ slug: match[1], title: match[2].trim() }),
  );
}

export function canvasEntriesFromTool(
  label: string,
  input?: string,
  output?: string,
): CanvasEntry[] {
  const key = toolKey(label);
  if (output?.startsWith('rejected:') || output?.startsWith('edit failed:')) return [];
  if (key === 'applypatch') return parseEditedOutput(output);
  if (key !== 'savecanvas') return [];
  const fromInput = parseInput(input);
  const fromOutput = parseSavedOutput(output);
  const slug = fromInput?.slug ?? slugFromCanvasPath(fromInput?.path) ?? fromOutput?.slug;
  if (!slug) return [];
  return [{ slug, title: fromInput?.title ?? fromOutput?.title ?? slug }];
}

export function latestCanvasChangeToken(
  rows: ChatRow[],
  liveTools: ChatLiveTool[] = [],
): string | undefined {
  let token: string | undefined;
  for (const row of rows) {
    if (
      row.kind === 'tool' &&
      canvasEntriesFromTool(row.label ?? '', row.input, row.output).length
    ) {
      token = row.id;
    }
  }
  for (const tool of liveTools) {
    if (
      tool.status === 'end' &&
      canvasEntriesFromTool(tool.label, tool.input, tool.output).length
    ) {
      token = `${tool.id}:${tool.output ?? ''}`;
    }
  }
  return token;
}

export function collectCanvasEntries(
  rows: ChatRow[],
  liveTools: ChatLiveTool[] = [],
): CanvasEntry[] {
  const bySlug = new Map<string, CanvasEntry>();
  for (const row of rows) {
    if (row.kind !== 'tool') continue;
    for (const entry of canvasEntriesFromTool(row.label ?? '', row.input, row.output)) {
      bySlug.set(entry.slug, entry);
    }
  }
  for (const tool of liveTools) {
    for (const entry of canvasEntriesFromTool(tool.label, tool.input, tool.output)) {
      bySlug.set(entry.slug, entry);
    }
  }
  return [...bySlug.values()];
}

export function isLastSaveForSlug(rows: ChatRow[], index: number, slug: string): boolean {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.kind !== 'tool') continue;
    const entries = canvasEntriesFromTool(row.label ?? '', row.input, row.output);
    if (entries.some((entry) => entry.slug === slug)) return i === index;
  }
  return false;
}
