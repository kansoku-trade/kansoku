import { mkdtempSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ReportConfigSnapshot } from '../../src/report/render.js';
import { renderReportHtml } from '../../src/report/renderHtml.js';
import { runScore } from '../../src/score/score.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATASETS = join(HERE, '..', 'fixtures', 'datasets');
const FIXTURE = join(HERE, '..', 'fixtures', 'predictions', 'predictions.jsonl');
const DATASET_VERSION = 'integration-v1';
const BANK = 'swing';
const MODELS = ['alpha/one', 'beta/two'];

describe('renderReportHtml on the minimal fixture dataset', () => {
  const root = mkdtempSync(join(tmpdir(), 'bench-html-'));
  const resultsRoot = join(root, 'results');
  const runId = 'run-html';
  const runDir = join(resultsRoot, runId);
  const config: ReportConfigSnapshot = {
    runId,
    startedAt: '2026-07-17T00:00:00Z',
    datasetVersion: DATASET_VERSION,
    bank: BANK,
    gitSha: 'html-sha',
    modes: ['blind'],
  };

  let scores: Awaited<ReturnType<typeof runScore>>;
  let html: string;

  beforeAll(async () => {
    await fs.mkdir(runDir, { recursive: true });
    await fs.copyFile(FIXTURE, join(runDir, 'predictions.jsonl'));
    await fs.writeFile(
      join(runDir, 'config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
      'utf8',
    );
    scores = await runScore({
      runId,
      datasetVersion: DATASET_VERSION,
      resultsRoot,
      datasetsRoot: DATASETS,
      bank: BANK,
    });
    html = renderReportHtml(scores, config, { now: () => new Date('2026-07-18T00:00:00Z') }).html;
  });

  it('produces a self-contained document with doctype, inline styles, and inline script', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).toContain('<script>');
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('lists every scored model in the leaderboard rows', () => {
    for (const model of MODELS) {
      expect(html).toContain(`data-model="${model}"`);
    }
  });

  it('includes the top row detail card visible (not hidden) and every other card hidden', () => {
    const visibleMatches = html.match(/data-model-detail="[^"]+"(?! hidden)>/g) ?? [];
    expect(visibleMatches.length).toBe(1);
    const hiddenCount = (html.match(/data-model-detail="[^"]+" hidden>/g) ?? []).length;
    expect(hiddenCount).toBe(scores.models.length - 1);
  });

  it('renders the scatter svg with axis titles', () => {
    expect(html).toContain('<svg');
    expect(html).toContain('Judgment');
    expect(html).toContain('Efficiency');
  });

  it('shows the run id in title and topbar', () => {
    expect(html).toContain(`Kansoku Trading Benchmark · ${runId}`);
    expect(html).toContain(runId);
  });
});
