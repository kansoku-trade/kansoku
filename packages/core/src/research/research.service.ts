import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { listCanvases, loadCanvas } from '../canvas/store.js';
import type {
  ResearchDocument,
  ResearchDocumentMeta,
  ResearchDocumentType,
  ResearchKind,
  ResearchApi,
} from '../contract/research.js';
import { canvasSlugFromResearchPath, researchCanvasPath } from '../contract/research.js';
import { PROJECT_ROOT } from '../platform/env.js';
import { ClientError } from '../platform/errors.js';
import { z } from 'zod';

const RESEARCH_KINDS: [ResearchKind, ...ResearchKind[]] = ['stock', 'journal', 'canvas'];
const researchKindSchema = z.enum(RESEARCH_KINDS);
export const researchPathSchema = z.string().min(1);
const researchMarkdownSchema = z.string().trim().min(1);
const KIND_ORDER: Record<ResearchKind, number> = { stock: 0, journal: 1, canvas: 2 };

const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})(?:-|$)/;
const HEADING_RE = /^#{1,6}\s+(.+)$/m;
const HEADING_SYMBOL_RE = /^#{1,4}\s+(?:\d+\.\s+)?([A-Z][\dA-Z]{0,7})(?:\.US)?(?=\s|$|[:—：-])/gm;
const PLAIN_SYMBOL_RE = /^[A-Z][\d.A-Z]{0,9}$/;
const SYMBOL_STOP_WORDS = new Set([
  'AI',
  'EPS',
  'ET',
  'ETF',
  'FVG',
  'GAAP',
  'HBM',
  'MACD',
  'RS',
  'US',
  'UTC',
]);
const FILE_TOKEN_STOP_WORDS = new Set([
  'FLOW',
  'INTRADAY',
  'LESSONS',
  'RECAP',
  'REVIEW',
  'SESSION',
  'TRUMP',
]);

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }

  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) paths.push(...(await listMarkdownFiles(path)));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') paths.push(path);
  }
  return paths;
}

function stripInlineMarkdown(value: string): string {
  return value
    .replaceAll(/!\[([^\]]*)]\([^)]*\)/g, '$1')
    .replaceAll(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replaceAll(/[#*>_`~]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function titleFrom(markdown: string, path: string): string {
  const heading = HEADING_RE.exec(markdown)?.[1];
  if (heading) return stripInlineMarkdown(heading);
  return basename(path, extname(path)).replaceAll(/[_-]+/g, ' ');
}

function excerptFrom(markdown: string): string {
  const lines: string[] = [];
  let frontmatter = false;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (line === '---') {
      if (lines.length === 0) frontmatter = !frontmatter;
      continue;
    }
    if (
      frontmatter ||
      !line ||
      line.startsWith('#') ||
      line.startsWith('|') ||
      line.startsWith('<!--')
    )
      continue;
    const plain = stripInlineMarkdown(line.replace(/^[*+-]\s+/, ''));
    if (plain) lines.push(plain);
    if (lines.join(' ').length >= 180) break;
  }
  const text = lines.join(' ');
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text;
}

function documentType(kind: ResearchKind, relativePath: string): ResearchDocumentType {
  if (kind === 'stock') return 'stock';
  const path = relativePath.toLowerCase();
  const name = basename(path);
  if (name === 'lessons.md') return 'lessons';
  if (path.includes('/decisions/')) return 'decision';
  if (path.includes('/trump-feed/')) return 'archive';
  if (name.includes('recap') || name.includes('review')) return 'recap';
  if (name.includes('intraday')) return 'intraday';
  if (name.includes('flow')) return 'flow';
  return 'journal';
}

function addSymbol(symbols: Set<string>, raw: string): void {
  const symbol = raw.replace(/\.us$/i, '').toUpperCase();
  if (!PLAIN_SYMBOL_RE.test(symbol) || symbol.includes('..') || SYMBOL_STOP_WORDS.has(symbol))
    return;
  symbols.add(symbol);
}

function symbolsFrom(kind: ResearchKind, path: string, markdown: string): string[] {
  const symbols = new Set<string>();
  const stem = basename(path, extname(path));

  if (kind === 'stock') {
    if (!stem.startsWith('_')) addSymbol(symbols, stem);
  } else {
    const dateStripped = stem.replace(DATE_PREFIX_RE, '');
    for (const token of dateStripped.split(/[_-]/)) {
      const upper = token.toUpperCase();
      if (!FILE_TOKEN_STOP_WORDS.has(upper)) addSymbol(symbols, upper);
    }
  }

  for (const match of markdown.matchAll(HEADING_SYMBOL_RE)) addSymbol(symbols, match[1]);
  return [...symbols].sort();
}

function symbolsFromCanvas(title: string, slug: string): string[] {
  const symbols = new Set<string>();
  const titleLower = title.toLocaleLowerCase('zh-CN');
  for (const token of title.split(/\s+/)) addSymbol(symbols, token);
  for (const token of slug.split('-')) {
    if (!titleLower.includes(token.toLocaleLowerCase('zh-CN'))) continue;
    const upper = token.toUpperCase();
    if (!FILE_TOKEN_STOP_WORDS.has(upper)) addSymbol(symbols, upper);
  }
  return [...symbols].sort();
}

async function readCanvasDocument(rootDir: string, slug: string): Promise<ResearchDocument> {
  const doc = await loadCanvas(resolve(rootDir, 'journal', 'canvases'), slug);
  if (!doc) throw new ClientError('research document not found', undefined, 404);
  return {
    path: researchCanvasPath(slug),
    kind: 'canvas',
    type: 'canvas',
    title: doc.title,
    date: null,
    symbols: symbolsFromCanvas(doc.title, slug),
    mtime: doc.mtime,
    excerpt: doc.title,
    origin: doc.origin ?? null,
    markdown: '',
    revision: researchDocumentRevision(doc.source),
  };
}

export function researchDocumentRevision(markdown: string): string {
  return createHash('sha256').update(markdown).digest('hex');
}

async function readDocument(
  rootDir: string,
  absolutePath: string,
  kind: ResearchKind,
): Promise<ResearchDocument> {
  const [markdown, stat] = await Promise.all([
    fs.readFile(absolutePath, 'utf8'),
    fs.stat(absolutePath),
  ]);
  const relativePath = toPosix(relative(rootDir, absolutePath));
  const date = DATE_PREFIX_RE.exec(basename(absolutePath))?.[1] ?? null;
  return {
    path: relativePath,
    kind,
    type: documentType(kind, relativePath),
    title: titleFrom(markdown, absolutePath),
    date,
    symbols: symbolsFrom(kind, absolutePath, markdown),
    mtime: stat.mtime.toISOString(),
    excerpt: excerptFrom(markdown),
    markdown,
    revision: researchDocumentRevision(markdown),
  };
}

function compareDocuments(a: ResearchDocumentMeta, b: ResearchDocumentMeta): number {
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (a.kind === 'stock') return a.title.localeCompare(b.title, 'en');
  const dateOrder = (b.date ?? '').localeCompare(a.date ?? '');
  if (dateOrder !== 0) return dateOrder;
  return b.mtime.localeCompare(a.mtime) || a.title.localeCompare(b.title, 'zh-CN');
}

function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
}

async function resolveExistingResearchPath(
  rootDir: string,
  inputPath: string,
  kind: ResearchKind,
  allowedRoot: string,
): Promise<{ path: string; kind: ResearchKind }> {
  const path = resolve(rootDir, inputPath);
  if (!isWithin(allowedRoot, path)) {
    throw new ClientError(
      'invalid research document path',
      'expected stocks/*.md, journal/**/*.md, or journal/canvases/*.canvas.tsx',
    );
  }

  try {
    const [stat, realPath] = await Promise.all([fs.lstat(path), fs.realpath(path)]);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new ClientError('research document not found', undefined, 404);
    const realAllowedRoot = await fs.realpath(allowedRoot);
    if (!isWithin(realAllowedRoot, realPath)) {
      throw new ClientError(
        'invalid research document path',
        'symbolic links outside the data root are not allowed',
      );
    }
    return { path, kind };
  } catch (error) {
    if (error instanceof ClientError) throw error;
    if (isMissing(error)) throw new ClientError('research document not found', undefined, 404);
    throw error;
  }
}

export async function resolveResearchDocumentPath(
  rootDir: string,
  inputPath: string,
): Promise<{ path: string; kind: ResearchKind }> {
  if (!inputPath || inputPath.includes('\0') || isAbsolute(inputPath)) {
    throw new ClientError(
      'invalid research document path',
      'expected stocks/*.md, journal/**/*.md, or journal/canvases/*.canvas.tsx',
    );
  }

  const canvasSlug = canvasSlugFromResearchPath(toPosix(inputPath));
  if (canvasSlug) {
    return resolveExistingResearchPath(
      rootDir,
      inputPath,
      'canvas',
      resolve(rootDir, 'journal', 'canvases'),
    );
  }

  if (extname(inputPath).toLowerCase() !== '.md') {
    throw new ClientError(
      'invalid research document path',
      'expected stocks/*.md, journal/**/*.md, or journal/canvases/*.canvas.tsx',
    );
  }

  const path = resolve(rootDir, inputPath);
  const stocksRoot = resolve(rootDir, 'stocks');
  const journalRoot = resolve(rootDir, 'journal');
  const kind: ResearchKind | null = isWithin(stocksRoot, path)
    ? 'stock'
    : isWithin(journalRoot, path)
      ? 'journal'
      : null;
  if (!kind) {
    throw new ClientError(
      'invalid research document path',
      'expected stocks/*.md, journal/**/*.md, or journal/canvases/*.canvas.tsx',
    );
  }

  return resolveExistingResearchPath(rootDir, inputPath, kind, kind === 'stock' ? stocksRoot : journalRoot);
}

export type ResearchLibraryApi = Pick<ResearchApi, 'list' | 'get'>;

export function createResearchService(rootDir: string): ResearchLibraryApi {
  return {
    async list(input) {
      if (input.kind !== undefined && !researchKindSchema.safeParse(input.kind).success) {
        throw new ClientError('invalid research kind', 'expected stock, journal, or canvas');
      }
      const kinds: ResearchKind[] = input.kind ? [input.kind] : [...RESEARCH_KINDS];
      const groups = await Promise.all(
        kinds.map(async (kind) => {
          if (kind === 'canvas') {
            const items = await listCanvases(resolve(rootDir, 'journal', 'canvases'));
            return Promise.all(items.map((item) => readCanvasDocument(rootDir, item.slug)));
          }
          const dir = resolve(rootDir, kind === 'stock' ? 'stocks' : 'journal');
          const files = await listMarkdownFiles(dir);
          return Promise.all(files.map((path) => readDocument(rootDir, path, kind)));
        }),
      );
      const query = input.query?.trim().toLocaleLowerCase('zh-CN') ?? '';
      const documents = groups.flat().filter((document) => {
        if (!query) return true;
        return [
          document.title,
          document.path,
          document.excerpt,
          document.symbols.join(' '),
          document.markdown,
        ]
          .join('\n')
          .toLocaleLowerCase('zh-CN')
          .includes(query);
      });
      return documents.map(({ markdown: _markdown, ...meta }) => meta).sort(compareDocuments);
    },

    async get(input) {
      const resolved = await resolveResearchDocumentPath(rootDir, input.path);
      if (resolved.kind === 'canvas') {
        const slug = canvasSlugFromResearchPath(toPosix(relative(rootDir, resolved.path)));
        if (!slug) {
          throw new ClientError(
            'invalid research document path',
            'expected journal/canvases/*.canvas.tsx',
          );
        }
        return readCanvasDocument(rootDir, slug);
      }
      return readDocument(rootDir, resolved.path, resolved.kind);
    },
  };
}

export async function writeMarkdownFileAtomic(
  path: string,
  markdown: string,
  mode?: number,
): Promise<void> {
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, markdown, mode === undefined ? 'utf8' : { encoding: 'utf8', mode });
    await fs.rename(tempPath, path);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function writeResearchDocumentAtomic(input: {
  rootDir: string;
  path: string;
  markdown: string;
  expectedRevision: string;
}): Promise<ResearchDocument> {
  if (!researchMarkdownSchema.safeParse(input.markdown).success) {
    throw new ClientError('research document cannot be empty');
  }
  const resolved = await resolveResearchDocumentPath(input.rootDir, input.path);
  if (resolved.kind === 'canvas') {
    throw new ClientError(
      'cannot write canvas through research document API',
      'use save_canvas',
    );
  }
  const current = await readDocument(input.rootDir, resolved.path, resolved.kind);
  if (current.revision !== input.expectedRevision) {
    throw new ClientError(
      'research document changed since the edit was proposed',
      'refresh the document and generate a new proposal',
      409,
      'research_revision_conflict',
    );
  }

  const stat = await fs.stat(resolved.path);
  await writeMarkdownFileAtomic(resolved.path, input.markdown, stat.mode);
  return readDocument(input.rootDir, resolved.path, resolved.kind);
}

export const researchService: ResearchLibraryApi = {
  list(input) {
    return createResearchService(PROJECT_ROOT).list(input);
  },
  get(input) {
    return createResearchService(PROJECT_ROOT).get(input);
  },
};
