import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PROJECT_ROOT, skillSearchDirs } from '../src/platform/env.js';
import {
  DISCIPLINE_SKILL,
  DisciplineMissingError,
  appendWatchedMarketsLine,
  disciplineFor,
  loadAppDiscipline,
  loadBenchDiscipline,
  loadSharedDiscipline,
  watchedMarketsLine,
  withDiscipline,
} from '../src/ai/runtime/promptPolicy.js';
import {
  setActiveWatchedMarketsStore,
  type WatchedMarketsStore,
} from '../src/marketdata/watchedMarketsStore.js';
import type { Market } from '../src/symbols/symbol.utils.js';

function fakeWatchedMarketsStore(markets: Market[]): WatchedMarketsStore {
  let current = markets;
  let rev = 0;
  return {
    get: () => [...current],
    set: (next) => {
      current = next;
      rev += 1;
    },
    revision: () => rev,
  };
}

setActiveWatchedMarketsStore(fakeWatchedMarketsStore(['US']));
afterAll(() => setActiveWatchedMarketsStore(null));

const discipline = loadSharedDiscipline(PROJECT_ROOT);

describe('shared discipline', () => {
  it('loads from the skill tree', () => {
    expect(discipline).toBeTruthy();
    expect(discipline).toContain('TD-VERIFY-01');
    expect(discipline).toContain('TD-GAAP-01');
    expect(discipline).toContain('TD-UNIT-01');
  });
});

describe('disciplineFor', () => {
  it('gives judgment agents the full discipline', () => {
    const text = disciplineFor('judgment', PROJECT_ROOT);
    expect(text).toContain('TD-GAAP-01');
    expect(text).toContain('supported / partial / contradicted / insufficient');
  });

  it('gives the observer a compact contract, not the data-trap rules', () => {
    const text = disciplineFor('observer', PROJECT_ROOT);
    expect(text).toContain('Describe only changes observable in the input');
    // The observer never reads a financial statement; these rules would be pure cost.
    expect(text).not.toContain('TD-GAAP-01');
    expect(text).not.toContain('TD-QOQ-01');
  });

  it('gives mechanical agents nothing', () => {
    expect(disciplineFor('mechanical', PROJECT_ROOT)).toBe('');
  });

  it('fails closed for judgment agents when the discipline is unreachable', () => {
    expect(() => disciplineFor('judgment', '/nonexistent-repo-root')).toThrow(
      DisciplineMissingError,
    );
  });

  it('leaves a mechanical prompt untouched', () => {
    expect(withDiscipline('mechanical', PROJECT_ROOT, 'own prompt')).toBe('own prompt');
  });

  it('prepends the discipline for judgment agents', () => {
    const merged = withDiscipline('judgment', PROJECT_ROOT, 'OWN_PROMPT_MARKER');
    expect(merged).toContain('TD-VERIFY-01');
    expect(merged.indexOf('TD-VERIFY-01')).toBeLessThan(merged.indexOf('OWN_PROMPT_MARKER'));
  });
});

// The whole point of a single source is that no other skill restates it. A copied rule silently
// diverges — capital-rotation once told the model to convert capital-flow units while CLAUDE.md
// forbade exactly that. Cite the rule ID; never paste the prose.
describe('no discipline text is duplicated into other skills', () => {
  const FINGERPRINTS = [
    'supported / partial / contradicted / insufficient',
    '用户的判断是一项待检验假设',
    '强制平仓不含信息',
    '记录原始数值 + 你推断的单位',
  ];

  const skillFiles: { name: string; text: string }[] = [];
  for (const dir of skillSearchDirs(PROJECT_ROOT)) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry === DISCIPLINE_SKILL) continue;
      try {
        skillFiles.push({ name: entry, text: readFileSync(join(dir, entry, 'SKILL.md'), 'utf8') });
      } catch {
        // not a skill dir
      }
    }
  }

  it.each(FINGERPRINTS)('no skill copies %j', (fingerprint) => {
    const offenders = skillFiles.filter((s) => s.text.includes(fingerprint)).map((s) => s.name);
    expect(offenders).toEqual([]);
  });
});

describe('watched-markets line injection', () => {
  afterAll(() => setActiveWatchedMarketsStore(fakeWatchedMarketsStore(['US'])));

  it('appends the exact line for the active watched markets', () => {
    setActiveWatchedMarketsStore(fakeWatchedMarketsStore(['HK']));
    const merged = appendWatchedMarketsLine('BASE_DISCIPLINE');
    expect(merged).toBe(
      "BASE_DISCIPLINE\n\nWatched markets: HK. Market-wide scans cover only these markets; single-symbol analysis follows the symbol's market (TD-LANG-03).",
    );
  });

  it('joins multiple markets with a slash', () => {
    expect(watchedMarketsLine(['US', 'HK', 'CN'])).toBe(
      "Watched markets: US / HK / CN. Market-wide scans cover only these markets; single-symbol analysis follows the symbol's market (TD-LANG-03).",
    );
  });

  it('leaves an empty discipline text untouched', () => {
    expect(appendWatchedMarketsLine('')).toBe('');
  });

  it('loadSharedDiscipline includes the watched-markets line for the active store', () => {
    setActiveWatchedMarketsStore(fakeWatchedMarketsStore(['HK']));
    const text = loadSharedDiscipline(PROJECT_ROOT);
    expect(text).toContain(
      "Watched markets: HK. Market-wide scans cover only these markets; single-symbol analysis follows the symbol's market (TD-LANG-03).",
    );
  });
});

describe('runtime chapter composition against the real skill tree', () => {
  const app = loadAppDiscipline(PROJECT_ROOT);
  const bench = loadBenchDiscipline(PROJECT_ROOT);

  // Markers are phrases that live ONLY in a chapter body. Rule IDs alone are not enough:
  // the core SKILL.md cross-references TD-KOREA-01 and TD-LEVERAGE-01 in its own prose.
  const APP_MARKERS = [
    'FX-polluted lagging proxies', // references/app/us-market-data.md
    'grind it to zero', // references/app/market-analysis.md
    'TD-JOURNAL-01', // references/app/journal.md
  ];
  const BENCH_MARKERS = ['TD-FLIP-01', 'TD-CADENCE-01']; // references/bench/episode-execution.md

  it('gives the app runtime its three chapters and none of bench', () => {
    expect(app).toBeTruthy();
    for (const marker of APP_MARKERS) expect(app).toContain(marker);
    for (const marker of BENCH_MARKERS) expect(app).not.toContain(marker);
  });

  it('gives the bench runtime its chapter and none of app', () => {
    expect(bench).toBeTruthy();
    for (const marker of BENCH_MARKERS) expect(bench).toContain(marker);
    for (const marker of APP_MARKERS) expect(bench).not.toContain(marker);
  });

  it('keeps the shared core in both', () => {
    for (const text of [app, bench]) {
      expect(text).toContain('TD-VERIFY-01');
      expect(text).toContain('TD-TREND-01');
    }
  });
});
