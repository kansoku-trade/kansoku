import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ResearchCreateInput, ResearchCreateResult } from '../contract/research.js';
import { localToday } from '../charts/build.js';
import { chartsService } from '../charts/charts.service.js';
import { loadChart } from '../charts/store.js';
import { PROJECT_ROOT } from '../platform/env.js';
import { ClientError } from '../platform/errors.js';
import { noteFileName } from '../symbols/symbol.utils.js';
import { createResearchService, writeMarkdownFileAtomic } from './research.service.js';
import { journalSkeleton, stockSkeleton } from './templates.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UNSAFE_PATH_CHARS_RE = /[\\/:*?"<>|\p{Cc}]/gu;
const MAX_SLUG_LENGTH = 60;

export interface CreateResearchDeps {
  rootDir: string;
  buildSepaChart(symbol: string): Promise<{ id: string; name: string | null }>;
}

function journalSlug(title: string): string {
  return title
    .replaceAll(UNSAFE_PATH_CHARS_RE, '')
    .trim()
    .replaceAll(/\s+/g, '-')
    .slice(0, MAX_SLUG_LENGTH);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeNewMarkdownFile(path: string, markdown: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await writeMarkdownFileAtomic(path, markdown);
}

async function createStockDocument(
  symbol: string,
  deps: CreateResearchDeps,
): Promise<ResearchCreateResult> {
  const fileSymbol = noteFileName(symbol);
  const fullSymbol = fileSymbol.includes('.') ? fileSymbol : `${fileSymbol}.US`;
  const relativePath = `stocks/${fileSymbol}.md`;
  const service = createResearchService(deps.rootDir);

  if (await fileExists(resolve(deps.rootDir, relativePath))) {
    const document = await service.get({ path: relativePath });
    return { document, sepaChartId: null, existed: true };
  }

  const chart = await deps.buildSepaChart(fullSymbol);
  const markdown = stockSkeleton({
    symbol: fileSymbol,
    name: chart.name ?? fileSymbol,
    date: localToday(),
    sepaUrl: `/symbol/${encodeURIComponent(fullSymbol)}?analysis=${chart.id}`,
  });

  await writeNewMarkdownFile(resolve(deps.rootDir, relativePath), markdown);
  const document = await service.get({ path: relativePath });
  return { document, sepaChartId: chart.id, existed: false };
}

async function createJournalDocument(
  input: { title: string; date?: string },
  deps: CreateResearchDeps,
): Promise<ResearchCreateResult> {
  if (typeof input.title !== 'string') {
    throw new ClientError(
      'research journal title is required',
      'expected a string "title" field',
    );
  }
  const date = input.date ?? localToday();
  if (!DATE_RE.test(date)) {
    throw new ClientError(`invalid date: ${date}`, 'expected YYYY-MM-DD');
  }
  const slug = journalSlug(input.title);
  if (!slug) {
    throw new ClientError(
      'research journal title has no usable characters',
      'title must contain at least one character after removing path-unsafe symbols',
    );
  }

  const relativePath = `journal/${date}-${slug}.md`;
  const service = createResearchService(deps.rootDir);

  if (await fileExists(resolve(deps.rootDir, relativePath))) {
    const document = await service.get({ path: relativePath });
    return { document, sepaChartId: null, existed: true };
  }

  const markdown = journalSkeleton({ title: input.title, date });
  await writeNewMarkdownFile(resolve(deps.rootDir, relativePath), markdown);
  const document = await service.get({ path: relativePath });
  return { document, sepaChartId: null, existed: false };
}

export async function createResearchDocument(
  input: ResearchCreateInput,
  deps: CreateResearchDeps,
): Promise<ResearchCreateResult> {
  if (
    input === null ||
    typeof input !== 'object' ||
    (input.kind !== 'stock' && input.kind !== 'journal')
  ) {
    throw new ClientError('invalid research kind', 'expected kind "stock" or "journal"');
  }
  if (input.kind === 'stock') return createStockDocument(input.symbol, deps);
  return createJournalDocument(input, deps);
}

export function researchCreate(input: ResearchCreateInput): Promise<ResearchCreateResult> {
  return createResearchDocument(input, {
    rootDir: PROJECT_ROOT,
    async buildSepaChart(symbol) {
      const result = await chartsService.create({ type: 'sepa', symbol, origin: 'research' });
      const id = result.data.id as string;
      const doc = await loadChart(id);
      const name = (doc?.input as { name?: string | null } | undefined)?.name ?? null;
      return { id, name };
    },
  });
}
