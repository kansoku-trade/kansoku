import { describe, expect, it } from 'vitest';
import type { ResearchDocumentMeta } from '@kansoku/core/contract/index';
import {
  parseResearchView,
  relatedDocuments,
  researchListSecondary,
  researchListTitle,
  researchRoute,
} from './researchModel.js';

const document = (overrides: Partial<ResearchDocumentMeta>): ResearchDocumentMeta => ({
  path: 'journal/example.md',
  kind: 'journal',
  type: 'journal',
  title: 'Example',
  date: null,
  symbols: [],
  mtime: '2026-07-14T00:00:00.000Z',
  excerpt: '',
  ...overrides,
});

describe('research navigation', () => {
  it('defaults unknown views to the journal timeline', () => {
    expect(parseResearchView(null)).toBe('journal');
    expect(parseResearchView('unknown')).toBe('journal');
  });

  it('keeps document paths round-trippable in the route query', () => {
    const route = researchRoute('journal', 'journal/decisions/2026-07-14-MU.md');
    const params = new URLSearchParams(route.split('?')[1]);
    expect(params.get('path')).toBe('journal/decisions/2026-07-14-MU.md');
  });
});

describe('research list presentation', () => {
  it('removes a duplicated date while preserving the meaningful title', () => {
    expect(
      researchListTitle(document({ title: '2026-07-14 09:20（美东，重估）', date: '2026-07-14' })),
    ).toBe('09:20（美东，重估）');
    expect(
      researchListTitle(document({ title: 'MU 短线多周期分析 — 2026-07-06', date: '2026-07-06' })),
    ).toBe('MU 短线多周期分析');
  });

  it('compacts ISO timestamps without changing the stored title', () => {
    expect(
      researchListTitle(
        document({ title: '2026-07-09T08:53:28Z DRAM.US intraday-signal', date: '2026-07-09' }),
      ),
    ).toBe('08:53 DRAM.US intraday-signal');
  });

  it('uses document type and symbols as the non-redundant secondary line', () => {
    expect(researchListSecondary(document({ type: 'intraday', symbols: ['DRAM', 'MU'] }))).toBe(
      '日内分析 · DRAM · MU',
    );
  });
});

describe('research relationships', () => {
  it('links a journal to matching stock notes and other records without filename assumptions', () => {
    const selected = document({ path: 'journal/recap.md', symbols: ['MU', 'NVDA'] });
    const mu = document({ path: 'stocks/MU.md', kind: 'stock', type: 'stock', symbols: ['MU'] });
    const nvdaLog = document({ path: 'journal/nvda.md', date: '2026-07-13', symbols: ['NVDA'] });
    const unrelated = document({
      path: 'stocks/MSFT.md',
      kind: 'stock',
      type: 'stock',
      symbols: ['MSFT'],
    });

    expect(relatedDocuments(selected, [unrelated, nvdaLog, mu]).map((item) => item.path)).toEqual([
      'stocks/MU.md',
      'journal/nvda.md',
    ]);
  });
});
