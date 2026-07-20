import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getOptionsLevels } = await import('../src/analysis/optionsLevels.js');

describe('getOptionsLevels market gate', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gates non-US symbols before hitting CBOE', async () => {
    const result = await getOptionsLevels('700.HK');
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gates CN symbols before hitting CBOE', async () => {
    const result = await getOptionsLevels('600519.SH');
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches CBOE for US symbols', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { current_price: 100, options: [] } }),
    });
    const result = await getOptionsLevels('ZZZQ.US');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('ZZZQ.json');
    expect(result).toBeNull();
  });
});
