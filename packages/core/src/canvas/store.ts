import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type {
  CanvasCheckRecord,
  CanvasDoc,
  CanvasMeta,
  CanvasOrigin,
} from '../contract/canvas.js';
import { checkCanvasSource, reviewCanvasStructure } from './check.js';

export type { CanvasCheckRecord, CanvasDoc, CanvasMeta, CanvasOrigin };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const META_FILE = '.meta.json';

interface MetaEntry {
  title: string;
  check: CanvasCheckRecord | null;
  origin?: CanvasOrigin | null;
}

type MetaMap = Record<string, MetaEntry>;

export function canvasPath(dir: string, slug: string): string {
  return join(dir, `${slug}.canvas.tsx`);
}

function metaPath(dir: string): string {
  return join(dir, META_FILE);
}

function isSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

async function readMeta(dir: string): Promise<MetaMap> {
  try {
    const raw = await fs.readFile(metaPath(dir), 'utf8');
    const parsed = JSON.parse(raw) as MetaMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMeta(dir: string, meta: MetaMap): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(metaPath(dir), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

async function fileMtime(path: string): Promise<string> {
  const stat = await fs.stat(path);
  return stat.mtime.toISOString();
}

export async function saveCanvas(
  dir: string,
  input: {
    slug: string;
    title: string;
    source: string;
    now?: () => Date;
    origin?: CanvasOrigin | null;
  },
): Promise<{ ok: true; doc: CanvasDoc } | { ok: false; issues: string[] }> {
  if (!isSlug(input.slug)) {
    return { ok: false, issues: ['slug must be kebab-case'] };
  }
  const issues = [...checkCanvasSource(input.source), ...reviewCanvasStructure(input.source)];
  if (issues.length) return { ok: false, issues };

  await fs.mkdir(dir, { recursive: true });
  const path = canvasPath(dir, input.slug);
  await fs.writeFile(path, input.source, 'utf8');
  const meta = await readMeta(dir);
  const previous = meta[input.slug];
  const origin = input.origin !== undefined ? input.origin : (previous?.origin ?? null);
  meta[input.slug] = { title: input.title, check: null, origin };
  await writeMeta(dir, meta);
  const mtime = await fileMtime(path);
  return {
    ok: true,
    doc: {
      slug: input.slug,
      title: input.title,
      source: input.source,
      mtime,
      check: null,
      origin,
    },
  };
}

export async function loadCanvas(dir: string, slug: string): Promise<CanvasDoc | null> {
  if (!isSlug(slug)) return null;
  const path = canvasPath(dir, slug);
  let source: string;
  try {
    source = await fs.readFile(path, 'utf8');
  } catch {
    return null;
  }
  const meta = await readMeta(dir);
  const entry = meta[slug];
  return {
    slug,
    title: entry?.title ?? slug,
    source,
    mtime: await fileMtime(path),
    check: entry?.check ?? null,
    origin: entry?.origin ?? null,
  };
}

export async function listCanvases(dir: string): Promise<CanvasMeta[]> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const meta = await readMeta(dir);
  const items: CanvasMeta[] = [];
  for (const file of files) {
    if (!file.endsWith('.canvas.tsx')) continue;
    const slug = file.slice(0, -'.canvas.tsx'.length);
    if (!isSlug(slug)) continue;
    const mtime = await fileMtime(join(dir, file));
    items.push({
      slug,
      title: meta[slug]?.title ?? slug,
      mtime,
      origin: meta[slug]?.origin ?? null,
    });
  }
  items.sort((a, b) => (a.mtime < b.mtime ? 1 : a.mtime > b.mtime ? -1 : 0));
  return items;
}

export async function recordCanvasCheck(
  dir: string,
  slug: string,
  check: Omit<CanvasCheckRecord, 'updatedAt'>,
  now: () => Date = () => new Date(),
): Promise<void> {
  const existing = await loadCanvas(dir, slug);
  if (!existing) return;
  const meta = await readMeta(dir);
  const title = meta[slug]?.title ?? existing.title;
  meta[slug] = {
    title,
    check: { ...check, updatedAt: now().toISOString() },
    origin: meta[slug]?.origin ?? existing.origin ?? null,
  };
  await writeMeta(dir, meta);
}

export async function setCanvasOrigin(
  dir: string,
  slug: string,
  origin: CanvasOrigin,
): Promise<void> {
  const existing = await loadCanvas(dir, slug);
  if (!existing) return;
  const meta = await readMeta(dir);
  meta[slug] = {
    title: meta[slug]?.title ?? existing.title,
    check: meta[slug]?.check ?? existing.check,
    origin,
  };
  await writeMeta(dir, meta);
}
