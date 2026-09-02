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
const canvasGet = vi.fn();
const capabilitiesGet = vi.fn();
const assistantCreate = vi.fn();
const openCreateResearchDialogMock = vi.fn();

vi.mock('@web/lib/client', () => ({
  client: {
    research: {
      list: (...args: unknown[]) => list(...args),
      get: (...args: unknown[]) => get(...args),
    },
    canvas: {
      get: (...args: unknown[]) => canvasGet(...args),
    },
    capabilities: {
      get: (...args: unknown[]) => capabilitiesGet(...args),
    },
    assistant: {
      createSession: (...args: unknown[]) => assistantCreate(...args),
    },
  },
}));
vi.mock('./ResearchAssistant', () => ({
  ResearchAssistant: () => null,
}));
vi.mock('./CreateResearchDialog', () => ({
  openCreateResearchDialog: (...args: unknown[]) => openCreateResearchDialogMock(...args),
}));
vi.mock('@web/features/canvas/CanvasFrame', () => ({
  CanvasFrame: ({ slug }: { slug?: string }) => <div data-testid="canvas-frame">{slug}</div>,
}));

const { ResearchPage } = await import('./ResearchPage');
const { queryClient } = await import('@web/lib/queryClient');
const { navigate, setActiveRouter } = await import('@web/lib/router');
const { resetCapabilitiesStoreForTests } = await import(
  '@web/features/edition/capabilitiesStore'
);
const {
  getLicenseModalStateForTests,
  resetLicenseModalStoreForTests,
} = await import('@web/features/edition/licenseModalStore');

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
const CANVAS_META: ResearchDocumentMeta = {
  path: 'journal/canvases/acceptance-mu-panel.canvas.tsx',
  kind: 'canvas',
  type: 'canvas',
  title: 'MU 验收面板',
  date: null,
  symbols: ['MU'],
  mtime: '2026-08-28T00:00:00.000Z',
  excerpt: 'MU 验收面板',
};
const CANVAS_DOC: ResearchDocument = {
  ...CANVAS_META,
  markdown: '',
  revision: 'r-canvas',
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
  capabilitiesGet.mockResolvedValue({ pro: true, licensed: false });
  assistantCreate.mockResolvedValue({
    session: {
      id: 'chat-canvas-1',
      title: '画布：MU 验收面板',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      busy: false,
      messageCount: 0,
      preview: null,
    },
  });
});

afterEach(() => {
  cleanup();
  setActiveRouter(null);
  resetCapabilitiesStoreForTests();
  resetLicenseModalStoreForTests();
  list.mockReset();
  get.mockReset();
  canvasGet.mockReset();
  capabilitiesGet.mockReset();
  assistantCreate.mockReset();
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

describe('ResearchPage canvases shelf', () => {
  it('shows the canvases shelf without create, renders the frame, and hides the assistant column', async () => {
    const router = memRouter(
      '/research?view=canvases&path=journal%2Fcanvases%2Facceptance-mu-panel.canvas.tsx',
    );
    setActiveRouter(router);
    list.mockResolvedValue([CANVAS_META]);
    get.mockResolvedValue(CANVAS_DOC);
    canvasGet.mockResolvedValue({
      slug: 'acceptance-mu-panel',
      title: 'MU 验收面板',
      source: 'export default function App() { return null }',
      mtime: CANVAS_META.mtime,
      check: null,
    });

    renderResearchPage();

    expect(await screen.findByRole('radio', { name: /^画布/ })).toBeTruthy();
    expect(screen.queryByText('新建')).toBeNull();
    expect(await screen.findByText('免费 1/3')).toBeTruthy();
    expect((await screen.findByTestId('canvas-frame')).textContent).toBe('acceptance-mu-panel');
    expect(screen.queryByText('AVGO 档案正文')).toBeNull();
    expect(screen.queryByLabelText('关联研究资料')).toBeNull();
  });

  it('offers the upgrade paywall when the free canvas quota is full', async () => {
    const extras: ResearchDocumentMeta[] = [
      { ...CANVAS_META, path: 'journal/canvases/two.canvas.tsx', title: 'Two' },
      { ...CANVAS_META, path: 'journal/canvases/three.canvas.tsx', title: 'Three' },
    ];
    const router = memRouter('/research?view=canvases');
    setActiveRouter(router);
    list.mockResolvedValue([CANVAS_META, ...extras]);
    get.mockResolvedValue(CANVAS_DOC);

    renderResearchPage();

    expect(await screen.findByText('免费 3/3')).toBeTruthy();
    fireEvent.click(screen.getByText('升级解锁'));
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'guard' });
  });

  it('opens a new AI conversation linked to the selected canvas file', async () => {
    const router = memRouter(
      '/research?view=canvases&path=journal%2Fcanvases%2Facceptance-mu-panel.canvas.tsx',
    );
    setActiveRouter(router);
    list.mockResolvedValue([CANVAS_META]);
    get.mockResolvedValue(CANVAS_DOC);
    canvasGet.mockResolvedValue({
      slug: 'acceptance-mu-panel',
      title: 'MU 验收面板',
      source: 'export default function App() { return null }',
      mtime: CANVAS_META.mtime,
      check: null,
    });

    renderResearchPage();
    fireEvent.click(await screen.findByRole('button', { name: '在 AI 对话中继续' }));

    await waitFor(() =>
      expect(assistantCreate).toHaveBeenCalledWith({ title: '画布：MU 验收面板' }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/chat?session=chat-canvas-1&canvas=journal%2Fcanvases%2Facceptance-mu-panel.canvas.tsx',
      ),
    );
  });
});
