import { describe, expect, it, vi } from 'vitest';
import type { ChartDoc } from '@kansoku/shared/types';
import type { MarketDataProvider } from '../src/marketdata/types.js';
import { localizeChartDocName, resolveSecurityName } from '../src/symbols/securityName.js';

function provider(getSecurityName: MarketDataProvider['getSecurityName']): MarketDataProvider {
  return {
    name: 'test',
    capabilities: new Set(),
    getKline: async () => [],
    getQuotes: async () => [],
    getNews: async () => [],
    getSecurityName,
  };
}

function legacyIntradayDoc(): ChartDoc {
  return {
    id: '2026-07-13-mrvl-intraday',
    schema_version: 2,
    type: 'intraday',
    title: 'MRVL.US 短线多周期',
    symbol: 'MRVL.US',
    created_at: '2026-07-13T18:05:00Z',
    updated_at: '2026-07-13T18:05:00Z',
    input: { symbol: 'MRVL.US', name: 'MRVL.US' },
    built: {
      kind: 'intraday',
      sidebar: { symbol: 'MRVL.US', name: 'MRVL.US' },
    } as unknown as ChartDoc['built'],
  };
}

describe('security display name', () => {
  it('prefers the Longbridge Chinese name over an English fallback', async () => {
    const getSecurityName = vi.fn().mockResolvedValue('迈威尔科技');
    await expect(
      resolveSecurityName('MRVL.US', 'Marvell Technology', provider(getSecurityName)),
    ).resolves.toBe('迈威尔科技');
  });

  it('preserves an explicit Chinese name without another lookup', async () => {
    const getSecurityName = vi.fn().mockResolvedValue('不应调用');
    await expect(
      resolveSecurityName('MRVL.US', '迈威尔科技', provider(getSecurityName)),
    ).resolves.toBe('迈威尔科技');
    expect(getSecurityName).not.toHaveBeenCalled();
  });

  it('falls back without blocking the chart when the lookup is unavailable', async () => {
    const getSecurityName = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(
      resolveSecurityName('MRVL.US', 'Marvell Technology', provider(getSecurityName)),
    ).resolves.toBe('Marvell Technology');
  });

  it('localizes an existing chart response without mutating the stored document', async () => {
    const original = legacyIntradayDoc();
    const localized = await localizeChartDocName(
      original,
      provider(vi.fn().mockResolvedValue('迈威尔科技')),
    );

    expect(localized.input.name).toBe('迈威尔科技');
    expect(localized.built).toMatchObject({ sidebar: { symbol: 'MRVL.US', name: '迈威尔科技' } });
    expect(original.input.name).toBe('MRVL.US');
    expect(original.built).toMatchObject({ sidebar: { name: 'MRVL.US' } });
  });
});
