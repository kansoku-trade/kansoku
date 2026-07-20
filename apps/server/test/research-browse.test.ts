import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
}));

vi.mock('@kansoku/core/research/research.service', () => ({ researchService: service }));

const { tsukiRequest } = await import('./helpers.js');

beforeEach(() => {
  service.list.mockReset().mockResolvedValue([]);
  service.get.mockReset();
});

describe('research browse routes served from open core', () => {
  it('forwards the selected view and full-text query to the research service', async () => {
    const res = await tsukiRequest('/api/research?kind=stock&query=供给纪律');

    expect(res.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith({ kind: 'stock', query: '供给纪律' });
    expect(await res.json()).toEqual({ ok: true, data: [] });
  });

  it('rejects unknown research views', async () => {
    const res = await tsukiRequest('/api/research?kind=other');

    expect(res.status).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
  });

  it('loads a document by its repository-relative path', async () => {
    service.get.mockResolvedValue({
      path: 'stocks/MU.md',
      kind: 'stock',
      type: 'stock',
      title: 'MU',
      date: null,
      symbols: ['MU'],
      mtime: '2026-07-14T00:00:00.000Z',
      excerpt: '',
      markdown: '# MU',
    });

    const res = await tsukiRequest('/api/research/document?path=stocks%2FMU.md');

    expect(res.status).toBe(200);
    expect(service.get).toHaveBeenCalledWith({ path: 'stocks/MU.md' });
    expect((await res.json()).data.markdown).toBe('# MU');
  });

  it('requires a document path', async () => {
    const res = await tsukiRequest('/api/research/document');

    expect(res.status).toBe(400);
    expect(service.get).not.toHaveBeenCalled();
  });

  it('does not expose research AI routes when pro is absent', async () => {
    const chatRes = await tsukiRequest('/api/research/chat?path=stocks%2FMU.md');
    expect(chatRes.status).toBe(404);

    const refreshRes = await tsukiRequest('/api/research/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'stocks/MU.md' }),
    });
    expect(refreshRes.status).toBe(404);
  });
});
