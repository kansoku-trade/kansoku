import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localToday } from '../src/charts/build.js';
import { createResearchDocument } from '../src/research/createResearch.js';

let root: string;

function write(relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'create-research-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('createResearchDocument: stock', () => {
  it('builds the sepa chart, writes the skeleton, and reports existed: false', async () => {
    const buildSepaChart = vi.fn().mockResolvedValue({ id: 'chart-1', name: 'Marvell Technology' });

    const result = await createResearchDocument(
      { kind: 'stock', symbol: 'MRVL' },
      { rootDir: root, buildSepaChart },
    );

    expect(result.existed).toBe(false);
    expect(result.sepaChartId).toBe('chart-1');
    expect(result.document.path).toBe('stocks/MRVL.md');

    const written = readFileSync(join(root, 'stocks/MRVL.md'), 'utf8');
    expect(written).toContain('# MRVL — Marvell Technology');
    expect(written).toContain(`建档日期：${localToday()}`);
    expect(written).toContain('[SEPA 仪表盘](/symbol/MRVL.US?analysis=chart-1)');
  });

  it('creates the stocks/ directory when absent', async () => {
    expect(existsSync(join(root, 'stocks'))).toBe(false);
    const buildSepaChart = vi.fn().mockResolvedValue({ id: 'chart-2', name: 'Micron' });

    await createResearchDocument({ kind: 'stock', symbol: 'MU' }, { rootDir: root, buildSepaChart });

    expect(existsSync(join(root, 'stocks/MU.md'))).toBe(true);
  });

  it('falls back to the symbol as the display name when the chart name is null', async () => {
    const buildSepaChart = vi.fn().mockResolvedValue({ id: 'chart-3', name: null });

    await createResearchDocument({ kind: 'stock', symbol: 'MU' }, { rootDir: root, buildSepaChart });

    const written = readFileSync(join(root, 'stocks/MU.md'), 'utf8');
    expect(written).toContain('# MU — MU');
  });

  it('normalizes `mrvl` and `MRVL.US` to the same file and passes the .US-suffixed symbol to the chart builder', async () => {
    const buildSepaChart = vi.fn().mockResolvedValue({ id: 'chart-4', name: 'Marvell Technology' });

    const first = await createResearchDocument(
      { kind: 'stock', symbol: 'mrvl' },
      { rootDir: root, buildSepaChart },
    );
    expect(first.existed).toBe(false);
    expect(buildSepaChart).toHaveBeenCalledWith('MRVL.US');

    const second = await createResearchDocument(
      { kind: 'stock', symbol: 'MRVL.US' },
      { rootDir: root, buildSepaChart },
    );

    expect(second.existed).toBe(true);
    expect(second.sepaChartId).toBeNull();
    expect(buildSepaChart).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: an existing file is left untouched and no chart is built', async () => {
    write('stocks/MRVL.md', '# MRVL — 已有档案\n\n人工写过的内容。\n');
    const buildSepaChart = vi.fn();

    const result = await createResearchDocument(
      { kind: 'stock', symbol: 'MRVL' },
      { rootDir: root, buildSepaChart },
    );

    expect(result.existed).toBe(true);
    expect(result.sepaChartId).toBeNull();
    expect(result.document.markdown).toBe('# MRVL — 已有档案\n\n人工写过的内容。\n');
    expect(buildSepaChart).not.toHaveBeenCalled();
  });

  it('propagates a sepa build failure and writes no file', async () => {
    const buildSepaChart = vi.fn().mockRejectedValue(new Error('kline fetch failed'));

    await expect(
      createResearchDocument({ kind: 'stock', symbol: 'MRVL' }, { rootDir: root, buildSepaChart }),
    ).rejects.toThrow('kline fetch failed');

    expect(existsSync(join(root, 'stocks/MRVL.md'))).toBe(false);
  });

  it('rejects an empty symbol', async () => {
    const buildSepaChart = vi.fn();

    await expect(
      createResearchDocument({ kind: 'stock', symbol: '   ' }, { rootDir: root, buildSepaChart }),
    ).rejects.toMatchObject({ status: 400 });
    expect(buildSepaChart).not.toHaveBeenCalled();
  });

  it('keeps a non-US market suffix in the file name and chart symbol', async () => {
    const buildSepaChart = vi.fn().mockResolvedValue({ id: 'chart-5', name: '腾讯控股' });

    const result = await createResearchDocument(
      { kind: 'stock', symbol: '700.hk' },
      { rootDir: root, buildSepaChart },
    );

    expect(result.document.path).toBe('stocks/700.HK.md');
    expect(buildSepaChart).toHaveBeenCalledWith('700.HK');
  });
});

describe('createResearchDocument: journal', () => {
  it('defaults the date to today and cleans the title into a slug (CJK kept, unsafe chars stripped)', async () => {
    const result = await createResearchDocument(
      { kind: 'journal', title: 'MU/复盘 笔记*' },
      { rootDir: root, buildSepaChart: vi.fn() },
    );

    expect(result.existed).toBe(false);
    expect(result.sepaChartId).toBeNull();
    expect(result.document.path).toBe(`journal/${localToday()}-MU复盘-笔记.md`);

    const written = readFileSync(join(root, result.document.path), 'utf8');
    expect(written).toContain('# MU/复盘 笔记*');
    expect(written).toContain(`日期：${localToday()}`);
  });

  it('caps the slug length at 60 characters', async () => {
    const title = 'A'.repeat(80);

    const result = await createResearchDocument(
      { kind: 'journal', title },
      { rootDir: root, buildSepaChart: vi.fn() },
    );

    const slug = result.document.path.replace(`journal/${localToday()}-`, '').replace(/\.md$/, '');
    expect(slug).toHaveLength(60);
  });

  it('rejects a title that cleans to an empty slug', async () => {
    await expect(
      createResearchDocument(
        { kind: 'journal', title: '///:::***' },
        { rootDir: root, buildSepaChart: vi.fn() },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an invalid date', async () => {
    await expect(
      createResearchDocument(
        { kind: 'journal', title: '正常标题', date: '2026/07/23' },
        { rootDir: root, buildSepaChart: vi.fn() },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('respects an explicit valid date', async () => {
    const result = await createResearchDocument(
      { kind: 'journal', title: '正常标题', date: '2026-01-05' },
      { rootDir: root, buildSepaChart: vi.fn() },
    );

    expect(result.document.path).toBe('journal/2026-01-05-正常标题.md');
  });

  it('is idempotent: an existing journal file is left untouched', async () => {
    const date = '2026-01-05';
    write(`journal/${date}-正常标题.md`, '# 正常标题\n\n人工写过的内容。\n');

    const result = await createResearchDocument(
      { kind: 'journal', title: '正常标题', date },
      { rootDir: root, buildSepaChart: vi.fn() },
    );

    expect(result.existed).toBe(true);
    expect(result.sepaChartId).toBeNull();
    expect(result.document.markdown).toBe('# 正常标题\n\n人工写过的内容。\n');
  });
});
