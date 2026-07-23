// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ResearchCreateResult,
  ResearchDocument,
  ResearchDocumentMeta,
} from '@kansoku/core/contract/index';

const list = vi.fn();
const get = vi.fn();
const openCreateResearchDialogMock = vi.fn();

vi.mock('@web/lib/client', () => ({
  client: {
    research: {
      list: (...args: unknown[]) => list(...args),
      get: (...args: unknown[]) => get(...args),
    },
  },
}));
vi.mock('./ResearchAssistant', () => ({
  ResearchAssistant: () => null,
}));
vi.mock('./CreateResearchDialog', () => ({
  openCreateResearchDialog: (...args: unknown[]) => openCreateResearchDialogMock(...args),
}));

const { ResearchPage } = await import('./ResearchPage');
const { queryClient } = await import('@web/lib/queryClient');
const { navigate, setActiveRouter } = await import('@web/lib/router');

const AVGO_META: ResearchDocumentMeta = {
  path: 'stocks/AVGO.md',
  kind: 'stock',
  type: 'stock',
  title: 'AVGO',
  date: null,
  symbols: ['AVGO'],
  mtime: '2026-07-20T00:00:00.000Z',
  excerpt: '',
};
const AVGO_DOC: ResearchDocument = {
  ...AVGO_META,
  markdown: 'AVGO 档案正文',
  revision: 'r1',
};
const MRVL_DOC: ResearchDocument = {
  path: 'stocks/MRVL.md',
  kind: 'stock',
  type: 'stock',
  title: 'MRVL',
  date: null,
  symbols: ['MRVL'],
  mtime: '2026-07-23T00:00:00.000Z',
  excerpt: '',
  markdown: 'MRVL 档案正文',
  revision: 'r1',
};

function memRouter(initial: string) {
  return createMemoryRouter([{ path: '*', Component: () => null }], {
    initialEntries: [initial],
  });
}

function renderResearchPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ResearchPage />
    </QueryClientProvider>,
  );
}

function captureOnCreated(): (result: ResearchCreateResult) => void {
  fireEvent.click(screen.getByText('新建'));
  expect(openCreateResearchDialogMock).toHaveBeenCalledWith('stock', expect.any(Function));
  return openCreateResearchDialogMock.mock.calls[0][1] as (result: ResearchCreateResult) => void;
}

beforeEach(() => {
  queryClient.clear();
});

afterEach(() => {
  cleanup();
  setActiveRouter(null);
  list.mockReset();
  get.mockReset();
  openCreateResearchDialogMock.mockReset();
});

describe('ResearchPage create-flow cache seeding', () => {
  it('keeps the freshly created document selected instead of bouncing back to the stale fallback', async () => {
    const router = memRouter('/research?view=stocks&path=stocks%2FAVGO.md');
    setActiveRouter(router);

    list.mockResolvedValueOnce([AVGO_META]);
    get.mockImplementation(({ path }: { path: string }) =>
      path === 'stocks/MRVL.md' ? Promise.resolve(MRVL_DOC) : Promise.resolve(AVGO_DOC),
    );

    renderResearchPage();
    expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe('AVGO');

    const onCreated = captureOnCreated();

    let resolveReload: (value: ResearchDocumentMeta[]) => void = () => {};
    list.mockReturnValue(
      new Promise<ResearchDocumentMeta[]>((resolve) => {
        resolveReload = resolve;
      }),
    );

    navigate('/research?view=stocks&path=stocks%2FMRVL.md');
    onCreated({ document: MRVL_DOC, sepaChartId: 'chart-1', existed: false });

    expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe('MRVL');
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/research?view=stocks&path=stocks%2FMRVL.md',
      ),
    );

    resolveReload([AVGO_META, { ...MRVL_DOC }]);

    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/research?view=stocks&path=stocks%2FMRVL.md',
      ),
    );
    expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe('MRVL');
  });

  it('shows the existed hint when the created document already existed', async () => {
    const router = memRouter('/research?view=stocks&path=stocks%2FAVGO.md');
    setActiveRouter(router);

    list.mockResolvedValueOnce([AVGO_META]);
    list.mockResolvedValue([AVGO_META]);
    get.mockResolvedValue(AVGO_DOC);

    renderResearchPage();
    expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe('AVGO');

    const onCreated = captureOnCreated();

    navigate('/research?view=stocks&path=stocks%2FAVGO.md');
    onCreated({ document: AVGO_DOC, sepaChartId: null, existed: true });

    expect(await screen.findByText('已存在，已为你打开')).toBeTruthy();
  });
});
