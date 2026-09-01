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

function parseEditedOutput(output?: string): CanvasEntry | null {
  if (!output) return null;
  const match = output.match(/edited path=\S+ slug=([a-z0-9]+(?:-[a-z0-9]+)*) title=(.+)$/m);
  if (!match) return null;
  return { slug: match[1], title: match[2].trim() };
}

export function canvasEntryFromTool(
  label: string,
  input?: string,
  output?: string,
): CanvasEntry | null {
  const key = toolKey(label);
  if (key !== 'savecanvas' && key !== 'editfile') return null;
  if (output?.startsWith('rejected:') || output?.startsWith('edit failed:')) return null;
  const fromInput = parseInput(input);
  const fromOutput = key === 'savecanvas' ? parseSavedOutput(output) : parseEditedOutput(output);
  const slug = fromInput?.slug ?? slugFromCanvasPath(fromInput?.path) ?? fromOutput?.slug;
  if (!slug) return null;
  return { slug, title: fromInput?.title ?? fromOutput?.title ?? slug };
}

export function latestCanvasChangeToken(
  rows: ChatRow[],
  liveTools: ChatLiveTool[] = [],
): string | undefined {
  let token: string | undefined;
  for (const row of rows) {
    if (row.kind === 'tool' && canvasEntryFromTool(row.label ?? '', row.input, row.output)) {
      token = row.id;
    }
  }
  for (const tool of liveTools) {
    if (tool.status === 'end' && canvasEntryFromTool(tool.label, tool.input, tool.output)) {
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
    const entry = canvasEntryFromTool(row.label ?? '', row.input, row.output);
    if (entry) bySlug.set(entry.slug, entry);
  }
  for (const tool of liveTools) {
    const entry = canvasEntryFromTool(tool.label, tool.input, tool.output);
    if (entry) bySlug.set(entry.slug, entry);
  }
  return [...bySlug.values()];
}

export function isLastSaveForSlug(rows: ChatRow[], index: number, slug: string): boolean {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.kind !== 'tool') continue;
    const entry = canvasEntryFromTool(row.label ?? '', row.input, row.output);
    if (entry?.slug === slug) return i === index;
  }
  return false;
}
